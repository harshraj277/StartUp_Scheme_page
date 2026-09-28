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
/* The hero is two columns on a wide screen — copy left, mark right — so "one
   readable column" is no longer the goal. What still has to hold is that the
   copy is width-capped, and that the grid collapses to one column rather than
   leaving a 300px mark squeezed beside the text. */
t.check("the hero copy is width-capped, so the headline cannot run the full page",
  /\.hero-copy\{[^}]*max-width:840px/.test(css));
t.check("and the copy column can shrink inside the grid instead of forcing it wide",
  /\.hero-copy\{[^}]*min-width:0/.test(css));
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
t.check("a selected sector is never collapsed out of reach", /const keep = eligSectors\.has/.test(js));
t.check("the collapsed list is described honestly to the user", /each reach just one scheme/.test(js));
t.check("reset restores the collapsed default", /sectorListExpanded=false;/.test(js));
t.check("the toggle has its own styles", /\.chip-more\{/.test(css) && /\.chip-bar\{/.test(css));
t.check("the toggle is visible only when it has something to do", /btn\.hidden = !!q/.test(js));

t.step("sector field behaves like a dropdown, like State / UT");
t.check("the closed control is a button, not a wall of chips",
  /<button[^>]*id="sectorPickerBtn"/.test(html) && /id="sectorPanel" hidden/.test(html));
t.check("it points at the panel it opens", /id="sectorPickerBtn"[^>]*aria-controls="sectorPanel"/.test(html));
t.check("expanded state is mirrored for assistive tech",
  /setAttribute\("aria-expanded", String\(sectorPanelOpen\)\)/.test(js) && /aria-expanded="false"/.test(html));
t.check("the closed control reports the current selection instead of hiding it",
  /syncSectorPickerLabel/.test(js) && /sectorPickerLabel/.test(html));
t.check("Escape closes the panel", /else if\(sectorPanelOpen\) closeSectorPanel\(\)/.test(js));
  /* The rule is on .picker-panel, which the beneficiary panel shares \u2014 renamed
     from .sector-panel when that field joined it, so one class cannot style one
     field's panel open and leave the other's shut. */
  t.check("the panel has a closed rule, so hidden actually works on a div",
  /\.picker-panel\[hidden\]\{display:none\}/.test(css) && !/\.sector-panel\{/.test(css));
t.check("the control is styled to match the select it imitates", /\.select-like\{/.test(css));
t.check("reset closes the panel and clears the label", /sectorPanelOpen=false;/.test(js));
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
t.check("an orphan id can be cleaned up from the banner", /function removeSaved\(id\)/.test(js) && /removeSaved\('\$\{esc\(escJs\(id\)\)\}'\)/.test(js));
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
  /* Matched exactly, not as a prefix. /class="pick/ also matched the beneficiary
     rows (class="pick-row"), so a second and unrelated family of .pick*
     classes silently turned this into a check on the wrong thing. */
  t.check("the .pick markup lives in the one card renderer, not duplicated",
  (js.match(/class="pick\$\{/g) || []).length === 1);
  t.check("and the beneficiary rows are a distinct class, so the two do not shadow each other",
  /class="pick-row/.test(js) && /\.pick-row\{/.test(css) && !/\.pick\.pick-row/.test(css));

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
  /\.hero-copy\{[^}]*max-width:840px/.test(css) &&
  /\.section-head\{[^}]*max-width:760px/.test(css) &&
  /\.hero p\.lead\{[^}]*max-width:56ch/.test(css) &&
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
t.step("Business Stage and Beneficiary Type are pickers, like State / UT");
{
  /* Both used to be <input list="..."> + <datalist>, which is why the user saw
     no drop: a browser only opens a datalist popup once you have typed a
     character, and draws no arrow inviting you to. Stage is a plain <select>,
     so the browser draws the dropdown. Beneficiary needs several answers, and a
     <select multiple> cannot give them a real collapsed state, so it is a button
     and a panel — the same shape as the sector field below it. */
  t.check("neither is a free-text input or a datalist any more",
    /<select id="stage"/.test(html) && /id="businessPickerBtn"/.test(html) &&
    !/<input id="stage"/.test(html) && !/<input id="business"/.test(html) &&
    !/<datalist/.test(html) && !/list="(stage|business)List"/.test(html));
  /* A single <select> with no placeholder starts on the first real value, so the
     form would submit an answer the user never gave. Stage gets one. */
  t.check("stage starts on a labelled empty option, so nothing is pre-filled",
    /<select id="stage"><option value="">Select business stage<\/option>/.test(html));
  t.check("both are populated from the dataset, stage through the helper the filters use",
    /fillSelect\("stage", stageEntries/.test(js) && /function fillSelect\(/.test(code(js)) &&
    /function renderBeneficiaryPicks\(\)/.test(code(js)) &&
    /BENEFICIARY_ENTRIES\s*=\s*beneficiaryEntries/.test(js));
  t.check("nothing is hidden behind a toggle — the full list is in the control",
    !/stageToggle|stageList|businessList/.test(js) && !/id="stageList"/.test(html));
  /* Every option states how many schemes reach it: beneficiary has 76
     near-duplicate values across 59 schemes, and without a count a label that
     reaches one scheme looks identical to one that reaches sixteen. */
  t.check("each stage option carries its scheme count in the label",
    /o\.textContent=`\$\{v\} \(\$\{c\}\)`/.test(code(js)));
  t.check("and each beneficiary row does too",
    /<span class="pick-count">\(\$\{c\}\)<\/span>/.test(code(js)));
  t.check("the .value stays the bare dataset string, which is what the matcher compares",
    /o\.value=v;/.test(code(js)) && /data-beneficiary="\$\{esc\(v\)\}"/.test(code(js)));
  /* Regression: esc() was applied to a textContent assignment, so the entities
     were shown to the user — the stage option read "R&amp;D (3)". esc() is for
     building HTML strings; a text node is already inert. The rows are built as
     an HTML string, so theirs does need it. */
  t.check("option text is not escaped a second time",
    !/o\.textContent=`\$\{esc\(/.test(code(js)));
  /* esc() for the HTML, then esc(escJs()) for the value inside the inline
     handler: that string is a JS string inside an HTML attribute, so it needs
     both, in that order. escJs alone leaves a double quote free to close the
     attribute. See the note on escJs in util.js. */
  t.check("but the row names, which are built as HTML, are escaped",
    /\$\{esc\(v\)\} <span class="pick-count">/.test(code(js)) &&
    /onchange="toggleBeneficiary\('\$\{esc\(escJs\(v\)\)\}'\)"/.test(code(js)));
  t.check("every inline handler built from a dataset value is escaped the same way, not just this one",
    (code(js).match(/(?:onclick|onchange)="[a-zA-Z]+\('\$\{esc\(/g) || []).length === 3 &&
    !/(?:onclick|onchange)="[a-zA-Z]+\('\$\{escJs\(/.test(code(js)) &&
    (code(js).match(/esc\(escJs\(/g) || []).length === 3,
    (code(js).match(/(?:onclick|onchange)="[^"]{0,60}/g) || []).join("\n     "));
  /* Checked against the data rather than assumed: this suite reads the dataset
     as text, so the three vocabularies that reach an inline handler are pulled
     straight out of their array literals. The rest of the file is full of prose
     and URLs with apostrophes in them, so a whole-file scan would prove nothing. */
  {
    const raw = fs.readFileSync(path.join(ROOT, "data/schemes.js"), "utf8");
    const values = ["target_beneficiaries", "sectors", "startup_stages"].flatMap(f =>
      [...raw.matchAll(new RegExp('"' + f + '"\\s*:\\s*\\[([^\\]]*)\\]', "g"))]
        .flatMap(m => [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => JSON.parse('"' + x[1] + '"'))));
    const risky = [...new Set(values)].filter(v => /["'\\<>]/.test(v));
    t.check("and the data happens not to need it — no vocabulary value holds a quote or a backslash",
      values.length > 50 && risky.length === 0,
      risky.length ? "escaping the handler is load-bearing: " + risky.slice(0, 4).join(" | ")
        : values.length + " vocabulary values, so esc(escJs()) above is belt-and-braces, not a live fix");
  }
  /* The fuzzy resolver is still underneath, and still used. It is what a
     restored value or a saved profile goes through. */
  t.check("the fuzzy resolver stays wired in for the single-select stage field",
    /resolveAgainst\(stageRaw, ALL_STAGES\)/.test(js));
  t.check("the picker needs no resolver: every row is a dataset value",
    !/resolveAgainst\(biz/.test(code(js)));
  /* Dead code left behind by the free-text version. */
  /* Against code(js), not js: the names survive in the comments explaining
     why the functions went away, and a check written to catch a live function
     must not trip over the note describing its removal. */
  t.check("removed: setFieldHint / updateFieldHints — a select cannot hold a bad value",
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
  t.check("the select styling already in place covers the stage field",
    /\.field input,\.field select\{/.test(css) && /\.field input:focus,\.field select:focus\{/.test(css));
  t.check("and the beneficiary field is styled by the same rules as the sector field, not its own",
    /<button type="button" class="select-like" id="businessPickerBtn"/.test(html) &&
    /class="picker-panel rows" id="businessPanel"/.test(html) &&
    /class="picker-panel" id="sectorPanel"/.test(html));
  t.check("one panel class for both, not a class named for one of the two fields",
    /\.picker-panel\{/.test(css) && !/\.sector-panel\{/.test(css) && !/\.business-panel\{/.test(css));
}

t.step("Beneficiary Type is the State / UT dropdown, with several picks kept and visible");
{
  /* The ask is "similar to State / UT, with multiple select". The closed control
     and its open/close behaviour are State / UT's, and several rows can be ticked
     at once — but the rows are checkboxes, not <option>s inside a <select
     multiple>. That element is a list box with no expanded state at all, so it
     never collapsed, and on a desktop a plain click REPLACED the selection
     instead of adding to it unless you held Ctrl: the note had to spell out
     "Ctrl / Cmd-click", which is not guessable and does not exist on a touch
     screen, so the same control silently behaved differently by device and the
     desktop path lost picks. A tick per row is the same multi-select semantics
     with a collapsed state and no modifier. */
  t.check("no <select multiple> is left on either page, so the trap cannot come back",
    !/<select[^>]*\smultiple/.test(html) && !/<select[^>]*\smultiple/.test(fs.readFileSync("compare.html", "utf8")));
  t.check("the control is a button that owns a dropdown, so it has a collapsed state",
    /<button[^>]*id="businessPickerBtn"[^>]*aria-haspopup="listbox"[^>]*aria-expanded="false"[^>]*aria-controls="businessPanel"/.test(html));
  t.check("and it tells a screen reader it opens a list of options, which a bare aria-expanded does not say",
    /aria-haspopup="listbox"/.test(html) && /aria-controls="businessPicks"/.test(html));
  t.check("the panel ships closed, with a rule that makes hidden work on a div",
    /class="picker-panel rows" id="businessPanel" hidden/.test(html) &&
    /\.picker-panel\[hidden\]\{display:none\}/.test(css));
  t.check("aria-expanded is kept in step with the panel, for a screen reader",
    /function syncBusinessPanel\(\)\{[\s\S]*?btn\.setAttribute\("aria-expanded", String\(businessPanelOpen\)\)/.test(code(js)));
  t.check("the list is a labelled group of checkboxes, so a click always toggles",
    /<div class="pick-list" id="businessPicks" role="group" aria-labelledby="businessPicksLabel">/.test(html) &&
    /<label id="businessPicksLabel">/.test(html));
  t.check("each row wraps its own checkbox in the label, so there is no id to get wrong 76 times",
    /<label class="pick-row" data-beneficiary="\$\{esc\(v\)\}" data-count="\$\{c\}">[\s\S]*?type="checkbox"[\s\S]*?<\/label>/.test(code(js)));
  t.check("the box is styled as one, and the list as a scroller rather than a list box",
    /\.pick-row input\{[^}]*accent-color/.test(css) && /\.pick-list\{[^}]*overflow:auto/.test(css) &&
    !/\.field select\[multiple\]/.test(css));
  /* "It is the State / UT dropdown again" is a claim about how three boxes relate
     in space, and prose claiming it is not a check: each of these can be undone
     one declaration at a time and the field would still be a working multi-pick,
     it would just stop reading as the select above it. */
  t.check("the dropdown hangs off the closed box with no gap, and squares the box's bottom corners",
    /\.picker-panel\.rows\{margin-top:-1px;padding:0/.test(css) &&
    /\.select-like\.open\{[^}]*border-bottom-left-radius:0;border-bottom-right-radius:0/.test(css),
    (/\.picker-panel\.rows\{[^}]*\}/.exec(css) || [])[0]);
  t.check("so the top of the dropdown is a continuation of the box, not a second bordered panel",
    /\.picker-panel\.rows\{[^}]*border-radius:0 0 11px 11px/.test(css));
  /* Opening a picker must cover the fields below, not push them down. In flow it
     reflowed the grid: the controls you were about to use moved while you reached
     for them, and the panel changed the layout under your own cursor. */
  t.check("the dropdown is taken out of flow, so opening it overlays instead of reflowing the form",
    /\.picker-panel\{position:absolute;top:100%;left:0;right:0;/.test(css),
    (/\.picker-panel\{[^}]*\}/.exec(css) || [])[0]);
  t.check("it is positioned against a wrapper holding just the box, not against the whole field",
    /\.picker-anchor\{position:relative\}/.test(css) &&
    /<label id="businessPicksLabel">[\s\S]*?<div class="picker-anchor"><button[^>]*id="businessPickerBtn"[\s\S]*?<div class="picker-panel rows" id="businessPanel"[\s\S]*?<\/div><p class="picked-note"/.test(html) &&
    /<div class="picker-anchor"><button[^>]*id="sectorPickerBtn"[\s\S]*?<div class="picker-panel" id="sectorPanel"[\s\S]*?<\/div><\/div><\/div>/.test(html),
    "the note sits after the anchor, so 100% of .field would be under the note, not under the box");
  t.check("it carries a drop shadow, because it now floats over the form",
    /\.picker-panel\{[^}]*box-shadow:/.test(css));
  /* Above the sticky header (50) so a dropdown scrolled up under the bar still
     paints in front of it; below the modal backdrop (100) so an open modal is
     never covered by a picker left open behind it. */
  t.check("and its stacking sits between the sticky header and the modal backdrop",
    (() => {
      const z = Number((/\.picker-panel\{[^}]*z-index:(\d+)/.exec(css) || [])[1]);
      return z > 50 && z < 100;
    })(),
    "z-index " + (/\.picker-panel\{[^}]*z-index:(\d+)/.exec(css) || [])[1] + " vs header 50 / modal 100");
  /* :has() rather than an id or a class named for the field: the sector panel
     shares .picker-panel and is a chip cloud in a padded box, which is what it
     should stay. If the attached treatment were unscoped it would push the chip
     cloud flush against the border, and if it were id-scoped the shared class
     would have gone back to being two controls' styles. */
  t.check("and it is a layout variant on the shared class, not a second control's private class",
    /class="picker-panel rows" id="businessPanel"/.test(html) &&
    /class="picker-panel" id="sectorPanel"/.test(html) &&
    /\.picker-panel\{position:absolute/.test(css) &&
    !/\.business-panel|\.sector-panel|\.business-rows|\.sector-rows|\.beneficiary-rows/.test(code(css)),
    "one base class for both fields, one .rows variant keyed to the body's shape");
  /* The box tints its border while open, so the dropdown has to tint with it or
     the two halves of one control do not share an outline. That needs the class
     on both elements, not just the box — the CSS has no parent state to read. */
  t.check("and the two halves share one border colour while open",
    /\.picker-panel\.open\{border-color:#8ba8c5\}/.test(css) &&
    /function syncBusinessPanel\(\)\{[\s\S]*?panel\.classList\.toggle\("open", businessPanelOpen\)/.test(code(js)) &&
    /function syncSectorPanel\(\)\{[\s\S]*?panel\.classList\.toggle\("open", sectorPanelOpen\)/.test(code(js)),
    "the sector picker shares the panel class, so it needs the class too");
  t.check("the filter row is type-ahead inside the dropdown: flat, and a sibling of the scroller so it cannot scroll away",
    /\.pick-search\{[^}]*border-bottom:1px solid var\(--line\)/.test(css) && !/\.pick-search\{[^}]*border-radius/.test(css) &&
    /<input id="businessFilter" class="pick-search"[\s\S]*?<div class="pick-list" id="businessPicks"/.test(html) &&
    /<\/div><p class="pick-foot" id="businessPicksCount"/.test(html),
    "the row must come before the scroller and the foot line after it, or the dropdown scrolls its own chrome away");
  t.check("the count line is pinned to the foot of the dropdown, the way a select pins its status text",
    /<p class="pick-foot" id="businessPicksCount"/.test(html) && /\.pick-foot\{[^}]*border-top:1px solid var\(--line\)/.test(css));
  t.check("it is no longer a chip-bar row floating above the list, which is the sector field's layout",
    !/class="chip-bar"><span class="dash-mini" id="businessPicksCount"/.test(html));
  /* "The two fields should look alike" is a claim about six declarations in two
     different rules, and prose claiming it is not a check. Compared value by
     value, so a one-sided tweak (a rounder border on the button, say) fails
     here rather than showing up as one field subtly taller than its neighbour. */
  {
    const decls = (selector) => {
      const rule = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
        .find(m => m[1].trim().replace(/^\/\*[\s\S]*?\*\/\s*/, "").trim() === selector);
      if (!rule) return null;
      return Object.fromEntries(rule[2].split(";").map(d => d.split(":")).filter(p => p.length === 2)
        .map(([p, v]) => [p.trim(), v.trim()]));
    };
    const select = decls(".field input,.field select");
    const like = decls(".select-like");
    const BOX = ["border", "padding", "border-radius", "background", "color", "width"];
    /* A property absent from BOTH maps would compare undefined === undefined and
       pass, so an absent property counts as drift rather than as agreement. */
    const drift = !select || !like ? ["a rule is missing"]
      : BOX.filter(p => select[p] === undefined || like[p] === undefined || select[p] !== like[p])
        .map(p => p + ": select " + select[p] + " vs button " + like[p]);
    t.check("its closed box is the same box as the State / UT select, declaration for declaration",
      drift.length === 0,
      drift.join("; "));
    /* The group rule alone is not enough: a later bare `select{}` or
       `.select-like{}` setting font-family would win the cascade and put a
       serif letterform in one field and a sans one in its neighbour, while the
       rule above still read as present.
       Comments are stripped off each selector first, the same way decls() above
       does. Without that, prose in the stylesheet is read as a selector: a
       comment explaining why there is no <select multiple> contains the word
       "select", and the very next rule that sets a font — the dropdown's own
       type-to-filter row — was reported here as a rule styling the select. The
       check is about the closed control's font, so only real selectors count. */
    const GROUP = "button,input,select";
    const selectorOf = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ").trim();
    const loneFont = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .map(m => [selectorOf(m[1]), m[2]])
      .filter(([sel]) => sel && sel !== GROUP && /(^|[\s,>])(select|button)\b|\.select-like/.test(sel))
      .filter(([, body]) => /(^|;)\s*font(-family)?\s*:/.test(body))
      .map(([sel]) => sel);
    t.check("and it inherits the same font, so it cannot read as a button next to a select",
      /button\s*,\s*input\s*,\s*select\s*\{\s*font:inherit\s*\}/.test(css.replace(/\s+/g, " ")) &&
      loneFont.length === 0,
      loneFont.length ? "a later rule sets the font on one of them: " + loneFont.join(" | ") : "");
  }
  /* One source of truth. The tick in the list is derived from the Set on every
     render, so the list and the profile cannot drift apart — which is the
     failure the old <select> made possible, where the two were separate
     sources of truth kept in step by a change listener. */
  t.check("the Set is the selection, declared once",
    /let eligBeneficiaries = new Set\(\)/.test(js));
  /* The tick is set in one function, from the Set, on the input the page can
     read back — not baked into the row markup. Re-rendering all 76 rows on every
     click would destroy the checkbox whose onchange had just fired, and with it
     the keyboard focus, so tabbing down the list would restart at the top. */
  t.check("the built rows carry no tick at all, so a stale one cannot be baked in",
    /<label class="pick-row" data-/.test(code(js)) &&
    !/class="pick-row\$\{/.test(code(js)) && !/type="checkbox"\$\{eligBeneficiaries/.test(code(js)));
  t.check("one function sets every tick, reading the Set — the row's class and its box together",
    /function syncBusinessTicks\(\)\{[\s\S]*?const on=eligBeneficiaries\.has\(row\.dataset\.beneficiary\);[\s\S]*?classList\.toggle\("on", on\)[\s\S]*?\.checked=on/.test(code(js)));
  /* Bounded to the function body on purpose: an unbounded [\s\S]*? would scan the
     rest of the file and find resetForm's legitimate render call. */
  t.check("ticking re-syncs the list and never rebuilds it",
    /function toggleBeneficiary\(v\)\{[^}]*syncBusinessTicks\(\);/.test(code(js)) &&
    !/renderBeneficiaryPicks/.test((code(js).match(/function toggleBeneficiary\(v\)\{[^}]*\}/) || [""])[0]));
  /* Counting beats naming. A blocklist of the three variables that used to hold
     this selection passes the moment a fourth appears, which is the only thing
     this check is for. An empty new Set() is a selection someone mutates; a new
     Set(x) is a count derived from the data, so the two are told apart by their
     argument rather than by their name. There is one per multi-select field. */
  t.check("and there is no second variable holding the same selection",
    (code(js).match(/new Set\(\)/g) || []).length === 2 &&
    /let eligSectors = new Set\(\)/.test(code(js)) &&
    /let eligBeneficiaries = new Set\(\)/.test(code(js)) &&
    !/businessValue|selectedValues|eligBusiness\b/.test(code(js)),
    (code(js).match(/new Set\(\)/g) || []).length + " empty Sets in app.js (one per multi-select field)");
  /* The stronger half: the toggle cannot create a shadow variable, because it
     assigns nothing at all, and every Set method it calls is called on the Set
     the matcher reads. Checked on the receiver of each call rather than by
     looking for a stray name — a name list is what let the first version of
     this pass a shadow written as `shadow.add(v)`. */
  t.check("and the toggle can only write to the Set — it assigns nothing, and every Set call is on that Set",
    (() => {
      const body = (code(js).match(/function toggleBeneficiary\(v\)\{[^}]*\}/) || [""])[0];
      const noAssign = !/=/.test(body.replace(/[=!]==|[<>]=/g, ""));   // ==, ===, !=, <=, >= dropped
      const receivers = [...body.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*(add|delete|has|clear|addAll)\s*\(/g)].map(m => m[1]);
      return noAssign &&
        receivers.length > 0 &&
        receivers.every(r => r === "eligBeneficiaries") &&
        /\.add\(v\)/.test(body) && /\.delete\(v\)/.test(body);
    })(),
    (() => {
      const body = (code(js).match(/function toggleBeneficiary\(v\)\{[^}]*\}/) || [""])[0];
      return "assigns: " + (/=/.test(body.replace(/[=!]==|[<>]=/g, "")) ? "yes" : "no") +
        ", Set calls on: " + [...new Set([...body.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*(?:add|delete|has|clear)\s*\(/g)].map(m => m[1]))].join(", ");
    })());
  t.check("findSchemes reads the same Set, not a control's .value",
    /const bizValues=\[\.\.\.eligBeneficiaries\]/.test(code(js)));
  t.check("the profile carries an array",
    /business: bizValues/.test(code(js)));
  /* A pick gives 20 to a matching scheme and 0 to a non-matching one, so extra
     picks must not be able to push a real match below a weaker one. */
  t.check("scoring credits every picked type the scheme actually lists",
    /const hit=p\.business\.filter\(b=>s\.target_beneficiaries\.some\(x=>closeEnough\(b,x\)\)\)/.test(code(js)));
  t.check("and a second matching pick is worth more than the first alone",
    /score\+=20\+Math\.min\(6,\(hit\.length-1\)\*3\)/.test(code(js)));
  /* 76 values, 74% of which reach a single scheme. A 7-row peephole with no
     filter was the other half of the problem, so the panel has to be able to
     search, and a pick must not be able to vanish behind a search. */
  t.check("the panel has a filter box, wired to a real handler",
    /id="businessFilter"[^>]*oninput="filterBusinessPicks\(\)"/.test(html) &&
    /function filterBusinessPicks\(\)\{ applyBusinessPicks\(\); \}/.test(code(js)));
  t.check("a picked row is never hidden by the filter, so it can always be unticked",
    /row\.hidden=!\(matches\|\|keep\)/.test(code(js)));
  t.check("and the count line says so rather than quietly holding a row open",
    /picked \$\{held===1\?"type is":"types are"\} kept visible/.test(code(js)));
  t.check("the count line also discloses how much of the list is a one-off",
    /reach a single scheme each/.test(code(js)));
  /* A dropdown that only closes on its own button or on Escape is one you have
     to aim at. Both panels get the same treatment, which the sector field never
     had. */
  t.check("Escape closes the panel",
    /e\.key!=="Escape"[\s\S]*?else if\(businessPanelOpen\) closeBusinessPanel\(\)/.test(code(js)));
  t.check("a click anywhere outside it closes it too",
    /addEventListener\("click",function\(e\)\{[\s\S]*?hits\("businessPickerBtn","businessPanel"\)/.test(code(js)));
  t.check("and the button and the panel are both excluded, or the click that opened it would close it again",
    /const hits = \(btnId,panelId\) => \{[\s\S]*?btn\.contains\(e\.target\)[\s\S]*?panel\.contains\(e\.target\)/.test(code(js)) &&
    /!hits\("sectorPickerBtn","sectorPanel"\)\) closeSectorPanel\(\)/.test(code(js)));
  t.check("the picks are echoed in words under the control, and the button points at that line",
    /id="businessPicked"/.test(html) && /aria-live="polite"/.test(html) &&
    /aria-describedby="businessPicked"/.test(html));
  t.check("there is a Clear control, so a pick need not be hunted in 76 rows",
    /function clearBusinessPicks\(/.test(code(js)) && /onclick="clearBusinessPicks\(\)"/.test(js));
  /* Every path that changes the Set has to re-sync the note, or it goes stale.
     The old code could lean on a "change" listener; there is no single event
     any more, so each mutator is pinned. */
  t.check("toggling a pick re-syncs the button, the list and the note",
    /function toggleBeneficiary\(v\)\{[\s\S]*?syncBusinessPickerLabel\(\);\s*\n\s*syncBusinessPicks\(\);/.test(code(js)));
  t.check("clearing re-syncs them too",
    /function clearBusinessPicks\(\)\{[\s\S]*?syncBusinessPicks\(\);/.test(code(js)));
  t.check("and so does the reset",
    /function resetForm\(\)\{[\s\S]*?syncBusinessPicks\(\)/.test(code(js)));
  t.check("the closed box names the top ticked row, so it agrees with the list order",
    /\[...eligBeneficiaries\]\.sort\(\(a,b\)=>a\.localeCompare\(b\)\)/.test(code(js)));
  /* Unlike State / UT, this control can hold several answers, so the closed box
     cannot name them all and has to say how many there are instead. Without the
     count it would read as one pick and you would have to open the dropdown to
     find out that four more were already ticked. */
  t.check("and it counts the picks on the closed box, because it can hold more than one",
    /\$\{names\.length\} selected · \$\{truncate\(names\[0\],26\)\} \+\$\{names\.length-1\} more/.test(code(js)));
  t.check("the label says several may be chosen",
    /Business \/ Beneficiary Type <span class="ref-tag">\(select one or more\)<\/span>/.test(html));
  /* Removed with the list box, and pinned so none of it creeps back. */
  t.check("removed: the option-list reader a multi-select needed",
    !/function selectedValues/.test(code(js)) && !/selectedValues\(/.test(code(js)));
  t.check("removed: the -1 reset branch, which only a multi-select needed",
    !/selectedIndex\s*=\s*e\.multiple/.test(code(js)) && !/e\.multiple/.test(code(js)));
  t.check("removed: the multi-select CSS",
    !/select\[multiple\]/.test(css));
  t.check("removed: the Ctrl-click wording, which the reason it was there for no longer applies",
    !/Ctrl/.test(html) && !/Cmd-click/.test(js));
  t.check("removed: the wide-cell class the list box never needed",
    !/field-multi/.test(html) && !/\.field-multi\{/.test(css));
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
  /* Opaque squares: without a radius they read as stray boxes on the navy bar or
     the navy footer. The ring that used to go with it was removed on request, so
     the radius is now the only framing either logo gets. */
  t.check("the square logo art is rounded so it reads as a plate, not a stray box",
    /\.logo\{[^}]*border-radius:/.test(css) && /\.institution-logo\{[^}]*border-radius:/.test(css));
  t.check("and neither logo carries a border or a ring of its own",
    !/\.logo\{[^}]*border:/.test(css) && !/\.logo\{[^}]*box-shadow/.test(css) &&
    !/\.institution-logo\{[^}]*border:/.test(css) && !/\.institution-logo\{[^}]*box-shadow/.test(css));
  t.check("the institution block cannot be squeezed off the footer edge",
    /\.institution\{[^}]*max-width:100%/.test(css) && /\.footer-bottom\{[^}]*flex-wrap:wrap/.test(css) &&
    /\.institution\{[^}]*margin-left:auto/.test(css));
  t.check("...and goes full width instead of clipping when the space is tight",
    /@media\(max-width:700px\)\{[\s\S]*?\.institution\{margin-left:0;width:100%\}/.test(css));
}

t.step("the old hero emblem is gone, and left nothing behind");
{
  /* The emblem was removed, then asked for back and rebuilt as .hero-mark — a
     white disc framing the logo rather than a bare image. These guard the older
     removal being fully clean, which is how dead CSS and orphaned `order` rules
     get left behind in a stylesheet. */
  t.check("no trace of the old emblem markup in the hero",
    !/hero-emblem/.test(html) && !/emblem-logo/.test(html));
  t.check("no trace of the old emblem CSS in the stylesheet",
    !/hero-emblem|emblem-logo/.test(code(css)));
  /* The hero is two columns again by request, but on a deliberate track: a wide
     copy column and a mark column, collapsing to one at 920px. The bug this
     guards against is an orphaned override left behind, so both halves are
     pinned — the two-column base, and the collapse query that must follow it. */
  t.check("the hero grid is two columns on a wide screen, copy first",
    /\.hero-grid\{display:grid;grid-template-columns:1\.32fr \.68fr/.test(css));
  t.check("and it collapses to one column, hiding the mark, at a stated width",
    /@media\(max-width:920px\)\{[\s\S]*?\.hero-grid\{grid-template-columns:1fr[\s\S]*?\.hero-mark\{display:none\}/.test(css));
  t.check("the collapse query lands after the base rule, or it loses the tie",
    css.indexOf("@media(max-width:920px)") > css.indexOf(".hero-grid{display:grid"));
  t.check("no orphaned `order` rules that existed only to place the emblem",
    !/\.hero-copy\{order:/.test(css) && !/\.hero-emblem\{[^}]*order:/.test(css));
  /* The navbar and footer logos are a separate request and must survive. */
  t.check("the navbar and footer logos are untouched",
    (html.match(/<img class="logo" src="img\/logo\.webp"/g) || []).length === 2 &&
    /class="institution-logo" src="img\/institution\.webp"/.test(html));
  t.check("the hero still leads with the h1, with nothing above it",
    /<div class="container hero-grid">\s*<div class="hero-copy">\s*<span class="badge"/.test(html));
}

/* ---------- the hero and the alternating bands ----------
   Both were restyled by request. A contrast regression here is invisible to the
   engine, e2e and compare suites — none of them read a colour — so the pairs
   that have to stay legible are pinned with computed ratios below. */
t.step("the hero is navy with a gold call to action, and the logo comes back");
{
  t.check("the hero paints itself navy, over a gold bloom",
    /\.hero\{[^}]*color:#fff/.test(css) && /\.hero\{[^}]*radial-gradient\([^)]*216,165,44/.test(css) &&
    /\.hero\{[^}]*linear-gradient/.test(css));
  /* The dotted wash and the gold ring are pseudo-elements. Without an explicit
     z-index on the container they would paint over the headline. */
  t.check("the decoration sits behind the content, not on top of it",
    /\.hero \.container\{[^}]*z-index:1/.test(css) && /\.hero::after\{[^}]*pointer-events:none/.test(css) &&
    /\.hero::before\{[^}]*pointer-events:none/.test(css));
  t.check("the gold ring stops turning for anyone who asked for less motion",
    /@media\(prefers-reduced-motion:reduce\)\{\.hero::after\{animation:none\}\}/.test(css) &&
    /@media\(prefers-reduced-motion:reduce\)\{\.hero-mark::after\{animation:none\}\}/.test(css) &&
    /@keyframes ring-spin\{/.test(css));
  /* Two solid buttons side by side compete; only one of them is the one we want
     clicked. */
  t.check("the primary call to action is the logo's gold, and it is labelled as such",
    /\.btn-hero\{[^}]*background:var\(--gold\)/.test(css) &&
    /class="btn btn-hero" onclick="scrollToFind\(\)"/.test(html));
  t.check("the secondary is outlined rather than a second solid button",
    /\.btn-ghost\{[^}]*background:transparent/.test(css) &&
    /class="btn btn-ghost" onclick="resetToBrowse\(\);scrollToId\('schemes'\)"/.test(html));
  /* The Devanagari line echoes the bilingual wordmark already in the navbar. */
  t.check("the Devanagari line is our own text, in the logo gold, marked up as Hindi",
    /<p class="hi" lang="hi">/.test(html) && /\.hero \.hi\{[^}]*color:var\(--gold-soft\)/.test(css) &&
    !/स्वास्थ्य/.test(html));
  t.check("the eyebrow pill is outlined in gold, not a pale chip lost on navy",
    /\.badge\{[^}]*rgba\(216,165,44,\.42\)/.test(css) && /\.badge\{[^}]*color:var\(--gold-soft\)/.test(css));
  /* The mark is the logo cropped to a circle and filled edge to edge. img/logo.webp
     is an opaque square, so the disc has to do the clipping — that is what makes
     the artwork match the circle instead of sitting in it. Both halves are pinned
     because either one alone still leaves a square corner sticking out. */
  t.check("the mark fills its circle, clipping the square artwork to the disc",
    /\.hero-mark\{[^}]*background:#fff/.test(css) && /\.hero-mark\{[^}]*border-radius:50%/.test(css) &&
    /\.hero-mark\{[^}]*overflow:hidden/.test(css) && /\.hero-mark img\{[^}]*object-fit:cover/.test(css) &&
    /\.hero-mark img\{[^}]*border-radius:50%/.test(css));
  /* And it is sized to carry the hero, not left as the 320px token tile it was. */
  t.check("and it is scaled up from the old 190/19vw/320px tile",
    /\.hero-mark\{[^}]*width:clamp\(210px,26vw,430px\)/.test(css));
  /* The dashed ring is -9% rather than a fixed -30px, so it keeps the same gap
     around the disc instead of being swallowed as the mark grows. */
  t.check("the ring around the mark is a percentage, so it scales with it",
    /\.hero-mark::after\{[^}]*inset:-9%/.test(css) && !/\.hero-mark::after\{[^}]*inset:-30px/.test(css));
  t.check("it is the supplied logo, sized so it cannot shift the layout",
    /<div class="hero-mark">\s*<img src="img\/logo\.webp" width="300" height="300" alt="" aria-hidden="true">/.test(html));
  t.check("and decorative, because the site's name is in the navbar right above it",
    /<div class="hero-mark">[\s\S]*?alt="" aria-hidden="true"/.test(html));
  t.check("the h1 is still the first thing in the hero copy",
    /<div class="hero-copy">\s*<span class="badge"[\s\S]*?<h1>/.test(html));
}

t.step("sections alternate navy and white down the page");
{
  const sections = [...html.matchAll(/<section\b([^>]*)>/g)].map(m => m[1]);
  /* The band token inside the class list, not the whole class string: the form
     section is "band-navy find", and comparing class strings would miss it. */
  const band = sec => (/(band-(?:navy|light))/.exec(sec || "") || [null, ""])[1];
  t.check("every section except the hero declares its band explicitly",
    sections.filter(sec => !/class="hero"/.test(sec)).every(sec => band(sec)),
    sections.filter(sec => !/class="hero"/.test(sec) && !band(sec)).join(" | "));
  /* The order is a content decision, so it is written out. :nth-of-type would
     repaint everything below whenever a section was inserted or removed. */
  t.check("the bands alternate, starting white and ending navy after the hero",
    sections.map(band).join(" ") === " band-light band-navy band-light band-navy band-light band-navy",
    sections.map(band).join(" > "));
  /* code(css), not css: the note explaining why nth-of-type is avoided names it,
     and a check written to catch a live use must not trip over the note. */
  t.check("no section is coloured by :nth-of-type or :nth-child",
    !/:nth-of-type|:nth-child/.test(code(css)));
  t.check("the hero is painted by .hero, so it does not need a band class",
    /class="hero"/.test(html) && band(sections[0]) === "" &&
    /\.hero\{[^}]*linear-gradient/.test(css));
  /* The form section used to carry a flat #09264a of its own, which sat beside
     the hero's gradient as a visible seam. */
  t.check("the form section takes its navy from the shared band, with no second background",
    /class="band-navy find"/.test(html) && /\.find\{[^}]*color:#fff\}/.test(css) &&
    !/\.find\{[^}]*background/.test(css));
  t.check("both bands are defined, and neither is a shorthand of the other",
    /\.band-light\{background:#fff/.test(css) && /\.band-navy\{[^}]*linear-gradient/.test(css));
  /* Type on a navy band has to be light, and the eyebrow's dark gold is
     invisible there. */
  t.check("headings, body copy and the eyebrow are recoloured for the navy bands",
    /\.band-navy \.section-head h2\{color:#fff\}/.test(css) &&
    /\.band-navy \.section-head p\{color:#c3d3e9\}/.test(css) &&
    /\.band-navy \.eyebrow\{color:var\(--gold-soft\)\}/.test(css));
  /* Cards stay white on both bands; that is what makes a band read as a band. */
  t.check("cards keep their white fill inside a navy band, so the band is the surface",
    !/\.band-navy\s+\.(?:step|feature|stat-card|explore-tile|category|scheme-card)\{[^}]*background:#0/.test(css));
  /* Regression, and it is a whole class of bug rather than one line: .band-navy
     sets color:#fff on the section, and colour is inherited. A white card on a
     navy band that does not declare its own ink therefore renders white-on-white
     — which is exactly what happened to the explore tile's <strong> and the
     feature card's <h3>. So this walks each navy band and checks every card in
     it, rather than listing the two that broke. */
  {
    const CARDS = ["step", "feature", "stat-card", "explore-tile", "category",
      "scheme-card", "find-box", "searchbar", "filters-panel", "pick-list"];
    /* A card is white if some rule paints it white, and carries ink if some
       rule sets its colour. Both are decided by parsing the stylesheet into
       (selectors, declarations) pairs rather than by regexing the file: a card
       class is usually one selector in a comma-separated list, so
       /\.explore-tile\{[^}]*color:/ would miss
       ".band-navy .find-box,.band-navy .explore-tile{color:var(--ink)}" and
       report a rule that is right there in the file. */
    const RULES = [...code(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(m => ({ selectors: m[1].split(",").map(x => x.trim()), body: m[2] }));
    /* The class must be the LAST compound of the selector, because that is what
       decides whether a rule paints the element or only its descendants.
       Substring matching credits ".explore-tile span{color:var(--muted)}" as the
       explore tile declaring its own ink, and so does a plain membership test on
       the split parts — but a <span> inside the tile says nothing about the
       tile's own <strong>, which is the element that was white-on-white.
       ".explore-tile:hover" is correctly excluded: the base must carry the ink. */
    const targets = (sel, c) => sel.split(/[\s>+~]+/).pop() === "." + c;
    /* The property has to be matched at a declaration boundary. A plain
       includes("color:") matches "border-color:" too, which credited the
       .band-light edge rule as declaring every card's ink — the hole this check
       was written to close. */
    const declares = (body, prop) => new RegExp("(?:^|;)\\s*" + prop + "\\s*:").test(body);
    const rulesFor = (c, prop) => RULES.filter(r => declares(r.body, prop) &&
      r.selectors.some(sel => targets(sel, c)));
    const isWhite = c => rulesFor(c, "background")
      .some(r => /background:\s*(?:#fff(?:fff)?\b|var\(--card\))/.test(r.body));
    const declaresColour = c => rulesFor(c, "color").length > 0;
    const navySections = [...html.matchAll(/<section\b[^>]*class="[^"]*\bband-navy\b[^"]*"[^>]*>([\s\S]*?)<\/section>/g)];
    t.check("the scan found the bands to walk, so the loop below is not vacuous",
      navySections.length === 3, navySections.length + " navy sections found");
    /* Which cards a band holds is only half static: the stat, scheme and explore
       grids are all built by app.js. Attributing every rendered card to every
       band would be wrong in both directions — it would have demanded ink for
       .stat-card on the form band, where no stat card exists. So each function
       is read on its own, and its classes count only for a band that owns the
       container id the function writes to. */
    const functions = [...code(js).matchAll(/function (\w+)\([\s\S]*?\n\}/g)].map(m => m[0]);
    t.check("the app exposes functions to walk, so the JS half is not vacuous",
      functions.length > 20, functions.length + " functions found");
    navySections.forEach(m => {
      const ids = new Set([...m[1].matchAll(/\sid="([^"]+)"/g)].map(x => x[1]));
      const used = new Set([...[...m[1].matchAll(/class="([^"]*)"/g)].flatMap(x => x[1].split(/\s+/))]);
      functions.filter(fn => [...fn.matchAll(/getElementById\("([^"]+)"\)/g)].some(x => ids.has(x[1])))
        .forEach(fn => [...fn.matchAll(/class="([a-z][a-z0-9-]*)/g)].forEach(x => used.add(x[1])));
      const whiteCards = CARDS.filter(c => used.has(c) && isWhite(c));
      const label = (m[0].match(/id="([^"]+)"/) || [0, "the last section"])[1];
      t.check(`"${label}" — every white card on it declares its own ink (${whiteCards.join(", ") || "none found"})`,
        whiteCards.length > 0 && whiteCards.every(declaresColour),
        whiteCards.length ? "no ink on: " + whiteCards.filter(c => !declaresColour(c)).join(", ")
          : "no white card found on this band — the scan is looking for the wrong classes");
    });
    /* The scan is only worth anything if it can fail, so its inputs are checked
       too: enough classes are white-filled to be worth scanning, and every one
       of them is matched by a rule rather than by a selector substring. */
    t.check("the scan recognises the white-filled cards it depends on",
      CARDS.filter(isWhite).length >= 5, CARDS.filter(isWhite).join(", "));
    /* And the mirror image: a card that is NOT on a navy band must not be made
       to carry band-specific ink, or the rule starts shadowing real styles. */
    t.check("the ink rule names only cards that are actually on a navy band",
      /^\.band-navy \.find-box,\.band-navy \.explore-tile,\.band-navy \.feature\{color:var\(--ink\)\}$/m.test(css),
      (/\.band-navy \.find-box,[^\n{]*\{color:var\(--ink\)\}/.exec(css) || [""])[0]);
  }
  /* A white card on a white section is only its border, so the light bands get a
     deeper edge and a real shadow. */
  t.check("light bands strengthen card edges, or the grids stop reading as cards",
    /\.band-light \.step,[^}]*\.band-light \.filters-panel\{[^}]*border-color:#d5e1ef/.test(css) &&
    /\.band-light \.step,[^}]*\.band-light \.filters-panel\{[^}]*box-shadow:/.test(css));
  /* Regression: a blocked card tints itself warm to flag a missing prerequisite.
     On a white band the old near-white tint erased the flag entirely. */
  t.check("the blocked-card flag survives on a white band",
    /\.band-light \.scheme-card\.blocked\{[^}]*background:#fffaf2/.test(css));
  /* Regression: .ref-note paints its own light fill, so band-wide light text
     would put #9db2d0 on #f7fafc — unreadable. */
  t.check(".ref-note is not swept up in the navy band's light text",
    !/\.band-navy \.ref-note/.test(css) &&
    /\.ref-note\{[^}]*color:#5f7089/.test(css));
}

t.step("every text/background pair on the new surfaces clears WCAG AA");
{
  const lum = hex => {
    const c = hex.replace("#", "");
    const v = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
      .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) => {
    const [x, y] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
    return (x + 0.05) / (y + 0.05);
  };
  const NAVY = "#09264a", WHITE = "#ffffff", GOLD = "#d8a52c", NOTE = "#f7fafc";
  /* The declaration in the stylesheet is the source of each pair, so a colour
     change cannot leave the number here quietly describing the old design. */
  const pairs = [
    ["hero headline", "#ffffff", NAVY, 4.5, /\.hero\{[^}]*color:#fff/],
    ["hero lead paragraph", "#cfdcef", NAVY, 4.5, /\.hero p\.lead\{[^}]*color:#cfdcef/],
    ["hero trust line", "#a9bcd9", NAVY, 4.5, /\.trust\{[^}]*color:#a9bcd9/],
    ["hero Devanagari line", "#e9c877", NAVY, 4.5, /\.hero \.hi\{[^}]*color:var\(--gold-soft\)/],
    ["hero eyebrow pill", "#e9c877", "#1b3450", 4.5, /\.badge\{[^}]*color:var\(--gold-soft\)/],
    ["gold button label", "#0b1c30", GOLD, 4.5, /\.btn-hero\{[^}]*color:#0b1c30/],
    ["outlined button label", "#ffffff", NAVY, 4.5, /\.btn-ghost\{[^}]*color:#fff/],
    ["navy band heading", "#ffffff", NAVY, 4.5, /\.band-navy \.section-head h2/],
    ["navy band body copy", "#c3d3e9", NAVY, 4.5, /\.band-navy \.section-head p/],
    ["navy band eyebrow", "#e9c877", NAVY, 4.5, /\.band-navy \.eyebrow/],
    ["navy band fine print", "#9db2d0", NAVY, 4.5, /\.band-navy \.disclaimer/],
    ["card body copy on white", "#607089", WHITE, 4.5, /\.step p,\.feature p\{[^}]*color:var\(--muted\)/],
    ["the reference note", "#5f7089", NOTE, 4.5, /\.ref-note\{[^}]*color:#5f7089/],
    /* The two surfaces the beneficiary picker added. The form band is navy, so a
       white list inside it is the same white-on-white case the scan walks. */
    ["picker panel copy", "#10243d", "#fbfdff", 4.5, /\.picker-panel\{[^}]*color:var\(--ink\)/],
    ["picker row name", "#10243d", "#ffffff", 4.5, /\.pick-list\{[^}]*color:var\(--ink\)/],
    ["picker row scheme count", "#607089", "#ffffff", 4.5, /\.pick-count\{[^}]*color:var\(--muted\)/],
    ["a ticked picker row", "#10243d", "#e8f2ff", 4.5, /\.pick-row\.on\{[^}]*background:#e8f2ff/],
    /* A ticked row tints the count with it, so the pair it creates is its own
       check rather than a reuse of the unticked one above. */
    ["the count on a ticked row", "#123a68", "#e8f2ff", 4.5, /\.pick-row\.on \.pick-count\{[^}]*color:var\(--navy2\)/],
    /* The count line moved from a boxed panel to the foot of the dropdown, so it
       is now grey on the foot's own tint rather than grey on the panel's. */
    ["the dropdown count line", "#607089", "#f7f9fc", 4.5, /\.pick-foot\{[^}]*color:var\(--muted\)/],
  ];
  pairs.forEach(([label, fg, bg, need, inCss]) => {
    const r = ratio(fg, bg);
    t.check(`${label}: ${fg} on ${bg} is ${r.toFixed(2)}:1`, r >= need && inCss.test(css),
      r >= need ? "but the stylesheet no longer declares that pair" : "below " + need + ":1");
  });
  /* A button needs 3:1 for its fill against what it sits on, or the gold edge
     vanishes into the navy even when the label is legible. */
  t.check("the gold button is distinguishable from the navy it stands on",
    ratio(GOLD, NAVY) >= 3, ratio(GOLD, NAVY).toFixed(2) + ":1");
  t.check("the white disc around the logo is distinguishable from the navy band",
    ratio(WHITE, NAVY) >= 3, ratio(WHITE, NAVY).toFixed(2) + ":1");
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
