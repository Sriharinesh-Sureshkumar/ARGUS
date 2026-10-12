import axios from 'axios'

import { API_BASE_URL } from './client.js'

// GET /player/{playerId}?analysis_id={analysisId} -> PlayerDetailResponse
// (api/schemas.py). First call for a given player computes SHAP
// server-side (~5s); later calls are cached and fast.
export function getPlayer(analysisId, playerId, { signal } = {}) {
  return axios
    .get(`${API_BASE_URL}/player/${encodeURIComponent(playerId)}`, {
      params: { analysis_id: analysisId },
      signal,
    })
    .then((response) => response.data)
}
