// Runs supabase/functions/send-reminders under Deno with a fake database and a fake Resend. Made-up names only.
(globalThis as any).__REMINDER_TEST__ = true;
const { handle } = await import(new URL("../../supabase/functions/send-reminders/index.ts", import.meta.url).href);
const { plan, readContacts, buildEmail, MAX_LATE_MS } = await import(new URL("../../supabase/functions/send-reminders/core.ts", import.meta.url).href);

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x?: unknown) => { if (c) pass++; else { fail++; console.log("FAIL " + n, JSON.stringify(x)); } };
const H = 3_600_000, now = Date.parse("2026-11-12T15:00:00Z");
const contacts = { list: [{ id: "c1", name: "Jane Example", email: "jane@ascot.test" }, { id: "c2", name: "Sam <Sample>", email: "sam@ascot.test" }, { id: "c3", name: "Bad", email: "not-an-email" }] };

function rows() {
  return [
    { id: "r1", updated_at: "v1", doc: { kind: "reminder", person: "B. Sample", text: "Schedule a meeting", projectId: "p1", due: "2026-11-13", emailStatus: "scheduled", emailTo: "c1", emailName: "Jane Example", sendAt: now - H } },
    { id: "r2", updated_at: "v1", doc: { kind: "reminder", person: "C. Person", text: "x", emailStatus: "scheduled", emailTo: "c1", sendAt: now + H } },          // not due yet
    { id: "r3", updated_at: "v1", doc: { kind: "reminder", person: "D. Done", emailStatus: "scheduled", emailTo: "c1", sendAt: now - H, done: true } },        // ticked off
    { id: "r4", updated_at: "v1", doc: { kind: "reminder", person: "E. Gone", emailStatus: "scheduled", emailTo: "c9", sendAt: now - H } },                     // contact removed
    { id: "r5", updated_at: "v1", doc: { kind: "reminder", person: "F. Late", emailStatus: "scheduled", emailTo: "c2", sendAt: now - MAX_LATE_MS - H } },      // too late
    { id: "r6", updated_at: "v1", doc: { kind: "reminder", person: "G. <Esc>", text: "Ask", emailStatus: "scheduled", emailTo: "c2", sendAt: now - 2 * H } },
    { id: "r7", updated_at: "v1", doc: { kind: "reminder", person: "H. Sent", emailStatus: "sent", emailTo: "c1", sendAt: now - H } },
  ];
}
function fakeDb(store: any[], opts: { stale?: string } = {}) {
  const updates: any[] = [];
  const db: any = { updates, from(t: string) {
    const st: any = { eqs: [], op: "select" };
    const q: any = {
      select() { return q; }, eq(c: string, v: string) { st.eqs.push([c, v]); return q; }, in(c: string, v: string[]) { st.in = [c, v]; return q; },
      maybeSingle() { st.single = true; return q; },
      update(v: any) { st.op = "update"; st.val = v; return q; },
      then(res: any) {
        if (t === "settings") return res({ data: st.single ? { doc: contacts } : [{ doc: contacts }], error: null });
        if (t === "projects") return res({ data: [{ id: "p1", doc: { name: "Harbor Review" } }], error: null });
        if (st.op === "update") {
          const id = st.eqs.find((e: any) => e[0] === "id")[1], v = st.eqs.find((e: any) => e[0] === "updated_at")[1];
          const r = store.find((x) => x.id === id);
          if (!r || r.updated_at !== v || opts.stale === id) return res({ data: [], error: null });
          r.doc = st.val.doc; r.updated_at = r.updated_at + "+"; updates.push({ id, status: r.doc.emailStatus });
          return res({ data: [{ id, updated_at: r.updated_at }], error: null });
        }
        return res({ data: store.filter((r) => r.doc.emailStatus === "scheduled"), error: null });
      } };
    return q;
  } };
  return db;
}
const SECRET = "r3minder-r3minder-r3minder";
const env = (extra: Record<string, string> = {}) => (k: string) => ({ REMINDER_SECRET: SECRET, RESEND_API_KEY: "re_test", REMINDER_FROM: "Tracker <tracker@ascot.test>", SITE_URL: "https://example.github.io/tracker/", ...extra } as Record<string, string>)[k];
const req = (h: Record<string, string> = { "x-reminder-secret": SECRET }, method = "POST") => new Request("https://x/functions/v1/send-reminders", { method, headers: h });
let sent: any[] = [];
const fakeFetch = (async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return new Response("{}", { status: 200 }); }) as any;

// contacts and plan
ok("contacts with bad emails dropped", readContacts(contacts).map((c: any) => c.id).join(",") === "c1,c2");
const pl = plan(rows().map((r) => ({ ...r.doc, id: r.id })), readContacts(contacts), now);
ok("plan: due ones sent, not-yet-due and already-sent left alone", pl.send.map((s: any) => s.row.id).join(",") === "r1,r6");
ok("plan: ticked off cancelled, removed contact and too-late failed", pl.skip.map((s: any) => s.row.id + ":" + s.status).join(",") === "r3:cancelled,r4:failed,r5:failed", pl.skip.map((s: any) => s.row.id + ":" + s.status));

// email content
const e = buildEmail({ id: "r1", person: "B. Sample", text: "Schedule a meeting", due: "2026-11-13" }, { id: "c1", name: "Jane Example", email: "jane@ascot.test" }, "Harbor Review", "https://example.github.io/tracker/");
ok("subject", e.subject === "Reminder: follow up with B. Sample", e.subject);
ok("greets by first name and lists details", e.text.startsWith("Hi Jane,") && e.text.includes("About: Schedule a meeting") && e.text.includes("Project: Harbor Review") && e.text.includes("By: 13 Nov"), e.text);
ok("links to the reminder", e.text.includes("https://example.github.io/tracker/#todo/r1"));
ok("no em dashes", !e.text.includes("—") && !e.html.includes("—"));

// auth
ok("GET refused", (await handle(req({}, "GET"), { env: env(), fetch: fakeFetch, db: fakeDb(rows()), now: () => now })).status === 405);
ok("wrong secret refused", (await handle(req({ "x-reminder-secret": "nope" }), { env: env(), fetch: fakeFetch, db: fakeDb(rows()), now: () => now })).status === 401);
ok("short secret refused", (await handle(req(), { env: env({ REMINDER_SECRET: "short" }), fetch: fakeFetch, db: fakeDb(rows()), now: () => now })).status === 500);

// not configured: nothing sent, due ones stay scheduled
let store = rows(); let db = fakeDb(store);
let body = await (await handle(req(), { env: env({ RESEND_API_KEY: "" }), fetch: fakeFetch, db, now: () => now })).json();
ok("not configured: nothing sent", body.configured === false && body.due === 2 && sent.length === 0, body);
ok("not configured: due ones still scheduled", store.find((r) => r.id === "r1")!.doc.emailStatus === "scheduled");
ok("not configured: skips still closed", store.find((r) => r.id === "r3")!.doc.emailStatus === "cancelled");

// configured
store = rows(); db = fakeDb(store); sent = [];
body = await (await handle(req(), { env: env(), fetch: fakeFetch, db, now: () => now })).json();
ok("sends the due ones", body.sent === 2 && body.failed === 0 && sent.length === 2, body);
ok("sent to the contact's email only", JSON.stringify(sent.map((s) => s.body.to[0])) === '["jane@ascot.test","sam@ascot.test"]' && sent[0].auth === "Bearer re_test" && sent[0].body.from === "Tracker <tracker@ascot.test>");
ok("names escaped in html", sent[1].body.html.includes("G. &lt;Esc&gt;") && sent[1].body.html.includes("Sam &lt;Sample&gt;".split(" ")[0]));
ok("status sent with time", store.find((r) => r.id === "r1")!.doc.emailStatus === "sent" && store.find((r) => r.id === "r1")!.doc.emailSentAt === now);
ok("claimed before sending", db.updates.filter((u: any) => u.id === "r1").map((u: any) => u.status).join(",") === "sending,sent");
ok("other reminders untouched", store.find((r) => r.id === "r2")!.doc.emailStatus === "scheduled" && store.find((r) => r.id === "r7")!.doc.emailStatus === "sent");
sent = [];
body = await (await handle(req(), { env: env(), fetch: fakeFetch, db, now: () => now })).json();
ok("second run sends nothing again", sent.length === 0 && body.sent === 0, body);

// someone edited it in between: not claimed, not sent
store = rows(); sent = [];
body = await (await handle(req(), { env: env(), fetch: fakeFetch, db: fakeDb(store, { stale: "r1" }), now: () => now })).json();
ok("edited in between: skipped this run", sent.length === 1 && store.find((r) => r.id === "r1")!.doc.emailStatus === "scheduled");

// Resend refuses
store = rows(); sent = [];
const bad = (async () => new Response("domain not verified", { status: 403 })) as any;
body = await (await handle(req(), { env: env(), fetch: bad, db: fakeDb(store), now: () => now })).json();
ok("failure recorded on the reminder", body.failed === 2 && store.find((r) => r.id === "r1")!.doc.emailStatus === "failed" && String(store.find((r) => r.id === "r1")!.doc.emailError).includes("domain not verified"));

console.log(`${pass} passed, ${fail} failed`); if (fail) Deno.exit(1);
