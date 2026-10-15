// Shared helpers for the local test and seed scripts.
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

/** Values from .env.local; refuses to run against anything but the local stack. */
export function localEnv() {
  const env = Object.fromEntries(
    readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url?.includes("127.0.0.1") && !url?.includes("localhost")) throw new Error("Refusing to run against a non-local project");
  return { url, publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secretKey: env.SUPABASE_SECRET_KEY };
}

export function adminClient() {
  const { url, secretKey } = localEnv();
  return createClient(url, secretKey, { auth: { persistSession: false } });
}

export function anonClient() {
  const { url, publishableKey } = localEnv();
  return createClient(url, publishableKey, { auth: { persistSession: false } });
}

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 time-based code, as an authenticator app would show it. */
function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

/**
 * Signs in with a password and completes two-factor (enrolling a fresh
 * authenticator, since earlier secrets can't be read back), like a real user.
 * Returns the client at aal2, its access token and user id.
 */
export async function signInWithMfa(email, password) {
  const admin = adminClient();
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);

  const { data: existing } = await admin.auth.admin.mfa.listFactors({ userId: data.user.id });
  for (const f of existing?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: data.user.id, id: f.id });

  const { data: factor, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `test-${Date.now()}` });
  if (enrollError) throw new Error(`enroll ${email}: ${enrollError.message}`);
  const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code: totp(factor.totp.secret) });
  if (verifyError) throw new Error(`verify ${email}: ${verifyError.message}`);

  const { data: session } = await client.auth.getSession();
  return { client, token: session.session.access_token, id: data.user.id };
}

/** Tiny assertion reporter shared by the test scripts. */
export function reporter() {
  let passes = 0;
  let failures = 0;
  return {
    check(name, cond, extra) {
      if (cond) {
        passes++;
        console.log(`  ✓ ${name}`);
      } else {
        failures++;
        console.log(`  ✗ ${name}`, extra ?? "");
      }
    },
    finish() {
      console.log(`\n${passes} passed, ${failures} failed\n`);
      process.exit(failures ? 1 : 0);
    },
  };
}
