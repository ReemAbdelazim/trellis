## What & why

<!-- What does this change, and why? Link the issue if there is one. -->

## How I tested it

<!-- Steps a reviewer can follow. Screenshots or a short clip for UI changes. -->

## Checklist

- [ ] Permissions are enforced in the database (RLS/trigger), with a test in `scripts/test-db.mjs` if access rules changed
- [ ] New migration file (no edits to released migrations); `npm run db:types` re-run
- [ ] Works at phone (375px), tablet and desktop widths, in light and dark mode
- [ ] `npm run lint`, `npm run typecheck`, `npm run build` pass
