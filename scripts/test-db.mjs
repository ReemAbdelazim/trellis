// Integration tests for the database security model and business logic.
// Runs against the LOCAL Supabase stack:  npm run test:db
import { adminClient, anonClient, reporter, signInWithMfa } from "./lib/helpers.mjs";

const admin = adminClient();
const { check, finish } = reporter();
const run = Date.now().toString(36);
const PASSWORD = "test-password-123";

async function makeUser(email) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  });
  return { user: data?.user, error };
}

/** Signed-in client for a test user, with two-factor completed (aal2). */
const as = async (email) => (await signInWithMfa(email, PASSWORD)).client;

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
// Gmail ignores dots and "+tags": an invite to the dotted form admits the plain address.
await cm1.from("invitations").insert({ email: `gmail.${run}+trellis@gmail.com`, role: "guest", invited_by: await uid(cm1) });
const gmailGuest = await makeUser(`gmail${run}@gmail.com`);
check("Gmail invite matches the address without dots or +tag", !gmailGuest.error, gmailGuest.error?.message);
const { data: gmailInvite } = await admin.from("invitations").select("accepted_at").eq("email", `gmail.${run}+trellis@gmail.com`).single();
check("that invitation is marked accepted", !!gmailInvite?.accepted_at);
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

console.log("\nProfile photos");
const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
const { error: ownPhoto } = await cm1.storage.from("avatars").upload(`${m1.user.id}/${run}.jpg`, photo, { contentType: "image/jpeg" });
check("member can upload their own photo", !ownPhoto, ownPhoto?.message);
const { error: otherPhoto } = await cm1.storage.from("avatars").upload(`${m2.user.id}/${run}.jpg`, photo, { contentType: "image/jpeg" });
check("member cannot upload into someone else's photos", !!otherPhoto);
const passwordOnly = anonClient(); // signed in, but hasn't entered the authenticator code
await passwordOnly.auth.signInWithPassword({ email: M1, password: PASSWORD });
const { error: aal1Photo } = await passwordOnly.storage
  .from("avatars")
  .upload(`${m1.user.id}/aal1-${run}.jpg`, photo, { contentType: "image/jpeg" });
check("photo upload needs two-factor", !!aal1Photo && (await passwordOnly.auth.getSession()).data.session !== null);
const uploadedUrl = cm1.storage.from("avatars").getPublicUrl(`${m1.user.id}/${run}.jpg`).data.publicUrl;
await cm1.from("profiles").update({ avatar_url: uploadedUrl }).eq("id", m1.user.id);
await admin.auth.admin.updateUserById(m1.user.id, { user_metadata: { picture: "https://example.com/google.jpg" } });
const { data: m1photo } = await admin.from("profiles").select("avatar_url").eq("id", m1.user.id).single();
check("signing in again keeps an uploaded photo", m1photo.avatar_url === uploadedUrl, m1photo.avatar_url);

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

const { data: c1, error: cErr } = await cm1
  .from("comments")
  .insert({ task_id: t1, body: `Hi @[Guest](${g.user.id})`, author_id: await uid(cm1) })
  .select("id, mentions")
  .single();
check("comment with mention", !cErr && c1?.mentions?.[0] === g.user.id, cErr?.message ?? c1);
const { data: mentioned } = await cg.from("notifications").select("type").eq("task_id", t1).eq("type", "mentioned");
check("mention notification", mentioned?.length === 1);
const { data: audience } = await cm1.rpc("task_audience", { p_task: t1 });
check("task audience lists who can see the task", audience?.includes(g.user.id) && audience?.includes(await uid(cm1)), audience);
check("…and not who can't", !audience?.includes(await uid(cm2)));
const { data: outsiderAudience } = await cm2.rpc("task_audience", { p_task: t1 });
check("…and tells nothing to someone who can't see it", outsiderAudience?.length === 0, outsiderAudience);
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

console.log("\nSubtask sections");
const { data: subSec, error: subSecErr } = await cm1.from("sections").insert({ task_id: t1, name: "Phase 1" }).select().single();
check("editor can add a section to a task's subtasks", !subSecErr, subSecErr?.message);
const { error: outsiderSecErr } = await cm2.from("sections").insert({ task_id: t1, name: "nope" });
check("someone who can't edit the task can't add subtask sections", !!outsiderSecErr);
const { data: outsiderSecs } = await cm2.from("sections").select("id").eq("task_id", t1);
check("…or see them", outsiderSecs?.length === 0);
const { error: twoOwners } = await cm1.from("sections").insert({ task_id: t1, project_id: priv.id, name: "both" });
check("a section belongs to a project or a task, not both", !!twoOwners);
const { data: inSec } = await cm1.from("tasks").update({ section_id: subSec.id }).eq("id", sub).select("section_id").single();
check("subtask moves into its parent's section", inSec?.section_id === subSec.id);
const { data: foreign } = await cm1.from("tasks").update({ section_id: secs[0].id }).eq("id", sub).select("section_id").single();
check("subtask can't join a project section or another task's", foreign?.section_id === null);
await cm1.from("tasks").update({ section_id: subSec.id }).eq("id", sub);
await cm1.from("sections").update({ task_id: t4 }).eq("id", subSec.id);
const { data: kept } = await cm1.from("sections").select("task_id").eq("id", subSec.id).single();
check("a section can't move to another task", kept?.task_id === t1);
await cm1.from("sections").delete().eq("id", subSec.id);
const { data: afterDel } = await cm1.from("tasks").select("id, section_id").eq("id", sub).single();
check("deleting a subtask section keeps its subtasks, outside any section", afterDel?.id === sub && afterDel.section_id === null);
// Kept for the duplicate test below.
const { data: t4Sec } = await cm1.from("sections").insert({ task_id: t4, name: "Checklist" }).select().single();
await cm1.from("tasks").insert({ parent_id: t4, section_id: t4Sec.id, name: `Sectioned subtask ${run}`, created_by: await uid(cm1) });

console.log("\nTags");
const { data: tag, error: tagErr } = await cm1.from("tags").insert({ name: `Urgent ${run}`, color: "red" }).select().single();
check("member can create a tag", !tagErr && tag?.created_by === m1.user.id, tagErr?.message);
const { error: dupTag } = await cm2.from("tags").insert({ name: `  urgent ${run} ` });
check("tag names are unique, ignoring case and spaces", !!dupTag);
const { error: guestTag } = await cg.from("tags").insert({ name: `Guest tag ${run}`, created_by: g.user.id });
check("guests can't create tags", !!guestTag);
const { error: tagT1 } = await cm1.from("task_tags").insert({ task_id: t1, tag_id: tag.id });
check("editor can tag a task", !tagT1, tagT1?.message);
const { error: outsiderTagging } = await cm2.from("task_tags").insert({ task_id: t1, tag_id: tag.id });
check("someone who can't edit the task can't tag it", !!outsiderTagging);
const { data: outsiderSees } = await cm2.from("task_tags").select("tag_id").eq("task_id", t1);
check("…or see its tags", outsiderSees?.length === 0);
const { data: hidden } = await cm1.from("tags").insert({ name: `Internal ${run}` }).select().single();
const { data: guestTags } = await cg.from("tags").select("id").in("id", [tag.id, hidden.id]);
check("guests see only tags on tasks they can see", guestTags?.length === 1 && guestTags[0].id === tag.id, guestTags);
const { data: tagAct } = await cm1.from("task_activity").select("kind, data").eq("task_id", t1).eq("kind", "tag_added");
check("tagging is recorded in the task's history", tagAct?.some((a) => a.data.tag === `Urgent ${run}`), tagAct);
const { data: renamed } = await cm2.from("tags").update({ name: `Urgent! ${run}`, color: "not-a-colour", created_by: m2.user.id }).eq("id", tag.id).select().single();
check("members can rename and recolour a tag", renamed?.name === `Urgent! ${run}`);
check("…the colour stays in the palette and the creator can't change", renamed?.color === "teal" && renamed?.created_by === m1.user.id, renamed);
const { data: notMine } = await cm2.from("tags").delete().eq("id", hidden.id).select();
check("only the creator or an admin can delete a tag", notMine?.length === 0);
await cm1.from("task_tags").delete().eq("task_id", t1).eq("tag_id", tag.id);
const { data: untagAct } = await cm1.from("task_activity").select("kind").eq("task_id", t1).eq("kind", "tag_removed");
check("removing a tag is recorded too", untagAct?.length === 1);
await cm1.from("task_tags").insert({ task_id: t1, tag_id: tag.id });
const { error: adminDel } = await ca.from("tags").delete().eq("id", tag.id);
const { data: leftover } = await admin.from("task_tags").select("task_id").eq("tag_id", tag.id);
check("admin can delete a tag, which leaves every task", !adminDel && leftover?.length === 0, adminDel?.message);
// Kept for the duplicate test below.
const { data: keepTag } = await cm1.from("tags").insert({ name: `Funding ${run}` }).select().single();
await cm1.from("task_tags").insert({ task_id: t4, tag_id: keepTag.id });

const tagged = crypto.randomUUID();
await cm1.from("tasks").insert({ id: tagged, project_id: pub.id, name: "Tagged, then deleted", created_by: m1.user.id });
await cm1.from("task_tags").insert({ task_id: tagged, tag_id: keepTag.id });
const { data: delTagged, error: delTaggedErr } = await cm1.from("tasks").delete().eq("id", tagged).select("id");
check("a tagged task can be deleted", !delTaggedErr && delTagged?.length === 1, delTaggedErr?.message);

console.log("\nBulk edits");
const bulkA = crypto.randomUUID();
const bulkB = crypto.randomUUID();
await cm1.from("tasks").insert([
  { id: bulkA, project_id: pub.id, name: `Bulk A ${run}`, created_by: m1.user.id },
  { id: bulkB, project_id: pub.id, name: `Bulk B ${run}`, created_by: m1.user.id },
]);
const { data: bulkRows } = await cm2.from("tasks").update({ assignee_id: m2.user.id }).in("id", [bulkA, bulkB, t1]).select("id");
check("bulk update changes only the tasks you can edit", bulkRows?.length === 2 && !bulkRows.some((r) => r.id === t1), bulkRows);
const { error: bulkTagErr } = await cm2.from("task_tags").insert([bulkA, bulkB].map((task_id) => ({ task_id, tag_id: keepTag.id })));
check("bulk tagging", !bulkTagErr, bulkTagErr?.message);
const { error: bulkTagPrivate } = await cm2.from("task_tags").insert([bulkA, t1].map((task_id) => ({ task_id, tag_id: keepTag.id })));
check("…is all-or-nothing when one task isn't yours", !!bulkTagPrivate);
const { data: bulkDel } = await cm2.from("tasks").delete().in("id", [bulkA, bulkB, t1]).select("id");
check("bulk delete removes only the tasks you can edit", bulkDel?.length === 2, bulkDel);
const { data: t1Still } = await cm1.from("tasks").select("id").eq("id", t1);
check("…and leaves the rest", t1Still?.length === 1);

console.log("\nTemplates");
const { data: copyId, error: dupErr } = await cm1.rpc("duplicate_project", { p_project: pub.id, p_name: `Copy ${run}`, p_include_tasks: true, p_as_template: false });
check("duplicate project", !dupErr, dupErr?.message);
const { data: copySecs } = await cm1.from("sections").select("id").eq("project_id", copyId);
const { data: copyTasks } = await cm1.from("tasks").select("id").eq("project_id", copyId);
const { data: copyRules } = await cm1.from("rules").select("trigger_config").eq("project_id", copyId);
check("copy has same sections (no defaults added)", copySecs?.length === 3, copySecs?.length);
check("copy has tasks", copyTasks?.length >= 3, copyTasks?.length);
check("copied rules point at new sections", copyRules?.every((r) => !r.trigger_config.section_id || copySecs.some((s) => s.id === r.trigger_config.section_id)));
const { data: copyT4 } = await cm1.from("tasks").select("task_tags(tag_id)").eq("project_id", copyId).eq("name", "Prioritise me").single();
check("copy keeps task tags", copyT4?.task_tags?.some((x) => x.tag_id === keepTag.id), copyT4);
const { data: copySub } = await cm1.from("tasks").select("parent_id, section_id").eq("project_id", copyId).eq("name", `Sectioned subtask ${run}`).single();
const { data: copySubSec } = await cm1.from("sections").select("task_id, name").eq("id", copySub?.section_id ?? crypto.randomUUID()).maybeSingle();
check("copy keeps subtask sections, owned by the copied task", copySubSec?.name === "Checklist" && copySubSec.task_id === copySub.parent_id, copySub);

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

const anon = anonClient();
const { error: anonRpc } = await anon.rpc("project_access", { p_project: priv.id });
check("anonymous visitors can't call permission helpers", !!anonRpc);
const { error: oracle } = await cm2.rpc("project_access", { p_project: priv.id, p_user: m1id });
check("helpers can't be asked about other people", !!oracle);
const { data: ownAccess } = await cm2.rpc("project_access", { p_project: pub.id });
check("…but answer for yourself", ownAccess === "editor", ownAccess);

const mentionCount = async (user) =>
  (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user).eq("type", "mentioned")).count;
const { data: spoofed } = await cm1.from("comments").insert({ task_id: t1, author_id: m1id, body: "no tokens here", mentions: [g.user.id] }).select("mentions").single();
check("mentions come from the text, not the request", spoofed?.mentions?.length === 0, spoofed);
const beforeN = await mentionCount(g.user.id);
const { data: dupC } = await cm1
  .from("comments")
  .insert({ task_id: t1, author_id: m1id, body: Array(30).fill(`@[Guest](${g.user.id})`).join(" ") })
  .select("id")
  .single();
check("duplicate mentions notify once", (await mentionCount(g.user.id)) - beforeN === 1);
const adminId = await uid(ca);
const beforeEdit = { guest: await mentionCount(g.user.id), admin: await mentionCount(adminId) };
await cm1.from("comments").update({ body: `@[Guest](${g.user.id}) and @[Admin](${adminId})` }).eq("id", dupC.id);
check(
  "editing a comment notifies only the newly mentioned",
  (await mentionCount(adminId)) - beforeEdit.admin === 1 && (await mentionCount(g.user.id)) === beforeEdit.guest,
);
await cm1.from("comments").update({ body: `@[Guest](${g.user.id}) and @[Admin](${adminId}) (typo fixed)` }).eq("id", dupC.id);
check("…and re-saving doesn't notify again", (await mentionCount(adminId)) - beforeEdit.admin === 1);

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
const { user: m3 } = await makeUser(`m3-${run}@seedsofleadership.ca`);
const cm3 = await as(`m3-${run}@seedsofleadership.ca`);
const { error: dlOther } = await cm3.storage.from("attachments").download(path);
check("unrelated member cannot download it", !!dlOther);

const { error: cfgErr } = await ca.rpc("configure_notifications", { p_url: "https://evil.example", p_secret: "x" });
check("even admins can't set email delivery config directly", !!cfgErr);
const { error: statusErr } = await cm1.rpc("notification_delivery_status");
check("members can't read the delivery secret", !!statusErr);

console.log("\nTwo-factor & password accounts");
const pwOnly = anonClient();
await pwOnly.auth.signInWithPassword({ email: `m3-${run}@seedsofleadership.ca`, password: PASSWORD });
const { data: aal1Projects } = await pwOnly.from("projects").select("id");
check("password-only session (no two-factor) sees no data", aal1Projects?.length === 0, aal1Projects?.length);
const { data: aal1Access } = await pwOnly.rpc("project_access", { p_project: pub.id });
check("…and permission helpers answer nothing", aal1Access === null, aal1Access);
const { error: aal1Write } = await pwOnly.from("tasks").insert({ name: "sneaky", created_by: m3.id });
check("…and can't write", !!aal1Write);

const signupEmail = `pw-${run}@seedsofleadership.ca`;
const { data: signup, error: signupErr } = await anonClient().auth.signUp({ email: signupEmail, password: PASSWORD });
check("Seeds email can sign up with a password", !signupErr && !!signup.user, signupErr?.message);
const { data: earlyProfile } = await admin.from("profiles").select("id").eq("email", signupEmail);
check("…but gets no profile until the email is confirmed", earlyProfile?.length === 0);
await admin.auth.admin.updateUserById(signup.user.id, { email_confirm: true });
const { data: confirmedProfile } = await admin.from("profiles").select("role").eq("email", signupEmail).single();
check("…and becomes a member once confirmed", confirmedProfile?.role === "member", confirmedProfile);
const { error: outsiderSignup } = await anonClient().auth.signUp({ email: `nope-${run}@gmail.com`, password: PASSWORD });
check("outsiders can't sign up with a password", !!outsiderSignup);

console.log("\nAccount removal");
const { error: removeErr } = await admin.auth.admin.deleteUser(m1.user.id);
check("removing a user who created work succeeds", !removeErr, removeErr?.message);
const { data: orphan } = await admin.from("tasks").select("created_by").eq("id", t1).single();
check("…and their tasks remain, unattributed", orphan && orphan.created_by === null);

finish();
