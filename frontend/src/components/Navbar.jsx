import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { getHealth } from '../api/client.js'

// Dot colour + tooltip for each backend state.
const STATUS_STYLES = {
  checking: { dot: 'bg-content-muted', label: 'Checking backend…' },
  online: { dot: 'bg-accent-green', label: 'Backend online' },
  // /health answers but reports models or DB not ready.
  degraded: { dot: 'bg-accent-amber', label: 'Backend degraded (models or database not ready)' },
  offline: { dot: 'bg-accent-red', label: 'Backend offline' },
}

// NavLink passes isActive, so the current page's link is highlighted.
function linkClass({ isActive }) {
  return isActive
    ? 'text-accent-green font-medium'
    : 'text-content-muted hover:text-content'
}

export default function Navbar() {
  const [status, setStatus] = useState('checking')
  const [errorMessage, setErrorMessage] = useState(null)

  useEffect(() => {
    // In development React StrictMode mounts components twice, so this
    // effect runs twice. The flag stops the first (discarded) run from
    // updating state after its cleanup.
    let ignore = false

    getHealth()
      .then((health) => {
        if (!ignore) setStatus(health.status === 'ok' ? 'online' : 'degraded')
      })
      .catch((error) => {
        if (!ignore) {
          setStatus('offline')
          setErrorMessage(`${error.message}. ${error.fix}.`)
        }
      })

    return () => {
      ignore = true
    }
  }, []) // empty list = run once on mount

  const { dot, label } = STATUS_STYLES[status]

  return (
    <header className="border-b border-line bg-surface">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="font-mono text-lg font-medium tracking-widest text-accent-green">ARGUS</span>

        {/* "end" makes Upload active only on "/", not on every page. */}
        <NavLink to="/" end className={linkClass}>Upload</NavLink>
        <NavLink to="/history" className={linkClass}>History</NavLink>
        <NavLink to="/clusters" className={linkClass}>Clusters</NavLink>

        <span
          className="ml-auto flex items-center gap-2 text-sm text-content-muted"
          title={errorMessage || label}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          {label}
        </span>
      </nav>
    </header>
  )
}
