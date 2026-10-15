// POST /functions/v1/admin  { action, ... }  — admin-only operations that need
// the service role. Every action first verifies the caller is an active admin.
import { HttpError, json, readJson, serve } from "../_shared/http.ts";
import { requireAdmin, serviceClient, SUPABASE_URL } from "../_shared/supabase.ts";
import { appUrl, emailEnabled, emailLayout, escapeHtml, sendEmail } from "../_shared/email.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body =
  | { action: "remove-user"; userId: string }
  | { action: "reset-mfa"; userId: string }
  | { action: "email-status" }
  | { action: "connect-email" }
  | { action: "test-email" }
  | { action: "resend-invite"; invitationId: string };

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const caller = await requireAdmin(req);
  const body = await readJson<Body>(req);
  const svc = serviceClient();

  switch (body.action) {
    case "remove-user": {
      if (typeof body.userId !== "string" || !UUID_RE.test(body.userId)) throw new HttpError(400, "Invalid user");
      if (body.userId === caller.id) throw new HttpError(400, "You can't remove your own account");
      const { data: target } = await svc.from("profiles").select("role, status").eq("id", body.userId).maybeSingle();
      if (!target) throw new HttpError(404, "User not found");
      if (target.role === "admin" && target.status === "active") {
        const { count } = await svc
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("status", "active")
          .neq("id", body.userId);
        if (!count) throw new HttpError(400, "The workspace must keep at least one active admin");
      }
      const { error } = await svc.auth.admin.deleteUser(body.userId);
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true });
    }

    case "reset-mfa": {
      // For someone who lost their authenticator: they set up a new one at next sign-in.
      if (typeof body.userId !== "string" || !UUID_RE.test(body.userId)) throw new HttpError(400, "Invalid user");
      if (body.userId === caller.id) throw new HttpError(400, "Reset your own authenticator in Settings");
      const { data, error } = await svc.auth.admin.mfa.listFactors({ userId: body.userId });
      if (error) throw new HttpError(500, error.message);
      for (const factor of data.factors) {
        const { error: delError } = await svc.auth.admin.mfa.deleteFactor({ userId: body.userId, id: factor.id });
        if (delError) throw new HttpError(500, delError.message);
      }
      // End their sessions so the reset takes effect immediately.
      await svc.auth.admin.signOut(body.userId).catch(() => undefined);
      return json({ ok: true, removed: data.factors.length });
    }

    case "email-status": {
      const { data } = await svc.rpc("notification_delivery_status");
      const status = (data ?? {}) as { connected?: boolean; connected_at?: string };
      return json({
        ok: true,
        emailConfigured: emailEnabled(),
        deliveryConnected: !!status.connected,
        connectedAt: status.connected_at ?? null,
        appUrl: appUrl() || null,
      });
    }

    case "connect-email": {
      if (!emailEnabled()) throw new HttpError(400, "Set the Gmail and APP_URL function secrets first (see docs/SELF_HOSTING.md)");
      const url = `${SUPABASE_URL}/functions/v1/notifications`;
      const { error } = await svc.rpc("configure_notifications", { p_url: url, p_secret: randomSecret() });
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true });
    }

    case "test-email": {
      const sent = await sendEmail({
        to: caller.email,
        subject: "Seeds Tasks test email",
        html: emailLayout("Email is working", "<p>Notification emails from Seeds Tasks will look like this.</p>", {
          label: "Open Seeds Tasks",
          url: appUrl("/home"),
        }),
        text: `Email is working. ${appUrl("/home")}`,
      });
      if (!sent) throw new HttpError(400, "The email could not be sent. Check the Gmail function secrets.");
      return json({ ok: true });
    }

    case "resend-invite": {
      if (typeof body.invitationId !== "string" || !UUID_RE.test(body.invitationId)) throw new HttpError(400, "Invalid invitation");
      const { data: inv } = await caller.db
        .from("invitations")
        .select("email, accepted_at, project_id, projects(name)")
        .eq("id", body.invitationId)
        .maybeSingle();
      if (!inv || inv.accepted_at) throw new HttpError(404, "Invitation not found");
      const projectName = (inv.projects as { name?: string } | null)?.name ?? null;
      const sent = await sendEmail({
        to: inv.email,
        subject: `Reminder: you're invited to Seeds Tasks`,
        html: emailLayout(
          "You're invited",
          `<p>${escapeHtml(caller.fullName || "A teammate")} invited you${projectName ? ` to <b>${escapeHtml(projectName)}</b>` : ""} on Seeds Tasks.</p>
<p>Sign in with Google or Microsoft using <b>${escapeHtml(inv.email)}</b>.</p>`,
          { label: "Open Seeds Tasks", url: appUrl("/login") },
        ),
        text: `You're invited to Seeds Tasks. Sign in with Google or Microsoft using ${inv.email}: ${appUrl("/login")}`,
      });
      if (!sent) throw new HttpError(400, "Email isn't set up, or sending failed");
      return json({ ok: true });
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
});
