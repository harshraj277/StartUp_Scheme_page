
let SCHEMES = Array.isArray(window.SCHEMES_DATA)?window.SCHEMES_DATA:[];

/* ============================================================
   Derived helpers — everything computed from the dataset,
   never hardcoded or fabricated.
   ============================================================ */

const FUNDING_BENEFIT_TYPES = ["Grant","Seed funding","R&D funding","R&D support","Credit guarantee","Credit-linked subsidy","Equity investment","Equity investment indirectly","Fellowship","Prototype support"];

/* Requested-funding bands. Keys must match the <option> text in index.html exactly. */
const FUNDING_BANDS = {
  "₹0–₹5 lakh":[0,500000],
  "₹5–₹25 lakh":[500000,2500000],
  "₹25 lakh–₹1 crore":[2500000,10000000],
  "₹1 crore+":[10000000,Infinity]
};

/* Derived "support type" buckets for the Browse filter (replaces the old dead
   "Application Mode" control, which no dataset field could ever satisfy). */
const SUPPORT_BUCKETS = [
  {key:"grant",     label:"Grants & seed funding",           test:s=>s.benefit_type.some(b=>/grant|seed funding|r&d funding|r&d support|prototype support|fellowship/i.test(b))},
  {key:"credit",    label:"Credit, loans & guarantees",      test:s=>s.benefit_type.some(b=>/credit|bank credit|loan/i.test(b))},
  {key:"equity",    label:"Equity & investment",             test:s=>s.benefit_type.some(b=>/equity|investment/i.test(b))},
  {key:"incubation",label:"Incubation & infrastructure",     test:s=>s.benefit_type.some(b=>/incubation|infrastructure|common facility/i.test(b))},
  {key:"mentoring", label:"Mentoring & training",            test:s=>s.benefit_type.some(b=>/mentor|training|capacity building|skill/i.test(b))},
  {key:"market",    label:"Market access & procurement",     test:s=>s.benefit_type.some(b=>/market|procurement|branding/i.test(b))},
  {key:"ipr",       label:"IPR & regulatory",                test:s=>s.benefit_type.some(b=>/ipr/i.test(b))}
];

/* ---------- how you can actually REACH a scheme ----------
   Several schemes are not applied for directly: the application has to go
   through a participating incubator, an AIC, or a programme partner. That is
   the single most common blocker for a first-time founder, and the eligibility
   text states it plainly ("Apply through participating NIDHI incubators").
   Derived purely from each record's own eligibility / process wording — a
   record is only treated as routed when its own text says so. */
const VIA_INCUBATOR_RE = /((apply|application|applications|submit|submission|approach)[\w\s,–-]{0,45}?(through|to|via|at)?\b[^.|]{0,45}?(incubator|incubation cent(?:re|er)|AICs?\b))|(through (participating )?(NIDHI|TIDE|STPI|BIRAC|a )?(incubators?|incubation cent(?:re|er)s?))|(selected through supported TIDE incubation)|(startups? approach relevant AICs)/i;
const VIA_PARTNER_RE   = /through (designated |notified )?(programme partners?|implementing agencies|partners?\/calls|partners?)/i;

/* "viaIncubator" | "partner" | "direct" */
function accessRoute(s){
  const t=[s.eligibility,s.application_process,s.primary_objective].join(" | ");
  if(VIA_INCUBATOR_RE.test(t)) return "viaIncubator";
  if(VIA_PARTNER_RE.test(t))   return "partner";
  return "direct";
}
const ACCESS_ROUTE_LABEL = {
  direct:      "apply directly (portal or public notice)",
  viaIncubator:"apply through a participating incubator",
  partner:     "apply through a programme partner or implementing agency"
};

function repayCategory(s){
  const t=(s.repayment_required||"").toLowerCase();
  if(t.includes("non-repayable")||t.includes("not applicable")||t.includes("not a startup loan")||t.includes("generally non")) return "Non-repayable / Not applicable";
  if(t.includes("repayable to the lender")||(t.includes("loan")&&!t.includes("not a"))) return "Loan-linked (repayable)";
  if(t.includes("equity")||t.includes("investment")) return "Equity / Investment-based";
  return "Depends on instrument";
}
function isFundingScheme(s){return s.benefit_type.some(b=>FUNDING_BENEFIT_TYPES.includes(b)) || /fund/i.test(s.scheme_type);}
function blob(s){
  return (s.scheme_name+" "+s.short_name+" "+s.scheme_type+" "+s.key_benefits+" "+s.eligibility+" "+
    s.tags.join(" ")+" "+s.target_beneficiaries.join(" ")+" "+s.benefit_type.join(" ")+" "+s.search_text).toLowerCase();
}
/* Wider haystack used by search only — includes every long-text field. */
function haystack(s){
  return [s.scheme_name,s.short_name,s.scheme_type,s.ministry_department,s.primary_objective,s.key_benefits,
    s.eligibility,s.financial_benefit,s.repayment_required,s.documents,s.application_process,s.selection_method,
    s.tags.join(" "),s.target_beneficiaries.join(" "),s.sectors.join(" "),s.benefit_type.join(" "),
    s.startup_stages.join(" "),s.search_text].join(" ").toLowerCase();
}
/* ---------- fuzzy free-text matching (fixes "typo => zero results") ---------- */
function normText(t){return String(t==null?"":t).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function levenshtein(a,b){
  a=a||""; b=b||"";
  const m=a.length,n=b.length;
  if(!m) return n; if(!n) return m;
  let prev=new Array(n+1), cur=new Array(n+1);
  for(let j=0;j<=n;j++) prev[j]=j;
  for(let i=1;i<=m;i++){
    cur[0]=i;
    for(let j=1;j<=n;j++){
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    const t=prev; prev=cur; cur=t;
  }
  return prev[n];
}
function closeEnough(input,candidate){
  const a=normText(input), b=normText(candidate);
  if(!a||!b) return false;
  if(a===b) return true;
  if(Math.min(a.length,b.length)<3) return false;      // don't let "r" match everything
  if(a.includes(b)||b.includes(a)) return true;
  const d=levenshtein(a,b);
  return d<=Math.max(1,Math.floor(Math.max(a.length,b.length)*0.34));
}
function resolveAgainst(raw,list){
  raw=String(raw||"").trim();
  if(!raw) return {value:"",exact:true};
  const n=normText(raw);
  const exact=list.find(v=>normText(v)===n);
  if(exact) return {value:exact,exact:true};
  const close=list.find(v=>closeEnough(raw,v));
  if(close) return {value:close,exact:false};
  return {value:"",exact:false};
}

/* ---------- money parsing (makes the "Funding Required" field real) ---------- */
const AMOUNT_RE=/₹\s*([\d,]+(?:\.\d+)?)\s*(crores?|lakhs?|lacs?|thousand|k)?/gi;
function parseMaxRupees(text){
  let max=null, m;
  const src=String(text==null?"":text);
  AMOUNT_RE.lastIndex=0;
  while((m=AMOUNT_RE.exec(src))!==null){
    const n=parseFloat(String(m[1]).replace(/,/g,""));
    if(!isFinite(n)) continue;
    const u=(m[2]||"").toLowerCase();
    let mult=1;
    if(u.indexOf("crore")===0) mult=10000000;
    else if(u.indexOf("lakh")===0||u.indexOf("lac")===0) mult=100000;
    else if(u==="thousand"||u==="k") mult=1000;
    const v=n*mult;
    if(max===null||v>max) max=v;
  }
  return max;
}
function fmtRupees(v){
  if(v===null||v===undefined) return "—";
  if(v>=10000000){const x=v/10000000;return "₹"+(Number.isInteger(x)?x:x.toFixed(1))+" crore";}
  if(v>=100000){const x=v/100000;return "₹"+(Number.isInteger(x)?x:x.toFixed(1))+" lakh";}
  return "₹"+v.toLocaleString("en-IN");
}

/* ---------- Explore categories — counts calculated live ---------- */
const EXPLORE_CATEGORIES = [
  {key:"central",icon:"🏛️",label:"Central Government Schemes",note:"All schemes currently in this dataset",test:s=>s.government_level==="Central"},
  {key:"state",icon:"📍",label:"State Government Schemes",note:"Not yet included in this dataset",test:s=>false},
  {key:"funding",icon:"💰",label:"Startup Funding",note:"Grants, seed &amp; fellowship support",test:s=>isFundingScheme(s)},
  {key:"loans",icon:"🏦",label:"Loans &amp; Financial Assistance",note:"Credit guarantees &amp; credit-linked support",test:s=>s.benefit_type.some(b=>/credit/i.test(b))||/credit/i.test(s.scheme_type)},
  {key:"subsidy",icon:"🧾",label:"Subsidies",note:"Subsidy-linked support",test:s=>blob(s).includes("subsidy")},
  {key:"tax",icon:"📑",label:"Tax Benefits",note:"Tax-related facilitation",test:s=>blob(s).includes("tax")},
  {key:"incubation",icon:"🧪",label:"Incubation &amp; Mentorship",note:"Incubation, mentoring &amp; acceleration",test:s=>s.benefit_type.some(b=>/incubation|mentor|accelerat/i.test(b))},
  {key:"women",icon:"👩‍💼",label:"Women Entrepreneurs",note:"Not yet tagged in this dataset",test:s=>/\bwomen\b|\bwoman\b/i.test(blob(s))},
  {key:"student",icon:"🎓",label:"Student / Youth Entrepreneurs",note:"Student &amp; young-innovator support",test:s=>s.target_beneficiaries.some(b=>/student/i.test(b))||blob(s).includes("student")},
  {key:"msme",icon:"🏭",label:"MSME Schemes",note:"MSME &amp; Udyam-linked support",test:s=>s.sectors.includes("MSME")||s.target_beneficiaries.some(b=>/msme/i.test(b))||/msme/i.test(s.ministry_department)},
  {key:"innovation",icon:"💡",label:"Innovation &amp; Technology",note:"Deep tech, AI &amp; emerging tech",test:s=>s.sectors.some(x=>["Technology","Deep Tech","AI","Emerging Technology","ICT","Software","IoT","Robotics"].includes(x))},
  {key:"manufacturing",icon:"⚙️",label:"Manufacturing",note:"Industrial &amp; production sectors",test:s=>s.sectors.includes("Manufacturing")},
  {key:"agri",icon:"🌾",label:"Agriculture &amp; Rural Entrepreneurship",note:"Agri, agritech &amp; rural innovation",test:s=>s.sectors.some(x=>["Agriculture","Agritech","Agriculture Biotechnology"].includes(x))||s.target_beneficiaries.some(b=>/rural|fpo/i.test(b))}
];

/* ---------- state ---------- */
let saved = JSON.parse(localStorage.getItem("yojanaSaved")||"[]");
let compareList = JSON.parse(localStorage.getItem("yojanaCompare")||"[]");
/* Three is the cap because the compare table is a row-per-feature grid; past
   that the columns get too narrow to read on a laptop. */
const COMPARE_MAX = 3;
let currentMode = "browse"; // "browse" | "match" | "saved"
let currentResults = SCHEMES.slice();
let quickFilterKey = "";
let eligSectors = new Set();    // sectors selected in the "Find My Schemes" form
let eligProfile = null;
let currentPage = 1;           // 1-based; results are paged, not appended
let emptyHint = "";
const PAGE_SIZE = 9;

/* Dataset vocabularies, filled by initControls() before any scoring runs. */
let ALL_STAGES=[], ALL_SECTORS=[], ALL_BENEFICIARIES=[];

/* ---------- init / populate dynamic controls ---------- */
function uniqueValues(key,isArray){
  const c=new Map();
  SCHEMES.forEach(s=>{
    const vals = isArray ? s[key] : [s[key]];
    vals.forEach(v=>c.set(v,(c.get(v)||0)+1));
  });
  return [...c.entries()].sort((a,b)=>b[1]-a[1]);
}
function fillSelect(id, entries, {sortAlpha=false}={}){
  const el=document.getElementById(id);
  if(!el) return;
  let arr=entries.slice();
  if(sortAlpha) arr.sort((a,b)=>a[0].localeCompare(b[0]));
  /* textContent is a text node, so it needs no escaping — esc() belongs on the
     paths that build an HTML string, and applying it here displayed the entities
     themselves: the stage option read "R&amp;D (3)" instead of "R&D (3)". A
     value containing "<" or "&" can only ever be text this way, never markup. */
  arr.forEach(([v,c])=>{
    const o=document.createElement("option");
    o.value=v; o.textContent=`${v} (${c})`;
    el.appendChild(o);
  });
}
/* Business Stage and Beneficiary Type are plain <select> elements, like State /
   UT and the advanced filters. They were free-text inputs with a <datalist>,
   which is why they looked like text boxes: browsers only open a datalist
   popup once you have typed a character, and draw no arrow to invite you. */
/* Advanced filters keep only the facets the match form cannot express.
   Sector, stage, beneficiary and support type were removed from here because the
   match form already owns them, and the search box narrows by all four
   identically — so they were the same question asked twice. */
function initControls(){
  document.getElementById("dashVerified").textContent = SCHEMES[0]?.last_verified || "—";
  document.getElementById("trustCount").textContent = SCHEMES.length;
  document.getElementById("trustMinistries").textContent = new Set(SCHEMES.map(s=>s.ministry_department)).size;
  document.getElementById("heroBadge").textContent = `🇮🇳 ${SCHEMES.length} Central Government Startup Schemes`;

  const stageEntries = uniqueValues("startup_stages",true);
  const sectorEntries = uniqueValues("sectors",true);
  const beneficiaryEntries = uniqueValues("target_beneficiaries",true);
  const ministryEntries = uniqueValues("ministry_department",false);
  const typeEntries = uniqueValues("scheme_type",false);

  ALL_STAGES = stageEntries.map(e=>e[0]);
  ALL_SECTORS = sectorEntries.map(e=>e[0]);
  ALL_BENEFICIARIES = beneficiaryEntries.map(e=>e[0]);

  /* Alphabetical, like the advanced filters, and each option carries how many
     schemes reach it. Beneficiary has 76 near-duplicate values across 59
     schemes, so "Pilot (1)" has to be visibly different from "Startups (16)". */
  fillSelect("stage", stageEntries, {sortAlpha:true});
  fillSelect("business", beneficiaryEntries, {sortAlpha:true});
  fillSelect("fMinistry", ministryEntries, {sortAlpha:true});
  fillSelect("fType", typeEntries, {sortAlpha:true});

  /* Government Level used to be a filter here. Every record in the dataset is
     Central-government, so it could never remove anything — say so instead of
     shipping a control that does nothing. */
  const govEl=document.getElementById("govLevelNote");
  if(govEl){
    const levels=[...new Set(SCHEMES.map(s=>s.government_level))];
    govEl.textContent = levels.length===1
      ? `A Government Level filter was removed: all ${SCHEMES.length} records are ${levels[0]}-government, so it could not narrow anything.`
      : "";
  }

  /* The same buckets drive the matcher's "Support Type" field — it is the only
     support-type control now, so it is filled once here. */
  const matchSup=document.getElementById("support");
  if(matchSup) SUPPORT_BUCKETS.forEach(b=>{const o=document.createElement("option");o.value=b.key;o.textContent=b.label;matchSup.appendChild(o);});

  /* ALL sectors are offered (was: top 14, which hid 9 schemes entirely), but the
     list is collapsed by default — see applySectorChips(). */
  const chipsEl=document.getElementById("sectorChips");
  chipsEl.innerHTML = sectorEntries.map(([v,c])=>
    `<button class="chip" type="button" data-sector="${esc(v)}" data-count="${c}" onclick="toggleEligSector('${escJs(v)}')">${esc(v)} <span class="dash-mini" style="display:inline">(${c})</span></button>`).join("");
  document.getElementById("sectorToggleBtn").addEventListener("click", toggleSectorList);
  document.getElementById("sectorPickerBtn").addEventListener("click", toggleSectorPanel);
  applySectorChips();
  syncSectorPanel();

  /* Be explicit about how much of the dataset a reference field can actually see. */
  const fundEl=document.getElementById("fundCoverage");
  if(fundEl){
    const n=SCHEMES.filter(s=>parseMaxRupees(s.financial_benefit)!==null).length;
    fundEl.textContent = n
      ? `Funding Required can only be matched against the ${n} of ${SCHEMES.length} records that state a specific rupee amount — the other ${SCHEMES.length-n} say “as per current guidelines”, so they get no funding bonus.`
      : "";
  }

  /* Same disclosure for the access route: say how many records are not direct. */
  const accEl=document.getElementById("accessCoverage");
  if(accEl){
    const via=SCHEMES.filter(s=>accessRoute(s)==="viaIncubator").length;
    const viaPartner=SCHEMES.filter(s=>accessRoute(s)==="partner").length;
    accEl.textContent = `${via + viaPartner} of ${SCHEMES.length} records are not applied for directly: ${via} go through a participating incubator or centre, ${viaPartner} through a programme partner. You can still see them — they are flagged, not hidden.`;
  }

  renderStats();
  renderExplore();
}

function renderStats(){
  const total=SCHEMES.length;
  const central=SCHEMES.filter(s=>s.government_level==="Central").length;
  const stateCount=SCHEMES.filter(s=>s.government_level!=="Central").length;
  const funding=SCHEMES.filter(isFundingScheme).length;
  const subsidy=SCHEMES.filter(s=>blob(s).includes("subsidy")).length;
  const support=SCHEMES.filter(s=>s.target_beneficiaries.some(b=>/startup/i.test(b))||/startup/i.test(s.scheme_type)).length;
  const ministries=new Set(SCHEMES.map(s=>s.ministry_department)).size;
  const active=SCHEMES.filter(s=>statusGroup(s)==="Active").length;
  const stats=[
    [total,"Total Schemes"],[central,"Central Government Schemes"],[stateCount,"State Government Schemes"],
    [funding,"Funding Schemes"],[subsidy,"Subsidy-linked Schemes"],[support,"Startup Support Schemes"],
    [ministries,"Ministries / Departments"],[active,"Active Schemes"]
  ];
  document.getElementById("statsGrid").innerHTML = stats.map(([n,l])=>`<div class="stat-card"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`).join("");
}
function renderExplore(){
  document.getElementById("exploreGrid").innerHTML = EXPLORE_CATEGORIES.map(cat=>{
    const count = SCHEMES.filter(cat.test).length;
    const disabled = count===0;
    return `<div class="explore-tile ${disabled?"disabled":""}" ${disabled?'aria-disabled="true"':`role="button" tabindex="0" onclick="applyQuickFilter('${cat.key}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();applyQuickFilter('${cat.key}')}"`}>
      <div class="exp-icon" aria-hidden="true">${cat.icon}</div><strong>${cat.label}</strong><span>${cat.note}</span><br>
      <span class="exp-count">${disabled? "0 schemes yet" : count+" scheme"+(count===1?"":"s")}</span>
    </div>`;
  }).join("");
}
/* ---------- nav / scroll ---------- */
function scrollToFind(){document.querySelector("#find").scrollIntoView({behavior:"smooth"})}
function scrollToId(id){document.querySelector("#"+id).scrollIntoView({behavior:"smooth"})}
function isMobileNavOpen(){
  return document.getElementById("navLinks").classList.contains("mobile-open");
}
function openMobileNav(){
  /* The panel's appearance is a .mobile-open rule in the stylesheet. It used to
     be inline styles here, hard-coding a white panel — which put the now-white
     nav links on a white background at small widths. */
  const n=document.getElementById("navLinks");
  n.classList.add("mobile-open");
  document.getElementById("menuBtn").setAttribute("aria-expanded","true");
  document.getElementById("menuBtn").setAttribute("aria-label","Close menu");
}
function closeMobileNav(){
  const n=document.getElementById("navLinks");
  n.classList.remove("mobile-open");
  document.getElementById("menuBtn").setAttribute("aria-expanded","false");
  document.getElementById("menuBtn").setAttribute("aria-label","Open menu");
}
function toggleMobileNav(){
  if(isMobileNavOpen()) closeMobileNav(); else openMobileNav();
}
document.getElementById("navLinks").addEventListener("click",function(e){
  if(e.target.tagName==="A" && isMobileNavOpen()) closeMobileNav();
});
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape") return;
  if(document.getElementById("modalBackdrop").classList.contains("show")) closeModal();
  else if(isMobileNavOpen()) closeMobileNav();
  else if(sectorPanelOpen) closeSectorPanel();
});
function toggleFilters(){
  const collapsed = document.getElementById("filtersPanel").classList.toggle("collapsed");
  document.getElementById("filtersToggleBtn").setAttribute("aria-expanded", (!collapsed).toString());
}

/* ---------- eligibility finder chips ---------- */
/* 61 of the 83 sectors reach exactly one scheme each, so the full list is a wall
   of near-duplicates. Collapse to the sectors that actually reach something and
   keep the long tail behind a toggle — nothing becomes unreachable, and a
   selected sector is never allowed to disappear. */
let sectorListExpanded = false;
const SECTOR_MIN_COUNT = 2;   /* a sector is listed by default if it reaches >= 2 schemes */
function applySectorChips(){
  const filterEl=document.getElementById("sectorFilter");
  const raw=filterEl?filterEl.value:"";
  const q=normText(raw);
  const showAll = sectorListExpanded || !!q;   /* an explicit search always shows its matches */
  let shown=0, matching=0, singletons=0;
  document.querySelectorAll("#sectorChips .chip").forEach(c=>{
    const name=c.dataset.sector;
    const n=parseInt(c.dataset.count,10)||0;
    if(n<2) singletons++;
    const matches=!q || normText(name).includes(q);
    if(matches) matching++;
    const keep = eligSectors.has(name);       /* never hide something you can deselect */
    c.hidden = !(matches && (showAll || keep || n>=SECTOR_MIN_COUNT));
    if(!c.hidden) shown++;
  });
  const total=ALL_SECTORS.length;
  const countEl=document.getElementById("sectorChipsCount");
  if(countEl){
    countEl.textContent = q
      ? `${matching} of ${total} sectors match “${raw.trim()}”`
      : `Showing ${shown} of ${total} sectors` + (showAll
          ? ` · ${singletons} of them reach a single scheme each`
          : ` · the ${total - shown} hidden ones each reach just one scheme`);
  }
  const btn=document.getElementById("sectorToggleBtn");
  if(btn){
    btn.textContent = sectorListExpanded ? "Show fewer ▴" : `Show all ${total} ▾`;
    btn.setAttribute("aria-expanded", String(sectorListExpanded));
    btn.hidden = !!q;                          /* searching already shows everything that matches */
  }
  const box=document.getElementById("sectorChips");
  if(box) box.setAttribute("data-shown", String(shown));
}
function toggleSectorList(){
  sectorListExpanded=!sectorListExpanded;
  applySectorChips();
}
/* The sector field opens and closes like the State / UT dropdown above it, so the
   form stays scannable; the closed control reports what is already selected. */
let sectorPanelOpen = false;
function syncSectorPickerLabel(){
  const el=document.getElementById("sectorPickerLabel");
  if(!el) return;
  const names=[...eligSectors];
  el.textContent = names.length===0 ? "Select sectors…"
    : names.length===1 ? names[0]
    : `${names[0]} +${names.length-1} more`;
  const btn=document.getElementById("sectorPickerBtn");
  if(btn) btn.classList.toggle("has-value", names.length>0);
}
function syncSectorPanel(){
  const panel=document.getElementById("sectorPanel");
  if(panel) panel.hidden=!sectorPanelOpen;
  const btn=document.getElementById("sectorPickerBtn");
  if(btn){
    btn.setAttribute("aria-expanded", String(sectorPanelOpen));
    btn.classList.toggle("open", sectorPanelOpen);
  }
  syncSectorPickerLabel();
}
function toggleSectorPanel(){
  sectorPanelOpen=!sectorPanelOpen;
  syncSectorPanel();
  if(sectorPanelOpen) applySectorChips();
}
function closeSectorPanel(){
  if(!sectorPanelOpen) return;
  sectorPanelOpen=false;
  syncSectorPanel();
}
function toggleEligSector(v){
  if(eligSectors.has(v)) eligSectors.delete(v); else eligSectors.add(v);
  document.querySelectorAll("#sectorChips .chip").forEach(c=>c.classList.toggle("active",eligSectors.has(c.dataset.sector)));
  applySectorChips();
  syncSectorPickerLabel();
}
function onFilterChange(){currentMode="browse"; currentPage=1; renderResults();}
function onSearchInput(){currentMode="browse"; currentPage=1; renderResults();}
function resetToBrowse(){
  currentMode="browse"; currentPage=1; eligProfile=null; emptyHint="";
  quickFilterKey=""; document.getElementById("quickFilterBanner").innerHTML="";
  document.getElementById("searchInput").value="";
  ["fMinistry","fType","fStatus","fFinance","fRepay","sort"].forEach(id=>{const el=document.getElementById(id); if(el) el.value = (id==="sort"?"relevance":"");});
  document.getElementById("resultsHeading").textContent="Browse all schemes";
  renderResults();
}
function clearFilters(){ resetToBrowse(); }
function applyQuickFilter(key){
  quickFilterKey=key;
  currentMode="browse"; currentPage=1; emptyHint="";
  const cat=EXPLORE_CATEGORIES.find(c=>c.key===key);
  document.getElementById("quickFilterBanner").innerHTML = `<div class="info-banner">Showing <strong>${cat.label}</strong> · ${cat.note}. <button class="clear-quick" onclick="clearFilters()">Clear ✕</button></div>`;
  renderResults();
  scrollToId("schemes");
}
/* Filter the (now complete) sector chip list so 83 sectors stay usable. */
function filterSectorChips(){ applySectorChips(); }
/* setFieldHint() and updateFieldHints() used to sit here, warning when a
   free-text stage or beneficiary value was not in the dataset. Both fields are
   <select> elements now, so the only value they can hold is a dataset value and
   the warning has nothing to warn about. They went with the free-text inputs. */

/* ---------- search: token-AND with partial matching (was one literal substring) ---------- */
const SEARCH_FIELDS = ["scheme_name","short_name","ministry_department","scheme_type","primary_objective"];
function tokenizeQuery(q){
  return String(q||"").toLowerCase().split(/\s+/)
    .map(t=>t.replace(/^[^0-9a-z₹&+./-]+|[^0-9a-z₹&+./-]+$/g,""))
    .filter(Boolean);
}
function searchScore(s,q){
  const tokens=tokenizeQuery(q);
  if(!tokens.length) return 1;
  let totals=0;
  const hay=haystack(s);
  for(const t of tokens){
    let best=0;
    for(const f of SEARCH_FIELDS){ if(String(s[f]||"").toLowerCase().includes(t)){ best=3; break; } }
    if(!best && (s.sectors.some(x=>x.toLowerCase().includes(t)) ||
                 s.tags.some(x=>x.toLowerCase().includes(t)) ||
                 s.benefit_type.some(x=>x.toLowerCase().includes(t)) ||
                 s.target_beneficiaries.some(x=>x.toLowerCase().includes(t)))) best=2;
    if(!best){
      if(hay.includes(t)) best=1;
      else if(t.length>3 && hay.includes(t.replace(/(ies|es|s)$/,""))) best=1;  // crude singular/stem
      else return 0;                                                             // AND across all tokens
    }
    totals+=best;
  }
  return totals;
}

/* ---------- filtering ---------- */
function passesFilters(s){
  const q=document.getElementById("searchInput").value.trim();
  if(q && searchScore(s,q)===0) return false;
  const fMinistry=document.getElementById("fMinistry").value; if(fMinistry && s.ministry_department!==fMinistry) return false;
  const fType=document.getElementById("fType").value; if(fType && s.scheme_type!==fType) return false;
  const fStatus=document.getElementById("fStatus").value; if(fStatus && statusGroup(s)!==fStatus) return false;
  const fFinance=document.getElementById("fFinance").value;
  if(fFinance==="specific" && !hasAmount(s)) return false;
  if(fFinance==="variable" && hasAmount(s)) return false;
  const fRepay=document.getElementById("fRepay").value; if(fRepay && repayCategory(s)!==fRepay) return false;
  if(quickFilterKey){ const cat=EXPLORE_CATEGORIES.find(c=>c.key===quickFilterKey); if(cat && !cat.test(s)) return false; }
  return true;
}

/* ============================================================
   Eligibility matching
   Change from v1: a *specific* sector match now outweighs a
   sector-agnostic scheme, so relevant schemes stop being buried
   under generic ones. Raw (unrounded) scores drive the ordering.
   ============================================================ */
function specificSectorCount(s){return (s.sectors||[]).filter(x=>x!=="Sector-agnostic").length;}
function byMatchRank(a,b){
  /* A scheme you cannot reach ranks below every reachable one, but it is never
     dropped — hiding it would be worse than flagging it. */
  const ab=(a.blockers&&a.blockers.length)?1:0, bb=(b.blockers&&b.blockers.length)?1:0;
  if(ab!==bb) return ab-bb;
  if(b.score!==a.score) return b.score-a.score;
  const as=specificSectorCount(a.s), bs=specificSectorCount(b.s);
  if(as!==bs) return as-bs;                       // prefer focused schemes over broad ones
  return a.s.scheme_name.localeCompare(b.s.scheme_name);
}
function scoreScheme(s,p){
  let score=0, why=[], blockers=[];
  const bl=blob(s);

  /* Business stage — 30 */
  if(p.stage){
    if(s.startup_stages.some(x=>closeEnough(p.stage,x))){
      score+=30; why.push(`Supports startups at the <strong>${esc(p.stageValue||p.stage)}</strong> stage`);
    }
  } else score+=10;

  /* Sector — 30 for a specific match (up to 36 for multiple), 16 if sector-agnostic */
  if(p.sectors.length){
    const specific=p.sectors.filter(sec=>s.sectors.includes(sec));
    if(specific.length){
      score+=30+Math.min(6,(specific.length-1)*3);
      why.push(`Covers your selected sector: <strong>${specific.map(esc).join(", ")}</strong>`);
    } else if(s.sectors.includes("Sector-agnostic")){
      score+=16;
      why.push("Applies to <strong>all sectors</strong> (sector-agnostic scheme)");
    }
  } else score+=10;

  /* Beneficiary type — 20 */
  if(p.business){
    if(s.target_beneficiaries.some(b=>closeEnough(p.business,b))){
      score+=20; why.push(`Open to beneficiaries like <strong>${esc(p.businessValue||p.business)}</strong>`);
    }
  } else score+=8;

  /* Recognition — 10 each */
  if(p.recognition){
    if((p.recognition==="DPIIT"||p.recognition==="Both") && bl.includes("dpiit")){ score+=10; why.push("References the DPIIT recognition pathway"); }
    if((p.recognition==="MSME"||p.recognition==="Both") && (bl.includes("udyam")||bl.includes("msme"))){ score+=10; why.push("References Udyam / MSME registration"); }
  } else score+=6;

  /* Funding needed — 12 for equity/credit requests, 8 when stated support can reach the asked range */
  if(p.funding==="Not a direct grant / equity or credit"){
    if(/equity|venture capital|fund of funds|investment|credit guarantee|guarantee/i.test(bl)){
      score+=12; why.push("You asked for equity/credit rather than a direct grant — this scheme is equity/credit-based");
    }
  } else if(FUNDING_BANDS[p.funding]){
    const need=FUNDING_BANDS[p.funding][0];
    const max=parseMaxRupees(s.financial_benefit);
    if(max!==null && max>=need){
      score+=8; why.push(`Stated support (up to ${esc(fmtRupees(max))}) can reach your requested range (reference input)`);
    }
  }

  /* Incubation / access route — 14. This is a genuine gate on some schemes, so
     when the user has no route we record a blocker (which sinks the card and is
     shown on it) rather than silently penalising it out of sight. */
  if(p.access==="none"){
    const r=accessRoute(s);
    if(r!=="direct"){
      blockers.push(r==="viaIncubator"
        ? "You cannot reach this one yet — applications go through a participating incubator"
        : "You cannot reach this one directly — it is reached through a programme partner or implementing agency");
    }
  } else if(p.access==="incubator"){
    const r=accessRoute(s);
    if(r!=="direct"){ score+=14; why.push(`Reachable with your incubator access — you ${ACCESS_ROUTE_LABEL[r]}`); }
    else if(s.benefit_type.some(b=>/incubat|mentor|accelerat/i.test(b))){
      score+=8; why.push("Offers the incubation or mentoring support you said you can use");
    }
  } else if(p.access==="direct"){
    if(accessRoute(s)==="direct"){ score+=8; why.push("You can apply directly — no incubator or partner in the route"); }
  }

  /* Support type — 16. Derived buckets, same source as the Browse filter. */
  if(p.support){
    const b=SUPPORT_BUCKETS.find(x=>x.key===p.support);
    if(b && b.test(s)){ score+=16; why.push(`Provides the kind of support you asked for: <strong>${esc(b.label)}</strong>`); }
  }

  return {score, pct:Math.max(0,Math.min(98,Math.round(score))), why, blockers};
}

function findSchemes(){
  const stageRaw=document.getElementById("stage").value.trim();
  const bizRaw=document.getElementById("business").value.trim();
  const recognition=document.getElementById("recognition").value;
  const access=document.getElementById("access").value;
  const support=document.getElementById("support").value;
  const sectors=[...eligSectors];

  if(!stageRaw && !bizRaw && !recognition && !access && !support && !sectors.length){
    currentMode="match"; eligProfile=null; emptyHint="";
    document.getElementById("resultsHeading").textContent="Find schemes for my startup";
    document.getElementById("resultCount").textContent="No eligibility inputs selected yet";
    document.getElementById("modeBanner").innerHTML="";
    currentPage=1;
    document.getElementById("results").innerHTML=`<div class="empty">📋 <strong>Almost there.</strong><br>Choose at least one of <b>Business Stage</b>, <b>Business / Beneficiary Type</b>, an <b>Industry / Sector</b>, <b>DPIIT / Udyam Recognition</b>, <b>Incubation / Access</b> or <b>Support Type</b> above, then click <b>Find Matching Schemes</b> again.<br><span class="dash-mini">Fields marked (reference only) are optional context that slightly refine the ranking.</span><br><button class="btn btn-outline" style="margin-top:12px" onclick="resetToBrowse()">Show all schemes</button></div>`;
    document.getElementById("paginationWrap").style.display="none";
    document.getElementById("pagingInfo").textContent="";
    scrollToId("schemes");
    return;
  }

  const stageRes=resolveAgainst(stageRaw, ALL_STAGES);
  const bizRes=resolveAgainst(bizRaw, ALL_BENEFICIARIES);
  const state=document.getElementById("state").value;

  eligProfile = {
    name: document.getElementById("startupName").value.trim(),
    stage: stageRaw, stageValue: stageRes.value || stageRaw,
    business: bizRaw, businessValue: bizRes.value || bizRaw,
    sectors: sectors,
    recognition: recognition,
    state: state,
    access: access,
    support: support,
    funding: document.getElementById("funding").value
  };

  const scored = SCHEMES.map(s=>{ const r=scoreScheme(s,eligProfile); return {s,pct:r.pct,score:r.score,why:r.why,blockers:r.blockers}; })
    .filter(r=>r.pct>=35)
    .sort(byMatchRank);
  currentResults = scored;
  currentMode="match";
  currentPage=1;

  const blocked = scored.filter(r=>r.blockers.length).length;

  /* Never dead-end — say exactly what to try instead. */
  emptyHint="";
  if(!scored.length){
    const tips=[];
    /* Two tips that used to live here — "…is not a dataset stage/beneficiary
       type" — are gone with the free-text inputs. A <select> cannot hold a value
       that is not in the dataset, so they could never fire. */
    if(sectors.length) tips.push(`No scheme in the dataset is tagged for <b>${sectors.map(esc).join(", ")}</b>.`);
    emptyHint=tips.length? tips.map(t=>"• "+t).join("<br>")+"<br><br>" : "";
  }

  document.getElementById("resultsHeading").textContent = "Best matching government schemes";
  document.getElementById("resultCount").textContent =
    `${scored.length} potential match${scored.length===1?"":"es"} for ${eligProfile.name||"your startup"}` +
    (state?` — all Central schemes apply nationwide, including ${state}`:".") +
    (blocked ? ` ${blocked} of them you cannot apply to yet — see the notice on each card.` : "");
  renderResults();
  scrollToId("schemes");
}
function resetForm(){
  document.querySelectorAll("#find input").forEach(e=>e.value="");
  document.querySelectorAll("#find select").forEach(e=>e.selectedIndex=0);
  document.getElementById("sectorFilter").value="";   /* explicit: the chip list depends on it */
  eligSectors.clear();
  sectorListExpanded=false;
  sectorPanelOpen=false;
  applySectorChips();
  syncSectorPanel();
  resetToBrowse();
}

/* ---------- results rendering ---------- */
function currentList(){
  if(currentMode==="match") return currentResults;
  /* Saved ignores the search box and the filters: it is your own shortlist, not
     a query over the catalogue. pct stays null because nothing was scored. */
  if(currentMode==="saved") return savedSchemes().found.map(s=>({s,pct:null,why:[],blockers:[]}));
  const q=document.getElementById("searchInput").value.trim();
  let list = SCHEMES.filter(passesFilters).map(s=>({s,pct:null,why:[],blockers:[]}));
  const sort=document.getElementById("sort").value;
  if(sort==="name") list.sort((a,b)=>a.s.scheme_name.localeCompare(b.s.scheme_name));
  else if(sort==="ministry") list.sort((a,b)=>a.s.ministry_department.localeCompare(b.s.ministry_department));
  else if(sort==="verified") list.sort((a,b)=>b.s.last_verified.localeCompare(a.s.last_verified));
  else if(q) list.sort((a,b)=>searchScore(b.s,q)-searchScore(a.s,q));
  return list;
}
/* Page navigation. Pages replace each other rather than accumulating, so the
   result count above and the card order stay stable while you page. */
function totalPages(list){ return Math.max(1, Math.ceil(list.length / PAGE_SIZE)); }
function goToPage(n, {scroll=true}={}){
  const pages = totalPages(currentList());
  const target = Math.min(Math.max(1, n||1), pages);
  if(target===currentPage) return;
  currentPage = target;
  renderResults();
  if(scroll) document.getElementById("resultsTop").scrollIntoView({behavior:"smooth", block:"start"});
}
function nextPage(){ goToPage(currentPage+1); }
function prevPage(){ goToPage(currentPage-1); }
/* One card renderer, used by the results grid and the Saved list, so a saved
   scheme can never drift from how it looks in the results. pct=null means "not
   scored" (browse / saved), which falls back to the status badge.
   selectable adds the compare checkbox. It is offered on the shortlist only:
   that is a small, deliberate set the user built, so ticking a few to compare
   is a natural thing to do there. On a 59-card browse grid the same control is
   noise, and compare is already one click away in each scheme's details. */
function schemeCardHtml(s, pct, why, blockers, selectable){
  const picked = compareList.includes(s.id);
  /* The 3-scheme limit is shown in the control itself, so a full list never
     silently swallows a click. */
  const full = compareList.length>=COMPARE_MAX && !picked;
  return `
    <article class="scheme-card${blockers&&blockers.length?" blocked":""}${selectable&&picked?" selected":""}">
      ${selectable?`<label class="pick${picked?" on":""}${full?" full":""}" title="${full?"Compare is full — untick one to add another":"Tick to compare this scheme"}">
        <input type="checkbox"${picked?" checked":""}${full?" disabled":""} onchange="toggleCompare('${s.id}')">
        <span>Compare${full?" (3 selected)":""}</span></label>`:""}
      ${pct!==null&&pct!==undefined?`<div class="match">${pct}% Match</div>`:`<div class="badge-status ${statusGroup(s)==="Active"?"badge-active":"badge-programme"}" style="position:absolute;right:18px;top:18px">${esc(statusGroup(s))}</div>`}
      <div class="eyebrow" style="font-size:.62rem">${esc(s.scheme_type)}</div>
      <h3>${esc(s.scheme_name)}</h3>
      ${s.short_name && s.short_name!==s.scheme_name ? `<div class="short-name">${esc(s.short_name)}</div>`:""}
      <div class="scheme-meta">${esc(s.ministry_department)}<br>🏛️ ${esc(s.government_level)} · 💰 ${esc(truncate(s.financial_benefit,60))}</div>
      <div class="scheme-desc">${esc(truncate(s.primary_objective,120))}</div>
      <div class="tags">${s.sectors.slice(0,3).map(x=>`<span class="tag">${esc(x)}</span>`).join("")}${s.sectors.length>3?`<span class="tag">+${s.sectors.length-3}</span>`:""}</div>
      ${blockers&&blockers.length?`<div class="blocker"><strong>You cannot apply to this yet</strong><br>${blockers.map(b=>"⛔ "+esc(b)).join("<br>")}</div>`:""}
      ${why && why.length? `<div class="reason"><strong>Why it may match:</strong><br>${why.map(w=>"✓ "+w).join("<br>")}<br>⚠ Verify current eligibility before applying.</div>`
        : `<div class="reason"><strong>Eligibility (summary):</strong><br>${esc(truncate(s.eligibility,110))}</div>`}
      <div class="card-actions"><button class="btn btn-outline" onclick="openDetails('${s.id}')">View Details</button><button class="btn btn-primary" onclick="saveScheme('${s.id}')">${saved.includes(s.id)?"Saved ✓":"Save"}</button></div>
      <div class="card-actions"><a class="btn btn-gold" href="${esc(s.application_url)}" target="_blank" rel="noopener">Apply / Source ↗</a></div>
    </article>`;
}

/* ---------- saved schemes ---------- */
/* Saved ids live in localStorage, so they can outlive the dataset. An id that is
   no longer in the current data is reported rather than silently dropped, because
   the user would have no idea it was still stored. */
function savedSchemes(){
  const found=[], missing=[];
  saved.forEach(id=>{ const s=SCHEMES.find(x=>x.id===id); s ? found.push(s) : missing.push(id); });
  return {found, missing};
}
/* Saved is a third view of the one results grid, not a separate section: the
   navbar link points at #schemes like Browse does. */
function showSaved(){
  currentMode="saved"; currentPage=1; eligProfile=null; emptyHint="";
  renderResults();
  scrollToId("schemes");
}
function removeSaved(id){
  if(!saved.includes(id)) return;
  saved=saved.filter(x=>x!==id);
  localStorage.setItem("yojanaSaved",JSON.stringify(saved));
  renderResults();
  toast("Removed from saved");
}
function clearSaved(){
  if(!saved.length){ toast("Nothing saved to clear."); return; }
  if(!confirm(`Remove all ${saved.length} saved scheme${saved.length===1?"":"s"}? This cannot be undone.`)) return;
  saved=[];
  localStorage.setItem("yojanaSaved","[]");
  renderResults();
  toast("Saved list cleared.");
}
function renderResults(){
  const list = currentList();
  const toolbarEl=document.getElementById("browseToolbar");
  const filtersEl=document.getElementById("filtersPanel");
  const bannerEl=document.getElementById("modeBanner");
  const isSaved = currentMode==="saved";
  /* Match and Saved are two views of one grid, so both hide the browse controls —
     searching or filtering a personal shortlist is not what those controls mean. */
  if(toolbarEl) toolbarEl.style.display = currentMode==="browse" ? "" : "none";
  if(filtersEl) filtersEl.style.display = currentMode==="browse" ? "" : "none";
  document.getElementById("resultsHeading").textContent =
    currentMode==="match" ? "Find schemes for my startup" : isSaved ? "Saved schemes" : "Browse all schemes";
  if(bannerEl){
    if(currentMode==="match"){
      const refine = currentResults.length>18
        ? `<br><span class="dash-mini">Strongest matches are shown first. Add a <b>sector</b> or <b>beneficiary type</b> to narrow ${currentResults.length} results.</span>`
        : "";
      bannerEl.innerHTML = `<div class="info-banner">🎯 <strong>Match results</strong> — ranked for ${esc(eligProfile&&eligProfile.name||"your startup")} by the eligibility matcher.${refine} <button class="clear-quick" onclick="resetToBrowse()">Show all schemes ✕</button></div>`;
    } else if(isSaved){
      const {found,missing}=savedSchemes();
      const orphans = missing.length
        ? `<div class="stale-note">${missing.length} saved scheme${missing.length===1?" is":"s are"} no longer in the current dataset, so ${missing.length===1?"it cannot":"they cannot"} be shown above. ${missing.map(id=>`<button class="stale-chip" onclick="removeSaved('${escJs(id)}')">${esc(id)} ✕</button>`).join(" ")}</div>`
        : "";
      /* The checkboxes are only obvious if something says what they are for. */
      const nSel=compareList.length;
      const pickHint = found.length<2
        ? `<br><span class="dash-mini">Save at least 2 schemes to compare them side by side.</span>`
        : nSel<2
          ? `<br><span class="dash-mini">Tick <b>Compare</b> on ${nSel?`${nSel} more card`:"2 or 3 cards"} to build a side-by-side table.</span>`
          : `<br><span class="dash-mini">${nSel} selected.</span> ${compareLinkHtml()}`;
      bannerEl.innerHTML = `<div class="info-banner">🔖 <strong>Saved schemes</strong> — ${found.length} on your shortlist, kept in this browser only. Nothing is uploaded. <button class="clear-quick" onclick="resetToBrowse()">Show all schemes ✕</button>${found.length?` <button class="clear-quick" onclick="clearSaved()">Clear all ✕</button>`:""}${pickHint}</div>${orphans}`;
    } else bannerEl.innerHTML="";
  }
  if(currentMode==="browse"){
    document.getElementById("resultCount").textContent = `${list.length} scheme${list.length===1?"":"s"} found`;
  } else if(isSaved){
    const n=savedSchemes().found.length;
    document.getElementById("resultCount").textContent = n
      ? `${n} saved scheme${n===1?"":"s"}`
      : "";
  }
  const pages = totalPages(list);
  if(currentPage>pages) currentPage=pages;          /* e.g. a filter shrank the list */
  const start = (currentPage-1)*PAGE_SIZE;
  const visible = list.slice(start, start+PAGE_SIZE);
  const el=document.getElementById("results");
  if(!visible.length){
    if(isSaved){
      el.innerHTML = `<div class="empty"><strong>Nothing saved yet.</strong><br>
        Tap <b>Save</b> on any scheme card — or <b>Save Scheme</b> inside a scheme's details — and it will show up here, where you can tick <b>Compare</b> on the ones you want to weigh up side by side.<br>
        <span class="dash-mini">Your shortlist is kept in this browser's local storage. Nothing is uploaded, and clearing your browser data will remove it.</span><br>
        <button class="btn btn-outline" style="margin-top:12px" onclick="resetToBrowse()">Browse all schemes</button></div>`;
    } else if(currentMode==="match"){
      el.innerHTML = `<div class="empty"><strong>No schemes matched your profile.</strong><br>${emptyHint}`+
        `Broaden your inputs — e.g. add an <b>Industry / Sector</b> or <b>Business Stage</b> — or reset the form and try again.<br>`+
        `<button class="btn btn-light" style="margin-top:12px" onclick="resetForm()">Reset eligibility form</button>&nbsp;`+
        `<button class="btn btn-outline" style="margin-top:12px" onclick="resetToBrowse()">Show all schemes</button></div>`;
    } else {
      const q=document.getElementById("searchInput").value.trim();
      el.innerHTML = `<div class="empty">No schemes match these filters yet. Try clearing a filter or broadening your search.<br>`+
        `<button class="btn btn-light" style="margin-top:12px" onclick="clearFilters()">Clear filters</button>`+
        (q?`&nbsp;<button class="btn btn-outline" style="margin-top:12px" onclick="document.getElementById('searchInput').value='';onSearchInput()">Clear search</button>`:"")+
        `</div>`;
    }
  } else {
    el.innerHTML = visible.map(({s,pct,why,blockers})=>schemeCardHtml(s,pct,why,blockers,isSaved)).join("");
  }
  /* Paging footer. With one page there is nothing to navigate, so the whole
     control is hidden rather than showing a dead "Next". */
  const wrap=document.getElementById("paginationWrap");
  const prev=document.getElementById("prevPageBtn");
  const next=document.getElementById("nextPageBtn");
  if(wrap) wrap.style.display = pages>1 ? "flex" : "none";
  if(prev) prev.disabled = currentPage<=1;
  if(next) next.disabled = currentPage>=pages;
  document.getElementById("pagingInfo").textContent = list.length
    ? `Page ${currentPage} of ${pages} · schemes ${start+1}–${start+visible.length} of ${list.length}`
    : "";
}

/* ---------- details modal ---------- */
function field(label,value,opts){
  opts=opts||{};
  const v = (value===undefined||value===null||value==="") ? `<span class="na">Not specified</span>` : (opts.raw?value:esc(value));
  return `<div class="detail"><small>${label}</small><strong>${v}</strong></div>`;
}
function openDetails(id){
  const s=SCHEMES.find(x=>x.id===id); if(!s) return;
  const matchRec = currentMode==="match" ? currentResults.find(r=>r.s.id===id) : null;
  document.getElementById("modalContent").innerHTML = `
   <div class="eyebrow">${esc(s.scheme_type)}</div><h2>${esc(s.scheme_name)}</h2>
   <p class="subtle">${esc(s.short_name)} · ${esc(s.ministry_department)}</p>

   <div class="sec-title">Overview &amp; Objective</div>
   <p>${esc(s.primary_objective)}</p>

   <div class="detail-grid">
     ${field("Government Level", s.government_level)}
     ${field("Scheme Status", s.status)}
     ${field("Startup Stages", s.startup_stages.join(", "))}
     ${field("Sectors / Industry", s.sectors.join(", "))}
     ${field("Selection Method", s.selection_method)}
     ${field("Last Verified", s.last_verified)}
     ${field("How You Reach It", ACCESS_ROUTE_LABEL[accessRoute(s)])}
     ${matchRec?field("Potential Match", matchRec.pct+"%"):""}
   </div>

   <div class="sec-title">Benefits</div>
   <p>${esc(s.key_benefits)}</p>
   <div class="tags">${s.benefit_type.map(b=>`<span class="tag">${esc(b)}</span>`).join("")}</div>

   <div class="sec-title">Eligibility</div>
   <p>${esc(s.eligibility)}</p>

   <div class="sec-title">Who Can Apply</div>
   <div class="tags">${s.target_beneficiaries.map(b=>`<span class="tag">${esc(b)}</span>`).join("")}</div>

   <div class="sec-title">Financial Assistance</div>
   <div class="detail-grid">
     ${field("Financial Benefit", s.financial_benefit)}
     ${field("Repayment Required", s.repayment_required)}
   </div>

   <div class="sec-title">Required Documents</div>
   <p>${esc(s.documents)}</p>

   <div class="sec-title">How to Apply</div>
   <p>${esc(s.application_process)}</p>

   <div class="sec-title">Contact / Helpline</div>
   <p><span class="na">Not specified in this dataset — use the official source link below for current contact details.</span></p>

   <div class="sec-title">Source &amp; Last Updated</div>
   <div class="detail-grid">
     ${field("Data Source", s.data_source)}
     ${field("Official Source", `<a href="${esc(s.official_source)}" target="_blank" rel="noopener">${esc(s.official_source)}</a>`, {raw:true})}
     ${field("Last Verified", s.last_verified)}
   </div>
   <p class="disclaimer">${esc(s.disclaimer)}</p>

   <div class="card-actions">
     <a class="btn btn-primary" href="${esc(s.application_url)}" target="_blank" rel="noopener">Apply Now ↗</a>
     <a class="btn btn-outline" href="${esc(s.official_source)}" target="_blank" rel="noopener">Official Website ↗</a>
     <button class="btn btn-light" onclick="saveScheme('${s.id}')">${saved.includes(s.id)?"Saved ✓":"Save Scheme"}</button>
     <button class="btn btn-light"${compareList.length>=COMPARE_MAX&&!compareList.includes(s.id)?" disabled":""} onclick="toggleCompare('${s.id}')">${compareList.includes(s.id)?"✓ In Compare (click to remove)":compareList.length>=COMPARE_MAX?`Compare is full (${COMPARE_MAX})`:"Add to Compare"}</button>
     <button class="btn btn-light" onclick="shareScheme('${s.id}')">Share</button>
   </div>`;
  lastFocusedEl = document.activeElement;
  document.getElementById("modalBackdrop").classList.add("show");
  const closeBtn = document.querySelector("#modalBackdrop .close");
  if(closeBtn) closeBtn.focus();
  history.replaceState(null,"","#scheme-"+id);
}
let lastFocusedEl=null;
function closeModal(e){
  if(!e||e.target===document.getElementById("modalBackdrop")){
    document.getElementById("modalBackdrop").classList.remove("show");
    history.replaceState(null,"",location.pathname+location.search);
    if(lastFocusedEl && typeof lastFocusedEl.focus==="function") lastFocusedEl.focus();
  }
}
function shareScheme(id){
  const url = location.origin+location.pathname+"#scheme-"+id;
  if(navigator.share){ navigator.share({title:"Government scheme",url}).catch(()=>{}); }
  else if(navigator.clipboard){ navigator.clipboard.writeText(url).then(()=>toast("Link copied to clipboard")); }
  else toast(url);
}

/* ---------- save / compare ---------- */
function saveScheme(id){
  if(saved.includes(id)) saved=saved.filter(x=>x!==id); else saved.push(id);
  localStorage.setItem("yojanaSaved",JSON.stringify(saved));
  renderResults(); toast(saved.includes(id)?"Scheme saved":"Scheme removed from saved");
  const modalOpen=document.getElementById("modalBackdrop").classList.contains("show");
  if(modalOpen) openDetails(id);
}
function toggleCompare(id){
  if(compareList.includes(id)) compareList=compareList.filter(x=>x!==id);
  else if(compareList.length<COMPARE_MAX) compareList.push(id);
  else { toast(`You can compare ${COMPARE_MAX} schemes at a time — untick one first.`); return; }
  localStorage.setItem("yojanaCompare",JSON.stringify(compareList));
  renderResults(); renderCompareBar();
  if(document.getElementById("modalBackdrop").classList.contains("show")) openDetails(id);
}
/* Same orphan-cleanup as the saved list, for the compare list. */
function removeFromCompare(id){
  if(!compareList.includes(id)) return;
  compareList=compareList.filter(x=>x!==id);
  localStorage.setItem("yojanaCompare",JSON.stringify(compareList));
  renderResults(); renderCompareBar();
  toast("Removed from comparison");
}
/* The comparison lives on its own page, opened in a new tab, so it never
   pushes the rest of the site down and you can keep browsing while it is
   open. It is a real <a target="_blank">, not window.open: browsers do not
   block it as a popup, and it stays middle-clickable, ctrl-clickable and
   keyboard-operable. The ids travel in the query string, so the tab is
   reloadable and does not depend on localStorage being shared. */
function compareUrl(){
  return "compare.html?ids=" + compareList.map(encodeURIComponent).join(",");
}
function compareLinkHtml(){
  if(compareList.length<2) return "";
  return `<a class="btn btn-gold" style="padding:7px 13px;font-size:.78rem" href="${esc(compareUrl())}" target="_blank" rel="noopener">Compare ${compareList.length} in a new tab ↗</a>`;
}
function renderCompareBar(){
  let bar=document.getElementById("compareBar");
  if(!bar){
    bar=document.createElement("div"); bar.id="compareBar"; bar.className="compare-bar";
    bar.innerHTML=`<span id="compareBarText"></span><span id="compareBarLink"></span><button class="btn-light" onclick="clearCompare()">Clear</button>`;
    document.body.appendChild(bar);
  }
  const n=compareList.length;
  document.getElementById("compareBarLink").innerHTML = compareLinkHtml();
  if(n){
    bar.classList.add("show");
    document.body.classList.add("has-compare-bar");
    /* One scheme is not a comparison — say what is missing instead of offering
       a page that has nothing to set it against. */
    document.getElementById("compareBarText").textContent = n<2
      ? `1 scheme selected — tick one more to compare`
      : `${n} of ${COMPARE_MAX} schemes selected to compare`;
  } else {
    bar.classList.remove("show");
    document.body.classList.remove("has-compare-bar");
  }
}
function clearCompare(){ compareList=[]; localStorage.setItem("yojanaCompare","[]"); renderResults(); renderCompareBar(); }
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}

/* ---------- init (synchronous — data/schemes.js is a plain script, works from file:// too) ---------- */
(function init(){
  if(!SCHEMES.length){
    document.getElementById("results").innerHTML =
      `<div class="empty"><strong>Scheme dataset is missing.</strong><br>`+
      `Make sure <code>data/schemes.js</code> is in the project folder — it defines <code>window.SCHEMES_DATA</code> and is loaded before this script.<br>`+
      `It works both when served over HTTP and when the page is opened directly from disk.</div>`;
    return;
  }
  initControls();
  renderResults();
  renderCompareBar();
  if(location.hash.startsWith("#scheme-")){ openDetails(location.hash.replace("#scheme-","")); }
  if(window.innerWidth<=700){ document.getElementById("filtersPanel").classList.add("collapsed"); }
})();
