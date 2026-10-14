// Seeds the LOCAL Supabase stack with demo people and work so you can click around.
//   npm run db:reset && npm run seed:dev
// Sign in on http://localhost:3000/login with the dev sign-in form (NEXT_PUBLIC_ENABLE_DEV_LOGIN=true).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
if (!URL_.includes("127.0.0.1") && !URL_.includes("localhost")) throw new Error("Refusing to seed a non-local database");

const PASSWORD = "seeds-dev-password";
const admin = createClient(URL_, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const PEOPLE = [
  { email: "aya@seedsofleadership.ca", name: "Aya Admin" },
  { email: "jordan@seedsofleadership.ca", name: "Jordan Lee" },
  { email: "sam@seedsofleadership.ca", name: "Sam Rivera" },
  { email: "priya@seedsofleadership.ca", name: "Priya Patel" },
  { email: "guest@partner.org", name: "Gabe Guest", guest: true },
];

async function signIn(email) {
  const c = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return c;
}

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

const c = await signIn("aya@seedsofleadership.ca");

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

console.log("\nSeeded. Dev sign-in password for every account:", PASSWORD);
for (const p of PEOPLE) console.log(`  ${p.email}${p.guest ? " (guest)" : ""}`);
