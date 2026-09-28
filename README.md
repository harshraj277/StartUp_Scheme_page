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
| `tests/contract.test.js` | Every `getElementById` and inline handler resolves, no dead markup or dead CSS, no facet asked in two places, label/alt wiring, dataset field shape, the section band order, computed WCAG ratios for every text/background pair on the hero and both bands, and that no rule is implemented twice across the two pages |
| `tests/e2e.test.js` | Boots the real `app.js` in a stub DOM and drives it as a user would — including paging forward and back through the whole result set, and ticking saved schemes to compare |
| `tests/compare.test.js` | Boots the real `js/compare.js` the way the main page boots: ids from the query string, the localStorage fallback, orphan disclosure, escaping, and the differences toggle |

## Hero and section backgrounds

The page reads as a stack of bands rather than one long light page.

- **The hero is navy, not white.** It was a pale `#f8fbff → #eef4fb` gradient
  with dark text. It is now the logo's navy with a gold bloom behind the mark, a
  dotted wash over the top, and a large gold ring running off the top-right
  corner. All three are decoration: they sit on `::before`/`::after` behind the
  content (`.hero .container{z-index:1}`), and both slow rotations stop under
  `prefers-reduced-motion: reduce`.
- **One gold call to action, not two solid buttons.** `Find My Schemes` is
  `.btn-hero` — the brand gold, with a lift on hover. `Browse All Schemes` is
  `.btn-ghost`, outlined in translucent white and turning gold on hover. Two
  filled buttons side by side compete and neither reads as the primary one.
  `.btn-primary` is navy and was left alone, because the navbar already
  overrides it to gold inside the bar and the two must not both be "the gold
  button" for different reasons.
- **The Devanagari line is ours, not a copy.** `आपके स्टार्टअप के लिए सरकारी
  योजनाएँ`, in `--gold-soft`, `lang="hi"` — it echoes the bilingual wordmark
  already in the navbar rather than repeating it.
- **The mark is a white disc, not a cropped circle.** `img/logo.webp` is an
  opaque square WebP with no alpha channel, so `border-radius:50%` on the image
  would slice the artwork. The disc is on `.hero-mark`; the image sits inside it
  with `object-fit:contain` and keeps its own rectangle. The image is
  `alt="" aria-hidden="true"` — the site's name is in the navbar directly above.
- **The hero is two columns** — copy left, mark right — and collapses to one at
  **920px**, where the mark is hidden rather than squeezed. `.hero-copy` also
  carries `min-width:0`, without which a grid item refuses to shrink below its
  content and forces the column wider than its share.
- **Sections alternate navy / white down the page**: hero (navy) → stats
  (white) → form (navy) → results (white) → categories (navy) → how-it-works
  (white) → why (navy). The band is a class on each `<section>`, not
  `:nth-of-type`: the order is a content decision, and `:nth-of-type` would
  silently repaint every section below whenever one is inserted or removed. The
  form section's own flat `#09264a` was removed so it takes the shared gradient —
  beside the hero's it was a visible seam.
- **Cards stay white on both bands.** That is what makes a band read as a band
  rather than as a dark page; only the type on the band changes colour.
  Conversely, a white card on a *white* section is only its 1px border, so the
  light bands get a deeper edge (`#d5e1ef`) and a real shadow.
- **Two contrast regressions the bands introduced, both fixed and pinned:**
  - `.scheme-card.blocked` tinted itself warm to flag a missing prerequisite.
    On a white band that near-white tint erased the flag, so the light band
    restates it as `#fffaf2` with a `#f0dcbb` edge.
  - `.ref-note` paints its own light fill, so it keeps dark text on a light box
    **even on a navy band**. It is deliberately excluded from the band's light
    text — that would have put `#9db2d0` on `#f7fafc`. Separately its `#7b8ba1`
    was only 3.31:1 on its own fill, so it is now `#5f7089` at 4.81:1.
  - **White cards inherited the band's white text.** This one is the reason the
    first two were worth looking for. `.band-navy` sets `color:#fff` on the
    section, and colour is inherited, so a white card that did not declare its
    own ink rendered white-on-white: the explore tile's `<strong>` and the feature
    card's `<h3>`. The fix is `.band-navy .find-box,.band-navy .explore-tile,
    .band-navy .feature{color:var(--ink)}` — deliberately *not* a blanket
    `.band-navy h2,.band-navy h3` rule, which would have recreated the same bug
    one level down.

Every text/background pair on the new surfaces is asserted at ≥4.5:1 in
`tests/contract.test.js`, with the ratio computed from the colours in the
stylesheet so a colour change cannot leave the assertion describing the old
design.

The white-on-white case is guarded structurally instead, because it is a whole
class of bug rather than one line: a test walks each navy band, works out which
cards it actually holds (reading `app.js` per function so a JS-rendered grid is
attributed to the section that owns its container, not to all of them), and
requires every white-filled card among them to declare its own `color`. Two
things it has to get right, both of which were wrong in the first draft and both
of which were caught by deleting the fix and watching the test go red: the class
must be the **last compound** of a selector (`.explore-tile span` says nothing
about the tile's own text), and the property must match at a **declaration
boundary** (`includes("color:")` happily matches `border-color:`).

## Desktop layout

Overflow and fixed widths are what actually makes a page "not fit", so the ones
that bit are pinned down by contract tests:

- The container is **full width** with a small fluid gutter,
  `width:100%;padding-inline:clamp(16px,3vw,40px)`. It used to be
  `min(1320px, 92%)`, which on a wide monitor held the content in the middle
  with two empty margins either side. Because nothing now caps the width,
  anything that must not stretch carries its own cap instead — the hero copy
  (840px), the hero lead paragraph (`56ch`), each section heading (760px), the
  match form (1000px), footer paragraphs (`62ch`) and the step/feature copy
  (`64ch`). The card grids and the compare table deliberately have no cap; that
  is what should use the room.
- The nav hands over to the hamburger at **1080px**. Six links plus the
  call-to-action need roughly 880px, so at 1000px there was under 50px of slack —
  a slightly wider system font made the labels wrap and the header grow taller
  than its own `min-height`. `.navlinks a` is now `white-space:nowrap`, so a label
  cannot break in two.
- The nav breakpoint is its own media query. It used to carry the result-column
  counts with it, so fixing the nav would have silently halved the results grid.
- The results grid is 5-up at ≥1800px, 4-up at 1440–1799px, 3-up at
  1081–1439px, 2-up at 761–1080px, 1-up below. Four columns across a 27" screen
  left ~600px cards, so the extra width buys a fifth column instead.
- Business Stage and Business / Beneficiary Type were both `<input list>` +
  `<datalist>`, which is why they looked like text boxes: a browser only opens a
  datalist popup once you have typed a character and draws no arrow to invite you.
  They are two different controls now, because a multi-select and a single-select
  cannot both be "a dropdown like State / UT".
  - **Business Stage is a plain `<select>`**, like State / UT and the advanced
    filters. One answer, so one line and a native dropdown. Each option carries its
    scheme count — `Early Stage (45)`, `Pilot (1)` — and the `.value` is the bare
    dataset string, which is what the matcher compares. Labels are set with
    `textContent`, never `esc()`: `esc()` is for building HTML strings, and
    applying it to a text node displayed the entities themselves, so the stage
    option read `R&amp;D (3)` instead of `R&D (3)`.
  - **Business / Beneficiary Type is a button and a checkbox panel**, the same
    shape as the Industry / Sector field below it. It needs several answers, and a
    `<select multiple>` cannot give them a real collapsed state, so it is the one
    multi-pick field that is not a list box. The reasoning, because each part was a
    separate failure:
    - `<select multiple size="7">` **never collapsed**. Any `size` above 1 renders
      as a permanently open list box, so the control had no expanded state at all —
      the original ask was "similar to State / UT, control and expand", and a native
      multi-select cannot satisfy it.
    - On a desktop, **a plain click replaced the selection** instead of adding to
      it unless Ctrl/Cmd was held. The old note had to spell out "Ctrl / Cmd-click",
      which is not guessable and does not exist on a touch screen, so the same
      control silently behaved differently by device and the desktop path lost picks
      without saying so. A checkbox per row is the same multi-select semantics with
      no modifier at all: a click always toggles.
    - 76 values, **74% of which reach exactly one scheme**, in a 7-row window with
      no filter, and the near-duplicates sit alphabetically adjacent
      ("Biotech innovators" (2) next to "Biotech companies/startups" (1)). So the
      panel filters, and its count line says how much of the list is a one-off.
    - Two controls in one form both labelled "(select one or more)" have to behave
      the same way, so the panel class is `.picker-panel`, shared with the sector
      field. It was `.sector-panel`, and a class named for one field is a class
      waiting to be applied wrongly.
  - `eligBeneficiaries`, a `Set`, is the selection. The tick in the list is
    **derived** from it on every render, so the list and the profile are one fact
    read twice and cannot drift. The old `<select>` kept them as separate sources
    of truth held in step by a `change` listener; every mutator now re-syncs
    explicitly and each is pinned.
  - **A picked row is never hidden by the filter.** If searching could make your
    own pick vanish you would lose track of what you had chosen and have no way to
    untick it without clearing the filter and searching again. The count line says
    when it is holding a pick open, rather than quietly doing it.
  - The picks are echoed in words under the control, with a **Clear** button, and
    the closed button names the **top ticked row of the list** rather than whichever
    was clicked first — the list is alphabetical, so anything else would disagree
    with what you just looked at.
  - It opens and closes on the button, on **Escape**, and on a click anywhere
    outside it. The outside-click close is a document listener and it excludes both
    the button and the panel, or the click that opened the picker would close it
    again on the way up. **The sector field never had this** and got it at the same
    time; both are driven through `document.dispatch` in the e2e suite.
  - Scoring mirrors the sector field: 20 points for a match, +3 for each further
    picked type the scheme actually lists, capped at +6. Without that, a scheme
    listing two of your picks could rank below one listing a single pick, so
    adding a second selection could only push a real match down.
  - It stays a normal grid cell. The form is a 2-column grid with an even number
    of half-width fields; spanning this one `1/-1` would push it onto a new row
    and leave an empty cell beside Business Stage. The panel is a half column
    wide on desktop and the full width below the one-column breakpoint.
  - The white list sits inside the navy `find` band, so `.pick-list` and
    `.picker-panel` declare their own ink rather than trusting `.find-box` two
    levels up. `.pick-list` is in the contract suite's white-on-white band scan for
    the same reason: that inheritance is what would turn every row invisible the day
    the panel is moved out of the form card.
- A `<select>` cannot hold a value outside the dataset, so the "not a dataset
  value" hint under each field went with the free-text inputs, as did the two
  empty-result tips about it. `resolveAgainst()` stays wired in for Business
  Stage; the picker needs no fuzzy pass because every row it can hold is a dataset
  value.
- `resetForm()` clears the picker's `Set` and re-renders, rather than unticking
  boxes one at a time. The tick is derived from the `Set` at render time, so
  rebuilding is the only way to be sure the boxes and the profile agree.
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
- Business Stage is a single-choice dropdown and Business / Beneficiary Type is a
  multi-pick panel, both populated from the dataset, so neither can hold a value
  that is not a real one. A trade-off: the dataset has no women-specific,
  age-specific or turnover-specific beneficiary value at all, so a founder who is
  one of those has no option to pick and no way to say so — the fields cannot
  express what the data does not contain.
- Beneficiary Type is 76 near-duplicate labels for 59 schemes, **74% of them
  reaching a single scheme** ("Biotech startups", "Biotech startups indirectly",
  "Biotechnology startups", "Biotech companies/startups" are four rows). The
  per-row scheme counts and the filter box exist to make that visible rather than to
  hide it; the near-duplicates themselves are a data-cleaning problem, not a UI one.
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
