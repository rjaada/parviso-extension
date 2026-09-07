# Parviso — Job Import

A small Chrome extension. Click it on a LinkedIn job posting, and it opens
Parviso with that job's description already filled in — no copy-paste.

## Why it's built this way

This exists instead of a server-side scraper on purpose. LinkedIn's Terms
of Service prohibit automated scraping, and LinkedIn actively enforces
that against companies running scraping infrastructure. A browser
extension that reads the page a signed-in user is *already looking at*,
only when *they* click it, is a meaningfully different — and much lower
risk — pattern, and it's the one comparable tools (Teal, Simplify, Huntr,
and others) already ship. It is not a guaranteed-safe loophole in
LinkedIn's ToS, just a much better-precedented and lower-exposure one than
running a scraper.

Concretely, that design decision shows up as:

- **No `host_permissions` in `manifest.json`.** The extension can't act on
  LinkedIn (or anywhere) in the background. It only gets temporary access
  to the current tab via `activeTab`, granted by the same click that opens
  the popup.
- **No content script, no background service worker.** Extraction
  (`src/extract.js`) is injected on demand via
  `chrome.scripting.executeScript` from `popup.js`, once, when the popup
  opens. There is nothing running on LinkedIn pages the rest of the time.
- **The popup says so.** "Nothing is sent to Parviso until you click
  Import" isn't just copy — it's literally true of the code.
- **Only job data is read.** Title, company, description, and the page
  URL. Nothing about the user's connections, feed, or profile.

## How the handoff to Parviso works

`popup.js` builds `https://<parviso>/workspace?import=<url-encoded JSON>`
and opens it in a new tab. There's no extension-specific auth — the user's
normal Parviso session (Clerk) in that tab handles everything, same as if
they'd pasted the JD in by hand. This is the simplest version that could
work, chosen deliberately over having the extension call the backend
directly (which would mean designing and securing a whole new auth
surface for comparatively little UX gain at this stage).

The main app's `/workspace` route reads that `?import=` param and
pre-fills the JD field from the decoded JSON (`{ title, company,
description, url }`) — done, on the `preview` branch of the `Resume`
repo (`WorkspacePageClient.tsx`). `DEFAULT_PARVISO_URL` below currently
points at that preview deployment for the same reason.

## Popup states

Seven states total, built from the Pencil design "C1.2 · Parviso
LinkedIn Import — Refined Concepts":

- **Loading** — brief, while the active tab is checked.
- **Job detected** — title/company/checklist, a "Preview description"
  toggle (expands the captured text inline, no separate view), Import.
- **Description looks incomplete** — shown instead of "Job detected"
  when the captured description is under `INCOMPLETE_WORD_THRESHOLD`
  (120 words) in `popup.js` — real job descriptions essentially never
  run that short, so it almost always means LinkedIn's "show more" was
  collapsed and only a fragment got captured. "Preview and correct"
  reveals what was captured so the user can expand the posting on
  LinkedIn and retry, rather than silently importing a partial JD.
- **Job already imported** — shown instead of "Job detected" when the
  current job's URL is already in `chrome.storage.local`'s
  `importedJobs` map (recorded on every successful import, keyed by
  job URL, with a timestamp). Reports how long ago in relative time.
- **Imported** — success state; includes a fallback "Open Parviso"
  button in case the auto-opened tab didn't come to focus.
- **Import failed** — if opening the Parviso tab throws, the already-
  captured job data isn't lost; "Retry import" re-attempts the same
  open without re-extracting from the page.
- **No LinkedIn job found** — wrong page / extraction failed.

## Known limitation

LinkedIn's DOM differs between the logged-out public job page and the
authenticated app, and changes periodically either way. `src/extract.js`
tries several selectors newest-likely-to-match first, falls back to
parsing the page's `<title>`, and finally to grabbing the largest text
block on the page — but this has only been verified against the current
**logged-out** public job page (`linkedin.com/jobs/view/...`). It has not
yet been tested against a real, signed-in LinkedIn session — that's the
first thing to check by hand before relying on it.

## Load it locally

1. `chrome://extensions` → enable **Developer mode** (top right).
2. **Load unpacked** → select this folder.
3. Open a LinkedIn job posting, click the Parviso icon in the toolbar.

To test against a local frontend instead of production, change
`DEFAULT_PARVISO_URL` at the top of `popup/popup.js` to
`http://localhost:3000`, then reload the extension from `chrome://extensions`.

## Structure

```
manifest.json       Manifest V3, activeTab + scripting + storage, no host_permissions
popup/popup.html    Seven states — see "Popup states" above
popup/popup.css     Exact palette/spacing/radii from the Pencil design, system font stack (see note in file)
popup/popup.js      Tab check → on-demand extraction → incomplete/duplicate checks → import handoff
src/extract.js      Injected into the LinkedIn tab on click; see file header
icons/              16/32/48/128px from the approved Pencil design (Export'd directly)
```

Icons inside the popup itself (checkmarks, warning triangle, briefcase,
etc.) are inlined SVG pulled verbatim from the `lucide-static` npm
package to match the design's icon references exactly, rather than
approximated by hand.

## Not built yet

- Testing against a real, authenticated LinkedIn session (verified only
  against the logged-out public job page — see "Known limitation" above).
- Any other job board (Indeed, etc.) — intentionally out of scope for v0.1.
- Chrome Web Store listing/submission.
- `parvisoBaseUrl` is a `chrome.storage.local` override hook that exists
  in code (`getParvisoBaseUrl()`) but has no UI to actually set it yet —
  today only `DEFAULT_PARVISO_URL` in the source is realistic to change.
