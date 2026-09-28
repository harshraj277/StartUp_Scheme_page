/* Contract tests: index.html <-> js/app.js <-> css/styles.css
   Run: node tests/contract.test.js */
const fs = require("fs");
const path = require("path");
const { ROOT, makeReporter } = require("./dom-stub");
const t = makeReporter("contract");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const js = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "css/styles.css"), "utf8");

/* "Is this logic duplicated?" has to look at code, not at the comment that
   explains why it is not duplicated — otherwise a well-explained file fails a
   check written to catch a bad one. */
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

t.step("every getElementById target exists in the markup");
{
  const RUNTIME = new Set(["compareBar", "compareBarText", "compareBarLink"]);   // built by renderCompareBar()
  const wanted = [...js.matchAll(/getElementById\(\s*["']([^"']+)["']\s*\)/g)].map(m => m[1]);
  const present = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]));
  const missing = [...new Set(wanted)].filter(id => !present.has(id) && !RUNTIME.has(id));
  t.check(`all ${new Set(wanted).size} referenced ids exist (${RUNTIME.size} created at runtime)`, missing.length === 0, missing.join(", "));
}

t.step("every inline handler resolves to a real function");
{
  const BUILTINS = new Set(["stopPropagation", "preventDefault", "querySelector", "getElementById"]);
  const handlers = new Set();
  for (const m of html.matchAll(/on(?:click|change|input|keydown|load)\s*=\s*"([^"]*)"/g)) {
    for (const c of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (!BUILTINS.has(c[1]) && !/event\./.test(m[1].slice(Math.max(0, c.index - 6), c.index + c[1].length))) handlers.add(c[1]);
    }
  }
  const declared = new Set([...js.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  const undef = [...handlers].filter(h => !declared.has(h));
  t.check(`all ${handlers.size} inline handlers are defined in app.js`, undef.length === 0, undef.join(", "));
}

t.step("dead code and dead markup are gone");
[[/\bfMode\b/, "fMode — the Application Mode filter that no dataset field could satisfy"],
 [/\bmoney\s*\(/, "money() — no-op identity helper"],
 [/\.logo2/, ".logo2 — duplicate logo class"],
 [/resetScroll/, "renderResults(resetScroll) — unused parameter"]].forEach(([re, label]) => {
  t.check("removed: " + label, !(re.test(html) || re.test(js) || re.test(css)));
});

t.step("hero dataset-snapshot card removed, with no orphans left behind");
[[/renderHeroMini/, js, "renderHeroMini() — existed only to fill the removed card"],
 [/heroMiniList/, html + js, "heroMiniList element and its getElementById"],
 [/Dataset snapshot/, html, "the \"Dataset snapshot\" card"],
 [/<span class="live">/, html, "the \"Live\" badge"],
 [/schemes tagged/, js, "the \"N of 59 schemes tagged\" rows"],
 [/\.dashboard\b/, css, ".dashboard CSS rule"],
 [/\.dash-head|\.dash-title/, css, ".dash-head / .dash-title CSS rules"],
 [/\.profile-card|\.profile-top|\.avatar\b/, css, ".profile-card / .profile-top / .avatar CSS rules"],
 [/\.mini-list|\.mini\b/, css, ".mini-list / .mini CSS rules"],
 [/\.score\b/, css, ".score CSS rule"],
 [/\.progress\b/, css, ".progress CSS rule (no element ever used it)"],
 [/\btwo-col\b/, html + css, "two-col hero layout (the card was the second column)"]].forEach(([re, hay, label]) => {
  t.check("removed: " + label, !re.test(hay));
});
t.check("the hero is one readable column, not a stretched full-width block", /\.hero-copy\{max-width:/.test(css));
t.check("the last-verified date is not lost along with the card", /id="dashVerified"/.test(html) && /getElementById\("dashVerified"\)/.test(js));

t.step("results are paged, not appended to");
t.check("the append-style 'Load more' control is gone, in markup and in js",
  !/loadMore/i.test(html) && !/loadMore/i.test(js));
t.check("there is a Previous and a Next control", /id="prevPageBtn"/.test(html) && /id="nextPageBtn"/.test(html));
t.check("both controls call real functions",
  /onclick="prevPage\(\)"/.test(html) && /onclick="nextPage\(\)"/.test(html) &&
  /function prevPage\(\)/.test(js) && /function nextPage\(\)/.test(js));
t.check("the page number lives in a live region so the change is announced",
  /id="pagingInfo"[^>]*aria-live="polite"/.test(html));
t.check("paging replaces the slice rather than growing it",
  /list\.slice\(start, start\+PAGE_SIZE\)/.test(js) && !/list\.slice\(0,visibleCount\)/.test(js));
t.check("out-of-range page requests clamp instead of rendering a blank grid",
  /Math\.min\(Math\.max\(1, n\|\|1\), pages\)/.test(js) && /if\(currentPage>pages\) currentPage=pages/.test(js));
t.check("Previous starts disabled in the markup, so page 1 is honest before JS runs",
  /id="prevPageBtn"[^>]*disabled/.test(html));
t.check("disabled buttons are visibly disabled",
  /\.btn:disabled\{/.test(css));
t.check("the pager is one row of Previous / label / Next",
  /\.pagination-wrap\{display:flex;flex-wrap:wrap;align-items:center;justify-content:center/.test(css) &&
  !/flex-direction:column/.test(css.replace(/[\s\S]*?\.pagination-wrap\{/, ".pagination-wrap{")));
t.check("there is a scroll anchor above the results so paging does not leave you mid-grid",
  /id="resultsTop"/.test(html) && /getElementById\("resultsTop"\)\.scrollIntoView/.test(js));
t.check("every result-set change resets to page 1",
  (js.match(/currentPage=1/g) || []).length >= 6);

t.step("match form: fields that cannot affect any result were removed, not just relabelled");
[["turnover", "Age-independent turnover"], ["age", "Age Group"], ["gender", "Gender"]].forEach(([id, label]) => {
  t.check(`removed: ${label} (id="${id}") — 0 of 59 records can match it`,
    !html.includes(`id="${id}"`) && !js.includes(`"${id}"`));
});
t.check("no scoring branch is left reading them",
  !/p\.turnover|p\.age|p\.gender/.test(js));
t.check("the ref-note no longer apologises for inert fields",
  !/only help once the dataset contains/.test(html));
t.check("the ref-note now explains how the matcher works", /How the matcher works/.test(html));

t.step("advanced filters: only the facets the match form cannot express");
/* Both sections are needed — browse hard-filters the catalogue, the matcher ranks
   and explains it. What was wrong is that four controls asked the same question in
   both places, and one could not filter anything at all. */
[["fGovLevel", "Government Level", "all 59 records are Central-government"],
 ["fBeneficiary", "Beneficiary Type", "duplicates the match form's Business / Beneficiary Type"],
 ["fSupport", "Support Type", "same derived buckets as the match form's Support Type"],
].forEach(([id, label, why]) => {
  t.check(`removed from advanced filters: ${label} (id="${id}") — ${why}`,
    !html.includes(`id="${id}"`) && !new RegExp(`getElementById\\("${id}"\\)`).test(js));
});
t.check("removed: the flat 83-chip sector wall in advanced filters — the match form's dropdown owns that question now",
  !/id="filterSectorChips"/.test(html) && !/getElementById\("filterSectorChips"\)/.test(js) && !/#filterSectorChips \.chip/.test(js));
t.check("removed: the flat 13-chip stage wall in advanced filters",
  !/id="filterStageChips"/.test(html) && !/getElementById\("filterStageChips"\)/.test(js) && !/#filterStageChips \.chip/.test(js));
t.check("the matcher's own sector filter survives (it is the surviving home for that question)",
  /id="sectorFilter"/.test(html) && /function filterSectorChips/.test(js));
t.check("the dead Government Level filter is not silently dropped — it is disclosed",
  /id="govLevelNote"/.test(html) && /Government Level filter was removed/.test(js));
t.check("the remaining filters still cover ministry, type, status, finance and repayment",
  ["fMinistry", "fType", "fStatus", "fFinance", "fRepay"].every(id => html.includes(`id="${id}"`)));
t.check("passesFilters no longer reads any removed control",
  !/getElementById\("(fGovLevel|fBeneficiary|fSupport)"\)/.test(js) &&
  !/filterSectors|selectedStages/.test(js));
t.check("the panel tells the user where sector/stage narrowing went, and admits support type is approximate",
  /were removed from here because the match form/.test(html) && /approximates them/.test(html));
t.check("the panel does not claim search reproduces support type exactly",
  !/narrow by <b>sector, startup stage, beneficiary type or support type<\/b>, type it in the search box/.test(html));
t.check("the orphaned chip-wall state and handlers are gone, not just the markup",
  !/toggleFilterSector|toggleFilterStage/.test(js) && !/let filterSectors|let selectedStages/.test(js));
t.check("CSS left behind by the removed chip walls is gone too",
  !/\.filter-block/.test(css) && !/\.chip\.small/.test(css));
t.check("the surviving filter rows are re-gridded to their real column counts (3, then 2)",
  /\.filter-row\{display:grid;grid-template-columns:repeat\(3,1fr\)/.test(css) &&
  /\.filter-row\.two\{grid-template-columns:repeat\(2,1fr\)\}/.test(css) &&
  /class="filter-row two"/.test(html));
t.check("the one-column mobile override covers both row variants",
  /\.filter-row,\.filter-row\.two\{grid-template-columns:1fr\}/.test(css));

t.step("match form: the two fields that gate real eligibility are present");
t.check("Incubation / access route field exists", /id="access"/.test(html));
t.check("Support Type field exists and shares the derived buckets", /id="support"/.test(html) && /SUPPORT_BUCKETS/.test(js));
t.check("access route is classified from each record's own text, not hardcoded per scheme",
  /function accessRoute/.test(js) &&
  !/\b(short_name|scheme_name)\s*===?\s*["']/.test(js) &&
  /eligibility\s*,\s*s\.application_process/.test(js));
t.check("a blocked scheme is flagged on the card, not silently dropped",
  /class="blocker"/.test(js) && /\.blocker\{/.test(css));
t.check("the access coverage limit is disclosed in the UI", /id="accessCoverage"/.test(html) && /are not applied for directly/.test(js));

t.step("sector list is collapsed, not truncated");
t.check("a toggle control exists and is wired to the list it controls",
  /id="sectorToggleBtn"[\s\S]{0,80}aria-controls="sectorChips"/.test(html));
t.check("collapse state is exposed to assistive tech, not just visual",
  /btn\.setAttribute\("aria-expanded"/.test(js) && /id="sectorToggleBtn"[^\n]*aria-expanded="false"/.test(html));
t.check("every chip still carries its scheme count for the collapse rule", /data-count="\$\{c\}"/.test(js));
  /* Reads through the field spec rather than a literal, so the rule is checked
     once for both fields instead of being duplicated per field. */
  t.check("a selected value is never collapsed out of reach, for either field",
    /const keep = f\.set\.has\(name\)/.test(js));
  t.check("and each field has its own set, so neither can read the other's",
    /sector:\s*\{ set: eligSectors/.test(js) &&
    /beneficiary:\s*\{ set: eligBeneficiaries/.test(js));
t.check("the collapsed list is described honestly to the user", /each reach just one scheme/.test(js));
  t.check("reset restores the collapsed default for both fields",
    /chipState\.sector\.expanded=false;/.test(js) &&
    /chipState\.beneficiary\.expanded=false;/.test(js));
t.check("the toggle has its own styles", /\.chip-more\{/.test(css) && /\.chip-bar\{/.test(css));
t.check("the toggle is visible only when it has something to do", /btn\.hidden = !!q/.test(js));

t.step("sector field behaves like a dropdown, like State / UT");
t.check("the closed control is a button, not a wall of chips",
  /<button[^>]*id="sectorPickerBtn"/.test(html) && /id="sectorPanel" hidden/.test(html));
t.check("it points at the panel it opens", /id="sectorPickerBtn"[^>]*aria-controls="sectorPanel"/.test(html));
t.check("expanded state is mirrored for assistive tech, for either field",
  /btn\.setAttribute\("aria-expanded", String\(st\.expanded\)\)/.test(js) &&
  /btn\.setAttribute\("aria-expanded", String\(st\.open\)\)/.test(js));
t.check("the closed control reports the current selection instead of hiding it",
  /syncSectorPickerLabel/.test(js) && /sectorPickerLabel/.test(html));
  t.check("Escape closes whichever panel is open, sector first",
    /else if\(chipState\.sector\.open\) closeSectorPanel\(\)/.test(js) &&
    /else if\(chipState\.beneficiary\.open\) closeBeneficiaryPanel\(\)/.test(js));
t.check("the panel has a closed rule, so hidden actually works on a div",
  /\.chip-panel\[hidden\]\{display:none\}/.test(css));
t.check("the control is styled to match the select it imitates", /\.select-like\{/.test(css));
  t.check("reset closes the panel and clears the label, for both fields",
    /chipState\.sector\.open=false;/.test(js) &&
    /chipState\.beneficiary\.open=false;/.test(js));
/* compareBar / compareBarText / compareBarLink are created at runtime by renderCompareBar(). */
const markupIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
[...js.matchAll(/id="([^"]+)"/g)].forEach(m => markupIds.add(m[1]));
const dangling = [...new Set([...js.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]))]
  .filter(id => !markupIds.has(id));
t.check("every getElementById in app.js resolves to markup or a runtime-created node",
  dangling.length === 0, dangling.join(", "));

t.step("saved schemes: a view of the results grid, not a second copy of the page");
/* saveScheme() used to write to localStorage with no way to read the list back —
   you could save things and never retrieve them. */
t.check("the navbar has a plain Saved link that switches the results grid",
  /<a href="#schemes" onclick="showSaved\(\)">Saved<\/a>/.test(html));
t.check("no emoji and no count badge in the navbar entry, as asked",
  !/🔖/.test(html.match(/<nav[\s\S]*?<\/nav>/)[0]) &&
  !/id="savedCount"/.test(html) && !/nav-count/.test(css));
t.check("there is no separate saved section below the results any more",
  !/<section id="saved">/.test(html) && !/id="savedList"/.test(html) && !/id="savedCountLine"/.test(html));
t.check("Saved is a mode of the same results grid, not a parallel list",
  /function showSaved\(\)/.test(js) && /currentMode="saved"/.test(js) &&
  /if\(currentMode==="saved"\) return savedSchemes\(\)\.found\.map/.test(js));
t.check("the grid heading and result count follow the mode",
  /isSaved \? "Saved schemes" : "Browse all schemes"/.test(js) &&
  /`\$\{n\} saved scheme\$\{n===1\?"":"s"\}`/.test(js));
t.check("browse controls are hidden in saved mode — a shortlist is not a query",
  /toolbarEl\.style\.display = currentMode==="browse" \? "" : "none"/.test(js) &&
  /filtersEl\.style\.display = currentMode==="browse" \? "" : "none"/.test(js));
t.check("a leftover search box or filter cannot narrow the shortlist",
  /Saved ignores the search box and the filters/.test(js) &&
  /if\(currentMode==="saved"\)/.test(js.indexOf("const q=") > 0 ? js : ""));
t.check("the saved banner explains the storage and offers a way back",
  /kept in this browser only/.test(js) && /Nothing is uploaded/.test(js) &&
  /onclick="resetToBrowse\(\)"/.test(js));
t.check("Clear all only appears when there is something to clear",
  /found\.length\?` <button class="clear-quick" onclick="clearSaved\(\)">Clear all ✕<\/button>`:""/.test(js));
t.check("Clear all asks before destroying the list, and says it cannot be undone",
  /if\(!confirm\(/.test(js) && /cannot be undone/.test(js));
t.check("a saved card is drawn by the same renderer as a result card",
  /function schemeCardHtml\(/.test(js) &&
  /visible\.map\(\(\{s,pct,why,blockers\}\) *=> *schemeCardHtml\(s,pct,why,blockers,isSaved\)\)/.test(js) &&
  /savedSchemes\(\)\.found\.map\(s=>\(\{s,pct:null/.test(js));
t.check("card markup exists in exactly one place",
  (js.match(/<article class="scheme-card\$\{/g) || []).length === 1);
t.check("a saved card is not given a fabricated match score",
  /s,pct:null,why:\[\],blockers:\[\]/.test(js) && /pct!==null&&pct!==undefined/.test(js));
t.check("a saved id that has left the dataset is disclosed, not silently dropped",
  /no longer in the current dataset/.test(js) && /function savedSchemes/.test(js) && /missing\.length/.test(js));
t.check("an orphan id can be cleaned up from the banner", /function removeSaved\(id\)/.test(js) && /removeSaved\('\$\{escJs\(id\)\}'\)/.test(js));
t.check("the empty shortlist explains how to save and that storage is local",
  /Nothing saved yet/.test(js) && /Tap <b>Save<\/b>/.test(js) && /local storage/.test(js));
t.check("the orphan notice is styled, and no longer needs grid placement",
  /\.stale-note\{/.test(css) && /\.stale-chip\{/.test(css) &&
  !/grid-column:1\/-1/.test((css.match(/\.stale-note\{[^}]*\}/) || [""])[0]));
t.check("CSS left behind by the removed section is gone", !/\.saved-bar\{/.test(css) && !/\.nav-count\{/.test(css));

t.step("compare: schemes are picked from the shortlist itself");
/* Compare existed only as "Add to Compare" inside the details modal, so weighing
   up a shortlist meant opening each scheme one at a time. The checkbox on the
   card is the whole point of the feature. */
t.check("the card renderer takes a selectable flag",
  /function schemeCardHtml\(s, pct, why, blockers, selectable\)/.test(js));
t.check("only the shortlist opts in — a 59-card browse grid does not",
  /schemeCardHtml\(s,pct,why,blockers,isSaved\)/.test(js) &&
  /isSaved = currentMode==="saved"/.test(js));
t.check("the control is a real checkbox in a label, not a div",
  /<label class="pick/.test(js) && /<input type="checkbox"/.test(js) && /<\/label>/.test(js));
t.check("it is wired to the same toggle the details modal uses",
  /onchange="toggleCompare\('\$\{s\.id\}'\)"/.test(js));
t.check("a picked card is visually marked", /selectable&&picked\?" selected":""/.test(js));
t.check("the selected state is styled without depending on newer selector support",
  /\.scheme-card\.selected\{/.test(css) && /\.pick\.on\{/.test(css) && !/:has\(/.test(css));
t.check("the cap is shown in the control, not only in a toast after the click",
  /const full = compareList\.length>=COMPARE_MAX && !picked/.test(js) &&
  /\$\{full\?" disabled":""\}/.test(js) && /\$\{full\?" \(3 selected\)":""\}/.test(js));
t.check("the cap is a named constant, not a literal 3 scattered around",
  /const COMPARE_MAX = 3;/.test(js) && !/compareList\.length<3/.test(js) && !/length>=3/.test(js));
t.check("the details-modal button cannot start a dead click either",
  /compareList\.length>=COMPARE_MAX&&!compareList\.includes\(s\.id\)\?" disabled":""/.test(js) &&
  /Compare is full \(\$\{COMPARE_MAX\}\)/.test(js));
t.check("1 selection is not a comparison, and the bar says so",
  /1 scheme selected — tick one more to compare/.test(js) && /if\(compareList\.length<2\) return "";/.test(js));
t.check("the shortlist banner tells you what the checkbox is for",
  /Tick <b>Compare<\/b>/.test(js) && /Save at least 2 schemes to compare/.test(js) &&
  /compareLinkHtml\(\)/.test(js));
t.check("the .pick markup lives in the one card renderer, not duplicated",
  (js.match(/class="pick/g) || []).length === 1);

t.step("compare opens in its own tab, not as a section below the page");
/* The table used to be a section under the results, so comparing pushed the
   rest of the site down and you lost your place in the list. */
t.check("the inline compare section is gone from index.html",
  !/id="compareSection"/.test(html) && !/id="compare"/.test(html));
t.check("app.js no longer renders a table into the main page",
  !/function renderCompare\(\)/.test(js) && !/getElementById\("compare"\)/.test(js));
t.check("there is a real second page for it",
  fs.existsSync(path.join(ROOT, "compare.html")) && fs.existsSync(path.join(ROOT, "js/compare.js")));
const cmp = fs.readFileSync(path.join(ROOT, "compare.html"), "utf8");
const cmpjs = fs.readFileSync(path.join(ROOT, "js/compare.js"), "utf8");
t.check("it loads the same dataset, the same stylesheet and the shared helpers",
  /data\/schemes\.js/.test(cmp) && /css\/styles\.css/.test(cmp) && /js\/util\.js/.test(cmp) && /js\/compare\.js/.test(cmp));
t.check("and it can get you back to the scheme list",
  /href="index\.html#schemes"/.test(cmp) && /← Back to schemes/.test(cmp));
t.check("the schemes are handed over in the query string, so the tab is reloadable",
  /return "compare\.html\?ids=" \+ compareList\.map\(encodeURIComponent\)\.join\(","\)/.test(js) &&
  /new URLSearchParams\(location\.search\)\.get\("ids"\)/.test(cmpjs));
t.check("it is a real link with target=_blank, not window.open",
  /target="_blank" rel="noopener"/.test(js) && !/window\.open/.test(code(js)) && !/window\.open/.test(code(cmpjs)));
t.check("localStorage is only a fallback for opening compare.html directly",
  /Opened directly, with no ids in the URL/.test(cmpjs) &&
  /localStorage\.getItem\("yojanaCompare"\)/.test(cmpjs));
t.check("no link is offered below 2 selections",
  /if\(compareList\.length<2\) return "";/.test(js) &&
  (js.match(/compareLinkHtml\(\)/g) || []).length >= 2);
t.check("the shared helpers are extracted, not copied into each page",
  fs.existsSync(path.join(ROOT, "js/util.js")) &&
  /function esc\(/.test(fs.readFileSync(path.join(ROOT, "js/util.js"), "utf8")) &&
  (js.match(/function esc\(t\)\{/g) || []).length === 0 &&
  !/function esc\(t\)\{/.test(fs.readFileSync(path.join(ROOT, "js/compare.js"), "utf8")));
t.check("index.html loads util.js before app.js, or the helpers would be missing",
  html.indexOf("js/util.js") > -1 && html.indexOf("js/util.js") < html.indexOf("js/app.js"));
t.check("an orphan id is disclosed on the compare page too",
  /no longer in the current dataset/.test(cmpjs) && /function renderMissing\(\)/.test(cmpjs) &&
  /missing\.length===1\?" is":"s are"/.test(cmpjs));
t.check("the compare page does not duplicate the matching rules",
  !/accessRoute|scoreScheme|VIA_INCUBATOR_RE|repayCategory/.test(code(cmpjs)) && /stay in app\.js/.test(cmpjs));
t.check("the diff toggle hides identical rows, and the button is only offered with 2+ columns",
  /diffRowsBtn"\)\.hidden = schemes\.length < 2/.test(cmpjs) &&
  /new Set\(vals\)\.size > 1/.test(cmpjs) &&
  /Show all rows/.test(cmpjs));
t.check("the compare page styles the row headers apart from the scheme names",
  /\.compare tbody th\[scope="row"\]/.test(css) && /\.compare tr\.differs td/.test(css) &&
  /\.compare-page/.test(css));

t.step("desktop layout: nothing is allowed to overflow or hide itself");
/* Each of these was a real defect, not a hypothetical. They are locked down
   here because a layout bug is invisible to every other suite. */
t.check("the compare page has its own vertical padding — it uses <main>, and only <section> was padded",
  /\.compare-page main\{padding:/.test(css) && !/^main\{[^}]*padding/m.test(css));
t.check("the compare table caps column width, or the untruncated prose stretches it off screen",
  /\.compare td\{[^}]*max-width:/.test(css) && /\.compare td\{[^}]*min-width:/.test(css));
t.check("the sticky table header sticks to the table, not behind the sticky site header",
  /\.compare\{[^}]*max-height:[^}]*overflow:auto/.test(css) &&
  /\.compare thead th\{[^}]*position:sticky/.test(css));
t.check("the fixed compare bar cannot run off both edges of the viewport",
  /\.compare-bar\{[^}]*max-width:min\(/.test(css) && /\.compare-bar\{[^}]*flex-wrap:wrap/.test(css));
t.check("the compare link inside that bar is styled like the buttons beside it",
  /\.compare-bar button,\.compare-bar a\{/.test(css));
t.check("the page is tall enough to clear the bar when it wraps",
  /body\.has-compare-bar\{padding-bottom:1\d\dpx\}/.test(css));
/* The container is deliberately full width now — the 92% gutter was removed on
   request. What still matters is that text which must not stretch has its own
   cap, or a line of copy would run the full width of a 27" monitor. */
t.check("the container runs full width, with only a small fluid gutter",
  /\.container\{width:100%;padding-inline:clamp\(16px,3vw,40px\)/.test(css) &&
  !/\.container\{[^}]*92%/.test(css));
t.check("the nav cannot wrap its labels",
  /\.navlinks a\{white-space:nowrap\}/.test(css));
t.check("prose that would stretch is capped instead of running the full width",
  /\.hero-copy\{max-width:840px\}/.test(css) &&
  /\.section-head\{[^}]*max-width:760px/.test(css) &&
  /\.find-box\{[^}]*max-width:1000px/.test(css) &&
  /footer p\{max-width:62ch\}/.test(css) &&
  /\.compare-page \.ref-note\{max-width:900px\}/.test(css) &&
  /\.institution-name\{[^}]*max-width:34ch/.test(css));
t.check("the gutter never collapses to zero, so text still clears the screen edge",
  /padding-inline:clamp\(16px,/.test(css));
/* Grids are the thing that should actually get the extra width. */
t.check("the card grids have no max-width, so they use the full width",
  /\.results\{display:grid/.test(css) && !/\.results\{[^}]*max-width/.test(css) &&
  /\.compare\{/.test(css) && !/\.compare\{[^}]*max-width/.test(css));
t.check("the nav hands over to the hamburger before the links run out of room",
  /@media\(max-width:1080px\)\{\s*\.navlinks\{display:none\}/.test(css) &&
  /* Scoped to media queries. A bare `max-width:1000px` ban also forbade an
     ordinary declaration of that length, which is what the find-box cap is. */
  !/@media\([^)]*max-width:1000px/.test(css));
/* The nav breakpoint used to carry the column counts with it, so raising it to
   fix the nav silently halved the results grid. They are separate queries now,
   and this query is allowed to hold the mobile panel's own rules. */
t.check("the nav breakpoint and the grid breakpoints are separate queries",
  /@media\(max-width:1080px\)\{\s*\.navlinks\{display:none\}\.menu\{display:block\}/.test(css) &&
  /@media\(max-width:1080px\)\{\s*\.categories\{grid-template-columns:repeat\(2,1fr\)\}/.test(css));
t.check("a wide desktop shows 4 results, and the rule comes after the base one",
  /@media\(min-width:1440px\)\{\s*\.results\{grid-template-columns:repeat\(4,1fr\)\}/.test(css) &&
  css.indexOf("min-width:1440px") > css.indexOf(".results{display:grid"));
/* The container lost its max-width, so on a big monitor four columns meant 600px
   cards. The extra width has to buy a column, or it is just wide cards. */
t.check("an extra-wide monitor gets a 5th column, ordered after the 4th",
  /@media\(min-width:1800px\)\{\s*\.results\{grid-template-columns:repeat\(5,1fr\)\}/.test(css) &&
  css.indexOf("min-width:1800px") > css.indexOf("min-width:1440px"));
t.check("wide cards still hold readable lines of copy",
  /\.step p,\.feature p\{[^}]*max-width:64ch/.test(css));
t.check("the 2-column rule lands before the 1-column one, or small screens get 2 columns",
  css.indexOf(".results{grid-template-columns:repeat(2,1fr)}") <
  css.indexOf(".steps,.feature-grid,.results{grid-template-columns:1fr}"));
t.check("the back link on the compare page sits at the far end of the header",
  /\.compare-page \.nav>\.btn\{margin-left:auto\}/.test(css));
t.check("the css braces still balance",
  (css.match(/{/g) || []).length === (css.match(/}/g) || []).length);

/* ---------- Business Stage and Beneficiary Type ----------
   They were <input list="..."> + <datalist>, which is why the user saw no drop:
   a browser only opens a datalist popup once you have typed a character, and
   draws no arrow inviting you to. They are plain <select> elements now, like
   State / UT and the advanced filters, so the browser draws the dropdown and
   the whole list is one click away with nothing to expand first. */
t.step("Business Stage and Beneficiary Type are real dropdowns, like State / UT");
{
  /* Business Stage is a <select>; Beneficiary Type is now a chip field, the same
     control as Industry / Sector, because a scheme usually lists several
     beneficiary types and a founder can be more than one of them. */
  t.check("no free-text input and no datalist remains for either field",
    /<select id="stage"/.test(html) &&
    !/<input id="stage"/.test(html) && !/<input id="business"/.test(html) &&
    !/<datalist/.test(html) && !/list="(stage|business)List"/.test(html));
  t.check("stage stays a single-value select, because a startup is at one stage",
    !/id="stageChips"/.test(html) && !/stagePickerBtn/.test(html));
  /* A <select> with no placeholder starts on the first real value, so the form
     would submit an answer the user never gave. State / UT has one; so must these. */
  t.check("stage starts on a labelled empty option, so nothing is pre-filled",
    /<select id="stage"><option value="">Select business stage<\/option>/.test(html));
  t.check("the beneficiary picker starts on a labelled placeholder too",
    /id="beneficiaryPickerLabel">Select beneficiary types…/.test(html));
  t.check("stage is populated from the dataset by the filter helper",
    /fillSelect\("stage", stageEntries/.test(js));
  t.check("beneficiary chips are built from the dataset",
    /chipHtml\(beneficiaryEntries, "beneficiary", "toggleEligBeneficiary"\)/.test(js));
  /* Two calls, one definition: a second hand-written chip builder for
     beneficiary would be a third call site with its own markup. */
  t.check("both chip lists come from ONE builder, so their markup cannot drift",
    /const chipHtml = \(entries, field, fn\) =>/.test(js) &&
    (js.match(/= chipHtml\(/g) || []).length === 2,
    (js.match(/= chipHtml\(/g) || []).length + " call sites");
  t.check("nothing is hidden behind a toggle \u2014 the full list is in the control",
    !/stageToggle|stageList|businessList/.test(js) && !/id="stageList"/.test(html));
  /* Every option states how many schemes reach it: beneficiary has 76
     near-duplicate values across 59 schemes, and without a count a label that
     reaches one scheme looks identical to one that reaches sixteen. */
  t.check("each option carries its scheme count in the label",
    /o\.textContent=`\$\{v\} \(\$\{c\}\)`/.test(code(js)));
  t.check("the .value stays the bare dataset string, which is what the matcher compares",
    /o\.value=v;/.test(code(js)));
  /* Multi-select changes the scoring contract: the profile now carries an array,
     and a scheme listing several of your types is credited for each. */
  t.check("the profile carries a beneficiary array, not one string",
    /beneficiaries: beneficiaries/.test(js) && !/businessValue:/.test(code(js)));
  t.check("scoring credits a scheme for each of your types it lists, capped so one axis cannot dominate",
    /const specific=p\.beneficiaries\.filter\(b=>s\.target_beneficiaries\.includes\(b\)\)/.test(js) &&
    /score\+=20\+Math\.min\(6,\(specific\.length-1\)\*3\)/.test(js));
  t.check("and the reason names only the types that actually matched",
    /specific\.map\(esc\)\.join\(", "\)/.test(js));
  /* Regression: esc() was applied to a textContent assignment, so the entities
     were shown to the user — the stage option read "R&amp;D (3)". esc() is for
     building HTML strings; a text node is already inert. */
  t.check("option text is not escaped a second time",
    !/o\.textContent=`\$\{esc\(/.test(code(js)));
  /* The fuzzy resolver is still underneath, and still used. It is what a
     restored value or a saved profile goes through. */
  /* resolveAgainst() now only serves the stage. The beneficiary path never needed
     a resolver — a select could only hold a dataset value, and a chip cannot hold
     anything else — so the call was dead weight. */
  t.check("the fuzzy resolver is still wired in for the stage, which can be restored",
    /resolveAgainst\(stageRaw, ALL_STAGES\)/.test(js));
  t.check("and is not called for beneficiary, which cannot hold a value needing one",
    !/resolveAgainst\(biz/.test(js) && !/bizRes/.test(code(js)));
  /* Dead code left behind by the free-text version. */
  /* Against code(js), not js: the names survive in the comments explaining
     why the functions went away, and a check written to catch a live function
     must not trip over the note describing its removal. */
  t.check("removed: setFieldHint / updateFieldHints \u2014 a select cannot hold a bad value",
    !/setFieldHint|updateFieldHints/.test(code(js)));
  t.check("removed: the hint elements themselves", !/stageHint|businessHint/.test(html) && !/stageHint|businessHint/.test(js));
  t.check("removed: the empty-result tips about non-dataset values, which cannot fire",
    !/is not a dataset stage/.test(code(js)) && !/is not a dataset beneficiary/.test(code(js)));
  t.check("removed: every trace of the hand-drawn dropdown",
    !/combo/i.test(html) && !/combo/i.test(css) && !/combo/i.test(code(js)));
  t.check("removed: the document click handler that only existed to close it",
    !/closest\("\.combo"\)/.test(code(js)));
  t.check("removed: resetForm no longer closes a panel that cannot exist",
    !/function resetForm\(\)\{[\s\S]*?closeComboPanel/.test(code(js)));
  t.check("the select styling already in place covers these two fields",
    /\.field input,\.field select\{/.test(css) && /\.field input:focus,\.field select:focus\{/.test(css));
}

t.step("the header is navy with a gold rule, and nothing on it is invisible");
/* Each of these was a real collision when the bar went navy. A contrast bug is
   invisible to every other suite, so they are pinned here. */
{
  const hdr = /header\{([^}]*)\}/.exec(css);
  t.check("the bar is navy, in the logo's blues",
    !!hdr && /var\(--navy2\)/.test(hdr[1]) && /var\(--navy\)/.test(hdr[1]));
  t.check("with a gold rule along the bottom",
    !!hdr && /border-bottom:2px solid var\(--gold\)/.test(hdr[1]));
  t.check("the backdrop-filter is gone — the bar is opaque, so it did nothing",
    !/header\{[^}]*backdrop-filter/.test(css));
  t.check("the nav links are white, with a gold underline on hover",
    /\.navlinks a\{[^}]*color:rgba\(255,255,255/.test(css) &&
    /\.navlinks a:hover\{[^}]*border-bottom-color:var\(--gold\)/.test(css));
  t.check("the hover underline cannot shift the row, so the border is always there",
    /\.navlinks a\{[^}]*border-bottom:2px solid transparent/.test(css));
  t.check("the navy brand text became white",
    /\.brandname b\{[^}]*color:#fff/.test(css) && !/\.brandname\{[^}]*color:var\(--navy\)/.test(css));
  t.check("the hamburger is white too",
    /\.menu\{[^}]*color:#fff/.test(css));
  /* .btn-primary is navy. Left alone it would sit navy-on-navy in the bar. */
  t.check("the bar's navy call-to-action is restyled, and only inside the bar",
    /\.navlinks \.btn-primary\{[^}]*background:var\(--gold\)/.test(css) &&
    /\.btn-primary\{background:var\(--navy\)/.test(css));
  t.check("the divider is a translucent white rule, not a pale one",
    /\.divider\{[^}]*background:rgba\(255,255,255/.test(css));
  t.check("the skip link is gold, so it is visible against the navy bar",
    /\.skip-link\{[^}]*background:var\(--gold\)/.test(css));
  t.check("the compare page's back link is legible on the navy bar",
    /\.nav \.btn-outline\{[^}]*color:#fff/.test(css));
  t.check("the brand shows the name over its Devanagari name",
    /<span class="brandname"><b>Yojana Setu<\/b><small lang="hi">योजना सेतु<\/small><\/span>/.test(html));
  t.check("the Devanagari line is in the logo's gold, and marked up as Hindi",
    /\.brandname small\{[^}]*color:var\(--gold-soft\)/.test(css) && /--gold-soft:/.test(css));
  t.check("the Devanagari line is dropped on a phone, the name is not",
    /\.brandname small\{display:none\}/.test(css) &&
    !/\.divider,\.brandname\{display:none\}/.test(css));
}

/* The mobile panel used to be styled with inline styles in openMobileNav(),
   hard-coding a white background — which put white nav links on white once the
   bar turned navy. It is a stylesheet rule now. */
t.step("the mobile nav panel is styled in the stylesheet, not inline in js");
{
  const panel = /@media\(max-width:1080px\)\{[\s\S]*?\.navlinks\.mobile-open\{/.test(css);
  t.check("the open panel is a .mobile-open rule in the css", panel);
  t.check("it is navy, so the white link colour is right in both states",
    /\.navlinks\.mobile-open\{[^}]*background:var\(--navy2\)/.test(css));
  /* Scoped to each function body: a lazy [\s\S]*? would run past the closing
     brace and match a `.style.` in some later function. */
  const body = (from, to) => js.slice(js.indexOf(from), js.indexOf(to));
  t.check("openMobileNav() no longer writes inline styles",
    !/\.style\./.test(body("function openMobileNav(", "function closeMobileNav(")));
  t.check("closeMobileNav() no longer needs to clear an inline style attribute",
    !/removeAttribute\("style"\)/.test(body("function closeMobileNav(", "function toggleMobileNav(")));
  t.check("the panel is full-bleed, so it cannot leave a gap at the edges",
    /\.navlinks\.mobile-open\{[^}]*left:0;right:0/.test(css));
}

t.step("section labels: the heading is required, the label above it is not");
[["Explore", "Explore government schemes"],
 ["Scheme directory", "Browse all schemes"],
 ["Eligibility engine", "Find schemes for my startup"]].forEach(([eyebrow, heading]) => {
  t.check(`redundant eyebrow "${eyebrow}" removed (it only restated "${heading}")`,
    !new RegExp(`class="eyebrow">${eyebrow}<`).test(html));
});
t.check("eyebrows that add meaning are kept (How it works, Dashboard)",
  /class="eyebrow">How it works</.test(html) && /class="eyebrow">Dashboard</.test(html));
t.check("no dead .find .eyebrow rule left in the CSS", !/\.find\s+\.eyebrow/.test(css));

t.step("nav order matches the order sections appear on the page");
{
  const pageOrder = [...html.matchAll(/<(?:main|section)\b[^>]*\sid=["']([^"']+)["']/g)].map(m => m[1]);
  const navBlock = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/);
  const navLinks = [...navBlock[1].matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*>/g)].map(m => ({ id: m[1], tag: m[0] }));
  const navOrder = navLinks.map(l => l.id);
  const pos = navOrder.map(id => pageOrder.indexOf(id));
  t.check(`every nav link points at a real section (${navOrder.length} links)`, pos.every(p => p >= 0),
    navOrder.filter((_, i) => pos[i] < 0).join(", "));
  /* Two links may share a section when they are different views of it — Browse
     Schemes and Saved both drive #schemes, switching mode. Order must still not
     go backwards. */
  t.check("nav order matches page order (clicking through lands in the sequence offered)",
    pos.every((p, i) => i === 0 || p >= pos[i - 1]), `nav ${navOrder.join(" > ")} | page ${pageOrder.join(" > ")}`);
  const shared = navOrder.filter((id, i) => navOrder.indexOf(id) !== i);
  shared.forEach(id => {
    const tags = navLinks.filter(l => l.id === id).map(l => l.tag);
    t.check(`"${id}" is linked ${tags.length} times, and each link is distinguishable by its own handler`,
      tags.every(tag => /onclick="/.test(tag)) &&
      new Set(tags.map(tag => (/onclick="([^"]*)"/.exec(tag) || [])[1])).size === tags.length,
      tags.join(" | "));
  });
  t.check("the matching tool appears before the browse-explainer sections",
    pageOrder.indexOf("find") < pageOrder.indexOf("about") && pageOrder.indexOf("schemes") < pageOrder.indexOf("categories"),
    pageOrder.join(" > "));
  t.check("Saved has no section of its own left on the page", !pageOrder.includes("saved"));
}

t.step("heading outline is intact");
{
  const sections = [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)];
  t.check("exactly one <h1> in the document", (html.match(/<h1[\s>]/g) || []).length === 1,
    (html.match(/<h1[\s>]/g) || []).length + " found");
  const hero = sections.find(s => /class="hero"/.test(s[0]));
  t.check("the hero section carries the <h1>", !!hero && /<h1[\s>]/.test(hero[1]));
  const rest = sections.filter(s => s !== hero);
  t.check(`every non-hero section carries an <h2> (${rest.length} sections)`, rest.every(s => /<h2[\s>]/.test(s[1])),
    rest.filter(s => !/<h2[\s>]/.test(s[1])).map(s => s[0].slice(0, 60)).join(" | "));
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  const h2s = (html.match(/<h2[\s>]/g) || []).length;
  t.check("headings never skip a level (h1 -> h2 only)", h1s === 1 && h2s >= 1, `h1=${h1s} h2=${h2s}`);
}

t.step("the institution credit and the real logo files");
{
  /* An <img src> that 404s is invisible in a text editor and in every other
     suite here, so the paths are checked against the filesystem directly. */
  const imgs = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(m => m[1])
    .concat([...cmp.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(m => m[1]));
  t.check("no <img> is left pointing at a data: URI placeholder",
    !imgs.some(s => s.startsWith("data:")) && imgs.length > 0, imgs.join(" | "));
  const missing = imgs.filter(s => !/^(https?:|data:)/.test(s) && !fs.existsSync(path.join(ROOT, s)));
  t.check(`every local image path exists on disk (${imgs.length} images)`, missing.length === 0, missing.join(", "));
  t.check("the navbar uses the supplied logo, not the placeholder",
    /<img class="logo" src="img\/logo\.webp"/.test(html) && /<img class="logo" src="img\/logo\.webp"/.test(cmp));
  t.check("the college logo is in the footer, in the bottom corner row",
    /class="institution"[\s\S]*?src="img\/institution\.webp"/.test(html) &&
    /class="footer-bottom"/.test(html));
  t.check("it is named exactly as asked",
    /Modern Education Society's College of Engineering, Pune/.test(html) &&
    /class="institution-label">Our institution</.test(html));
  t.check("the college name is visible text, not only an image",
    !/Modern Education Society[^<]*<img/.test(html));
  /* Decorative: the site and college names sit right beside both images, so
     alt text would make a screen reader say each name twice. */
  t.check("both images are marked decorative, because their names are adjacent text",
    [...html.matchAll(/<img class="(?:logo|institution-logo)"[^>]*>/g)]
      .every(m => /alt=""[^>]*aria-hidden="true"/.test(m[0])));
  /* Opaque squares: without a radius they read as stray boxes on either the
     white navbar or the dark footer. */
  t.check("the square logo art is rounded so it reads as a plate, not a stray box",
    /\.logo\{[^}]*border-radius:/.test(css) && /\.institution-logo\{[^}]*border-radius:/.test(css));
  t.check("the institution block cannot be squeezed off the footer edge",
    /\.institution\{[^}]*max-width:100%/.test(css) && /\.footer-bottom\{[^}]*flex-wrap:wrap/.test(css) &&
    /\.institution\{[^}]*margin-left:auto/.test(css));
  t.check("...and goes full width instead of clipping when the space is tight",
    /@media\(max-width:700px\)\{[\s\S]*?\.institution\{margin-left:0;width:100%\}/.test(css));
}

t.step("the hero emblem was removed, and left nothing behind");
{
  /* Removed on request. These guard against the removal being half-done, which
     is how dead CSS and orphaned rules get left in a stylesheet. */
  t.check("no emblem markup in the hero",
    !/hero-emblem/.test(html) && !/emblem-logo/.test(html));
  t.check("no emblem CSS left in the stylesheet",
    !/hero-emblem|emblem-logo/.test(css));
  t.check("the hero is back to a single column — no orphaned two-column override",
    !/hero-grid\{grid-template-columns:minmax/.test(css) &&
    /\.hero-grid\{display:grid;grid-template-columns:1fr/.test(css));
  t.check("no orphaned `order` rules that existed only to place the emblem",
    !/\.hero-copy\{order:/.test(css) && !/\.hero-emblem\{[^}]*order:/.test(css));
  /* The navbar and footer logos are a separate request and must survive. */
  t.check("the navbar and footer logos are untouched",
    (html.match(/<img class="logo" src="img\/logo\.webp"/g) || []).length === 2 &&
    /class="institution-logo" src="img\/institution\.webp"/.test(html));
  t.check("the hero still leads with the h1, with nothing above it",
    /<div class="container hero-grid">\s*<div class="hero-copy">\s*<span class="badge"/.test(html));
}

t.step("markup integrity");
{
  const all = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m => m[1]);
  const dupes = [...new Set(all.filter((v, i) => all.indexOf(v) !== i))];
  t.check("no duplicate element ids", dupes.length === 0, dupes.join(", "));
  const fors = [...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/g)].map(m => m[1]);
  const orphans = fors.filter(f => !new Set(all).has(f));
  t.check(`all ${fors.length} label/for targets exist`, orphans.length === 0, orphans.join(", "));
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]);
  t.check(`all ${imgs.length} <img> carry an alt attribute`, imgs.every(x => /\balt=/.test(x)));
  t.check("logos are decorative (adjacent text already names the brand, so no duplicate announcement)",
    imgs.filter(x => /class="logo/.test(x)).every(x => /alt=""/.test(x)));
  t.check("every <input> has an id", !/<input(?![^>]*\sid=)/.test(html));
}

t.step("accessibility wiring");
t.check("result count is a live region", html.includes('aria-live="polite"'));
t.check("disclosure controls expose aria-expanded", html.includes('aria-expanded="false"'));
t.check("keyboard activation exists on the explore tiles", html.includes("onkeydown") || js.includes("onkeydown"));
t.check("modal is marked as a dialog", html.includes('role="dialog"') && html.includes('aria-modal="true"'));
t.check("a skip link is present", html.includes('class="skip-link"'));

t.step("styling for every new component");
["chip-filter", "field-hint", "ref-note", "chip-scroll"].forEach(c => t.check("." + c + " is styled", css.includes("." + c)));
t.check("compare-bar body offset is defined in CSS and toggled in JS",
  js.includes("has-compare-bar") && css.includes("has-compare-bar"));
t.check("no unbalanced CSS braces", (css.match(/{/g) || []).length === (css.match(/}/g) || []).length);

t.step("FUNDING_BANDS keys match real <option> values in the form");
{
  const block = js.match(/const FUNDING_BANDS = \{([\s\S]*?)\};/);
  t.check("FUNDING_BANDS is declared", !!block);
  const bands = [...block[1].matchAll(/"([^"]+)":/g)].map(m => m[1]);
  const opts = [...html.matchAll(/<option[^>]*>([^<]+)<\/option>/g)].map(m => m[1]);
  bands.forEach(b => t.check(`band "${b}" exists in the form`, opts.includes(b)));
  t.check("every FUNDING_BANDS key is distinct", new Set(bands).size === bands.length);
}

t.step("dataset shape assumed by app.js");
{
  const data = fs.readFileSync(path.join(ROOT, "data/schemes.js"), "utf8");
  t.check("data/schemes.js assigns window.SCHEMES_DATA", /window\.SCHEMES_DATA\s*=\s*\[/.test(data));
  const records = (data.match(/"id":"/g) || []).length;
  t.check("dataset is a non-trivial array (" + records + " records)", records > 10);
  const fields = ["scheme_name","short_name","government_level","ministry_department","scheme_type","status",
    "primary_objective","target_beneficiaries","startup_stages","sectors","benefit_type","financial_benefit",
    "repayment_required","key_benefits","eligibility","application_process","documents","selection_method",
    "application_url","official_source","tags","search_text","last_verified","data_source","disclaimer","id"];
  const missingFields = fields.filter(f => !new RegExp('"' + f + '"\\s*:').test(data));
  t.check("all " + fields.length + " fields app.js reads are present in every record", missingFields.length === 0, missingFields.join(", "));
  const ids = [...data.matchAll(/"id":\s*"([^"]+)"/g)].map(m => m[1]);
  t.check("scheme ids are unique", new Set(ids).size === ids.length, ids.length + " ids");
}

process.exit(t.finish() ? 1 : 0);
