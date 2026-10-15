// Seeds the LOCAL Supabase stack with demo people and work so you can click around.
//   npm run db:reset && npm run seed:dev
// Sign in on http://localhost:3000/login with email + password, then set up two-factor (any authenticator app).
import { adminClient, signInWithMfa } from "./lib/helpers.mjs";

const PASSWORD = "seeds-dev-2026";
const admin = adminClient();

const PEOPLE = [
  { email: "aya@seedsofleadership.ca", name: "Aya Admin" },
  { email: "jordan@seedsofleadership.ca", name: "Jordan Lee" },
  { email: "sam@seedsofleadership.ca", name: "Sam Rivera" },
  { email: "priya@seedsofleadership.ca", name: "Priya Patel" },
  { email: "guest@partner.org", name: "Gabe Guest", guest: true },
];

const ids = {};
for (const p of PEOPLE) {
  if (p.guest) {
    await admin.from("invitations").insert({ email: p.email, role: "guest" });
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: p.name },
  });
  if (error && !/already/i.test(error.message)) throw error;
  const id = data?.user?.id ?? (await admin.from("profiles").select("id").eq("email", p.email).single()).data.id;
  ids[p.email] = id;
}
const [aya, jordan, sam, priya, guest] = PEOPLE.map((p) => ids[p.email]);
await admin.from("profiles").update({ role: "admin" }).eq("id", aya);

const { client: c } = await signInWithMfa("aya@seedsofleadership.ca", PASSWORD);

const { data: team } = await c.from("teams").insert({ name: "Programs", description: "Youth leadership programs", color: "green" }).select().single();
for (const u of [jordan, sam, priya]) await c.from("team_members").insert({ team_id: team.id, user_id: u });

const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

async function project(name, color, privacy, tasksBySection) {
  const { data: p, error } = await c
    .from("projects")
    .insert({ name, color, privacy, team_id: team.id, created_by: aya, owner_id: aya })
    .select()
    .single();
  if (error) throw error;
  const { data: sections } = await c.from("sections").select("*").eq("project_id", p.id).order("position");
  let pos = 1000;
  for (const [i, list] of tasksBySection.entries()) {
    for (const t of list) {
      pos += 1000;
      const { error: te } = await c.from("tasks").insert({
        id: crypto.randomUUID(),
        project_id: p.id,
        section_id: sections[i].id,
        position: pos,
        created_by: aya,
        ...t,
      });
      if (te) throw te;
    }
  }
  return p;
}

const retreat = await project("Spring Leadership Retreat", "green", "public", [
  [
    { name: "Book the venue", assignee_id: jordan, start_date: day(1), due_date: day(5), description: "Compare 3 venues within 1 hour of the city." },
    { name: "Draft agenda", assignee_id: priya, due_date: day(8) },
    { name: "Confirm keynote speaker", assignee_id: aya, due_date: day(3), is_milestone: true },
    { name: "Order name badges", due_date: day(14) },
  ],
  [
    { name: "Registration form", assignee_id: sam, start_date: day(-3), due_date: day(2) },
    { name: "Budget review", assignee_id: aya, due_date: day(-1) },
  ],
  [{ name: "Pick retreat dates", assignee_id: jordan, completed: true, due_date: day(-7) }],
]);

await project("Mentorship Program 2026", "purple", "public", [
  [
    { name: "Recruit 20 mentors", assignee_id: sam, start_date: day(0), due_date: day(30) },
    { name: "Mentor training session", assignee_id: priya, due_date: day(21), is_milestone: true },
  ],
  [{ name: "Matching survey", assignee_id: jordan, due_date: day(6) }],
  [],
]);

const partner = await project("Partner Grant Report", "orange", "private", [
  [
    { name: "Collect program metrics", assignee_id: guest, due_date: day(4) },
    { name: "Write impact stories", assignee_id: priya, due_date: day(9) },
  ],
  [],
  [],
]);
await c.from("project_members").insert({ project_id: partner.id, user_id: guest, role: "editor" });
await c.from("project_members").insert({ project_id: partner.id, user_id: priya, role: "editor" });

const { data: retreatTasks } = await c.from("tasks").select("id, name").eq("project_id", retreat.id);
const venue = retreatTasks.find((t) => t.name === "Book the venue");
const agenda = retreatTasks.find((t) => t.name === "Draft agenda");
await c.from("task_dependencies").insert({ task_id: agenda.id, depends_on_id: venue.id });
await c.from("comments").insert({
  task_id: venue.id,
  author_id: aya,
  body: `@[Jordan Lee](${jordan}) can you get quotes by Friday?`,
  mentions: [jordan],
});

await c.from("goals").insert({ name: "Reach 500 youth leaders this year", owner_id: aya, time_period: "FY 2026", metric_unit: "number", metric_start: 0, metric_current: 210, metric_target: 500, created_by: aya });

// Seeding used a throwaway authenticator; remove it so you set up your own at first sign-in.
const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: aya });
for (const f of factors?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: aya, id: f.id });

console.log("\nSeeded. Password for every account:", PASSWORD);
console.log("Each account sets up two-factor with any authenticator app on first sign-in.");
for (const p of PEOPLE) console.log(`  ${p.email}${p.guest ? " (guest)" : ""}`);
