# Security policy

Trellis stores organizations' work, so we take security seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Instead, report it privately through GitHub:
**Security → Report a vulnerability** on this repository. Include steps to reproduce and the
impact. We aim to respond within a week.

## How access is enforced

- Every permission is enforced by Postgres row-level security and triggers in
  `supabase/migrations/`. The website itself holds no secrets.
- Privileged operations (removing users, sending email) run in Supabase Edge Functions, which check
  the caller's identity and role.
- `scripts/test-db.mjs` and `scripts/test-functions.mjs` include regression tests for known attack
  scenarios. Please add one with any security fix.
