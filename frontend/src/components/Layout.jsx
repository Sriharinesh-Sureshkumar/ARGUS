import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Navbar from './Navbar.jsx'

// Shared page frame. <Outlet /> is where React Router renders the page
// that matches the current URL.
//
// Accessibility (Phase 4.2.6): a visually-hidden "skip to main content"
// link (native #fragment focus handles the jump, since <main> has
// tabIndex={-1}); and on every route change, focus moves to <main> so
// screen readers start announcing from the new page's content instead
// of silently leaving focus wherever it was on the old page (e.g. a
// nav link). Each page sets its own document.title via usePageTitle().
export default function Layout() {
  const location = useLocation()
  const mainRef = useRef(null)

  useEffect(() => {
    mainRef.current?.focus()
  }, [location.pathname, location.search])

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary-button focus-visible:px-4 focus-visible:py-2 focus-visible:font-medium focus-visible:text-button-text"
      >
        Skip to main content
      </a>
      <Navbar />
      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
      >
        <Outlet />
      </main>
    </div>
  )
}
