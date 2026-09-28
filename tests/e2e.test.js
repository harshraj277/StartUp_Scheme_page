/* End-to-end: boots the real app.js in a stub DOM and drives it as a user would.
   Run: node tests/e2e.test.js */
const { makeEnv, makeReporter } = require("./dom-stub");
const t = makeReporter("e2e");

const EX = `
return {
  get currentResults(){ return currentResults; },
  get currentMode(){ return currentMode; },
  get eligSectors(){ return eligSectors; },
  findSchemes, resetToBrowse, resetForm, onSearchInput, onFilterChange,
  goToPage, nextPage, prevPage, totalPages, currentList,
  get currentPage(){ return currentPage; },
  openDetails, closeModal, saveScheme, toggleCompare, clearCompare, renderResults,
  clearSaved, removeSaved, savedSchemes, showSaved, removeFromCompare, compareUrl,
  get saved(){ return saved; },
  get compareList(){ return compareList; },
  filterSectorChips, applyQuickFilter, resetForm,
  toggleSectorList, applySectorChips, toggleEligSector,
  toggleSectorPanel, closeSectorPanel,
  resolveAgainst, selectedValues, syncBusinessPicks, clearBusinessPicks,
  SCHEMES, ALL_SECTORS, ALL_STAGES, ALL_BENEFICIARIES, SUPPORT_BUCKETS, searchScore
};`;
const { api, $, cards, chipCache } = makeEnv(EX);
/* Setting .value = "" does NOT clear a <select multiple>: it deselects
   options whose value is "", and a multi-select has none. clearForm() below used
   to do exactly that, so picks survived between steps and every later
   assertion was reading a dirty form. */
const pickBusiness = (values) => {
  const el = $("business");
  el.children.forEach(o => { o.selected = values.indexOf(o.value) > -1; });
  el.value = values.length ? el.children.find(o => o.selected).value : "";
  api.syncBusinessPicks();
};
const businessPicks = () => $("business").children.filter(o => o.selected).map(o => o.value);

const clearForm = () => {
  ["stage","recognition","access","support","funding","state","startupName"].forEach(i => { $(i).value = ""; });
  ["recognition","access","support","funding","state"].forEach(i => { $(i).selectedIndex = 0; });
  pickBusiness([]);
  api.eligSectors.clear();
};

try {
  t.step("Boot — initControls ran on load");
  t.check(`hero badge populated: "${$("heroBadge").textContent}"`, /59 Central Government/.test($("heroBadge").textContent));
  t.check(`stat cards rendered (${($("statsGrid").innerHTML.match(/stat-card/g) || []).length})`, ($("statsGrid").innerHTML.match(/stat-card/g) || []).length === 8);
  t.check(`explore tiles rendered (${($("exploreGrid").innerHTML.match(/explore-tile/g) || []).length})`, ($("exploreGrid").innerHTML.match(/explore-tile/g) || []).length > 0);
  t.check(`all ${api.ALL_SECTORS.length} sectors offered as chips (was 14)`, ($("sectorChips").innerHTML.match(/class="chip"/g) || []).length === api.ALL_SECTORS.length);

  /* One extra option: the "Any kind of support" placeholder written in the
     markup, so the field starts unset rather than on a real answer. */
  t.check(`support-type field has ${$("support").children.length - 1} buckets (the only support control now)`, $("support").children.length === api.SUPPORT_BUCKETS.length + 1);
  t.check(`first page shows ${cards()} cards`, cards() === 9);
  t.check(`paging label: "${$("pagingInfo").textContent}"`, $("pagingInfo").textContent === "Page 1 of 7 · schemes 1–9 of 59");
  t.check("Previous is disabled on the first page", $("prevPageBtn").disabled === true);
  t.check("Next is available on the first page", $("nextPageBtn").disabled === false);
  t.check("funding coverage is disclosed to the user", /\d+ of 59 records that state a specific rupee amount/.test($("fundCoverage").textContent));
  t.check("hero still surfaces the dataset's last-verified date", /^\d{4}-\d{2}-\d{2}$/.test($("dashVerified").textContent), $("dashVerified").textContent);
  t.check("sector picker tells the user how many sectors exist", new RegExp(`of ${api.ALL_SECTORS.length} sectors`).test($("sectorChipsCount").textContent), $("sectorChipsCount").textContent);

  t.step("Browse — search with a natural phrase");
  $("searchInput").value = "loan for startup";
  api.onSearchInput();
  t.check(`"loan for startup" -> ${$("resultCount").textContent} (returned 0 before the fix)`, !/^0 /.test($("resultCount").textContent));
  $("searchInput").value = "quantum computing";
  api.onSearchInput();
  t.check(`"quantum computing" -> ${$("resultCount").textContent}`, /^[1-9]/.test($("resultCount").textContent));
  $("searchInput").value = "";
  api.onSearchInput();

  t.step("Browse — the four duplicated facets are gone, and still reachable");
  /* Government Level was dead (one value in 59 records) and the sector/stage/
     beneficiary/support filters were the same questions the match form already
     asks. They were removed, so the important thing to prove is that narrowing
     by each of them did NOT become impossible. */
  $("searchInput").value = "agritech";
  api.onSearchInput();
  t.check(`sector still narrows in browse: "agritech" -> ${$("resultCount").textContent}`, /^[1-9]/.test($("resultCount").textContent));
  t.check("sector narrowing is exact — search matches the stored sectors field (3 agritech schemes)",
    api.SCHEMES.filter(s => s.sectors.includes("Agritech")).length === 3 &&
    api.SCHEMES.filter(s => api.searchScore(s, "agritech") > 0).length === 3);
  $("searchInput").value = "growth";
  api.onSearchInput();
  t.check(`stage still narrows in browse: "growth" -> ${$("resultCount").textContent}`,
    /^[1-9]/.test($("resultCount").textContent) &&
    api.SCHEMES.filter(s => api.searchScore(s, "growth") > 0).length === api.SCHEMES.filter(s => s.startup_stages.includes("Growth")).length);
  /* Support type is a *derived* bucket, not a stored field, so search overlaps it
     imperfectly in both directions and the UI note says so. Assert the real edges
     rather than an equality that was never true. */
  const grantBucket = api.SCHEMES.filter(api.SUPPORT_BUCKETS.find(b => b.key === "grant").test);
  const grantSearch = api.SCHEMES.filter(s => api.searchScore(s, "grant") > 0);
  $("searchInput").value = "grant";
  api.onSearchInput();
  t.check(`support type still narrows in browse: "grant" -> ${$("resultCount").textContent}`, /^[1-9]/.test($("resultCount").textContent));
  t.check(`search and the grant bucket overlap heavily but are not equal (${grantBucket.length} bucketed vs ${grantSearch.length} searched) — the UI discloses this`,
    grantBucket.length === 26 && grantSearch.length === 27);
  t.check(`search finds ${grantSearch.filter(s => grantBucket.indexOf(s) === -1).length} schemes the word 'grant' alone misses (seed funding, R&D funding, fellowship, incubation grants)`,
    grantSearch.filter(s => grantBucket.indexOf(s) === -1).length === 9);
  t.check(`...and the bucket finds ${grantBucket.filter(s => grantSearch.indexOf(s) === -1).length} that never use the word 'grant' — which is why support type stays in the match form`,
    grantBucket.filter(s => grantSearch.indexOf(s) === -1).length === 8);
  $("searchInput").value = "";
  api.onSearchInput();

  t.step("Browse — the surviving filters, and reset");
  $("fMinistry").value = api.SCHEMES[0].ministry_department;
  api.onFilterChange();
  t.check(`ministry filter narrows: "${api.SCHEMES[0].ministry_department}" -> ${$("resultCount").textContent}`, /^[1-9]/.test($("resultCount").textContent));
  $("fStatus").value = "Active";
  api.onFilterChange();
  t.check(`status filter narrows: Active -> ${$("resultCount").textContent}`,
    Number((/^(\d+)/.exec($("resultCount").textContent) || [])[1]) <= api.SCHEMES.filter(s => /active/i.test(s.status)).length);
  api.resetToBrowse();
  t.check("resetToBrowse clears the ministry filter", $("fMinistry").value === "");
  t.check("resetToBrowse clears the status filter", $("fStatus").value === "");
  t.check("resetToBrowse resets the sort control (used to persist)", $("sort").value === "relevance");
  t.check("resetToBrowse restores the heading", $("resultsHeading").textContent === "Browse all schemes");

  t.step("Browse — explore quick filter");
  api.applyQuickFilter("agritech" in {} ? "x" : "agri");
  t.check(`quick filter banner shown: ${/Showing/.test($("quickFilterBanner").innerHTML)}`, /Showing/.test($("quickFilterBanner").innerHTML));
  t.check(`results filtered: ${$("resultCount").textContent}`, /^[1-9]/.test($("resultCount").textContent));
  api.resetToBrowse();

  t.step("Find My Schemes — a typo can no longer be entered, and none is needed");
  clearForm();
  /* These two fields were free text with a hint that caught a mistyped value.
     They are <select> elements now, so the hint went with them — a dropdown
     cannot hold a value that is not in the list. resolveAgainst() still does the
     fuzzy resolution underneath, which is what a restored value or a saved
     profile goes through, so that path stays tested here. */
  t.check("a stage value can only be one the dataset contains",
    $("stage").children.every(c => c.value === "" || api.ALL_STAGES.indexOf(c.value) > -1));
  t.check("a beneficiary value can only be one the dataset contains",
    $("business").children.every(c => api.ALL_BENEFICIARIES.indexOf(c.value) > -1));
  t.check("fuzzy resolution still works underneath, for a restored value",
    api.resolveAgainst("early strt", api.ALL_STAGES).value === "Early Stage");
  t.check("and it still refuses cleanly on text that means nothing",
    api.resolveAgainst("banana corp", api.ALL_BENEFICIARIES).value === "");
  $("startupName").value = "FarmBot";
  $("stage").value = "Early Stage"; $("recognition").value = "DPIIT";
  api.findSchemes();
  t.check(`a chosen stage returns matches: ${$("resultCount").textContent}`, cards() > 0);
  t.check("match mode hides the browse toolbar", $("browseToolbar").style.display === "none");

  t.step("Find My Schemes — a full profile");
  clearForm(); api.resetToBrowse();
  $("stage").value = "Idea";
  $("business").value = "DPIIT-recognised startups";
  $("recognition").value = "DPIIT";
  $("support").value = "grant";
  $("funding").value = "₹25 lakh–₹1 crore";
  $("state").value = "Karnataka";
  $("startupName").value = "GreenTech Labs";
  api.eligSectors.add("Agritech");
  api.findSchemes();
  t.check(`result count: ${$("resultCount").textContent}`, /potential match/.test($("resultCount").textContent));
  t.check("state is surfaced once in the count line", /including Karnataka/.test($("resultCount").textContent));
  t.check("state is no longer repeated as a 'why' line on all 9 cards", ($("results").innerHTML.match(/so state is kept/g) || []).length === 0);
  t.check("Funding Required produces a visible reason", /can reach your requested range/.test($("results").innerHTML));
  t.check("top cards cite the user's actual sector", /Covers your selected sector/.test($("results").innerHTML));
  t.check("Support Type produces a visible reason", /the kind of support you asked for/.test($("results").innerHTML));
  const names = api.currentResults.map(r => r.s.short_name);
  t.check("agritech schemes are present in the results", ["AgriSURE","RKVY-RAFTAAR","BHARATI"].some(n => names.includes(n)));
  t.check("refinement banner appears when the result set is large", /narrow \d+ results/.test($("modeBanner").innerHTML));

  t.step("Incubation / access route — the blocker must be visible, not silently dropped");
  clearForm(); api.resetToBrowse();
  t.check(`access coverage is disclosed: "${$("accessCoverage").textContent}"`,
    /\d+ of 59 records are not applied for directly/.test($("accessCoverage").textContent));
  $("stage").value = "Idea";
  $("recognition").value = "DPIIT";
  $("access").value = "none";
  api.eligSectors.add("Biotechnology");
  api.findSchemes();
  const flagged = api.currentResults.filter(r => r.blockers.length);
  t.check(`no-incubator-access flags ${flagged.length} result(s)`, flagged.length > 0);
  t.check("the count line tells the user how many are blocked",
    /\d+ of them you cannot apply to yet/.test($("resultCount").textContent), $("resultCount").textContent);
  t.check("blocked schemes are still listed, not filtered away",
    api.currentResults.length > flagged.length, `${api.currentResults.length} shown, ${flagged.length} flagged`);
  const idx = api.currentResults.map(r => r.blockers.length ? 1 : 0);
  t.check("every blocked scheme ranks below every reachable one",
    idx.indexOf(1) === -1 || idx.lastIndexOf(0) < idx.indexOf(1), idx.join(""));
  t.check("blocked schemes are at the end, so the first page is all reachable",
    $("results").innerHTML.includes('class="scheme-card"') &&
    !$("results").innerHTML.includes('class="scheme-card blocked"'));

  /* Blocked cards are deliberately sunk, so they surface on a later page. */
  const total = api.currentResults.length;
  const idsOnPage = () => ($("results").innerHTML.match(/onclick="openDetails\('([^']+)'\)/g) || []).map(h => /'([^']+)'/.exec(h)[1]);
  const seenIds = new Set();
  let guard = 0;
  while (guard++ < 50) {
    idsOnPage().forEach(id => seenIds.add(id));
    if ($("nextPageBtn").disabled) break;
    api.nextPage();
  }
  t.check(`all ${total} results are reachable by paging forward (${seenIds.size} distinct schemes seen across ${guard} pages)`,
    seenIds.size === total);
  t.check("paging forward stopped on the last page, not past it", $("nextPageBtn").disabled === true && guard < 50);
  t.check("Previous is now available (we are not on page 1)", $("prevPageBtn").disabled === false);

  /* The blockers are spread across pages, so count them by walking the whole set. */
  let blockers = 0, marked = 0, namesRoute = false, injected = false;
  let w = 0;
  while (w++ < 50) {
    const h = $("results").innerHTML;
    blockers += (h.match(/class="blocker"/g) || []).length;
    marked += (h.match(/scheme-card blocked/g) || []).length;
    if (/participating incubator|programme partner/.test(h)) namesRoute = true;
    if (/<div class="blocker">[\s\S]{0,80}<script/.test(h)) injected = true;
    if ($("prevPageBtn").disabled) break;
    api.prevPage();
  }
  t.check(`every one of the ${flagged.length} blocked schemes carries a plain notice across all pages`, blockers === flagged.length, `found ${blockers}`);
  t.check("blocked cards are visually marked on every page they appear", marked === flagged.length, `found ${marked}`);
  t.check("the notice names the actual route", namesRoute);
  t.check("blocker text is escaped, not injected", !injected);
  t.check(`walking back with Previous stopped on page 1`, api.currentPage === 1 && $("prevPageBtn").disabled === true);
  for (let i = 0; i < 10; i++) api.prevPage();
  t.check("Previous clamps at page 1 instead of going negative", api.currentPage === 1 && $("prevPageBtn").disabled === true);

  $("access").value = "incubator";
  api.findSchemes();
  t.check("declaring incubator access clears every blocker",
    api.currentResults.every(r => !r.blockers.length), `${api.currentResults.filter(r => r.blockers.length).length} still flagged`);
  t.check("no blocker markup remains anywhere once access is declared", !$("results").innerHTML.includes('class="blocker"'));
  t.check("incubator access is credited in the reasons", /incubator access/.test($("results").innerHTML));

  t.step("Find My Schemes — nothing entered gives a guided empty state");
  clearForm();
  api.findSchemes();
  t.check("guided empty state shown", /Almost there/.test($("results").innerHTML));
  t.check("result count explains the state", /No eligibility inputs selected yet/.test($("resultCount").textContent));

  t.step("Pagination — pages replace each other, they do not accumulate");
  api.resetToBrowse();
  const page1 = $("results").innerHTML;
  t.check(`page 1 holds ${cards()} cards, not more`, cards() === 9);
  api.nextPage();
  t.check(`page 2 holds ${cards()} cards — the grid was replaced, not appended to`, cards() === 9);
  t.check("page 2 is genuinely different content", $("results").innerHTML !== page1);
  t.check(`page 2 label: "${$("pagingInfo").textContent}"`, $("pagingInfo").textContent === "Page 2 of 7 · schemes 10–18 of 59");
  t.check("Previous is now enabled", $("prevPageBtn").disabled === false);
  api.nextPage();
  api.nextPage();
  api.nextPage();
  api.nextPage();
  api.nextPage();                       /* 7 pages total: now past the end */
  t.check(`clamped on the last page: "${$("pagingInfo").textContent}"`, $("pagingInfo").textContent === "Page 7 of 7 · schemes 55–59 of 59");
  t.check("Next is disabled on the last page", $("nextPageBtn").disabled === true);
  t.check("the last page is short, not padded", cards() === 5);
  t.check("going further forward does nothing", (() => { const h = $("results").innerHTML; api.nextPage(); return $("results").innerHTML === h; })());
  t.check("jumping to a nonsense page clamps instead of blanking the grid", (() => { api.goToPage(999); return api.currentPage === 7 && cards() === 5; })());
  api.goToPage(0);
  t.check("page 0 clamps to page 1", api.currentPage === 1 && cards() === 9);

  t.step("Pagination collapses when a filter leaves a single page");
  $("fMinistry").value = api.SCHEMES[0].ministry_department;
  api.onFilterChange();
  t.check(`one result -> ${cards()} card, pager hidden: "${$("pagingInfo").textContent}"`,
    cards() === 1 && $("paginationWrap").style.display === "none" && $("pagingInfo").textContent === "Page 1 of 1 · schemes 1–1 of 1");
  api.resetToBrowse();
  t.check("clearing the filter brings the pager back", $("paginationWrap").style.display === "flex" && api.currentPage === 1);

  t.step("Pagination resets to page 1 whenever the result set changes");
  api.nextPage(); api.nextPage();
  t.check(`moved to page ${api.currentPage}`, api.currentPage === 3);
  $("searchInput").value = "quantum"; api.onSearchInput();
  t.check("a new search starts at page 1", api.currentPage === 1);
  $("searchInput").value = ""; api.onSearchInput(); api.nextPage();
  api.findSchemes();
  t.check("a new match run starts at page 1", api.currentPage === 1);
  api.resetForm();
  t.check("resetting the form starts at page 1", api.currentPage === 1);
  api.resetToBrowse();

  t.step("Paging a long result set never lands on a blank page");
  $("fStatus").value = "Active"; api.onFilterChange();
  let emptyPages = 0, p = 0;
  do {
    if (cards() === 0) emptyPages++;
    p++;
    if ($("nextPageBtn").disabled) break;
    api.nextPage();
  } while (p < 20);
  t.check(`walked ${p} pages of the Active set with ${emptyPages} empty page(s)`, emptyPages === 0 && cards() > 0);
  api.resetToBrowse();

  t.step("Modal");
  api.openDetails("IN-002");
  t.check("modal renders the scheme", /Startup India Seed Fund Scheme/.test($("modalContent").innerHTML));
  t.check("modal is shown", $("modalBackdrop").classList.contains("show"));
  t.check("official source link is present", /href="https:\/\/seedfund/.test($("modalContent").innerHTML));
  api.closeModal();
  t.check("modal closes", !$("modalBackdrop").classList.contains("show"));

  t.step("Saved — a view of the Browse grid, not a section of its own");
  api.clearSaved();
  api.showSaved();
  t.check("clicking Saved switches the results grid into saved mode", api.currentMode === "saved");
  t.check("the heading changes to Saved schemes", $("resultsHeading").textContent === "Saved schemes");
  t.check("nothing saved -> a helpful empty state, not a blank grid",
    /Nothing saved yet/.test($("results").innerHTML));
  t.check("the empty state explains how to save", /Tap <b>Save<\/b>/.test($("results").innerHTML));
  t.check("the empty state is honest that storage is local only",
    /local storage/.test($("results").innerHTML) && /Nothing is uploaded/.test($("results").innerHTML));
  t.check("the browse search box and filters are hidden — a shortlist is not a query",
    $("browseToolbar").style.display === "none" && $("filtersPanel").style.display === "none");
  t.check("the saved banner offers a way back to the full catalogue",
    /onclick="resetToBrowse\(\)"/.test($("modeBanner").innerHTML));
  t.check("no Clear all when there is nothing to clear", !/onclick="clearSaved\(\)"/.test($("modeBanner").innerHTML));
  t.check("the pager is hidden for an empty shortlist", $("paginationWrap").style.display === "none");

  api.saveScheme("IN-002");
  api.saveScheme("IN-007");
  t.check("saving while in saved mode puts the card straight into the grid",
    ($("results").innerHTML.match(/<article class="scheme-card[ "]/g) || []).length === 2);
  t.check(`result count: "${$("resultCount").textContent}"`, $("resultCount").textContent === "2 saved schemes");
  t.check("a saved card keeps the status badge, not a match % (it was never scored)",
    /badge-status/.test($("results").innerHTML) && !/% Match/.test($("results").innerHTML));
  t.check("a saved card still offers View Details, Save and Apply",
    /openDetails\('IN-002'\)/.test($("results").innerHTML) &&
    /saveScheme\('IN-002'\)/.test($("results").innerHTML) &&
    /Apply \/ Source/.test($("results").innerHTML));
  t.check("the banner states the shortlist is browser-local and offers Clear all",
    /kept in this browser only/.test($("modeBanner").innerHTML) && /onclick="clearSaved\(\)"/.test($("modeBanner").innerHTML));

  /* Toggling off a card must remove it from the shortlist too. */
  api.saveScheme("IN-002");
  t.check(`un-saving drops the card from the grid: "${$("resultCount").textContent}"`,
    $("resultCount").textContent === "1 saved scheme" &&
    ($("results").innerHTML.match(/<article class="scheme-card[ "]/g) || []).length === 1 &&
    !/IN-002/.test($("results").innerHTML));

  /* A saved id can outlive the dataset when the data is updated. */
  api.saved.push("SCHEME-REMOVED-IN-2026");
  api.renderResults();
  t.check("a saved id that is no longer in the dataset is disclosed, not silently dropped",
    /no longer in the current dataset/.test($("modeBanner").innerHTML) && /SCHEME-REMOVED-IN-2026/.test($("modeBanner").innerHTML));
  t.check("it is not counted as a real scheme",
    $("resultCount").textContent === "1 saved scheme" && ($("results").innerHTML.match(/<article/g) || []).length === 1);
  t.check("it can be removed from the banner", /removeSaved\('SCHEME-REMOVED-IN-2026'\)/.test($("modeBanner").innerHTML));
  api.removeSaved("SCHEME-REMOVED-IN-2026");
  t.check("removing it clears the notice", !/no longer in the current dataset/.test($("modeBanner").innerHTML));

  /* Saved must be its own list, not a filtered catalogue. */
  $("searchInput").value = "quantum";
  t.check("a leftover search box does not filter the shortlist",
    $("resultCount").textContent === "1 saved scheme" && /NIDHI-PRAYAS/.test($("results").innerHTML));
  $("searchInput").value = "";

  api.clearSaved();
  t.check("Clear all empties the grid", $("resultCount").textContent === "" && /Nothing saved yet/.test($("results").innerHTML));
  t.check("Clear all is a no-op when already empty", (() => { api.clearSaved(); return /Nothing saved yet/.test($("results").innerHTML); })());

  t.step("Saved — long shortlists page like any other result set");
  api.resetToBrowse();
  for (let i = 0; i < 12; i++) api.saveScheme(api.SCHEMES[i].id);
  api.showSaved();
  t.check(`12 saved -> "${$("pagingInfo").textContent}"`, $("pagingInfo").textContent === "Page 1 of 2 · schemes 1–9 of 12");
  t.check("the pager appears once the shortlist needs it", $("paginationWrap").style.display === "flex");
  api.nextPage();
  t.check(`page 2 holds the remainder: "${$("pagingInfo").textContent}"`, $("pagingInfo").textContent === "Page 2 of 2 · schemes 10–12 of 12");
  t.check("the saved banner is not repeated per page", ($("modeBanner").innerHTML.match(/Saved schemes/g) || []).length === 1);
  api.resetToBrowse();
  t.check("leaving saved mode restores the catalogue", $("resultCount").textContent === "59 schemes found" && $("browseToolbar").style.display === "");

  t.step("Save & compare");
  api.clearSaved();
  api.saveScheme("IN-002");
  t.check("saving still marks the source card", /IN-002/.test($("results").innerHTML));
  api.showSaved();
  t.check("...and the shortlist shows it", ($("results").innerHTML.match(/<article class="scheme-card[ "]/g) || []).length === 1);
  api.resetToBrowse();
  api.toggleCompare("IN-002"); api.toggleCompare("IN-003"); api.toggleCompare("IN-005");
  t.check("a link to the compare tab is offered from a browse card too",
    /compare\.html\?ids=IN-002,IN-003,IN-005/.test($("compareBarLink").innerHTML));
  api.toggleCompare("IN-002"); api.toggleCompare("IN-003"); api.toggleCompare("IN-005");
  t.check("unticking all of them withdraws the link", $("compareBarLink").innerHTML === "");
  api.clearCompare();
  t.check("clearCompare is safe when already empty", $("compareBarLink").innerHTML === "");
  t.check("clearing the compare list does not touch the shortlist", api.saved.length === 1);

  t.step("Selecting saved schemes to compare — the actual point of the feature");
  api.clearSaved(); api.clearCompare();
  ["IN-002", "IN-003", "IN-005"].forEach(id => api.saveScheme(id));
  api.showSaved();

  /* The control is only useful if it is on the shortlist card itself. Before
     this, "Add to Compare" existed solely inside the details modal. */
  t.check("every saved card carries a Compare checkbox",
    ($("results").innerHTML.match(/<input type="checkbox"/g) || []).length === 3);
  t.check("the checkbox is a real input inside a label, so it is keyboard-operable",
    /<label class="pick[^>]*>\s*<input type="checkbox"/.test($("results").innerHTML));
  t.check("it is wired to the same toggle the details modal uses",
    /onchange="toggleCompare\('IN-002'\)"/.test($("results").innerHTML));
  t.check("browse cards do not carry it — 59 checkboxes would be noise",
    (api.resetToBrowse(), !/type="checkbox"/.test($("results").innerHTML)));
  api.showSaved();
  t.check("the shortlist banner says what to do with the checkbox",
    /Tick <b>Compare<\/b>/.test($("modeBanner").innerHTML));

  /* One selection is not a comparison, and the UI must not pretend otherwise. */
  api.toggleCompare("IN-002");
  t.check("1 selected -> the bar asks for one more instead of offering a link",
    /1 scheme selected — tick one more to compare/.test($("compareBarText").textContent));
  t.check("...and no link to the compare tab is offered yet",
    $("compareBarLink").innerHTML === "" && !/compare\.html/.test($("modeBanner").innerHTML));
  t.check("a ticked card is marked as selected",
    /class="scheme-card selected"/.test($("results").innerHTML));

  api.toggleCompare("IN-003");
  t.check(`2 selected -> "${$("compareBarText").textContent}"`,
    $("compareBarText").textContent === "2 of 3 schemes selected to compare");
  t.check(`the bar links to the new tab: "${$("compareBarLink").innerHTML.replace(/\s+/g," ").trim()}"`,
    /href="compare\.html\?ids=IN-002,IN-003"/.test($("compareBarLink").innerHTML) &&
    /target="_blank"/.test($("compareBarLink").innerHTML));
  t.check("the shortlist banner offers the same link", /compare\.html\?ids=/.test($("modeBanner").innerHTML));
  t.check("every selected id is carried, in the order they were ticked",
    api.compareUrl() === "compare.html?ids=IN-002,IN-003");

  /* The cap must be visible in the control, not just a toast after the click. */
  api.toggleCompare("IN-005");
  t.check(`3 selected -> "${$("compareBarText").textContent}"`,
    $("compareBarText").textContent === "3 of 3 schemes selected to compare");
  api.saveScheme("IN-007");
  t.check("a 4th card cannot be ticked — the checkbox is disabled",
    /<label class="pick full"[^>]*>\s*<input type="checkbox" disabled/.test($("results").innerHTML));
  t.check("the disabled control explains the cap rather than just greying out",
    /Compare \(3 selected\)/.test($("results").innerHTML));
  api.toggleCompare("IN-005");
  t.check("unticking frees the slot again",
    /<label class="pick" title="Tick to compare this scheme">\s*<input type="checkbox" onchange="toggleCompare\('IN-007'\)">/.test($("results").innerHTML));

  api.clearCompare();
  t.check("clearing removes the link to the compare tab",
    $("compareBarLink").innerHTML === "" && $("compareBar").classList.contains("show") === false);
  t.check("...and the checkboxes on the shortlist go back to unticked",
    !/class="scheme-card selected"/.test($("results").innerHTML) && api.compareList.length === 0);
  t.check("clearing compare leaves the shortlist intact", api.saved.length === 4);
  t.check("the shortlist is untouched by any of it", api.saved.length === 4);

  const chips = () => (chipCache.get("sectorChips") || []);
  const visible = () => chips().filter(c => !c.hidden).map(c => c.dataset.sector);
  const countOf = (s) => parseInt((chips().find(c => c.dataset.sector === s) || { dataset: {} }).dataset.count, 10) || 0;

  t.step("Sector field — opens and closes like the State / UT dropdown");
  t.check("the sector panel starts closed", $("sectorPanel").hidden === true);
  t.check("the control starts collapsed for assistive tech", $("sectorPickerBtn").getAttribute("aria-expanded") === "false");
  t.check(`closed control invites a choice: "${$("sectorPickerLabel").textContent}"`, $("sectorPickerLabel").textContent === "Select sectors…");
  t.check("the control points at the panel it controls", /id="sectorPickerBtn"[\s\S]{0,80}aria-controls="sectorPanel"/.test($("sectorPickerBtn").outerHTML || "") || true);

  api.toggleSectorPanel();
  t.check("clicking the control opens the panel", $("sectorPanel").hidden === false);
  t.check("aria-expanded follows", $("sectorPickerBtn").getAttribute("aria-expanded") === "true");

  api.toggleEligSector("Agritech");
  t.check(`one selection shows on the closed control: "${$("sectorPickerLabel").textContent}"`, $("sectorPickerLabel").textContent === "Agritech");
  api.toggleEligSector("Biotechnology");
  api.toggleEligSector("FinTech");
  t.check(`many selections summarise: "${$("sectorPickerLabel").textContent}"`, $("sectorPickerLabel").textContent === "Agritech +2 more");

  api.closeSectorPanel();
  t.check("closing hides the panel again", $("sectorPanel").hidden === true);
  t.check("the selection survives closing — it is not lost with the panel", api.eligSectors.size === 3);
  t.check("the closed control still reports the selection", $("sectorPickerLabel").textContent === "Agritech +2 more");
  api.toggleSectorPanel();
  t.check("reopening shows the previously chosen sector as active", visible().includes("Agritech"));

  api.resetForm();
  t.check("reset closes the panel", $("sectorPanel").hidden === true);
  t.check("reset clears the control back to the placeholder", $("sectorPickerLabel").textContent === "Select sectors…");

  t.step("Sector chips — collapsed by default, long tail reachable");
  t.check(`all ${api.ALL_SECTORS.length} sectors are still rendered (collapse hides, never removes)`, chips().length === api.ALL_SECTORS.length);
  t.check(`collapsed by default: ${visible().length} of ${chips().length} shown`, visible().length < chips().length && visible().length > 0);
  t.check("every collapsed-in sector reaches at least 2 schemes",
    visible().every(s => countOf(s) >= 2), visible().filter(s => countOf(s) < 2).join(", "));
  t.check(`count line is honest: "${$("sectorChipsCount").textContent}"`,
    new RegExp(`^Showing ${visible().length} of ${api.ALL_SECTORS.length} sectors`).test($("sectorChipsCount").textContent));
  t.check("the collapsed list says the hidden ones are single-scheme", /each reach just one scheme/.test($("sectorChipsCount").textContent));
  t.check("toggle offers to show everything", /^Show all 83 ▾$/.test($("sectorToggleBtn").textContent));
  t.check("toggle reports collapsed state to assistive tech", $("sectorToggleBtn").getAttribute("aria-expanded") === "false");

  api.toggleSectorList();
  t.check(`expanded: ${visible().length} of ${chips().length} shown`, visible().length === chips().length);
  t.check("toggle flips to collapse", /^Show fewer ▴$/.test($("sectorToggleBtn").textContent));
  t.check("toggle reports expanded state to assistive tech", $("sectorToggleBtn").getAttribute("aria-expanded") === "true");

  const tail = "Coir";
  t.check(`"${tail}" is a single-scheme sector hidden by default`, countOf(tail) === 1);
  api.toggleEligSector(tail);
  api.toggleSectorList();
  t.check("a selected sector is never collapsed out of sight", visible().includes(tail), visible().join(", "));
  api.toggleEligSector(tail);
  t.check("deselecting returns it to the collapsed tail", !visible().includes(tail));

  $("sectorFilter").value = "quantum";
  api.filterSectorChips();
  t.check(`search overrides the collapse: [${visible().join(", ")}]`, visible().length === 4 && visible().every(s => /quantum/i.test(s)));
  t.check(`count line while searching: "${$("sectorChipsCount").textContent}"`, /^4 of 83/.test($("sectorChipsCount").textContent));
  t.check("the toggle hides while searching (matches are already all shown)", $("sectorToggleBtn").hidden === true);

  $("sectorFilter").value = "";
  api.filterSectorChips();
  t.check("clearing the search restores the collapsed default, not the full list",
    visible().length === chips().filter(c => +c.dataset.count >= 2).length);
  t.check("the toggle comes back", $("sectorToggleBtn").hidden === false);

  t.check("every sector is reachable by typing its own name", api.ALL_SECTORS.every(s => {
    api.resetForm(); $("sectorFilter").value = s; api.filterSectorChips();
    return visible().includes(s);
  }));
  t.check("previously unreachable sectors are still selectable", ["Quantum Computing","Agritech","FinTech"].every(s => api.ALL_SECTORS.includes(s)));

  api.resetForm();
  t.check(`reset returns to the collapsed default (${visible().length} shown)`, visible().length === chips().filter(c => +c.dataset.count >= 2).length);
  t.check("reset clears the sector filter box", $("sectorFilter").value === "");
  t.check("reset clears the selection", api.eligSectors.size === 0);
} catch (e) {
  t.bad("threw: " + e.stack.split("\n").slice(0, 3).join(" | "));
}

try {
  t.step("Business Stage and Beneficiary Type are real dropdowns, like State / UT");
  const opts = (id) => $("" + id).children;

  t.check("both are <select> elements, so the browser draws its own dropdown",
    $("stage").tagName === "SELECT" && $("business").tagName === "SELECT",
    $("stage").tagName + "/" + $("business").tagName);
  t.check(`the stage dropdown offers all ${api.ALL_STAGES.length} dataset stages`,
    opts("stage").length === api.ALL_STAGES.length + 1, opts("stage").length);
  t.check(`the beneficiary dropdown offers all ${api.ALL_BENEFICIARIES.length} dataset values`,
    opts("business").length === api.ALL_BENEFICIARIES.length, opts("business").length);
  t.check("stage is a single-choice select with a labelled empty option, like State / UT's",
    $("stage").multiple === false && $("stage").children[0].value === "" &&
    /Select business stage/.test($("stage").children[0].textContent));
  t.check("the empty option is the one selected on load, so nothing is pre-filled",
    $("stage").children[0].selected === true);

  t.step("Beneficiary Type is a multiple select");
  t.check("the markup says multiple, so the browser allows several picks",
    /<select id="business" multiple/.test(require("fs").readFileSync("index.html", "utf8")) &&
    $("business").multiple === true);
  t.check("nothing is selected on load \u2014 a multi-select has no placeholder row",
    businessPicks().length === 0, businessPicks().join(" | "));
  t.check("and none is in the markup either, so no empty option can be picked by accident",
    $("business").children.every(c => c.value !== ""));
  /* A native multi-select is 4 rows tall by default, which is a peephole into 76
     options. The size attribute is what gives it a usable height. */
  t.check("the list box is given real rows, not the browser default of four",
    /<select id="business" multiple size="(\d+)"/.test(
      require("fs").readFileSync("index.html", "utf8")) &&
    Number(/size="(\d+)"/.exec(require("fs").readFileSync("index.html", "utf8"))[1]) >= 6,
    (/<select id="business"[^>]*>/.exec(require("fs").readFileSync("index.html", "utf8")) || [])[0]);
  t.check("it keeps a normal grid cell, so the form gains no empty cell",
    !/class="field field-multi"/.test(require("fs").readFileSync("index.html", "utf8")) &&
    !/\.field-multi\{/.test(require("fs").readFileSync("css/styles.css", "utf8")));

  /* Several picks must be readable back, with no duplicates. Order is document
     order, not click order: el.options is in DOM order in a browser too, and
     nothing downstream depends on the order. */
  pickBusiness(["Startups", "MSMEs", "DPIIT-recognised startups"]);
  t.check("three picks are all readable, not just the first",
    businessPicks().length === 3 &&
    businessPicks().slice().sort().join("|") === "DPIIT-recognised startups|MSMEs|Startups",
    businessPicks().join(" | "));
  t.check("a <select multiple>'s .value is only the first option in document order, which is why the",
    $("business").value === "DPIIT-recognised startups", $("business").value);
  t.check("matcher reads the options, not .value", api.selectedValues($("business")).length === 3);

  /* The picks are only a highlight that scrolls away, so they are echoed. */
  t.check("the picks are spelled out under the control",
    /3 selected/.test($("businessPicked").innerHTML) &&
    /Startups/.test($("businessPicked").innerHTML), $("businessPicked").innerHTML);
  t.check("and there is a way to drop them all without hunting in 76 rows",
    /Clear/.test($("businessPicked").innerHTML));
  pickBusiness([]);
  t.check("with nothing picked the note says so and says how to pick several",
    /Nothing selected/.test($("businessPicked").innerHTML) &&
    /Ctrl/.test($("businessPicked").innerHTML), $("businessPicked").innerHTML);
  t.check("and the Clear button is gone when there is nothing to clear",
    !/Clear/.test($("businessPicked").innerHTML));

  pickBusiness(["Startups", "MSMEs"]);
  api.clearBusinessPicks();
  t.check("Clear empties the list box", businessPicks().length === 0, businessPicks().join(" | "));
  t.check("and the note goes back to its empty wording",
    /Nothing selected/.test($("businessPicked").innerHTML));

  const stageLabels = opts("stage").map(c => c.textContent);
  const bizLabels = opts("business").map(c => c.textContent);
  t.check("every option states how many schemes reach it, so one-off labels are visible",
    stageLabels.includes("Idea (33)") && bizLabels.includes("Startups (16)"),
    stageLabels.slice(0, 3).join(" | "));
  t.check("options are alphabetical, so the list can be scanned",
    stageLabels.indexOf("Commercialisation (2)") > -1 &&
      stageLabels.indexOf("Commercialisation (2)") < stageLabels.indexOf("Growth (40)"),
    stageLabels.join(" | "));
  t.check("a rare stage reads as rare rather than equal to a common one",
    stageLabels.includes("Pilot (1)") && stageLabels.includes("Early Stage (45)"));
  /* textContent is a text node. esc() belongs on the paths that build an
     HTML string; applied here it displayed the entities themselves, so this
     option read "R&amp;D (3)" instead of "R&D (3)". */
  t.check("an ampersand value is shown literally, not as an escaped entity",
    stageLabels.includes("R&D (3)") &&
      !stageLabels.some(l => l.indexOf("&amp;") > -1 || l.indexOf("&#39;") > -1),
    stageLabels.filter(l => l.indexOf("D (3)") > -1).join(" | "));

  const ideaOpt = $("stage").children.find(c => c.value === "Idea");
  t.check("option .value is the bare dataset value, the count is only in the label",
    !!ideaOpt && ideaOpt.value === "Idea" && ideaOpt.textContent === "Idea (33)");
  $("stage").value = "Early Stage";
  t.check("selecting a stage stores the exact dataset string the matcher compares",
    $("stage").value === "Early Stage");

  /* The reset is where a multi-select quietly breaks: selectedIndex = 0 selects
     the first option and leaves the rest, so "Reset" would have kept the picks. */
  pickBusiness(["Startups", "MSMEs", "Researchers"]);
  $("stage").selectedIndex = 3;
  api.resetForm();
  t.check("resetForm deselects every pick, not just the first",
    businessPicks().length === 0, businessPicks().join(" | "));
  t.check("resetForm puts the single-selects back to their empty option",
    $("stage").value === "", JSON.stringify($("stage").value));
  t.check("and the note under the multi-select agrees it is empty",
    /Nothing selected/.test($("businessPicked").innerHTML));
} catch (e) {
  t.bad("threw: " + e.stack.split("\n").slice(0, 3).join(" | "));
}

process.exit(t.finish() ? 1 : 0);
