"""账号中心(account-center)对接: 统一身份 + 钱包。

IC 自此成为账号中心的客户端(与 OPC 平级): 不再自管密码/积分。
- 验用户身份: 用 JWKS 公钥离线验 RS256 access token(校验 iss + kind=user)。
- 动用户钱包: 扣费/退款带 client 凭证调 /api/internal/wallet/*(见 wallet.py)。
- 登录/注册/刷新: 由本后端转发到账号中心(secret 只活在后端, 不下发前端)。

配置全部从环境变量读取(client_secret 是机密, 不进 system_config 以免被 admin 接口回显)。
"""

import logging
import os

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, status
from jwt import PyJWKClient

# 本模块在 db.py(load_dotenv) 之前就被 auth.py import, 必须自己先加载 .env,
# 否则模块级读取的 AC_* 全是空字符串(导致 503/502)。load_dotenv 幂等, 重复调用无害。
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logger = logging.getLogger(__name__)

# ── 配置(环境变量) ──
BASE_URL = os.getenv("AC_BASE_URL", "").rstrip("/")
CLIENT_ID = os.getenv("AC_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("AC_CLIENT_SECRET", "")
ISSUER = os.getenv("AC_ISSUER", "account-center")
# IC 管理端白名单(账号中心用户名, 逗号分隔); 命中才放行 /api/admin。
ADMINS = {u.strip() for u in os.getenv("IC_ADMINS", "").split(",") if u.strip()}

LEEWAY = 60  # 时钟偏差容差(秒)
_TIMEOUT = httpx.Timeout(15.0)

# PyJWKClient 内部带公钥缓存, 进程级单例即可。
_jwks_client: PyJWKClient | None = None


def enabled() -> bool:
    """账号中心是否已配置(base_url + client 凭证齐全)。"""
    return bool(BASE_URL and CLIENT_ID and CLIENT_SECRET)


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        if not BASE_URL:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "账号中心未配置")
        _jwks_client = PyJWKClient(f"{BASE_URL}/.well-known/jwks.json")
    return _jwks_client


def verify_token(token: str) -> dict:
    """离线验签账号中心 access token, 返回 claims。

    校验: 签名(RS256 + JWKS 公钥)、iss、exp、kind=user。失败抛 401。
    返回的 claims 含 sub(用户 id 字符串)/username/kind 等。
    """
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=ISSUER,
            leeway=LEEWAY,
            options={"require": ["exp", "iss", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token 已过期")
    except jwt.InvalidTokenError as e:
        logger.info("token 验签失败: %s", e)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "无效 token")
    if claims.get("kind") != "user":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "非用户令牌")
    return claims


# ── HTTP 调用账号中心 ──

def _client_headers() -> dict:
    return {"X-Client-Id": CLIENT_ID, "X-Client-Secret": CLIENT_SECRET}


def _unwrap(resp: httpx.Response) -> dict:
    """解包账号中心统一信封 {code, message, data}。

    账号中心约定: 业务错误用 HTTP 200 + code!=0 表达(如登录失败 code=1),
    仅钱包额度/禁用/限频等才用 HTTP 4xx。故这里:
    - HTTP 200 + code==0 → 成功, 返回 data
    - HTTP 200 + code!=0 → 业务错误, 归一为 400 携 message(前端展示, 不要当 502 系统故障)
    - HTTP 4xx → 透传状态码(钱包 402/403/429 等)
    - 其余 → 502(对账号中心而言是上游错误)
    """
    try:
        env = resp.json()
    except ValueError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心响应异常")
    if resp.status_code == 200:
        if env.get("code") == 0:
            return env.get("data") or {}
        raise HTTPException(status.HTTP_400_BAD_REQUEST, env.get("message") or "请求失败")
    msg = env.get("message") or "账号中心请求失败"
    code = resp.status_code if 400 <= resp.status_code < 500 else status.HTTP_502_BAD_GATEWAY
    raise HTTPException(code, msg)


async def login(username: str, password: str) -> dict:
    """登录, 返回 {access_token, refresh_token, user}。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.post(f"{BASE_URL}/api/auth/login",
                                json={"username": username, "password": password})
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    return _unwrap(resp)


async def register(username: str, password: str) -> dict:
    """代用户注册(带 client 凭证), 返回同 login。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.post(f"{BASE_URL}/api/internal/auth/register",
                                json={"username": username, "password": password},
                                headers=_client_headers())
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    return _unwrap(resp)


async def refresh(refresh_token: str) -> dict:
    """刷新 access token, 返回 {access_token}。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.post(f"{BASE_URL}/api/auth/refresh",
                                json={"refresh_token": refresh_token})
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    return _unwrap(resp)


async def logout(refresh_token: str) -> None:
    """撤销 refresh token(尽力而为, 失败不阻断)。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            await c.post(f"{BASE_URL}/api/auth/logout",
                         json={"refresh_token": refresh_token})
        except httpx.HTTPError:
            logger.warning("登出账号中心失败(忽略)")


async def get_balance(access_token: str) -> int:
    """查当前用户余额(整数积分)。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.get(f"{BASE_URL}/api/wallet/balance",
                               headers={"Authorization": f"Bearer {access_token}"})
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    data = _unwrap(resp)
    return int(data.get("balance", 0))


async def get_me(access_token: str) -> dict:
    """查当前用户资料 {id, username, nickname, avatar, status}。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.get(f"{BASE_URL}/api/me",
                               headers={"Authorization": f"Bearer {access_token}"})
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    return _unwrap(resp)


def is_ic_admin(username: str) -> bool:
    """该账号中心用户名是否在 IC 管理端白名单内。"""
    return username in ADMINS


async def update_me(access_token: str, body: dict) -> dict:
    """改当前用户资料(昵称/头像), body 形如 {nickname, avatar}。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.put(f"{BASE_URL}/api/me", json=body,
                               headers={"Authorization": f"Bearer {access_token}"})
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    return _unwrap(resp)


async def update_password(access_token: str, old_password: str, new_password: str) -> dict:
    """改密码(校验原密码; 成功后该用户全部 refresh 失效)。"""
    async with httpx.AsyncClient(timeout=_TIMEOUT) as c:
        try:
            resp = await c.put(f"{BASE_URL}/api/me/password",
                               json={"old_password": old_password, "new_password": new_password},
                               headers={"Authorization": f"Bearer {access_token}"})
        except httpx.HTTPError:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "账号中心不可达")
    return _unwrap(resp)
