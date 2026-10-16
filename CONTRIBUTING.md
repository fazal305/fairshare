# Contributing

Thanks for taking the time to help. Bug reports, fixes and small improvements are all welcome.

## Getting set up

Follow **Local setup** in the [README](README.md). You'll need PHP 8.3+, Composer and Node 20+.

## Before opening a pull request

1. Create a branch from `main`.
2. Keep changes focused: one fix or feature per PR.
3. Run the checks:
   ```bash
   cd api && php artisan test && ./vendor/bin/pint --test
   cd web && npm run lint && npm run build
   ```
4. Add or update tests for behaviour you change (API tests live in `api/tests`). Changes to the split maths need a test in `tests/Unit/SplitCalculatorTest.php`.
5. Describe what changed and why in the PR, and include a screenshot at phone width for UI changes.

## Code style

- PHP follows Laravel Pint defaults.
- The frontend is plain JavaScript/JSX (no TypeScript) with Tailwind.
- Money is always integer minor units; never use floats for amounts on the server.
- Comment only where the code isn't self-explanatory.

## Reporting bugs

Open an issue using the bug report template. For security problems, see [SECURITY.md](SECURITY.md) instead.

By contributing you agree that your contributions are licensed under the MIT License and that you'll follow the [Code of Conduct](CODE_OF_CONDUCT.md).
