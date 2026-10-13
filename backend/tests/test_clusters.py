def _upload(client, players_csv_bytes):
    response = client.post(
        "/api/v1/analyze",
        files={"file": ("test_8_players.csv", players_csv_bytes, "text/csv")},
    )
    assert response.status_code == 200
    return response.json()


def test_clusters_returns_three_archetypes_with_descriptions(client, players_csv_bytes):
    analysis = _upload(client, players_csv_bytes)

    response = client.get(f"/api/v1/clusters?analysis_id={analysis['analysis_id']}")
    assert response.status_code == 200
    body = response.json()

    # k=3 is fixed by training, but an analysis's players may not land in
    # all 3 clusters (see docs/PROJECT_LOG.md Phase 4.2.4a/4.2.4b) -- the
    # route only returns archetypes that actually have members here.
    assert 1 <= len(body["archetypes"]) <= 3
    for archetype in body["archetypes"]:
        assert archetype["archetype_name"]
        assert archetype["archetype_description"]
        assert archetype["player_count"] > 0


def test_clusters_players_have_umap_and_cluster_id(client, players_csv_bytes):
    analysis = _upload(client, players_csv_bytes)

    response = client.get(f"/api/v1/clusters?analysis_id={analysis['analysis_id']}")
    assert response.status_code == 200
    players = response.json()["players"]

    assert len(players) == 8
    for p in players:
        assert isinstance(p["umap_x"], float)
        assert isinstance(p["umap_y"], float)
        assert p["cluster_id"] in (0, 1, 2)
