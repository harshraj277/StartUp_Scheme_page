# Yojana Setu — Government Startup Scheme Finder

A dataset-driven tool for finding and matching Indian Central-Government
startup schemes against a startup's profile. No build step, no dependencies.

## Project structure

```
index.html        Main page: structure (HTML)
compare.html      Side-by-side comparison, opens in its own tab
css/styles.css    All styles, both pages
js/util.js        Shared helpers (esc, escJs, truncate, hasAmount, statusGroup)
js/app.js         Matching engine, filters, search, save/compare, modal
js/compare.js     The comparison table and its "highlight differences" toggle
data/schemes.js   Scheme dataset (59 records) as a plain script
serve.bat         Optional one-click local server (Windows)
tests/            Zero-dependency test suite (Node built-ins only)
```

## Run it

Just **double-click `index.html`** — the dataset loads as a plain script
(`data/schemes.js`), so it works from the file system with no server.

If you prefer serving over HTTP:

```bat
serve.bat
```

or manually:

```bat
python -m http.server 8080
```

then open <http://localhost:8080>.

## Run the tests

```bat
npm test
```

or `node tests/run-tests.js`. Four suites, no dependencies:

| Suite | What it guards |
| --- | --- |
| `tests/engine.test.js` | Scoring order, fuzzy free-text matching, token-AND search, ₹-amount parsing, access-route classification and blocker ranking, that every form input actually scores |
| `tests/contract.test.js` | Every `getElementById` and inline handler resolves, no dead markup or dead CSS, no facet asked in two places, label/alt wiring, dataset field shape, and that no rule is implemented twice across the two pages |
| `tests/e2e.test.js` | Boots the real `app.js` in a stub DOM and drives it as a user would — including paging forward and back through the whole result set, and ticking saved schemes to compare |
| `tests/compare.test.js` | Boots the real `js/compare.js` the way the main page boots: ids from the query string, the localStorage fallback, orphan disclosure, escaping, and the differences toggle |

## Desktop layout

Overflow and fixed widths are what actually makes a page "not fit", so the ones
that bit are pinned down by contract tests:

- The container is `min(1320px, 92%)`. Above that it stops growing, because a
  comparison table or a 4-up card grid stops being readable when it does.
- The nav hands over to the hamburger at **1080px**, not 1000px. Six links plus
  the call-to-action need roughly 880px and the container is 92% of the
  viewport, so at 1000px there was under 50px of slack — a slightly wider system
  font made the labels wrap and the header grow taller than its own
  `min-height`. `.navlinks a` is now `white-space:nowrap`, so a label cannot
  break in two.
- The nav breakpoint is its own media query. It used to carry the result-column
  counts with it, so fixing the nav would have silently halved the results grid.
- The results grid is 4-up at ≥1440px, 3-up at 1081–1439px, 2-up at 761–1080px,
  1-up below.
- The compare table caps columns at `max-width:360px` with `overflow-wrap`. The
  cell text is deliberately untruncated, so without a cap one long eligibility
  paragraph stretches its column to several thousand pixels and pushes the other
  schemes off the screen.
- `.compare` is its own scroll container (`max-height:calc(100vh - 250px)`), so
  the sticky header row sticks to the *table* rather than the viewport, where it
  would slide underneath the site's own sticky header and be hidden by it.
- The fixed compare bar is `max-width:min(720px, 94vw)` and wraps. It is centred
  with `left:50%` + `translateX(-50%)`, so an uncapped bar longer than the
  viewport is clipped off *both* sides and its controls become unreachable. Its
  compare link is an `<a>`, so `.compare-bar button` did not style it — it
  rendered as a rectangle beside a pill-shaped Clear button.
- `compare.html` puts its content in `<main>`, and only `<section>` was padded,
  so the table sat flush against the header and the footer.

## Two ways to find schemes

The page has two entry points, and they do genuinely different jobs:

| | *Find schemes for my startup* | *Advanced filters* |
| --- | --- | --- |
| Operation | Scores and **ranks** — nothing is removed | **Hard AND filter** — a scheme is shown only if it matches |
| Explains why | Yes, "Why it may match" | No |
| Flags what you cannot reach | Yes — incubator- and partner-routed schemes are flagged, not hidden | Impossible |
| Answers | *Which* of these should I chase first? | Show me *only* active Dept-of-Science schemes |

Neither can replace the other: a hard filter cannot say "NIDHI-PRAYAS is a strong
match but you need an incubator to reach it", and a score cannot narrow 59
schemes to the 6 a catalogue search wants.

They **were** overlapping, though, and the overlap was fixed:

- **Government Level** was removed. The dataset contains exactly one value,
  `Central`, so the filter could never remove anything. The panel now says so
  rather than shipping a dead control.
- **Beneficiary Type, Support Type, Industry / Sector and Startup Stage** were
  removed from *Advanced filters*, because the match form already asks all four
  and the two panels maintained independent state for them.

Nothing became unreachable as a result:

- **Sector** and **Startup Stage** are stored dataset fields, so the search box
  reproduces them exactly (`agritech` → the same 3 schemes as the old hard
  filter; `growth` → the same 40).
- **Beneficiary Type** and **Support Type** are *derived* buckets, not stored
  fields, so search only approximates them. The grant bucket holds 26 records;
  searching `grant` returns 27. The differences run both ways: search finds 9
  schemes the bucket misses, and the bucket finds 8 that never use the word
  "grant" (they say *Seed funding*, *R&D funding*, *Fellowship*). The panel
  discloses this and points at the match form for the exact classification.

What *Advanced filters* keeps is the five facets the match form cannot express:
**Ministry / Department, Scheme Type, Status, Financial Assistance and
Repayment**, plus free-text search. Ten controls became five.

## How matching works

`scoreScheme()` in `js/app.js` is additive and fully transparent — every point
comes from a real dataset field, and the reason is printed on the card.

| Signal | Points | Notes |
| --- | --- | --- |
| Business stage | 30 | Fuzzy: `"early strt"` resolves to *Early Stage* |
| Sector — specific match | 30–36 | **Outranks a sector-agnostic scheme** |
| Sector — `Sector-agnostic` | 16 | Still relevant, just less specific |
| Beneficiary type | 20 | Fuzzy |
| Support type | 16 | The only support-type control — see "Two ways to find schemes" |
| DPIIT / Udyam recognition | 10 each | Text match on the record |
| Incubation / access route | 8–14 | A real gate — see below |
| Funding required | 8 | Only where the record states a ₹ amount |

Unanswered fields contribute a neutral 10/10/8/6 so a thin profile is not
punished; results below 35% are dropped. Ranking is on the **raw unrounded**
score, so ties break on sector focus and then name — the order never depends
on dataset order.

### Incubation / access route — flagged, never hidden

11 of 59 records cannot be applied for directly: **8** route through a
participating incubator or centre (NIDHI-PRAYAS, NIDHI-EIR, NIDHI-SSP,
BIRAC-SEED, TIDE 2.0, STPI-NGIS, RKVY-RAFTAAR, AIC) and **3** through a
programme partner (GENESIS, ASPIRE, SFURTI). For a first-time founder this is
usually the binding constraint, so it gets a dedicated field.

`accessRoute(s)` classifies each record by reading its **own** eligibility and
process text — nothing is hardcoded per scheme. When the user picks *no
incubator access*, affected schemes are:

- **ranked below every reachable scheme**, so the actionable results come first;
- **kept in the list**, each card carrying a plain "you cannot apply to this
  yet" notice naming the actual route;
- **counted in the result line** (`9 of them you cannot apply to yet`).

Declaring incubator access clears every blocker and promotes those schemes to
the top, which is usually correct — for a deep-tech idea-stage founder,
NIDHI-PRAYAS and NIDHI-EIR are the best grants available and score 98% once
they can actually reach them.

The details modal also prints a **How You Reach It** row so the classification
is verifiable against the source text rather than taken on trust.

## Known dataset limits (surfaced in the UI, not hidden)

- **All 59 records are Central-government**, so *State* cannot filter anything.
- **Only 4 of 59 records state a specific ₹ amount**, so *Funding Required*
  can only affect those. The form prints this figure.
- **No record references women-led or age-specific eligibility**, and none
  mentions turnover or revenue. *Age*, *Gender* and *Turnover* were therefore
  **removed from the form** rather than shipped as inputs that silently do
  nothing — three of the ten fields could not match a single record. If such
  records are added later, the fields belong back.
- Sector-agnostic records (10 of 59) apply everywhere and are ranked slightly
  below a sector-specific match rather than above it.
- **61 of 83 sectors map to exactly one scheme**, and there are near-duplicate
  labels (`Agriculture` / `Agritech` / `Agriculture Biotechnology`, `Space` /
  `Satellite` / `Launch`). The picker therefore opens and closes like the
  *State / UT* dropdown, shows 22 sectors by default (those reaching 2+ schemes),
  and keeps the other 61 behind a **Show all** toggle. Nothing is removed: a
  selected sector is never collapsed out of reach, typing in the filter shows
  matches regardless of the collapse, and all 83 remain selectable.

## Notes

- Matching is guidance only — always verify eligibility on the official
  source linked on each scheme card.
- Business Stage and Business / Beneficiary Type are free-text fields with
  auto-suggestions and live validation: a value that is not in the dataset
  shows the closest real values, and a zero-result search explains which input
  was unrecognised.
- Search is token-AND across name, ministry, scheme type, objective, sectors,
  tags, benefit types, beneficiaries and body text, so `loan for startup` and
  `msme loan` both work.
- Results are **paged**, 9 to a page: *Previous* / `Page 2 of 7 · schemes 10–18
  of 59` / *Next*. Pages replace each other rather than accumulating, so the
  result count and card order stay put while you page. `Previous` is disabled on
  page 1 and `Next` on the last page, the whole control hides when a filter
  leaves a single page, and any change to the result set — a new search, a
  filter, a new match run — returns you to page 1. Out-of-range requests clamp
  instead of rendering a blank grid, and paging scrolls back to the top of the
  results.
- **Saved schemes** live in `localStorage`. The navbar `Saved` link switches the
  results grid into saved mode (`showSaved()` → `currentMode = "saved"`), so the
  shortlist appears **in** Browse Schemes rather than as a second copy of the
  page below it. Browse and Saved are two views of one grid, so both hide the
  search box and the filters: searching or filtering a personal shortlist is not
  what those controls mean, and a leftover query cannot silently narrow it.
  `saveScheme()` used to write to storage with no way to read the list back — you
  could save things and never retrieve them — so the list renders on every
  result-set change, and the same pager applies, so a long shortlist pages
  instead of running off the page. Saved cards are drawn by the same
  `schemeCardHtml()` as result cards, so a saved scheme can never drift from how
  it looks in the results, and a saved scheme is **not** given a match
  percentage, because it was never scored against a profile. Saved ids are kept
  across visits; if the dataset is later updated and an id disappears, the
  banner lists it as *no longer in the current dataset* with a button to remove
  it, rather than being silently dropped or counted as a result. Clearing is
  confirmed, and the UI states plainly that this is browser-local storage —
  nothing is uploaded.
- **Compare** works from the shortlist. In the `Saved` list every card carries a
  real `Compare` checkbox, wired to the same `toggleCompare()` the details modal
  uses, so you can pick schemes to weigh up without opening each one. Picked
  cards get a `.selected` highlight; the state classes come from JS rather than
  a parent selector, so the styling does not depend on `:has()` support.
  Browse and match cards deliberately do **not** carry the checkbox — 59 of them
  would be noise, and compare is still one click away in a scheme's details.
  The limit of 3 is enforced in the control itself: a 4th unchecked box is
  `disabled` and labelled `Compare (3 selected)`, so a full list never
  swallows a click silently. The floating bar distinguishes 1 selection
  (*tick one more to compare*, and no link at all) from 2 or more.
- **The comparison is its own page**, `compare.html`, opened in a new tab rather
  than appended below the results — comparing used to push the rest of the site
  down and lose your place in the list. The link is a real
  `<a target="_blank">`, not `window.open`, so browsers do not block it as a
  popup and it stays middle-clickable, ctrl-clickable and keyboard-operable.
  Scheme ids travel in `?ids=IN-002,IN-003`, so the tab is reloadable and
  bookmarkable; `localStorage` is only a fallback for someone opening
  `compare.html` directly. It offers a **Highlight differences** toggle that
  hides the rows where every selected scheme says the same thing. Text is
  deliberately **not** truncated — a comparison exists to show the difference
  between two schemes, so clipping it would hide exactly what you opened the tab
  to read. An id that has left the dataset is disclosed on that page too, so
  the column count and the sub-line can never quietly disagree.
- `js/util.js` holds the helpers both pages need — `esc`, `escJs`, `truncate`,
  `hasAmount`, `statusGroup`. They were extracted rather than copied, because a
  second copy of `esc()` would eventually drift and the page that drifted would
  be the one rendering unescaped scheme names. `compare.js` deliberately does
  **not** re-implement `accessRoute()` or the eligibility matcher: those rules
  live in `app.js` and are shown on the scheme cards and in the details modal.
- Save / Compare use `localStorage`.
