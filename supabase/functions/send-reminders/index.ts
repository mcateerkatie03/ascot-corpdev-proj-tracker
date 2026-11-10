// Sends reminders that someone scheduled on the site ("email in 24 hours" / "in 48 hours"), through Resend.
// Called every 10 minutes by Supabase Cron (supabase/reminders_schedule.sql) with a shared secret header.
// No login is involved, so the function checks that secret itself: deploy with --no-verify-jwt.
// It only ever emails people on the tracker's contacts list (settings row "contacts").
//
// Secrets (supabase secrets set ...):
//   REMINDER_SECRET   long random string; the cron job sends it as x-reminder-secret
//   RESEND_API_KEY    from resend.com (the same key as the digest, if that's set up)
//   REMINDER_FROM     sender on a domain verified in Resend, e.g. "Corp Dev tracker <tracker@yourco.com>"
//   SITE_URL          optional, the site's address, for the link in the email
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Until RESEND_API_KEY and REMINDER_FROM are set, it sends nothing and leaves reminders scheduled.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { buildEmail, plan, readContacts, type Doc } from "./core.ts";

type Env = (k: string) => string | undefined;
type Deps = { env: Env; fetch: typeof fetch; db?: any; now?: () => number };

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const { env } = deps;
  if (req.method !== "POST") return json(405, { error: "Use POST." });
  const secret = env("REMINDER_SECRET") ?? "";
  if (secret.length < 24) return json(500, { error: "REMINDER_SECRET is not set (use at least 24 characters)." });
  if (!sameSecret(req.headers.get("x-reminder-secret") ?? "", secret)) return json(401, { error: "Not allowed." });

  const db = deps.db ?? createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const now = deps.now ? deps.now() : Date.now();

  const { data: rows, error } = await db.from("todos").select("id,doc,updated_at").eq("doc->>emailStatus", "scheduled");
  if (error) return json(500, { error: `Couldn't read reminders: ${error.message}` });
  const docs: (Doc & { _v: string })[] = (rows ?? []).map((r: any) => ({ ...(r.doc ?? {}), id: r.id, _v: r.updated_at }));
  const { data: cs } = await db.from("settings").select("doc").eq("id", "contacts").maybeSingle();
  const p = plan(docs, readContacts(cs?.doc), now);

  const key = env("RESEND_API_KEY") ?? "", from = env("REMINDER_FROM") ?? "";
  const configured = !!key && !!from;

  // Writes a status onto a reminder, only if nobody changed it since we read it.
  const mark = async (row: Doc & { _v?: string }, patch: Record<string, unknown>) => {
    const doc = { ...row }; delete (doc as any).id; delete (doc as any)._v;
    const { data } = await db.from("todos").update({ doc: { ...doc, ...patch } }).eq("id", row.id).eq("updated_at", row._v).select("id,updated_at");
    return data && data.length ? data[0].updated_at as string : null;
  };

  let skipped = 0;
  for (const s of p.skip) if (await mark(s.row, { emailStatus: s.status, emailError: s.error })) skipped++;
  if (!configured) return json(200, { configured: false, due: p.send.length, skipped });

  const names: Record<string, string> = {};
  const projectIds = [...new Set(p.send.map((s) => String(s.row.projectId || "")).filter(Boolean))];
  if (projectIds.length) {
    const { data: ps } = await db.from("projects").select("id,doc").in("id", projectIds);
    for (const r of ps ?? []) names[r.id] = String(r.doc?.name ?? "");
  }

  let sent = 0, failed = 0;
  for (const { row, contact } of p.send) {
    // Claim it first, so two runs can never send the same reminder twice.
    const v = await mark(row, { emailStatus: "sending" });
    if (!v) continue;
    const claimed = { ...row, emailStatus: "sending", _v: v };
    const email = buildEmail(row, contact, names[String(row.projectId || "")] ?? "", env("SITE_URL"));
    let ok = false, err = "";
    try {
      const res = await deps.fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [contact.email], subject: email.subject, html: email.html, text: email.text }),
      });
      ok = res.ok; if (!ok) err = `Email service refused it (${res.status}): ${(await res.text()).slice(0, 200)}`;
    } catch (e) { err = `Couldn't reach the email service: ${(e as Error).message}`; }
    await mark(claimed, ok ? { emailStatus: "sent", emailSentAt: now, emailError: "" } : { emailStatus: "failed", emailError: err });
    if (ok) sent++; else failed++;
  }
  return json(200, { configured: true, sent, failed, skipped });
}

// Tests import handle() with this flag set; in Supabase the server always starts.
if (!(globalThis as { __REMINDER_TEST__?: boolean }).__REMINDER_TEST__) {
  Deno.serve((req) => handle(req, { env: (k) => Deno.env.get(k), fetch }));
}
