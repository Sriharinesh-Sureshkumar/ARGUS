from conftest import assert_plain_language

from core.config import MAX_ROWS, MAX_UPLOAD_BYTES


def _upload(client, filename: str, content: bytes):
    return client.post(
        "/api/v1/analyze",
        files={"file": (filename, content, "text/csv")},
    )


def test_analyze_valid_csv_returns_scored_ranked_players(client, players_csv_bytes):
    response = _upload(client, "test_8_players.csv", players_csv_bytes)
    assert response.status_code == 200

    body = response.json()
    assert body["player_count"] == 8
    assert len(body["players"]) == 8
    assert "analysis_id" in body
    assert "flagged_count" in body
    assert "flag_threshold" in body

    ranks = [p["rank"] for p in body["players"]]
    assert sorted(ranks) == list(range(1, 9))

    for p in body["players"]:
        assert 0.0 <= p["ensemble_score"] <= 1.0
        assert 0.0 <= p["if_score"] <= 1.0
        assert 0.0 <= p["ae_score"] <= 1.0


def test_analyze_is_deterministic(client, players_csv_bytes):
    first = _upload(client, "run1.csv", players_csv_bytes).json()
    second = _upload(client, "run2.csv", players_csv_bytes).json()

    first_scores = {p["player_id"]: p["ensemble_score"] for p in first["players"]}
    second_scores = {p["player_id"]: p["ensemble_score"] for p in second["players"]}
    assert first_scores == second_scores


def test_analyze_wrong_file_type(client, players_csv_bytes):
    response = _upload(client, "players.txt", players_csv_bytes)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "wrong_file_type"
    assert_plain_language(detail["message"])


def test_analyze_empty_file(client):
    response = _upload(client, "empty.csv", b"")
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "unreadable_csv"
    assert_plain_language(detail["message"])


def test_analyze_missing_columns(client, players_csv_path):
    import pandas as pd

    df = pd.read_csv(players_csv_path).drop(columns=["yaw_jerk"])
    response = _upload(client, "missing_col.csv", df.to_csv(index=False).encode())
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "missing_columns"
    assert "yaw_jerk" in detail["message"]
    assert_plain_language(detail["message"])


def test_analyze_file_too_large(client):
    # The size check reads raw bytes before any CSV parsing, so the
    # body doesn't need to be valid CSV -- just bigger than the limit.
    oversized = b"player_id\n" + b"x" * (MAX_UPLOAD_BYTES + 1)
    response = _upload(client, "big.csv", oversized)
    assert response.status_code == 413
    detail = response.json()["detail"]
    assert detail["code"] == "file_too_large"
    assert_plain_language(detail["message"])


def test_analyze_too_many_rows(client):
    # too_many_rows is checked before column validation, so a minimal
    # one-column CSV is enough to trigger it.
    lines = ["col"] + ["x"] * (MAX_ROWS + 1)
    response = _upload(client, "too_many_rows.csv", "\n".join(lines).encode())
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "too_many_rows"
    assert_plain_language(detail["message"])
