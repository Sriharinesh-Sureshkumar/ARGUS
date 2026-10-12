def test_cors_allows_configured_origin(client):
    response = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_rejects_other_origin(client):
    response = client.get("/api/v1/health", headers={"Origin": "http://evil.example"})
    assert response.status_code == 200  # a simple GET still succeeds...
    assert "access-control-allow-origin" not in response.headers  # ...just without the CORS header
