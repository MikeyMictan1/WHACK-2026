import { Outlet } from 'react-router'
import { Footer } from './Footer.tsx'
import { NavBar } from './NavBar.tsx'
import { HelpWidget } from '../../help/HelpWidget.tsx'
import { useNfc } from '../../nfc/useNfc.ts'
import { Toaster } from '../ui/Toaster.tsx'

/**
 * The nav floats over the top of every page (no bar), so each page's first block
 * (Hero, AuthLayout, PageHeader) draws the backdrop and leaves room for it.
 */
export function Layout() {
  useNfc()
  return (
    <div className="flex min-h-svh flex-col">
      <NavBar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <Toaster />
      <HelpWidget />
    </div>
  )
}
