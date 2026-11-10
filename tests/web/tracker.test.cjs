// Drives web/index.html in Chromium against the in-memory Supabase stand-in (mock-supabase.js).
// Every name below is made up. Never put real projects, people or transcripts in this repository.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const XLSX = require("xlsx"), JSZip = require("jszip");
const OUT = path.join(__dirname, "../out"); fs.mkdirSync(OUT, { recursive: true });
const WEB = path.join(__dirname, "../../web");
const MOCK = fs.readFileSync(__dirname + "/mock-supabase.js", "utf8");
const LIBS = { xlsx: fs.readFileSync(require.resolve("xlsx/dist/xlsx.full.min.js"), "utf8"), jszip: fs.readFileSync(require.resolve("jszip/dist/jszip.min.js"), "utf8") };
const BASE = "http://tracker.test/";
let pass = 0, fail = 0; const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log("FAIL " + n + " " + JSON.stringify(x ?? "")); } };
const iso = d => d.toISOString().slice(0, 10), DAY = 86400000, now = Date.now();
const dd = n => iso(new Date(now + n * DAY));
const LAST = dd(-4), PREV = dd(-11);

const seed = [
  ["projects", "p1", { name: "Harbor Review", category: "Portfolio Growth Initiatives", description: "Review of the internal operating model", status: "Active", corpDev: "ZT / WL", stakeholders: "A. Example", update: "- Draft out\n- Next: review with A. Example", updateDate: LAST, createdAt: now - 60 * DAY }],
  ["projects", "p2", { name: "Cell Partnership", category: "Strategy Refinement / Organic Growth Initiatives", description: "Reinsurance cell partnership with a sample partner", status: "Pending", corpDev: "WL", update: "- TBU", updateDate: PREV, createdAt: now - 90 * DAY }],
  ["projects", "p3", { name: "Project Lantern", category: "External Growth Initiatives", description: "Small sample MGA", status: "Active", stage: "NDA signed", corpDev: "WL / ZT", update: "- NDA signed", updateDate: dd(-40), createdAt: now - 90 * DAY, categorySource: "claude" }],
  ["projects", "p4", { name: "Town Hall Deck", category: "Other Projects", description: "Quarterly town hall slides", status: "Active", corpDev: "ZT", update: "- Finalising slides", updateDate: LAST, createdAt: now - 20 * DAY }],
  ["projects", "p5", { name: "Old Sample Deal", category: "External Growth Initiatives", description: "Passed", status: "Dropped", closedAt: dd(-100), update: "- Killed" }],
  ["todos", "t1", { text: "Send draft to A. Example", owner: "ZT", projectId: "p1", due: dd(2), done: false, meetingId: "m" + LAST, meetingDate: LAST, createdAt: now - 4 * DAY }],
  ["todos", "t2", { text: "Chase partner for proposal", owner: "WL", projectId: "p2", due: dd(-1), done: false, meetingId: "m" + PREV, meetingDate: PREV, createdAt: now - 11 * DAY }],
  ["todos", "t3", { text: "Book room", owner: "ZT", projectId: "p4", due: dd(20), done: false, meetingDate: LAST, createdAt: now - 4 * DAY }],
  ["todos", "r1", { kind: "reminder", person: "B. Sample", text: "Schedule a meeting", owner: "WL", projectId: "p3", due: "", done: false, meetingId: "m" + PREV, meetingDate: PREV, createdAt: now - 11 * DAY }],
  ["todos", "k1", { kind: "development", text: "Casualty rates starting to soften", notes: "Two brokers said renewals came in lower.", topic: "Industry trends", meetingId: "m" + LAST, meetingDate: LAST, createdAt: now - 4 * DAY }],
  ["todos", "k2", { kind: "development", text: "Sample Re results", notes: "", topic: "Company news", meetingId: "m" + PREV, meetingDate: PREV, createdAt: now - 11 * DAY }],
  ["settings", "contacts", { list: [{ id: "c1", name: "Jane Example", email: "jane@ascot.test" }, { id: "c2", name: "Sam Sample", email: "sam@ascot.test" }] }],
  ["todos", "e1", { kind: "event", text: "Global town hall", type: "Town hall", date: dd(5), endDate: "", location: "London", notes: "", createdAt: now }],
  ["todos", "e2", { kind: "event", text: "Leadership offsite", type: "Offsite", date: dd(10), endDate: dd(12), createdAt: now }],
  ["todos", "e3", { kind: "event", text: "Thanksgiving", type: "Holiday", date: dd(60), createdAt: now }],
  ["meetings", "m" + LAST, { date: LAST, title: "Weekly meeting", summary: "Covered the sample projects.", source: "transcript", snapshot: [{ id: "p1", name: "Harbor Review", category: "Portfolio Growth Initiatives", status: "Active", update: "- Draft out", description: "Review of the internal operating model" }] }],
  ["meetings", "m" + PREV, { date: PREV, title: "Weekly meeting", source: "import", snapshot: [] }],
];

const PROPOSAL = {
  summary: "Sample summary of the meeting.",
  project_updates: [
    { project_id: "p1", update: "- Reviewed draft\n- ZT to circulate", status: "", stage: "", description: "", stakeholders: "", corp_dev: "", reason: "Discussed" },
    { project_id: "p4", update: "- Slides sent", status: "Pending", stage: "", description: "", stakeholders: "", corp_dev: "", reason: "Waiting on HR" },
  ],
  new_projects: [{ name: "Project Kestrel", category: "External Growth Initiatives", category_reason: "Minority stake in an external MGA", quarter: "", description: "Sample MGA minority stake", stakeholders: "B. Sample", corp_dev: "WL", update: "- Teaser received", status: "Active", stage: "Screening" }],
  archive: [{ project_id: "p2", status: "Dropped", reason: "Partner withdrew" }],
  todos: [
    { text: "Review Kestrel teaser", owner: "WL", project_ref: "Project Kestrel", due: dd(3), quote: "WL will look at the teaser" },
    { text: "Circulate Harbor draft", owner: "ZT", project_ref: "p1", due: "", quote: "" },
    { text: "Unwanted item", owner: "", project_ref: "", due: "", quote: "" },
  ],
  events: [{ title: "Investor day", type: "Investor event", date: dd(20), end_date: "", notes: "New York", quote: "investor day on the date" }, { title: "Global town hall", type: "Town hall", date: dd(5), end_date: "", notes: "", quote: "" }],
  developments: [{ title: "Sample peer announced a sidecar", detail: "Discussed as a sign of more third-party capital.", topic: "Market and deals", quote: "they announced a sidecar" }],
  reminders: [{ person: "C. Person", about: "Check when he's back in New York", owner: "ZT", project_ref: "p1", due: "", quote: "check with C. Person" }],
  todos_done: [{ todo_id: "t1", reason: "Sent" }, { todo_id: "r1", reason: "Meeting booked" }],
};

async function page(b, { vp = { width: 1280, height: 900 }, seedRows = seed, hash = "#week", onFn } = {}) {
  const p = await b.newPage({ viewport: vp, acceptDownloads: true });
  p.errs = []; p.on("pageerror", e => p.errs.push(String(e)));
  await p.route("**/*", r => {
    const u = r.request().url();
    if (/supabase-js.*supabase\.js/.test(u)) return r.fulfill({ contentType: "application/javascript", body: MOCK });
    if (/xlsx.*\.js$/.test(u)) return r.fulfill({ contentType: "application/javascript", body: LIBS.xlsx });
    if (/jszip.*\.js$/.test(u)) return r.fulfill({ contentType: "application/javascript", body: LIBS.jszip });
    if (/config\.js/.test(u)) return r.fulfill({ contentType: "application/javascript", body: 'window.TRACKER_CONFIG={supabaseUrl:"https://a.supabase.co",supabaseAnonKey:"k"};' });
    if (/functions\/v1\/transcript/.test(u)) return onFn ? onFn(r) : r.fulfill({ status: 404, body: "{}" });
    if (u.startsWith(BASE)) return r.fulfill({ contentType: "text/html", body: fs.readFileSync(WEB + "/index.html", "utf8") });
    return r.fulfill({ status: 404, body: "" });
  });
  await p.addInitScript(s => { window.__seed = s; }, seedRows);
  await p.goto(BASE + hash); await p.waitForTimeout(400);
  return p;
}
const doc = (p, t, id) => p.evaluate(([t, id]) => window.__mock.doc(t, id), [t, id]);
const docs = (p, t) => p.evaluate(t => Object.values(window.__mock.store[t]).map(r => ({ id: r.id, ...r.doc })), t);

(async () => {
  const b = await chromium.launch();
  let p = await page(b);

  // ---- This week dashboard
  ok("title shows week of last meeting", /^Week of /.test(await p.textContent(".action-title")));
  const tiles = await p.$$eval(".tile b", x => x.map(e => e.textContent));
  ok("tiles: 3 active, 1 pending, 3 open to-dos, 2 updated", tiles.join(",") === "3,1,3,2", tiles);
  const heads = await p.$$eval("tr.cathead td", x => x.map(e => e.textContent.replace(/\s*\(\d+\)/, "").trim()));
  ok("all five categories, in order, even when empty", heads.join("|") === "Portfolio Growth Initiatives|Strategy Refinement / Organic Growth Initiatives|External Growth Initiatives|Quarterly Board Updates|Other Projects", heads);
  ok("description shown on the dashboard", (await p.textContent('tr[data-id="p1"] td.desc')).includes("Review of the internal operating model"));
  ok("dropped project not on the dashboard", !(await p.$('tr[data-id="p5"]')));
  ok("updated tag on p1", !!(await p.$('tr[data-id="p1"] .tag.upd')));
  ok("quiet tag on p3", !!(await p.$('tr[data-id="p3"] .tag.quiet')));
  ok("last updated shows the meeting date", (await p.textContent('tr[data-id="p1"] td.lastupd')).includes("4 days ago") && (await p.textContent('tr[data-id="p2"] td.lastupd')).includes("days ago"));
  ok("last updated flagged after three weeks", !!(await p.$('tr[data-id="p3"] td.lastupd .ago.late')) && (await p.textContent('tr[data-id="p3"] td.lastupd')).includes("5 weeks ago"));
  ok("pending pill", (await p.textContent('tr[data-id="p2"] .pill')).trim() === "Pending");
  ok("deal stage on external project", (await p.textContent('tr[data-id="p3"]')).includes("Deal stage: NDA signed"));
  const wk = await p.$$eval("section.cols .todo", x => x.map(e => e.dataset.id));
  ok("week to-dos: overdue first, later one left out", wk.join(",") === "t2,t1", wk);
  ok("carried-forward label", (await p.textContent('.todo[data-id="t2"]')).includes("Carried from"));
  ok("overdue marked", !!(await p.$('.todo[data-id="t2"] .due.over')));
  ok("no owner badge on the To-dos tab", (await p.textContent("#tagTodos")) === "");

  // reminders panel beside the table
  ok("reminders panel beside the table", (await p.$$(".weekgrid > aside.reminders")).length === 1);
  ok("reminder shows person and topic", (await p.textContent('.reminders .todo[data-id="r1"]')).includes("B. Sample: Schedule a meeting"));
  ok("reminders not counted as to-dos", tiles[2] === "3" && !(await p.$('section.cols .todo[data-id="r1"]')));
  ok("corp dev and stakeholders columns removed", (await p.$$eval("thead th", x => x.map(e => e.textContent).join("|"))) === "Project|Status|Description|This week's update|Last updated");
  await p.fill("#nr_person", "D. Example"); await p.fill("#nr_text", "Ask about the renewal"); await p.press("#nr_text", "Enter"); await p.waitForTimeout(200);
  const rNew = (await docs(p, "todos")).find(t => t.person === "D. Example");
  ok("reminder added from the panel", rNew && rNew.kind === "reminder" && rNew.text === "Ask about the renewal" && rNew.owner === "", rNew);
  await p.click(`.reminders .todo[data-id="${rNew.id}"] .tx`); await p.waitForSelector("#todoForm");
  ok("reminder opens with the person field", (await p.inputValue("#f_person")) === "D. Example");
  await p.fill("#f_person", "D. Example (Sample Co)"); await p.click('.drawer-f [data-act="save-todo"]'); await p.waitForTimeout(200);
  ok("reminder edited", (await doc(p, "todos", rNew.id)).person === "D. Example (Sample Co)");
  await p.click(`.reminders .todo[data-id="${rNew.id}"] input`); await p.waitForTimeout(800);
  ok("reminder ticked off leaves the panel", (await doc(p, "todos", rNew.id)).done === true && !(await p.$(`.reminders > ul .todo[data-id="${rNew.id}"]`)));
  ok("undo offered after ticking", (await p.textContent("#toastRoot")).includes("Followed up with D. Example (Sample Co)") && !!(await p.$('#toastRoot [data-act="toast-undo"]')));
  await p.click('#toastRoot [data-act="toast-undo"]'); await p.waitForTimeout(250);
  ok("undo puts it back", (await doc(p, "todos", rNew.id)).done === false && !!(await p.$(`.reminders > ul .todo[data-id="${rNew.id}"]`)));
  await p.click(`.reminders > ul .todo[data-id="${rNew.id}"] input`); await p.waitForTimeout(800);
  ok("done reminders kept under Show done", (await p.textContent(".remdone summary")).includes("Show done (1 this week"));
  await p.click(".remdone summary"); await p.click(`.remdone .todo[data-id="${rNew.id}"] input`); await p.waitForTimeout(400);
  ok("unticking from Show done reopens it", (await doc(p, "todos", rNew.id)).done === false);

  // calendar reminder for a contact
  await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  await p.click('.reminders .todo[data-id="r1"] .tx'); await p.waitForSelector("#calBox");
  ok("calendar box lists contact names only", (await p.$$eval("#cal_to option", o => o.map(x => x.textContent).join("|"))) === "Jane Example|Sam Sample" && !(await p.textContent("#calBox")).includes("@"));
  await p.selectOption("#cal_to", "c2"); const t0 = Date.now(); await p.click('[data-act="cal-open"][data-h="48"]'); await p.waitForTimeout(300);
  const opened = await p.evaluate(() => window.__opened);
  const u = new URL(opened[0]); const sd = Date.parse(u.searchParams.get("startdt"));
  ok("opens an Outlook event with the contact invited", opened.length === 1 && u.host === "outlook.office.com" && u.searchParams.get("to") === "sam@ascot.test" && u.searchParams.get("rru") === "addevent", opened);
  ok("event 48 hours out, quarter-hour, 15 minutes long", sd - t0 >= 48 * 3600000 - 60000 && sd - t0 <= 48 * 3600000 + 16 * 60000 && new Date(sd).getMinutes() % 15 === 0 && Date.parse(u.searchParams.get("enddt")) - sd === 15 * 60000);
  ok("event has the reminder details", u.searchParams.get("subject") === "Reminder: follow up with B. Sample" && u.searchParams.get("body").includes("Project Name: Project Lantern\nFollow-up task: Follow up with B. Sample: Schedule a meeting"), u.searchParams.get("body"));
  let r1 = await doc(p, "todos", "r1");
  ok("reminder records who and when", r1.calTo === "c2" && r1.calName === "Sam Sample" && r1.calAt === sd, r1);
  ok("drawer shows it", (await p.textContent("#calBox")).includes("Calendar reminder for Sam Sample"));
  ok("drawer previews the invite wording", (await p.textContent("#calBox .invprev pre")) === "Project Name: Project Lantern\nFollow-up task: Follow up with B. Sample: Schedule a meeting", await p.textContent("#calBox .invprev pre"));
  const [ics] = await Promise.all([p.waitForEvent("download"), p.click('[data-act="cal-ics"][data-h="24"]')]);
  const icsText = fs.readFileSync(await ics.path(), "utf8").replace(/\r\n /g, "");   // unfold long lines
  ok("desktop Outlook file has the invitee and alarm", /ATTENDEE;CN=Sam Sample;.*mailto:sam@ascot.test/.test(icsText) && icsText.includes("SUMMARY:Reminder: follow up with B. Sample") && icsText.includes("TRIGGER:-PT15M"), icsText.slice(0, 400));
  await p.click('.drawer-h [data-act="close"]'); await p.waitForTimeout(150);
  ok("panel shows the calendar reminder", (await p.textContent('.reminders .todo[data-id="r1"] .mailtag')).includes("Sam Sample"));
  // contacts in settings
  await p.click("#whoDot"); await p.click('#whoMenu [data-act="settings"]'); await p.waitForSelector("#f_contacts");
  ok("settings shows names with emails", (await p.inputValue("#f_contacts")) === "Jane Example (jane@ascot.test)\nSam Sample (sam@ascot.test)");
  await p.fill("#f_contacts", "Jane Example (jane@ascot.test)\nnot a contact line");
  await p.click('[data-act="save-settings"]'); await p.waitForTimeout(200);
  ok("bad contact line refused", (await p.textContent("#contactsErr")).includes("not a contact line") && (await doc(p, "settings", "contacts")).list.length === 2);
  await p.fill("#f_contacts", "Jane Example (jane@ascot.test)\nNew Person <new.person@ascot.test>");
  await p.click('[data-act="save-settings"]'); await p.waitForTimeout(300);
  const cl = (await doc(p, "settings", "contacts")).list;
  ok("contacts saved, keeping ids", cl.length === 2 && cl[0].id === "c1" && cl[1].name === "New Person" && cl[1].email === "new.person@ascot.test", cl);

  // tick a to-do
  await p.click('.todo[data-id="t1"] input[type=checkbox]'); await p.waitForTimeout(800);
  const t1 = await doc(p, "todos", "t1");
  ok("to-do ticked done", t1.done === true && !!t1.doneAt, t1);

  // ---- Project editor
  await p.click('tr[data-id="p3"]'); await p.waitForSelector("#projectForm");
  ok("stage field visible for external", await p.isVisible("#stageWrap"));
  ok("quarter hidden for external", !(await p.isVisible("#quarterWrap")));
  await p.selectOption("#f_category", "Portfolio Growth Initiatives");
  ok("stage hides when category changes", !(await p.isVisible("#stageWrap")));
  await p.click('.drawer-f [data-act="save-project"]'); await p.waitForTimeout(200);
  let p3 = await doc(p, "projects", "p3");
  ok("category correction recorded for a Claude category", p3.category === "Portfolio Growth Initiatives" && p3.categoryCorrected === true && p3.categorySuggested === "External Growth Initiatives" && p3.stage === "", p3);

  await p.click('tr[data-id="p4"]'); await p.waitForSelector("#projectForm");
  ok("project to-dos listed in drawer", (await p.$$("#projectForm .todo")).length === 1);
  await p.fill("#pt_text", "Print handouts"); await p.click('[data-act="add-ptodo"]'); await p.waitForTimeout(200);
  ok("to-do added from project drawer", (await docs(p, "todos")).some(t => t.text === "Print handouts" && t.projectId === "p4" && t.owner === ""));
  await p.selectOption("#f_status", "Completed"); await p.click('.drawer-f [data-act="save-project"]'); await p.waitForTimeout(200);
  const p4 = await doc(p, "projects", "p4");
  ok("completed project gets a closed date", p4.status === "Completed" && !!p4.closedAt, p4);
  await p.goto(BASE + "#archive"); await p.waitForTimeout(300);
  ok("archive lists completed and dropped", (await p.$$eval("tbody tr[data-id]", x => x.map(e => e.dataset.id).sort().join(","))) === "p4,p5");

  // conflict: someone else edits the same field while the drawer is open
  await p.goto(BASE + "#projects"); await p.waitForTimeout(300);
  await p.click('tr[data-id="p1"]'); await p.waitForSelector("#projectForm");
  await p.evaluate(() => window.__mock.otherSave("projects", "p1", { update: "- Their text" }, { notify: false }));
  await p.fill("#f_update", "- My text"); await p.click('.drawer-f [data-act="save-project"]'); await p.waitForTimeout(200);
  ok("conflict panel shown", await p.isVisible(".conflict"));
  await p.click('[data-act="cf-pick"][data-c="mine"]'); await p.click('.conflict [data-act="save-project"]'); await p.waitForTimeout(200);
  ok("my value kept after choosing", (await doc(p, "projects", "p1")).update === "- My text");

  // filters
  await p.click('.fchip[data-act="pf"][data-v="Pending"]');
  ok("pending filter", (await p.$$eval("tbody tr[data-id]", x => x.map(e => e.dataset.id).join(","))) === "p2");
  await p.click('.fchip[data-act="pf"][data-v="open"]'); await p.click('.fchip[data-act="ppl"][data-v="ZT"]');
  ok("person filter", (await p.$$eval("tbody tr[data-id]", x => x.map(e => e.dataset.id).sort().join(","))) === "p1,p3");
  await p.fill("#q", "lantern"); await p.waitForTimeout(50);
  ok("search keeps focus", await p.evaluate(() => document.activeElement.id === "q"));
  await p.close();

  // ---- Transcript: read with Claude, review, save
  let sent = null;
  p = await page(b, { onFn: async r => { sent = JSON.parse(r.request().postData()); await new Promise(res => setTimeout(res, 150)); r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ proposal: PROPOSAL }) }); } });
  await p.click('[data-act="import-tr"]'); await p.waitForSelector("#trForm");
  await p.click('[data-act="tr-read"]'); await p.waitForTimeout(100);
  ok("empty transcript refused", (await p.textContent("#trForm")).includes("Add the transcript first"));
  const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\n<v Will Lane>Kestrel teaser came in.</v>\n\n2\n00:00:04.000 --> 00:00:06.000\n<v Will Lane>I'll look at it.</v>\n\n3\n00:00:06.000 --> 00:00:09.000\n<v Zoe Tester>Harbor draft is done.</v>\n";
  await p.setInputFiles("#f_tfile", { name: "meeting.vtt", mimeType: "text/vtt", buffer: Buffer.from(vtt) }); await p.waitForTimeout(200);
  const txt = await p.inputValue("#f_ttext");
  ok("vtt read into speaker lines", txt === "Will Lane: Kestrel teaser came in. I'll look at it.\nZoe Tester: Harbor draft is done.", txt);
  const zip = new JSZip(); zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Will Lane   0:03</w:t></w:r></w:p><w:p><w:r><w:t>Kestrel </w:t></w:r><w:r><w:t>teaser.</w:t></w:r></w:p></w:body></w:document>');
  await p.setInputFiles("#f_tfile", { name: "meeting.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await zip.generateAsync({ type: "nodebuffer" }) }); await p.waitForTimeout(300);
  ok("docx read", (await p.inputValue("#f_ttext")) === "Will Lane   0:03\nKestrel teaser.", await p.inputValue("#f_ttext"));
  await p.fill("#f_mdate", dd(0));
  await p.click('[data-act="tr-read"]'); await p.waitForSelector(".busy");
  ok("busy state while Claude reads", await p.isVisible(".busy"));
  await p.waitForSelector("#rvBody");
  ok("request carries open projects only", sent && sent.projects.map(x => x.id).sort().join(",") === "p1,p2,p3,p4", sent && sent.projects.map(x => x.id));
  ok("request carries categorised examples incl. archived", sent.examples.some(e => e.name === "Old Sample Deal"));
  ok("request carries open to-dos, reminders and team initials, not developments", sent.openTodos.length === 4 && sent.openTodos.some(t => t.text === "Reminder: follow up with B. Sample: Schedule a meeting") && sent.team.some(t => t.initials === "WL"), sent.openTodos);
  ok("review lists all sections", (await p.$$eval("#rvBody h3.sec", x => x.map(e => e.textContent.replace(/\s*\d+$/, "").trim()).join("|"))) === "Project updates|New projects|Take off the list|To-dos for the week|Reminders: people to follow up with|Key developments|Calendar events|Open to-dos and reminders the meeting said are done");
  ok("old update shown for comparison", (await p.textContent("#rvBody .rv .old")).includes("Draft out"));
  ok("Claude's category reason shown", (await p.textContent("#rvBody")).includes("Minority stake in an external MGA"));
  await p.uncheck('[data-rv="t.2.take"]');
  await p.fill('[data-rv="u.0.update"]', "- Reviewed draft (edited)");
  await p.click('[data-act="tr-save"]'); await p.waitForTimeout(150);
  ok("category must be confirmed before saving", (await docs(p, "projects")).length === 5);
  await p.check('[data-rv="n.0.catOk"]');
  await p.click('[data-act="tr-save"]'); await p.waitForTimeout(600);
  const P = await docs(p, "projects"), T = await docs(p, "todos"), M = await docs(p, "meetings");
  const kes = P.find(x => x.name === "Project Kestrel");
  ok("edited update saved", P.find(x => x.id === "p1").update === "- Reviewed draft (edited)" && P.find(x => x.id === "p1").updateDate === dd(0));
  ok("status change saved", P.find(x => x.id === "p4").status === "Pending");
  ok("new project created with Claude's category", kes && kes.category === "External Growth Initiatives" && kes.categorySource === "claude" && kes.stage === "Screening" && kes.createdInMeeting === "m" + dd(0), kes);
  ok("archived as dropped", P.find(x => x.id === "p2").status === "Dropped" && P.find(x => x.id === "p2").closedAt === dd(0));
  ok("to-do linked to the new project", T.some(t => t.text === "Review Kestrel teaser" && t.projectId === kes.id && t.meetingId === "m" + dd(0)));
  ok("unticked to-do not saved", !T.some(t => t.text === "Unwanted item"));
  ok("done to-do marked", T.find(t => t.id === "t1").done === true);
  ok("reminder from the transcript saved", T.some(t => t.kind === "reminder" && t.person === "C. Person" && t.text === "Check when he's back in New York" && t.projectId === "p1" && t.meetingId === "m" + dd(0)));
  ok("reminder the meeting closed is done", T.find(t => t.id === "r1").done === true);
  ok("calendar event from the transcript saved", T.some(t => t.kind === "event" && t.text === "Investor day" && t.type === "Investor event" && t.date === dd(20) && t.notes === "New York"));
  ok("event already on the calendar not added twice", T.filter(t => t.kind === "event" && t.text === "Global town hall").length === 1);
  ok("key development from the transcript saved", T.some(t => t.kind === "development" && t.text === "Sample peer announced a sidecar" && t.topic === "Market and deals" && t.notes.startsWith("Discussed") && t.meetingId === "m" + dd(0)));
  const mt = M.find(m => m.id === "m" + dd(0));
  ok("meeting recorded with snapshot incl. the dropped project", mt && mt.summary === "Sample summary of the meeting." && mt.snapshot.some(s => s.id === "p2" && s.status === "Dropped") && mt.snapshot.some(s => s.name === "Project Kestrel"), mt);
  await p.waitForTimeout(200);
  ok("dashboard shows the new meeting", (await p.textContent(".action-title")).includes("Week of"));
  ok("new tag on the new project", !!(await p.$(`tr[data-id="${kes.id}"] .tag.new`)));
  await p.close();

  // automatic filing: no confirmation needed, project tagged to check
  p = await page(b, { seedRows: [...seed, ["settings", "claude", { autoCategory: true }]], onFn: r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ proposal: { ...PROPOSAL, project_updates: [], archive: [], todos: [], todos_done: [] } }) }) });
  await p.click('[data-act="import-tr"]'); await p.fill("#f_ttext", "Some text"); await p.click('[data-act="tr-read"]'); await p.waitForSelector("#rvBody");
  ok("no confirm box when filing automatically", !(await p.$('[data-rv="n.0.catOk"]')));
  await p.click('[data-act="tr-save"]'); await p.waitForTimeout(500);
  const k2 = (await docs(p, "projects")).find(x => x.name === "Project Kestrel");
  ok("auto-filed project tagged to check", k2 && k2.categoryCheck === true);
  ok("check-category tag on dashboard", !!(await p.$(`tr[data-id="${k2.id}"] .tag.chk`)));
  await p.close();

  // error from the function is shown, form kept
  p = await page(b, { onFn: r => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "The transcript reader has no Anthropic API key yet." }) }) });
  await p.click('[data-act="import-tr"]'); await p.fill("#f_ttext", "Hello"); await p.click('[data-act="tr-read"]'); await p.waitForTimeout(300);
  ok("function error shown and text kept", (await p.textContent("#trForm")).includes("no Anthropic API key") && (await p.inputValue("#f_ttext")) === "Hello");
  await p.close();

  // ---- Workbook import into an empty tracker, then export
  const wb = XLSX.utils.book_new();
  const cur = [["", "", "Project", "Description", "Stakeholders", "Corp Dev", "11/2/2026 Status"],
    ["", "Portfolio Growth Initiatives", "Alpha Plan", "- Internal plan", "A. Person", "WL / ZT", "- Drafting"],
    ["", "", "Beta Tracking", "- Tracker", "", "WL", "- TBU"],
    ["", "Strategy Refinement / Organic Growth Initiatives", "Gamma Cell", "- Cell deal", "", "", "- Awaiting proposal"],
    ["", "External Growth Initiatives/ M&A", "Delta MGA", "- Small MGA", "", "", "- NDA ongoing"],
    ["", "Quarterly Board Update", "", "", "", "", ""],
    ["", "Other Projects", "Town Hall", "- Global town hall", "", "", "- "]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cur), "Current");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["", "Project", "Description", "Stakeholders", "Corp Dev", ""], ["", "Old One", "- Done deck", "", "JD", "- Completed"], ["", "Old Two", "- Target", "", "WL", "- Killed"]]), "Old Projects");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["", "", "Project", "Description", "Stakeholders", "Corp Dev", "10/27/2026 Status"], ["", "Portfolio Growth Initiatives", "Alpha Plan", "- Internal plan", "", "WL", "- Started"]]), "10.27.26");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  p = await page(b, { seedRows: [] });
  ok("empty tracker offers the workbook import", !!(await p.$('.empty [data-act="import-wb"]')));
  await p.click('.empty [data-act="import-wb"]'); await p.setInputFiles("#f_wbfile", { name: "list.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf }); await p.waitForTimeout(400);
  ok("preview counts", (await p.$$eval("#wbForm .tile b", x => x.map(e => e.textContent).join(","))) === "5,2,2", await p.$$eval("#wbForm .tile b", x => x.map(e => e.textContent)));
  await p.click('[data-act="wb-save"]'); await p.waitForTimeout(800);
  const IP = await docs(p, "projects"), IM = await docs(p, "meetings");
  const by = n => IP.find(x => x.name === n) || {};
  ok("categories carried down", by("Beta Tracking").category === "Portfolio Growth Initiatives" && by("Delta MGA").category === "External Growth Initiatives" && by("Town Hall").category === "Other Projects");
  ok("statuses from the update text", by("Alpha Plan").status === "Active" && by("Beta Tracking").status === "Pending" && by("Gamma Cell").status === "Pending" && by("Town Hall").status === "Pending");
  ok("old projects archived", by("Old One").status === "Completed" && by("Old Two").status === "Dropped");
  ok("corp dev spacing normalised", by("Alpha Plan").corpDev === "WL / ZT");
  ok("weekly snapshots imported", IM.map(m => m.date).sort().join(",") === "2026-10-27,2026-11-02", IM.map(m => m.date));
  ok("snapshot linked to project ids", IM.find(m => m.date === "2026-10-27").snapshot[0].id === by("Alpha Plan").id);
  await p.waitForTimeout(200);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click('.headacts [data-act="export-xlsx"]')]);
  const fp = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(fp);
  const back = XLSX.readFile(fp);
  ok("export file name", /^Corp_Dev_Project_List_As_of_11\.02\.26\.xlsx$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  ok("export sheets", back.SheetNames.join(",") === "Current,To-dos,Old Projects,Reminders,Key developments,Calendar,11.02.26,10.27.26", back.SheetNames);
  const curBack = XLSX.utils.sheet_to_json(back.Sheets.Current, { header: 1, defval: "" });
  ok("export keeps the empty board category heading", curBack.some(r => r[0] === "Quarterly Board Updates"));
  // re-import the export: same projects are skipped
  await p.click("#whoDot"); await p.click('#whoMenu [data-act="import-wb"]'); await p.setInputFiles("#f_wbfile", fp); await p.waitForTimeout(400);
  ok("re-import skips projects already there", (await p.textContent("#wbForm")).includes("already in the tracker"));
  await p.click('.drawer-h [data-act="close"]');
  await p.screenshot({ path: path.join(OUT, "week-imported.png"), fullPage: true });
  ok("no page errors", !p.errs.length, p.errs);
  await p.close();

  // ---- To-dos page and phone layout
  p = await page(b, { hash: "#todos" });
  ok("todos default open, reminders not listed", (await p.$$eval(".todo", x => x.length)) === 3);
  ok("no Mine filter, owner filters or owner box", !(await p.$('.fchip[data-act="tf"][data-v="mine"]')) && !(await p.$('.fchip[data-act="tpl"]')) && !(await p.$("#nt_owner")));
  await p.fill("#nt_text", "New sample task"); await p.press("#nt_text", "Enter"); await p.waitForTimeout(200);
  ok("add to-do from the to-dos page", (await docs(p, "todos")).some(t => t.text === "New sample task" && t.owner === ""));
  await p.click('.fchip[data-act="tf"][data-v="open"]'); await p.click('.todo[data-id="t2"] .tx'); await p.waitForSelector("#todoForm");
  await p.fill("#f_owner", "zt"); await p.click('.drawer-f [data-act="save-todo"]'); await p.waitForTimeout(200);
  ok("owner saved upper-case", (await doc(p, "todos", "t2")).owner === "ZT");
  await p.goto(BASE + "#meetings"); await p.waitForTimeout(200);
  await p.click(".mlist li.click"); await p.waitForSelector(".drawer.wide");
  ok("meeting drawer shows snapshot", (await p.textContent(".drawer")).includes("Harbor Review"));
  ok("meeting drawer lists its key developments", (await p.textContent(".drawer")).includes("Casualty rates starting to soften"));
  await p.click('.drawer-h [data-act="close"]');
  // key developments tab
  await p.goto(BASE + "#developments"); await p.waitForTimeout(300);
  ok("developments tab grouped by meeting, newest first", (await p.$$eval(".dev", x => x.map(e => e.dataset.id).join(","))) === "k1,k2");
  ok("this week's group labelled", (await p.textContent("section h3.sec")).startsWith("This week: meeting on"));
  ok("developments not counted as to-dos", !(await p.$('.todo[data-id="k1"]')));
  await p.click('.fchip[data-act="dtopic"][data-v="Company news"]');
  ok("topic filter", (await p.$$eval(".dev", x => x.map(e => e.dataset.id).join(","))) === "k2");
  await p.click('.fchip[data-act="dtopic"][data-v="all"]');
  await p.fill("#nd_text", "New regulation on sample captives"); await p.selectOption("#nd_topic", "Regulation"); await p.fill("#nd_notes", "Comment period closes soon.");
  await p.click('#addDevForm button'); await p.waitForTimeout(200);
  const kNew = (await docs(p, "todos")).find(t => t.text === "New regulation on sample captives");
  ok("key development added by hand", kNew && kNew.kind === "development" && kNew.topic === "Regulation" && kNew.notes === "Comment period closes soon.", kNew);
  await p.click('.dev[data-id="k2"]'); await p.waitForSelector("#f_topic");
  await p.fill("#f_text", "Sample Re results beat"); await p.click('.drawer-f [data-act="save-todo"]'); await p.waitForTimeout(200);
  ok("key development edited", (await doc(p, "todos", "k2")).text === "Sample Re results beat");
  await p.fill("#dq", "regulation"); await p.waitForTimeout(50);
  ok("search", (await p.$$(".dev")).length === 1 && await p.evaluate(() => document.activeElement.id === "dq"));
  // calendar
  await p.goto(BASE + "#week"); await p.waitForTimeout(300);
  ok("dashboard coming up: next 30 days only", (await p.textContent("section.cols")).includes("Global town hall") && (await p.textContent("section.cols")).includes("Leadership offsite") && !(await p.textContent("section.cols")).includes("Thanksgiving"));
  await p.goto(BASE + "#calendar"); await p.waitForTimeout(300);
  const monthOf = d => d.slice(0, 7), calCur = monthOf(dd(0));
  await p.evaluate(m => { S.calMonth = m; render(); }, monthOf(dd(5)));
  ok("town hall on its day", (await p.$$eval(".calgrid .ev", x => x.filter(e => e.dataset.id === "e1").length)) === 1);
  await p.evaluate(m => { S.calMonth = m; render(); }, monthOf(dd(11)));
  const offDays = await p.$$eval('.calgrid .ev[data-id="e2"]', x => x.length);
  ok("multi-day offsite spans its days", offDays >= 1 && offDays <= 3, offDays);
  await p.evaluate(m => { S.calMonth = m; render(); }, calCur);
  await p.click('[data-act="cal-month"][data-v="1"]');
  const next = await p.evaluate(() => S.calMonth);
  ok("next month", next > calCur, next);
  await p.click('[data-act="cal-month"][data-v="0"]');
  ok("today button", (await p.evaluate(() => S.calMonth)) === "" && !!(await p.$(".calgrid .day.today")));
  await p.fill("#ne_text", "Strategy day"); await p.selectOption("#ne_type", "Strategy day"); await p.fill("#ne_date", dd(40)); await p.fill("#ne_end", dd(39));
  await p.click("#addEvForm button"); await p.waitForTimeout(250);
  const ne = (await docs(p, "todos")).find(t => t.text === "Strategy day");
  ok("event added, bad end date dropped, calendar jumps to its month", ne && ne.kind === "event" && ne.type === "Strategy day" && ne.date === dd(40) && ne.endDate === "" && (await p.evaluate(() => S.calMonth)) === dd(40).slice(0, 7), ne);
  ok("agenda lists the month's events", (await p.textContent(".agenda")).includes("Strategy day"));
  await p.click(`.agenda li[data-id="${ne.id}"]`); await p.waitForSelector("#f_etype");
  await p.selectOption("#f_etype", "Holiday"); await p.fill("#f_location", "All offices"); await p.click('.drawer-f [data-act="save-todo"]'); await p.waitForTimeout(250);
  ok("event edited", (await doc(p, "todos", ne.id)).type === "Holiday" && (await doc(p, "todos", ne.id)).location === "All offices");
  await p.click(`.agenda li[data-id="${ne.id}"]`); await p.waitForSelector("#f_etype");
  const [evDl] = await Promise.all([p.waitForEvent("download"), p.click('[data-act="ev-ics"]')]);
  const evIcs = fs.readFileSync(await evDl.path(), "utf8");
  ok("event calendar file is an all-day event", evIcs.includes("DTSTART;VALUE=DATE:" + dd(40).replace(/-/g, "")) && evIcs.includes("SUMMARY:Strategy day") && evIcs.includes("LOCATION:All offices"));
  await p.click('.drawer-h [data-act="close"]');
  await p.click('.fchip[data-act="etype"][data-v="Holiday"]');
  ok("type filter", (await p.$$eval(".agenda li", x => x.length)) === 1);
  ok("no page errors (2)", !p.errs.length, p.errs);
  await p.screenshot({ path: path.join(OUT, "meeting.png") });
  await p.close();

  for (const w of [320, 390]) {
    const m = await page(b, { vp: { width: w, height: 800 } });
    for (const v of ["week", "projects", "todos", "archive", "developments", "calendar", "meetings"]) {
      await m.goto(BASE + "#" + v); await m.waitForTimeout(250);
      const sw = await m.evaluate(() => document.documentElement.scrollWidth); ok(`no sideways scroll ${w} ${v}`, sw <= w, sw);
    }
    await m.goto(BASE + "#week"); await m.waitForTimeout(250);
    ok(`description visible on phone ${w}`, await m.isVisible('tr[data-id="p1"] .mob'));
    if (w === 390) await m.screenshot({ path: path.join(OUT, "week-phone.png"), fullPage: true });
    await m.close();
  }
  await b.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
