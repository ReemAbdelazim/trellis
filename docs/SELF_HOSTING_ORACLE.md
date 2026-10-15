# Moving to your own server (Oracle Cloud Always Free)

Supabase is open source, so the same Trellis database, sign-in and functions can run on a server
you control. Oracle Cloud's **Always Free** plan includes a server with **4 CPU cores, 24 GB of
memory and 200 GB of disk**. That's more than Supabase's $25/month plan, at no cost. None of the
app's code changes.

**When to do this:** when you hit Supabase's free-plan limits (500 MB database, ~200 people
connected live at once, 5 GB/month data transfer), or you'd rather not depend on a hosted plan.

**The trade-off:** you're responsible for a server. This guide sets up automatic security updates,
nightly backups and an uptime check, but someone should glance at it monthly. If that's not
realistic, [Supabase Pro](https://supabase.com/pricing) is the low-effort alternative.

This guide follows Supabase's official self-hosting setup:
<https://supabase.com/docs/guides/self-hosting/docker>. If a step differs from it, trust the
official guide.

---

## 1. Create the server

1. Sign up at <https://www.oracle.com/cloud/free/>. Pick your **home region** carefully (it can't be
   changed later); choose the one nearest your team. Oracle asks for a card to verify identity;
   Always Free resources aren't charged.
2. **Compute → Instances → Create instance**:
   - Image: **Ubuntu 24.04**
   - Shape: **Ampere (VM.Standard.A1.Flex)**, **4 OCPUs, 24 GB memory**
   - Boot volume: **150 GB** (leaves room for snapshots within the 200 GB free pool)
   - Add your SSH public key
3. **Networking → the instance's subnet → Security list**: add ingress rules for TCP **80** and
   **443** from `0.0.0.0/0`.
4. DNS at your domain host: point `api.yourorg.org` (an A record) at the instance's public IP.

> Oracle may reclaim Always Free servers that sit **idle** (very low CPU, network *and* memory use for
> 7 days). Supabase's Postgres keeps memory use well above that threshold, so a running install isn't
> idle.

## 2. Install Supabase

SSH in (`ssh ubuntu@api.yourorg.org`), then:

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install docker.io docker-compose-v2 git unattended-upgrades caddy
sudo usermod -aG docker ubuntu && newgrp docker

git clone --depth 1 https://github.com/supabase/supabase
mkdir ~/seeds && cp -r supabase/docker/* ~/seeds/ && cp supabase/docker/.env.example ~/seeds/.env
cd ~/seeds
```

Edit `.env` following Supabase's guide: generate a new `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`,
`SERVICE_ROLE_KEY` and dashboard password, and set:

```
SITE_URL=https://your-org.github.io/trellis
ADDITIONAL_REDIRECT_URLS=https://your-org.github.io/trellis/**
API_EXTERNAL_URL=https://api.yourorg.org
SUPABASE_PUBLIC_URL=https://api.yourorg.org
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=false
```

In `docker-compose.yml`, add these to the **auth** service's `environment` to match the hosted
settings (Google/Microsoft values are the same ones as in [SELF_HOSTING.md](SELF_HOSTING.md); the
redirect URI becomes `https://api.yourorg.org/auth/v1/callback`, so add it in Google Cloud and Entra
too):

```yaml
GOTRUE_PASSWORD_MIN_LENGTH: 10
GOTRUE_PASSWORD_REQUIRED_CHARACTERS: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789"
GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true"
GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true"
GOTRUE_EXTERNAL_GOOGLE_ENABLED: "true"
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_SECRET}
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: https://api.yourorg.org/auth/v1/callback
GOTRUE_EXTERNAL_AZURE_ENABLED: "true"
GOTRUE_EXTERNAL_AZURE_CLIENT_ID: ${AZURE_CLIENT_ID}
GOTRUE_EXTERNAL_AZURE_SECRET: ${AZURE_SECRET}
GOTRUE_EXTERNAL_AZURE_URL: https://login.microsoftonline.com/common
GOTRUE_EXTERNAL_AZURE_REDIRECT_URI: https://api.yourorg.org/auth/v1/callback
GOTRUE_HOOK_SEND_EMAIL_ENABLED: "true"
GOTRUE_HOOK_SEND_EMAIL_URI: http://functions:9000/auth-email
GOTRUE_HOOK_SEND_EMAIL_SECRETS: ${SEND_EMAIL_HOOK_SECRET}
```

Put the referenced values (`GOOGLE_CLIENT_ID`, …, `SEND_EMAIL_HOOK_SECRET`) in `.env`.

Copy this repository's functions into the stack and give them their secrets (same values as
[SELF_HOSTING.md](SELF_HOSTING.md) steps 5–6, plus `SEND_EMAIL_HOOK_SECRET`) in the **functions**
service's environment:

```bash
cp -r <repo>/supabase/functions/* ~/seeds/volumes/functions/
```

Start everything and put HTTPS in front with Caddy (automatic certificates):

```bash
docker compose up -d
echo 'api.yourorg.org {
  reverse_proxy localhost:8000
}' | sudo tee /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 3. Move your data

From your computer, with the Supabase CLI linked to the hosted project:

```bash
npx supabase db dump --linked --role-only -f roles.sql
npx supabase db dump --linked -f schema.sql
npx supabase db dump --linked --data-only --use-copy -f data.sql
```

Restore into the new server (Postgres is exposed only on the server itself, so run this there after
copying the files over with `scp`):

```bash
docker exec -i supabase-db psql -U postgres -f - < roles.sql
docker exec -i supabase-db psql -U postgres -f - < schema.sql
docker exec -i supabase-db psql -U postgres -f - < data.sql
```

Then in the new **Studio** (`https://api.yourorg.org`, dashboard login from `.env`), check the tables
have data and that the cron jobs exist (`select * from cron.job;`). Attachments on **R2** don't move
at all. Files in Supabase Storage need copying with `npx supabase storage cp`.

## 4. Point the site at the new server

In GitHub → **Settings → Secrets and variables → Actions → Variables**, set `SUPABASE_URL` to
`https://api.yourorg.org` and `SUPABASE_PUBLISHABLE_KEY` to the new `ANON_KEY`. Re-run **Deploy to
GitHub Pages**. Then, in the app's **Admin console → Email & automation**, click **Reconnect email
delivery**. Everyone signs in again once; their authenticator apps keep working.

## 5. Keep it healthy

```bash
# Automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades

# Nightly database backup at 03:00, keeping 14 days
mkdir -p ~/backups
( crontab -l 2>/dev/null; echo '0 3 * * * docker exec supabase-db pg_dumpall -U postgres | gzip > ~/backups/seeds-$(date +\%F).sql.gz && find ~/backups -name "*.sql.gz" -mtime +14 -delete' ) | crontab -
```

- **Copy backups off the server** too, e.g. with `rclone` to your R2 bucket or Google Drive.
- **Uptime check:** free monitoring at <https://uptimerobot.com> on `https://api.yourorg.org/auth/v1/health`.
- **Monthly:** `cd ~/seeds && docker compose pull && docker compose up -d` for Supabase updates.
- **Restore test:** once a quarter, restore a backup into a scratch database to make sure backups work.
