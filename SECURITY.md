# Security Policy

## Reporting a vulnerability

Please report security issues privately by email to **fazalabbas2002@gmail.com** rather than opening a public issue. Include steps to reproduce and the affected commit.

You can expect an acknowledgement within 5 days. Once a fix is ready, it will be released and the report credited if you'd like.

## Scope

In scope: the Laravel API (`api/`), the React app (`web/`), the guest share links and the Stripe webhook. Please only test against your own local copy. Do not scan or load-test any hosted instance.

## What's already in place

- Host auth with Sanctum bearer tokens (30-day expiry) and bcrypt password hashing
- Every host query scoped to the signed-in user; other users' bills return 404
- Guest participants identified by a random token stored only as a SHA-256 hash, scoped to one bill
- Rate limits on registration/login (per IP and per email), uploads, guest joins and writes, and webhooks
- Server-side validation on every write; Eloquent/query builder only, no string-built SQL
- Uploads: extension allowlist, server-side MIME sniffing, pixel-count cap, re-encoding (strips metadata), random filenames, private storage
- Bank details encrypted at rest with the app key
- Stripe webhook: HMAC-SHA256 signature checked with `hash_equals`, 5-minute timestamp window, event-id dedupe, amount and currency cross-check
- Generic error messages to clients; details only in server logs
- Security headers on API responses and on the static site
