import { Route, Routes } from 'react-router-dom'

import Layout from './components/Layout.jsx'
import ClustersPage from './pages/ClustersPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'
import PlayerDetailPage from './pages/PlayerDetailPage.jsx'
import ResultsPage from './pages/ResultsPage.jsx'
import UploadPage from './pages/UploadPage.jsx'

export default function App() {
  return (
    <Routes>
      {/* Every page renders inside Layout, so the navbar is always shown. */}
      <Route element={<Layout />}>
        <Route path="/" element={<UploadPage />} />
        <Route path="/results/:analysisId" element={<ResultsPage />} />
        <Route path="/results/:analysisId/player/:playerId" element={<PlayerDetailPage />} />
        <Route path="/clusters" element={<ClustersPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
