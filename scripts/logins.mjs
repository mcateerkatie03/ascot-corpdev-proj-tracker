#!/usr/bin/env node
// Manage tracker logins. Runs on your own machine with the Supabase secret key.
//
//   node scripts/logins.mjs add <username> "<Full name>" <INITIALS>    e.g. add wlane "Will Lane" WL
//   node scripts/logins.mjs initials <username> <INITIALS>            change someone's initials
//   node scripts/logins.mjs reset <username>                          new random password
//   node scripts/logins.mjs remove <username>
//   node scripts/logins.mjs list
//
// Every login can read and edit the tracker; there are no roles. Initials should match the "Corp Dev" column
// (WL, ZT and so on) so that "Mine" filters and to-do owners line up.
// Needs: SUPABASE_URL and SUPABASE_SECRET_KEY (the sb_secret_... key; the legacy SUPABASE_SERVICE_ROLE_KEY also works).
// Optional: USERNAME_DOMAIN (must match the site's setting). Passwords are printed once and never stored in plain text.

import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, "");
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const domain = process.env.USERNAME_DOMAIN || "corpdev-tracker.local";
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY first (Supabase dashboard > Project settings > API Keys; the secret key starts with sb_secret_).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function password() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const pick = () => Array.from({ length: 6 }, () => a[randomInt(a.length)]).join("");
  return `${pick()}-${pick()}-${pick()}`;
}
const email = (u) => `${u}@${domain}`;
function checkUsername(u) {
  if (!/^[a-z0-9._-]{2,40}$/.test(u || "")) throw new Error(`"${u}" is not a valid username: use 2 to 40 lowercase letters, numbers, dots or dashes.`);
}
function checkInitials(i) {
  const v = String(i || "").trim().toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(v)) throw new Error(`"${i}" isn't valid initials: use 1 to 6 letters, e.g. WL.`);
  return v;
}
async function profileOf(username) {
  const { data, error } = await sb.from("profiles").select("id,username,display_name,initials").eq("username", username).maybeSingle();
  if (error) throw error;
  return data;
}

async function add(username, name, initials) {
  checkUsername(username);
  const ini = checkInitials(initials);
  if (!name) throw new Error('Give the person\'s full name, e.g. add wlane "Will Lane" WL');
  if (await profileOf(username)) return { username, name, initials: ini, password: null, note: "already exists (use reset)" };
  const pw = password();
  const { data, error } = await sb.auth.admin.createUser({ email: email(username), password: pw, email_confirm: true, user_metadata: { username } });
  if (error) {
    if (/invalid/i.test(error.message)) throw new Error(`Supabase rejected ${email(username)}: ${error.message}. Set USERNAME_DOMAIN to your company's domain (and the same value as a repository variable), then retry.`);
    throw error;
  }
  const { error: pErr } = await sb.from("profiles").insert({ id: data.user.id, username, display_name: name, initials: ini });
  if (pErr) { await sb.auth.admin.deleteUser(data.user.id); throw pErr; }
  return { username, name, initials: ini, password: pw };
}

async function reset(username) {
  const p = await profileOf(username);
  if (!p) throw new Error(`No login called "${username}".`);
  const pw = password();
  const { error } = await sb.auth.admin.updateUserById(p.id, { password: pw });
  if (error) throw error;
  return { username, name: p.display_name, initials: p.initials, password: pw };
}

async function setInitials(username, initials) {
  const p = await profileOf(username);
  if (!p) throw new Error(`No login called "${username}".`);
  const ini = checkInitials(initials);
  const { error } = await sb.from("profiles").update({ initials: ini }).eq("id", p.id);
  if (error) throw error;
  console.log(`${username} now has initials ${ini}.`);
}

async function remove(username) {
  const p = await profileOf(username);
  if (!p) throw new Error(`No login called "${username}".`);
  const { error } = await sb.auth.admin.deleteUser(p.id); // the profile row is removed with it
  if (error) throw error;
  console.log(`Removed ${username}. They are signed out the next time their session refreshes (within an hour).`);
}

function show(rows) {
  console.table(rows.map((r) => ({ username: r.username, name: r.name, initials: r.initials, password: r.password ?? r.note ?? "" })));
  if (rows.some((r) => r.password)) console.log("\nSend each password privately. They can change it after signing in (Change password).");
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "add") show([await add(args[0], args[1], args[2])]);
  else if (cmd === "reset") show([await reset(args[0])]);
  else if (cmd === "initials") await setInitials(args[0], args[1]);
  else if (cmd === "remove") await remove(args[0]);
  else if (cmd === "list") {
    const { data, error } = await sb.from("profiles").select("username,display_name,initials,created_at").order("username");
    if (error) throw error;
    console.table(data.map((p) => ({ username: p.username, name: p.display_name, initials: p.initials, created: p.created_at.slice(0, 10) })));
  } else {
    console.log('Usage: node scripts/logins.mjs add <username> "<Full name>" <INITIALS> | initials <username> <INITIALS> | reset <username> | remove <username> | list');
    process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
