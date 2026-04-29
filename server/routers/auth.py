from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Depends, Request

from auth import hash_password, verify_password, create_token, get_current_user
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
    return AuthResponse(token=token, user_id=row["id"], username=body.username, is_admin=is_admin, credits=float(row["credits"]))


@router.post("/login", response_model=AuthResponse)
async def login(body: AuthRequest, request: Request):
    auth_limiter.check(request)
    pool = await get_pool()
    row = await pool.fetchrow("SELECT * FROM users WHERE username = $1", body.username)
    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(401, "用户名或密码错误")
    is_admin = row["is_admin"]
    token = await create_token(row["id"], row["username"], is_admin)
    return AuthResponse(token=token, user_id=row["id"], username=row["username"], is_admin=is_admin, credits=float(row["credits"]))


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    pool = await get_pool()
    row = await pool.fetchrow("SELECT credits FROM users WHERE id = $1", int(user["sub"]))
    return {"user_id": user["sub"], "username": user["username"], "credits": float(row["credits"]) if row else 0}
