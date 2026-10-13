from conftest import assert_plain_language

from db.models import SHAPValue


def _upload(client, players_csv_bytes):
    response = client.post(
        "/api/v1/analyze",
        files={"file": ("test_8_players.csv", players_csv_bytes, "text/csv")},
    )
    assert response.status_code == 200
    return response.json()


def test_player_detail_returns_shap_values(client, players_csv_bytes):
    analysis = _upload(client, players_csv_bytes)
    player_id = analysis["players"][0]["player_id"]

    response = client.get(f"/api/v1/player/{player_id}?analysis_id={analysis['analysis_id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["player_id"] == player_id
    assert len(body["shap_values"]) == 11
    for feature in body["shap_values"]:
        assert "feature_name" in feature
        assert "shap_value" in feature
        assert "plain_description" in feature


def test_player_detail_cache_hit_no_duplicate_rows(client, players_csv_bytes, db_session_factory):
    analysis = _upload(client, players_csv_bytes)
    player_id = analysis["players"][0]["player_id"]
    analysis_id = analysis["analysis_id"]
    url = f"/api/v1/player/{player_id}?analysis_id={analysis_id}"

    first = client.get(url).json()
    second = client.get(url).json()
    assert first["shap_values"] == second["shap_values"]

    db = db_session_factory()
    try:
        from db.models import Player

        player_row = db.query(Player).filter(Player.analysis_id == analysis_id, Player.player_id == player_id).one()
        assert db.query(SHAPValue).filter(SHAPValue.player_id_fk == player_row.id).count() == 11
    finally:
        db.close()


def test_player_unknown_player_id_returns_404(client, players_csv_bytes):
    analysis = _upload(client, players_csv_bytes)

    response = client.get(f"/api/v1/player/nonexistent?analysis_id={analysis['analysis_id']}")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "player_not_found"
    assert_plain_language(detail["message"])


def test_player_unknown_analysis_id_returns_404(client):
    response = client.get("/api/v1/player/p0?analysis_id=999999")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "analysis_not_found"
    assert_plain_language(detail["message"])
