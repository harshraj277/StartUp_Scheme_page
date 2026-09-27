
let SCHEMES = Array.isArray(window.SCHEMES_DATA)?window.SCHEMES_DATA:[];

/* ---------- derived helpers (computed, never fabricated) ---------- */
const FUNDING_BENEFIT_TYPES = ["Grant","Seed funding","R&D funding","R&D support","Credit guarantee","Credit-linked subsidy","Equity investment","Equity investment indirectly","Fellowship","Prototype support"];
function hasAmount(s){return /₹/.test(s.financial_benefit);}
function statusGroup(s){return s.status.toLowerCase().includes("active") ? "Active" : "Programme / Call-based";}
function repayCategory(s){
  const t=(s.repayment_required||"").toLowerCase();
  if(t.includes("non-repayable")||t.includes("not applicable")||t.includes("not a startup loan")||t.includes("generally non")) return "Non-repayable / Not applicable";
  if(t.includes("repayable to the lender")||(t.includes("loan")&&!t.includes("not a"))) return "Loan-linked (repayable)";
  if(t.includes("equity")||t.includes("investment")) return "Equity / Investment-based";
  return "Depends on instrument";
}
function isFundingScheme(s){return s.benefit_type.some(b=>FUNDING_BENEFIT_TYPES.includes(b)) || /fund/i.test(s.scheme_type);}
function blob(s){return (s.scheme_name+" "+s.short_name+" "+s.scheme_type+" "+s.key_benefits+" "+s.eligibility+" "+s.tags.join(" ")+" "+s.target_beneficiaries.join(" ")+" "+s.search_text).toLowerCase();}
function truncate(t,n){return t.length>n ? t.slice(0,n).replace(/\s+\S*$/,"")+"…" : t;}
function money(t){return t;} // financial_benefit is already human-readable text in the dataset

/* Explore-category predicates — every count is calculated live, never hardcoded */
const EXPLORE_CATEGORIES = [
  {key:"central",icon:"🏛️",label:"Central Government Schemes",note:"All schemes currently in this dataset",test:s=>s.government_level==="Central"},
  {key:"state",icon:"📍",label:"State Government Schemes",note:"Not yet included in this dataset",test:s=>false},
  {key:"funding",icon:"💰",label:"Startup Funding",note:"Grants, seed &amp; fellowship support",test:s=>isFundingScheme(s)},
  {key:"loans",icon:"🏦",label:"Loans &amp; Financial Assistance",note:"Credit guarantees &amp; credit-linked support",test:s=>s.benefit_type.some(b=>/credit/i.test(b))||/credit/i.test(s.scheme_type)},
  {key:"subsidy",icon:"🧾",label:"Subsidies",note:"Subsidy-linked support",test:s=>blob(s).includes("subsidy")},
  {key:"tax",icon:"📑",label:"Tax Benefits",note:"Tax-related facilitation",test:s=>blob(s).includes("tax")},
  {key:"incubation",icon:"🧪",label:"Incubation &amp; Mentorship",note:"Incubation, mentoring &amp; acceleration",test:s=>s.benefit_type.some(b=>/incubation|mentor|accelerat/i.test(b))},
  {key:"women",icon:"👩‍💼",label:"Women Entrepreneurs",note:"Not yet tagged in this dataset",test:s=>blob(s).includes("women")},
  {key:"student",icon:"🎓",label:"Student / Youth Entrepreneurs",note:"Student &amp; young-innovator support",test:s=>s.target_beneficiaries.some(b=>/student/i.test(b))||blob(s).includes("student")},
  {key:"msme",icon:"🏭",label:"MSME Schemes",note:"MSME &amp; Udyam-linked support",test:s=>s.sectors.includes("MSME")||s.target_beneficiaries.some(b=>/msme/i.test(b))||/msme/i.test(s.ministry_department)},
  {key:"innovation",icon:"💡",label:"Innovation &amp; Technology",note:"Deep tech, AI &amp; emerging tech",test:s=>s.sectors.some(x=>["Technology","Deep Tech","AI","Emerging Technology","ICT","Software","IoT","Robotics"].includes(x))},
  {key:"manufacturing",icon:"⚙️",label:"Manufacturing",note:"Industrial &amp; production sectors",test:s=>s.sectors.includes("Manufacturing")},
  {key:"agri",icon:"🌾",label:"Agriculture &amp; Rural Entrepreneurship",note:"Agri, agritech &amp; rural innovation",test:s=>s.sectors.some(x=>["Agriculture","Agritech","Agriculture Biotechnology"].includes(x))||s.target_beneficiaries.some(b=>/rural|fpo/i.test(b))}
];

/* ---------- state ---------- */
let saved = JSON.parse(localStorage.getItem("yojanaSaved")||"[]");
let compareList = JSON.parse(localStorage.getItem("yojanaCompare")||"[]");
let currentMode = "browse"; // "browse" | "match"
let currentResults = SCHEMES.slice();
let quickFilterKey = "";
let eligSectors = new Set();    // sectors selected in the "Find My Schemes" form
let filterSectors = new Set();  // sectors selected in the Browse filters panel
let selectedStages = new Set();
let eligProfile = null;
let visibleCount = 9;
const PAGE_SIZE = 9;

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
  let arr=entries.slice();
  if(sortAlpha) arr.sort((a,b)=>a[0].localeCompare(b[0]));
  arr.forEach(([v,c])=>{
    const o=document.createElement("option"); o.value=v; o.textContent=`${v} (${c})`; el.appendChild(o);
  });
}
function fillDatalist(id, entries, {sortAlpha=false}={}){
  const el=document.getElementById(id);
  if(!el) return;
  let arr=entries.slice();
  if(sortAlpha) arr.sort((a,b)=>a[0].localeCompare(b[0]));
  el.innerHTML = arr.map(([v])=>`<option value="${esc(v)}"></option>`).join("");
}
function initControls(){
  document.getElementById("dashVerified").textContent = SCHEMES[0]?.last_verified || "—";
  document.getElementById("trustCount").textContent = SCHEMES.length;
  document.getElementById("trustMinistries").textContent = new Set(SCHEMES.map(s=>s.ministry_department)).size;
  document.getElementById("heroBadge").textContent = `🇮🇳 ${SCHEMES.length} Central Government Startup Schemes`;

  const stageEntries = uniqueValues("startup_stages",true);
  const sectorEntries = uniqueValues("sectors",true);
  const beneficiaryEntries = uniqueValues("target_beneficiaries",true).slice(0,20);
  const ministryEntries = uniqueValues("ministry_department",false);
  const typeEntries = uniqueValues("scheme_type",false);
  const govLevelEntries = uniqueValues("government_level",false);

  fillDatalist("stageList", stageEntries);
  fillDatalist("businessList", beneficiaryEntries, {sortAlpha:true});
  fillSelect("fMinistry", ministryEntries, {sortAlpha:true});
  fillSelect("fType", typeEntries, {sortAlpha:true});
  fillSelect("fBeneficiary", beneficiaryEntries, {sortAlpha:true});
  fillSelect("fGovLevel", govLevelEntries);

  document.getElementById("sectorChips").innerHTML = sectorEntries.slice(0,14).map(([v,c])=>
    `<button class="chip" type="button" data-sector="${esc(v)}" onclick="toggleEligSector('${escJs(v)}')">${esc(v)} <span class="dash-mini" style="display:inline">(${c})</span></button>`).join("");

  document.getElementById("filterSectorChips").innerHTML = sectorEntries.map(([v,c])=>
    `<button class="chip small" type="button" data-sector="${esc(v)}" onclick="toggleFilterSector('${escJs(v)}')">${esc(v)} (${c})</button>`).join("");
  document.getElementById("filterStageChips").innerHTML = stageEntries.map(([v,c])=>
    `<button class="chip small" type="button" data-stage="${esc(v)}" onclick="toggleFilterStage('${escJs(v)}')">${esc(v)} (${c})</button>`).join("");

  renderStats();
  renderExplore();
  renderHeroMini(sectorEntries);
}
function esc(t){return String(t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escJs(t){return String(t).replace(/\\/g,"\\\\").replace(/'/g,"\\'");}

function renderStats(){
  const total=SCHEMES.length;
  const central=SCHEMES.filter(s=>s.government_level==="Central").length;
  const stateCount=0;
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
function renderHeroMini(sectorEntries){
  const top=sectorEntries.slice(0,3);
  document.getElementById("heroMiniList").innerHTML = top.map(([v,c])=>
    `<div class="mini"><div><strong>${esc(v)}</strong><br><small>${c} scheme${c===1?"":"s"}</small></div><div class="score">→</div></div>`).join("");
}

/* ---------- nav / scroll ---------- */
function scrollToFind(){document.querySelector("#find").scrollIntoView({behavior:"smooth"})}
function scrollToId(id){document.querySelector("#"+id).scrollIntoView({behavior:"smooth"})}
function isMobileNavOpen(){
  return document.getElementById("navLinks").classList.contains("mobile-open");
}
function openMobileNav(){
  const n=document.getElementById("navLinks");
  n.classList.add("mobile-open");
  n.style.display="flex";n.style.position="absolute";n.style.top="68px";n.style.left="4%";n.style.right="4%";n.style.background="#fff";n.style.padding="16px";n.style.flexDirection="column";n.style.alignItems="stretch";n.style.border="1px solid var(--line)";n.style.borderRadius="14px";n.style.boxShadow="var(--shadow)";n.style.zIndex="60";
  document.getElementById("menuBtn").setAttribute("aria-expanded","true");
  document.getElementById("menuBtn").setAttribute("aria-label","Close menu");
}
function closeMobileNav(){
  const n=document.getElementById("navLinks");
  n.classList.remove("mobile-open");
  n.removeAttribute("style");
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
});
function toggleFilters(){
  const collapsed = document.getElementById("filtersPanel").classList.toggle("collapsed");
  document.getElementById("filtersToggleBtn").setAttribute("aria-expanded", (!collapsed).toString());
}

/* ---------- eligibility finder chips ---------- */
function toggleEligSector(v){
  if(eligSectors.has(v)) eligSectors.delete(v); else eligSectors.add(v);
  document.querySelectorAll("#sectorChips .chip").forEach(c=>c.classList.toggle("active",eligSectors.has(c.dataset.sector)));
}
function toggleFilterSector(v){
  if(filterSectors.has(v)) filterSectors.delete(v); else filterSectors.add(v);
  document.querySelectorAll("#filterSectorChips .chip").forEach(c=>c.classList.toggle("active",filterSectors.has(c.dataset.sector)));
  currentMode="browse"; visibleCount=PAGE_SIZE; renderResults();
}
function toggleFilterStage(v){
  if(selectedStages.has(v)) selectedStages.delete(v); else selectedStages.add(v);
  document.querySelectorAll("#filterStageChips .chip").forEach(c=>c.classList.toggle("active",selectedStages.has(c.dataset.stage)));
  currentMode="browse"; visibleCount=PAGE_SIZE; renderResults();
}
function onFilterChange(){currentMode="browse"; visibleCount=PAGE_SIZE; renderResults();}
function onSearchInput(){currentMode="browse"; visibleCount=PAGE_SIZE; renderResults();}
function resetToBrowse(){
  currentMode="browse"; visibleCount=PAGE_SIZE; eligProfile=null;
  quickFilterKey=""; document.getElementById("quickFilterBanner").innerHTML="";
  document.getElementById("searchInput").value="";
  ["fGovLevel","fMinistry","fType","fStatus","fBeneficiary","fFinance","fRepay"].forEach(id=>{const el=document.getElementById(id); if(el) el.value="";});
  filterSectors.clear(); selectedStages.clear();
  document.querySelectorAll("#filterSectorChips .chip,#filterStageChips .chip").forEach(c=>c.classList.remove("active"));
  document.getElementById("resultsHeading").textContent="Browse all schemes";
  renderResults();
}
function clearFilters(){ resetToBrowse(); }
function applyQuickFilter(key){
  quickFilterKey=key;
  currentMode="browse"; visibleCount=PAGE_SIZE;
  const cat=EXPLORE_CATEGORIES.find(c=>c.key===key);
  document.getElementById("quickFilterBanner").innerHTML = `<div class="info-banner">Showing <strong>${cat.label}</strong> · ${cat.note}. <button class="clear-quick" onclick="clearFilters()">Clear ✕</button></div>`;
  renderResults();
  scrollToId("schemes");
}

/* ---------- search ---------- */
const SEARCH_FIELDS = ["scheme_name","short_name","ministry_department","scheme_type"];
function searchScore(s,q){
  if(!q) return 1;
  q=q.toLowerCase();
  let score=0;
  SEARCH_FIELDS.forEach(f=>{ if(String(s[f]).toLowerCase().includes(q)) score+=3; });
  if(s.sectors.some(x=>x.toLowerCase().includes(q))) score+=2;
  if(s.tags.some(x=>x.toLowerCase().includes(q))) score+=2;
  if(s.search_text.toLowerCase().includes(q)) score+=1;
  return score;
}

/* ---------- filtering ---------- */
function passesFilters(s){
  const q=document.getElementById("searchInput").value.trim();
  if(q && searchScore(s,q)===0) return false;
  const fGovLevel=document.getElementById("fGovLevel").value; if(fGovLevel && s.government_level!==fGovLevel) return false;
  const fMinistry=document.getElementById("fMinistry").value; if(fMinistry && s.ministry_department!==fMinistry) return false;
  const fType=document.getElementById("fType").value; if(fType && s.scheme_type!==fType) return false;
  const fStatus=document.getElementById("fStatus").value; if(fStatus && statusGroup(s)!==fStatus) return false;
  const fBeneficiary=document.getElementById("fBeneficiary").value; if(fBeneficiary && !s.target_beneficiaries.includes(fBeneficiary)) return false;
  const fFinance=document.getElementById("fFinance").value;
  if(fFinance==="specific" && !hasAmount(s)) return false;
  if(fFinance==="variable" && hasAmount(s)) return false;
  const fRepay=document.getElementById("fRepay").value; if(fRepay && repayCategory(s)!==fRepay) return false;
  if(filterSectors.size && ![...filterSectors].some(sec=>s.sectors.includes(sec))) return false;
  if(selectedStages.size && ![...selectedStages].some(st=>s.startup_stages.includes(st))) return false;
  if(quickFilterKey){ const cat=EXPLORE_CATEGORIES.find(c=>c.key===quickFilterKey); if(cat && !cat.test(s)) return false; }
  return true;
}

/* ---------- eligibility matching ---------- */
function scoreScheme(s,p){
  let score=0, why=[];
  if(p.stage){ const st=p.stage.trim().toLowerCase(); if(s.startup_stages.some(x=>{const v=x.toLowerCase(); return v===st||v.includes(st)||st.includes(v);})){score+=30; why.push(`Supports startups matching the <strong>${esc(p.stage)}</strong> stage`);} }
  else score+=10;
  if(p.sectors.length){
    const matched = p.sectors.filter(sec=>s.sectors.includes(sec)||s.sectors.includes("Sector-agnostic"));
    if(matched.length){ score+=30; why.push(`Covers your selected sector: <strong>${matched.map(esc).join(", ")}</strong>`); }
  } else score+=10;
  if(p.business){
    const hit = s.target_beneficiaries.some(b=>b.toLowerCase().includes(p.business.toLowerCase())||p.business.toLowerCase().includes(b.toLowerCase()));
    if(hit){ score+=20; why.push(`Open to beneficiaries matching <strong>${esc(p.business)}</strong>`); }
  } else score+=8;
  if(p.recognition){
    const bl=blob(s);
    if((p.recognition==="DPIIT"||p.recognition==="Both") && bl.includes("dpiit")){score+=10;why.push("References DPIIT recognition pathway");}
    if((p.recognition==="MSME"||p.recognition==="Both") && (bl.includes("udyam")||bl.includes("msme"))){score+=10;why.push("References Udyam / MSME registration");}
  } else score+=6;

  /* ---- reference-only profile inputs: transparent, never fabricated ---- */
  if(p.state){
    why.push("You selected a state — this is a Central-government dataset that applies nationwide, so state is kept for reference only");
  }
  if(p.funding==="Not a direct grant / equity or credit"){
    if(/equity|venture capital|fund of funds|investment|credit guarantee|guarantee/i.test(blob(s))){
      score+=12; why.push("You asked for equity/credit rather than a direct grant — this scheme is equity/credit-based (reference input)");
    }
  }
  if(p.turnover){
    const early=["Idea","Prototype","Early Stage"], growth=["Growth","Scaling"];
    if(p.turnover!=="₹1 crore+" && s.startup_stages.some(st=>early.includes(st))){
      score+=8; why.push("Your turnover range suggests an early-stage business (reference input)");
    } else if(p.turnover==="₹1 crore+" && s.startup_stages.some(st=>growth.includes(st))){
      score+=8; why.push("Your turnover suggests a growth-stage business (reference input)");
    }
  }
  if(p.age==="Under 18"||p.age==="18–25"){
    if(blob(s).includes("student")||s.target_beneficiaries.some(b=>/student|young/i.test(b))){
      score+=8; why.push("Your age profile may suit schemes open to student / young entrepreneurs (reference input)");
    }
  }
  if(p.gender==="Woman"){
    if(blob(s).includes("women")){
      score+=8; why.push("This scheme references women-led entrepreneurship (reference input)");
    }
  }

  const pct=Math.max(0,Math.min(98,Math.round(score)));
  return {pct, why};
}
function findSchemes(){
  const stage=document.getElementById("stage").value;
  const business=document.getElementById("business").value;
  const recognition=document.getElementById("recognition").value;
  const sectors=[...eligSectors];
  if(!stage && !business && !recognition && !sectors.length){
    currentMode="match"; eligProfile=null;
    document.getElementById("resultsHeading").textContent="Find schemes for my startup";
    document.getElementById("resultCount").textContent="No eligibility inputs selected yet";
    document.getElementById("browseToolbar").style.display="none";
    document.getElementById("filtersPanel").style.display="none";
    document.getElementById("modeBanner").innerHTML="";
    visibleCount=PAGE_SIZE;
    document.getElementById("loadMoreBtn").style.display="none";
    document.getElementById("pagingInfo").textContent="";
    document.getElementById("results").innerHTML=`<div class="empty">📋 <strong>Almost there.</strong><br>Choose at least one of <b>Business Stage</b>, <b>Business / Beneficiary Type</b>, an <b>Industry / Sector</b>, or <b>DPIIT / Udyam Recognition</b> above, then click <b>Find Matching Schemes</b> again.<br><span class="dash-mini">Fields marked (reference only) are optional context that slightly refine the ranking.</span><br><button class="btn btn-outline" style="margin-top:12px" onclick="resetToBrowse()">Show all schemes</button></div>`;
    scrollToId("schemes");
    return;
  }
  eligProfile = {
    name: document.getElementById("startupName").value.trim(),
    stage: stage,
    business: business,
    sectors: sectors,
    recognition: recognition,
    state: document.getElementById("state").value,
    turnover: document.getElementById("turnover").value,
    funding: document.getElementById("funding").value,
    age: document.getElementById("age").value,
    gender: document.getElementById("gender").value
  };
  const scored = SCHEMES.map(s=>{ const r=scoreScheme(s,eligProfile); return {s,pct:r.pct,why:r.why}; })
    .filter(r=>r.pct>=35)
    .sort((a,b)=>b.pct-a.pct);
  currentResults = scored;
  currentMode="match";
  visibleCount=PAGE_SIZE;
  document.getElementById("resultsHeading").textContent = "Best matching government schemes";
  document.getElementById("resultCount").textContent = `${scored.length} potential match${scored.length===1?"":"es"} for ${eligProfile.name||"your startup"} — verify eligibility on the official source before applying.`;
  renderResults();
  scrollToId("schemes");
}
function resetForm(){
  document.querySelectorAll("#find input").forEach(e=>e.value="");
  document.querySelectorAll("#find select").forEach(e=>e.selectedIndex=0);
  document.querySelectorAll("#sectorChips .chip").forEach(e=>e.classList.remove("active"));
  eligSectors.clear();
  resetToBrowse();
}

/* ---------- results rendering ---------- */
function currentList(){
  if(currentMode==="match") return currentResults;
  const q=document.getElementById("searchInput").value.trim();
  let list = SCHEMES.filter(passesFilters).map(s=>({s,pct:null,why:[]}));
  const sort=document.getElementById("sort").value;
  if(sort==="name") list.sort((a,b)=>a.s.scheme_name.localeCompare(b.s.scheme_name));
  else if(sort==="ministry") list.sort((a,b)=>a.s.ministry_department.localeCompare(b.s.ministry_department));
  else if(sort==="verified") list.sort((a,b)=>b.s.last_verified.localeCompare(a.s.last_verified));
  else if(q) list.sort((a,b)=>searchScore(b.s,q)-searchScore(a.s,q));
  return list;
}
function loadMore(){ visibleCount+=PAGE_SIZE; renderResults(false); }
function renderResults(resetScroll){
  const list = currentList();
  const toolbarEl=document.getElementById("browseToolbar");
  const filtersEl=document.getElementById("filtersPanel");
  const bannerEl=document.getElementById("modeBanner");
  if(toolbarEl) toolbarEl.style.display = currentMode==="match" ? "none" : "";
  if(filtersEl) filtersEl.style.display = currentMode==="match" ? "none" : "";
  if(bannerEl) bannerEl.innerHTML = currentMode==="match"
    ? `<div class="info-banner">🎯 <strong>Match results</strong> — ranked for ${esc(eligProfile&&eligProfile.name||"your startup")} by the Eligibility engine. <button class="clear-quick" onclick="resetToBrowse()">Show all schemes ✕</button></div>`
    : "";
  if(currentMode==="browse"){
    document.getElementById("resultCount").textContent = `${list.length} scheme${list.length===1?"":"s"} found`;
  }
  const visible = list.slice(0,visibleCount);
  const el=document.getElementById("results");
  if(!visible.length){
    el.innerHTML = currentMode==="match"
      ? `<div class="empty"><strong>No schemes matched your profile.</strong><br>Broaden your inputs — e.g. add an <b>Industry / Sector</b> or <b>Business Stage</b> — or reset the form and try again.<br><button class="btn btn-light" style="margin-top:12px" onclick="resetForm()">Reset eligibility form</button>&nbsp;<button class="btn btn-outline" style="margin-top:12px" onclick="resetToBrowse()">Show all schemes</button></div>`
      : `<div class="empty">No schemes match these filters yet. Try clearing a filter or broadening your search.<br><button class="btn btn-light" style="margin-top:12px" onclick="clearFilters()">Clear filters</button></div>`;
  } else {
    el.innerHTML = visible.map(({s,pct,why})=>`
    <article class="scheme-card">
      ${pct!==null?`<div class="match">${pct}% Match</div>`:`<div class="badge-status ${statusGroup(s)==="Active"?"badge-active":"badge-programme"}" style="position:absolute;right:18px;top:18px">${esc(statusGroup(s))}</div>`}
      <div class="eyebrow" style="font-size:.62rem">${esc(s.scheme_type)}</div>
      <h3>${esc(s.scheme_name)}</h3>
      ${s.short_name && s.short_name!==s.scheme_name ? `<div class="short-name">${esc(s.short_name)}</div>`:""}
      <div class="scheme-meta">${esc(s.ministry_department)}<br>🏛️ ${esc(s.government_level)} · 💰 ${esc(truncate(s.financial_benefit,60))}</div>
      <div class="scheme-desc">${esc(truncate(s.primary_objective,120))}</div>
      <div class="tags">${s.sectors.slice(0,3).map(x=>`<span class="tag">${esc(x)}</span>`).join("")}${s.sectors.length>3?`<span class="tag">+${s.sectors.length-3}</span>`:""}</div>
      ${why.length? `<div class="reason"><strong>Why it may match:</strong><br>${why.map(w=>"✓ "+w).join("<br>")}<br>⚠ Verify current eligibility before applying.</div>`
        : `<div class="reason"><strong>Eligibility (summary):</strong><br>${esc(truncate(s.eligibility,110))}</div>`}
      <div class="card-actions"><button class="btn btn-outline" onclick="openDetails('${s.id}')">View Details</button><button class="btn btn-primary" onclick="saveScheme('${s.id}')">${saved.includes(s.id)?"Saved ✓":"Save"}</button></div>
      <div class="card-actions"><a class="btn btn-gold" href="${esc(s.application_url)}" target="_blank" rel="noopener">Apply / Source ↗</a></div>
    </article>`).join("");
  }
  document.getElementById("loadMoreBtn").style.display = list.length>visibleCount ? "inline-block":"none";
  document.getElementById("pagingInfo").textContent = list.length ? `Showing ${Math.min(visibleCount,list.length)} of ${list.length}` : "";
  if(resetScroll===undefined){} // no-op, kept for clarity
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
     <button class="btn btn-light" onclick="toggleCompare('${s.id}')">${compareList.includes(s.id)?"✓ In Compare (click to remove)":"Add to Compare"}</button>
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
  else if(compareList.length<3) compareList.push(id);
  else { toast("Compare up to 3 schemes."); return; }
  localStorage.setItem("yojanaCompare",JSON.stringify(compareList));
  renderCompare(); renderResults(); renderCompareBar();
  if(document.getElementById("modalBackdrop").classList.contains("show")) openDetails(id);
}
function renderCompareBar(){
  let bar=document.getElementById("compareBar");
  if(!bar){
    bar=document.createElement("div"); bar.id="compareBar"; bar.className="compare-bar";
    bar.innerHTML=`<span id="compareBarText"></span><button class="btn-gold" onclick="scrollToId('compareSection')">Compare now</button><button class="btn-light" onclick="clearCompare()">Clear</button>`;
    document.body.appendChild(bar);
  }
  if(compareList.length){ bar.classList.add("show"); document.getElementById("compareBarText").textContent=`${compareList.length} scheme${compareList.length===1?"":"s"} selected for comparison`; }
  else bar.classList.remove("show");
}
function clearCompare(){ compareList=[]; localStorage.setItem("yojanaCompare","[]"); renderCompare(); renderResults(); renderCompareBar(); }
function renderCompare(){
  const sec=document.getElementById("compareSection");
  if(!compareList.length){ sec.style.display="none"; return; }
  sec.style.display="block";
  const rows=compareList.map(id=>SCHEMES.find(s=>s.id===id)).filter(Boolean);
  const fieldsToShow=[
    ["Benefits","key_benefits"],["Eligibility","eligibility"],["Financial Assistance","financial_benefit"],
    ["Target Beneficiaries",s=>s.target_beneficiaries.join(", ")],["Sector",s=>s.sectors.join(", ")],
    ["Government Level","government_level"],["Application Process","application_process"],["Documents Required","documents"]
  ];
  document.getElementById("compare").innerHTML = `<table><tr><th>Feature</th>${rows.map(s=>`<th>${esc(s.scheme_name)}</th>`).join("")}</tr>
  ${fieldsToShow.map(([label,key])=>`<tr><td><strong>${label}</strong></td>${rows.map(s=>`<td>${esc(truncate(typeof key==="function"?key(s):s[key],220))}</td>`).join("")}</tr>`).join("")}
  <tr><td><strong>Action</strong></td>${rows.map(s=>`<td><a class="btn btn-gold" href="${esc(s.application_url)}" target="_blank" rel="noopener">Apply ↗</a></td>`).join("")}</tr></table>`;
}
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
  renderCompare();
  renderCompareBar();
  if(location.hash.startsWith("#scheme-")){ openDetails(location.hash.replace("#scheme-","")); }
  if(window.innerWidth<=700){ document.getElementById("filtersPanel").classList.add("collapsed"); }
})();
