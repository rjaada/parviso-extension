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

function getParvisoBaseUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["parvisoBaseUrl"], (data) => {
      resolve(data.parvisoBaseUrl || DEFAULT_PARVISO_URL);
    });
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

function el(id) {
  return document.getElementById(id);
}

function showState(name) {
  const states = ["state-loading", "state-detected", "state-imported", "state-wrong"];
  for (const id of states) el(id).hidden = id !== name;
  el("header-tag").hidden = name !== "state-detected";
}

function renderWrongPage() {
  showState("state-wrong");
}

function renderDetected(job) {
  el("job-title").textContent = job.title;
  el("job-company").textContent = job.company ? `${job.company} · LinkedIn` : "LinkedIn";
  el("chk-words").textContent = `Full description · ${wordCount(job.description).toLocaleString()} words`;
  showState("state-detected");

  el("import-btn").onclick = async () => {
    const base = await getParvisoBaseUrl();
    const payload = {
      title: job.title,
      company: job.company,
      description: job.description,
      url: job.url,
    };
    const target = `${base.replace(/\/$/, "")}/workspace?import=${encodeURIComponent(JSON.stringify(payload))}`;
    chrome.tabs.create({ url: target });

    el("imported-title").textContent = job.title;
    el("imported-company").textContent = job.company || "";
    showState("state-imported");
  };
}

async function init() {
  showState("state-loading");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !isLinkedInJobUrl(tab.url)) {
    renderWrongPage();
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
    renderWrongPage();
    return;
  }

  renderDetected(job);
}

document.addEventListener("DOMContentLoaded", init);
