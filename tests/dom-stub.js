/* Minimal DOM stub good enough to boot js/app.js and js/compare.js.
   Supports: getElementById, createElement, innerHTML (with chip and table-row
   parsing), querySelectorAll("#container .chip" / "#table tr.cls"), and
   localStorage/history/location.

   getElementById is strict: an id not present in PAGE_IDS returns null, exactly
   as a browser would for a control removed from the page. That way a test can
   never pass against an element the real page no longer has. */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/* Rows are real objects handed to the page, so when compare.js sets tr.hidden
   the test can see it — the same way a browser would. */
function makeEl(tag, chipCache, store, rowCache) {
  let _html = "";
  const parseChips = () => {
    chipCache.set(el._id, [..._html.matchAll(/<button class="chip[^"]*" type="button" data-sector="([^"]*)"(?: data-count="(\d+)")?/g)].map(m => ({
      dataset: { sector: m[1].replace(/&amp;/g, "&"), count: m[2] === undefined ? undefined : m[2] },
      classList: makeEl("div", chipCache, store, rowCache).classList,
      hidden: false,
    })));
  };
  const parseRows = () => {
    const rows = {};
    for (const m of _html.matchAll(/<tr class="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
      rows[m[1]] = rows[m[1]] || [];
      rows[m[1]].push({
        cls: m[1], hidden: false,
        classList: makeEl("div", chipCache, store, rowCache).classList,
        html: m[2],
      });
    }
    rowCache.set(el._id, rows);
  };
  const el = {
    tagName: (tag || "div").toUpperCase(),
    _id: "", value: "", textContent: "", hidden: false, selectedIndex: 0,
    style: {}, dataset: {}, attrs: {}, children: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    querySelectorAll(sel) { return runQuery(sel, chipCache, rowCache); },
    querySelector() { return makeEl("div", chipCache, store, rowCache); },
    focus() {}, scrollIntoView() {},
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return _html; },
    set(v) {
      _html = v;
      if (el._id) { parseChips(); parseRows(); }
      /* A real browser makes every id written into innerHTML findable via
         getElementById. renderCompareBar() relies on that when it builds the
         compare bar on demand, so the stub has to model it. */
      if (store) [...String(v).matchAll(/\bid="([^"]+)"/g)].forEach(m => {
        if (!store[m[1]]) store[m[1]] = Object.assign(makeEl("div", chipCache, store, rowCache), { _id: m[1] });
      });
    },
  });
  Object.defineProperty(el, "id", {
    get() { return this._id; },
    set(v) { this._id = v; if (store) store[v] = el; },
  });
  return el;
}

/* Only the two selector shapes the app actually uses are modelled. Anything
   else returns nothing rather than pretending, so a test cannot pass against a
   selector the browser would have handled differently. */
function runQuery(sel, chipCache, rowCache) {
  const chips = /#([\w-]+) \.chip$/.exec(sel);
  if (chips) return chipCache.get(chips[1]) || [];
  const rows = /#([\w-]+) tr\.([\w-]+)$/.exec(sel);
  if (rows) return (rowCache.get(rows[1]) || {})[rows[2]] || [];
  return [];
}

/* Every id index.html provides. Pre-creating them keeps the stub honest. */
const PAGE_IDS = ["trustCount","trustMinistries","dashVerified","heroBadge","sectorChips","sectorChipsCount","sectorFilter",
 "stageList","businessList","fMinistry","fType","fStatus","fFinance","fRepay","govLevelNote",
 "fundCoverage","accessCoverage","accessTag","stageHint","businessHint","stage","business","recognition","state","access","support","funding",
 "startupName","results","resultCount","paginationWrap","prevPageBtn","nextPageBtn","pagingInfo","browseToolbar","filtersPanel","modeBanner","sectorToggleBtn",
 "sectorPanel","sectorPickerBtn","sectorPickerLabel",
 "quickFilterBanner","resultsHeading","searchInput","sort","toast","modalBackdrop","modalContent",
 "navLinks","menuBtn","statsGrid","exploreGrid","filtersToggleBtn","resultsTop"];

/* Every id compare.html provides. */
const COMPARE_IDS = ["compareSub","diffRowsBtn","colCount","compareMissing","compare","asAt"];

function makeCtx(ids, chipCache, rowCache) {
  const store = {};
  const document = {
    /* Strict on purpose: anything not in PAGE_IDS returns null, exactly as a
       browser would for a removed control. Auto-creating every id would let a
       test pass against a button that no longer exists in the page. */
    getElementById(id) { return store[id] ?? null; },
    createElement: (t) => makeEl(t, chipCache, store, rowCache),
    querySelector: () => makeEl("div", chipCache, store, rowCache),
    querySelectorAll(sel) { return runQuery(sel, chipCache, rowCache); },
    addEventListener() {},
    activeElement: { focus() {} },
    body: makeEl("body", chipCache, store, rowCache),
  };
  ids.forEach(id => { store[id] = Object.assign(makeEl("div", chipCache, store, rowCache), { _id: id }); });

  const localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };
  const location = { hash: "", pathname: "/index.html", search: "", origin: "http://localhost:8080" };
  const ctx = {
    window: { innerWidth: 1200, addEventListener() {} },
    document, localStorage, location,
    history: { replaceState() {} },
    URLSearchParams,
    navigator: {},
    console, setTimeout: () => {},
    confirm: () => true,
    Math, JSON, Object, Array, String, Number, Set, Map, RegExp, Infinity, isFinite, parseFloat, encodeURIComponent,
  };
  new Function("window", fs.readFileSync(path.join(ROOT, "data/schemes.js"), "utf8"))(ctx.window);
  const util = fs.readFileSync(path.join(ROOT, "js/util.js"), "utf8");
  return { ctx, store, util };
}

/* Boots the real index.html app. */
function makeEnv(exportBody) {
  const chipCache = new Map(), rowCache = new Map();
  const { ctx, store, util } = makeCtx(PAGE_IDS, chipCache, rowCache);
  const app = util + "\n" + fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8") + "\n" + exportBody;
  const api = new Function(...Object.keys(ctx), app)(...Object.values(ctx));
  return { api, store, chipCache, rowCache, $: (id) => store[id],
    cards: () => (store.results.innerHTML.match(/<article class="scheme-card[ "]/g) || []).length };
}

/* Boots the real compare.html page. `search` is the query string it is opened
   with, which is how the main page passes the selected scheme ids. */
function makeCompareEnv(search, saved) {
  const chipCache = new Map(), rowCache = new Map();
  const { ctx, store, util } = makeCtx(COMPARE_IDS, chipCache, rowCache);
  ctx.location.search = search || "";
  if (saved) ctx.localStorage.setItem("yojanaCompare", JSON.stringify(saved));
  const page = util + "\n" + fs.readFileSync(path.join(ROOT, "js/compare.js"), "utf8");
  new Function(...Object.keys(ctx), page)(...Object.values(ctx));
  return { store, rowCache, $: (id) => store[id] };
}

function makeReporter(title) {
  let pass = 0, fail = 0;
  console.log("\n########## " + title + " ##########");
  return {
    step: (m) => console.log("\n--- " + m),
    ok(m) { pass++; console.log("  PASS  " + m); },
    bad(m) { fail++; console.log("  FAIL  " + m); },
    check(name, cond, extra) { cond ? this.ok(name) : this.bad(name + (extra ? "  -> " + extra : "")); return !!cond; },
    finish() {
      console.log("\n" + (fail ? `!!! ${fail} FAILED, ${pass} passed` : `OK  ${pass} passed, 0 failed`) + `  [${title}]`);
      return fail;
    },
  };
}

module.exports = { ROOT, makeEnv, makeCompareEnv, makeReporter, PAGE_IDS, COMPARE_IDS };
