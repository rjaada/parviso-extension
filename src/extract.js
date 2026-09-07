/**
 * Injected on demand via chrome.scripting.executeScript when the popup
 * opens on a LinkedIn job page — never runs automatically, never runs in
 * the background. This is what "Parviso reads this job only when you
 * click Import" (popup.html) actually means: the popup opening is itself
 * the click, and this file only executes at that moment, once, in the
 * active tab.
 *
 * LinkedIn's markup differs between the logged-out public job page
 * (linkedin.com/jobs/view/... without a session) and the authenticated
 * app shell most real users will be on. Selectors below cover both,
 * newest-likely-to-match first, with a page-title fallback and a
 * last-resort "largest text block" fallback so a LinkedIn markup change
 * degrades to "nothing found" (the wrong-page state) rather than a
 * silent crash. Expect these selectors to need occasional maintenance —
 * LinkedIn's class names are not a stable contract.
 *
 * Must stay a single top-level expression: chrome.scripting.executeScript
 * returns the completion value of the last statement, and popup.js reads
 * it directly as the extraction result.
 */
(function () {
  function text(el) {
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function firstOf(selectors) {
    for (const sel of selectors) {
      const t = text(document.querySelector(sel));
      if (t) return t;
    }
    return "";
  }

  function parseFromPageTitle(rawTitle) {
    const cleaned = rawTitle.replace(/\s*\|\s*LinkedIn.*$/i, "").trim();
    const match = cleaned.match(/^(.*?)\s+at\s+(.*?)(?:\s+[—-].*)?$/i);
    if (match) return { title: match[1].trim(), company: match[2].trim() };
    return { title: cleaned, company: "" };
  }

  function fallbackDescription() {
    let best = "";
    let bestLen = 0;
    document.querySelectorAll("section, article, div").forEach(function (candidate) {
      if (candidate.children.length > 6) return;
      const t = text(candidate);
      if (t.length > bestLen && t.length > 200) {
        bestLen = t.length;
        best = t;
      }
    });
    return best;
  }

  const TITLE_SELECTORS = [
    ".job-details-jobs-unified-top-card__job-title h1",
    ".job-details-jobs-unified-top-card__job-title",
    ".jobs-unified-top-card__job-title",
    ".top-card-layout__title",
    ".topcard__title",
    "h1",
  ];
  const COMPANY_SELECTORS = [
    ".job-details-jobs-unified-top-card__company-name a",
    ".job-details-jobs-unified-top-card__company-name",
    ".jobs-unified-top-card__company-name",
    ".topcard__org-name-link",
  ];
  const DESCRIPTION_SELECTORS = [
    "#job-details",
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".description__text",
    ".show-more-less-html__markup",
  ];

  let title = firstOf(TITLE_SELECTORS);
  let company = firstOf(COMPANY_SELECTORS);
  let description = firstOf(DESCRIPTION_SELECTORS);

  if (!title) {
    const parsed = parseFromPageTitle(document.title);
    title = parsed.title;
    if (!company) company = parsed.company;
  }
  if (!description) description = fallbackDescription();

  if (!title || !description) return null;

  return {
    title: title,
    company: company,
    description: description,
    url: location.href.split("?")[0],
  };
})();
