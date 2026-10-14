// Integration tests for the database security model and business logic.
// Runs against the LOCAL Supabase stack:  npm run test:db
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = env.SUPABASE_SECRET_KEY;
if (!URL_.includes("127.0.0.1") && !URL_.includes("localhost")) throw new Error("Refusing to run against a non-local database");

const admin = createClient(URL_, SECRET, { auth: { persistSession: false } });
const run = Date.now().toString(36);
const PASSWORD = "test-password-123";
let failures = 0;
let passes = 0;

function check(name, cond, extra) {
  if (cond) {
    passes++;
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}

async function makeUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  });
  return { user: data?.user, error };
}

async function as(email) {
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return c;
}

const uid = async (c) => (await c.auth.getUser()).data.user.id;

console.log("\nSign-up gate");
// Ensure an admin exists first so ordering of test users is deterministic.
const { count: adminCount } = await admin.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin");
const A = `admin-${run}@seedsofleadership.ca`;
const M1 = `m1-${run}@seedsofleadership.ca`;
const M2 = `m2-${run}@SeedsOfLeadership.ca`;
const G = `guest-${run}@partner.org`;
const X = `outsider-${run}@gmail.com`;

const a = await makeUser(A);
check("seeds-domain user can sign up", !a.error, a.error?.message);
if (!adminCount) {
  const { data } = await admin.from("profiles").select("role").eq("id", a.user.id).single();
  check("first seeds user becomes admin", data?.role === "admin");
} else {
  await admin.from("profiles").update({ role: "admin" }).eq("id", a.user.id);
}
const m1 = await makeUser(M1);
const m2 = await makeUser(M2);
check("domain match is case-insensitive", !m2.error, m2.error?.message);
const { data: m1p } = await admin.from("profiles").select("role").eq("id", m1.user.id).single();
check("later seeds user is a member", m1p?.role === "member");

const x = await makeUser(X);
check("outsider without invite is rejected", !!x.error);

const ca = await as(A);
const cm1 = await as(M1);
const cm2 = await as(M2.toLowerCase());

const { error: invErr } = await cm1.from("invitations").insert({ email: G, role: "guest", invited_by: await uid(cm1) });
check("member can invite a guest", !invErr, invErr?.message);
const { error: invAdminErr } = await cm1.from("invitations").insert({ email: `x${run}@partner.org`, role: "admin", invited_by: await uid(cm1) });
check("member cannot invite an admin", !!invAdminErr);
const g = await makeUser(G);
check("invited guest can sign up", !g.error, g.error?.message);
const { data: gp } = await admin.from("profiles").select("role").eq("id", g.user.id).single();
check("invited outsider gets guest role", gp?.role === "guest");
const cg = await as(G);

console.log("\nRoles & admin guard");
const { error: selfPromote } = await cm1.from("profiles").update({ role: "admin" }).eq("id", m1.user.id);
check("member cannot promote themselves", !!selfPromote);
const { error: nameChange } = await cm1.from("profiles").update({ full_name: "Member One" }).eq("id", m1.user.id);
check("member can edit own name", !nameChange, nameChange?.message);
const { data: otherEdit } = await cm1.from("profiles").update({ full_name: "Hacked" }).eq("id", m2.user.id).select();
check("member cannot edit another profile", !otherEdit?.length);
const { error: promote } = await ca.from("profiles").update({ role: "admin" }).eq("id", m2.user.id);
check("admin can promote a member", !promote, promote?.message);
await ca.from("profiles").update({ role: "member" }).eq("id", m2.user.id);

const { data: guestSeesPeople } = await cg.from("profiles").select("id");
check("guest sees only people they share projects with (just self now)", guestSeesPeople?.length === 1, guestSeesPeople?.length);

console.log("\nProjects & privacy");
const { data: pub, error: pubErr } = await cm1
  .from("projects")
  .insert({ name: `Public ${run}`, privacy: "public", created_by: await uid(cm1) })
  .select()
  .single();
check("member creates a public project", !pubErr, pubErr?.message);
const { data: secs } = await cm1.from("sections").select("*").eq("project_id", pub.id).order("position");
check("default sections created", secs?.length === 3);
const { data: pm } = await cm1.from("project_members").select("*").eq("project_id", pub.id);
check("creator is project owner", pm?.[0]?.role === "owner");

const { data: priv } = await cm1
  .from("projects")
  .insert({ name: `Private ${run}`, privacy: "private", created_by: await uid(cm1) })
  .select()
  .single();
check("private project insert returns row", !!priv);
const { data: m2sees } = await cm2.from("projects").select("id").in("id", [pub.id, priv.id]);
check("other member sees public but not private", m2sees?.length === 1 && m2sees[0].id === pub.id);
const { data: adminSees } = await ca.from("projects").select("id").in("id", [pub.id, priv.id]);
check("admin sees both", adminSees?.length === 2);
const { data: gSees } = await cg.from("projects").select("id").in("id", [pub.id, priv.id]);
check("guest sees neither", gSees?.length === 0);
const { error: guestCreate } = await cg.from("projects").insert({ name: "nope", created_by: await uid(cg) });
check("guest cannot create projects", !!guestCreate);

const { data: m2priv } = await cm2.from("projects").update({ privacy: "public" }).eq("id", priv.id).select();
check("non-member cannot change private project", !m2priv?.length);
const { error: editorPrivacy } = await cm2.from("projects").update({ privacy: "private" }).eq("id", pub.id);
check("editor cannot change privacy", !!editorPrivacy);

const { data: team } = await cm1.from("teams").insert({ name: `Team ${run}` }).select().single();
const { data: teamProj } = await cm1
  .from("projects")
  .insert({ name: `Team proj ${run}`, privacy: "team", team_id: team.id, created_by: await uid(cm1) })
  .select()
  .single();
const { data: m2team } = await cm2.from("projects").select("id").eq("id", teamProj.id);
check("non-team member cannot see team project", m2team?.length === 0);
await cm1.from("teams").delete().eq("id", team.id);
const { data: m2orphan } = await cm2.from("projects").select("id").eq("id", teamProj.id);
check("deleting the team does not expose its projects", m2orphan?.length === 0);
const { data: m1orphan } = await cm1.from("projects").select("id").eq("id", teamProj.id);
check("…owner still sees it", m1orphan?.length === 1);

console.log("\nTasks");
const t1 = crypto.randomUUID();
const { error: tErr } = await cm1.from("tasks").insert({ id: t1, project_id: priv.id, name: "Secret task", created_by: await uid(cm1) });
check("owner creates task", !tErr, tErr?.message);
const { data: t1row } = await cm1.from("tasks").select("*").eq("id", t1).single();
check("task defaults to first section", t1row.section_id === secs ? true : !!t1row.section_id);
check("new tasks get small positions (room for fractional reordering)", t1row.position > 0 && t1row.position < 1e7, t1row.position);

const { data: m2t } = await cm2.from("tasks").select("id").eq("id", t1);
check("non-member cannot see private task", m2t?.length === 0);

await cm1.from("tasks").update({ assignee_id: g.user.id }).eq("id", t1);
const { data: gt } = await cg.from("tasks").select("id, name").eq("id", t1);
check("guest sees task assigned to them", gt?.length === 1);
const { data: gproj } = await cg.from("projects").select("id").eq("id", priv.id);
check("…but still not the private project", gproj?.length === 0);
const { data: gUpd } = await cg.from("tasks").update({ completed: true }).eq("id", t1).select();
check("assignee guest can complete task", gUpd?.[0]?.completed === true && !!gUpd?.[0]?.completed_at);
const { data: notifs } = await cg.from("notifications").select("*").eq("task_id", t1);
check("assignment notification created for guest", notifs?.some((n) => n.type === "assigned"));
const { data: act } = await cm1.from("task_activity").select("kind").eq("task_id", t1);
check("activity log records created/assigned/completed", ["created", "assigned", "completed"].every((k) => act?.some((x) => x.kind === k)), act);

const sub = crypto.randomUUID();
const { error: subErr } = await cg.from("tasks").insert({ id: sub, parent_id: t1, name: "Guest subtask", created_by: await uid(cg) });
check("assignee can add subtask", !subErr, subErr?.message);
const { data: subRow } = await cm1.from("tasks").select("project_id, section_id").eq("id", sub).single();
check("subtask inherits project, no section", subRow?.project_id === priv.id && subRow?.section_id === null);

const { error: cErr } = await cm1.from("comments").insert({ task_id: t1, body: "Hi @guest", mentions: [g.user.id], author_id: await uid(cm1) });
check("comment with mention", !cErr, cErr?.message);
const { data: mentioned } = await cg.from("notifications").select("type").eq("task_id", t1).eq("type", "mentioned");
check("mention notification", mentioned?.length === 1);
const { error: m2Comment } = await cm2.from("comments").insert({ task_id: t1, body: "sneaky", author_id: await uid(cm2) });
check("non-viewer cannot comment", !!m2Comment);

// Moving a task into a project you cannot edit is blocked.
const t2 = crypto.randomUUID();
await cm2.from("tasks").insert({ id: t2, project_id: pub.id, name: "m2 task", created_by: await uid(cm2) });
const { error: moveErr } = await cm2.from("tasks").update({ project_id: priv.id }).eq("id", t2);
check("cannot move task into project without access", !!moveErr);

// Dependency cycles rejected.
const t3 = crypto.randomUUID();
await cm2.from("tasks").insert({ id: t3, project_id: pub.id, name: "m2 task 2", created_by: await uid(cm2) });
await cm2.from("task_dependencies").insert({ task_id: t2, depends_on_id: t3 });
const { error: cyc } = await cm2.from("task_dependencies").insert({ task_id: t3, depends_on_id: t2 });
check("dependency cycle rejected", !!cyc);

console.log("\nRules automation");
const done = secs.find((s) => s.name === "Done");
await cm1.from("rules").insert({
  project_id: pub.id,
  name: "Done means done",
  trigger_type: "section_changed",
  trigger_config: { section_id: done.id },
  actions: [{ type: "set_complete", value: true }],
  created_by: await uid(cm1),
});
await cm1.from("rules").insert({
  project_id: pub.id,
  name: "Completed goes to Done",
  trigger_type: "completed",
  trigger_config: {},
  actions: [{ type: "move_to_section", section_id: done.id }],
  created_by: await uid(cm1),
});
await cm2.from("tasks").update({ section_id: done.id }).eq("id", t2);
const { data: t2row } = await cm2.from("tasks").select("completed").eq("id", t2).single();
check("rule: moving to Done completes task", t2row?.completed === true);
await cm2.from("tasks").update({ completed: true }).eq("id", t3);
const { data: t3row } = await cm2.from("tasks").select("section_id").eq("id", t3).single();
check("rule: completing moves to Done (no infinite loop)", t3row?.section_id === done.id);
const { data: ruleAct } = await cm2.from("task_activity").select("data").eq("task_id", t3).eq("kind", "moved_section");
check("rule activity is attributed to the rule", ruleAct?.[0]?.data?.rule === "Completed goes to Done", ruleAct);

const { data: field } = await cm1
  .from("custom_fields")
  .insert({ project_id: pub.id, name: "Priority", type: "single_select", config: { options: [{ id: "hi", name: "High", color: "red" }] } })
  .select()
  .single();
await cm1.from("rules").insert({
  project_id: pub.id,
  name: "High priority to admin",
  trigger_type: "field_changed",
  trigger_config: { field_id: field.id, option_id: "hi" },
  actions: [{ type: "set_assignee", user_id: a.user.id }],
  created_by: await uid(cm1),
});
const t4 = crypto.randomUUID();
await cm2.from("tasks").insert({ id: t4, project_id: pub.id, name: "Prioritise me", created_by: await uid(cm2) });
const { error: fvErr } = await cm2.from("task_field_values").insert({ task_id: t4, field_id: field.id, value: "hi" });
check("set custom field value", !fvErr, fvErr?.message);
const { data: t4row } = await cm2.from("tasks").select("assignee_id").eq("id", t4).single();
check("rule: field change assigns task", t4row?.assignee_id === a.user.id);

console.log("\nTemplates");
const { data: copyId, error: dupErr } = await cm1.rpc("duplicate_project", { p_project: pub.id, p_name: `Copy ${run}`, p_include_tasks: true, p_as_template: false });
check("duplicate project", !dupErr, dupErr?.message);
const { data: copySecs } = await cm1.from("sections").select("id").eq("project_id", copyId);
const { data: copyTasks } = await cm1.from("tasks").select("id").eq("project_id", copyId);
const { data: copyRules } = await cm1.from("rules").select("trigger_config").eq("project_id", copyId);
check("copy has same sections (no defaults added)", copySecs?.length === 3, copySecs?.length);
check("copy has tasks", copyTasks?.length >= 3, copyTasks?.length);
check("copied rules point at new sections", copyRules?.every((r) => !r.trigger_config.section_id || copySecs.some((s) => s.id === r.trigger_config.section_id)));

console.log("\nSecurity regressions");
const m1id = await uid(cm1);
const m2id = await uid(cm2);

const { error: inviteIntoPrivate } = await cm2
  .from("invitations")
  .insert({ email: `sneak-${run}@evil.example`, role: "guest", project_id: priv.id, invited_by: m2id });
check("cannot invite outsiders into a project you can't edit", !!inviteIntoPrivate);

const { data: team2 } = await cm1.from("teams").insert({ name: `Team2 ${run}` }).select().single();
const { error: selfTeamAdmin } = await cm2.from("team_members").insert({ team_id: team2.id, user_id: m2id, is_admin: true });
check("joining a team can't grant team-admin", !!selfTeamAdmin);
const { error: plainJoin } = await cm2.from("team_members").insert({ team_id: team2.id, user_id: m2id });
check("…but members can still join normally", !plainJoin, plainJoin?.message);

const { data: spoofRule } = await cm2
  .from("rules")
  .insert({ project_id: pub.id, name: "spoof", trigger_type: "task_added", actions: [{ type: "add_comment", body: "hi" }], created_by: m1id })
  .select()
  .single();
check("rule author is always the person saving it", spoofRule?.created_by === m2id, spoofRule?.created_by);
await cm2.from("rules").delete().eq("id", spoofRule.id);

const { data: m1notes } = await cm1.from("notifications").select("id").limit(1);
const { error: retarget } = await cm1.from("notifications").update({ task_id: t1, read_at: null }).eq("id", m1notes?.[0]?.id ?? crypto.randomUUID());
check("notifications can't be re-pointed at other tasks", !!retarget);
const { error: markRead } = await cm1.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", m1notes?.[0]?.id ?? crypto.randomUUID());
check("…but can still be marked read", !markRead, markRead?.message);

const planted = crypto.randomUUID();
await cm2.from("tasks").insert({ id: planted, name: "planted", created_by: m2id });
const { error: plantErr } = await cm2.from("tasks").update({ parent_id: t1 }).eq("id", planted);
check("can't plant a subtask under a task you can't edit", !!plantErr);

const holder = crypto.randomUUID();
await cg.from("tasks").insert({ id: holder, name: "holder", created_by: await uid(cg) });
const { error: pullOut } = await cg.from("tasks").update({ parent_id: holder }).eq("id", t1);
check("assignee can't pull a task out of its project via re-parenting", !!pullOut);

const cycA = crypto.randomUUID();
const cycB = crypto.randomUUID();
await cm1.from("tasks").insert({ id: cycA, name: "cyc a", created_by: m1id });
await cm1.from("tasks").insert({ id: cycB, name: "cyc b", parent_id: cycA, created_by: m1id });
const { error: cycleErr } = await cm1.from("tasks").update({ parent_id: cycB }).eq("id", cycA);
check("subtask cycles are rejected", !!cycleErr);
const { error: searchErr } = await cm2.from("tasks").select("id").ilike("name", "%cyc%");
check("search keeps working", !searchErr, searchErr?.message);

const { data: privField } = await cm1.from("custom_fields").insert({ project_id: priv.id, name: "Secret field", type: "text" }).select().single();
const { error: foreignField } = await cm2.from("task_field_values").insert({ task_id: t2, field_id: privField.id, value: "x" });
check("field values must use the task's own project fields", !!foreignField);

await cm1.from("project_members").insert({ project_id: pub.id, user_id: m2id, role: "viewer" });
await cm2.from("project_members").delete().eq("project_id", pub.id).eq("user_id", m2id);
const { data: stillViewer } = await cm2.rpc("project_access", { p_project: pub.id });
check("viewers can't leave to regain editor access", stillViewer === "viewer", stillViewer);
await cm1.from("project_members").delete().eq("project_id", pub.id).eq("user_id", m2id);

const { data: goal } = await cm2.from("goals").insert({ name: "Mine", owner_id: m2id, created_by: m2id }).select().single();
const { error: hijack } = await cm1.from("goals").update({ owner_id: m1id }).eq("id", goal.id);
const { data: goalAfter } = await cm1.from("goals").update({ created_by: m1id, name: "Renamed" }).eq("id", goal.id).select().single();
check("goal ownership can't be taken over", !!hijack && goalAfter?.created_by === m2id && goalAfter?.name === "Renamed");

const anon = createClient(URL_, PUB, { auth: { persistSession: false } });
const { error: anonRpc } = await anon.rpc("project_access", { p_project: priv.id });
check("anonymous visitors can't call permission helpers", !!anonRpc);
const { error: oracle } = await cm2.rpc("project_access", { p_project: priv.id, p_user: m1id });
check("helpers can't be asked about other people", !!oracle);
const { data: ownAccess } = await cm2.rpc("project_access", { p_project: pub.id });
check("…but answer for yourself", ownAccess === "editor", ownAccess);

const { error: bigMentions } = await cm1.from("comments").insert({ task_id: t1, author_id: m1id, body: "spam", mentions: Array(200).fill(g.user.id) });
check("huge mention lists are rejected", !!bigMentions);
const { count: beforeN } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", g.user.id).eq("type", "mentioned");
await cm1.from("comments").insert({ task_id: t1, author_id: m1id, body: "dup", mentions: Array(30).fill(g.user.id) });
const { count: afterN } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", g.user.id).eq("type", "mentioned");
check("duplicate mentions notify once", afterN - beforeN === 1, afterN - beforeN);

const tooMany = Array(12).fill({ type: "set_complete", value: true });
const { error: bigRule } = await cm1.from("rules").insert({ project_id: pub.id, name: "big", trigger_type: "task_added", actions: tooMany });
check("rules are capped at 10 actions", !!bigRule);

console.log("\nDeactivation");
await ca.from("profiles").update({ status: "deactivated" }).eq("id", m2.user.id);
const { data: deadSees } = await cm2.from("projects").select("id");
check("deactivated user sees nothing", deadSees?.length === 0);
const { error: lastAdmin } = await ca.from("profiles").update({ role: "member" }).eq("id", a.user.id);
const { count: otherAdmins } = await admin.from("profiles").select("*", { count: "exact", head: true }).eq("role", "admin").eq("status", "active").neq("id", a.user.id);
check("cannot demote the last admin", otherAdmins > 0 || !!lastAdmin);

console.log("\nStorage");
const path = `${t1}/${crypto.randomUUID()}-note.txt`;
const { error: upErr } = await cm1.storage.from("attachments").upload(path, new Blob(["hello"]), { contentType: "text/plain" });
check("project owner can upload attachment", !upErr, upErr?.message);
const { error: dlGuest } = await cg.storage.from("attachments").download(path);
check("assigned guest can download it", !dlGuest, dlGuest?.message);
const { data: m3 } = await makeUser(`m3-${run}@seedsofleadership.ca`);
const cm3 = await as(`m3-${run}@seedsofleadership.ca`);
const { error: dlOther } = await cm3.storage.from("attachments").download(path);
check("unrelated member cannot download it", !!dlOther);
void m3;

const { error: cfgErr } = await ca.rpc("configure_notifications", { p_url: "https://evil.example", p_secret: "x" });
check("even admins can't set email delivery config directly", !!cfgErr);
const { error: statusErr } = await cm1.rpc("notification_delivery_status");
check("members can't read the delivery secret", !!statusErr);

console.log("\nAccount removal");
const { error: removeErr } = await admin.auth.admin.deleteUser(m1.user.id);
check("removing a user who created work succeeds", !removeErr, removeErr?.message);
const { data: orphan } = await admin.from("tasks").select("created_by").eq("id", t1).single();
check("…and their tasks remain, unattributed", orphan && orphan.created_by === null);

console.log(`\n${passes} passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
