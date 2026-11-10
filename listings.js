/* Seeking Aesthetics: school search and listing pages.
   Everything a non-developer may need to change is in CONFIG below. */
const CONFIG = {
  // Google Analytics 4 Measurement ID, e.g. "G-ABC123XYZ". Leave "" to turn tracking off.
  GA_ID: "",
  // Make.com webhook URLs (or Formspree form URLs). Leave "" and forms show a "preview only" note.
  REQUEST_INFO_ENDPOINT: "",
  NOTIFY_SCHOOL_ENDPOINT: "",
  // Where "Claim this listing" goes. The school name is added to the link.
  CLAIM_URL: "academy-inquiry.html",
  // Public school data. Rebuilt from Airtable by the nightly GitHub Action.
  DATA_URL: "data/schools.json"
};

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const STATES = { UT: "Utah", AZ: "Arizona", ID: "Idaho", NV: "Nevada", CO: "Colorado", WY: "Wyoming", NM: "New Mexico" };
const FORMATS = ["In person", "Hybrid", "Online"];
const store = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: fine */ } }
};
function money(v) {
  if (v === null || v === undefined || v === "") return "";
  return typeof v === "number" ? "$" + v.toLocaleString("en-US") : String(v);
}
function num(v) { return typeof v === "number" ? v.toLocaleString("en-US") : String(v ?? ""); }
function isPaid(s) { return s.listing === "paid"; }
function schoolUrl(s) { return "school.html#" + encodeURIComponent(s.slug); }
function where(s) { return [s.city, s.state].filter(Boolean).join(", "); }
function programNames(s) { return (s.programs || []).map(p => p.name).filter(Boolean).join(", "); }

/* What a paid card summarizes from its programs */
function tuitionFrom(s) {
  const t = (s.programs || []).map(p => p.tuition).filter(v => v !== undefined && v !== null && v !== "");
  const nums = t.filter(v => typeof v === "number");
  return nums.length ? money(Math.min(...nums)) : (t[0] !== undefined ? money(t[0]) : "Ask the school");
}
function hoursRange(s) {
  const h = (s.programs || []).map(p => p.hours).filter(v => typeof v === "number");
  if (!h.length) return "Ask the school";
  const lo = Math.min(...h), hi = Math.max(...h);
  return lo === hi ? `${num(lo)} hrs` : `${num(lo)}–${num(hi)} hrs`;
}
function nextStart(s) {
  const p = (s.programs || []).find(p => p.nextStart);
  return p ? p.nextStart : "Ask the school";
}

/* ---------- data ---------- */
let DATA = null;
async function loadSchools() {
  if (DATA) return DATA;
  const res = await fetch(CONFIG.DATA_URL, { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not load schools");
  DATA = await res.json();
  if (DATA.sample) { const bar = $("#sampleBar"); if (bar) bar.hidden = false; }
  return DATA;
}

/* ---------- Google Analytics 4 ---------- */
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
if (CONFIG.GA_ID) {
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CONFIG.GA_ID);
  document.head.appendChild(s);
  gtag("js", new Date());
  gtag("config", CONFIG.GA_ID);
}
/* Every event carries the school so reports can be split by school. */
function track(event, school, extra = {}) {
  const params = Object.assign({
    school_name: school ? school.name : "",
    school_id: school ? school.id : "",
    listing_type: school ? school.listing : ""
  }, extra);
  if (CONFIG.GA_ID) gtag("event", event, params);
}

/* ---------- forms ---------- */
async function send(endpoint, fields) {
  if (!endpoint) return "preview";
  const body = new URLSearchParams(fields);
  // "no-cors" lets the form post to Make or Formspree from any page; the reply is not readable, so a network error is the only failure we can see.
  await fetch(endpoint, { method: "POST", mode: "no-cors", body });
  return "sent";
}
function validContact(v) {
  v = v.trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || v.replace(/\D/g, "").length >= 10;
}

/* ---------- compare (paid schools only, up to 3) ---------- */
const CMP_KEY = "sa_compare";
const getCompare = () => store.get(CMP_KEY, []);
function toggleCompare(school) {
  let list = getCompare();
  if (list.includes(school.id)) { list = list.filter(id => id !== school.id); store.set(CMP_KEY, list); return "removed"; }
  if (list.length >= 3) return "full";
  list.push(school.id); store.set(CMP_KEY, list);
  track("compare", school, { compare_count: list.length });
  return "added";
}
function toast(html) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.innerHTML = html; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------- nav (same behavior as the rest of the site) ---------- */
function toggleNav(btn) {
  const links = document.getElementById("nav-links");
  links.classList.toggle("open");
  const open = links.classList.contains("open");
  btn.setAttribute("aria-expanded", String(open));
  const sp = btn.querySelectorAll("span");
  sp[0].style.transform = open ? "rotate(45deg) translate(4px,4px)" : "";
  sp[1].style.opacity = open ? "0" : "";
  sp[2].style.transform = open ? "rotate(-45deg) translate(4px,-4px)" : "";
}

/* =========================================================
   SEARCH RESULTS PAGE (schools.html)
   ========================================================= */
const SEARCH_KEY = "sa_search";
function matchesPlace(s, q) {
  q = q.toLowerCase().replace(/[^a-z0-9 ,.]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return true;
  const city = (s.city || "").toLowerCase();
  const code = (s.state || "").toLowerCase();
  const stateName = (STATES[s.state] || "").toLowerCase();
  const words = q.split(/[ ,]+/).filter(Boolean);
  if (city && (q.includes(city) || city.includes(q))) return true;
  if (stateName && q.includes(stateName)) return true;
  if (code && words.includes(code)) return true;
  // typed only a city we have none in, plus a state: fall back to the state
  return false;
}
function paidCard(s, inCompare) {
  const photo = (s.photos || [])[0];
  return `<article class="pcard">
    <a class="photo" href="${schoolUrl(s)}" aria-label="${esc(s.name)} photos">
      ${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : ""}
      <span class="badge">Featured</span>
    </a>
    <div class="body">
      <h2><a href="${schoolUrl(s)}">${esc(s.name)}</a></h2>
      <div class="muted" style="font-size:13px">${esc(where(s))}${s.scheduleSummary ? " · " + esc(s.scheduleSummary) : ""}</div>
      <div class="facts">
        <div><span>Tuition from</span> <strong>${esc(tuitionFrom(s))}</strong></div>
        <div><span>Next start</span> <strong>${esc(nextStart(s))}</strong></div>
        <div><span>Program</span> <strong>${esc(hoursRange(s))}</strong></div>
        <div><span>Aid</span> <strong>${esc(s.aid || "Ask the school")}</strong></div>
      </div>
      <div class="actions">
        <a class="btn sm grow" href="${schoolUrl(s)}" data-request="${esc(s.id)}">Request info</a>
        <button class="btn line sm" type="button" data-compare="${esc(s.id)}" aria-pressed="${inCompare}">${inCompare ? "Added" : "Compare"}</button>
      </div>
    </div>
  </article>`;
}
function freeRow(s) {
  return `<a class="frow" href="${schoolUrl(s)}">
    <b>${esc(s.name)}</b>
    <span>${esc(where(s))}${programNames(s) ? " · " + esc(programNames(s)) : ""}</span>
    <span>Tuition not listed yet</span>
  </a>`;
}

async function initResults() {
  const form = $("#searchForm"), input = $("#q"), out = $("#results");
  const saved = store.get(SEARCH_KEY, { q: "", formats: [] });
  let state = { q: saved.q || "", formats: saved.formats || [] };
  input.value = state.q;

  function paintChips() {
    document.querySelectorAll("[data-format]").forEach(b => b.setAttribute("aria-pressed", String(state.formats.includes(b.dataset.format))));
  }
  let data;
  try { data = await loadSchools(); }
  catch (e) { out.innerHTML = `<p class="loading">Schools could not load. Check your connection and refresh.</p>`; return; }
  const byId = id => data.schools.find(s => s.id === id);

  function render() {
    store.set(SEARCH_KEY, state);
    paintChips();
    const cmp = getCompare();
    const hits = data.schools.filter(s => matchesPlace(s, state.q) &&
      (!state.formats.length || (s.formats || []).some(f => state.formats.includes(f))));
    const byName = (a, b) => a.name.localeCompare(b.name);
    const paid = hits.filter(isPaid).sort(byName);
    const free = hits.filter(s => !isPaid(s)).sort(byName);
    const place = state.q ? ` near ${esc(state.q)}` : "";
    if (!hits.length) {
      out.innerHTML = `<div class="empty"><h2>No schools found${place} yet</h2>
        <p class="muted" style="margin:0">Try a nearby city, the state name, or turn off a filter.</p>
        <button class="btn line sm" type="button" id="showAll">Show all schools</button></div>`;
      $("#showAll").onclick = () => { state = { q: "", formats: [] }; input.value = ""; render(); };
      return;
    }
    out.innerHTML = `<p class="count">${hits.length} school${hits.length === 1 ? "" : "s"}${place}</p>
      ${paid.length ? `<p class="label">Featured schools</p><div class="paid-grid">${paid.map(s => paidCard(s, cmp.includes(s.id))).join("")}</div>` : ""}
      ${free.length ? `<p class="label" style="margin-top:6px">More schools</p><div class="free-list">${free.map(freeRow).join("")}</div>` : ""}`;
    renderTray();
  }

  form.addEventListener("submit", e => { e.preventDefault(); state.q = input.value.trim(); render(); });
  document.querySelectorAll("[data-format]").forEach(b => b.addEventListener("click", () => {
    const f = b.dataset.format;
    state.formats = state.formats.includes(f) ? state.formats.filter(x => x !== f) : [...state.formats, f];
    render();
  }));
  out.addEventListener("click", e => {
    const r = e.target.closest("[data-request]");
    if (r) { const s = byId(r.dataset.request); track("request_info", s, { source: "search_card" }); store.set("sa_go_request", s.slug); return; }
    const c = e.target.closest("[data-compare]");
    if (c) {
      const s = byId(c.dataset.compare), result = toggleCompare(s);
      if (result === "full") toast("You can compare up to 3 schools. Remove one first.");
      render();
    }
  });

  /* compare tray + table */
  function renderTray() {
    const ids = getCompare().filter(byId);
    const tray = $("#tray");
    tray.hidden = ids.length === 0;
    document.body.style.paddingBottom = ids.length ? "76px" : "";
    if (!ids.length) return;
    $("#trayNames").innerHTML = `<b>${ids.length} of 3</b> · ${ids.map(id => esc(byId(id).name)).join(", ")}`;
    $("#trayGo").disabled = ids.length < 2;
    $("#trayGo").textContent = ids.length < 2 ? "Pick 1 more" : `Compare ${ids.length}`;
  }
  function openCompare() {
    const rows = getCompare().map(byId).filter(Boolean);
    if (rows.length < 2) return;
    const line = (label, f) => `<tr><th scope="row">${label}</th>${rows.map(s => `<td>${esc(f(s))}</td>`).join("")}</tr>`;
    $("#cmpBody").innerHTML = `<table class="cmp">
      <thead><tr><th scope="row"></th>${rows.map(s => `<td>${(s.photos || [])[0] ? `<img src="${esc(s.photos[0])}" alt="">` : ""}<b>${esc(s.name)}</b></td>`).join("")}</tr></thead>
      <tbody>
        ${line("Location", where)}
        ${line("Format", s => (s.formats || []).join(", ") || "Ask the school")}
        ${line("Tuition from", tuitionFrom)}
        ${line("Program length", hoursRange)}
        ${line("Next start", nextStart)}
        ${line("Financial aid", s => s.aid || "Ask the school")}
        ${line("Programs", programNames)}
        <tr><th scope="row"></th>${rows.map(s => `<td><a class="btn sm" href="${schoolUrl(s)}" data-request="${esc(s.id)}">Request info</a></td>`).join("")}</tr>
      </tbody></table>`;
    $("#cmpSheet").hidden = false;
    $("#cmpClose").focus();
  }
  $("#trayGo").addEventListener("click", openCompare);
  $("#trayClear").addEventListener("click", () => { store.set(CMP_KEY, []); render(); });
  $("#cmpClose").addEventListener("click", () => { $("#cmpSheet").hidden = true; });
  $("#cmpSheet").addEventListener("click", e => {
    if (e.target.id === "cmpSheet") $("#cmpSheet").hidden = true;
    const r = e.target.closest("[data-request]");
    if (r) { const s = byId(r.dataset.request); track("request_info", s, { source: "compare" }); store.set("sa_go_request", s.slug); }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("#cmpSheet").hidden = true; });

  render();
  if (location.hash === "#compare") openCompare();
}

/* =========================================================
   LISTING PAGE (school.html): free or paid, from the data
   ========================================================= */
function slugFromUrl() {
  const q = new URLSearchParams(location.search).get("s");
  return decodeURIComponent((q || location.hash.slice(1) || "").trim());
}

function paidHTML(s) {
  const photos = (s.photos || []).slice(0, 5);
  const progs = s.programs || [];
  const p = s.parents || {};
  return `
  <div class="gallery">
    <div class="slides" id="slides" tabindex="0" aria-label="${esc(s.name)} photos">
      ${photos.map((src, i) => `<img src="${esc(src)}" alt="${esc(s.name)} photo ${i + 1} of ${photos.length}" ${i ? 'loading="lazy"' : ""}>`).join("")}
    </div>
    <span class="badge">Featured</span>
    ${photos.length > 1 ? `<button class="gnav prev" type="button" data-slide="-1" aria-label="Previous photo">&#8249;</button><button class="gnav next" type="button" data-slide="1" aria-label="Next photo">&#8250;</button>` : ""}
    ${photos.length ? `<span class="counter" id="counter">1 / ${photos.length} photos</span>` : ""}
  </div>
  <div class="listing">
    <div class="head">
      <h1>${esc(s.name)}</h1>
      <div class="where">${esc(where(s))}${(s.formats || []).length ? " · " + esc(s.formats.join(", ")) : ""}</div>
      ${(s.tags || []).length ? `<div class="tags">${s.tags.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
    </div>
    <div class="btnrow">
      <button class="btn grow" type="button" id="goRequest">Request info</button>
      <button class="btn line" type="button" id="cmpBtn" aria-pressed="false">Compare</button>
    </div>
    ${progs.length ? `<section class="programs"><p class="label">Programs</p><div class="list">
      ${progs.map(pr => `<div class="card"><h3>${esc(pr.name)}</h3><div class="pfacts">
        <div><span>Tuition</span><strong>${esc(money(pr.tuition) || "Ask the school")}</strong></div>
        <div><span>Length</span><strong>${typeof pr.hours === "number" ? num(pr.hours) + " hours" : esc(pr.hours || "Ask the school")}</strong></div>
        <div><span>Schedule</span><strong>${esc(pr.schedule || "Ask the school")}</strong></div>
        <div><span>Next start</span><strong>${esc(pr.nextStart || "Ask the school")}</strong></div>
      </div></div>`).join("")}
    </div></section>` : ""}
    ${s.openHouse ? `<section class="openhouse"><p class="label">Open house</p>
      <b>${esc(s.openHouse.date)}${s.openHouse.title ? " · " + esc(s.openHouse.title) : ""}</b>
      <button class="linkbtn" type="button" id="saveSpot">Save my spot</button></section>` : ""}
    <section class="parents"><p class="label" style="margin-bottom:4px">For parents</p>
      <div class="row"><span>Total cost incl. kit</span><strong>${esc(money(p.totalCost) || "Ask the school")}</strong></div>
      <div class="row"><span>Financial aid</span><strong>${esc(p.aid || s.aid || "Ask the school")}</strong></div>
      <div class="row"><span>Accreditation</span><strong>${esc(p.accreditation || "Ask the school")}</strong></div>
      <div class="row"><span>State license info</span><strong>${esc(p.stateLicense || "Ask the school")}</strong></div>
    </section>
    <form class="boxed" id="request" novalidate>
      <h2>Request info</h2>
      <p class="muted" style="margin:0;font-size:13px">Goes straight to the admissions team.</p>
      <div class="field"><label for="rqName">Name</label><input id="rqName" name="name" autocomplete="name" required></div>
      <div class="field"><label for="rqContact">Email or phone</label><input id="rqContact" name="contact" autocomplete="email" inputmode="email" required></div>
      <div class="field"><label for="rqProgram">Program</label><select id="rqProgram" name="program">
        ${progs.map(pr => `<option>${esc(pr.name)}</option>`).join("")}
        ${s.openHouse ? `<option value="Open house visit">Open house visit</option>` : ""}
        <option>Not sure yet</option></select></div>
      <div class="hp" aria-hidden="true"><label for="rqWebsite">Leave this empty</label><input id="rqWebsite" name="website_hp" tabindex="-1" autocomplete="off"></div>
      <p class="err" id="rqErr" hidden></p>
      <button class="btn" type="submit" id="rqSend">Send request</button>
      <div class="done" id="rqDone" hidden></div>
    </form>
    <p class="fine">Details provided by the school. Schools are responsible for verifying their own licensing and compliance.</p>
  </div>`;
}

function freeHTML(s, similar) {
  return `
  <div class="nophoto">No photos yet</div>
  <div class="listing">
    <div class="head">
      <h1>${esc(s.name)}</h1>
      <div class="where">${esc(where(s))}${programNames(s) ? " · " + esc(programNames(s)) : ""}</div>
      <div class="muted" style="font-size:12px">Built from public information</div>
    </div>
    <div class="btnrow">
      <button class="btn grow" type="button" id="askBtn" aria-expanded="false" aria-controls="notifyBox">Request info</button>
      ${s.website ? `<a class="btn line" href="${esc(s.website)}" target="_blank" rel="noopener nofollow">Website</a>` : ""}
    </div>
    <form class="boxed" id="notifyBox" hidden novalidate>
      <b style="font-size:15px">This school isn't taking inquiries on Seeking Aesthetics yet.</b>
      <p style="margin:0;font-size:13.5px;line-height:1.5;color:var(--text)">Want us to let them know you're interested? We'll tell you when they respond.</p>
      <div class="field"><label for="nfEmail">Email</label><input id="nfEmail" name="email" type="email" autocomplete="email" required></div>
      <div class="hp" aria-hidden="true"><label for="nfWebsite">Leave this empty</label><input id="nfWebsite" name="website_hp" tabindex="-1" autocomplete="off"></div>
      <p class="err" id="nfErr" hidden></p>
      <button class="btn sm" type="submit" id="nfSend">Notify the school</button>
      <div class="done" id="nfDone" hidden></div>
      ${similar.length ? `<button class="linkbtn" type="button" id="seeSimilar" style="align-self:center">Or see similar schools</button>` : ""}
    </form>
    ${similar.length ? `<section class="also" id="also"><p class="label">Students who viewed this school also looked at</p>
      ${similar.map(o => `<a class="mini" href="${schoolUrl(o)}">
        ${(o.photos || [])[0] ? `<img src="${esc(o.photos[0])}" alt="" loading="lazy">` : ""}
        <span class="t"><span class="k">Featured</span><b>${esc(o.name)}</b>
        <small>${esc(o.city)} · Tuition from ${esc(tuitionFrom(o))}</small>
        <small>${o.openHouse ? "Open house " + esc(o.openHouse.date) : "Next start " + esc(nextStart(o))}${o.aid && o.aid !== "Not offered" ? " · " + esc(o.aid === "Accepted" ? "Aid accepted" : o.aid) : ""}</small></span>
      </a>`).join("")}</section>` : ""}
    <div class="notlisted">
      <div><span>Tuition</span><b>Not listed yet</b></div>
      <div><span>Program length</span><b>Not listed yet</b></div>
      <div><span>Schedule</span><b>Not listed yet</b></div>
      <div><span>Financial aid</span><b>Not listed yet</b></div>
    </div>
    <section class="claim">
      <p class="k">Is this your school?</p>
      <h2>Students are looking. Make sure they can reach you.</h2>
      <a href="${esc(CONFIG.CLAIM_URL)}?school=${encodeURIComponent(s.name)}" id="claimLink">Claim this listing</a>
    </section>
    <p class="fine">Schools are responsible for verifying their own licensing and compliance.</p>
  </div>`;
}

/* Featured schools a student might like instead: same city first, then same state. */
function similarTo(s, all) {
  return all.filter(o => isPaid(o) && o.id !== s.id && o.state === s.state)
    .sort((a, b) => (b.city === s.city) - (a.city === s.city) || a.name.localeCompare(b.name))
    .slice(0, 2);
}

async function initListing() {
  const out = $("#listing");
  let data;
  try { data = await loadSchools(); }
  catch (e) { out.innerHTML = `<p class="loading">This school could not load. Check your connection and refresh.</p>`; return; }

  function show() {
    const slug = slugFromUrl();
    const s = data.schools.find(x => x.slug === slug);
    if (!s) {
      out.innerHTML = `<div class="wrap narrow"><div class="empty" style="margin-block:32px"><h2>We couldn't find that school</h2>
        <p class="muted" style="margin:0">It may have moved. Search all schools instead.</p><a class="btn sm" href="schools.html">Search schools</a></div></div>`;
      return;
    }
    document.title = `${s.name} | Seeking Aesthetics`;
    track("view_school", s);
    if (isPaid(s)) wirePaid(s); else wireFree(s, similarTo(s, data.schools));
    window.scrollTo(0, 0);
  }

  function wirePaid(s) {
    out.innerHTML = `<div class="wrap narrow"><a class="back" href="schools.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Back to results</a></div>
      <div class="wrap narrow" style="padding-inline:0">${paidHTML(s)}</div>`;
    // the gallery runs edge to edge on phones; give the text its side gutter back
    out.querySelectorAll(".listing").forEach(el => { el.style.paddingLeft = "var(--gutter-l)"; el.style.paddingRight = "var(--gutter-r)"; });

    const slides = $("#slides"), counter = $("#counter");
    if (slides && counter) {
      const n = slides.children.length;
      slides.addEventListener("scroll", () => { counter.textContent = `${Math.round(slides.scrollLeft / slides.clientWidth) + 1} / ${n} photos`; }, { passive: true });
      out.querySelectorAll("[data-slide]").forEach(b => b.addEventListener("click", () => slides.scrollBy({ left: slides.clientWidth * +b.dataset.slide, behavior: "smooth" })));
    }
    const form = $("#request");
    const goForm = () => { form.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => $("#rqName").focus({ preventScroll: true }), 400); };
    $("#goRequest").addEventListener("click", () => { track("request_info", s, { source: "listing_button" }); goForm(); });
    const spot = $("#saveSpot");
    if (spot) spot.addEventListener("click", () => { $("#rqProgram").value = "Open house visit"; track("request_info", s, { source: "open_house" }); goForm(); });

    const cmpBtn = $("#cmpBtn");
    const paintCmp = () => { const on = getCompare().includes(s.id); cmpBtn.setAttribute("aria-pressed", String(on)); cmpBtn.textContent = on ? "Added" : "Compare"; };
    paintCmp();
    cmpBtn.addEventListener("click", () => {
      const r = toggleCompare(s);
      if (r === "full") toast(`You can compare up to 3 schools. <a href="schools.html#compare">See your list</a>`);
      else if (r === "added") toast(`Added to compare. <a href="schools.html#compare">See comparison</a>`);
      paintCmp();
    });

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const err = $("#rqErr"), name = $("#rqName").value.trim(), contact = $("#rqContact").value.trim();
      let msg = "";
      if (!name) msg = "Enter your name.";
      else if (!validContact(contact)) msg = "Enter an email address or a 10-digit phone number.";
      err.textContent = msg; err.hidden = !msg;
      if (msg) return;
      if ($("#rqWebsite").value) return; // spam bot filled the hidden field
      $("#rqSend").disabled = true;
      try {
        const r = await send(CONFIG.REQUEST_INFO_ENDPOINT, {
          type: "request_info", school_id: s.id, school_name: s.name, program: $("#rqProgram").value,
          name, contact, page: location.href, sent_at: new Date().toISOString()
        });
        track("request_info_sent", s, { program: $("#rqProgram").value });
        form.querySelectorAll(".field, #rqSend").forEach(el => el.hidden = true);
        $("#rqDone").innerHTML = r === "preview"
          ? `<b>Preview only.</b> On the live site this goes straight to ${esc(s.name)}'s admissions team.`
          : `<b>Sent.</b> ${esc(s.name)} will contact you soon.`;
        $("#rqDone").hidden = false;
      } catch (x) {
        err.textContent = "That didn't send. Check your connection and try again."; err.hidden = false;
        $("#rqSend").disabled = false;
      }
    });
    if (store.get("sa_go_request", "") === s.slug) { store.set("sa_go_request", ""); setTimeout(goForm, 300); }
  }

  function wireFree(s, similar) {
    out.innerHTML = `<div class="wrap narrow"><a class="back" href="schools.html"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Back to results</a></div>
      <div class="wrap narrow" style="padding-inline:0">${freeHTML(s, similar)}</div>`;
    out.querySelectorAll(".listing").forEach(el => { el.style.paddingLeft = "var(--gutter-l)"; el.style.paddingRight = "var(--gutter-r)"; });
    const box = $("#notifyBox"), ask = $("#askBtn");
    ask.addEventListener("click", () => {
      box.hidden = false; ask.setAttribute("aria-expanded", "true");
      track("request_info", s, { source: "free_listing" });
      $("#nfEmail").focus();
    });
    const see = $("#seeSimilar");
    if (see) see.addEventListener("click", () => $("#also").scrollIntoView({ behavior: "smooth" }));
    box.addEventListener("submit", async e => {
      e.preventDefault();
      const email = $("#nfEmail").value.trim(), err = $("#nfErr");
      const bad = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
      err.textContent = bad ? "Enter an email address, like you@email.com." : ""; err.hidden = !bad;
      if (bad || $("#nfWebsite").value) return;
      track("notify_school", s);
      $("#nfSend").disabled = true;
      try {
        const r = await send(CONFIG.NOTIFY_SCHOOL_ENDPOINT, {
          type: "notify_school", school_id: s.id, school_name: s.name, school_city: s.city, school_state: s.state,
          email, page: location.href, sent_at: new Date().toISOString()
        });
        box.querySelectorAll(".field, #nfSend").forEach(el => el.hidden = true);
        $("#nfDone").innerHTML = r === "preview"
          ? `<b>Preview only.</b> On the live site this saves your interest for ${esc(s.name)} and we'll email you when they respond.`
          : `<b>Thanks.</b> We'll let ${esc(s.name)} know a student is interested and email you when they respond.`;
        $("#nfDone").hidden = false;
      } catch (x) {
        err.textContent = "That didn't send. Check your connection and try again."; err.hidden = false;
        $("#nfSend").disabled = false;
      }
    });
  }

  window.addEventListener("hashchange", show);
  show();
}
