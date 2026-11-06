// Runs the real supabase/functions/digest code under Deno with a fake database and a fake Resend.
(globalThis as any).__DIGEST_TEST__ = true;
const { handle } = await import(new URL("../../supabase/functions/digest/index.ts", import.meta.url).href);
const { buildDigest } = await import(new URL("../../supabase/functions/digest/core.ts", import.meta.url).href);

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, x?: unknown) => { if (c) pass++; else { fail++; console.log("FAIL " + n, JSON.stringify(x)); } };
const DAY = 86_400_000, now = Date.parse("2026-11-09T07:17:00Z"), iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const projects = [
  { id: "p1", doc: { name: "Harbor Review", status: "Active", update: "- Draft out", updateDate: iso(now - 3 * DAY) } },
  { id: "p2", doc: { name: "Cell <Partnership>", status: "Pending", update: "- Awaiting proposal\n- More", updateDate: iso(now - 10 * DAY) } },
  { id: "p3", doc: { name: "Lantern", status: "Active", updateDate: iso(now - 30 * DAY) } },
  { id: "p4", doc: { name: "Old Deal", status: "Dropped", updateDate: iso(now - 90 * DAY) } },
  { id: "p5", doc: { name: "Legacy", updateDate: iso(now - 1 * DAY) } },   // no status: Active
];
const todos = [
  { id: "t1", doc: { text: "Send draft", owner: "ZT", projectId: "p1", due: iso(now - 2 * DAY), done: false } },
  { id: "t2", doc: { text: "Chase partner", owner: "WL", projectId: "p2", due: iso(now + 2 * DAY), done: false } },
  { id: "t3", doc: { text: "Done thing", owner: "WL", due: iso(now - 5 * DAY), done: true } },
  { id: "t4", doc: { text: "Later thing", owner: "JD", due: iso(now + 20 * DAY), done: false } },
];
const history = [
  { tbl: "projects", record_id: "p4", op: "update", changes: { status: { from: "Active", to: "Dropped" } }, changed_at: new Date(now - 2 * DAY).toISOString() },
  { tbl: "projects", record_id: "p5", op: "insert", changes: { doc: { name: "Legacy", status: "Active" } }, changed_at: new Date(now - 1 * DAY).toISOString() },
  { tbl: "projects", record_id: "p1", op: "update", changes: { update: { from: "a", to: "b" } }, changed_at: new Date(now - 1 * DAY).toISOString() },
  { tbl: "projects", record_id: "p3", op: "update", changes: { status: { from: "Pending", to: "Active" } }, changed_at: new Date(now - 20 * DAY).toISOString() },
];

function fakeDb(opts: { noHistory?: boolean; failProjects?: boolean } = {}) {
  const tables: Record<string, any[]> = { projects, todos, history };
  return { from(t: string) {
    const st: any = { gte: null };
    const q: any = {
      select() { return q; }, gte(c: string, v: string) { st.gte = [c, v]; return q; }, order() { return q; }, limit() { return q; },
      then(res: any) {
        if (t === "history" && opts.noHistory) return res({ data: null, error: { message: "Could not find the table 'public.history'" } });
        if (t === "projects" && opts.failProjects) return res({ data: null, error: { message: "boom" } });
        let rows = tables[t];
        if (st.gte) rows = rows.filter((r: any) => String(r[st.gte[0]]) >= st.gte[1]);
        return res({ data: rows, error: null });
      } };
    return q;
  } } as any;
}
const SECRET = "s3cret-s3cret-s3cret-s3cret";
const env = (extra: Record<string, string> = {}) => (k: string) => ({ DIGEST_SECRET: SECRET, RESEND_API_KEY: "re_test", DIGEST_FROM: "Tracker <t@ascot.test>", DIGEST_TO: "a@ascot.test, b@ascot.test", SITE_URL: "https://example.github.io/tracker/", ...extra } as Record<string, string>)[k];
const req = (headers: Record<string, string> = { "x-digest-secret": SECRET }, url = "https://x/functions/v1/digest", method = "POST") => new Request(url, { method, headers });
let sent: any[] = [];
const fakeFetch = (async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return new Response("{\"id\":\"e1\"}", { status: 200 }); }) as any;
const deps = (o: any = {}) => ({ env: env(), fetch: fakeFetch, db: fakeDb(), now: () => now, ...o });

// auth
ok("GET refused", (await handle(req({}, undefined, "GET"), deps())).status === 405);
ok("no secret header refused", (await handle(req({}), deps())).status === 401);
ok("wrong secret refused", (await handle(req({ "x-digest-secret": SECRET + "x" }), deps())).status === 401);
ok("short DIGEST_SECRET refused", (await handle(req(), deps({ env: env({ DIGEST_SECRET: "short" }) }))).status === 500);
ok("nothing sent so far", sent.length === 0);

// dry run
const dry = await (await handle(req(undefined, "https://x/functions/v1/digest?dry=1"), deps())).json();
ok("dry run returns digest without sending", dry.dryRun === true && sent.length === 0);
ok("counts", JSON.stringify(dry.counts) === JSON.stringify({ open: 4, pending: 1, overdue: 1, dueThisWeek: 1, quiet: 1, changes: 2 }), dry.counts);
ok("subject", dry.subject === "Corp Dev weekly: 4 open projects, 1 to-do due this week, 1 overdue", dry.subject);
ok("overdue to-do with owner, project and link", dry.text.includes("- ZT: Send draft (Harbor Review), due 7 Nov https://example.github.io/tracker/#todo/t1"), dry.text);
ok("done and later to-dos left out", !dry.text.includes("Done thing") && !dry.text.includes("Later thing"));
ok("pending shows first update line", dry.text.includes("- Cell <Partnership>: Awaiting proposal"), dry.text);
ok("quiet project listed", dry.text.includes("- Lantern: last update 10 Oct"), dry.text);
ok("changes: status move and new project, old one skipped", dry.text.includes("Old Deal: Active to Dropped") && dry.text.includes("New project: Legacy") && !dry.text.includes("Pending to Active"), dry.text);
ok("html escapes names", dry.html.includes("Cell &lt;Partnership&gt;") && !dry.html.includes("Cell <Partnership>"));
ok("no em dashes", !dry.text.includes("—") && !dry.html.includes("—"));

// send
const r = await handle(req(), deps());
const body = await r.json();
ok("send ok", r.status === 200 && body.sent === true && body.recipients === 2, body);
ok("Resend call", sent.length === 1 && sent[0].url === "https://api.resend.com/emails" && sent[0].auth === "Bearer re_test" && JSON.stringify(sent[0].body.to) === '["a@ascot.test","b@ascot.test"]' && !!sent[0].body.html, sent[0]);

// without the history table the section is dropped and the rest still sends
const nh = await (await handle(req(undefined, "https://x/?dry=1"), deps({ db: fakeDb({ noHistory: true }) }))).json();
ok("no history: section omitted", !nh.text.includes("What changed") && nh.counts.changes === 0);
ok("db error reported", (await handle(req(), deps({ db: fakeDb({ failProjects: true }) }))).status === 500);
ok("missing mail settings reported", (await handle(req(), deps({ env: env({ DIGEST_TO: "" }) }))).status === 500);
const br = await handle(req(), deps({ fetch: (async () => new Response("domain not verified", { status: 403 })) as any }));
ok("Resend failure surfaced", br.status === 502 && (await br.json()).error.includes("domain not verified"));
const empty = buildDigest({ projects: [], todos: [], history: [], now });
ok("empty tracker", empty.subject === "Corp Dev weekly: 0 open projects, 0 to-dos due this week", empty.subject);

await Deno.writeTextFile(new URL("../out/digest_preview.html", import.meta.url), dry.html);
console.log(`${pass} passed, ${fail} failed`); if (fail) Deno.exit(1);
