import { Outlet } from 'react-router-dom'

import Navbar from './Navbar.jsx'

// Shared page frame. <Outlet /> is where React Router renders the page
// that matches the current URL.
export default function Layout() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
