// Reads a weekly meeting transcript with Claude and returns proposed changes to the project list.
// Only signed-in tracker logins may call it. The Anthropic API key stays here, in a Supabase secret.
// Nothing is written to the database here: the page shows the proposals and saves only what a person accepts.
// The transcript is not stored.
//
// Secrets: ANTHROPIC_API_KEY (required), ALLOWED_ORIGIN (the GitHub Pages origin), CLAUDE_MODEL (optional).

import Anthropic from "npm:@anthropic-ai/sdk@1.1.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { cleanProposal, readInput, SCHEMA, SYSTEM, userMessage } from "./core.ts";

const MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-opus-5-5";
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const MAX_BODY_BYTES = 3_000_000;

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Use POST." });

  // Who is calling? Check with their own token, so the same rules as the site apply.
  const authHeader = req.headers.get("Authorization") ?? "";
  const publicKey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!authHeader || !publicKey) return json(401, { error: "Sign in again." });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publicKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "Sign in again." });
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!profile) return json(403, { error: "This login isn't set up for the tracker." });

  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json(500, { error: "The transcript reader has no Anthropic API key yet. Ask the tracker owner (README step 2)." });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "This transcript is too large. Split it and import each part." });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json(400, { error: "Bad request." }); }
  const r = readInput(body);
  if ("error" in r) return json(400, { error: r.error });

  const anthropic = new Anthropic();
  try {
    // Streamed so a long transcript doesn't hit an HTTP timeout; finalMessage() collects the whole answer.
    // fallbacks: if Claude Opus 5.5's safety checks decline, the API re-runs the request on Anthropic's recommended fallback model.
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage(r.input) }],
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") return json(422, { error: "Claude declined to read this transcript. Check it's the right file, or enter the updates by hand." });
    if (msg.stop_reason === "max_tokens") return json(422, { error: "The answer was cut off. Split the transcript in two and import each part." });
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return json(502, { error: "Claude's answer couldn't be read. Try again." }); }
    return json(200, { proposal: cleanProposal(parsed, r.input), model: msg.model });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: "Claude is busy. Wait a minute and try again." });
    if (err instanceof Anthropic.AuthenticationError) return json(500, { error: "The Anthropic API key is missing or invalid. Ask the tracker owner." });
    if (err instanceof Anthropic.BadRequestError) return json(400, { error: "Claude rejected the request: " + err.message });
    if (err instanceof Anthropic.APIConnectionError) return json(502, { error: "Couldn't reach Claude. Try again shortly." });
    if (err instanceof Anthropic.APIError) return json(502, { error: `Claude is unavailable (${err.status}). Try again shortly.` });
    console.error(err);
    return json(500, { error: "Something went wrong. Try again." });
  }
});
