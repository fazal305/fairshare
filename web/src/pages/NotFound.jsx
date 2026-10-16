import { ButtonLink } from '../components/ui'
import { useDocumentTitle } from '../lib/hooks'

export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="font-display text-7xl font-semibold text-accent-text">404</p>
      <h1 className="mt-4 text-3xl font-semibold">This page isn’t on the menu</h1>
      <p className="mt-3 text-muted">
        The link may be mistyped or the page may have moved. If a friend sent you a bill link, check it with them.
      </p>
      <ButtonLink to="/" className="mt-8">
        Go to FairShare
      </ButtonLink>
    </main>
  )
}
