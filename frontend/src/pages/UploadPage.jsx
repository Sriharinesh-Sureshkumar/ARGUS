import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { uploadCsv } from '../api/analyze.js'
import { normalizeError } from '../api/client.js'
import ErrorPanel from '../components/ErrorPanel.jsx'
import DropZone from '../components/upload/DropZone.jsx'
import ProcessingSkeleton from '../components/upload/ProcessingSkeleton.jsx'
import UploadProgress from '../components/upload/UploadProgress.jsx'
import { MAX_ROWS, MAX_UPLOAD_BYTES } from '../config.js'

// Client-side checks only -- same {code, message, fix} shape as the
// backend (backend/api/errors.py) so UploadError never has to special-
// case where an error came from. The server re-checks all of this
// (backend/api/routes/analyze.py); these just avoid sending an upload
// that's guaranteed to be rejected.
function validateFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return {
      code: 'wrong_file_type',
      message: `'${file.name}' is not a .csv file.`,
      fix: 'Choose a .csv file with a player_id column plus the 11 feature columns.',
    }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const limitMb = MAX_UPLOAD_BYTES / (1024 * 1024)
    const fileMb = (file.size / (1024 * 1024)).toFixed(1)
    return {
      code: 'file_too_large',
      message: `'${file.name}' is ${fileMb} MB, larger than the ${limitMb} MB upload limit.`,
      fix: `Split the file into smaller CSVs of at most ${MAX_ROWS} players each and upload them separately.`,
    }
  }

  if (file.size === 0) {
    return {
      code: 'no_rows',
      message: 'The file is empty.',
      fix: 'Add a header row plus at least one row of player data, then upload again.',
    }
  }

  return null
}

export default function UploadPage() {
  const [status, setStatus] = useState('idle') // "idle" | "uploading" | "processing" | "error"
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  // Not state: an in-flight controller belongs to the request, not to a
  // render. Aborted on unmount so a StrictMode double-mount or an early
  // navigation away never lets a stale response set state.
  const abortControllerRef = useRef(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  function handleFileSelected(selectedFile) {
    const validationError = validateFile(selectedFile)
    if (validationError) {
      // idle -> error: nothing was sent.
      setFile(selectedFile)
      setError(validationError)
      setStatus('error')
      return
    }

    setFile(selectedFile)
    setProgress(0)
    setError(null)
    setStatus('uploading')

    const controller = new AbortController()
    abortControllerRef.current = controller

    uploadCsv(selectedFile, {
      signal: controller.signal,
      onUploadProgress: (percent) => {
        setProgress(percent)
        if (percent >= 100) {
          // uploading -> processing: bytes fully sent, response pending.
          setStatus('processing')
        }
      },
    })
      .then((data) => {
        // processing -> navigate away on 200.
        navigate(`/results/${data.analysis_id}`)
      })
      .catch(async (err) => {
        const normalized = await normalizeError(err)
        if (normalized === null) return // deliberate abort -- ignore
        setError(normalized)
        setStatus('error')
      })
  }

  function handleRetry() {
    // error -> idle.
    setFile(null)
    setProgress(0)
    setError(null)
    setStatus('idle')
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold">Upload</h1>

      <div className="mt-6" aria-live="polite">
        {status === 'idle' && <DropZone onFileSelected={handleFileSelected} />}
        {status === 'uploading' && <UploadProgress fileName={file.name} progress={progress} />}
        {status === 'processing' && <ProcessingSkeleton />}
        {status === 'error' && <ErrorPanel error={error} onRetry={handleRetry} />}
      </div>
    </section>
  )
}
