# Seeds Tasks

Open-source work management for small organizations: projects, tasks, boards, timelines, goals and
more. Built for [Seeds of Leadership](https://seedsofleadership.ca), and free for anyone to run.

Your team signs in with **Google or Microsoft**. Nobody has to share codes or IDs. Anyone with your
organization's email domain joins automatically, and outside partners join as guests by invitation.

It runs entirely on free tiers: **GitHub Pages** hosts the site and **Supabase** provides the
database, login, file storage and scheduled emails.

---

## Features

- **Projects** with List, Board, Timeline (Gantt with dependencies), Calendar, Dashboard, Overview
  and Workflow views; sections, drag and drop, templates and duplication
- **Tasks** with subtasks, assignees, start/due dates, milestones, dependencies, attachments,
  comments with @mentions, followers, likes and a full activity history
- **Custom fields** (text, number, date, single/multi select, people, checkbox) and **rules**
  ("when a task moves to Done, mark it complete")
- **My tasks**, **Home**, **Inbox** (live), global search (Ctrl/Cmd + K)
- **Email notifications**: an hourly email when someone @mentions you, plus a morning digest of
  anything still unread (8am in your own time zone)
- **Goals**, **Portfolios** and **Workload**
- **Teams**, project privacy (workspace / team / private) and project roles (admin, editor,
  commenter, viewer)
- **Admin console**: people, roles, deactivation, guest invitations, allowed email domains, email
  setup
- Live updates across users, light and dark themes, works on phones, tablets and large monitors

## How it works

```
Browser (static Next.js app on GitHub Pages)
   │  signs in with Google / Microsoft (Supabase Auth, PKCE)
   │  reads & writes data directly ──────────────▶ Supabase Postgres
   │                                                 • Row-level security decides every permission
   │                                                 • Triggers: activity log, notifications, rules
   │                                                 • pg_cron: hourly notification run
   └─ calls Edge Functions for privileged work ──▶ invite · admin · notifications (emails via Resend)
```

Security lives in the database. Every read and write is checked by Postgres row-level security,
so the website holds no secrets. The automated test suites check these rules, including
dozens of attack scenarios.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run your own

Setting up a copy for your organization takes about 45 minutes and costs nothing. Follow
**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**:

1. Fork this repository.
2. Create a free Supabase project and push the database and functions.
3. Register the app with Google and/or Microsoft for sign-in.
4. Set two repository variables and turn on GitHub Pages.
5. Sign in first: you become the admin.

## Develop locally

Prerequisites: [Node.js 22+](https://nodejs.org), [Docker Desktop](https://www.docker.com/products/docker-desktop/)
and Git.

```bash
npm install
npm run db:start      # local Supabase in Docker (first run downloads images)
node scripts/ci-env.mjs   # writes .env.local for the local stack
npm run seed:dev      # demo people and projects
npm run dev           # http://localhost:3000, use the "Dev sign-in" form
```

Demo accounts (local only, password `seeds-dev-password`): `aya@seedsofleadership.ca` (admin),
`jordan@`, `sam@`, `priya@seedsofleadership.ca` (members) and `guest@partner.org` (guest).

### Checks

```bash
npm run lint && npm run typecheck && npm run build
npm run test:db         # database security & logic (needs db:start)
npm run test:functions  # Edge Functions (needs functions running, see CONTRIBUTING.md)
npm run test:emails     # notification emails against a mock email provider
```

All of these run automatically on every pull request.

## Contributing

Ideas, bug reports and pull requests are very welcome. If there's a feature you'd like, open an
issue to talk it through, or send a PR. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for how
the code is organized and what a good PR looks like.

Found a security problem? Please report it privately; see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
