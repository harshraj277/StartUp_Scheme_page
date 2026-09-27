/* The compare page on its own: boots the real compare.html script against a
   stub DOM, the way the main page is booted in e2e.test.js.
   Run: node tests/compare.test.js */
const { makeCompareEnv, makeReporter } = require("./dom-stub");
const t = makeReporter("compare");

const open = (ids, saved) => makeCompareEnv(ids === null ? "" : `?ids=${ids.join(",")}`, saved);
const cards = ($) => ($("compare").innerHTML.match(/<th scope="col">/g) || []).length - 1;
const rows  = ($) => ($("compare").innerHTML.match(/<tr class="/g) || []).length;

t.step("it reads the schemes out of the query string");
{
  const $ = open(["IN-002", "IN-003"]).$;
  t.check("two ids -> two scheme columns", cards($) === 2, String(cards($)));
  t.check("the scheme names are the column headers",
    /Startup India Seed Fund Scheme/.test($("compare").innerHTML));
  t.check("the sub-line says how many were selected",
    $("compareSub").textContent === "2 schemes selected — compared side by side.",
    $("compareSub").textContent);
  t.check("the column/feature count is stated", $("colCount").textContent === "2 columns · 16 features");
  t.check("the data date is sourced from the dataset, not invented",
    /^\d{4}-\d{2}-\d{2}$/.test($("asAt").textContent), $("asAt").textContent);
}

t.step("it still works when opened with nothing in the URL");
{
  /* Someone bookmarks compare.html or types it in. localStorage is the fallback
     so the page is not simply blank. */
  const $ = open(null, ["IN-002", "IN-005"]).$;
  t.check("falls back to the ticked schemes", cards($) === 2, String(cards($)));
  t.check("and the sub-line explains the state rather than claiming a URL",
    $("compareSub").textContent === "2 schemes selected — compared side by side.",
    $("compareSub").textContent);
  const empty = open(null, []).$;
  t.check("nothing selected at all -> no columns and no invented count",
    cards(empty) === 0 && empty("compareSub").textContent === "" && empty("colCount").textContent === "");
  t.check("the diff button stays hidden with fewer than 2 columns", empty("diffRowsBtn").hidden === true);
}

t.step("one scheme is not a comparison, and the page says so");
{
  const $ = open(["IN-002"]).$;
  t.check("1 column still renders", cards($) === 1);
  t.check("but the sub-line says it is not a comparison",
    /one scheme is not a comparison/.test($("compareSub").textContent), $("compareSub").textContent);
  t.check("and the diff toggle is not offered", $("diffRowsBtn").hidden === true);
}

t.step("an id that left the dataset is disclosed, not silently dropped");
{
  const $ = open(["IN-002", "GONE-FROM-DATA", "IN-003"]).$;
  t.check("the notice is shown", $("compareMissing").hidden === false);
  t.check("it names the missing id and says why",
    /no longer in the current dataset/.test($("compareMissing").innerHTML) &&
    /GONE-FROM-DATA/.test($("compareMissing").innerHTML));
  t.check("the table has only the 2 real schemes", cards($) === 2, String(cards($)));
  t.check("...while the sub-line still reports the 3 that were asked for",
    /3 schemes selected/.test($("compareSub").textContent), $("compareSub").textContent);
  const clean = open(["IN-002", "IN-003"]).$;
  t.check("with nothing missing the notice is hidden", clean("compareMissing").hidden === true);
}

t.step("every cell is escaped, like everywhere else on the site");
{
  const $ = open(["IN-002", "IN-003"]).$;
  const h = $("compare").innerHTML;
  t.check("no raw angle brackets leak from dataset text",
    !/&(?!amp;|lt;|gt;|quot;|#39;)/.test(h.replace(/<\/?(table|thead|tbody|tr|th|td|a|strong|br)[^>]*>/g, "")));
  t.check("the Apply link carries rel=noopener and the scheme's own url",
    /<a class="btn btn-gold" href="https:\/\/[^"]+" target="_blank" rel="noopener">Apply/.test(h));
}

t.step("highlight differences hides the rows that say the same thing");
{
  const env = open(["IN-002", "IN-003"]);
  const $ = env.$;
  const rowsOf = cls => (env.rowCache.get("compare") || {})[cls] || [];
  t.check("rows are split into differs and same at render time",
    rowsOf("differs").length > 0 && rowsOf("same").length > 0,
    `differs=${rowsOf("differs").length} same=${rowsOf("same").length}`);
  t.check("every row carries a class", rows($) === rowsOf("differs").length + rowsOf("same").length);
  t.check("Government level is the same for both (both Central), so it is a 'same' row",
    rowsOf("same").some(r => /Government level/.test(r.html)));
  t.check("Ministry differs, so it is a 'differs' row",
    rowsOf("differs").some(r => /Ministry \/ Department/.test(r.html)));
  t.check("nothing is hidden before you ask",
    rowsOf("same").every(r => r.hidden === false));
}

t.step("text is shown in full — a comparison must not hide the difference");
{
  const env = open(["IN-001", "IN-003"]);
  const $ = env.$;
  const cells = [...$("compare").innerHTML.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => m[1]);
  const long = cells.filter(c => c.length > 100);
  t.check("the long prose fields are rendered in full, not clipped",
    long.length > 0 && long.every(c => !c.includes("…")), `cells over 100 chars: ${long.length}`);
  t.check("the full eligibility text of the longest record is present",
    cells.some(c => c.includes("Can facilitate venture debt")));
}

process.exitCode = t.finish();
