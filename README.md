# Yojana Setu — Government Startup Scheme Finder

A dataset-driven tool for finding and matching Indian Central-Government
startup schemes against a startup's profile.

## Project structure

```
index.html        Page structure (HTML)
css/styles.css    All styles
js/app.js         Matching engine, filters, search, save/compare, modal
data/schemes.js   Scheme dataset (59 records) as a plain script
serve.bat         Optional one-click local server (Windows)
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

## Notes

- Matching is guidance only — always verify eligibility on the official
  source linked on each scheme card.
- State, turnover, funding, age and gender inputs are marked as
  "reference inputs": the dataset is Central-government and applies
  nationwide, so those fields only give small, transparent score nudges
  (e.g. equity/credit preference, early- vs growth-stage fit).
- Business Stage and Business / Beneficiary Type are free-text fields with
  auto-suggestions — you can type any value, and matching is
  case-insensitive and partial.
- Save / Compare use `localStorage`.