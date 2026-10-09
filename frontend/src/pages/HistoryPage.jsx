import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { deleteAnalysis, listHistory } from '../api/history.js'
import { normalizeError } from '../api/client.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ErrorPanel from '../components/ErrorPanel.jsx'
import HistorySkeleton from '../components/history/HistorySkeleton.jsx'
import HistoryTable from '../components/history/HistoryTable.jsx'
import { DocumentIcon, TrashIcon } from '../components/icons.jsx'
import Pagination from '../components/results/Pagination.jsx'

const PAGE_SIZE = 10

function toComparableFilename(item) {
  return (item.csv_filename || `Analysis #${item.analysis_id}`).toLowerCase()
}

function toComparableDate(createdAt) {
  return new Date(createdAt.endsWith('Z') ? createdAt : `${createdAt}Z`).getTime()
}

export default function HistoryPage() {
  // result.key identifies which retryKey the data/error below belong
  // to -- compared against requestKey during render (isLoading) the
  // same way ResultsPage/ClustersPage derive loading/ready/error, so
  // the effect only ever sets state from its .then()/.catch().
  const [retryKey, setRetryKey] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })
  const [page, setPage] = useState(1)

  const [deleteTarget, setDeleteTarget] = useState(null) // the HistoryItem being confirmed, or null
  const [deleteStatus, setDeleteStatus] = useState('idle') // idle | pending | error
  const [deleteError, setDeleteError] = useState(null)
  const [announcement, setAnnouncement] = useState('')

  const requestKey = retryKey

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    listHistory({ signal: controller.signal })
      .then((data) => {
        if (ignore) return
        setResult({ key: requestKey, data, error: null })
      })
      .catch(async (err) => {
        if (ignore) return
        const normalized = await normalizeError(err)
        if (normalized === null) return
        setResult({ key: requestKey, data: null, error: normalized })
      })

    return () => {
      ignore = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from retryKey
  }, [requestKey])

  const isLoading = result.key !== requestKey

  function handleSort(key) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'created_at' ? 'desc' : 'asc' },
    )
    setPage(1)
  }

  function openDeleteDialog(item) {
    setDeleteTarget(item)
    setDeleteStatus('idle')
    setDeleteError(null)
  }

  function closeDeleteDialog() {
    if (deleteStatus === 'pending') return
    setDeleteTarget(null)
    setDeleteStatus('idle')
    setDeleteError(null)
  }

  function removeRowAndClose(analysisId) {
    setResult((prev) => ({ ...prev, data: prev.data.filter((item) => item.analysis_id !== analysisId) }))
    setDeleteTarget(null)
    setDeleteStatus('idle')
    setDeleteError(null)
    // Clear-then-set on a tick guarantees a DOM text change even if a
    // previous delete announced the exact same sentence, so assistive
    // tech always re-announces it.
    setAnnouncement('')
    setTimeout(() => setAnnouncement('Analysis deleted'), 0)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteStatus('pending')
    setDeleteError(null)
    try {
      await deleteAnalysis(deleteTarget.analysis_id)
      removeRowAndClose(deleteTarget.analysis_id)
    } catch (err) {
      const normalized = await normalizeError(err)
      if (normalized === null) return
      if (normalized.code === 'analysis_not_found') {
        // Already gone -- that's a successful outcome from the user's
        // point of view, not an error to show.
        removeRowAndClose(deleteTarget.analysis_id)
        return
      }
      setDeleteStatus('error')
      setDeleteError(normalized)
    }
  }

  if (isLoading) {
    return <HistorySkeleton />
  }

  if (result.error) {
    return <ErrorPanel error={result.error} onRetry={() => setRetryKey((k) => k + 1)} />
  }

  const items = result.data

  const sorted = [...items].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1
    let av = a[sort.key]
    let bv = b[sort.key]
    if (sort.key === 'csv_filename') {
      av = toComparableFilename(a)
      bv = toComparableFilename(b)
    } else if (sort.key === 'created_at') {
      av = toComparableDate(av)
      bv = toComparableDate(bv)
    }
    if (av < bv) return -1 * mul
    if (av > bv) return 1 * mul
    return 0
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * PAGE_SIZE
  const pageItems = sorted.slice(startIdx, startIdx + PAGE_SIZE)

  return (
    <section>
      <h1 className="text-2xl font-semibold text-content">History</h1>
      <p className="mt-1 text-content-muted">View and manage your previous analyses.</p>

      {items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-dropzone-border p-16 text-center">
          <DocumentIcon className="h-10 w-10 text-content-muted" />
          <p className="text-lg font-semibold text-content">No analyses yet</p>
          <p className="text-content-muted">Upload a player-stats CSV to get started.</p>
          <Link to="/" className="mt-2 rounded-md bg-primary-button px-4 py-2 font-medium text-button-text">
            Upload a CSV
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
          <HistoryTable items={pageItems} sort={sort} onSort={handleSort} onDeleteClick={openDeleteDialog} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
            <p className="text-sm text-content-muted">
              Showing {startIdx + 1}-{Math.min(startIdx + PAGE_SIZE, sorted.length)} of {sorted.length}
            </p>
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          icon={<TrashIcon className="h-5 w-5" />}
          title="Delete this analysis?"
          description="This permanently removes the analysis and all its players."
          busy={deleteStatus === 'pending'}
          error={deleteStatus === 'error' ? deleteError : null}
          onCancel={closeDeleteDialog}
          onConfirm={confirmDelete}
        />
      )}

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </section>
  )
}
