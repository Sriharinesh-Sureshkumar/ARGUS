from conftest import assert_plain_language

from db.models import Player, SHAPValue


def _upload(client, players_csv_bytes, filename="test_8_players.csv"):
    response = client.post(
        "/api/v1/analyze",
        files={"file": (filename, players_csv_bytes, "text/csv")},
    )
    assert response.status_code == 200
    return response.json()


def test_history_lists_created_analysis(client, players_csv_bytes):
    analysis = _upload(client, players_csv_bytes)

    response = client.get("/api/v1/history")
    assert response.status_code == 200
    items = response.json()

    match = next(item for item in items if item["analysis_id"] == analysis["analysis_id"])
    assert match["player_count"] == 8
    assert match["csv_filename"] == "test_8_players.csv"
    assert match["created_at"].endswith("Z")


def test_history_get_by_id_returns_same_shape(client, players_csv_bytes):
    analysis = _upload(client, players_csv_bytes)

    response = client.get(f"/api/v1/history/{analysis['analysis_id']}")
    assert response.status_code == 200
    reloaded = response.json()
    assert reloaded["player_count"] == analysis["player_count"]
    assert {p["player_id"] for p in reloaded["players"]} == {p["player_id"] for p in analysis["players"]}


def test_history_unknown_id_returns_404(client):
    response = client.get("/api/v1/history/999999")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert detail["code"] == "analysis_not_found"
    assert_plain_language(detail["message"])


def test_history_delete_then_get_returns_404(client, players_csv_bytes):
    analysis = _upload(client, players_csv_bytes)
    analysis_id = analysis["analysis_id"]

    delete_response = client.delete(f"/api/v1/history/{analysis_id}")
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    get_response = client.get(f"/api/v1/history/{analysis_id}")
    assert get_response.status_code == 404
    assert get_response.json()["detail"]["code"] == "analysis_not_found"


def test_history_delete_removes_players_and_shap_rows(client, players_csv_bytes, db_session_factory):
    analysis = _upload(client, players_csv_bytes)
    analysis_id = analysis["analysis_id"]
    first_player_id = analysis["players"][0]["player_id"]

    # Trigger SHAP computation/caching for one player before deleting,
    # so the orphan check below actually has shap_values rows to check.
    player_response = client.get(f"/api/v1/player/{first_player_id}?analysis_id={analysis_id}")
    assert player_response.status_code == 200
    assert len(player_response.json()["shap_values"]) == 11

    db = db_session_factory()
    try:
        player_row_ids = [p.id for p in db.query(Player).filter(Player.analysis_id == analysis_id).all()]
        assert len(player_row_ids) == 8
        assert db.query(SHAPValue).filter(SHAPValue.player_id_fk.in_(player_row_ids)).count() == 11
    finally:
        db.close()

    client.delete(f"/api/v1/history/{analysis_id}")

    db = db_session_factory()
    try:
        assert db.query(Player).filter(Player.analysis_id == analysis_id).count() == 0
        assert db.query(SHAPValue).filter(SHAPValue.player_id_fk.in_(player_row_ids)).count() == 0
    finally:
        db.close()
