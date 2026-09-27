/* Side-by-side comparison, on its own page.
   The schemes come from the URL (?ids=IN-002,IN-003) so this tab is a real,
   reloadable page rather than a fragment of the main one. localStorage is only
   a fallback for someone opening compare.html directly. */

/* Rows are plain dataset fields plus two shared derivations. Deliberately no
   scoring or matching logic here: accessRoute() and the eligibility matcher
   stay in app.js, because a second copy of those rules would drift and the
   comparison would then quietly disagree with the cards. */
const ROWS = [
  ["Scheme type",              s => s.scheme_type],
  ["Ministry / Department",    s => s.ministry_department],
  ["Status",                   s => s.status],
  ["Government level",         s => s.government_level],
  ["Last verified",            s => s.last_verified],
  ["Amount stated",            s => hasAmount(s) ? "Yes — see financial assistance" : "No amount in the dataset"],
  ["Financial assistance",     s => s.financial_benefit],
  ["Repayment",                s => s.repayment_required],
  ["Target beneficiaries",     s => s.target_beneficiaries.join(", ")],
  ["Sectors",                  s => s.sectors.join(", ")],
  ["Startup stages",           s => s.startup_stages.join(", ")],
  ["Key benefits",             s => s.key_benefits],
  ["Eligibility",              s => s.eligibility],
  ["Application process",      s => s.application_process],
  ["Documents required",       s => s.documents],
  ["How to apply",             s => s.application_url]
];

const $ = id => document.getElementById(id);
const SCHEMES = Array.isArray(window.SCHEMES_DATA) ? window.SCHEMES_DATA : [];

function requestedIds(){
  const q = new URLSearchParams(location.search).get("ids") || "";
  if(q) return q.split(",").map(s => s.trim()).filter(Boolean);
  /* Opened directly, with no ids in the URL: fall back to what was ticked. */
  try { return JSON.parse(localStorage.getItem("yojanaCompare") || "[]"); }
  catch(e){ return []; }
}

let schemes = [];   /* resolved records */
let missing = [];   /* ids that are no longer in the dataset */

function resolve(){
  const ids = requestedIds();
  schemes = []; missing = [];
  ids.forEach(id => { const s = SCHEMES.find(x => x.id === id); s ? schemes.push(s) : missing.push(id); });
  return ids.length;
}

function renderMissing(){
  const box = $("compareMissing");
  if(!missing.length){ box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<strong>${missing.length} selected scheme${missing.length===1?" is":"s are"} no longer in the current dataset</strong>, so `+
    `${missing.length===1?"it cannot":"they cannot"} be compared. It was ticked before the data was updated. `+
    missing.map(id => `<span class="stale-chip">${esc(id)}</span>`).join(" ");
}

function renderTable(){
  const el = $("compare");
  el.innerHTML = `<table><thead><tr><th scope="col">Feature</th>`+
    schemes.map(s => `<th scope="col">${esc(s.scheme_name)}</th>`).join("")+
    `</tr></thead><tbody>`+
    ROWS.map(([label,get]) => {
      const vals = schemes.map(s => String(get(s) == null ? "" : get(s)).trim());
      /* "Differences" compares what is shown, so a row where every scheme says
         the same thing is the one you can safely skip. */
      const differs = new Set(vals).size > 1;
      return `<tr class="${differs?"differs":"same"}"><th scope="row">${esc(label)}</th>`+
        schemes.map((s,i) => {
          const v = vals[i];
          if(label === "How to apply")
            return `<td><a class="btn btn-gold" href="${esc(v)}" target="_blank" rel="noopener">Apply ↗</a></td>`;
          /* Deliberately not truncated. A comparison exists to show the
             difference between two schemes, so clipping the text would hide
             exactly the thing the user opened this tab to read. The table
             scrolls sideways instead. */
          return `<td>${esc(v)}</td>`;
        }).join("")+`</tr>`;
    }).join("")+
    `</tbody></table>`;
}

function render(){
  const ids = requestedIds();
  resolve();
  const n = ids.length;
  $("compareSub").textContent = n
    ? `${n} scheme${n===1?"":"s"} selected — ${n>1?"compared side by side":"one scheme is not a comparison, tick more on the previous tab"}.`
    : "";
  $("asAt").textContent = SCHEMES.length ? (SCHEMES[0].last_verified || "the last recorded update") : "an unknown date";
  $("colCount").textContent = schemes.length
    ? `${schemes.length} column${schemes.length===1?"":"s"} · ${ROWS.length} features`
    : "";
  $("diffRowsBtn").hidden = schemes.length < 2;
  renderMissing();
  renderTable();
}

/* "Highlight differences" hides rows where every selected scheme says the same
   thing. They are hidden, not dimmed, because a row that is identical across
   all columns cannot help you choose between the schemes. */
$("diffRowsBtn").addEventListener("click", function(){
  const on = this.dataset.on !== "1";
  this.dataset.on = on ? "1" : "0";
  this.textContent = on ? "Show all rows" : "Highlight differences";
  document.querySelectorAll("#compare tr.same").forEach(tr => { tr.hidden = on; });
});

render();
