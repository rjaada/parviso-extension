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
- **The popup says so.** "Parviso reads this job only when you click
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

**This means the main app needs one small change to actually consume it**
— reading `?import=` on `/workspace` and pre-filling the JD field from the
decoded JSON (`{ title, company, description, url }`). That's a change in
the `Resume` repo (`WorkspacePageClient.tsx`), not this one, and hasn't
been made yet.

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
manifest.json       Manifest V3, activeTab + scripting only, no host_permissions
popup/popup.html    Three states: job detected, imported, wrong page
popup/popup.css     Direction C palette, system font stack (see note in file)
popup/popup.js      Tab check → on-demand extraction → import handoff
src/extract.js      Injected into the LinkedIn tab on click; see file header
icons/              16/32/128px from the approved Pencil design (Export'd directly,
                    48px kept for the chrome://extensions management page)
```

## Not built yet

- The `/workspace?import=` receiving end on the Parviso web app.
- Testing against a real, authenticated LinkedIn session.
- Any other job board (Indeed, etc.) — intentionally out of scope for v0.1.
- Chrome Web Store listing/submission.
