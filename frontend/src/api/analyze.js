import axios from 'axios'

import { API_BASE_URL } from './client.js'

// POST /analyze: upload a player-stats CSV for scoring. 120s timeout --
// scoring + clustering is fast once warm (Phase 4.1.7), but a cold UMAP
// JIT compile or a large (near-5000-row) batch can take a while.
export function uploadCsv(file, { onUploadProgress, signal } = {}) {
  const formData = new FormData()
  formData.append('file', file)

  return axios
    .post(`${API_BASE_URL}/analyze`, formData, {
      timeout: 120000,
      signal,
      onUploadProgress: (event) => {
        if (!onUploadProgress || !event.total) return
        onUploadProgress(Math.round((event.loaded / event.total) * 100))
      },
    })
    .then((response) => response.data)
}
