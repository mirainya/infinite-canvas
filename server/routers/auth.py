from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Request

from auth import (
    hash_password, verify_password, create_token,
    get_current_user, decode_token_allow_expired,
)
from db import get_pool
from rate_limit import auth_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


class AuthRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: int
    username: str
    is_admin: bool
    credits: float
    nickname: str
    avatar: str


@router.post("/register", response_model=AuthResponse)
async def register(body: AuthRequest, request: Request):
    auth_limiter.check(request)
    if len(body.username) < 2 or len(body.password) < 6:
        raise HTTPException(400, "用户名至少2位，密码至少6位")
    pool = await get_pool()
    existing = await pool.fetchrow("SELECT id FROM users WHERE username = $1", body.username)
    if existing:
        raise HTTPException(409, "用户名已存在")
    user_count = await pool.fetchval("SELECT COUNT(*) FROM users")
    is_admin = user_count == 0
    row = await pool.fetchrow(
        "INSERT INTO users (username, password_hash, is_admin) VALUES ($1, $2, $3) RETURNING id, credits",
        body.username, hash_password(body.password), is_admin,
    )
    token = await create_token(row["id"], body.username, is_admin)
    return AuthResponse(
        token=token, user_id=row["id"], username=body.username,
        is_admin=is_admin, credits=float(row["credits"]),
        nickname="", avatar="",
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: AuthRequest, request: Request):
    auth_limiter.check(request)
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM users WHERE username = $1", body.username)
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "用户名或密码错误")
    token = await create_token(row["id"], row["username"], row["is_admin"])
    return AuthResponse(
        token=token, user_id=row["id"], username=row["username"],
        is_admin=row["is_admin"], credits=float(row["credits"]),
        nickname=row.get("nickname", ""), avatar=row.get("avatar", ""),
    )


@router.post("/refresh", response_model=AuthResponse)
async def refresh(request: Request):
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "缺少 token")
    old_token = auth_header[7:]
    payload = await decode_token_allow_expired(old_token)
    user_id = int(payload["sub"])
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(401, "用户不存在")
    token = await create_token(row["id"], row["username"], row["is_admin"])
    return AuthResponse(
        token=token, user_id=row["id"], username=row["username"],
        is_admin=row["is_admin"], credits=float(row["credits"]),
        nickname=row.get("nickname", ""), avatar=row.get("avatar", ""),
    )


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT username, credits, is_admin, nickname, avatar FROM users WHERE id = $1",
        int(user["sub"]),
    )
    if not row:
        raise HTTPException(404, "用户不存在")
    return {
        "user_id": user["sub"],
        "username": row["username"],
        "credits": float(row["credits"]),
        "is_admin": row["is_admin"],
        "nickname": row.get("nickname", ""),
        "avatar": row.get("avatar", ""),
    }


class ProfileUpdate(BaseModel):
    nickname: str | None = None
    avatar: str | None = None


@router.put("/profile")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    pool = await get_pool()
    if body.nickname is not None:
        if len(body.nickname) > 20:
            raise HTTPException(400, "昵称不能超过20个字符")
        await pool.execute("UPDATE users SET nickname = $1 WHERE id = $2", body.nickname, user_id)
    if body.avatar is not None:
        if len(body.avatar) > 512_000:
            raise HTTPException(400, "头像数据不能超过 500KB")
        await pool.execute("UPDATE users SET avatar = $1 WHERE id = $2", body.avatar, user_id)
    return {"ok": True}


class PasswordUpdate(BaseModel):
    old_password: str
    new_password: str


@router.put("/password")
async def update_password(body: PasswordUpdate, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(400, "新密码至少6位")
    user_id = int(user["sub"])
    pool = await get_pool()
    row = await pool.fetchrow("SELECT password_hash FROM users WHERE id = $1", user_id)
    if not row or not verify_password(body.old_password, row["password_hash"]):
        raise HTTPException(401, "旧密码错误")
    await pool.execute(
        "UPDATE users SET password_hash = $1 WHERE id = $2",
        hash_password(body.new_password), user_id,
    )
    return {"ok": True}
