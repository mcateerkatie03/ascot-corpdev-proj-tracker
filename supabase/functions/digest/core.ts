// Weekly digest: what needs attention on the Corp Dev project list. Pure functions, no I/O, so they can be tested.
// The rules match the website: open = Active or Pending; a project is quiet after 21 days without an update.

export type Doc = Record<string, unknown> & { id: string };
export type HistoryRow = { tbl: string; record_id: string; op: string; changes: Record<string, any>; changed_at: string };

const OPEN = ["Active", "Pending"];
const QUIET_DAYS = 21;
const DAY = 86_400_000;

const statusOf = (p: Doc) => (["Active", "Pending", "Completed", "Dropped"].includes(String(p.status)) ? String(p.status) : "Active");
const isOpen = (p: Doc) => OPEN.includes(statusOf(p));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(toIso + "T00:00:00Z") - Date.parse(fromIso + "T00:00:00Z")) / DAY);
const fmtDate = (s: string) => { const d = new Date(s + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC", ...(d.getUTCFullYear() !== new Date().getUTCFullYear() ? { year: "numeric" as const } : {}) }); };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export type Digest = {
  subject: string; text: string; html: string;
  counts: { open: number; pending: number; overdue: number; dueThisWeek: number; quiet: number; reminders: number; changes: number };
};

export function buildDigest(input: { projects: Doc[]; todos: Doc[]; history?: HistoryRow[] | null; now: number; siteUrl?: string }): Digest {
  const { projects, now } = input;
  const todos = input.todos.filter((t) => t.kind !== "reminder" && t.kind !== "development" && t.kind !== "event");
  const events = input.todos.filter((t) => t.kind === "event" && String(t.endDate || t.date) >= iso(now) && String(t.date) <= iso(now + 7 * DAY))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const developments = input.todos.filter((t) => t.kind === "development" && String(t.meetingDate || (Number(t.createdAt) > 1e11 ? iso(Number(t.createdAt)) : "")) >= iso(now - 7 * DAY));
  const reminders = input.todos.filter((t) => t.kind === "reminder" && !t.done);
  const today = iso(now);
  const site = (input.siteUrl ?? "").replace(/\/+$/, "");
  const link = (kind: string, id: string) => (site ? `${site}/#${kind}/${encodeURIComponent(id)}` : "");
  const name = (id: unknown) => String(projects.find((p) => p.id === id)?.name ?? "");

  const open = projects.filter(isOpen);
  const pending = open.filter((p) => statusOf(p) === "Pending");
  const openTodos = todos.filter((t) => !t.done);
  const overdue = openTodos.filter((t) => t.due && daysBetween(today, String(t.due)) < 0).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const dueThisWeek = openTodos.filter((t) => { if (!t.due) return false; const n = daysBetween(today, String(t.due)); return n >= 0 && n <= 7; })
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const lastUpdate = (p: Doc) => String(p.updateDate || (Number(p.createdAt) > 1e11 ? iso(Number(p.createdAt)) : ""));
  const quiet = open.filter((p) => { const d = lastUpdate(p); return !!d && daysBetween(d, today) >= QUIET_DAYS; })
    .sort((a, b) => lastUpdate(a).localeCompare(lastUpdate(b)));

  const since = now - 7 * DAY;
  const changes: string[] = [];
  for (const r of (input.history ?? []).filter((r) => r.tbl === "projects" && Date.parse(r.changed_at) >= since)) {
    const n = name(r.record_id) || String(r.changes?.doc?.name ?? r.changes?.name?.to ?? "A deleted project");
    if (r.op === "insert" && OPEN.includes(String(r.changes?.doc?.status ?? "Active"))) changes.push(`New project: ${n}`);
    else if (r.op === "update" && r.changes?.status && r.changes.status.from !== r.changes.status.to) changes.push(`${n}: ${r.changes.status.from ?? "Active"} to ${r.changes.status.to ?? "Active"}`);
  }

  const counts = { open: open.length, pending: pending.length, overdue: overdue.length, dueThisWeek: dueThisWeek.length, quiet: quiet.length, reminders: reminders.length, changes: changes.length };
  const subject = `Corp Dev weekly: ${open.length} open project${open.length === 1 ? "" : "s"}, ${dueThisWeek.length} to-do${dueThisWeek.length === 1 ? "" : "s"} due this week` +
    (overdue.length ? `, ${overdue.length} overdue` : "");

  const todoLine = (t: Doc) => `${t.owner ? `${t.owner}: ` : ""}${t.text}${t.projectId && name(t.projectId) ? ` (${name(t.projectId)})` : ""}, due ${fmtDate(String(t.due))}`;
  type Item = { text: string; href?: string };
  const sections: { title: string; items: Item[]; empty: string }[] = [
    { title: "Overdue to-dos", empty: "None.", items: overdue.map((t) => ({ text: todoLine(t), href: link("todo", t.id) })) },
    { title: "To-dos due this week", empty: "None.", items: dueThisWeek.map((t) => ({ text: todoLine(t), href: link("todo", t.id) })) },
    { title: "Reminders: people to follow up with", empty: "None.", items: reminders.map((t) => ({ text: `${t.owner ? `${t.owner}: ` : ""}follow up with ${t.person || "someone"}${t.text ? `, ${t.text}` : ""}${t.projectId && name(t.projectId) ? ` (${name(t.projectId)})` : ""}`, href: link("todo", t.id) })) },
    { title: "Coming up this week", empty: "Nothing on the calendar.", items: events.map((e) => ({ text: `${fmtDate(String(e.date))}${e.endDate ? ` to ${fmtDate(String(e.endDate))}` : ""}: ${e.text}${e.type ? ` (${e.type})` : ""}`, href: site ? `${site}/#calendar` : "" })) },
    { title: "Key developments from the last week", empty: "None recorded.", items: developments.map((d) => ({ text: `${d.topic ? `${d.topic}: ` : ""}${d.text || ""}${d.notes ? `. ${String(d.notes).split("\n")[0]}` : ""}`, href: site ? `${site}/#developments` : "" })) },
    { title: "Pending projects", empty: "None.", items: pending.map((p) => ({ text: `${p.name}${p.update ? `: ${String(p.update).split("\n")[0].replace(/^-\s*/, "")}` : ""}`, href: link("project", p.id) })) },
    { title: `Quiet: no update in ${QUIET_DAYS / 7} weeks`, empty: "None.", items: quiet.map((p) => ({ text: `${p.name}: last update ${fmtDate(lastUpdate(p))}`, href: link("project", p.id) })) },
  ];
  if (input.history) sections.push({ title: "What changed in the last 7 days", empty: "No changes.", items: changes.slice(0, 20).map((t) => ({ text: t })) });

  const headline = `${open.length} open project${open.length === 1 ? "" : "s"} (${pending.length} pending), ${openTodos.length} open to-do${openTodos.length === 1 ? "" : "s"}.`;
  const text = [
    `Corp Dev weekly, ${fmtDate(today)}`, headline, "",
    ...sections.flatMap((s) => [s.title, ...(s.items.length ? s.items.map((i) => `- ${i.text}${i.href ? ` ${i.href}` : ""}`) : [`- ${s.empty}`]), ""]),
    site ? `Open the tracker: ${site}` : "",
    "Confidential: corporate development use only.",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#FFFFFF;font-family:Arial,Helvetica,sans-serif;color:#262166">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:6px;background:#EB008C"></td></tr></table>
<div style="max-width:640px;margin:0 auto;padding:20px 16px">
<div style="font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase">Corporate development</div>
<h1 style="margin:4px 0 6px;font-size:22px;font-weight:normal;color:#EB008C">Corp Dev weekly, ${esc(fmtDate(today))}</h1>
<p style="margin:0 0 18px;font-size:14px">${esc(headline)}</p>
${sections.map((s) => `<h2 style="margin:18px 0 6px;font-size:15px;color:#262166;border-bottom:1px solid #D9DCE6;padding-bottom:4px">${esc(s.title)}</h2>
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5">${s.items.length ? s.items.map((i) => `<li>${i.href ? `<a href="${esc(i.href)}" style="color:#00539E">${esc(i.text)}</a>` : esc(i.text)}</li>`).join("") : `<li style="color:#666666">${esc(s.empty)}</li>`}</ul>`).join("\n")}
${site ? `<p style="margin:22px 0 0"><a href="${esc(site)}" style="display:inline-block;background:#262166;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:9px 16px">Open the tracker</a></p>` : ""}
<p style="margin:22px 0 0;font-size:11px;color:#666666">Confidential: corporate development use only. Sent by the Corp Dev tracker weekly digest.</p>
</div></body></html>`;

  return { subject, text, html, counts };
}
