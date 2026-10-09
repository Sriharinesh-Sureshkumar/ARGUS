import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { CloseIcon } from './icons.jsx'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Reusable confirm/delete modal. Rendering this component IS "open" --
// the parent mounts it conditionally rather than passing an `open`
// prop, so there's no open=false render to special-case.
// Accessibility: role="dialog" + aria-modal, labelled/described by its
// own heading/body, focus moves in on mount and returns to whatever
// was focused before (the trigger button) on unmount, Tab is trapped
// inside, Esc and a backdrop click cancel (both no-ops while `busy`),
// body scroll is locked, and the rest of the page is marked
// aria-hidden + inert for as long as this is mounted.
export default function ConfirmDialog({
  icon,
  title,
  description,
  confirmLabel = 'Delete',
  busyLabel = 'Deleting...',
  cancelLabel = 'Cancel',
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}) {
  const dialogRef = useRef(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // #root is the whole app, rendered as a sibling of this portal
    // (which mounts on document.body) -- hide it from assistive tech
    // and keyboard focus while the dialog is up.
    const appRoot = document.getElementById('root')
    const hadAriaHidden = appRoot?.hasAttribute('aria-hidden')
    appRoot?.setAttribute('aria-hidden', 'true')
    if (appRoot) appRoot.inert = true

    // Focus the least-destructive action by default.
    const cancelButton = dialogRef.current?.querySelector('[data-dialog-cancel]')
    ;(cancelButton ?? dialogRef.current)?.focus()

    // rAF so the initial opacity-0 paints before flipping to 100 --
    // otherwise React/the browser can batch both into one paint and
    // the fade-in transition never actually plays.
    const frame = requestAnimationFrame(() => setMounted(true))

    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      if (appRoot) {
        appRoot.inert = false
        if (!hadAriaHidden) appRoot.removeAttribute('aria-hidden')
      }
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      if (busy) return
      event.stopPropagation()
      onCancel()
      return
    }

    if (event.key !== 'Tab' || !dialogRef.current) return

    const focusable = [...dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)]
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-base/60 p-4 backdrop-blur-[6px] transition-opacity duration-150 motion-reduce:duration-0 [@media(prefers-reduced-transparency:reduce)]:bg-base/90 [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-lg"
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-sm text-content-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button disabled:opacity-40"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        {icon && (
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-accent-red text-accent-red">
            {icon}
          </div>
        )}

        <h2 id="confirm-dialog-title" className="mt-4 pr-6 text-lg font-semibold text-content">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="mt-2 text-sm text-content-muted">
          {description}
        </p>

        {error && (
          <p className="mt-3 text-sm text-accent-red">
            {error.message}
            {error.fix ? ` ${error.fix}` : ''}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            data-dialog-cancel
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-line px-4 py-2 font-medium text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-accent-red px-4 py-2 font-medium text-button-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button disabled:opacity-60"
          >
            {busy ? busyLabel : error ? 'Retry' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
