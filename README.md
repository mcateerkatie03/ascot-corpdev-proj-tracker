# Ascot Corp Dev tracker

The Corporate Development team's weekly project list, kept up to date from the transcripts of the weekly Teams meeting. Styled on the Ascot PPT template.

- **This week:** the dashboard. Tiles for active and pending projects and open to-dos, the week's to-dos, what changed, and every open project grouped by category with its description, status and this week's update.
- **Reminders:** a panel beside the dashboard's project table listing people to follow up with ("schedule a meeting with…", "check with… when he's back in New York"). Claude picks them out of each transcript; you can add or tick them off by hand.
- **Calendar reminders:** open a reminder, pick a name from your contacts list (Settings) and click **Remind in 24 hours** or **in 48 hours**. Outlook opens a new calendar event with them invited and the details filled in; check it and click **Send**, so it goes from your own Ascot account. A calendar file is offered for desktop Outlook. Only names are shown in the tracker; email addresses are listed only under Settings.
- **Projects:** the whole list, filterable by status, category and Corp Dev initials. Open a project to edit it, add links and to-dos, or see its history.
- **To-dos:** the week's action items with owner, project and due date. Unfinished ones carry forward until they're ticked off. Filters for *Mine*, *Overdue* and *Due this week*.
- **Archive:** completed and dropped projects (the workbook's Old Projects tab). Any project can be restored.
- **Key developments:** a running log of what came up in the meetings that isn't about a project on the list (industry trends, news about other companies, market and deal moves, regulation, Ascot news), grouped by meeting and filterable by topic. Claude picks them out of each transcript; you can add them by hand.
- **Calendar:** a month view of company-wide events and holidays (town halls, strategy days, offsites, conferences, board meetings, investor events), colour-coded by type, with a list of the month's events underneath (the list only, on phones). Claude adds dated events it hears in each transcript; you can add them by hand, and download any event for Outlook. The dashboard shows the next 30 days under **Coming up**.
- **Meetings:** one entry per weekly meeting with a snapshot of the list as it stood, like the dated tabs in the workbook.
- **Import transcript:** drop in the meeting transcript (.docx or .vtt from Teams, or pasted text). Claude proposes status changes, new updates, new projects with a suggested category, projects to take off the list, new to-dos, people to follow up with, key developments, calendar events, and to-dos or reminders that are done. You review, edit and tick what to keep, then save. That records the meeting.
- **Import workbook / Export Excel:** bring in the existing project list once; download the current list any time in the same layout (Current, To-dos, Old Projects and one tab per week).

**Statuses.** *Active*: ongoing. *Pending*: no update, or waiting on someone else. *Completed*: finished or sent out, comes off the list. *Dropped*: started but taken off the list without being completed. Projects under External Growth Initiatives can also carry an optional deal stage (Screening, NDA signed, LOI, Diligence, Closed, On hold, Dead).

**Categories.** Portfolio Growth Initiatives (internal improvements and strategic projects on the company's structure and operations), Strategy Refinement / Organic Growth Initiatives (partnerships, leverage opportunities, joint ventures, consulting), External Growth Initiatives (minority or majority investments in external companies), Quarterly Board Updates (work for the upcoming board meetings, labelled by quarter) and Other Projects (individual work, market research, town halls, investor presentations, peer comparison decks, product line deep dives). Claude suggests a category for each new project. Everyone's corrections are fed back to it as examples, and **Settings** shows how often its suggestions were kept. When you trust it, switch on *File categories automatically*.

For coding assistants: how the code works and the rules for changing it are in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## How it fits together

| Part | Where it runs | What it does |
| --- | --- | --- |
| `web/` | GitHub Pages (static) | The site. Talks to Supabase from the browser. |
| `supabase/migrations/0001_tracker.sql` | Supabase Postgres | Tables, logins, row-level security and change history. Every login can read and edit; anonymous visitors get nothing. |
| `supabase/functions/transcript` | Supabase Edge Function | Sends a transcript and the current list to Claude and returns proposed changes. The Anthropic API key stays in its secrets. Nothing is written by the function, and the transcript isn't stored. |
| `supabase/functions/digest` | Supabase Edge Function | Optional Monday email: overdue to-dos, to-dos due this week, pending and quiet projects, what changed. Sent through Resend on a Supabase Cron schedule. |
| `scripts/logins.mjs` | Your machine | Creates, resets and removes logins with the Supabase secret key. |
| `.github/workflows/pages.yml` | GitHub Actions | Writes `web/config.js` from repository variables and publishes `web/` to Pages. |
| `tests/`, `.github/workflows/tests.yml` | GitHub Actions | About 130 automated checks, run on every pull request (`npm test` locally). See `tests/README.md`. |

## Setup (about 30 minutes)

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (the free tier is enough to start). This is a new project, separate from the deal desk's.
2. **SQL editor:** paste and run `supabase/migrations/0001_tracker.sql`.
3. **Authentication > Sign In / Providers > Email:** keep Email enabled and turn **off** "Allow new users to sign up". Logins are created only by the script.
4. **Project settings > API Keys:** note the **publishable key** (`sb_publishable_...`, safe for the website) and the **secret key** (`sb_secret_...`, only for the login script on your computer). The Project URL is under **Project settings > Data API**. Never put the secret key in the site or in GitHub.

### 2. Transcript reader (Claude)

Needs the [Supabase CLI](https://supabase.com/docs/guides/cli) and an Anthropic API key from [console.anthropic.com](https://console.anthropic.com).

```bash
supabase login
```

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... ALLOWED_ORIGIN=https://YOUR_GITHUB_USER.github.io
```

```bash
supabase functions deploy transcript --no-verify-jwt
```

`--no-verify-jwt` is safe: the function checks the caller's login itself and only answers tracker logins.

It uses Claude Opus 5.5 with structured output, so the answer always comes back in the shape the review screen expects. Anthropic's server-side fallback is switched on: if Opus 5.5's safety checks decline a transcript, the API retries it on Anthropic's recommended fallback model. To use another model, set the secret `CLAUDE_MODEL`. A one-hour meeting transcript usually costs well under $1 to read.

Reading takes one to three minutes. Supabase stops a function after 150 seconds on the free plan (400 seconds on paid plans), so if long transcripts time out, either move to a paid plan or import the transcript in two halves.

### 3. Logins

```bash
npm install
```

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co SUPABASE_SECRET_KEY=sb_secret_YOUR_KEY npm run logins -- add wlane "Will Lane" WL
```

Add one login per person. The initials should match the **Corp Dev** column (WL, ZT and so on), so *Mine* filters and to-do owners line up. The script prints each password once; send it privately. People can change their password after signing in.

On Windows PowerShell, set the variables first: `$env:SUPABASE_URL="https://..."; $env:SUPABASE_SECRET_KEY="sb_secret_..."`, then run `npm run logins -- add ...`.

Other commands (same two environment variables): `npm run logins -- initials wlane WL`, `npm run logins -- reset wlane`, `npm run logins -- remove wlane`, `npm run logins -- list`.

Usernames become `username@corpdev-tracker.local` behind the scenes; no email is ever sent. If Supabase rejects that address, set `USERNAME_DOMAIN` (for example your company domain) for the script and as a repository variable, and use the same value in both.

### 4. GitHub Pages

1. **Settings > Pages > Build and deployment > Source:** GitHub Actions. Pages on a private repository needs a paid GitHub plan (Pro, Team or Enterprise). The site's address is public either way, but it shows nothing without a login, and the repository holds no secrets or project data.
2. **Settings > Secrets and variables > Actions > Variables:** add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (and `USERNAME_DOMAIN` if you changed it). Use the publishable key, never the secret key.
3. Push to `main`, or run the "Deploy site to GitHub Pages" workflow. The site appears at `https://YOUR_GITHUB_USER.github.io/REPO_NAME/`.

### 5. Bring in the current list

Sign in, open the menu under your initials and choose **Import workbook (.xlsx)**. Pick the project list workbook:

- **Current** becomes the project list. Categories carry down from the category column. A project whose update is empty, "TBU", "TBD" or "awaiting…" starts as *Pending*; the rest start as *Active*.
- **Old Projects** goes to the Archive: *Dropped* where the note says killed, removed, DOA or similar, otherwise *Completed*. These have no category; add one when you next open them.
- Each **dated tab** (for example `10.27.26`) becomes a meeting snapshot.

The preview shows what will be imported before anything is saved. The workbook stays in your browser; only its rows are saved to the database. Projects already in the tracker by name are skipped, so importing twice is safe.

## Each week

1. After the meeting, open **Recap > Transcript** in Teams and download it (.docx or .vtt).
2. In the tracker, **This week > Import transcript**: check the meeting date, drop the file in and click **Read with Claude**.
3. Review the proposals: edit any text, change a status or category, untick anything you don't want. For new projects, confirm the category (unless automatic filing is on).
4. **Save and record the meeting.** The dashboard switches to the new week, and the meeting's snapshot is saved under **Meetings**.

Projects not discussed keep last week's update. They're tagged *Quiet* after three weeks without one. You can edit anything by hand at any time, and **Save a snapshot without a transcript** (on Meetings) records a week you updated by hand.

## Weekly email digest (optional)

Every Monday morning the team gets an email with overdue to-dos, to-dos due that week, pending projects, quiet projects and what changed. Each item links to the record on the site.

1. Create an account at [resend.com](https://resend.com), verify your company's sending domain, and create an API key.
2. Set the function's secrets. `DIGEST_SECRET` is any long random string (at least 24 characters); keep a copy for step 5.

   ```bash
   supabase secrets set DIGEST_SECRET=CHOOSE_A_LONG_RANDOM_STRING RESEND_API_KEY=re_... DIGEST_FROM="Corp Dev tracker <corpdev@yourco.com>" DIGEST_TO="person1@yourco.com,person2@yourco.com" SITE_URL=https://YOUR_GITHUB_USER.github.io/REPO_NAME/
   ```

3. Deploy it. `--no-verify-jwt` is safe: the function refuses any call without the secret.

   ```bash
   supabase functions deploy digest --no-verify-jwt
   ```

4. Preview it without sending anything:

   ```bash
   curl -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/digest?dry=1" -H "x-digest-secret: YOUR_DIGEST_SECRET"
   ```

5. Schedule it: open `supabase/digest_schedule.sql`, replace the two placeholders (your function address and the same `DIGEST_SECRET`), and run it in the SQL editor. It sends on Mondays at 07:17 UTC; edit the schedule line to change that.

## Optional: sending reminders by email automatically

Not switched on. `supabase/functions/send-reminders` and `supabase/reminders_schedule.sql` can email reminders from the server through Resend instead of calendar invites. It needs a sending domain verified in Resend (DNS records on a domain you control), the secrets `RESEND_API_KEY`, `REMINDER_FROM` and `REMINDER_SECRET`, the function deployed with `--no-verify-jwt`, and the schedule SQL run. The site's reminder screen would need its "email in 24/48 hours" option back (see the git history).

## Running locally

Fill in `web/config.js` with the Project URL and publishable key, then:

```bash
npm run serve
```

Open http://localhost:8080. To use the transcript reader locally, set `ALLOWED_ORIGIN` to `*` while testing.

## Notes

- **Data model:** each project, to-do and meeting is a JSON document (`id`, `doc`), so fields can change without migrations. `updated_at` and `updated_by` are stamped by the database, and a trigger records every change to projects and to-dos in `history`.
- **Two people at once:** a save only sends the fields you changed. If someone else changed the same field while you were editing, the page asks whose value to keep. Open pages refresh within a second when anyone saves.
- **Confidentiality:** transcripts are sent to Anthropic's API to be read and are not stored by the tracker. Anthropic doesn't train on API data by default. Real workbooks and transcripts must never be committed to this repository (`.gitignore` blocks .xlsx, .docx and .vtt files).
- **Costs:** Supabase free tier, GitHub Pages, and Anthropic API usage for transcripts (cents to under a dollar a week).
