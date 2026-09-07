/**
 * Popup controller. Runs once, each time the popup opens — that open is
 * the user-invoked "click" that grants activeTab access to the current
 * tab; there is no background listener, no persistent content script, no
 * access outside this moment. See src/extract.js for what actually reads
 * the LinkedIn page.
 *
 * DEFAULT_PARVISO_URL is temporarily the "preview" branch's Vercel
 * deployment — production (tracerank.vercel.app) is still on main, which
 * predates this whole feature (no /workspace?import= handler exists
 * there yet). Point this back at production once preview merges to main.
 *
 * Local dev: change it to your localhost origin (e.g. "http://localhost:3000")
 * while testing against a local frontend instead.
 */
const DEFAULT_PARVISO_URL = "https://adversarial-r-sum-scanner-git-preview-rjaada42-9496s-projects.vercel.app";

// Below this captured word count, treat the description as likely
// truncated by a collapsed "show more" on LinkedIn's side rather than a
// genuinely short posting -- real job descriptions essentially never run
// this short. Routes to the "incomplete" recovery state instead of
// silently importing a partial description.
const INCOMPLETE_WORD_THRESHOLD = 120;

function getParvisoBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["parvisoBaseUrl"], (data) => {
      resolve(data.parvisoBaseUrl || DEFAULT_PARVISO_URL);
    });
  });
}

function getImportedJobs() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["importedJobs"], (data) => resolve(data.importedJobs || {}));
  });
}

function recordImportedJob(job) {
  return getImportedJobs().then((jobs) => {
    jobs[job.url] = { importedAt: Date.now(), title: job.title, company: job.company };
    return new Promise((resolve) => chrome.storage.local.set({ importedJobs: jobs }, resolve));
  });
}

function isLinkedInJobUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return false;
    if (u.pathname.startsWith("/jobs/view/")) return true;
    if (u.pathname.startsWith("/jobs/") && u.searchParams.has("currentJobId")) return true;
    return false;
  } catch {
    return false;
  }
}

function wordCount(value) {
  const matches = value.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function relativeTime(timestampMs) {
  const diffSec = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

function el(id) {
  return document.getElementById(id);
}

const ALL_STATES = [
  "state-loading", "state-detected", "state-imported", "state-wrong",
  "state-incomplete", "state-failed", "state-already",
];
// The three recovery states share a slightly shorter header (54px vs
// 58px, smaller mark) per the design -- matched exactly, not simplified
// to one shared header, since the two header nodes have distinct sizing.
const COMPACT_STATES = new Set(["state-incomplete", "state-failed", "state-already"]);
const HEADER_TAGS = {
  "state-detected": "READY TO IMPORT",
  "state-imported": "COMPLETE",
  "state-wrong": "NO JOB DETECTED",
  "state-incomplete": "REVIEW NEEDED",
  "state-failed": "NOT SENT",
  "state-already": "FOUND IN PARVISO",
};

function showState(name) {
  for (const id of ALL_STATES) el(id).hidden = id !== name;
  const compact = COMPACT_STATES.has(name);
  el("header-default").hidden = compact;
  el("header-compact").hidden = !compact;
  el(compact ? "header-tag-compact" : "header-tag-default").textContent = HEADER_TAGS[name] || "";
}

let currentJob = null;

function renderDetected(job, words) {
  el("job-title").textContent = job.title;
  el("job-company").textContent = job.company ? `${job.company} · LinkedIn` : "LinkedIn";
  el("chk-words").textContent = `Full description · ${words.toLocaleString()} words`;
  el("preview-text").textContent = job.description;
  el("preview-box").hidden = true;
  el("preview-btn").querySelector("span").textContent = "Preview description";
  showState("state-detected");
}

function renderIncomplete(job, words) {
  el("incomplete-message").textContent =
    `Parviso captured ${words.toLocaleString()} word${words === 1 ? "" : "s"}. LinkedIn may have collapsed part of the posting.`;
  el("preview-text-incomplete").textContent = job.description;
  el("preview-box-incomplete").hidden = true;
  el("preview-correct-btn").querySelector("span").textContent = "Preview and correct";
  showState("state-incomplete");
}

function renderAlready(job, existing) {
  const company = existing.company || job.company || "This job";
  el("already-message").textContent =
    `${company} was imported ${relativeTime(existing.importedAt)}. Open the existing workspace or replace it.`;
  showState("state-already");
}

async function doImport(job) {
  const base = await getParvisoBaseUrl();
  const payload = { title: job.title, company: job.company, description: job.description, url: job.url };
  const target = `${base.replace(/\/$/, "")}/workspace?import=${encodeURIComponent(JSON.stringify(payload))}`;
  await chrome.tabs.create({ url: target });
}

async function attemptImport(job) {
  try {
    await doImport(job);
    await recordImportedJob(job);
    el("imported-title").textContent = job.title;
    el("imported-company").textContent = job.company || "";
    showState("state-imported");
  } catch {
    showState("state-failed");
  }
}

function togglePreview(boxId, buttonEl, openLabel, closeLabel) {
  const box = el(boxId);
  box.hidden = !box.hidden;
  buttonEl.querySelector("span").textContent = box.hidden ? openLabel : closeLabel;
}

function wireButtons() {
  el("import-btn").addEventListener("click", () => { if (currentJob) void attemptImport(currentJob); });
  el("retry-btn").addEventListener("click", () => { if (currentJob) void attemptImport(currentJob); });
  el("open-existing-btn").addEventListener("click", () => { if (currentJob) void attemptImport(currentJob); });
  // Fallback in case the auto-opened tab from Import didn't come to focus
  // (pop-up blocker, background window) -- re-opens rather than changing
  // out of the success state, since the primary action already succeeded.
  el("open-fallback-btn").addEventListener("click", () => { if (currentJob) void doImport(currentJob).catch(() => {}); });
  el("open-linkedin-btn").addEventListener("click", () => { chrome.tabs.create({ url: "https://www.linkedin.com/jobs/" }); });

  el("preview-btn").addEventListener("click", () => togglePreview("preview-box", el("preview-btn"), "Preview description", "Hide description"));
  el("preview-correct-btn").addEventListener("click", () => togglePreview("preview-box-incomplete", el("preview-correct-btn"), "Preview and correct", "Hide description"));
}

async function init() {
  showState("state-loading");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !isLinkedInJobUrl(tab.url)) {
    showState("state-wrong");
    return;
  }

  let job = null;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/extract.js"],
    });
    job = result;
  } catch {
    job = null;
  }

  if (!job) {
    showState("state-wrong");
    return;
  }
  currentJob = job;

  const words = wordCount(job.description);
  const existing = (await getImportedJobs())[job.url];

  if (existing) {
    renderAlready(job, existing);
    return;
  }
  if (words < INCOMPLETE_WORD_THRESHOLD) {
    renderIncomplete(job, words);
    return;
  }
  renderDetected(job, words);
}

document.addEventListener("DOMContentLoaded", () => {
  wireButtons();
  void init();
});
