# Contributing to Seeds Tasks

Thanks for helping! Bug fixes, new features, docs and design improvements are all welcome.

## Before you start

- **Small fixes**: just open a pull request.
- **New features or bigger changes**: please open an issue first, so we can agree on the approach
  before you invest time.
- Be kind. This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

## Setup

See **Develop locally** in the [README](README.md). To work on the Edge Functions too:

```bash
cp supabase/functions/.env.test.example supabase/functions/.env.test
npx supabase functions serve --env-file supabase/functions/.env.test
```

## How the code is organized

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The short version:

| Where | What |
|---|---|
| `supabase/migrations/` | Schema, row-level security, triggers. **All permissions live here.** |
| `supabase/functions/` | Edge Functions (Deno): `invite`, `admin`, `notifications` |
| `src/app/` | Pages (static export: no server code, records use `?id=`) |
| `src/lib/queries/` | Data hooks (TanStack Query) — use these instead of calling Supabase directly |
| `src/lib/routes.ts` | Every in-app URL |
| `src/components/` | UI, one folder per feature; shared primitives in `components/ui` |
| `scripts/` | Test suites and dev seeding |

## Guidelines

- **Security first.** The browser is untrusted. Any rule about who can see or change something
  must be enforced in a migration (RLS policy or trigger), not just hidden in the UI. Add a test
  for it in `scripts/test-db.mjs`.
- **Database changes** go in a **new** migration file (`npx supabase migration new <name>`).
  Never edit a migration that has already been released. Then run `npm run db:reset` and
  `npm run db:types`.
- **Match the existing code**: same patterns, naming and comment style. Use theme colour tokens
  (`bg-surface`, `text-muted`, …) so light and dark modes both work.
- **Works everywhere**: check your change at phone width (375px), tablet and desktop.
- **Accessible**: real buttons and links, labels on icon buttons, keyboard support.
- Keep PRs focused, and explain the *why* in the description.

## Before opening a PR

```bash
npm run lint && npm run typecheck && npm run build
npm run db:reset && npm run test:db
npm run seed:dev && npm run test:functions && npm run test:emails   # with functions serving
```

CI runs all of this on your PR.
