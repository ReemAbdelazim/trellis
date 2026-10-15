# Trellis — architecture & conventions

An original work-management app (Asana-style) for Seeds of Leadership.
Stack: Next.js 16 (App Router, **static export** for GitHub Pages) · React 19 · Tailwind v4 ·
Supabase (Postgres + RLS, Auth: Google/password + TOTP two-factor, Realtime, Storage,
Edge Functions, pg_cron) · Gmail API (email) · Cloudflare R2 (attachments, optional) · TanStack Query v5 · Radix UI (`radix-ui` package) · lucide-react · date-fns v4 · @dnd-kit · sonner.

## Runtime shape

- The site is plain static files (`npm run build` → `out/`). There is no app server: the browser
  talks to Supabase directly with the user's session, stored in localStorage.
- Records are addressed with query params because static hosting has no dynamic paths:
  `/project?id=…&view=board&task=…`, `/team?id=…`, `/goal?id=…`, `/portfolio?id=…`. Build every
  URL with `routes` from `src/lib/routes.ts`; use `absoluteUrl()` for copied links and redirects
  (it includes `NEXT_PUBLIC_BASE_PATH`).
- `src/app/(app)/layout.tsx` wraps signed-in pages in `AuthGate` (`src/lib/queries/me.tsx`), which
  resolves the session, two-factor level and profile; redirects to `/login`, `/mfa` or `/no-access`;
  and provides `useMe()`.
- Sign-in (`src/lib/auth.ts`): Google via PKCE (`signInWithGoogle`), or email + password
  (`signInWithPassword`, `signUpWithPassword`, `requestPasswordReset`). Account emails use the
  implicit flow so their links work on any device. Every link lands on `/auth/callback`, which
  handles `?code=`, `?token_hash=` and `#access_token`. `/mfa` sets up or verifies the authenticator
  (`components/auth/mfa.tsx`); `/auth/reset` sets a new password.
- Privileged work runs in **Edge Functions** (`supabase/functions/`, Deno), called with
  `callFunction()` from `src/lib/functions.ts`:
  - `invite`: creates invitations as the caller (RLS-checked) and emails them
  - `admin`: admin-only. Remove user, reset someone's two-factor, email status, connect email
    delivery, test email, resend invite
  - `files`: signed upload/download URLs for attachments on Cloudflare R2 (falls back to Supabase
    Storage when R2 isn't configured)
  - `notifications`: called by pg_cron. Hourly (`activity`): one email per person per task for new
    comments, assignments and @mentions, threaded per task. Every 15 minutes (`frequent`): welcome
    and invite-accepted emails, and the daily update (8am local time). Honours each person's
    `email_prefs`; at most 100 emails per run. Templates live in `_shared/email-templates.ts`
  - `auth-email`: Supabase Auth "Send Email" hook (confirm address, reset password), verified with
    Standard Webhooks signatures
  All email goes through `_shared/email.ts` (Gmail API with a stored refresh token).
  Shared function code is in `supabase/functions/_shared/`; `notification-text.ts` is also imported
  by the web app so Inbox and emails word things identically.

## Security model (the database is the source of truth)

All access control lives in Postgres RLS (`supabase/migrations/*`). The browser talks to Supabase
directly with the user's session; RLS decides what each row read/write may do. Never trust the client
for permissions — UI checks only hide controls.

- Roles (`profiles.role`): `admin` | `member` | `guest`. Status `active` | `deactivated`.
- Sign-in gate (`handle_new_user` trigger): emails on `org_settings.allowed_domains` become members
  (the first one becomes admin); anyone else needs an open row in `invitations` (usually guests).
- Project access (`project_access(project_id)` RPC → `owner|editor|commenter|viewer|null`):
  admins = owner everywhere; explicit `project_members` role; otherwise members get `editor` on
  `public` projects and on `team` projects of teams they belong to. Guests only get explicit membership.
- Tasks: visible if you can view the project, or you created / are assigned / follow it, or can see its
  parent. Editable by project editors, the creator, or the assignee. RPCs: `can_edit_task`, `can_comment_task`.
- Subtasks inherit `project_id` from their parent (trigger) and have no section. Project views list only
  `parent_id is null` tasks.
- **Two-factor is mandatory**: a restrictive `mfa_required` policy on every table requires the
  session's `aal` claim to be `aal2`, and every `public.*` helper answers only for aal2 sessions.
- **Password accounts** get a profile only after confirming their email (`private.provision_profile`
  runs on confirmation), so nobody can claim an address they don't own.
- **Performance rule:** list policies compare rows against per-statement arrays
  (`my_visible_project_ids()`, `my_followed_task_ids()`, wrapped as `(select …)::uuid[]`) instead of
  calling helpers per row. Child tables (comments, attachments, …) check
  `exists (select 1 from tasks …)` and inherit the tasks policy. Keep new policies set-based; per-row
  helper calls are fine only for single-row writes. `project_stats()` is a function for the same reason.
  `scripts/load-test.sql` times the hot paths with 500 people's worth of data.
- Permission helpers: `private.*(…, p_user)` are internal; the `public.*` wrappers (e.g.
  `project_access(p_project)`) always evaluate for the caller, and anonymous users can't call any
  function. Internal trigger helpers (`private.notify`, `private.log_activity`, `private.run_rules`)
  aren't exposed through the API.
- Triggers handle: activity log (`task_activity`), followers, notifications, completion timestamps,
  default sections on new projects, rules automation (`rules` table), dependency-cycle checks.
- Goals and portfolios are visible to full members (not guests).

## Data access (client)

Use the hooks in `src/lib/queries/*` — never call Supabase ad hoc from components when a hook exists.
Add new hooks next to the existing ones (new file per feature is fine). Patterns:

- Query keys come from `qk` in `src/lib/queries/keys.ts`. All task lists live under `["tasks", ...]`
  so `useUpdateTask` / `useCreateTask` / `useDeleteTask` patch them optimistically everywhere.
- Create tasks with a client id: `create.mutate({ id: newId(), ... , created_by: me.id })`.
- Realtime: `useRealtime({ table, filter, invalidate: [keys] })` (tables listed in `realtime.ts`).
  If live updates can't connect (e.g. the plan's connection limit), it polls every 30 s instead.
- Task selects use `TASK_COLUMNS` from `tasks.ts` (never `*`: it would download the full-text index).
- Current user: `useMe()` (profile), `useIsAdmin()`, `useIsGuest()` from `src/lib/queries/me.tsx`.
- People: `useProfiles`, `useActiveProfiles`, `useProfileMap`, `useProfile(id)`.
- Projects: `useProjects`, `useProject`, `useProjectAccess`, `useCanEditProject`, `useSections`,
  `useCreateSection`/`useUpdateSection`/`useDeleteSection`, `useProjectMembers`, `useProjectStats` (RPC).
- Tasks: `useProjectTasks(projectId)` (→ `TaskItem[]` with `subtask_count`, `comment_count`),
  `useMyTasks(userId)`, `useSubtasks`, `useTask`, `useCanEditTask`, `useUpdateTask`, `useCreateTask`, `useDeleteTask`.
- Custom fields: `useCustomFields`, `useProjectFieldValues` (→ `map: Map<taskId, Map<fieldId, value>>`),
  `useTaskFieldValues`, `useSetFieldValue` in `src/lib/queries/fields.ts`.
- Feature hooks: `rules.ts` / `field-admin.ts` (workflow tab), `notifications.ts` (inbox),
  `search.ts`, `home.ts`, `goals.ts` (incl. `goalProgress`), `portfolios.ts`, `workload.ts`
  (`useTasksInRange`), `teams.ts`, `admin.ts`, `project-dependencies.ts` (timeline).
- Browser state: `src/lib/use-local-storage.ts` (`useLocalFlag`, `useLocalNumber`, `useLocalString`),
  `src/lib/theme.ts`, generic hooks in `src/lib/hooks.ts` (`useElementSize`, `useToday`, `useMediaQuery`).
- Edge Functions resolve the caller with `requireCaller()` / `requireAdmin()` (RLS-bound client) before
  touching the service-role client. Secrets are Supabase function secrets, never in the repo.
- Types: `src/types/models.ts` (row aliases) — generated DB types in `src/types/database.ts`
  (regenerate with `npm run db:types` after a migration).

## UI

- Task details open in a global right-hand pane via `?task=<id>`: `const { openTask } = useTaskPane()`
  from `src/lib/task-pane.ts`. Don't build another task detail view.
- Reusable pieces: `components/ui/*` (Button, Input/Textarea/Select/Label, Dialog, Menu*, Popover*,
  Tooltip, Avatar/AvatarStack, DatePicker/Calendar, UserPicker/MultiUserPicker/PeopleList, misc:
  Spinner, PageLoader, EmptyState, Pill, StatusPill, ColorDot, ColorSwatches, ProgressBar, InlineEdit,
  ConfirmDialog, Kbd, SectionHeading) and `components/task/task-bits.tsx` (TaskCheckbox, AssigneeButton,
  DueDateButton).
- Helpers in `src/lib/utils.ts`: `cn`, `positionBetween`, `nextPosition`, `formatDue`, `formatDateRange`,
  `dueTone` + `DUE_TONE_CLASS`, `timeAgo`, `colorHex`, `toISODate`, `toDate`, `errorMessage`.
- Colors: only theme tokens (`bg-surface`, `bg-surface-2`, `text-muted`, `text-faint`, `border-border`,
  `bg-accent`, `text-danger`, `bg-success-soft`, …) defined in `src/app/globals.css`. Light + dark both work.
- Pages under `src/app/(app)/` are wrapped by the app shell (sidebar, top bar, task pane). Page components
  are client components (`"use client"`) that fetch via hooks; set `export const metadata` only in server files.
- Mobile: layouts must work at 375px wide (stack, horizontal scroll inside tables/boards, not the page).
- Ordering: `position` is a float; use `positionBetween(prev, next)` when dropping between items.
- Errors: mutations toast via `sonner` (`toast.error(errorMessage(err))`).
- Keep components focused; one feature per folder under `src/components/<feature>/`.

## Checks

`npm run lint`, `npm run typecheck` and `npm run build` must pass (React compiler lint rules are on:
no setState inside effects — derive state during render or use event handlers).
`npm run test:db`, `npm run test:functions` and `npm run test:emails` run integration tests against
the local stack; CI (`.github/workflows/ci.yml`) runs all of them on every pull request.
