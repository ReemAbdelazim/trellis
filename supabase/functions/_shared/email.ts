// Sends email through the Gmail API as one Google Workspace account (e.g.
// tasks@yourorg.org), authorised once with `npm run setup:gmail`. Workspace
// accounts can send about 2,000 emails a day. Everything else in the app keeps
// working without email; sends simply report `false`.

const CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET");
const REFRESH_TOKEN = Deno.env.get("GMAIL_REFRESH_TOKEN");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
// Overridable so tests can point at a mock.
const TOKEN_URL = Deno.env.get("GOOGLE_TOKEN_URL") ?? "https://oauth2.googleapis.com/token";
const SEND_URL = Deno.env.get("GMAIL_SEND_URL") ?? "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export function emailEnabled() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN && EMAIL_FROM && APP_URL);
}

export function appUrl(path = "") {
  return `${APP_URL}${path}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      refresh_token: REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const noNewlines = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
/** RFC 2047 encoded-word, so subjects and names can contain any character. */
const encodeHeader = (s: string) => `=?UTF-8?B?${base64(utf8(noNewlines(s)))}?=`;
const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");

function fromHeader(from: string) {
  const m = /^(.*)<([^>]+)>\s*$/.exec(from);
  return m ? `${encodeHeader(m[1].trim())} <${noNewlines(m[2])}>` : noNewlines(from);
}

function mimeMessage(input: { to: string; subject: string; html: string; text: string }) {
  const boundary = `seeds-${crypto.randomUUID()}`;
  return [
    `From: ${fromHeader(EMAIL_FROM!)}`,
    `To: ${noNewlines(input.to)}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(base64(utf8(input.text))),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(base64(utf8(input.html))),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Sends one email. Returns false (never throws) so callers can retry later. */
export async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  if (!emailEnabled()) return false;
  try {
    const raw = base64(utf8(mimeMessage(input))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("Gmail send failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email could not be sent", err);
    return false;
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal, client-safe email layout. `body` must already be escaped HTML. */
export function emailLayout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f7f8f6;font-family:Arial,Helvetica,sans-serif;color:#1e2420">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e1e5de;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 28px 8px"><div style="font-size:13px;font-weight:bold;color:#2f7d4f">Seeds Tasks</div>
<h1 style="font-size:18px;margin:12px 0 0">${escapeHtml(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 24px;font-size:14px;line-height:1.55">${body}
${cta ? `<p style="margin:24px 0 0"><a href="${escapeHtml(cta.url)}" style="background:#2f7d4f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;display:inline-block">${escapeHtml(cta.label)}</a></p>` : ""}
</td></tr></table>
<p style="font-size:11px;color:#8a948c;margin-top:16px">Change email preferences in Seeds Tasks → Profile &amp; notifications.</p>
</td></tr></table></body></html>`;
}
