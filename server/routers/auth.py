"""认证路由: 全量转发到账号中心(account-center)。

IC 不再自管用户/密码, 这里只做"转发 + 拼装前端要的字段"。
登录/注册返回 access_token + refresh_token + user + is_admin(IC白名单) + credits(钱包余额)。
"""

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Request

import account_center as ac
from auth import get_current_user
from rate_limit import auth_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    username: str
    password: str


async def _enrich(data: dict) -> dict:
    """给账号中心登录/注册响应补充 is_admin(IC白名单) + credits(钱包余额)。"""
    access_token = data.get("access_token", "")
    user = data.get("user") or {}
    username = user.get("username", "")
    credits = 0
    try:
        credits = await ac.get_balance(access_token)
    except HTTPException:
        pass  # 余额查询失败不阻断登录, 前端可后续刷新
    return {
        "access_token": access_token,
        "refresh_token": data.get("refresh_token", ""),
        "user": user,
        "is_admin": ac.is_ic_admin(username),
        "credits": credits,
    }


@router.post("/register")
async def register(body: AuthRequest, request: Request):
    auth_limiter.check(request)
    data = await ac.register(body.username, body.password)
    return await _enrich(data)


@router.post("/login")
async def login(body: AuthRequest, request: Request):
    auth_limiter.check(request)
    data = await ac.login(body.username, body.password)
    return await _enrich(data)


class RefreshBody(BaseModel):
    refresh_token: str


@router.post("/refresh")
async def refresh(body: RefreshBody):
    data = await ac.refresh(body.refresh_token)
    return {"access_token": data.get("access_token", "")}


class LogoutBody(BaseModel):
    refresh_token: str


@router.post("/logout")
async def logout(body: LogoutBody):
    await ac.logout(body.refresh_token)
    return {"ok": True}


def _bearer(request: Request) -> str:
    h = request.headers.get("Authorization", "")
    if not h.startswith("Bearer "):
        raise HTTPException(401, "缺少 token")
    return h[7:]


@router.get("/me")
async def me(request: Request, user: dict = Depends(get_current_user)):
    token = _bearer(request)
    profile = await ac.get_me(token)
    credits = 0
    try:
        credits = await ac.get_balance(token)
    except HTTPException:
        pass
    return {
        "user_id": user["sub"],
        "username": profile.get("username", user["username"]),
        "credits": credits,
        "is_admin": user["is_admin"],
        "nickname": profile.get("nickname", ""),
        "avatar": profile.get("avatar", ""),
    }


class ProfileUpdate(BaseModel):
    nickname: str | None = None
    avatar: str | None = None


@router.put("/profile")
async def update_profile(body: ProfileUpdate, request: Request, _user: dict = Depends(get_current_user)):
    token = _bearer(request)
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    await ac.update_me(token, payload)
    return {"ok": True}


class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str


@router.put("/password")
async def update_password(body: PasswordUpdate, request: Request, _user: dict = Depends(get_current_user)):
    token = _bearer(request)
    await ac.update_password(token, body.old_password, body.new_password)
    return {"ok": True}
