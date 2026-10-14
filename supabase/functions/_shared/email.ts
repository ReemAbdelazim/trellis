// Email via Resend's HTTP API (RESEND_API_URL overrides the endpoint for local testing).
// Everything still works without it, minus emails.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM");
const APP_URL = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");

export function emailEnabled() {
  return Boolean(RESEND_API_KEY && EMAIL_FROM && APP_URL);
}

export function appUrl(path = "") {
  return `${APP_URL}${path}`;
}

export async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  if (!emailEnabled()) return false;
  let res: Response;
  try {
    res = await fetch(Deno.env.get("RESEND_API_URL") ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: input.to, subject: input.subject, html: input.html, text: input.text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    // Provider unreachable: report "not sent" so callers can retry instead of failing the request.
    console.error("Email provider unreachable", err);
    return false;
  }
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return false;
  }
  return true;
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
