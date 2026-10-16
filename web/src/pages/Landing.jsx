import { ButtonLink, Money } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useDocumentTitle } from '../lib/hooks'

const EXAMPLE = [
  { name: 'Chicken karahi (half)', price: 180000, who: ['Ali', 'Zoya'] },
  { name: 'Garlic naan ×4', price: 39000, who: ['Ali', 'Zoya', 'Sam'] },
  { name: 'Mint margarita', price: 45000, who: ['Sam'] },
  { name: 'Daal makhni', price: 95000, who: ['Sam'] },
]

const STEPS = [
  ['Snap the receipt', 'Take a photo at the table. FairShare reads the items, tax and service charge, and you fix anything it misread.'],
  ['Share one link', 'Drop it in the group chat. Friends open it, type a name (no sign-up) and tick what they had.'],
  ['Get paid back', 'Everyone sees their exact total and pays by card or bank transfer. You see who’s paid and who hasn’t.'],
]

const FAQ = [
  [
    'Why not just split it evenly?',
    'Because the person who had a soup shouldn’t pay for someone else’s steak. FairShare adds up what each person ticked, splits shared dishes between the people who shared them, then spreads tax and service charge in proportion to each person’s food.',
  ],
  [
    'Do my friends need an account?',
    'No. They open the link, enter a name and tick their items. Only the person who paid the bill (the host) signs up.',
  ],
  [
    'What if nobody ticks an item?',
    'It stays on the host’s screen as “unclaimed”, so nothing quietly disappears from the total.',
  ],
  [
    'Is the card payment real?',
    'Not yet. This is a portfolio project and card payments run in Stripe’s test mode, so no real money moves. Bank transfers are marked as paid by the host once they see the money arrive.',
  ],
  [
    'What happens to the receipt photo?',
    'It’s stored privately so only you can see it, with the location and camera data removed. Deleting the bill deletes the photo.',
  ],
]

export default function Landing() {
  const { status } = useAuth()
  useDocumentTitle(null)
  const start = status === 'authed' ? '/bills/new' : '/register'

  return (
    <main id="main">
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pt-10 pb-16 sm:pt-16 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="rise">
          <p className="text-sm font-semibold tracking-wide text-accent-text uppercase">Bill splitting for the table</p>
          <h1 className="mt-3 text-[2.6rem] font-semibold sm:text-6xl">
            Split the bill by what everyone <em className="font-medium text-accent-text">actually</em> ate.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Snap the receipt, share one link, and everyone ticks their own items. Shared dishes split evenly, tax and service
            charge split fairly, and you can see who’s paid.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink to={start} size="lg">
              Start a bill
            </ButtonLink>
            <ButtonLink to="#how" variant="secondary" size="lg" onClick={scrollTo('how')}>
              How it works
            </ButtonLink>
          </div>
        </div>

        <ExampleReceipt />
      </section>

      <section id="how" className="border-y border-line/70 bg-surface/60 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="text-3xl font-semibold sm:text-4xl">Three steps, one link</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-5">
                <span className="font-display text-3xl font-semibold text-accent-text">{i + 1}</span>
                <h3 className="mt-2 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
          <div>
            <h2 className="text-3xl font-semibold sm:text-4xl">Tax follows the food</h2>
            <p className="mt-4 text-lg text-muted">
              Tax, service charge and tip are shared in proportion to what each person ordered. If your food is 30% of the
              bill, you cover 30% of the extras, not an equal slice.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <p className="text-sm font-semibold text-muted">Your total</p>
            <p className="mt-2 font-display text-xl sm:text-2xl">
              your items × (1 + <span className="whitespace-nowrap">extras ÷ bill subtotal</span>)
            </p>
            <p className="mt-4 text-[15px] text-muted">
              Rounding is handled to the paisa, so everyone’s shares always add up to exactly what’s on the receipt.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-8" aria-labelledby="faq">
        <h2 id="faq" className="text-3xl font-semibold sm:text-4xl">
          Questions
        </h2>
        <div className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-lg font-semibold">
                {q}
                <span aria-hidden="true" className="text-muted transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2 text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  )
}

function scrollTo(id) {
  return (e) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }
}

function ExampleReceipt() {
  const extras = 0.21
  const shares = { Ali: 0, Zoya: 0, Sam: 0 }
  for (const item of EXAMPLE) for (const p of item.who) shares[p] += item.price / item.who.length
  return (
    <figure className="rise mx-auto w-full max-w-sm [animation-delay:120ms]">
      <div className="receipt-edge rounded-t-2xl border border-b-0 border-line bg-surface px-5 pt-5 shadow-lg shadow-black/5">
        <div className="flex items-baseline justify-between">
          <p className="font-display text-lg font-semibold">Friday dinner</p>
          <span className="rounded-full bg-sunk px-2 py-0.5 text-xs font-semibold text-muted">Example</span>
        </div>
        <ul className="mt-4 space-y-3 border-b border-dashed border-line pb-4">
          {EXAMPLE.map((item) => (
            <li key={item.name} className="flex items-start justify-between gap-3 text-[15px]">
              <span>
                {item.name}
                <span className="block text-sm text-muted">{item.who.join(', ')}</span>
              </span>
              <Money value={item.price} currency="PKR" />
            </li>
          ))}
        </ul>
        <ul className="space-y-1.5 py-4">
          {Object.entries(shares).map(([name, sub]) => (
            <li key={name} className="flex justify-between font-semibold">
              <span>{name}</span>
              <Money value={Math.round(sub * (1 + extras))} currency="PKR" />
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">Sample bill with 21% tax and service charge.</figcaption>
    </figure>
  )
}
