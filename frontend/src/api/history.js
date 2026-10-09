import axios from 'axios'

import { API_BASE_URL } from './client.js'

// GET /history/{analysisId} -> AnalysisResponse (api/schemas.py), the
// same shape POST /analyze returns on success.
export function getAnalysis(analysisId, { signal } = {}) {
  return axios.get(`${API_BASE_URL}/history/${analysisId}`, { signal }).then((response) => response.data)
}

// GET /history -> HistoryItem[], newest first.
export function listHistory({ signal } = {}) {
  return axios.get(`${API_BASE_URL}/history`, { signal }).then((response) => response.data)
}

// DELETE /history/{analysisId} -> DeleteResponse ({deleted, analysis_id, message}).
export function deleteAnalysis(analysisId, { signal } = {}) {
  return axios.delete(`${API_BASE_URL}/history/${analysisId}`, { signal }).then((response) => response.data)
}
