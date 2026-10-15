# Trellis

Open-source work management for small organizations: projects, tasks, boards, timelines, goals and
more. Built for [Seeds of Leadership](https://seedsofleadership.ca), free for anyone to run.

- **Sign-in**: Google, Microsoft, or email + password (with reset-by-email). Anyone with your
  organization's email domain can join; outside partners join as guests by invitation.
- **Two-factor sign-in is required for everyone**: an authenticator app set up by scanning a QR code.
- **Runs on free tiers**: the site is static files on **GitHub Pages**. **Supabase** provides the
  database, sign-in, scheduled jobs and server functions. Emails go out through **Gmail** (Google
  Workspace, about 2,000 a day), and attachments can live on **Cloudflare R2** (10 GB free).

---

## Features

- **Projects** with List, Board, Timeline (Gantt with dependencies), Calendar, Dashboard, Overview
  and Workflow views; sections, drag and drop, templates and duplication
- **Tasks** with subtasks, assignees, start/due dates, milestones, dependencies, attachments,
  comments with @mentions, followers, likes and a full activity history
- **Custom fields** (text, number, date, single/multi select, people, checkbox) and **rules**
  ("when a task moves to Done, mark it complete")
- **My tasks**, **Home**, **Inbox** (updates live), global search (Ctrl/Cmd + K)
- **Email notifications** (see [Emails](#emails)): one thread per task for comments, assignments
  and @mentions, a daily update of tasks due soon, plus welcome and accepted-invite emails. Each
  kind can be switched off in Settings
- **Goals**, **Portfolios** and **Workload**
- **Teams**, project privacy (workspace / team / private) and project roles (admin, editor,
  commenter, viewer)
- **Admin console**: people, roles, deactivation, removing users, resetting someone's two-factor,
  guest invitations, allowed email domains, email setup
- Works on phones, tablets, laptops and large monitors; light and dark themes

## Emails

Every email links straight to the page it's about (the task pane, the project, the person's tasks),
and a signed-out reader is taken back there after signing in.

| Email | When | Opens |
| --- | --- | --- |
| Welcome | The first time someone signs in | Home, My tasks, Inbox and each project they were added to |
| Daily update | Around 8am in the reader's time zone, if they have tasks due within 2 days or overdue, or unread Inbox items | Each task; My tasks; Inbox |
| Task activity | Hourly: new comments on tasks you follow, assignments and @mentions | The task |
| Invite accepted | Someone you invited signs in | Their projects shared with you |
| Invitation, password reset, email confirmation | Immediately | Sign-in, then the invited project / the reset form |

Task activity is grouped: one email per task per hour, whatever happened on it. Emails about the
same task keep the same subject and `References` header, so Gmail, Outlook and Apple Mail show them
as one conversation instead of a new email each time. Items already read in the app aren't emailed.

## How it works

```
Browser: static Next.js app on GitHub Pages
  │  signs in (Google / Microsoft / password) + authenticator code  ─▶ Supabase Auth
  │  reads & writes data directly ─────────────────────────────────▶ Supabase Postgres
  │                                     • row-level security checks every read and write
  │                                     • two-factor required on every table
  │                                     • triggers: activity, notifications, rules
  │                                     • pg_cron: hourly task emails, 15-min account/daily emails
  └─ privileged work ──▶ Edge Functions: invite · admin · files · notifications · auth-email
                              │                                     │
                              ▼                                     ▼
                     Cloudflare R2 (attachments)          Gmail API (all email)
```

All permissions are enforced in the database, so the website holds no secrets. The test suites
cover the security rules, including attack scenarios; see [Checks](#checks).

**Scale.** A load test with 500 people's worth of data (300 projects, 66,000 tasks, 100,000
comments) runs every main query in under 15 ms (`scripts/load-test.sql`). Supabase's free plan allows
about 200 people connected to live updates at the same time. Beyond that the app refreshes every
30 seconds instead, and [Supabase Pro](https://supabase.com/pricing) or self-hosting removes the
limit (see [docs/SELF_HOSTING_ORACLE.md](docs/SELF_HOSTING_ORACLE.md)).

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run your own

About an hour, once, all on free tiers. Follow **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**:

1. Fork this repository.
2. Create a free Supabase project; push the database and functions.
3. Register sign-in with Google and/or Microsoft.
4. Authorize a Gmail sender for email (`npm run setup:gmail`).
5. Optional: create a Cloudflare R2 bucket for attachments.
6. Set two repository variables and turn on GitHub Pages.
7. Sign in first: you become the admin.

When you outgrow Supabase's free plan, you can move to your own free Oracle Cloud server; see
**[docs/SELF_HOSTING_ORACLE.md](docs/SELF_HOSTING_ORACLE.md)**.

## Develop locally

Prerequisites: [Node.js 22+](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/)
and Git.

```bash
npm install
npm run db:start          # local Supabase in Docker (first run downloads images)
node scripts/ci-env.mjs   # writes .env.local for the local stack
npm run db:reset && npm run seed:dev
npm run dev               # http://localhost:3000
```

Demo accounts (local only), all with the password `seeds-dev-2026`: `aya@seedsofleadership.ca`
(admin); `jordan@`, `sam@` and `priya@seedsofleadership.ca` (members); `guest@partner.org` (guest).
Each one sets up two-factor with any authenticator app the first time it signs in. Locally, account
emails (password resets, confirmations) are caught by the mail viewer at http://127.0.0.1:54324.

### Checks

```bash
npm run lint && npm run typecheck && npm run build
npm run test:db          # database security & logic
# with functions running: npx supabase functions serve --env-file supabase/functions/.env.test
npm run test:functions   # Edge Functions
npm run test:emails      # every email, against a mock Gmail
```

All of these run automatically on every pull request
([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Contributing

Ideas, bug reports and pull requests are very welcome! Open an issue to discuss a feature, or send a
PR. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for how the code is organized and what a good PR looks
like. Report security problems privately: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
