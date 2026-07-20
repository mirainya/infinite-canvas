"""鉴权依赖: 校验账号中心(account-center)签发的 RS256 access token。

IC 已退役本地密码/HS256 自签体系, 全量改用账号中心离线验签。
本模块只保留两个 FastAPI 依赖:
- get_current_user: header Bearer 验签
- require_admin: 在前者基础上校验 IC 管理端白名单

验签得到的身份统一为 dict, 兼容历史: {"sub": <用户id字符串>, "username": ..., "is_admin": <IC白名单命中>}。
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import account_center as ac

_bearer = HTTPBearer()


def _to_identity(claims: dict) -> dict:
    """把账号中心 claims 归一为下游期望的身份 dict。

    is_admin 取 IC 自己的白名单(账号中心的 is_admin 是它那侧的, 与 IC 管理端无关)。
    """
    username = claims.get("username", "")
    return {
        "sub": claims.get("sub", ""),
        "username": username,
        "is_admin": ac.is_ic_admin(username),
    }


async def get_current_user(cred: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    return _to_identity(ac.verify_token(cred.credentials))

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "需要管理员权限")
    return user
