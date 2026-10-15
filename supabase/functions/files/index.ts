// POST /functions/v1/files  { action, ... }
// Attachments on Cloudflare R2 (10 GB free, no download fees). Every action is
// authorised against row-level security as the caller; the browser then talks
// to R2 directly with a short-lived signed URL. Without R2 secrets, the app
// stores attachments in Supabase Storage instead.
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { HttpError, json, readJson, serve } from "../_shared/http.ts";
import { requireCaller } from "../_shared/supabase.ts";

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID");
const BUCKET = Deno.env.get("R2_BUCKET");
const ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY");
const MAX_BYTES = 50 * 1024 * 1024;
const URL_TTL_SECONDS = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const r2 =
  ACCOUNT_ID && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY
    ? new AwsClient({ accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY, service: "s3", region: "auto" })
    : null;

function objectUrl(key: string) {
  return new URL(`https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}`);
}

async function presign(method: "PUT" | "GET", key: string, extra: Record<string, string> = {}) {
  const url = objectUrl(key);
  url.searchParams.set("X-Amz-Expires", String(URL_TTL_SECONDS));
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const signed = await r2!.sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

type Body =
  | { action: "upload-url"; taskId: string; fileName: string; size: number }
  | { action: "download-url"; attachmentId: string; download?: boolean }
  | { action: "delete"; attachmentId: string };

serve(async (req) => {
  const caller = await requireCaller(req);
  const body = await readJson<Body>(req);

  if (body.action === "upload-url") {
    if (!r2) return json({ backend: "supabase" });
    if (typeof body.taskId !== "string" || !UUID_RE.test(body.taskId)) throw new HttpError(400, "Invalid task");
    if (!(body.size > 0 && body.size <= MAX_BYTES)) throw new HttpError(400, "Files can be up to 50 MB");
    const { data: allowed } = await caller.db.rpc("can_comment_task", { p_task: body.taskId });
    if (!allowed) throw new HttpError(403, "You can't add files to this task");
    const safeName = String(body.fileName ?? "file").replace(/[^\w.\- ]+/g, "_").slice(-120);
    const key = `${body.taskId}/${crypto.randomUUID()}-${safeName}`;
    return json({ backend: "r2", key, url: await presign("PUT", key) });
  }

  if (body.action === "download-url" || body.action === "delete") {
    if (typeof body.attachmentId !== "string" || !UUID_RE.test(body.attachmentId)) throw new HttpError(400, "Invalid file");
    if (!r2) throw new HttpError(400, "File storage isn't configured");

    if (body.action === "download-url") {
      // RLS: only people who can see the task can see the attachment row.
      const { data: a } = await caller.db
        .from("attachments")
        .select("storage_path, file_name")
        .eq("id", body.attachmentId)
        .eq("storage_backend", "r2")
        .maybeSingle();
      if (!a) throw new HttpError(404, "File not found");
      const disposition = `${body.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.file_name)}`;
      return json({ url: await presign("GET", a.storage_path, { "response-content-disposition": disposition }) });
    }

    // RLS decides whether the caller may delete the row; only then remove the object.
    const { data: deleted, error } = await caller.db
      .from("attachments")
      .delete()
      .eq("id", body.attachmentId)
      .eq("storage_backend", "r2")
      .select("storage_path");
    if (error || !deleted?.length) throw new HttpError(403, "You can't delete this file");
    const res = await r2.fetch(objectUrl(deleted[0].storage_path), { method: "DELETE" });
    if (!res.ok && res.status !== 404) console.error("R2 delete failed", res.status, await res.text());
    return json({ ok: true });
  }

  throw new HttpError(400, "Unknown action");
});
