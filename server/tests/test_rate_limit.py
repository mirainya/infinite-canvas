import time
from unittest.mock import MagicMock

import pytest

from rate_limit import RateLimiter


def _fake_request(ip: str = "127.0.0.1", forwarded: str | None = None) -> MagicMock:
    req = MagicMock()
    req.client.host = ip
    if forwarded:
        req.headers.get.return_value = forwarded
    else:
        req.headers.get.return_value = None
    return req


class TestRateLimiter:
    def test_allows_under_limit(self):
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        req = _fake_request()
        for _ in range(3):
            limiter.check(req)

    def test_blocks_over_limit(self):
        from fastapi import HTTPException

        limiter = RateLimiter(max_requests=2, window_seconds=60)
        req = _fake_request()
        limiter.check(req)
        limiter.check(req)
        with pytest.raises(HTTPException) as exc_info:
            limiter.check(req)
        assert exc_info.value.status_code == 429

    def test_different_ips_independent(self):
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        limiter.check(_fake_request("1.1.1.1"))
        limiter.check(_fake_request("2.2.2.2"))

    def test_window_expires(self, monkeypatch):
        limiter = RateLimiter(max_requests=1, window_seconds=1)
        req = _fake_request()

        t = time.monotonic()
        monkeypatch.setattr(time, "monotonic", lambda: t)
        limiter.check(req)

        monkeypatch.setattr(time, "monotonic", lambda: t + 1.1)
        limiter.check(req)

    def test_x_forwarded_for(self):
        from fastapi import HTTPException

        limiter = RateLimiter(max_requests=1, window_seconds=60)
        limiter.check(_fake_request("10.0.0.1", forwarded="203.0.113.5, 10.0.0.1"))

        with pytest.raises(HTTPException):
            limiter.check(_fake_request("10.0.0.2", forwarded="203.0.113.5, 10.0.0.2"))
