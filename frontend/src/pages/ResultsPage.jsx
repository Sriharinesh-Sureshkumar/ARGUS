import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { normalizeError } from '../api/client.js'
import { getAnalysis, listHistory } from '../api/history.js'
import ErrorPanel from '../components/ErrorPanel.jsx'
import { SearchIcon } from '../components/icons.jsx'
import Pagination from '../components/results/Pagination.jsx'
import Podium from '../components/results/Podium.jsx'
import ResultsHeader from '../components/results/ResultsHeader.jsx'
import ResultsSkeleton from '../components/results/ResultsSkeleton.jsx'
import ResultsTable from '../components/results/ResultsTable.jsx'

const PAGE_SIZE = 9

export default function ResultsPage() {
  const { analysisId } = useParams()

  // result.key identifies which (analysisId, retryKey) request the
  // data/error below belong to. Comparing it to requestKey during
  // render (isLoading, below) derives the loading/ready/error status
  // instead of a separate status field, so the effect only ever calls
  // setState from inside its async .then()/.catch() callbacks -- never
  // synchronously in the effect body itself.
  const [result, setResult] = useState({ key: null, data: null, meta: null, error: null })
  const [retryKey, setRetryKey] = useState(0) // bumped by the error panel's retry button
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' })

  // Resets the search/page UI when the route's analysisId changes --
  // React's documented "adjusting state during rendering" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect), so this
  // doesn't need its own effect either.
  const [prevAnalysisId, setPrevAnalysisId] = useState(analysisId)
  if (analysisId !== prevAnalysisId) {
    setPrevAnalysisId(analysisId)
    setQuery('')
    setPage(1)
  }

  const requestKey = `${analysisId}:${retryKey}`

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    Promise.all([
      getAnalysis(analysisId, { signal: controller.signal }),
      // A broken/empty history list must not block the page -- the
      // header just falls back to "Analysis #<id>" with no date.
      listHistory({ signal: controller.signal }).catch(() => null),
    ])
      .then(([analysis, historyList]) => {
        if (ignore) return
        const matched = Array.isArray(historyList)
          ? (historyList.find((h) => h.analysis_id === analysis.analysis_id) ?? null)
          : null
        setResult({ key: requestKey, data: analysis, meta: matched, error: null })
      })
      .catch(async (err) => {
        if (ignore) return
        const normalized = await normalizeError(err)
        if (normalized === null) return // deliberate abort -- ignore
        setResult({ key: requestKey, data: null, meta: null, error: normalized })
      })

    return () => {
      ignore = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from analysisId + retryKey each render
  }, [requestKey])

  function handleQueryChange(event) {
    setQuery(event.target.value)
    setPage(1)
  }

  function clearSearch() {
    setQuery('')
    setPage(1)
  }

  function handleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(1)
  }

  const isLoading = result.key !== requestKey

  if (isLoading) {
    return <ResultsSkeleton />
  }

  if (result.error) {
    const isNotFound = result.error.code === 'analysis_not_found'
    return (
      <ErrorPanel
        error={result.error}
        onRetry={isNotFound ? undefined : () => setRetryKey((k) => k + 1)}
        actions={
          isNotFound ? (
            <>
              <Link
                to="/"
                className="rounded-md bg-primary-button px-4 py-2 font-medium text-button-text"
              >
                Back to upload
              </Link>
              <Link
                to="/history"
                className="rounded-md border border-line px-4 py-2 font-medium text-content"
              >
                Open history
              </Link>
            </>
          ) : undefined
        }
      />
    )
  }

  // Derived values -- computed during render, never stored in state.
  const { data, meta } = result
  const allPlayers = data.players
  const normalizedQuery = query.trim().toLowerCase()
  const isSearching = normalizedQuery !== ''

  const filtered = isSearching
    ? allPlayers.filter((p) => p.player_id.toLowerCase().includes(normalizedQuery))
    : allPlayers

  const podiumPlayers = isSearching ? [] : allPlayers.slice(0, 3)
  const tableSource = isSearching ? filtered : allPlayers.slice(3)

  const sortedSource = [...tableSource].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1
    const av = a[sort.key]
    const bv = b[sort.key]
    if (av < bv) return -1 * mul
    if (av > bv) return 1 * mul
    return 0
  })

  const totalPages = Math.max(1, Math.ceil(sortedSource.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * PAGE_SIZE
  const pageRows = sortedSource.slice(startIdx, startIdx + PAGE_SIZE)

  return (
    <section aria-live="polite">
      <ResultsHeader analysisId={data.analysis_id} playerCount={data.player_count} meta={meta} />

      {podiumPlayers.length > 0 && (
        <div className="mt-8">
          <Podium analysisId={data.analysis_id} players={podiumPlayers} />
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-content-muted" />
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search player ID"
            aria-label="Search player ID"
            className="w-full bg-transparent text-content placeholder:text-content-muted focus:outline-none"
          />
        </div>

        {isSearching && filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-content-muted">No players match &apos;{query}&apos;</p>
            <button
              type="button"
              onClick={clearSearch}
              className="mt-4 rounded-md bg-primary-button px-4 py-2 font-medium text-button-text"
            >
              Clear search
            </button>
          </div>
        ) : (
          sortedSource.length > 0 && (
            <>
              <ResultsTable analysisId={data.analysis_id} players={pageRows} sort={sort} onSort={handleSort} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
                <p className="text-sm text-content-muted">
                  Showing {startIdx + 1}-{Math.min(startIdx + PAGE_SIZE, sortedSource.length)} of{' '}
                  {sortedSource.length}
                </p>
                <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </>
          )
        )}
      </div>
    </section>
  )
}
