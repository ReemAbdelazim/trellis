// Supabase Auth "Send Email" hook: account emails (confirm address, reset
// password) go out through the same Gmail sender as notifications, instead of
// Supabase's built-in mailer (which is limited to a few emails an hour).
// Configure in Supabase → Authentication → Hooks → Send Email (see docs/SELF_HOSTING.md).
import { Webhook } from "npm:standardwebhooks@1.0.0";
import { appUrl, emailLayout, escapeHtml, sendEmail } from "../_shared/email.ts";

const HOOK_SECRET = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace(/^v1,whsec_/, "");

interface HookPayload {
  user: { email: string; new_email?: string };
  email_data: {
    token: string;
    token_hash: string;
    token_hash_new: string;
    redirect_to: string;
    email_action_type: "signup" | "recovery" | "invite" | "magiclink" | "email_change" | "reauthentication" | string;
  };
}

const COPY: Record<string, { subject: string; title: string; intro: string; cta: string }> = {
  signup: {
    subject: "Confirm your email for Seeds Tasks",
    title: "Confirm your email",
    intro: "Confirm this address to finish creating your Seeds Tasks account.",
    cta: "Confirm email",
  },
  recovery: {
    subject: "Reset your Seeds Tasks password",
    title: "Reset your password",
    intro: "Someone asked to reset the password for this account. If it was you, choose a new password below. If not, you can ignore this email.",
    cta: "Choose a new password",
  },
  email_change: {
    subject: "Confirm your new email for Seeds Tasks",
    title: "Confirm your new email",
    intro: "Confirm this address to finish changing the email on your Seeds Tasks account.",
    cta: "Confirm email",
  },
  magiclink: {
    subject: "Your Seeds Tasks sign-in link",
    title: "Sign in to Seeds Tasks",
    intro: "Use the button below to sign in. The link works once and expires soon.",
    cta: "Sign in",
  },
  invite: {
    subject: "You're invited to Seeds Tasks",
    title: "You're invited",
    intro: "You've been invited to Seeds Tasks. Use the button below to set up your account.",
    cta: "Accept invitation",
  },
};

/**
 * Links go straight to the app's /auth/callback with a one-time token hash, which
 * it verifies itself, so they work in any browser (Supabase has already checked
 * redirect_to against the allowed redirect URLs).
 */
function verifyLink(tokenHash: string, type: string, redirectTo: string) {
  const url = new URL(redirectTo || appUrl("/auth/callback/"));
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

async function send(to: string, type: string, link: string) {
  const copy = COPY[type] ?? COPY.magiclink;
  const ok = await sendEmail({
    to,
    subject: copy.subject,
    html: emailLayout(
      copy.title,
      `<p>${escapeHtml(copy.intro)}</p><p style="color:#5f6a62;font-size:12px">The link expires in one hour.</p>`,
      { label: copy.cta, url: link },
    ),
    text: `${copy.title}\n\n${copy.intro}\n\n${link}\n\nThe link expires in one hour.`,
  });
  if (!ok) throw new Error("Email could not be sent");
}

function failure(status: number, message: string) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return failure(405, "Method not allowed");
  if (!HOOK_SECRET) return failure(500, "SEND_EMAIL_HOOK_SECRET is not set");

  const payload = await req.text();
  let data: HookPayload;
  try {
    data = new Webhook(HOOK_SECRET).verify(payload, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return failure(401, "Invalid signature");
  }

  const { user, email_data: e } = data;
  try {
    if (e.email_action_type === "reauthentication") {
      const ok = await sendEmail({
        to: user.email,
        subject: "Your Seeds Tasks confirmation code",
        html: emailLayout("Confirmation code", `<p>Your code is <b style="font-size:20px;letter-spacing:2px">${escapeHtml(e.token)}</b></p>`),
        text: `Your Seeds Tasks confirmation code is ${e.token}`,
      });
      if (!ok) throw new Error("Email could not be sent");
    } else if (e.email_action_type === "email_change" && user.new_email) {
      // Secure email change confirms both the current and the new address.
      if (e.token_hash_new) await send(user.email, "email_change", verifyLink(e.token_hash_new, "email_change", e.redirect_to));
      if (e.token_hash) await send(user.new_email, "email_change", verifyLink(e.token_hash, "email_change", e.redirect_to));
    } else {
      await send(user.email, e.email_action_type, verifyLink(e.token_hash, e.email_action_type, e.redirect_to));
    }
  } catch (err) {
    console.error(err);
    return failure(500, "Email could not be sent. Please try again in a few minutes.");
  }
  return new Response("{}", { headers: { "Content-Type": "application/json" } });
});
