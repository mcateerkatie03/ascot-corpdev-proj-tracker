// Emailed reminders: which reminders are due, and the email for each. Pure functions, no I/O, so they can be tested.
//
// A reminder (a row in `todos` with doc.kind "reminder") is emailed when someone picks a contact and "in 24 hours"
// or "in 48 hours" on the site. The page stores emailTo (a contact id from the settings row "contacts"),
// emailName, sendAt (ms) and emailStatus "scheduled". This function's job sends it once sendAt has passed.

export type Doc = Record<string, unknown> & { id: string };
export type Contact = { id: string; name: string; email: string };

/** Reminders scheduled for more than this long past their send time are not sent (e.g. email wasn't set up yet). */
export const MAX_LATE_MS = 3 * 86_400_000;

const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+$/;
export const isEmail = (s: unknown) => EMAIL_RE.test(String(s ?? "").trim());

export function readContacts(doc: unknown): Contact[] {
  const list = Array.isArray((doc as { list?: unknown })?.list) ? (doc as { list: unknown[] }).list : [];
  return list.map((c) => c as Record<string, unknown>)
    .filter((c) => c && c.id && c.name && isEmail(c.email))
    .map((c) => ({ id: String(c.id), name: String(c.name).trim(), email: String(c.email).trim() }));
}

export type Plan = { send: { row: Doc; contact: Contact }[]; skip: { row: Doc; status: string; error: string }[] };

/** Splits scheduled reminders into ones to send now and ones to close without sending. Not-yet-due ones are left alone. */
export function plan(rows: Doc[], contacts: Contact[], now: number): Plan {
  const out: Plan = { send: [], skip: [] };
  for (const row of rows) {
    if (row.kind !== "reminder" || row.emailStatus !== "scheduled") continue;
    const at = Number(row.sendAt);
    if (!Number.isFinite(at) || at > now) continue;
    if (row.done) { out.skip.push({ row, status: "cancelled", error: "Reminder was ticked off before the email was due" }); continue; }
    const contact = contacts.find((c) => c.id === row.emailTo);
    if (!contact) { out.skip.push({ row, status: "failed", error: "That person is no longer on the contacts list" }); continue; }
    if (now - at > MAX_LATE_MS) { out.skip.push({ row, status: "failed", error: "Not sent: more than 3 days late (email wasn't set up in time)" }); continue; }
    out.send.push({ row, contact });
  }
  return out;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const fmtDate = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function buildEmail(row: Doc, contact: Contact, projectName: string, siteUrl?: string) {
  const site = (siteUrl ?? "").replace(/\/+$/, "");
  const link = site ? `${site}/#todo/${encodeURIComponent(row.id)}` : "";
  const who = String(row.person || "").trim();
  const about = String(row.text || "").trim();
  const first = contact.name.split(/\s+/)[0] || contact.name;
  const subject = who ? `Reminder: follow up with ${who}` : `Reminder: ${about || "follow-up"}`;
  const lines: [string, string][] = [];
  if (who) lines.push(["Follow up with", who]);
  if (about) lines.push(["About", about]);
  if (projectName) lines.push(["Project", projectName]);
  if (row.due) lines.push(["By", fmtDate(String(row.due))]);
  if (row.notes) lines.push(["Notes", String(row.notes)]);
  const text = [`Hi ${first},`, "", "A reminder from the Corp Dev tracker:", "", ...lines.map(([k, v]) => `${k}: ${v}`), "",
    link ? `Open it in the tracker: ${link}` : "", "Once you've followed up, tick it off in the tracker's Reminders panel.", "", "Confidential: corporate development use only."].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#FFFFFF;font-family:Arial,Helvetica,sans-serif;color:#262166">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:6px;background:#944599"></td></tr></table>
<div style="max-width:560px;margin:0 auto;padding:20px 16px">
<div style="font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase">Corporate development</div>
<h1 style="margin:4px 0 14px;font-size:21px;font-weight:normal;color:#EB008C">${esc(subject)}</h1>
<p style="margin:0 0 14px;font-size:14px">Hi ${esc(first)}, a reminder from the Corp Dev tracker:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;border-left:4px solid #944599;background:#F5F5FA;width:100%">
${lines.map(([k, v]) => `<tr><td style="padding:8px 12px;font-weight:bold;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:8px 12px;white-space:pre-wrap">${esc(v)}</td></tr>`).join("")}
</table>
${link ? `<p style="margin:18px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#262166;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:9px 16px">Open in the tracker</a></p>` : ""}
<p style="margin:14px 0 0;font-size:13px">Once you've followed up, tick it off in the tracker's Reminders panel.</p>
<p style="margin:22px 0 0;font-size:11px;color:#666666">Confidential: corporate development use only. Sent by the Corp Dev tracker.</p>
</div></body></html>`;
  return { subject, text, html };
}
