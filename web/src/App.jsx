import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { HostLayout, PublicLayout } from './components/Layout'
import { Spinner } from './components/ui'
import { useAuth } from './lib/auth'
import Landing from './pages/Landing'

const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })))
const Register = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Register })))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const NewBill = lazy(() => import('./pages/NewBill'))
const EditBill = lazy(() => import('./pages/EditBill'))
const Ledger = lazy(() => import('./pages/Ledger'))
const Settings = lazy(() => import('./pages/Settings'))
const Join = lazy(() => import('./pages/Join'))
const Legal = lazy(() => import('./pages/Legal'))
const NotFound = lazy(() => import('./pages/NotFound'))

function PageFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-muted" role="status">
      <Spinner className="size-6" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

function RequireHost({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageFallback />
  if (status === 'guest') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  return children
}

function GuestOnly({ children }) {
  const { status } = useAuth()
  // Signing in on this page navigates by itself; only bounce people who arrived already signed in.
  const [arrivedAs] = useState(status)
  if (status === 'loading') return <PageFallback />
  if (status === 'authed' && arrivedAs !== 'guest') return <Navigate to="/bills" replace />
  return children
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
          <Route path="privacy" element={<Legal page="privacy" />} />
          <Route path="terms" element={<Legal page="terms" />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route element={<RequireHost><HostLayout /></RequireHost>}>
          <Route path="bills" element={<Dashboard />} />
          <Route path="bills/new" element={<NewBill />} />
          <Route path="bills/:id/edit" element={<EditBill />} />
          <Route path="bills/:id" element={<Ledger />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="s/:publicId" element={<Join />} />
      </Routes>
    </Suspense>
  )
}
