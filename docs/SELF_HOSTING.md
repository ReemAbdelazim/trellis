# Self-hosting Seeds Tasks

This sets up your own copy on free tiers:
- **GitHub Pages**: the website
- **Supabase**: database, sign-in, server functions and scheduled jobs
- **Gmail**: every email (Google Workspace account)
- **Cloudflare R2**: attachments (optional)

Allow about an hour, once. After that your team signs in with Google, Microsoft or email +
password, plus an authenticator app.

Throughout this guide:

- `<ref>` is your Supabase project ref (the `abcd1234` in `https://abcd1234.supabase.co`)
- `<site>` is your site's address, e.g. `https://your-org.github.io/seeds-tasks`

You'll need [Node.js 22+](https://nodejs.org) and Git for a few commands.

---

## 1. Fork and clone

Fork this repository on GitHub (keep it **public**; free GitHub Pages requires that), then:

```bash
git clone https://github.com/<you>/<repo>.git
cd <repo>
npm install
```

## 2. Supabase project

1. Sign up at <https://supabase.com> and create a **New project**. Pick a region near your team and
   save the database password in your password manager.
2. Push the database and server functions:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   npx supabase functions deploy
   ```
3. **Your organization's settings.** In Supabase → **SQL Editor**, run this with your own values:
   ```sql
   update public.org_settings
   set name = 'Your Organization', allowed_domains = array['yourorg.org'], timezone = 'America/Toronto'
   where id = 1;
   ```
   Do this **before** anyone signs in. The first person to sign in with an allowed domain becomes
   admin.
4. **Authentication → Sign In / Providers → Email**: keep it **enabled**, with **Confirm email**
   on. Set the minimum password length to **10** and require **letters and digits**.
5. **Authentication → Multi-Factor**: enable **TOTP (App Authenticator)**. Every account must use
   it; the database refuses data to sessions without it.
6. **Authentication → URL Configuration**: set **Site URL** to `<site>` and add `<site>/**` to
   **Redirect URLs**.
7. **Project Settings → API Keys**: note the **Project URL** and the **publishable** key. Both are
   public and safe to put in GitHub.

## 3. Google sign-in

1. <https://console.cloud.google.com> → create a project (e.g. "Seeds Tasks sign-in").
2. **APIs & Services → OAuth consent screen**: user type **External**, so invited guests with
   personal Gmail can sign in. Scopes: `openid`, `email`, `profile`. **Publish** the app; these
   scopes need no Google review.
3. **Credentials → Create credentials → OAuth client ID → Web application**, with authorized
   redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
4. Supabase → **Authentication → Providers → Google**: enable it, then paste the client ID and secret.

## 4. Microsoft sign-in (optional)

1. <https://entra.microsoft.com> → **App registrations → New registration**. Supported accounts:
   **any organizational directory and personal Microsoft accounts**. Redirect URI (Web):
   `https://<ref>.supabase.co/auth/v1/callback`.
2. **Certificates & secrets → New client secret** (up to 24 months). Copy the **Value**, and set a
   reminder to renew it before it expires.
3. **Token configuration → Add optional claim → ID token**: tick `email` and `xms_edov`. This
   lets Supabase confirm the email is verified.
4. Supabase → **Authentication → Providers → Azure**: enable it, then paste the Application
   (client) ID and secret. Set the Azure Tenant URL to `https://login.microsoftonline.com/common`.

## 5. Email through Gmail

All email goes out from one Google Workspace account, e.g. `tasks@yourorg.org`, through the Gmail
API, at about 2,000 emails a day. That covers @mention emails, morning digests, invitations,
password resets and email confirmations.

1. **Google Cloud project for sending.** <https://console.cloud.google.com> → create a project (e.g.
   "Seeds Tasks mailer") *in your Workspace organization*.
   - **APIs & Services → Library**: enable the **Gmail API**.
   - **OAuth consent screen**: user type **Internal**, so the authorization never expires.
   - **Credentials → Create credentials → OAuth client ID → Desktop app.**
2. **Authorize the sender** by signing in as the sending account when the browser opens:
   ```bash
   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run setup:gmail
   ```
   It prints a `npx supabase secrets set ...` command. Set `EMAIL_FROM` to that account (e.g.
   `"Seeds Tasks <tasks@yourorg.org>"`), add `APP_URL=<site>`, and run the command. These secrets
   live only in Supabase, never in GitHub.
3. **Account emails (password reset, confirm email).** In Supabase → **Authentication → Hooks →
   Send Email**, choose **HTTPS**, set the URL to `https://<ref>.supabase.co/functions/v1/auth-email`,
   and **Generate secret**. Store that secret for the function:
   ```bash
   npx supabase secrets set SEND_EMAIL_HOOK_SECRET="v1,whsec_..."
   ```
4. **Notifications.** After your first sign-in (step 8): **Admin console → Email & automation →
   Connect email delivery**, then **Send test email to me**.

To change the sender later (e.g. from your own address to `tasks@yourorg.org`), run
`npm run setup:gmail` again as the new account and update `GMAIL_REFRESH_TOKEN` and `EMAIL_FROM`.

## 6. Attachments on Cloudflare R2 (optional, recommended)

Supabase's free plan stores 1 GB of files; R2's free plan stores **10 GB** with free downloads. If
you skip this step, attachments use Supabase Storage.

1. <https://dash.cloudflare.com> → **R2** → create a bucket (e.g. `seeds-attachments`). Cloudflare
   asks for a payment method to enable R2, but the free tier isn't charged.
2. In the bucket's **Settings → CORS policy**, allow your site to upload and download:
   ```json
   [{ "AllowedOrigins": ["<site origin, e.g. https://your-org.github.io>"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```
3. **R2 → Manage API tokens → Create API token**: Object Read & Write, limited to this bucket.
4. Store the details for the `files` function:
   ```bash
   npx supabase secrets set R2_ACCOUNT_ID=... R2_BUCKET=seeds-attachments R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=...
   ```

## 7. Publish with GitHub Pages

1. In your fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_PUBLISHABLE_KEY`: the publishable key
   - `BASE_PATH`: only if you use a custom domain, set it to `/`
3. **Actions → Deploy to GitHub Pages → Run workflow**. It also runs on every push to `main`.

For a custom domain (e.g. `tasks.yourorg.org`): add it under **Settings → Pages**, set `BASE_PATH` to
`/`, re-run the workflow, and update the Supabase URL configuration (step 2.6) to the new address.

## 8. First sign-in

Open `<site>` and **sign in first** with your organization account. You'll set up your authenticator
app, and you're the admin. Then finish step 5.4.

People who lose their phone can be reset by an admin: **Admin console → People → ⋯ → Reset
two-factor**.

## 9. Keep it updated (optional automation)

To deploy database and function changes automatically when `supabase/` changes on `main`, add
these repository **secrets**:
- `SUPABASE_ACCESS_TOKEN` (from <https://supabase.com/dashboard/account/tokens>)
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`

Otherwise run `npx supabase db push` and `npx supabase functions deploy` after pulling updates. To
pull improvements from the original project, click **Sync fork** on GitHub.

## Good to know

- **Free-plan limits (Supabase):**
  - 500 MB of database. A load test with 500 people's worth of work used a small fraction of that.
  - About 200 people connected to live updates at once. Beyond that, the app refreshes every 30
    seconds instead.
  - Projects pause after 7 days with no sign-ins.
  - No automatic backups.

  When you outgrow it, upgrade to Supabase Pro or move to your own free server:
  [SELF_HOSTING_ORACLE.md](SELF_HOSTING_ORACLE.md).
- **Backups**: run `npx supabase db dump --linked -f backup.sql` regularly and keep the file safe.
- **Removing someone**: deactivate them in the Admin console. Access stops immediately and their work
  stays.
