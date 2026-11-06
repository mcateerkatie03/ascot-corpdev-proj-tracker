# Tests

About 130 checks across the site and the Supabase functions. They run on every pull request (GitHub > Actions > **Tests**); a red check means something broke, and the run's **test-output** download has screenshots from the failing suite.

## Run them yourself

```bash
npm install
npx playwright install chromium
npm test
```

`npm test -- digest` runs only the suites whose file names contain that word. The function suites need [Deno](https://deno.com) and are skipped without it.

## What's here

| Path | What it covers |
| --- | --- |
| `web/tracker.test.cjs` | The site (`web/index.html`) in Chromium, against an in-memory stand-in for Supabase (`web/mock-supabase.js`): the dashboard, filters, editing and save conflicts, to-dos, the transcript review (with a fake transcript function), workbook import and Excel export, and the phone layout. SheetJS and JSZip are served from `node_modules` instead of their CDNs. Nothing touches the live database or Claude. |
| `functions/transcript_test.ts` | The transcript reader's input checks, prompt, output schema and clean-up of Claude's answer. No call to Claude. |
| `functions/digest_test.ts` | The weekly email digest. |
| `out/` | Screenshots, exported workbooks and the digest preview from the last run. Not committed. |

## Rules for test data

Never put real projects, people, transcripts or financials in a test. The suites build their own made-up workbooks and transcripts in code.

## Adding a test

Add `ok(name, condition, detail)` checks to the nearest suite, or copy it; end with `console.log(`${pass} passed, ${fail} failed`)` and a non-zero exit code on failure. `run.mjs` picks up any `*.test.cjs` file in `web/` and any `.ts` file in `functions/`. When a change is meant to alter behaviour that a test checks, update the test in the same change.
