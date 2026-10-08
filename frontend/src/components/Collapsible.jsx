import { useState } from 'react'

import { ChevronRightIcon } from './icons.jsx'

// Shared disclosure row: a button (chevron + summary text on the
// left, "<N features> - Click to expand/collapse" on the right,
// derived from open state so every usage stays in sync with it) that
// toggles its children. Collapsed by default unless defaultOpen is set.
export default function Collapsible({ summary, featureCount, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const hint = `${featureCount} features - Click to ${open ? 'collapse' : 'expand'}`

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-sm py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
      >
        <span className="flex items-center gap-2 font-medium text-content">
          <ChevronRightIcon className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${open ? 'rotate-90' : ''}`} />
          {summary}
        </span>
        <span className="text-sm text-content-muted">{hint}</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  )
}
