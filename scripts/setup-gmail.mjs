// One-time Gmail authorisation for the email sender account.
//
//   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... npm run setup:gmail
//
// Opens Google's consent screen; sign in as the sender (e.g. tasks@yourorg.org)
// and allow "Send email on your behalf". Prints the refresh token and the
// `supabase secrets set` command to store it. See docs/SELF_HOSTING.md, step 6.
import { createServer } from "node:http";
import { exec } from "node:child_process";

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (from your Google Cloud 'Desktop app' OAuth client).");
  process.exit(1);
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
    console.error("No refresh token returned:", tokens);
    return shutdown(1);
  }
  res.end("Done! Gmail sending is authorised. You can close this tab and return to the terminal.");

  console.log("\nAuthorised. Store these as Supabase function secrets (replace the sender address):\n");
  console.log(
    `npx supabase secrets set GMAIL_CLIENT_ID=${clientId} GMAIL_CLIENT_SECRET=${clientSecret} ` +
      `GMAIL_REFRESH_TOKEN=${tokens.refresh_token} EMAIL_FROM="Trellis <tasks@yourorg.org>"\n`,
  );
  console.log("EMAIL_FROM must be the account you just signed in with (or one of its Gmail 'Send mail as' aliases).");
  shutdown(0);
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
  }).toString();
  console.log("Opening Google sign-in. If the browser doesn't open, visit:\n\n" + auth + "\n");
  const opener = process.platform === "win32" ? `start "" "${auth}"` : process.platform === "darwin" ? `open "${auth}"` : `xdg-open "${auth}"`;
  exec(opener);
});
