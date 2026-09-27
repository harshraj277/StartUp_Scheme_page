/* Shared text helpers.
   Both index.html and compare.html build HTML from dataset text, so escaping
   has to behave identically in both — a second copy of esc() would eventually
   drift, and the page that drifted would be the one showing unescaped scheme
   names. Loaded before app.js / compare.js. */
function esc(t){return String(t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escJs(t){return String(t).replace(/\\/g,"\\\\").replace(/'/g,"\\'");}
function truncate(t,n){t=String(t==null?"":t);return t.length>n ? t.slice(0,n).replace(/\s+\S*$/,"")+"…" : t;}

/* Two derived facts small enough to share without dragging the matching
   regexes along. Used by the compare page's Status and Amount-stated rows. */
function hasAmount(s){return /₹/.test(s.financial_benefit);}
function statusGroup(s){return /active/i.test(s.status) ? "Active" : "Programme / Call-based";}
