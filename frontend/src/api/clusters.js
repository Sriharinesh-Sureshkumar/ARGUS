import axios from 'axios'

import { API_BASE_URL } from './client.js'

// GET /clusters -> ClusterResponse (api/schemas.py). analysis_id is
// omitted entirely (not sent as undefined/null) when not given, so the
// backend falls back to its own default (the latest analysis).
export function getClusters({ analysisId, signal } = {}) {
  const params = analysisId == null ? {} : { analysis_id: analysisId }
  return axios.get(`${API_BASE_URL}/clusters`, { params, signal }).then((response) => response.data)
}
