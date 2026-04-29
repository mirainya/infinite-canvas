"""Simple in-memory IP rate limiter for auth endpoints."""

import time
from collections import defaultdict
from fastapi import HTTPException, Request


class RateLimiter:
    """Sliding-window rate limiter keyed by client IP."""

    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def check(self, request: Request) -> None:
        ip = self._client_ip(request)
        now = time.monotonic()
        cutoff = now - self.window

        # Prune old entries
        hits = self._hits[ip]
        self._hits[ip] = hits = [t for t in hits if t > cutoff]

        if len(hits) >= self.max_requests:
            raise HTTPException(
                429,
                f"请求过于频繁，请 {self.window} 秒后再试",
            )
        hits.append(now)


# Shared instance: 10 requests per 60 seconds per IP for auth endpoints
auth_limiter = RateLimiter(max_requests=10, window_seconds=60)
