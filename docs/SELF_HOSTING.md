# Self-hosting Seeds Tasks

This sets up your own copy on free tiers: **GitHub Pages** for the site and **Supabase** for
the database, login, files and emails. Allow about 45 minutes. You only do this once. After that,
your team just clicks "Continue with Google" or "Continue with Microsoft".

Throughout this guide:

- `<ref>` is your Supabase project ref (the `abcd1234` in `https://abcd1234.supabase.co`)
- `<site>` is your site's address, e.g. `https://your-org.github.io/seeds-tasks`

You'll need [Node.js 22+](https://nodejs.org) and Git on your computer for a few commands.

---

## 1. Fork and clone

Fork this repository on GitHub (keep it **public**, which free GitHub Pages requires), then:

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
npm install
```

## 2. Create the Supabase project

1. Sign up at <https://supabase.com> → **New project**. Pick a region near your team and save the
   database password in your password manager.
2. Link and push the database and functions:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   npx supabase functions deploy
   ```
3. **Set your organization's email domain** (the people allowed to join automatically). In
   Supabase → **SQL Editor**, run (replace the values):
   ```sql
   update public.org_settings
   set name = 'Your Organization', allowed_domains = array['yourorg.org'], timezone = 'America/Toronto'
   where id = 1;
   ```
   Do this **before** anyone signs in. The first person to sign in with an allowed domain becomes
   the admin.
4. **Authentication → Sign In / Providers → Email**: turn **off** "Enable email provider". Only
   Google and Microsoft should create accounts.
5. **Authentication → URL Configuration**: set **Site URL** to `<site>` and add
   `<site>/auth/callback/` to **Redirect URLs** (add `http://localhost:3000/auth/callback/` too if
   you'll develop locally).
6. **Project Settings → API Keys**: note the **Project URL** and the **publishable** key. Both
   are public and safe to put in GitHub.

## 3. Google sign-in

1. <https://console.cloud.google.com> → create a project.
2. **APIs & Services → OAuth consent screen**: User type **External** (so invited guests with
   personal Gmail can sign in), app name, support email. Scopes: `openid`, `email`, `profile`.
   **Publish** the app. These scopes don't need Google's review.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
4. In Supabase → **Authentication → Providers → Google**, enable it and paste the client ID and secret.

## 4. Microsoft sign-in (optional)

1. <https://entra.microsoft.com> → **App registrations → New registration**.
   Supported accounts: **any organizational directory and personal Microsoft accounts**.
   Redirect URI (Web): `https://<ref>.supabase.co/auth/v1/callback`.
2. **Certificates & secrets → New client secret** (up to 24 months). Copy the **Value** now, and
   set a reminder to renew it before it expires.
3. **Token configuration → Add optional claim → ID token** → tick `email` and `xms_edov`.
   This lets Supabase confirm the email address is verified.
4. Supabase → **Authentication → Providers → Azure**: enable it, paste the Application (client) ID
   and secret, Azure Tenant URL `https://login.microsoftonline.com/common`.

## 5. Publish with GitHub Pages

1. In your fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** → add:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_PUBLISHABLE_KEY`: the publishable key
   - `BASE_PATH` (only if you use a custom domain): `/`
3. **Actions → Deploy to GitHub Pages → Run workflow** (it also runs on every push to `main`).
4. Open `<site>` and **sign in first** with your organization account. You're now the admin.

Custom domain (e.g. `tasks.yourorg.org`): add it under **Settings → Pages**, set `BASE_PATH` to `/`,
re-run the workflow, and update the Supabase URL configuration (step 2.5) to the new address.

## 6. Email notifications (optional, free)

People get an **hourly email when someone @mentions them** and a **morning digest** of unread
Inbox items (8am in their time zone; set it under Profile & notifications).

1. Sign up at <https://resend.com> (free tier: 3,000 emails/month), verify your domain (a few DNS
   records), and create an API key.
2. Store the settings as Supabase function secrets (never in GitHub):
   ```bash
   npx supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="Seeds Tasks <tasks@yourorg.org>" APP_URL=<site>
   ```
3. In the app: **Admin console → Email & automation → Connect email delivery**, then
   **Send test email to me**.

## 7. Keep it updated (optional automation)

To have database migrations and functions deploy automatically when `supabase/` changes on
`main`, add these **repository secrets**: `SUPABASE_ACCESS_TOKEN` (from
<https://supabase.com/dashboard/account/tokens>), `SUPABASE_PROJECT_REF` and
`SUPABASE_DB_PASSWORD`. Otherwise run `npx supabase db push` and `npx supabase functions deploy`
yourself after pulling updates.

To pull improvements from the original project: **Sync fork** on GitHub.

## Good to know

- **Supabase free tier**: 500 MB database, 1 GB file storage, and projects pause after 7 days with
  no activity (any sign-in wakes it; daily use keeps it awake).
- **Backups**: the free tier has no point-in-time restore. Occasionally run
  `npx supabase db dump --linked -f backup.sql` and keep the file somewhere safe.
- **Removing someone**: deactivate them in the Admin console. They lose access immediately, and
  their work stays.
