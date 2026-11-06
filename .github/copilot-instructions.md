# Ascot Corp Dev tracker: notes for coding assistants

Read this before changing anything. `README.md` is the setup guide for people; this file is how the code works and the rules for changing it.

## What it is

The Corp Dev team's weekly project list and to-dos, updated from the weekly Teams meeting transcript, styled on the Ascot PowerPoint template.

- **Site:** one static page, `web/index.html` (HTML, CSS and plain JavaScript; no framework, bundler or build step). GitHub Pages serves `web/` as is.
- **Data:** Supabase (Postgres, Auth, Realtime), called from the browser with the publishable key. Every login can read and write; row-level security (`public.is_member()`) keeps everyone else out. There are no roles.
- **Server code:** two Supabase Edge Functions (Deno, TypeScript): `transcript` (Claude) and `digest` (email).

## Repository map

| Path | What it is |
| --- | --- |
| `web/index.html` | The whole site. |
| `web/config.js` | Supabase URL and publishable key (`window.TRACKER_CONFIG`). Blank in the repo; the Pages workflow writes it. Never commit real values or any `sb_secret_` key. |
| `supabase/migrations/0001_tracker.sql` | Schema, RLS, stamping and history triggers. New changes go in a new numbered migration. |
| `supabase/functions/transcript/` | `core.ts`: prompt, JSON schema, input checks and clean-up of Claude's answer (pure, tested). `index.ts`: login check and the Claude call (structured output, server-side fallback, streaming). |
| `supabase/functions/digest/` | `core.ts` builds the email (pure, tested); `index.ts` reads the tables and sends through Resend. |
| `scripts/logins.mjs` | Logins with initials. Needs the secret key, so it runs on the owner's machine only. |

## Data

Tables `projects`, `todos`, `meetings` hold `{id text, doc jsonb, updated_at, updated_by}`; `settings` holds small shared settings (`claude.autoCategory`).

- **Project doc:** `name, category, quarter, status, stage, description, stakeholders, corpDev, update, updateDate, links[], closedAt, closedNote, order, categorySource ("claude"|"person"|"import"), categoryCorrected, categorySuggested, categoryReason, categoryCheck, createdInMeeting`.
- **Statuses:** `STATUSES` = Active, Pending, Completed, Dropped. `OPEN` = Active, Pending. Completed and Dropped are the archive. `closedAt` is set when a project leaves `OPEN`.
- **Categories:** `CATEGORIES` (five, fixed; the same list is in `transcript/core.ts`). `stage` only applies to External Growth Initiatives; `quarter` only to Quarterly Board Updates.
- **To-do doc:** `text, owner (initials), projectId, due, done, doneAt, notes, quote, meetingId, meetingDate`.
- **Meeting doc:** id `m<YYYY-MM-DD>`; `date, title, summary, source ("transcript"|"import"|"manual"), snapshot[]` (the open projects plus any closed that day).
- **Category learning:** examples sent to Claude are the categorised projects, corrected ones first. Keep `categorySource`/`categoryCorrected` up to date when a category changes.

## How `web/index.html` is organised

Sections are marked `/* ---------- name ---------- */`: constants, state, helpers, routing, render (This week, Projects, To-dos, Archive, Meetings, What changed), drawer (project, to-do, meeting, snapshot, settings, password), writes, history, transcript, workbook import, Excel export, events, data, auth.

- **State:** one global `S`. Change `S`, then `render()` for the view or `renderDrawer()` for the drawer. Views are template strings.
- **Clicks:** every control carries `data-act` (and `data-id`, `data-v`). One delegated `switch` handles them. Add a `case`; don't attach listeners to elements.
- **Escaping:** anything from the database, a transcript or Claude goes through `esc()`; links through `safeUrl()`.
- **Writes:** `S.db.collection(t).doc(id).set/update/delete`. `update` and the drawer saves go through `casWrite()` (compare-and-set on `updated_at`). The drawer saves only changed fields and shows a conflict panel when someone else changed the same one. New editable fields go in `PROJECT_FIELDS`/`TODO_FIELDS` and `FIELD_LABELS`.
- **Transcript review:** `prepareReview()` turns Claude's proposal into `S.drawer.rv` (`u` updates, `n` new projects, `a` archive, `t` to-dos, `d` done). Inputs carry `data-rv="k.i.field"`; `applyReview()` writes the ticked items, then `saveMeeting()`.
- **Libraries:** supabase-js 2.117.2 (jsDelivr), SheetJS 0.20.3 (cdn.sheetjs.com) and JSZip 3.10.1 (jsDelivr), the last two lazy-loaded. Exact versions only; no build step.

## Rules

- **Never** put secrets or real project data in the repo: no `sb_secret_` key, Anthropic or Resend key, passwords, workbooks or transcripts. Test data is made up.
- Work on a branch and open a pull request; merging to `main` publishes the site.
- Database changes go in a new numbered migration that is safe to run once, keeps RLS on and revokes access from `anon`.
- Keep the phone layout working: no sideways scroll at 320px and 390px.
- House style on the page: plain English, sentence case, no em dashes, dates like "5 Nov" (year added when it isn't the current year).
- Function changes need a redeploy by the owner: `supabase functions deploy transcript --no-verify-jwt` (or `digest`).

## Checking changes

```bash
npm install && npx playwright install chromium
npm test
```

The **Tests** workflow runs the same on every pull request; don't merge with a red check. Update tests in the same change when behaviour changes, and never weaken a check to get it green.
