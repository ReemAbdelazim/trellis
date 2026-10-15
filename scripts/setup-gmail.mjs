// One-time Gmail authorisation for the email sender account.
//
//   npm run setup:gmail -- <client_secret.json> --from "Trellis <tasks@yourorg.org>" [--app-url <site>]
//
// <client_secret.json> is the file downloaded for your Google Cloud "Desktop app"
// OAuth client. Opens Google's consent screen: sign in as the sender and allow
// "Send email on your behalf". The client, refresh token and sender are then
// stored as Supabase function secrets on the linked project (never printed).
// See docs/SELF_HOSTING.md, step 5.
import { createServer } from "node:http";
import { exec, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { from: { type: "string" }, "app-url": { type: "string" }, "project-ref": { type: "string" } },
});
const usage = 'Usage: npm run setup:gmail -- <client_secret.json> --from "Trellis <tasks@yourorg.org>" [--app-url <site>]';
if (!positionals[0] || !opts.from) {
  console.error(usage);
  process.exit(1);
}
const file = JSON.parse(readFileSync(positionals[0], "utf8"));
const { client_id: clientId, client_secret: clientSecret } = file.installed ?? file.web ?? {};
if (!clientId || !clientSecret) {
  console.error("That file has no OAuth client. Download the JSON of a 'Desktop app' client from Google Cloud.");
  process.exit(1);
}
const sender = /<([^>]+)>/.exec(opts.from)?.[1] ?? opts.from;

/** Stores secrets via the Supabase CLI using a temporary env file, so values never reach argv or the screen. */
function storeSecrets(secrets) {
  const dir = mkdtempSync(join(tmpdir(), "trellis-"));
  const envFile = join(dir, "secrets.env");
  try {
    writeFileSync(envFile, Object.entries(secrets).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n"), { mode: 0o600 });
    const ref = opts["project-ref"] ? ` --project-ref ${opts["project-ref"]}` : "";
    return spawnSync(`npx supabase secrets set --env-file "${envFile}"${ref}`, { shell: true, stdio: "inherit" }).status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (!code && !error) return res.end();

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  if (error) {
    res.end(`Authorisation failed: ${error}. You can close this tab.`);
    console.error(`Authorisation failed: ${error}`);
    return shutdown(1);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.refresh_token) {
    res.end("Google didn't return a refresh token. Check the terminal.");
    console.error(`No refresh token returned: ${tokens.error ?? "unknown error"}`);
    return shutdown(1);
  }
  res.end("Done! Gmail sending is authorised. You can close this tab and return to the terminal.");

  console.log(`\nAuthorised. Storing the Gmail secrets in Supabase (sender: ${opts.from})…`);
  const ok = storeSecrets({
    GMAIL_CLIENT_ID: clientId,
    GMAIL_CLIENT_SECRET: clientSecret,
    GMAIL_REFRESH_TOKEN: tokens.refresh_token,
    EMAIL_FROM: opts.from,
    ...(opts["app-url"] ? { APP_URL: opts["app-url"] } : {}),
  });
  console.log(ok ? "Done. Email sending is configured." : "Storing the secrets failed; run `npx supabase link` first, then try again.");
  shutdown(ok ? 0 : 1);
});

function redirectUri() {
  return `http://127.0.0.1:${server.address().port}`;
}

function shutdown(code) {
  server.close();
  setTimeout(() => process.exit(code), 100);
}

server.listen(0, "127.0.0.1", () => {
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent",
    login_hint: sender,
  }).toString();
  console.log(`Opening Google sign-in. Sign in as ${sender}. If the browser doesn't open, visit:\n\n${auth}\n`);
  const opener = process.platform === "win32" ? `start "" "${auth}"` : process.platform === "darwin" ? `open "${auth}"` : `xdg-open "${auth}"`;
  exec(opener);
});
