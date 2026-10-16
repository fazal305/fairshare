# FairShare — build plan

## Understanding of the SRS

- A **host** photographs or uploads a restaurant receipt; the API extracts line items, subtotal, tax, service charge and discounts (FR-1.1, FR-1.2).
- The host corrects anything the OCR got wrong — edit, add, delete items and charges (FR-1.3) — then publishes the bill, which produces a unique share link (FR-2.1).
- **Participants** open the link on their phones, enter a nickname (no account, FR-2.2) and tick the items they had (FR-2.3).
- An item ticked by several people is split equally between them (FR-2.4).
- Tax, service charge and tip are allocated in proportion to each person's item subtotal, not evenly (FR-3.1).
- Participants pay the host by card (Stripe Checkout) or bank transfer / IBFT with a QR code (FR-4.1).
- The host sees a live ledger of who has paid and who is pending (FR-4.2); payment webhooks mark people paid and notify the host in-app (FR-4.3).
- Mobile-first (90% of traffic is phones at the table); receipt parsing should finish in under 5 s; card data never touches our servers and bank details are never stored raw.

## Ambiguities and contradictions

| # | Issue | Decision |
|---|---|---|
| 1 | FR-3.1 formula says "Total Taxes + Fees" but FR-1.2 also extracts **discounts**. | Adjustments = tax + service charge + tip − discount. A discount lowers everyone's total proportionally. |
| 2 | "Bill Subtotal" could mean the printed subtotal or the sum of items. | Use the sum of the (host-verified) items; the review screen warns when it differs from the printed subtotal. |
| 3 | Tip is in FR-3.1 but not in the schema (§6). | `bills.tip` column added; host enters it on the review screen. |
| 4 | Unclaimed items — who pays? | Not assigned automatically. The ledger shows the unclaimed amount so the host can chase it or claim it themselves via the link. |
| 5 | Rounding: proportional shares rarely divide into whole paisa/cents. | All money is integer minor units. Shared items and adjustments use largest-remainder rounding so the shares always add up exactly. |
| 6 | Card payments: with plain Stripe, money lands in the *platform's* account, not the host's. Paying the host directly needs Stripe Connect onboarding. | Built against Stripe Checkout in **test mode** only and labelled as a demo. Connect is out of scope and flagged as a legal/trust risk below. |
| 7 | "Local open banking APIs" for IBFT — no public, free Pakistani open-banking API exists for this. | Bank transfer = host's account details (encrypted at rest) shown with a QR code of the transfer details; the participant marks "I've sent it" with a reference and the host confirms. Honest manual flow, no fake bank integration. |
| 8 | Push notifications. | In-app notifications (bell + ledger badge). Web push needs a service worker, VAPID keys and a notification permission prompt at a restaurant table — skipped. |
| 9 | Laravel Reverb / Pusher for real-time. | Short polling (3–5 s) on the host ledger and participant screen. Reverb needs a long-running WebSocket process that free API hosts don't keep alive; Pusher needs a paid-tier-risk account. Swappable later because state comes from one endpoint. |
| 10 | OCR engine: Google Cloud Vision needs billing; Tesseract isn't installed and gives raw text, not structure. | Pluggable `ReceiptReader`: default = OpenRouter free vision model returning structured JSON (works for anyone who clones with a free key); `manual` driver when no key is set, so the host can still type items in. |
| 11 | Users table has `bank_details_json`. | Stored with Laravel's `encrypted:array` cast (AES-256 with APP_KEY), never raw. |
| 12 | Bill `status (open, paid)`. | `draft` (host still reviewing) → `open` (link live) → `settled` (host closes it). |

## Architecture

```
fairshare/
  api/   Laravel 13 REST API (Sanctum bearer tokens for hosts, signed participant tokens for guests)
  web/   React 19 + Vite + Tailwind 4 SPA, plain JSX
  docs/
```

**Data flow.** Upload → `POST /api/bills` (multipart) stores a re-encoded copy in private storage and dispatches `ReadReceipt` (sync locally, database queue in prod). The SPA polls `GET /api/bills/{id}` until `ocr_status` is `done`/`failed`. Host edits items (`PUT /api/bills/{id}`), publishes (`POST /api/bills/{id}/publish`) → share URL `/s/{public_id}`. Guest: `POST /api/s/{public_id}/join` → participant token (shown once, kept in localStorage, stored hashed). `PUT /api/s/{public_id}/claims` toggles claims. `GET /api/s/{public_id}` returns items, who claimed what and computed shares. Payments: `POST /api/s/{public_id}/pay/card` → Stripe Checkout URL; `POST /api/webhooks/stripe` verifies, dedupes and marks paid. Bank: `POST /api/s/{public_id}/pay/bank` → `awaiting_confirmation`; host `POST /api/bills/{id}/participants/{p}/confirm`.

**Split engine.** One pure PHP class (`App\Support\SplitCalculator`) — used by every endpoint and unit-tested on its own.

## Data model

| Table | Columns | Indexes |
|---|---|---|
| users | id, name, email, password, bank_details (encrypted) | email unique |
| bills | id, host_id → users, public_id (12-char random), title, currency, printed_subtotal, tax, service_charge, tip, discount (all integer minor units), status, ocr_status, ocr_error, receipt_path | public_id unique, host_id |
| items | id, bill_id → bills (cascade), name, price, position | bill_id |
| bill_participants | id, bill_id, nickname, token_hash, payment_status (pending / awaiting_confirmation / completed), payment_method, amount_paid, transaction_reference, paid_at | (bill_id, nickname) unique, token_hash |
| item_claims | id, item_id, participant_id | (item_id, participant_id) unique, participant_id |
| payment_events | id, provider, event_id, type | (provider, event_id) unique — webhook dedupe |
| notifications | Laravel database notifications for the host | notifiable |

## Checklist decisions

**Applies:** receipt upload hardening (allowlist, MIME sniff, re-encode strips EXIF/GPS, random names, private storage, size cap), rate limits on auth/join/claims/upload/pay, server validation, role checks (host owns bill; participant only edits own claims), webhook signature + dedupe + amount cross-check, generic errors, CORS for the deployed origin, security headers, escape-by-default rendering (React text nodes only, no `dangerouslySetInnerHTML`), all UI states listed, privacy policy + terms + FAQ + 404, consent checkbox on host registration, demo/test-mode labels, Lighthouse, 375px overflow, SEO metadata, repo hygiene files.

**Skipped:** cookie banner (no cookies or analytics; only essential localStorage — explained in the privacy policy), refund policy (FairShare never holds money; Stripe runs in test mode), content moderation/DMCA (receipts are private to the host, nothing is published), "session expired" for guests (participant tokens don't expire while the bill is open; hosts do get a session-expired state), web push, Reverb/Pusher, Google Cloud Vision, Three.js/Lenis/Barba (no 3D, scroll story or multi-page transitions in a utility app), load balancer, public-apis (nothing in the SRS needs one).

## Build order

1. **M1** API skeleton: schema, models, host auth, split calculator + tests.
2. **M2** Receipt upload, OCR reader, review/edit screen (FR-1.x).
3. **M3** Publish + share link, guest join, claiming, live totals (FR-2.x, FR-3.1).
4. **M4** Payments (Stripe test mode + bank transfer), host ledger, webhooks, notifications (FR-4.x).
5. **M5** Legal pages, SEO, a11y, Lighthouse, e2e, repo hygiene.
