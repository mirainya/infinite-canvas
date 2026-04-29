import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import get_config, set_config

ALGORITHM = "HS256"
EXPIRE_HOURS = 72

_bearer = HTTPBearer()
_secret_key: str | None = None


async def _get_secret_key() -> str:
    global _secret_key
    if _secret_key:
        return _secret_key
    val = await get_config("jwt_secret")
    if not val:
        val = secrets.token_hex(32)
        await set_config("jwt_secret", val)
    _secret_key = val
    return _secret_key


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


async def create_token(user_id: int, username: str, is_admin: bool = False) -> str:
    secret = await _get_secret_key()
    payload = {
        "sub": str(user_id),
        "username": username,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=EXPIRE_HOURS),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


async def decode_token(token: str) -> dict:
    secret = await _get_secret_key()
    try:
        return jwt.decode(token, secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token 已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "无效 token")


async def decode_token_allow_expired(token: str, max_grace_days: int = 7) -> dict:
    secret = await _get_secret_key()
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"verify_exp": False})
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "无效 token")
    exp = payload.get("exp")
    if exp:
        expired_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        if datetime.now(timezone.utc) - expired_at > timedelta(days=max_grace_days):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token 已过期超过宽限期")
    return payload


async def get_current_user(cred: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    return await decode_token(cred.credentials)


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "需要管理员权限")
    return user
