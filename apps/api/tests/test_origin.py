from app.api.v1.voice import origin_allowed


class _WS:
    def __init__(self, **headers: str):
        self.headers = {k.replace("_", "-"): v for k, v in headers.items()}


def test_same_origin_through_proxy_or_tunnel_is_allowed():
    assert origin_allowed(_WS(origin="http://localhost:3000", host="localhost:3000"))
    assert origin_allowed(_WS(origin="https://demo.example.org", host="demo.example.org"))
    # Tunnel that rewrites Host but forwards the original one
    assert origin_allowed(
        _WS(origin="https://demo.example.org", host="proxy", x_forwarded_host="demo.example.org")
    )


def test_trusted_tunnel_patterns_and_local_origins_are_allowed():
    assert origin_allowed(_WS(origin="https://b6cdf1cac65938.lhr.life", host="localhost:8090"))
    assert origin_allowed(_WS(origin="https://my-pc.tail1234.ts.net", host="127.0.0.1:8090"))
    assert origin_allowed(_WS(origin="http://localhost:3000", host="api:8000"))  # CORS_ORIGINS
    assert origin_allowed(_WS(host="localhost"))  # non-browser clients send no Origin


def test_other_sites_are_rejected():
    assert not origin_allowed(_WS(origin="https://evil.example.com", host="localhost:3000"))
    assert not origin_allowed(_WS(origin="https://lhr.life.evil.com", host="localhost:3000"))
    assert not origin_allowed(
        _WS(origin="https://evil.ts.net", host="localhost:3000")
    )  # not machine.tailnet.ts.net
