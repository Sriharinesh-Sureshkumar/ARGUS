import { NavLink } from 'react-router-dom'

// NavLink passes isActive, so the current page's link is highlighted to
// match the underlined tab in the mockups (docs/mockups/clusters.png).
function linkClass({ isActive }) {
  return isActive
    ? 'border-b-2 border-nav-active pb-1 text-nav-active font-medium'
    : 'border-b-2 border-transparent pb-1 text-content-muted hover:text-content'
}

export default function Navbar() {
  return (
    <header className="border-b border-line bg-surface">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <span className="font-mono text-lg font-medium tracking-widest text-content">ARGUS</span>

        {/* "end" makes Upload active only on "/", not on every page. */}
        <NavLink to="/" end className={linkClass}>Upload</NavLink>
        <NavLink to="/history" className={linkClass}>History</NavLink>
        <NavLink to="/clusters" className={linkClass}>Clusters</NavLink>
      </nav>
    </header>
  )
}
