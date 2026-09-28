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
    _id: "", value: "", textContent: "", hidden: false,
    style: {}, dataset: {}, attrs: {}, children: [], selected: false,
    /* fillSelect() and fillDatalist() used to build options; the two match-form
       fields are <select> now, so option count is a real assertion. Recorded so
       a test can read back the labels the page would render. */
    _labels: [],
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); },
      remove(...c) { c.forEach(x => this._s.delete(x)); },
      toggle(c, f) { f === undefined ? (this._s.has(c) ? this._s.delete(c) : this._s.add(c)) : (f ? this._s.add(c) : this._s.delete(c)); },
      contains(c) { return this._s.has(c); },
    },
    appendChild(c) {
      this.children.push(c);
      /* A browser keeps exactly one option selected, the first by default. */
      if (this.tagName === "SELECT" && !this.children.some(x => x.selected)) c.selected = true;
      return c;
    },
    addEventListener() {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(k) { delete this.attrs[k]; },
    querySelectorAll(sel) { return runQuery(sel, chipCache, rowCache, this._id, store); },
    querySelector() { return makeEl("div", chipCache, store, rowCache); },
    focus() {}, scrollIntoView() {},
  };
  /* resetForm() resets a <select> with selectedIndex = 0, which in a browser
     also changes .value. Modelling only the assignment would leave .value on the
     previously chosen option, so a test could not tell a real reset from a
     no-op — which is exactly how the old #find-inputs bug hid.
     For a <select multiple> the browser's rule is different and is the whole
     reason a multi-select cannot be reset with 0: that selects the first option
     and leaves every other selection alone. Only -1 clears them all. */
  let _selIdx = 0;
  Object.defineProperty(el, "selectedIndex", {
    get() { return _selIdx; },
    set(i) {
      _selIdx = i | 0;
      if (el.tagName === "SELECT") {
        if (_selIdx < 0) {
          el.children.forEach(c => { c.selected = false; });
        } else {
          /* On a multiple select, setting an index selects that option and
             leaves the rest as they were. Only a single-select collapses to one. */
          if (!el.multiple) el.children.forEach(c => { c.selected = false; });
          el.children.forEach((c, n) => { if (n === _selIdx) c.selected = true; });
        }
        el.value = el.children[_selIdx] ? el.children[_selIdx].value : "";
      }
    },
  });

  /* <select>.options is the live list of <option>s. selectedValues() reads the
     selection through it, because on a multi-select .value gives only the first
     chosen option. */
  Object.defineProperty(el, "options", {
    get() { return el.tagName === "SELECT" ? el.children : []; },
  });

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

/* Only the selector shapes the app actually uses are modelled. Anything
   else returns nothing rather than pretending, so a test cannot pass against a
   selector the browser would have handled differently. */
function runQuery(sel, chipCache, rowCache, hostId, store) {
  const chips = /#([\w-]+) \.chip$/.exec(sel);
  if (chips) return chipCache.get(chips[1]) || [];
  const rows = /#([\w-]+) tr\.([\w-]+)$/.exec(sel);
  if (rows) return (rowCache.get(rows[1]) || {})[rows[2]] || [];
  /* resetForm() clears the form with querySelectorAll("#find input") and
     ("#find select"). Without these it silently cleared nothing, and a test
     asserting the form was reset would have been testing a no-op. */
  if (sel === "#find input" || sel === "#find select") {
    const want = sel.endsWith("input") ? FORM_INPUTS : FORM_SELECTS;
    return want.map(id => store[id]).filter(Boolean);
  }
  return [];
}

/* The controls inside <section class="find">, by tag. resetForm() clears them by
   selector, so the stub has to know which is which. */
const FORM_INPUTS = ["startupName", "sectorFilter"];
const FORM_SELECTS = ["state", "stage", "business", "recognition", "access", "support", "funding"];

/* The same controls, for tag: a test asserting a field is a <select> needs the
   stub to agree with the markup. sort/fMinistry and friends are selects too. */
const SELECT_IDS = ["sort", "fMinistry", "fType", "fStatus", "fFinance", "fRepay", ...FORM_SELECTS];
const INPUT_IDS = ["searchInput", ...FORM_INPUTS];

/* Every id index.html provides. Pre-creating them keeps the stub honest. */
const PAGE_IDS = ["trustCount","trustMinistries","dashVerified","heroBadge","sectorChips","sectorChipsCount","sectorFilter",
 "fMinistry","fType","fStatus","fFinance","fRepay","govLevelNote",
 "fundCoverage","accessCoverage","accessTag","stage","business","businessPicked","recognition","state","access","support","funding",
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
    querySelectorAll(sel) { return runQuery(sel, chipCache, rowCache, null, store); },
    addEventListener() {},
    activeElement: { focus() {} },
    body: makeEl("body", chipCache, store, rowCache),
  };
  /* Created with the tag index.html actually gives them, so a test can assert a
     field is a <select> rather than a text input. Everything else is a div. */
  const tags = Object.assign({}, SELECT_IDS.reduce((a, id) => (a[id] = "select", a), {}),
                             INPUT_IDS.reduce((a, id) => (a[id] = "input", a), {}));
  ids.forEach(id => {
    store[id] = Object.assign(makeEl(tags[id] || "div", chipCache, store, rowCache), { _id: id });
  });
  /* Seed the <select>s with the options that are written in the markup, so the
     stub starts where the browser starts. Without this the "Select business
     stage" placeholder did not exist and resetForm() set selectedIndex=0 to a
     value that was never there. An <option> with no value attribute takes its
     text as its value, which is what State / UT and the funding range rely on. */
  for (const m of fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .matchAll(/<select id="([\w-]+)"([^>]*)>([\s\S]*?)<\/select>/g)) {
    const el = store[m[1]];
    if (!el) continue;
    /* <select multiple> changes what "selected" means and what a reset has to
       do, so the stub has to know which selects are multi. */
    el.multiple = /multiple/.test(m[2]);
    for (const o of m[3].matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)) {
      const text = o[2].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
      const opt = makeEl("option", chipCache, store, rowCache);
      opt.value = /value="([^"]*)"/.test(o[1]) ? /value="([^"]*)"/.exec(o[1])[1] : text;
      opt.textContent = text;
      el.appendChild(opt);
    }
    /* A single select starts on its first option; a multi select starts on
       nothing, because -1 (nothing selected) is the only honest starting state
       once several can be chosen. */
    el.selectedIndex = el.multiple ? -1 : 0;
  }

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
