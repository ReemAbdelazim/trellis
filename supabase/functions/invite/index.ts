// POST /functions/v1/invite  { email, role?, projectId? }
// Creates an invitation as the caller (RLS decides whether they may) and emails it.
// If the person already has an account, they're simply added to the project.
import { HttpError, json, readJson, serve } from "../_shared/http.ts";
import { requireCaller } from "../_shared/supabase.ts";
import { appUrl, emailLayout, escapeHtml, sendEmail } from "../_shared/email.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ["admin", "member", "guest"] as const;
type Role = (typeof ROLES)[number];

serve(async (req) => {
  const caller = await requireCaller(req);
  const body = await readJson<{ email?: unknown; role?: unknown; projectId?: unknown }>(req);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address");
  const role: Role = ROLES.includes(body.role as Role) ? (body.role as Role) : "guest";
  const projectId = typeof body.projectId === "string" && UUID_RE.test(body.projectId) ? body.projectId : null;
  if (role !== "guest" && caller.role !== "admin") throw new HttpError(403, "Only admins can invite members or admins");

  const { db } = caller;
  let projectName: string | null = null;
  if (projectId) {
    const { data: project } = await db.from("projects").select("name").eq("id", projectId).maybeSingle();
    if (!project) throw new HttpError(404, "Project not found");
    projectName = project.name;
  }

  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    if (!projectId) throw new HttpError(409, "That person already has an account");
    const { error } = await db
      .from("project_members")
      .upsert({ project_id: projectId, user_id: existing.id, role: "editor" }, { onConflict: "project_id,user_id", ignoreDuplicates: true });
    if (error) throw new HttpError(403, "You don't have permission to add people to that project");
  } else {
    // Replace any earlier open invite from this caller so the latest details win.
    await db.from("invitations").delete().eq("email", email).is("accepted_at", null);
    const { error } = await db.from("invitations").insert({ email, role, project_id: projectId, invited_by: caller.id });
    if (error) {
      throw new HttpError(
        /row-level security|duplicate key/i.test(error.message) ? 403 : 400,
        /duplicate key/i.test(error.message)
          ? "Someone else has already invited that person"
          : "You don't have permission to send that invitation",
      );
    }
  }

  const inviter = caller.fullName || "A teammate";
  const where = projectName ? ` to the project <b>${escapeHtml(projectName)}</b>` : " to Seeds Tasks";
  const emailed = await sendEmail({
    to: email,
    subject: `${inviter} invited you${projectName ? ` to ${projectName}` : ""} on Seeds Tasks`,
    html: emailLayout(
      "You're invited",
      `<p>${escapeHtml(inviter)} invited you${where}.</p><p>Sign in with Google or Microsoft using <b>${escapeHtml(email)}</b>.</p>`,
      { label: "Open Seeds Tasks", url: appUrl("/login") },
    ),
    text: `${inviter} invited you${projectName ? ` to ${projectName}` : ""} on Seeds Tasks. Sign in with Google or Microsoft using ${email}: ${appUrl("/login")}`,
  });

  return json({ ok: true, emailed });
});
