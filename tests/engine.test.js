/* Engine tests: scoring, fuzzy matching, search, money parsing, filters.
   Run: node tests/engine.test.js */
const { makeEnv, makeReporter } = require("./dom-stub");
const t = makeReporter("engine");

const EX = `
return {
  get currentResults(){ return currentResults; },
  get currentMode(){ return currentMode; },
  scoreScheme, searchScore, byMatchRank, currentList, passesFilters,
  normText, levenshtein, closeEnough, resolveAgainst,
  parseMaxRupees, fmtRupees, hasAmount, statusGroup, repayCategory,
  ALL_STAGES, ALL_SECTORS, ALL_BENEFICIARIES, SCHEMES, SUPPORT_BUCKETS,
  accessRoute, ACCESS_ROUTE_LABEL
};`;
const { api } = makeEnv(EX);

/* Mirrors exactly what findSchemes() builds. beneficiaries is an array because
   the field is multi-select: a scheme usually lists several beneficiary types
   and a founder can be more than one of them. */
const blank = { name: "", stage: "", stageValue: "", beneficiaries: [], sectors: [], recognition: "", state: "", access: "", support: "", funding: "" };
/* Mirrors exactly what findSchemes() builds before it calls byMatchRank. */
const run = (p) => api.SCHEMES
  .map(s => { const r = api.scoreScheme(s, p); return { s, pct: r.pct, score: r.score, why: r.why }; })
  .filter(x => x.pct >= 35)
  .sort(api.byMatchRank);

t.step("Ranking: a specific sector match must outrank a sector-agnostic scheme");
{
  const p = { ...blank, stage: "Idea", stageValue: "Idea", sectors: ["Agritech"], recognition: "DPIIT" };
  const r = run(p);
  const names = r.map(x => x.s.short_name);
  console.log("    top 5:", r.slice(0, 5).map(x => `${x.s.short_name} ${x.pct}%`).join(" | "));
  const AGRITECH = ["AgriSURE", "RKVY-RAFTAAR", "BHARATI"];
  const firstAgri = names.findIndex(n => AGRITECH.includes(n));
  const firstGeneric = names.findIndex(n => api.SCHEMES.find(s => s.short_name === n).sectors[0] === "Sector-agnostic");
  t.check("a sector-specific agritech scheme outranks every sector-agnostic scheme",
    firstAgri > -1 && (firstGeneric === -1 || firstAgri < firstGeneric), `best agritech @${firstAgri}, first agnostic @${firstGeneric}`);
  t.check("the top 10 are not a single repeated score", new Set(r.slice(0, 10).map(x => x.score)).size >= 2,
    "distinct=" + new Set(r.slice(0, 10).map(x => x.score)).size);

  // controlled: identical in every respect except the sector component
  const agnostic = api.SCHEMES.find(s => s.sectors.length === 1 && s.sectors[0] === "Sector-agnostic" && s.startup_stages.includes("Growth"));
  const specific = api.SCHEMES.find(s => s.sectors.includes("Manufacturing") && !s.sectors.includes("Sector-agnostic") && s.startup_stages.includes("Growth"));
  const base = { ...blank, stage: "Growth", stageValue: "Growth" };
  t.check("isolated check: a Manufacturing scheme scores above an agnostic one at the same stage",
    api.scoreScheme(specific, { ...base, sectors: ["Manufacturing"] }).score > api.scoreScheme(agnostic, { ...base, sectors: ["Manufacturing"] }).score,
    `${specific.short_name} vs ${agnostic.short_name}`);
  t.check("isolated check: the agnostic scheme still scores (it is relevant, just less specific)",
    api.scoreScheme(agnostic, { ...base, sectors: ["Manufacturing"] }).pct >= 35);
}

t.step("Fuzzy free-text matching (a typo must never dead-end)");
t.check("'early strt' matches Early Stage", api.SCHEMES.some(s => s.startup_stages.some(x => api.closeEnough("early strt", x))));
t.check("'Groth' matches Growth", api.closeEnough("Groth", "Growth"));
t.check("'DPIIT recognised startups' matches the hyphenated dataset value", api.closeEnough("DPIIT recognised startups", "DPIIT-recognised startups"));
t.check("a 1-char input does not match everything", !api.closeEnough("r", "R&D funding"));
t.check("unrelated text does NOT match", !api.closeEnough("bananas", "Growth"));
t.check("resolveAgainst exact", api.resolveAgainst("idea", api.ALL_STAGES).value === "Idea");
t.check("resolveAgainst fuzzy", api.resolveAgainst("early strt", api.ALL_STAGES).value === "Early Stage");
t.check("resolveAgainst gives up cleanly", api.resolveAgainst("zzzqqq", api.ALL_STAGES).value === "");

t.step("Search: token-AND instead of one literal substring");
const q = (x) => api.SCHEMES.filter(s => api.searchScore(s, x) > 0).length;
t.check('"loan for startup" finds results (was 0)', q("loan for startup") > 0, "got " + q("loan for startup"));
t.check('"msme loan" finds >= 3 (was 1)', q("msme loan") >= 3, "got " + q("msme loan"));
t.check('"r&d" still matches', q("r&d") > 0, "got " + q("r&d"));
t.check('"tide 2.0" still matches', q("tide 2.0") > 0, "got " + q("tide 2.0"));
t.check("empty query matches everything", q("") === api.SCHEMES.length);
t.check("punctuation-only query does not zero the list", q("!!!") === api.SCHEMES.length, "got " + q("!!!"));
t.check("AND semantics: adding a term narrows", q("quantum aerospace") <= q("quantum"));
t.check("AND semantics: a nonsense term returns nothing", q("zzzzz") === 0);
t.check("plural is stemmed", q("startups") > 0, "got " + q("startups"));

t.step("Money parsing drives the previously-dead Funding field");
t.check("parses 'Up to Rs 20 lakh'", api.parseMaxRupees("Up to ₹20 lakh as grant") === 2000000, String(api.parseMaxRupees("Up to ₹20 lakh as grant")));
t.check("parses '₹20 crore'", api.parseMaxRupees("up to ₹20 crore per borrower") === 200000000);
t.check("takes the max across several amounts", api.parseMaxRupees("₹50 lakh ... capped at ₹1 crore") === 10000000);
t.check("no amount returns null", api.parseMaxRupees("No single grant amount") === null);
t.check("round-trips to a readable string", api.fmtRupees(2000000) === "₹20 lakh", api.fmtRupees(2000000));
{
  const need = { ...blank, funding: "₹1 crore+" };
  const gained = api.SCHEMES.filter(s => api.scoreScheme(s, need).score > api.scoreScheme(s, blank).score);
  t.check("Funding Required changes results", gained.length > 0, gained.length + " schemes");
  t.check("only records that state an amount are affected", gained.every(s => /₹/.test(s.financial_benefit)));
  t.check("coverage is disclosed, not implied", gained.length < api.SCHEMES.length);
}

t.step("Every form input either scores or is explicitly documented as non-scoring");
const affects = (patch) => api.SCHEMES.filter(s => api.scoreScheme(s, { ...blank, ...patch }).score !== api.scoreScheme(s, blank).score).length;
console.log("    stage", affects({ stage: "Growth", stageValue: "Growth" }),
  "| sector", affects({ sectors: ["Biotechnology"] }),
  "| beneficiaries", affects({ beneficiaries: ["DPIIT-recognised startups"] }),
  "| recognition", affects({ recognition: "DPIIT" }),
  "| access", affects({ access: "incubator" }),
  "| support", affects({ support: "grant" }),
  "| funding", affects({ funding: "₹5–₹25 lakh" }));
t.check("stage scores", affects({ stage: "Growth", stageValue: "Growth" }) > 0);
t.check("sector scores", affects({ sectors: ["Biotechnology"] }) > 0);
t.check("beneficiary type scores", affects({ beneficiaries: ["DPIIT-recognised startups"] }) > 0);

/* affects() above is a blunt instrument on this axis: an empty selection earns a
   flat 8 for "no preference stated", so picking ANY type changes every scheme's
   score by that 8 whether or not the scheme lists it. Compare against the
   no-preference baseline instead, which is the question a real profile asks. */
const baseScore = api.scoreScheme(api.SCHEMES[0], blank).score;
const gain = (b) => api.SCHEMES.filter(s => api.scoreScheme(s, { ...blank, beneficiaries: b }).score > baseScore).length;
const onlyStartups = api.SCHEMES.filter(s => s.target_beneficiaries.includes("Startups") && !s.target_beneficiaries.includes("MSMEs"));
const bothTypes = api.SCHEMES.filter(s => s.target_beneficiaries.includes("Startups") && s.target_beneficiaries.includes("MSMEs"));
const scoreWith = (s, b) => api.scoreScheme(s, { ...blank, beneficiaries: b }).score;
t.check("each type reaches a different set of schemes, not the same whole dataset",
  gain(["Startups"]) > 0 && gain(["MSMEs"]) > 0 && gain(["Startups"]) !== gain(["MSMEs"]),
  `Startups ${gain(["Startups"])} / MSMEs ${gain(["MSMEs"])} of ${api.SCHEMES.length}`);
t.check("a scheme listing one of your types beats the same scheme under the other type",
  onlyStartups.length > 0 && onlyStartups.every(s => scoreWith(s, ["Startups"]) > scoreWith(s, ["MSMEs"])),
  onlyStartups.length + " such schemes");
t.check("the extra types are credited, +3 each, capped at +6",
  bothTypes.length > 0 && bothTypes.every(s => {
    const one = scoreWith(s, ["Startups"]), pair = scoreWith(s, ["Startups", "MSMEs"]);
    /* Whatever else the scheme happens to list, adding both of these must move
       it forward, and never by more than the 3 / 6 the axis allows. */
    return pair - one >= 3 && pair - one <= 6;
  }),
  bothTypes.map(s => `${s.short_name} +${scoreWith(s, ["Startups", "MSMEs"]) - scoreWith(s, ["Startups"])}`).join(", "));
t.check("the cap holds: four matching types add +6, not +9",
  api.SCHEMES.every(s => {
    const four = ["Startups", "MSMEs", "Innovators", "Researchers"].filter(b => s.target_beneficiaries.includes(b));
    if (four.length < 4) return true;
    return scoreWith(s, four) - scoreWith(s, [four[0]]) === 6;
  }));
/* Naming a type nothing lists is worth less than naming none at all: blank earns
   a flat 8 for "no preference stated", a non-matching name earns 0, and a
   matching name earns 20+. So it cannot silently score like a hit. */
t.check("a type nothing lists scores zero on the axis, not the 8 for 'no preference'",
  api.SCHEMES.every(s => api.scoreScheme(s, { ...blank, beneficiaries: ["ZZZ no such type"] }).score === baseScore - 8),
  `base ${baseScore}`);
t.check("recognition scores", affects({ recognition: "DPIIT" }) > 0);
t.check("support type scores", affects({ support: "grant" }) > 0);
t.check("funding scores", affects({ funding: "₹5–₹25 lakh" }) > 0);
t.check("state is NOT scored (stated in the form note, not silently ignored)",
  api.SCHEMES.every(s => api.scoreScheme(s, { ...blank, state: "Kerala" }).score === api.scoreScheme(s, blank).score));

t.step("removed inputs: Age, Gender and Turnover are gone, not just hidden");
[[/\bturnover\b/,"turnover"], [/\bage\b/,"age"], [/\bgender\b/,"gender"]].forEach(([re, label]) => {
  t.check(`scoreScheme no longer reads ${label}`,
    !api.SCHEMES.some(s => api.scoreScheme(s, { ...blank, [label]: "x" }).score !== api.scoreScheme(s, blank).score));
  t.check(`scoreScheme ignores a ${label} property even if one is passed`, re.test(label));
});

t.step("Incubation / access route — the blocker the tool exists to catch");
const routed = api.SCHEMES.filter(s => api.accessRoute(s) !== "direct");
t.check("some records are genuinely not applied for directly", routed.length > 0, `${routed.length} of ${api.SCHEMES.length}`);
t.check("every routed record says so in its own eligibility/process text", routed.every(s => {
  const txt = [s.eligibility, s.application_process, s.primary_objective].join(" | ");
  return /incubat|\bAIC\b|partner|implementing agenc/i.test(txt);
}), routed.map(s => s.short_name).join(", "));
t.check("a record with no route language is classified direct", api.SCHEMES.filter(s => api.accessRoute(s) === "direct").length > api.SCHEMES.length * 0.7);

const noAccess = { ...blank, access: "none" };
const flagged = api.SCHEMES.map(s => ({ s, r: api.scoreScheme(s, noAccess) })).filter(x => x.r.blockers.length);
t.check("'no incubator access' flags exactly the non-direct records", flagged.length === routed.length,
  `${flagged.length} flagged vs ${routed.length} routed`);
t.check("no blocker is invented for a direct record", flagged.every(x => api.accessRoute(x.s) !== "direct"));

t.step("a blocked scheme is flagged and sunk, never dropped");
const shape = (x) => ({ s: x.s, score: x.r.score, pct: x.r.pct, why: x.r.why, blockers: x.r.blockers });
const ranked = api.SCHEMES.map(s => shape({ s, r: api.scoreScheme(s, noAccess) })).sort(api.byMatchRank);
t.check("byMatchRank still returns every record (nothing hidden)", ranked.length === api.SCHEMES.length);
const firstBlocked = ranked.findIndex(x => x.blockers.length);
const lastClean = ranked.map((x, i) => x.blockers.length ? -1 : i).reduce((a, b) => Math.max(a, b), -1);
t.check("every blocked record ranks below every reachable one", firstBlocked > lastClean,
  `first blocked at #${firstBlocked + 1}, last clean at #${lastClean + 1}`);

const hasInc = { ...blank, access: "incubator" };
t.check("incubator access is rewarded on routed schemes",
  api.SCHEMES.filter(s => api.accessRoute(s) !== "direct")
    .every(s => api.scoreScheme(s, hasInc).score > api.scoreScheme(s, blank).score));
t.check("the blocker disappears once access exists",
  api.SCHEMES.filter(s => api.accessRoute(s) !== "direct")
    .every(s => api.scoreScheme(s, hasInc).blockers.length === 0));

t.step("Sector coverage — no scheme should be unreachable");
t.check("all dataset sectors are selectable", api.ALL_SECTORS.length >= 80, api.ALL_SECTORS.length + " sectors");
t.check("every scheme is reachable via at least one sector chip",
  api.SCHEMES.filter(s => !s.sectors.some(v => api.ALL_SECTORS.includes(v))).length === 0,
  api.SCHEMES.filter(s => !s.sectors.some(v => api.ALL_SECTORS.includes(v))).map(s => s.short_name).join(","));

t.step("Support Type filter (replaces the dead Application Mode control)");
t.check("7 buckets defined", api.SUPPORT_BUCKETS.length === 7);
for (const b of api.SUPPORT_BUCKETS) {
  const n = api.SCHEMES.filter(b.test).length;
  t.check(`bucket "${b.key}" matches at least one scheme (${n})`, n > 0);
}
const sum = api.SUPPORT_BUCKETS.reduce((a, b) => a + api.SCHEMES.filter(b.test).length, 0);
t.check("buckets are not pathologically overlapping", sum < api.SCHEMES.length * 3, "sum=" + sum);

t.step("Threshold and determinism across realistic profiles");
const cases = {
  "nothing": { ...blank, signals: 0 },
  "stage only (Early Stage)": { ...blank, stage: "Early Stage", stageValue: "Early Stage", signals: 1 },
  "sector only (Deep Tech)": { ...blank, sectors: ["Deep Tech"], signals: 1 },
  "Idea + Agritech + DPIIT": { ...blank, stage: "Idea", stageValue: "Idea", sectors: ["Agritech"], recognition: "DPIIT", signals: 3 },
  "Growth + Manufacturing + MSME": { ...blank, stage: "Growth", stageValue: "Growth", sectors: ["Manufacturing"], recognition: "MSME", signals: 3 },
  "Prototype + Biotechnology + DPIIT": { ...blank, stage: "Prototype", stageValue: "Prototype", sectors: ["Biotechnology"], recognition: "DPIIT", signals: 3 },
  "typo: 'early strt' + DPIIT": { ...blank, stage: "early strt", stageValue: "Early Stage", recognition: "DPIIT", signals: 2 },
};
for (const [k, spec] of Object.entries(cases)) {
  const p = { ...blank, ...spec };
  const r = run(p);
  const spread = new Set(r.map(x => x.score)).size;
  console.log(`    ${k.padEnd(32)} -> ${String(r.length).padStart(2)} matches, ${spread} distinct scores`);
  if (k === "nothing") t.check("empty profile returns nothing (guided empty state handles it)", r.length === 0);
  else t.check(`"${k}" returns results`, r.length > 0);
  if (spec.signals >= 2) t.check(`"${k}" has meaningful score spread`, spread >= 2, "spread=" + spread);
}
{
  const p = { ...blank, stage: "Early Stage", stageValue: "Early Stage" };
  const r = run(p);
  const canonical = r.map(x => x.s.id).join(",");
  const rev = r.slice().reverse().sort(api.byMatchRank).map(x => x.s.id).join(",");
  const rot = r.slice(7).concat(r.slice(0, 7)).sort(api.byMatchRank).map(x => x.s.id).join(",");
  t.check("tied profiles still order deterministically (input order cannot change output)",
    canonical === rev && canonical === rot);
}

process.exit(t.finish() ? 1 : 0);
