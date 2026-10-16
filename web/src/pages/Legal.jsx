import { Link } from 'react-router'
import { useDocumentTitle } from '../lib/hooks'

const UPDATED = '16 October 2026'

function Privacy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="lead">FairShare is a student portfolio project. It collects only what it needs to split a bill.</p>

      <h2>What we store</h2>
      <ul>
        <li>
          <strong>Hosts</strong> (people who create bills): name, email, a hashed password, and, if you add them, bank
          transfer details. Bank details are encrypted in the database.
        </li>
        <li>
          <strong>Receipts</strong>: the photo you upload, re-saved without its location and camera metadata, and the items
          and amounts on it. Only the host can see the photo.
        </li>
        <li>
          <strong>Friends on a bill</strong>: the name they type, the items they tick, and how they paid. No email or phone
          number is asked for.
        </li>
        <li>
          <strong>Payments</strong>: card details are entered on Stripe’s page and never reach FairShare. We keep the
          payment amount and Stripe’s reference number.
        </li>
      </ul>

      <h2>Who sees what</h2>
      <p>
        Anyone with a bill’s link can see its items and the names of people who joined. Your bank details are shown only to
        people who have joined one of your open bills. Payment references and the ledger are only visible to the host.
      </p>

      <h2>Services we use</h2>
      <ul>
        <li>
          <strong>OpenRouter</strong> reads receipt photos. The photo is sent to an AI model to extract the items and is not
          used by FairShare for anything else.
        </li>
        <li>
          <strong>Stripe</strong> processes card payments (currently in test mode, so no real money moves).
        </li>
        <li>Hosting providers store the app and database.</li>
      </ul>

      <h2>Cookies and storage</h2>
      <p>
        FairShare sets no cookies and runs no analytics or ads. Your browser’s local storage keeps your login (for hosts) or
        your place on a bill (for friends) so you don’t have to sign in again. That’s essential to how the app works, so
        there’s no consent banner.
      </p>

      <h2>Keeping and deleting data</h2>
      <p>
        Bills stay until the host deletes them. Deleting a bill deletes its photo, items, names and ticks. Deleting your
        account (in Settings) deletes everything you created. The host can also remove anyone from a bill.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests: <a href="mailto:fazalabbas2002@gmail.com">fazalabbas2002@gmail.com</a>.
      </p>
    </>
  )
}

function Terms() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="lead">Plain-language terms for a portfolio project. Please read them before relying on FairShare.</p>

      <h2>What FairShare is</h2>
      <p>
        A tool to work out who owes what on a shared bill. FairShare never holds your money. Card payments run in Stripe’s
        test mode, and bank transfers go directly between you and your friends.
      </p>

      <h2>Check the numbers</h2>
      <p>
        Receipt reading can make mistakes. The host is responsible for checking items and amounts before sharing a bill, and
        everyone is responsible for ticking what they actually had.
      </p>

      <h2>Bank transfers</h2>
      <p>
        When a friend says they’ve sent a transfer, FairShare just records that. The host should confirm it only after seeing
        the money arrive. FairShare can’t verify transfers or recover money sent to the wrong account.
      </p>

      <h2>Fair use</h2>
      <p>
        Don’t upload anything other than receipts, use FairShare to collect money under false pretences, or try to access
        bills that weren’t shared with you. Accounts that do may be removed.
      </p>

      <h2>No warranty</h2>
      <p>
        FairShare is provided as-is, without guarantees of availability or accuracy. Don’t use it for anything where a
        mistake would cause real harm.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:fazalabbas2002@gmail.com">fazalabbas2002@gmail.com</a>
      </p>
    </>
  )
}

export default function Legal({ page }) {
  useDocumentTitle(page === 'privacy' ? 'Privacy policy' : 'Terms of use')
  return (
    <main id="main" className="prose-legal mx-auto max-w-2xl px-4 py-10 sm:py-14">
      {page === 'privacy' ? <Privacy /> : <Terms />}
      <p className="mt-10 text-sm text-muted">
        Last updated {UPDATED}. <Link to="/">Back to FairShare</Link>
      </p>
    </main>
  )
}
