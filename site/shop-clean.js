/* CCV Shop & Clean – Kunden-App + Team-Kasse */
(function(){
'use strict';

/* =========================================================
   EINSTELLUNGEN – Firebase ist verbunden (Projekt ccv-shop-clean).
   Wäre apiKey leer, liefe die App im DEMO-MODUS (nur dieser Browser).
   ========================================================= */
var CFG = {
  firebase: {
    apiKey: "AIzaSyArSy0MtL8ey933nfoqCOIwIeVgpA4vBWg",
    authDomain: "ccv-shop-clean.firebaseapp.com",
    projectId: "ccv-shop-clean",
    storageBucket: "ccv-shop-clean.firebasestorage.app",
    messagingSenderId: "73876883164",
    appId: "1:73876883164:web:f74886d18b8546435ed619"
  },
  adminEmail: "info@carcarevalu.de",            // nur dieses Login darf die Team-Kasse öffnen
  impressumUrl: "https://www.carcarevalu.de/impressum",
  datenschutzUrl: "https://www.carcarevalu.de/datenschutz",
  standort: "Nidder Forum Nidderau",
  premiere: "2027-01-16T10:00:00+01:00",       // vor diesem Datum zeigt die App den Starttermin an
  premiereText: "Premiere: Sa, 16. Januar 2027 · 10–21 Uhr",
  stripeLink: "https://book.stripe.com/dRm6oJa73fIh1TGdzmbjW00",  // 5-€-Reservierung
  imgBase: "images/",                          // Ordner mit deinen Website-Fotos
  firma: "CAR CARE VALU"
};
var DEFAULTS = { rateCents: 90, minCents: 2500, graceMin: 15, blockMin: 15, blockCents: 500, plaetze: 1, pufferMin: 5, oeffnet: "10:00", schliesst: "21:00", tage: "2027-01-16", resCents: 500, kulanzMin: 15 };
var ZONES = [
  { id: "cockpit",    label: "Cockpit & Armaturen", car: true },
  { id: "vorne",      label: "Vordersitze",         car: true },
  { id: "hinten",     label: "Rücksitze",           car: true },
  { id: "kofferraum", label: "Kofferraum",          car: true },
  { id: "scheiben",   label: "Scheiben innen",      car: true },
  { id: "fussraum",   label: "Fußräume & Matten" }
];
var IMG = { hero: "hero-car.jpg",
  ba: { kofferraum: ["kofferraum-vorher.jpg","kofferraum-nachher.jpg"], fussraum: ["fussraum-vorher.jpg","fussraum-nachher.jpg"] },
  zones: { cockpit: "cockpit-sauber.jpg", vorne: "sitze-nachher.jpg", hinten: "sitze-sauber.jpg", kofferraum: "kofferraum-sauber.jpg", fussraum: "fussraum-sauber.jpg" } };
function img(f){ return CFG.imgBase + f; }
/* ========================================================= */

var root = document.getElementById("ccv-zelt");
if (!root || root.getAttribute("data-ready")) return;
root.setAttribute("data-ready", "1");
var MODE = root.getAttribute("data-mode") || "kunde";
var DEMO = !CFG.firebase.apiKey;

/* ---------- Helfer ---------- */
function euro(c){ return (Math.round(c)/100).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}) + " €"; }
function euroS(c){ return c % 100 === 0 ? (c/100) + " €" : euro(c); }
function clock(ms){
  var s = Math.max(0, Math.floor(ms/1000)), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  return (h ? h + ":" + String(m).padStart(2,"0") : String(m).padStart(2,"0")) + ":" + String(ss).padStart(2,"0");
}
function hhmm(ts){ return new Date(ts).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"}); }
function dayKey(ts){ var d = new Date(ts || Date.now()); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function normPlate(p){ return String(p||"").toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g,""); }
function digits(p){ return String(p||"").replace(/\D/g,""); }
function pinOf(phone){ return digits(phone).slice(-4); }
function lookupKey(plate){ return normPlate(plate); }
function zoneLabel(id){ var z = ZONES.find(function(z){return z.id===id;}); return z ? z.label : id; }
function lsGet(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }
function lsSet(k,v){ try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function $(sel){ return root.querySelector(sel); }
function on(sel, ev, fn){ Array.prototype.forEach.call(root.querySelectorAll(sel), function(el){ el.addEventListener(ev, function(e){ fn(e, el); }); }); }

/* Preisberechnung – gilt für Kunde und Team gleich */
function calc(j, s, now){
  now = now || Date.now();
  var r = { min: 0, work: 0, fee: 0, blocks: 0, total: 0, graceLeft: null };
  if (!j || !j.startedAt) return r;
  var end = j.stoppedAt || now;
  r.min = Math.max(1, Math.ceil((end - j.startedAt) / 60000));
  r.work = Math.max(s.minCents, r.min * s.rateCents);
  if (j.stoppedAt){
    var since = (j.paidAt || now) - j.stoppedAt;
    r.graceLeft = s.graceMin * 60000 - since;
    if (r.graceLeft < 0){ r.blocks = Math.ceil(-r.graceLeft / (s.blockMin * 60000)); r.fee = r.blocks * s.blockCents; }
  }
  r.deposit = j.depositCents || 0;
  r.total = Math.max(0, r.work + r.fee - r.deposit);
  if (j.status === "bezahlt" && typeof j.paidCents === "number"){ r.total = j.paidCents; r.work = j.workCents; r.fee = j.feeCents; r.min = j.workMin; }
  return r;
}

/* ---------- Belegungsplan: wann wird der nächste Platz frei? ---------- */
function todayAt(hm, now){ var p = String(hm || "0:00").split(":"), d = new Date(now || Date.now()); d.setHours(+p[0] || 0, +p[1] || 0, 0, 0); return d.getTime(); }
/* Reservierungen: aktiv = nicht storniert/verfallen/erschienen, bezahlt oder max. 30 Min. alt (Zahlung läuft), Kulanz noch nicht vorbei */
function activeRes(list, s, now){
  return (list || []).filter(function(r){
    if (r.aus) return false;
    if (r.status && r.status !== "offen") return false;
    if (!r.paid && r.createdAt < now - 30 * 60000) return false;
    return now < r.from + (s.kulanzMin || 15) * 60000;
  });
}
function overlapCount(list, a, b){ return list.filter(function(r){ return r.from < b && r.to > a; }).length; }
function earliestFree(t, dur, blocks){
  var moved = true;
  while (moved){ moved = false; blocks.forEach(function(r){ if (t < r.to && t + dur > r.from){ t = r.to; moved = true; } }); }
  return t;
}
function resDur(s, est){ return ((est || 30) + Math.min(s.graceMin || 0, 10) + (s.pufferMin || 0)) * 60000; }
function plan(jobs, s, now, res){
  now = now || Date.now();
  var cap = Math.max(1, Math.round(s.plaetze || 1)), buf = (s.pufferMin || 0) * 60000, abhol = Math.min(s.graceMin || 0, 10) * 60000;
  var open = todayAt(s.oeffnet, now), free = [], bars = [], i;
  for (i = 0; i < cap; i++) free.push(Math.max(now, open));
  var resv = []; for (i = 0; i < cap; i++) resv.push([]);
  activeRes(res, s, now).filter(function(r){ return r.day === dayKey(now); }).sort(function(a,b){ return a.from - b.from; }).forEach(function(r){
    var p = 0; for (var q = 0; q < cap; q++){ if (overlapCount(resv[q], r.from, r.to) === 0){ p = q; break; } }
    resv[p].push(r); bars.push({ p: p, from: r.from, to: r.to, k: "res", id: "res:" + r.id });
  });
  function minPlace(){ var m = 0; for (var k = 1; k < free.length; k++) if (free[k] < free[m]) m = k; return m; }
  var akt = jobs.filter(function(j){ return j.status === "laeuft" || j.status === "gestoppt"; }).sort(function(a,b){ return a.startedAt - b.startedAt; });
  akt.forEach(function(j){
    var end = j.status === "laeuft" ? Math.max(j.startedAt + (j.estMin || 30) * 60000, now + 60000) + abhol + buf
                                    : Math.max(j.stoppedAt + abhol, now + 60000) + buf;
    var p = minPlace(); bars.push({ p: p, from: j.startedAt, to: end, k: j.status, id: j.id }); free[p] = Math.max(free[p], end);
  });
  function slot(dur){ var best = null; for (var q = 0; q < cap; q++){ var t = earliestFree(free[q], dur, resv[q]); if (!best || t < best.t) best = { p: q, t: t }; } return best; }
  jobs.filter(function(j){ return j.status === "angemeldet"; }).sort(function(a,b){ return a.createdAt - b.createdAt; }).forEach(function(j){
    var dur = (j.estMin || 30) * 60000 + abhol + buf, sl = slot(dur);
    bars.push({ p: sl.p, from: sl.t, to: sl.t + dur, k: "wartet", id: j.id }); free[sl.p] = sl.t + dur;
  });
  return { bars: bars, next: slot(30 * 60000 + abhol + buf).t, plaetze: cap, free: free, slot: slot };
}
function timeline(pl, s, now, opt){
  opt = opt || {};
  var open = todayAt(s.oeffnet, now), close = todayAt(s.schliesst, now);
  // Ausschnitt: ab kurz vor jetzt bis nach dem letzten Eintrag (mind. 3 Std.), damit die Balken gut lesbar sind
  var from = now - 30 * 60000, to = now + 3 * 3600000;
  pl.bars.forEach(function(b){ if (b.to + 20 * 60000 > to) to = b.to + 20 * 60000; if (b.from < from) from = Math.max(b.from, now - 90 * 60000); });
  if (opt.own && opt.own.to + 20 * 60000 > to) to = opt.own.to + 20 * 60000;
  from = Math.floor(from / 3600000) * 3600000; to = Math.ceil(to / 3600000) * 3600000;
  var span = to - from, x = function(t){ return Math.max(0, Math.min(100, (t - from) / span * 100)); };
  var h = '<div class="tl"><div class="tl-hours">';
  for (var t = from; t <= to; t += 3600000) h += '<span style="left:' + x(t) + '%">' + new Date(t).getHours() + '</span>';
  h += '</div>';
  for (var p = 0; p < pl.plaetze; p++){
    h += '<div class="tl-row"><span class="tl-lbl">' + (pl.plaetze > 1 ? "Platz " + (p + 1) : "Zelt") + '</span><div class="tl-track">';
    h += '<i class="tl-off" style="left:0;width:' + x(open) + '%"></i><i class="tl-off" style="left:' + x(close) + '%;right:0"></i>';
    pl.bars.filter(function(b){ return b.p === p; }).forEach(function(b){
      var lab = opt.labels && opt.labels[b.id] ? esc(opt.labels[b.id]) : "";
      h += '<i class="tl-bar ' + b.k + '" style="left:' + x(b.from) + '%;width:' + Math.max(1.2, x(b.to) - x(b.from)) + '%" title="' + hhmm(b.from) + '–' + hhmm(b.to) + '">' + lab + '</i>';
    });
    if (opt.own && opt.own.p === p) h += '<i class="tl-bar own" style="left:' + x(opt.own.from) + '%;width:' + Math.max(1.2, x(opt.own.to) - x(opt.own.from)) + '%">Du</i>';
    h += '<i class="tl-now" style="left:' + x(now) + '%"></i></div></div>';
  }
  return h + '<div class="tl-leg">' + (opt.legend || '<span><i class="lg laeuft"></i>belegt</span><span><i class="lg res"></i>reserviert</span>' + (opt.own ? '<span><i class="lg own"></i>dein Auto (geschätzt)</span>' : '')) + '</div></div>';
}

/* ---------- Speicher: Demo (localStorage) ---------- */
function DemoStore(){
  var K = "ccvShopCleanDemo.v1", mem = null, subs = [], last = "";
  function read(){ try { var v = localStorage.getItem(K); if (v) return JSON.parse(v); } catch(e){ if (mem) return JSON.parse(mem); } return { settings: {}, jobs: {}, lookup: {} }; }
  function write(d){ var s = JSON.stringify(d); mem = s; try { localStorage.setItem(K, s); } catch(e){} last = s; subs.forEach(function(f){ f(d); }); }
  setInterval(function(){ var s; try { s = localStorage.getItem(K) || ""; } catch(e){ s = mem || ""; } if (s !== last){ last = s; var d = read(); subs.forEach(function(f){ f(d); }); } }, 800);
  function sub(f){ subs.push(f); f(read()); return function(){ subs = subs.filter(function(x){ return x !== f; }); }; }
  function id(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  return {
    settings: function(cb){ return sub(function(d){ cb(Object.assign({}, DEFAULTS, d.settings)); }); },
    saveSettings: function(s){ var d = read(); d.settings = s; write(d); return Promise.resolve(); },
    belegung: function(cb){ return sub(function(d){ cb(d.belegung || null); }); },
    createRes: function(r){ var d = read(), i = id(); d.res = d.res || {}; d.belegt = d.belegt || {}; d.res[i] = r; d.belegt[i] = { day: r.day, from: r.from, to: r.to, paid: false, createdAt: r.createdAt }; write(d); return Promise.resolve(i); },
    getRes: function(i, cb){ return sub(function(d){ var r = d.res && d.res[i]; cb(r ? Object.assign({ id: i }, r) : null); }); },
    belegtDay: function(day, cb){ return sub(function(d){ var b = d.belegt || {}; cb(Object.keys(b).map(function(k){ return Object.assign({ id: k }, b[k]); }).filter(function(x){ return x.day === day; })); }); },
    resList: function(cb){ return sub(function(d){ var r = d.res || {}, t = dayKey(); cb(Object.keys(r).map(function(k){ return Object.assign({ id: k }, r[k]); }).filter(function(x){ return x.day >= t; })); }); },
    updateRes: function(i, p, slotPatch){ var d = read(); if (d.res && d.res[i]) Object.assign(d.res[i], p); if (slotPatch && d.belegt && d.belegt[i]) Object.assign(d.belegt[i], slotPatch); write(d); return Promise.resolve(); },
    setBelegung: function(b){ var d = read(); d.belegung = b; write(d); return Promise.resolve(); },
    create: function(job, key){
      var d = read(), old = d.lookup[key];
      if (old && old.createdAt > Date.now() - 12*3600000 && d.jobs[old.id] && ["bezahlt","storniert"].indexOf(d.jobs[old.id].status) < 0)
        return Promise.reject(new Error("exists"));
      var i = id(); d.jobs[i] = job; d.lookup[key] = { id: i, createdAt: job.createdAt }; write(d); return Promise.resolve(i);
    },
    job: function(i, cb){ return sub(function(d){ cb(d.jobs[i] ? Object.assign({ id: i }, d.jobs[i]) : null); }); },
    find: function(key){ var l = read().lookup[key]; return Promise.resolve(l && l.createdAt > Date.now() - 86400000 ? l.id : null); },
    stop: function(i){ return this.update(i, { status: "gestoppt", stoppedAt: Date.now() }); },
    cancel: function(i){ return this.update(i, { status: "storniert" }); },
    update: function(i, p){ var d = read(); if (d.jobs[i]) Object.assign(d.jobs[i], p); write(d); return Promise.resolve(); },
    all: function(cb){ return sub(function(d){ var lim = Date.now() - 36*3600000; cb(Object.keys(d.jobs).map(function(k){ return Object.assign({ id: k }, d.jobs[k]); }).filter(function(j){ return j.createdAt > lim; })); }); },
    onAuth: function(cb){ cb({ email: "demo" }); },
    login: function(){ return Promise.resolve(); },
    logout: function(){ return Promise.resolve(); },
    cleanup: function(){},
    reset: function(){ write({ settings: read().settings, jobs: {}, lookup: {} }); }
  };
}

/* ---------- Speicher: Firebase ---------- */
function FireStore(){
  if (!firebase.apps.length) firebase.initializeApp(CFG.firebase);
  var db = firebase.firestore(), auth = firebase.auth();
  function withId(s){ return s.exists ? Object.assign({ id: s.id }, s.data()) : null; }
  return {
    settings: function(cb){ return db.doc("einstellungen/preise").onSnapshot(function(s){ cb(Object.assign({}, DEFAULTS, s.exists ? s.data() : {})); }, function(){ cb(Object.assign({}, DEFAULTS)); }); },
    saveSettings: function(s){ return db.doc("einstellungen/preise").set(s); },
    belegung: function(cb){ return db.doc("einstellungen/belegung").onSnapshot(function(s){ cb(s.exists ? s.data() : null); }, function(){ cb(null); }); },
    createRes: function(r){
      var ref = db.collection("reservierungen").doc(), b = db.batch();
      b.set(ref, r); b.set(db.doc("belegt/" + ref.id), { day: r.day, from: r.from, to: r.to, paid: false, createdAt: r.createdAt });
      return b.commit().then(function(){ return ref.id; });
    },
    getRes: function(i, cb){ return db.doc("reservierungen/" + i).onSnapshot(function(s){ cb(withId(s)); }, function(){ cb(null); }); },
    belegtDay: function(day, cb){ return db.collection("belegt").where("day", "==", day).onSnapshot(function(qs){ cb(qs.docs.map(withId)); }, function(){ cb([]); }); },
    resList: function(cb){ return db.collection("reservierungen").where("day", ">=", dayKey()).onSnapshot(function(qs){ cb(qs.docs.map(withId)); }, function(){ cb([]); }); },
    updateRes: function(i, p, slotPatch){
      var b = db.batch(); b.update(db.doc("reservierungen/" + i), p); if (slotPatch) b.update(db.doc("belegt/" + i), slotPatch); return b.commit();
    },
    setBelegung: function(b){ return db.doc("einstellungen/belegung").set(b); },
    create: function(job, key){
      var ref = db.collection("auftraege").doc(), b = db.batch();
      b.set(ref, job); b.set(db.doc("lookup/" + key), { id: ref.id, createdAt: job.createdAt });
      return b.commit().then(function(){ return ref.id; }).catch(function(e){ throw new Error(e.code === "permission-denied" ? "exists" : e.message); });
    },
    job: function(i, cb){ return db.doc("auftraege/" + i).onSnapshot(function(s){ cb(withId(s)); }, function(){ cb(null); }); },
    find: function(key){ return db.doc("lookup/" + key).get().then(function(s){ return s.exists && s.data().createdAt > Date.now() - 86400000 ? s.data().id : null; }); },
    stop: function(i){ return db.doc("auftraege/" + i).update({ status: "gestoppt", stoppedAt: Date.now() }); },
    cancel: function(i){ return db.doc("auftraege/" + i).update({ status: "storniert" }); },
    update: function(i, p){ return db.doc("auftraege/" + i).update(p); },
    all: function(cb, err){ return db.collection("auftraege").where("createdAt", ">", Date.now() - 36*3600000).onSnapshot(function(qs){ cb(qs.docs.map(withId)); }, err); },
    onAuth: function(cb){ return auth.onAuthStateChanged(cb); },
    login: function(e, p){ return auth.signInWithEmailAndPassword(e, p); },
    logout: function(){ return auth.signOut(); },
    cleanup: function(){ // Telefonnummern nach 30 Tagen löschen (Datenschutz)
      db.collection("auftraege").where("createdAt", "<", Date.now() - 30*86400000).limit(100).get()
        .then(function(qs){ qs.forEach(function(d){ if (d.data().phone) d.ref.update({ phone: "" }); }); }).catch(function(){});
      var alt = dayKey(Date.now() - 30*86400000); // Reservierungen nach 30 Tagen löschen
      db.collection("reservierungen").where("day", "<", alt).limit(100).get()
        .then(function(qs){ qs.forEach(function(d){ d.ref.delete(); db.doc("belegt/" + d.id).delete().catch(function(){}); }); }).catch(function(){});
    }
  };
}

var store, S = Object.assign({}, DEFAULTS);

/* =========================================================
   KUNDEN-APP
   ========================================================= */
function Kunde(){
  var MY = "ccvShopClean.meinAuftrag", MYRES = "ccvShopClean.meineReservierung";
  var st = { step: "welcome", est: 30, plate: "", phone: "", prefs: [], note: "", acc1: false, acc2: false, val: false, key: false, err: "", jobId: null, job: null, confirmStop: false, busy: false, ba: "kofferraum",
    rDay: "", rTime: 0, rName: "", rAcc1: false, rAcc2: false, res: null };
  var unsubJob = null;
  var STEPS = ["welcome","zeit","daten","auto","schluessel"];

  var mine = lsGet(MY);
  if (mine && mine.id && mine.until > Date.now()) { st.step = "status"; watch(mine.id); }
  var myRes = lsGet(MYRES), unsubRes = null, unsubDay = null, dayBlocks = [];
  if (myRes && myRes.id && myRes.until > Date.now()){
    watchRes(myRes.id);
    if (/[?&]reserviert=1/.test(location.search) && st.step !== "status") st.step = "resok";
  } else myRes = null;
  function watchRes(id){ if (unsubRes) unsubRes(); unsubRes = store.getRes(id, function(r){ st.res = r; if (["resok","welcome"].indexOf(st.step) >= 0){ st._keepScroll = true; render(); } }); }

  function openDays(){
    var now = Date.now(), t = dayKey(now);
    return String(S.tage || "").split(/[,;\s]+/).map(function(x){ return x.trim(); }).filter(function(x){ return /^\d{4}-\d{2}-\d{2}$/.test(x); })
      .filter(function(x){ return x > t || (x === t && now < todayAt(S.schliesst, now) - 30 * 60000); }).sort();
  }
  function dayLabel(day){ var p = day.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }); }
  function dayStart(day, hm){ var p = day.split("-"), q = String(hm).split(":"); return new Date(+p[0], +p[1] - 1, +p[2], +q[0] || 0, +q[1] || 0).getTime(); }
  function watchDay(day){ if (unsubDay) unsubDay(); dayBlocks = []; unsubDay = store.belegtDay(day, function(list){ dayBlocks = list; if (st.step === "res"){ st._keepScroll = true; render(); } }); }
  function freeStarts(day){
    var now = Date.now(), dur = resDur(S, st.est), cap = Math.max(1, S.plaetze || 1);
    var blocks = activeRes(dayBlocks, S, now).map(function(r){ return { from: r.from, to: r.to }; });
    if (day === dayKey(now) && B && B.updatedAt > now - 15 * 60000){ (B.frei || []).forEach(function(f){ if (f > now) blocks.push({ from: now, to: f }); }); }
    var out = [], open = dayStart(day, S.oeffnet), close = dayStart(day, S.schliesst);
    var t = Math.max(open, Math.ceil((now + 20 * 60000) / (15 * 60000)) * 15 * 60000);
    for (; t + (st.est || 30) * 60000 <= close; t += 15 * 60000){ if (overlapCount(blocks, t, t + dur) < cap) out.push(t); }
    return out;
  }

  var B = null;
  store.settings(function(s){ S = s; if (["welcome","zeit"].indexOf(st.step) >= 0 || st.step === "status") render(); });
  store.belegung(function(b){ B = b; if (["welcome","zeit","res"].indexOf(st.step) >= 0){ st._keepScroll = true; render(); } });

  function belegungCard(withOwn){
    var now = Date.now(), open = todayAt(S.oeffnet, now), close = todayAt(S.schliesst, now);
    var fresh = B && B.updatedAt > now - 15 * 60000 && dayKey(B.updatedAt) === dayKey(now);
    var head, own = null, warn = "";
    if (now < open) head = 'Heute geöffnet von ' + esc(S.oeffnet) + ' bis ' + esc(S.schliesst) + ' Uhr.';
    else if (now > close) head = 'Für heute ist das Zelt geschlossen.';
    else if (!fresh) head = 'Die aktuelle Belegung ist gerade nicht verfügbar – frag einfach kurz am Zelt.';
    else {
      var next = Math.max(B.next, now);
      if (next <= now + 2 * 60000) head = '<b class="free">Jetzt frei</b> – du kannst dein Auto direkt abgeben.';
      else head = '<b class="busy">Gerade belegt.</b> Nächster freier Platz ca. <b>' + hhmm(next) + ' Uhr</b> (in ' + Math.round((next - now) / 60000) + ' Min.).';
      if (withOwn){
        var p = 0, bf = Infinity, dur = resDur(S, st.est);
        for (var i = 0; i < (B.plaetze || 1); i++){
          var blocks = (B.bars || []).filter(function(b){ return b.k === "res" && b.p === i; });
          var f = earliestFree(Math.max(now, (B.frei && B.frei[i]) || now), dur, blocks); if (f < bf){ bf = f; p = i; }
        }
        own = { p: p, from: bf, to: bf + st.est * 60000 };
        if (own.from > now + 2 * 60000) warn += '<p class="small" style="margin-top:6px;">Wenn du jetzt abgibst, starten wir voraussichtlich um ' + hhmm(own.from) + ' Uhr. Die Zeit läuft erst ab Start.</p>';
        if (own.to > close) warn += '<p class="small" style="margin-top:6px;color:var(--danger)">Achtung: Das wird knapp – wir schließen um ' + esc(S.schliesst) + ' Uhr.</p>';
      }
    }
    var tl = fresh && now >= open && now <= close ? timeline({ bars: B.bars || [], plaetze: B.plaetze || 1 }, S, now, { own: own }) : "";
    return '<div class="label">Heute im Zelt</div><div class="cz-card belegung"><p class="bel-head">' + head + '</p>' + tl + warn + '</div>';
  }


  function watch(id){
    if (unsubJob) unsubJob();
    st.jobId = id;
    unsubJob = store.job(id, function(j){
      if (!j){ st.job = null; return render(); }
      st.job = j;
      if (j.status === "bezahlt" || j.status === "storniert") lsSet(MY, { id: id, until: Date.now() + 2*3600000 });
      if (st.step === "schluessel" && j.status !== "angemeldet") st.step = "status";
      render();
    });
  }

  function header(){
    var idx = STEPS.indexOf(st.step), p = "";
    if (idx >= 0){ p = '<div class="progress">'; for (var i = 0; i < STEPS.length; i++) p += '<i class="' + (i <= idx ? "on" : "") + '"></i>'; p += "</div>"; }
    var right = (st.step === "welcome") ? '<button class="chip-btn" data-act="find" type="button">Status</button>' :
                (idx > 0 && !(st.step === "schluessel" && st.jobId)) ? '<button class="chip-btn" data-act="back" type="button">← Zurück</button>' : "";
    return '<div class="top"><div class="cz-logo">CCV</div><div class="top-t"><b>CCV Shop &amp; Clean</b><span>Pop-up-Zelt · ' + esc(CFG.standort) + '</span></div>' + right + '</div>' + p;
  }

  function vWelcome(){
    return '' +
    '<div class="cz-hero"><img class="hero-pic" src="' + img(IMG.hero) + '" alt=""><div class="eyebrow">Pop-up · ' + esc(CFG.standort) + '</div><h1 class="h1">Herzlich willkommen bei CCV Shop &amp; Clean</h1>' +
    '<p class="cz-lead">Du gehst einkaufen – wir pflegen in der Zeit den Innenraum deines Autos.</p>' +
    (CFG.premiere && Date.now() < new Date(CFG.premiere).getTime() ? '<div class="premiere">' + esc(CFG.premiereText) + '</div>' : '') +
    '<div class="price-row"><div class="price-box"><span>pro Minute</span><b>' + euro(S.rateCents) + '</b></div>' +
    '<div class="price-box"><span>Mindestbetrag</span><b>' + euroS(S.minCents) + '</b></div></div></div>' +

    belegungCard(false) +
    (st.res && st.res.status !== "storniert" ? '<button class="cz-btn cz-btn-secondary" data-act="showRes" type="button">Deine Reservierung: ' + dayLabel(st.res.day) + ', ' + hhmm(st.res.from) + ' Uhr ansehen</button>'
      : (openDays().length && CFG.stripeLink ? '<button class="cz-btn cz-btn-secondary" data-act="toRes" type="button">📅 Platz vorab reservieren · ' + euroS(S.resCents) + '</button><p class="small center" style="margin-top:6px;">Wird mit dem Pflegepreis verrechnet.</p>' : '')) +
    '<div class="label">So funktioniert’s</div>' +
    '<div class="cz-card"><div class="cz-steps">' +
      '<div class="step"><div><b>Einkaufszeit schätzen</b><span>Du siehst sofort, was es ungefähr kostet.</span></div></div>' +
      '<div class="step"><div><b>Kennzeichen & Handynummer</b><span>Damit wir dein Auto zuordnen und dich erreichen können.</span></div></div>' +
      '<div class="step"><div><b>Wünsche wählen</b><span>Tipp an, was dir am wichtigsten ist – wir fangen dort an. Was die Zeit nicht hergibt, bleibt offen.</span></div></div>' +
      '<div class="step"><div><b>Schlüssel abgeben</b><span>Du und wir bestätigen die Übergabe. Ab dann läuft die Zeit.</span></div></div>' +
      '<div class="step"><div><b>Stopp drücken & abholen</b><span>Wenn du fertig bist, drückst du in der App auf Stopp.</span></div></div>' +
    '</div></div>' +

    '<div class="label">So sieht’s danach aus</div>' +
    '<div class="cz-chips ba-switch">' + ["kofferraum","fussraum"].map(function(k){ return '<button class="chip" data-ba="' + k + '" type="button" aria-pressed="' + (st.ba === k) + '">' + (k === "kofferraum" ? "Kofferraum" : "Fußraum") + '</button>'; }).join("") + '</div>' +
    '<div class="ba"><figure><img src="' + img(IMG.ba[st.ba][0]) + '" alt="Vorher" loading="lazy"><figcaption>Vorher</figcaption></figure>' +
    '<figure><img src="' + img(IMG.ba[st.ba][1]) + '" alt="Nachher" loading="lazy"><figcaption class="after">Nachher</figcaption></figure></div>' +
    '<p class="small" style="margin-top:6px;">Echte Fotos aus unseren Aufträgen.</p>' +

    '<div class="warn"><b>Wichtig nach dem Stopp:</b> Du hast ' + S.graceMin + ' Minuten Zeit, zum Auto zu kommen und zu bezahlen. ' +
    'Danach kostet jede angefangene ' + S.blockMin + ' Minuten ' + euroS(S.blockCents) + ' Standgebühr – am Auto wird dann nichts mehr gemacht.</div>' +

    '<div class="label">Bedingungen & Datenschutz</div>' + czLegal() +

    '<button class="check" data-act="acc1" type="button" aria-pressed="' + st.acc1 + '"><span class="box">' + (st.acc1 ? "✓" : "") + '</span><span class="t">Ich habe die Bedingungen gelesen und bin einverstanden.</span></button>' +
    '<button class="check" data-act="acc2" type="button" aria-pressed="' + st.acc2 + '"><span class="box">' + (st.acc2 ? "✓" : "") + '</span><span class="t">Ich habe die Datenschutzhinweise gelesen. Kennzeichen und Handynummer dürfen für diesen Auftrag gespeichert werden.</span></button>' +
    '<button class="cz-btn cz-btn-primary" data-act="next" type="button"' + (st.acc1 && st.acc2 ? "" : " disabled") + '>Los geht’s</button>' +
    '<button class="cz-btn-link" data-act="find" type="button">Auto schon abgegeben? Status ansehen</button>';
  }

  function czLegal(){
    return '' +
    '<details class="cz-legal"><summary>Leistung & Preis</summary><div>' +
      '<p>Wir pflegen den Innenraum deines Fahrzeugs nach Zeit. Wir arbeiten die von dir gewählten Bereiche in deiner Reihenfolge ab, soweit die Zeit reicht. Ein bestimmter Umfang oder ein bestimmtes Ergebnis ist nicht vereinbart.</p>' +
      '<p>Preis: ' + euro(S.rateCents) + ' pro Minute ab bestätigter Schlüsselübergabe bis zum Stopp. Jede angefangene Minute zählt voll. Mindestbetrag ' + euroS(S.minCents) + '. Der in der App angezeigte Schätzpreis ist unverbindlich.</p>' +
      '<p>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.</p></div></details>' +
    '<details class="cz-legal"><summary>Stopp, Abholung & Standgebühr</summary><div>' +
      '<p>Die Zeit läuft, bis du in der App auf Stopp drückst oder wir den Stopp setzen, wenn du am Fahrzeug bist. Nach dem Stopp werden keine Arbeiten mehr durchgeführt.</p>' +
      '<p>Ab dem Stopp hast du ' + S.graceMin + ' Minuten Zeit, dein Fahrzeug abzuholen und zu bezahlen. Danach berechnen wir je angefangene ' + S.blockMin + ' Minuten ' + euroS(S.blockCents) + ' Standgebühr.</p></div></details>' +
    '<details class="cz-legal"><summary>Schlüssel & Fahrzeug</summary><div>' +
      '<p>Die Schlüsselübergabe wird von dir und von uns in der App bestätigt. Wir verwahren den Schlüssel und geben ihn nur an dich zurück, wenn du Kennzeichen und deinen Code (letzte 4 Ziffern deiner Handynummer) nennst.</p>' +
      '<p>Das Fahrzeug wird höchstens auf dem Parkplatzgelände zum Zelt und zurück rangiert und nicht im öffentlichen Straßenverkehr bewegt.</p></div></details>' +
    '<details class="cz-legal"><summary>Wertsachen & Haftung</summary><div>' +
      '<p>Bitte nimm Wertsachen (Geld, Papiere, Elektronik) vor der Abgabe aus dem Fahrzeug. Weise uns bitte bei der Übergabe auf bekannte Vorschäden hin.</p>' +
      '<p>Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie für Schäden aus der Verletzung von Leben, Körper oder Gesundheit. Bei leichter Fahrlässigkeit haften wir nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vorhersehbaren, typischen Schaden.</p></div></details>' +
    '<details class="cz-legal"><summary>Bezahlung</summary><div>' +
      '<p>Bezahlt wird vor Ort bei der Schlüsselrückgabe, mit Karte oder bar. Du bekommst auf Wunsch einen Beleg.</p></div></details>' +
    '<details class="cz-legal"><summary>Datenschutz</summary><div>' +
      '<p>Wir speichern Kennzeichen, Handynummer, deine Pflege-Wünsche sowie Start-, Stopp- und Zahlungszeit. Zweck: Abwicklung deines Auftrags und Rückfragen während des Einkaufs (Art. 6 Abs. 1 lit. b DSGVO).</p>' +
      '<p>Die Handynummer löschen wir spätestens 30 Tage nach dem Auftrag. Abrechnungsdaten bewahren wir so lange auf, wie es steuerrechtlich vorgeschrieben ist. Die Daten liegen bei Google Firebase auf Servern in der EU. Weitere Infos und deine Rechte: <a href="' + esc(CFG.datenschutzUrl) + '" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p></div></details>' +
    '<p class="small" style="margin-top:10px;">Anbieter: ' + esc(CFG.firma) + ' · <a href="' + esc(CFG.impressumUrl) + '" target="_blank" rel="noopener">Impressum</a></p>';
  }

  function vZeit(){
    var back = new Date(Date.now() + st.est * 60000);
    var est = Math.max(S.minCents, st.est * S.rateCents);
    var chipsHtml = [15,20,30,45,60,90].map(function(m){ return '<button class="chip" data-min="' + m + '" type="button" aria-pressed="' + (st.est === m) + '">' + m + ' Min</button>'; }).join("");
    return '<h2 class="h2">Wie lange gehst du ungefähr einkaufen?</h2><p class="cz-lead">Nur eine Schätzung – bezahlt wird die echte Zeit bis zum Stopp.</p>' +
      '<div class="time-big"><b class="cz-mono" id="ccvEstMin">' + st.est + '</b><span>Minuten</span></div>' +
      '<input type="range" id="ccvRange" min="10" max="120" step="5" value="' + st.est + '" aria-label="Einkaufszeit in Minuten">' +
      '<div class="cz-chips">' + chipsHtml + '</div>' +
      '<div class="est"><div><div class="small">ca. Preis</div><div class="small">zurück ca. <b id="ccvBack" style="font-size:14px;color:var(--ink)">' + hhmm(back) + ' Uhr</b></div></div><b id="ccvEstPrice">' + euro(est) + '</b></div>' +
      '<div id="ccvBel">' + belegungCard(true) + '</div>' +
      (openDays().length && CFG.stripeLink ? '<button class="cz-btn-link" data-act="toRes" type="button">Lieber einen festen Platz reservieren (' + euroS(S.resCents) + ')</button>' : '') +
      '<button class="cz-btn cz-btn-primary" data-act="next" type="button">Weiter</button>';
  }

  function vDaten(){
    return '<h2 class="h2">Dein Auto & wie wir dich erreichen</h2><p class="cz-lead">Falls etwas ist, rufen wir dich kurz an.</p>' +
      '<div class="field"><label for="ccvPlate">Kennzeichen</label><input id="ccvPlate" class="plate" type="text" autocomplete="off" autocapitalize="characters" placeholder="FB-CC 123" value="' + esc(st.plate) + '"></div>' +
      '<div class="field"><label for="ccvPhone">Handynummer</label><input id="ccvPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0170 1234567" value="' + esc(st.phone) + '">' +
      '<div class="hint">Die letzten 4 Ziffern sind dein persönlicher Code für die Schlüsselrückgabe.</div></div>' +
      (st.err ? '<div class="err">' + esc(st.err) + '</div>' : '') +
      '<button class="cz-btn cz-btn-primary" data-act="next" type="button">Weiter</button>';
  }

  function carSvg(){
    var sel = function(id){ return st.prefs.indexOf(id) >= 0 ? " sel" : ""; };
    var badge = function(id, x, y){ var i = st.prefs.indexOf(id); return i < 0 ? "" : '<g class="badge" pointer-events="none"><circle cx="' + x + '" cy="' + y + '" r="13"/><text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle">' + (i + 1) + '</text></g>'; };
    return '<svg class="car-svg' + (st.carDone ? '' : ' drive') + '" viewBox="0 0 200 390" role="img" aria-label="Auto von oben – tippe die Bereiche an">' +
      '<defs><linearGradient id="ccvBody" x1="0" x2="1"><stop offset="0" stop-color="#1f1c17"/><stop offset=".5" stop-color="#4a4338"/><stop offset="1" stop-color="#1f1c17"/></linearGradient>' +
      '<clipPath id="ccvClip"><rect x="28" y="14" width="144" height="362" rx="54"/></clipPath></defs>' +
      '<g class="wheel"><rect x="14" y="70" width="18" height="52" rx="7" fill="#1a1814"/><rect x="168" y="70" width="18" height="52" rx="7" fill="#1a1814"/>' +
      '<rect x="14" y="268" width="18" height="52" rx="7" fill="#1a1814"/><rect x="168" y="268" width="18" height="52" rx="7" fill="#1a1814"/></g>' +
      '<rect x="28" y="14" width="144" height="362" rx="54" fill="url(#ccvBody)"/>' +
      '<rect x="19" y="118" width="12" height="8" rx="3" fill="#1f1c17"/><rect x="169" y="118" width="12" height="8" rx="3" fill="#1f1c17"/>' +
      '<path d="M44 108 Q100 92 156 108 L150 132 Q100 122 50 132 Z" fill="#cfd8db" opacity=".9"/>' +
      '<path d="M50 290 Q100 300 150 290 L154 312 Q100 324 46 312 Z" fill="#cfd8db" opacity=".9"/>' +
      '<rect x="48" y="136" width="104" height="150" rx="12" fill="#14120e"/>' +
      '<rect x="52" y="140" width="96" height="16" rx="5" fill="#3a342b"/>' +
      '<rect x="56" y="166" width="38" height="44" rx="10" fill="#6b5d48"/><rect x="106" y="166" width="38" height="44" rx="10" fill="#6b5d48"/>' +
      '<rect x="56" y="226" width="88" height="46" rx="12" fill="#6b5d48"/>' +
      '<rect x="52" y="320" width="96" height="40" rx="10" fill="#14120e"/>' +
      '<g clip-path="url(#ccvClip)"><rect class="shine" x="28" y="0" width="144" height="26" fill="url(#ccvBody)" opacity="0" style="fill:#fff"/></g>' +
      '<path class="zone' + sel("scheiben") + '" data-zone="scheiben" d="M44 108 Q100 92 156 108 L150 132 Q100 122 50 132 Z M50 290 Q100 300 150 290 L154 312 Q100 324 46 312 Z"/>' +
      '<rect class="zone' + sel("cockpit") + '" data-zone="cockpit" x="50" y="138" width="100" height="22" rx="6"/>' +
      '<rect class="zone' + sel("vorne") + '" data-zone="vorne" x="50" y="162" width="100" height="54" rx="10"/>' +
      '<rect class="zone' + sel("hinten") + '" data-zone="hinten" x="50" y="220" width="100" height="60" rx="10"/>' +
      '<rect class="zone' + sel("kofferraum") + '" data-zone="kofferraum" x="50" y="318" width="100" height="44" rx="10"/>' +
      badge("scheiben", 100, 300) + badge("cockpit", 100, 149) + badge("vorne", 100, 189) + badge("hinten", 100, 250) + badge("kofferraum", 100, 340) +
    '</svg>';
  }

  function prioHint(){
    var n = st.prefs.length;
    var txt = n >= 2
      ? 'Mit ca. ' + st.est + ' Min schaffen wir eventuell <b>nicht alle ' + n + ' Bereiche</b>. Wir starten bei 1 und arbeiten uns vor, so weit die Zeit reicht.'
      : 'Wir arbeiten in deiner Reihenfolge, <b>so weit die Zeit reicht</b>. Bei kurzer Einkaufszeit schaffen wir eventuell nicht alle Bereiche.';
    return '<div class="warn" id="ccvPrioHint" style="margin:6px 0 12px;">' + txt + '</div>';
  }

  function vAuto(){
    var list = ZONES.map(function(z){
      var i = st.prefs.indexOf(z.id);
      return '<button class="prio" data-zone="' + z.id + '" type="button" aria-pressed="' + (i >= 0) + '"><span class="n">' + (i >= 0 ? i + 1 : "") + '</span>' + esc(z.label) + (IMG.zones[z.id] ? '<img class="thumb" src="' + img(IMG.zones[z.id]) + '" alt="" loading="lazy">' : '<span class="thumb ph">◫</span>') + '</button>';
    }).join("");
    return '<h2 class="h2">Was ist dir am wichtigsten?</h2><p class="cz-lead">Tippe die Bereiche in deiner Wunsch-Reihenfolge an – wir fangen bei 1 an.</p>' +
      '<div class="car-stage">' + carSvg() + '</div>' +
      prioHint() +
      '<div class="prio-list">' + list + '</div>' +
      '<div class="field"><label for="ccvNote">Noch was? (optional)</label><textarea id="ccvNote" placeholder="z. B. Kindersitz bitte drin lassen, Fleck auf dem Beifahrersitz">' + esc(st.note) + '</textarea></div>' +
      (st.err ? '<div class="err">' + esc(st.err) + '</div>' : '') +
      '<button class="cz-btn cz-btn-primary" data-act="next" type="button">Weiter zur Schlüsselübergabe</button>';
  }

  function vSchluessel(){
    var j = st.job;
    var keySvg = '<div class="key-ill"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="var(--accent-wash)"/><g class="k"><circle cx="44" cy="60" r="16" fill="none" stroke="var(--accent)" stroke-width="8"/><path d="M60 60 H96 M84 60 V72 M94 60 V68" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" fill="none"/></g></svg></div>';
    if (!st.jobId){
      return '<h2 class="h2">Schlüsselübergabe</h2><p class="cz-lead">Gib deinen Schlüssel einem CCV-Mitarbeiter am Zelt. Beide Seiten bestätigen die Übergabe.</p>' + keySvg +
        '<div class="cz-card center"><div class="plate-badge"><i>D</i><span>' + esc(st.plate.toUpperCase()) + '</span></div>' +
        '<div class="small" style="margin-top:8px;">ca. ' + st.est + ' Min · ' + (st.prefs.length ? st.prefs.map(function(z,i){ return (i+1) + ". " + zoneLabel(z); }).join(", ") : "keine Vorgabe") + '</div>' +
        (st.prefs.length ? '<div class="small" style="margin-top:4px;">Reihenfolge = Priorität. Was die Zeit nicht hergibt, bleibt offen.</div>' : '') + '</div>' +
        '<button class="check" data-act="val" type="button" aria-pressed="' + st.val + '"><span class="box">' + (st.val ? "✓" : "") + '</span><span class="t">Ich habe meine Wertsachen aus dem Auto genommen.</span></button>' +
        '<button class="check" data-act="key" type="button" aria-pressed="' + st.key + '"><span class="box">' + (st.key ? "✓" : "") + '</span><span class="t">Ich übergebe meinen Fahrzeugschlüssel jetzt an CCV.</span></button>' +
        (st.err ? '<div class="err">' + esc(st.err) + '</div>' : '') +
        '<button class="cz-btn cz-btn-primary" data-act="handover" type="button"' + (st.val && st.key && !st.busy ? "" : " disabled") + '>' + (st.busy ? "Wird gesendet…" : "Übergabe bestätigen") + '</button>';
    }
    return '<h2 class="h2">Fast geschafft!</h2><p class="cz-lead">Zeig diesen Bildschirm dem CCV-Mitarbeiter. Sobald er die Übergabe bestätigt, startet die Zeit.</p>' + keySvg +
      '<div class="cz-card center"><div class="plate-badge"><i>D</i><span>' + esc(j ? j.plate : st.plate.toUpperCase()) + '</span></div>' +
      '<div class="small" style="margin-top:8px;">Dein Code: <b class="cz-mono" style="font-size:16px;color:var(--ink)">' + esc(pinOf(st.phone)) + '</b></div></div>' +
      '<div class="party"><div class="ok"><i>✓</i>Du hast übergeben</div><div class="wait"><i>⏳</i><span class="dots">CCV bestätigt</span></div></div>' +
      '<button class="cz-btn-link" data-act="cancelJob" type="button" style="color:var(--danger)">Doch nicht – abbrechen</button>';
  }

  function vRes(){
    var days = openDays();
    if (!days.length) return '<h2 class="h2">Reservierung</h2><div class="empty" style="margin-top:14px;">Gerade sind keine Termine zum Reservieren freigegeben.</div><button class="cz-btn-link" data-act="home" type="button">Zurück</button>';
    if (days.indexOf(st.rDay) < 0){ st.rDay = days[0]; watchDay(st.rDay); st.rTime = 0; }
    var starts = freeStarts(st.rDay);
    if (starts.indexOf(st.rTime) < 0) st.rTime = 0;
    var dayChips = days.map(function(d){ return '<button class="chip" data-rday="' + d + '" type="button" aria-pressed="' + (d === st.rDay) + '">' + dayLabel(d) + '</button>'; }).join("");
    var estChips = [15,20,30,45,60,90].map(function(m){ return '<button class="chip" data-rest="' + m + '" type="button" aria-pressed="' + (st.est === m) + '">' + m + ' Min</button>'; }).join("");
    var timeChips = starts.length ? starts.map(function(t){ return '<button class="chip" data-rtime="' + t + '" type="button" aria-pressed="' + (t === st.rTime) + '">' + hhmm(t) + '</button>'; }).join("")
      : '<div class="empty" style="width:100%">An diesem Tag ist leider nichts mehr frei.</div>';
    var ok = st.rTime && normPlate(st.plate).length >= 4 && digits(st.phone).length >= 7 && st.rName.length > 1 && st.rAcc1 && st.rAcc2;
    return '<h2 class="h2">Platz reservieren</h2><p class="cz-lead">Sicher dir eine feste Uhrzeit. Die ' + euroS(S.resCents) + ' werden später mit dem Pflegepreis verrechnet.</p>' +
      '<div class="label">Tag</div><div class="cz-chips">' + dayChips + '</div>' +
      '<div class="label">Wie lange kaufst du ungefähr ein?</div><div class="cz-chips">' + estChips + '</div>' +
      '<div class="label">Freie Uhrzeiten (Ankunft am Zelt)</div><div class="cz-chips times">' + timeChips + '</div>' +
      '<div class="field"><label for="ccvRName">Dein Name</label><input id="ccvRName" type="text" autocomplete="name" value="' + esc(st.rName) + '"></div>' +
      '<div class="field"><label for="ccvPlate">Kennzeichen</label><input id="ccvPlate" class="plate" type="text" autocomplete="off" autocapitalize="characters" placeholder="FB-CC 123" value="' + esc(st.plate) + '"></div>' +
      '<div class="field"><label for="ccvPhone">Handynummer</label><input id="ccvPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0170 1234567" value="' + esc(st.phone) + '"></div>' +
      '<div class="warn" style="margin-top:14px;"><b>Verbindlich:</b> Die Reservierung kostet ' + euroS(S.resCents) + ' und wird sofort per Karte, Apple Pay o. ä. bezahlt. Den Betrag ziehen wir beim Bezahlen am Zelt vom Pflegepreis ab. ' +
        'Bist du ' + S.kulanzMin + ' Minuten nach der reservierten Zeit nicht da, verfällt die Reservierung und wir behalten die ' + euroS(S.resCents) + ' als Ausfallentschädigung; dir bleibt der Nachweis, dass uns kein oder ein geringerer Schaden entstanden ist. ' +
        'Absage bis 24 Stunden vorher (Anruf/WhatsApp): Betrag zurück.</div>' +
      '<button class="check" data-act="rAcc1" type="button" aria-pressed="' + st.rAcc1 + '"><span class="box">' + (st.rAcc1 ? "✓" : "") + '</span><span class="t">Ich akzeptiere die Reservierungs- und <a href="agb.html" target="_blank" rel="noopener">Geschäftsbedingungen</a> und habe die <a href="' + esc(CFG.datenschutzUrl) + '" target="_blank" rel="noopener">Datenschutzhinweise</a> gelesen.</span></button>' +
      '<button class="check" data-act="rAcc2" type="button" aria-pressed="' + st.rAcc2 + '"><span class="box">' + (st.rAcc2 ? "✓" : "") + '</span><span class="t">Ich verlange ausdrücklich, dass ihr den Platz für mich reserviert und die Leistung zum gewählten Termin erbringt – auch vor Ablauf der <a href="widerruf.html" target="_blank" rel="noopener">Widerrufsfrist</a>.</span></button>' +
      (st.err ? '<div class="err">' + esc(st.err) + '</div>' : '') +
      '<button class="cz-btn cz-btn-primary" data-act="payRes" type="button"' + (ok && !st.busy ? '' : ' disabled') + '>' + (st.busy ? 'Einen Moment …' : 'Weiter zur Bezahlung · ' + euroS(S.resCents)) + '</button>' +
      '<p class="small center" style="margin-top:8px;">Bezahlt wird sicher über Stripe. Dort gibst du noch einmal dein Kennzeichen ein.</p>' +
      '<button class="cz-btn-link" data-act="home" type="button">Zurück zum Start</button>';
  }

  function vResOk(){
    var r = st.res;
    if (!r) return '<h2 class="h2">Reservierung</h2><div class="empty" style="margin-top:14px;">Wird geladen …</div><button class="cz-btn-link" data-act="home" type="button">Zum Start</button>';
    var bis = r.from + (S.kulanzMin || 15) * 60000;
    var stat = r.status === "verfallen" ? '<b style="color:var(--danger)">verfallen</b>' : r.status === "storniert" ? '<b style="color:var(--danger)">storniert</b>' :
      r.status === "erschienen" ? '<b class="free">eingecheckt ✓</b>' : (r.paid ? '<b class="free">bezahlt ✓ – dein Platz ist fest</b>' : '<b class="busy">Zahlung wird geprüft …</b>');
    return '<h2 class="h2">Danke, dein Platz ist reserviert!</h2>' +
      '<div class="center" style="margin:14px 0;"><div class="plate-badge"><i>D</i><span>' + esc(r.plate) + '</span></div></div>' +
      '<div class="cz-card"><div class="rows">' +
        '<div class="row"><span>Tag</span><span>' + dayLabel(r.day) + '</span></div>' +
        '<div class="row"><span>Ankunft am Zelt</span><span>' + hhmm(r.from) + ' Uhr</span></div>' +
        '<div class="row"><span>Spätestens da bis</span><span>' + hhmm(bis) + ' Uhr</span></div>' +
        '<div class="row"><span>Einkaufszeit (geschätzt)</span><span>' + (r.estMin || 30) + ' Min</span></div>' +
        '<div class="row"><span>Reservierung</span><span>' + euro(r.resCents || S.resCents) + '</span></div>' +
        '<div class="row"><span>Status</span><span>' + stat + '</span></div></div></div>' +
      '<p class="small" style="margin-top:12px;">Am Tag einfach zum Zelt kommen und wie gewohnt einchecken (QR-Code oder diese Seite). Die ' + euroS(r.resCents || S.resCents) + ' werden beim Bezahlen abgezogen. Absagen bis 24 Std. vorher: ' + '<a href="tel:+4915126718415">0151 26718415</a> oder WhatsApp.</p>' +
      '<button class="cz-btn cz-btn-primary" data-act="home" type="button">Zur Startseite</button>';
  }

  function vFind(){
    return '<h2 class="h2">Status ansehen</h2><p class="cz-lead">Gib einfach dein Kennzeichen ein.</p>' +
      '<div class="field"><label for="ccvFPlate">Kennzeichen</label><input id="ccvFPlate" class="plate" type="text" autocomplete="off" autocapitalize="characters" placeholder="FB-CC 123" value="' + esc(st.plate) + '"></div>' +
      (st.err ? '<div class="err">' + esc(st.err) + '</div>' : '') +
      '<button class="cz-btn cz-btn-primary" data-act="doFind" type="button">Status anzeigen</button>' +
      '<button class="cz-btn-link" data-act="home" type="button">Zurück zum Start</button>';
  }

  function vStatus(){
    var j = st.job;
    if (!j) return '<div class="empty" style="margin-top:20px;">Auftrag wird geladen…</div><button class="cz-btn-link" data-act="leave" type="button">Neuen Auftrag starten</button>';
    var c = calc(j, S), plate = '<div class="center" style="margin:4px 0 14px;"><div class="plate-badge"><i>D</i><span>' + esc(j.plate) + '</span></div></div>';
    var prefs = j.prefs && j.prefs.length ? '<div class="tags" style="justify-content:center;margin-top:12px;">' + j.prefs.map(function(p,i){ return '<span class="tag">' + (i+1) + '. ' + esc(zoneLabel(p)) + '</span>'; }).join("") + '</div>' : "";

    if (j.status === "angemeldet"){ st.step = "schluessel"; return vSchluessel(); }
    if (j.status === "storniert") return plate + '<div class="meter"><div class="ml">Auftrag</div><div class="mt" style="font-size:30px;">Abgebrochen</div><div class="ms">Bei Fragen sprich uns am Zelt an.</div></div><button class="cz-btn cz-btn-secondary" data-act="leave" type="button">Neuen Auftrag starten</button>';
    if (j.status === "laeuft"){
      return plate + '<div class="meter"><div class="ml"><span class="live-dot"></span>Wir pflegen dein Auto</div>' +
        '<div class="mt" id="ccvT">' + clock(Date.now() - j.startedAt) + '</div><div class="mp" id="ccvP">' + euro(c.total) + '</div>' +
        '<div class="ms">Start ' + hhmm(j.startedAt) + ' · geplant zurück ca. ' + hhmm(j.startedAt + j.estMin*60000) + '</div>' + prefs + (j.prefs && j.prefs.length > 1 ? '<div class="ms" style="margin-top:6px;font-size:12px;">Wir arbeiten in dieser Reihenfolge, so weit die Zeit reicht.</div>' : '') + '</div>' +
        (st.confirmStop ?
          '<div class="cz-card" style="margin-top:14px;"><b>Wirklich stoppen?</b><p class="small" style="margin-top:4px;">Ab dann wird nichts mehr gemacht und du hast ' + S.graceMin + ' Min Zeit zum Abholen und Bezahlen.</p>' +
          '<div class="cz-btn-row"><button class="cz-btn cz-btn-secondary" data-act="noStop" type="button">Weiter pflegen</button><button class="cz-btn cz-btn-danger" data-act="yesStop" type="button">Ja, stoppen</button></div></div>'
          : '<button class="stop-btn" data-act="stop" type="button"><i></i>Stopp – ich bin fertig</button>') +
        '<p class="small center" style="margin-top:10px;">Du kannst die Seite schließen. Zum Wiederkommen einfach dein Kennzeichen eingeben.</p>';
    }
    if (j.status === "gestoppt"){
      var over = c.graceLeft < 0;
      return plate + '<div class="meter ' + (over ? "over" : "grace") + '"><div class="ml">' + (over ? "Abholzeit überschritten" : "Bitte zum Auto kommen") + '</div>' +
        '<div class="mt" id="ccvG">' + (over ? "+" + clock(-c.graceLeft) : clock(c.graceLeft)) + '</div>' +
        '<div class="ms" id="ccvGs">' + (over ? "Standgebühr: " + c.blocks + " × " + euroS(S.blockCents) : "Zeit zum Abholen & Bezahlen") + '</div></div>' +
        '<div class="cz-card" style="margin-top:12px;"><div class="rows">' +
          '<div class="row"><span>Pflege (' + c.min + ' Min)</span><span class="cz-mono">' + euro(c.work) + '</span></div>' +
          '<div class="row"><span>Standgebühr</span><span class="cz-mono" id="ccvFee">' + euro(c.fee) + '</span></div>' +
          (c.deposit ? '<div class="row"><span>Reservierung (bereits bezahlt)</span><span class="cz-mono">−' + euro(c.deposit) + '</span></div>' : '') +
          '<div class="row total"><span>Zu zahlen</span><span class="cz-mono" id="ccvTot">' + euro(c.total) + '</span></div></div></div>' +
        '<p class="small center" style="margin-top:10px;">Am Auto wird nichts mehr gemacht. Bezahlung mit Karte oder bar am Zelt.</p>';
    }
    return plate + '<div class="meter"><div class="ml">Danke!</div><div class="mt" style="font-size:34px;">Bezahlt</div><div class="mp">' + euro(c.total) + '</div><div class="ms">Gute Fahrt – bis zum nächsten Einkauf!</div></div>' +
      '<button class="cz-btn cz-btn-secondary" data-act="leave" type="button">Fertig</button>';
  }

  function render(){
    var v = { welcome: vWelcome, zeit: vZeit, daten: vDaten, auto: vAuto, schluessel: vSchluessel, find: vFind, status: vStatus, res: vRes, resok: vResOk }[st.step]();
    var y = st._keepScroll ? window.scrollY : null;
    root.innerHTML = (DEMO ? '<div class="demo-bar">Demo-Modus – Daten nur in diesem Browser</div>' : '') + '<div class="cz-wrap">' + header() + v + '</div>';
    bind();
    if (st.step === "auto") st.carDone = true;
    if (y !== null) window.scrollTo(0, y);
    st._keepScroll = false;
  }
  function go(step){ st.err = ""; st.step = step; render(); try { root.scrollIntoView({ block: "start" }); } catch(e){} }

  function bind(){
    on('[data-act="acc1"]', "click", function(){ st.acc1 = !st.acc1; st._keepScroll = true; render(); });
    on('[data-act="acc2"]', "click", function(){ st.acc2 = !st.acc2; st._keepScroll = true; render(); });
    on('[data-act="val"]', "click", function(){ st.val = !st.val; st._keepScroll = true; render(); });
    on('[data-act="key"]', "click", function(){ st.key = !st.key; st._keepScroll = true; render(); });
    on('[data-act="find"]', "click", function(){ go("find"); });
    on('[data-act="toRes"]', "click", function(){ saveInputs(); go("res"); });
    on('[data-act="showRes"]', "click", function(){ go("resok"); });
    on("[data-rday]", "click", function(e, el){ saveInputs(); st.rDay = el.getAttribute("data-rday"); st.rTime = 0; watchDay(st.rDay); st._keepScroll = true; render(); });
    on("[data-rest]", "click", function(e, el){ saveInputs(); st.est = +el.getAttribute("data-rest"); st._keepScroll = true; render(); });
    on("[data-rtime]", "click", function(e, el){ saveInputs(); st.rTime = +el.getAttribute("data-rtime"); st._keepScroll = true; render(); });
    on('[data-act="rAcc1"]', "click", function(e){ if (e.target.tagName === "A") return; saveInputs(); st.rAcc1 = !st.rAcc1; st._keepScroll = true; render(); });
    on('[data-act="rAcc2"]', "click", function(e){ if (e.target.tagName === "A") return; saveInputs(); st.rAcc2 = !st.rAcc2; st._keepScroll = true; render(); });
    on('[data-act="payRes"]', "click", payRes);
    ["#ccvRName","#ccvPlate","#ccvPhone"].forEach(function(sel){ var el = $(sel); if (el && st.step === "res") el.addEventListener("input", function(){ saveInputs(); var b = $('[data-act="payRes"]');
      if (b) b.disabled = !(st.rTime && normPlate(st.plate).length >= 4 && digits(st.phone).length >= 7 && st.rName.length > 1 && st.rAcc1 && st.rAcc2); }); });
    on('[data-act="home"]', "click", function(){ go("welcome"); });
    on('[data-act="back"]', "click", function(){ var i = STEPS.indexOf(st.step); saveInputs(); go(STEPS[Math.max(0, i - 1)]); });
    on('[data-act="next"]', "click", next);
    on("[data-ba]", "click", function(e, el){ st.ba = el.getAttribute("data-ba"); st._keepScroll = true; render(); });
    on("[data-min]", "click", function(e, el){ st.est = +el.getAttribute("data-min"); st._keepScroll = true; render(); });
    var r = $("#ccvRange");
    if (r) r.addEventListener("input", function(){
      st.est = +r.value; $("#ccvEstMin").textContent = st.est;
      $("#ccvEstPrice").textContent = euro(Math.max(S.minCents, st.est * S.rateCents));
      $("#ccvBack").textContent = hhmm(Date.now() + st.est * 60000) + " Uhr";
      var bel = $("#ccvBel"); if (bel) bel.innerHTML = belegungCard(true);
      Array.prototype.forEach.call(root.querySelectorAll("[data-min]"), function(c){ c.setAttribute("aria-pressed", +c.getAttribute("data-min") === st.est); });
    });
    on("[data-zone]", "click", function(e, el){
      saveInputs();
      var z = el.getAttribute("data-zone"), i = st.prefs.indexOf(z);
      if (i >= 0) st.prefs.splice(i, 1); else st.prefs.push(z);
      st._keepScroll = true; render();
    });
    on('[data-act="handover"]', "click", handover);
    on('[data-act="cancelJob"]', "click", function(){ if (st.jobId) store.cancel(st.jobId); lsSet(MY, null); reset(); });
    on('[data-act="doFind"]', "click", doFind);
    on('[data-act="stop"]', "click", function(){ st.confirmStop = true; render(); });
    on('[data-act="noStop"]', "click", function(){ st.confirmStop = false; render(); });
    on('[data-act="yesStop"]', "click", function(){ st.confirmStop = false; store.stop(st.jobId); });
    on('[data-act="leave"]', "click", function(){ lsSet(MY, null); reset(); });
  }
  function saveInputs(){
    var p = $("#ccvPlate"), t = $("#ccvPhone"), n = $("#ccvNote"), rn = $("#ccvRName");
    if (rn) st.rName = rn.value.trim();
    if (p) st.plate = p.value.trim(); if (t) st.phone = t.value.trim(); if (n) st.note = n.value.trim();
  }
  function next(){
    saveInputs();
    if (st.step === "welcome") return go("zeit");
    if (st.step === "zeit") return go("daten");
    if (st.step === "daten"){
      if (normPlate(st.plate).length < 4){ st.err = "Bitte gib ein gültiges Kennzeichen ein."; return render(); }
      if (digits(st.phone).length < 7){ st.err = "Bitte gib eine gültige Handynummer ein."; return render(); }
      return go("auto");
    }
    if (st.step === "auto") return go("schluessel");
  }
  function handover(){
    if (st.busy) return;
    st.busy = true; st.err = ""; render();
    var pin = pinOf(st.phone), now = Date.now();
    var job = {
      plate: st.plate.toUpperCase().replace(/\s+/g, " "), plateKey: normPlate(st.plate), phone: st.phone, pin: pin,
      estMin: st.est, prefs: st.prefs.slice(), note: st.note.slice(0, 300),
      status: "angemeldet", createdAt: now, keyCustomerAt: now, consentAt: now,
      startedAt: null, stoppedAt: null, paidAt: null, dayKey: dayKey(now)
    };
    store.create(job, lookupKey(st.plate)).then(function(id){
      st.busy = false; lsSet(MY, { id: id, until: now + 12*3600000 }); watch(id);
    }).catch(function(e){
      st.busy = false;
      st.err = e.message === "exists" ? "Für dieses Kennzeichen läuft heute schon ein Auftrag. Bitte sprich uns am Zelt an." : "Verbindung fehlgeschlagen. Bitte nochmal versuchen.";
      render();
    });
  }
  function payRes(){
    saveInputs();
    if (st.busy) return;
    var dur = resDur(S, st.est);
    if (!st.rTime || freeStarts(st.rDay).indexOf(st.rTime) < 0){ st.err = "Diese Uhrzeit ist gerade nicht mehr frei. Bitte wähle eine andere."; return render(); }
    st.busy = true; st.err = ""; render();
    var now = Date.now();
    var r = { day: st.rDay, from: st.rTime, to: st.rTime + dur, estMin: st.est, name: st.rName.slice(0, 80),
      plate: st.plate.toUpperCase().replace(/\s+/g, " "), plateKey: normPlate(st.plate), phone: st.phone.slice(0, 29),
      resCents: S.resCents, paid: false, status: "offen", createdAt: now, consentAt: now };
    store.createRes(r).then(function(id){
      lsSet(MYRES, { id: id, until: st.rTime + 24 * 3600000 });
      location.href = CFG.stripeLink + (CFG.stripeLink.indexOf("?") < 0 ? "?" : "&") + "client_reference_id=" + encodeURIComponent(id);
    }).catch(function(){ st.busy = false; st.err = "Reservierung konnte nicht angelegt werden. Bitte nochmal versuchen."; render(); });
  }

  function doFind(){
    var p = $("#ccvFPlate").value;
    st.plate = p;
    if (normPlate(p).length < 4){ st.err = "Bitte gib dein Kennzeichen ein."; return render(); }
    store.find(lookupKey(p)).then(function(id){
      if (!id){ st.err = "Kein Auftrag gefunden. Stimmt das Kennzeichen?"; return render(); }
      lsSet(MY, { id: id, until: Date.now() + 12*3600000 }); st.err = ""; st.step = "status"; watch(id);
    }).catch(function(){ st.err = "Verbindung fehlgeschlagen."; render(); });
  }
  function reset(){
    if (unsubJob) unsubJob(); unsubJob = null;
    st = Object.assign(st, { step: "welcome", plate: "", phone: "", prefs: [], note: "", acc1: false, acc2: false, val: false, key: false, err: "", jobId: null, job: null, confirmStop: false });
    render();
  }

  setInterval(function(){
    var j = st.job; if (st.step !== "status" || !j) return;
    var c = calc(j, S);
    if (j.status === "laeuft"){ var t = $("#ccvT"), p = $("#ccvP"); if (t) t.textContent = clock(Date.now() - j.startedAt); if (p) p.textContent = euro(c.total); }
    if (j.status === "gestoppt"){
      var g = $("#ccvG"), m = root.querySelector(".meter");
      var wasOver = m && m.classList.contains("over");
      if ((c.graceLeft < 0) !== wasOver) return render();
      if (g) g.textContent = c.graceLeft < 0 ? "+" + clock(-c.graceLeft) : clock(c.graceLeft);
      var gs = $("#ccvGs"); if (gs && c.graceLeft < 0) gs.textContent = "Standgebühr: " + c.blocks + " × " + euroS(S.blockCents);
      var f = $("#ccvFee"), tt = $("#ccvTot"); if (f) f.textContent = euro(c.fee); if (tt) tt.textContent = euro(c.total);
    }
  }, 1000);

  render();
}

/* =========================================================
   TEAM-KASSE (für dich)
   ========================================================= */
function Team(){
  var resv = [], jobs = [], user = null, err = "", unsub = null, settingsOpen = false, undoFor = null;

  store.settings(function(s){ S = s; if (user) render(); });
  store.onAuth(function(u){
    user = u && (DEMO || (u.email || "").toLowerCase() === CFG.adminEmail.toLowerCase()) ? u : null;
    if (u && !user){ err = "Dieses Konto hat keinen Zugriff."; store.logout(); }
    if (unsub){ unsub(); unsub = null; }
    if (user){
      unsub = store.all(function(list){ jobs = list; publish(false); render(); }, function(e){ err = "Fehler: " + e.message; render(); });
      store.resList(function(list){ resv = list; publish(false); render(); });
      store.cleanup();
    }
    render();
  });

  var lastPub = 0, lastSig = "";
  function publish(force){ // anonyme Belegung für die Kunden-App veröffentlichen (ohne Kennzeichen)
    if (!user) return;
    var now = Date.now(), pl = plan(jobs, S, now, resv);
    var cap = pl.plaetze, frei = pl.free.slice();
    pl.bars.forEach(function(b){ if (b.k !== "res") frei[b.p] = Math.max(frei[b.p], b.to); });
    var bars = pl.bars.map(function(b){ return { p: b.p, from: b.from, to: b.to, k: b.k }; });
    var sig = JSON.stringify([bars.map(function(b){ return [b.p, Math.round(b.from/60000), Math.round(b.to/60000), b.k]; }), cap]);
    if (!force && sig === lastSig && now - lastPub < 2 * 60000) return;
    lastSig = sig; lastPub = now;
    store.setBelegung({ updatedAt: now, next: pl.next, plaetze: cap, frei: frei, bars: bars }).catch(function(){});
  }
  setInterval(function(){ publish(false); }, 60000);

  function vBelegung(){
    var now = Date.now(), pl = plan(jobs, S, now, resv), labels = {};
    jobs.forEach(function(j){ labels[j.id] = j.plate; }); resv.forEach(function(r){ labels["res:" + r.id] = r.plate; });
    var next = Math.max(pl.next, now);
    var head = next <= now + 2 * 60000 ? '<b class="free">Jetzt frei</b>' : 'Nächster freier Platz ca. <b>' + hhmm(next) + ' Uhr</b> (in ' + Math.round((next - now) / 60000) + ' Min.)';
    return '<div class="label">Heute im Zelt</div><div class="cz-card belegung"><p class="bel-head">' + head + ' · ' + pl.plaetze + (pl.plaetze > 1 ? ' Plätze' : ' Platz') + '</p>' +
      timeline(pl, S, now, { labels: labels, legend: '<span><i class="lg laeuft"></i>läuft</span><span><i class="lg gestoppt"></i>gestoppt</span><span><i class="lg wartet"></i>wartet auf Schlüssel</span><span><i class="lg res"></i>reserviert</span>' }) +
      '<p class="small" style="margin-top:6px;">Geschätzt aus der Einkaufszeit der Kunden + ' + Math.min(S.graceMin, 10) + ' Min. Abholung + ' + S.pufferMin + ' Min. Puffer. Kunden sehen das anonym.</p></div>';
  }

  function vLogin(){
    return '<div class="top"><div class="cz-logo">CCV</div><div class="top-t"><b>CCV Shop &amp; Clean</b><span>Team-Login</span></div></div>' +
      '<div class="cz-card"><div class="field" style="margin-top:0"><label for="ccvMail">E-Mail</label><input id="ccvMail" type="email" autocomplete="username" value="' + esc(CFG.adminEmail) + '"></div>' +
      '<div class="field"><label for="ccvPw">Passwort</label><input id="ccvPw" type="password" autocomplete="current-password"></div>' +
      (err ? '<div class="err">' + esc(err) + '</div>' : '') +
      '<button class="cz-btn cz-btn-primary" data-act="login" type="button">Einloggen</button></div>';
  }

  function prefsTags(j){
    var t = (j.prefs || []).map(function(p,i){ return '<span class="tag">' + (i+1) + '. ' + esc(zoneLabel(p)) + '</span>'; }).join("");
    if (!t) t = '<span class="tag n">keine Vorgabe</span>';
    if (j.note) t += '<span class="tag n">„' + esc(j.note) + '“</span>';
    return '<div class="tags">' + t + '</div>';
  }
  function tel(j){ return j.phone ? '<a href="tel:' + esc(digits(j.phone).replace(/^00/, "+")) + '">' + esc(j.phone) + '</a>' : "–"; }

  function matchRes(j){ var t = dayKey(); return resv.find(function(r){ return r.status === "offen" && r.paid && r.day === t && r.plateKey === j.plateKey; }); }
  function cardWaiting(j){
    return '<div class="job"><div class="job-h"><div class="pl">' + esc(j.plate) + '</div><div class="fig"><span>Code</span><b style="color:var(--ink)">' + esc(j.pin) + '</b></div></div>' +
      '<div class="meta">angemeldet ' + hhmm(j.createdAt) + ' · ca. ' + j.estMin + ' Min einkaufen · ' + tel(j) + '</div>' + prefsTags(j) +
      (matchRes(j) ? '<p class="small" style="margin-top:6px;color:#2f7a45;font-weight:700;">✓ Hat für ' + hhmm(matchRes(j).from) + ' Uhr reserviert – ' + euro(matchRes(j).resCents || S.resCents) + ' werden verrechnet.</p>' : '') +
      '<button class="cz-btn cz-btn-primary" data-start="' + j.id + '" type="button">Schlüssel erhalten – Zeit starten</button>' +
      '<button class="cz-btn-link" data-reject="' + j.id + '" type="button" style="color:var(--danger);padding-top:8px;">Ablehnen</button></div>';
  }
  function cardRunning(j){
    var c = calc(j, S), back = j.startedAt + j.estMin * 60000, late = Date.now() > back;
    return '<div class="job' + (late ? " warn-b" : "") + '"><div class="job-h"><div class="pl">' + esc(j.plate) + '</div><div class="fig"><span data-t="' + j.id + '">' + clock(Date.now() - j.startedAt) + '</span><b data-p="' + j.id + '">' + euro(c.total) + '</b></div></div>' +
      '<div class="meta">Start ' + hhmm(j.startedAt) + ' · zurück ca. ' + hhmm(back) + (late ? ' (überfällig)' : '') + ' · Code ' + esc(j.pin) + ' · ' + tel(j) + '</div>' + prefsTags(j) +
      '<button class="cz-btn cz-btn-secondary" data-stop="' + j.id + '" type="button">Kunde ist da – Stopp setzen</button></div>';
  }
  function cardStopped(j){
    var c = calc(j, S), over = c.graceLeft < 0;
    return '<div class="job' + (over ? " over-b" : " warn-b") + '"><div class="job-h"><div class="pl">' + esc(j.plate) + '</div><div class="fig"><span data-g="' + j.id + '">' + (over ? "+" + clock(-c.graceLeft) + " drüber" : clock(c.graceLeft) + " frei") + '</span><b data-tot="' + j.id + '">' + euro(c.total) + '</b></div></div>' +
      '<div class="meta">Pflege ' + c.min + ' Min = ' + euro(c.work) + ' · Standgebühr <span data-fee="' + j.id + '">' + euro(c.fee) + '</span>' + (c.deposit ? ' · Reservierung −' + euro(c.deposit) : '') + ' · Code ' + esc(j.pin) + ' · ' + tel(j) + '</div>' +
      '<p class="small" style="margin-top:6px;">Nicht mehr am Auto arbeiten. Schlüssel nur gegen Code ' + esc(j.pin) + '.</p>' +
      '<div class="cz-btn-row"><button class="cz-btn cz-btn-money" data-pay="' + j.id + '" data-via="bar" type="button">Bar bezahlt</button><button class="cz-btn cz-btn-primary" data-pay="' + j.id + '" data-via="karte" type="button">Karte (SumUp)</button></div></div>';
  }

  function cardRes(r){
    var now = Date.now(), bis = r.from + (S.kulanzMin || 15) * 60000, over = r.status === "offen" && now > bis, stale = !r.paid && r.createdAt < now - 30 * 60000;
    return '<div class="job' + (over ? " over-b" : (r.paid ? "" : " warn-b")) + '"><div class="job-h"><div class="pl">' + esc(r.plate) + '</div><div class="fig"><span>' + (r.day === dayKey(now) ? "heute" : dayLabel(r.day)) + '</span><b style="color:var(--ink)">' + hhmm(r.from) + '</b></div></div>' +
      '<div class="meta">' + esc(r.name || "") + ' · ' + tel(r) + ' · ca. ' + (r.estMin || 30) + ' Min · ' + (r.paid ? '<b style="color:#2f7a45">' + euro(r.resCents || S.resCents) + ' bezahlt</b>' : '<b style="color:var(--money)">Zahlung offen' + (stale ? ' (vermutlich abgebrochen)' : '') + '</b>') +
      (over ? ' · <b style="color:var(--danger)">nicht erschienen</b>' : '') + '</div>' +
      '<div class="cz-btn-row">' + (r.paid ? '' : '<button class="cz-btn cz-btn-primary" data-respaid="' + r.id + '" type="button">In Stripe bezahlt ✓</button>') +
      '<button class="cz-btn cz-btn-secondary" data-resend="' + r.id + '" data-to="' + (over ? "verfallen" : "storniert") + '" type="button">' + (over ? "Verfallen" : (r.paid ? "Storniert (erstatten)" : "Löschen")) + '</button></div></div>';
  }
  function dayLabel(day){ var p = day.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }); }

  function vMain(){
    var today = dayKey();
    var wait = jobs.filter(function(j){ return j.status === "angemeldet"; }).sort(function(a,b){ return a.createdAt - b.createdAt; });
    var run = jobs.filter(function(j){ return j.status === "laeuft"; }).sort(function(a,b){ return a.startedAt - b.startedAt; });
    var stop = jobs.filter(function(j){ return j.status === "gestoppt"; }).sort(function(a,b){ return a.stoppedAt - b.stoppedAt; });
    var paid = jobs.filter(function(j){ return j.status === "bezahlt" && dayKey(j.paidAt) === today; }).sort(function(a,b){ return b.paidAt - a.paidAt; });
    var sum = paid.reduce(function(s,j){ return s + (j.paidCents || 0) + (j.depositCents || 0); }, 0);
    var mins = paid.reduce(function(s,j){ return s + (j.workMin || 0); }, 0);
    var sec = function(title, arr, fn, emptyTxt){ return '<div class="label">' + title + (arr.length ? " (" + arr.length + ")" : "") + '</div>' + (arr.length ? arr.map(fn).join("") : '<div class="empty">' + emptyTxt + '</div>'); };

    return '<div class="top"><div class="cz-logo">CCV</div><div class="top-t"><b>Shop &amp; Clean · Kasse</b><span>' + esc(CFG.standort) + ' · ' + euro(S.rateCents) + '/Min</span></div>' +
      '<button class="chip-btn" data-act="settings" type="button">⚙︎</button>' + (DEMO ? "" : '<button class="chip-btn" data-act="logout" type="button">Logout</button>') + '</div>' +
      (err ? '<div class="err">' + esc(err) + '</div>' : '') +
      '<div class="stats"><div class="cz-stat"><small>Umsatz heute</small><b>' + euro(sum) + '</b></div><div class="cz-stat"><small>Autos</small><b>' + paid.length + '</b></div><div class="cz-stat"><small>Ø €/Std</small><b>' + (mins ? euroS(Math.round(sum / mins * 60 / 100) * 100) : "–") + '</b></div></div>' +
      vBelegung() +
      sec("Reservierungen", resv.filter(function(r){ return r.status === "offen"; }).sort(function(a,b){ return a.from - b.from; }), cardRes, "Keine offenen Reservierungen.") +
      sec("Wartet auf Schlüssel", wait, cardWaiting, "Niemand wartet.") +
      sec("Läuft", run, cardRunning, "Gerade kein Auto in Pflege.") +
      sec("Gestoppt – wartet auf Zahlung", stop, cardStopped, "Nichts offen.") +
      '<div class="label">Heute bezahlt</div>' + (paid.length ? paid.map(function(j){
        return '<div class="hist"><span class="pl">' + esc(j.plate) + '</span><span class="pill ' + j.paidVia + '">' + (j.paidVia === "bar" ? "Bar" : "Karte") + '</span>' +
          (j.feeCents ? '<span class="pill">+Gebühr</span>' : '') + '<span class="amt">' + euro(j.paidCents) + '</span>' +
          (undoFor === j.id ? '<button class="undo" data-undo="' + j.id + '" type="button">rückgängig?</button>' : '<button class="undo" data-ask-undo="' + j.id + '" type="button" style="color:var(--ink-faint)">↺</button>') + '</div>';
      }).join("") : '<div class="empty">Noch nichts kassiert.</div>') +
      '<button class="cz-btn cz-btn-secondary" data-act="csv" type="button">Tagesliste als CSV (für Lexware)</button>' +
      (DEMO ? '<button class="cz-btn-link" data-act="demoReset" type="button">Demo-Daten löschen</button>' : '') +
      (settingsOpen ? vSettings() : "");
  }

  function vSettings(){
    var f = function(id, label, val, step, hint){ return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="cz-mono" type="number" min="0" step="' + step + '" inputmode="decimal" value="' + val + '">' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>'; };
    return '<div class="ov" data-act="closeSettings"><div class="sheet" data-stop-close>' +
      '<div class="h2">Preise</div><p class="small">Gilt sofort für alle Kunden-Anzeigen und Abrechnungen.</p>' +
      f("ccvSRate", "Preis pro Minute (€)", (S.rateCents/100).toFixed(2), "0.05") +
      f("ccvSMin", "Mindestbetrag (€)", (S.minCents/100).toFixed(2), "1") +
      f("ccvSGrace", "Abholzeit nach Stopp (Min)", S.graceMin, "1") +
      f("ccvSBlock", "Standgebühr pro angefangene … Min", S.blockMin, "1") +
      f("ccvSBlockC", "Standgebühr pro Block (€)", (S.blockCents/100).toFixed(2), "0.5") +
      '<div class="h2" style="margin-top:18px;font-size:18px;">Belegung</div>' +
      f("ccvSPl", "Plätze gleichzeitig (Autos in Pflege)", S.plaetze, "1", "1 = du allein. Mit Helfer z. B. 2.") +
      f("ccvSPuf", "Puffer zwischen zwei Autos (Min)", S.pufferMin, "1") +
      '<div class="h2" style="margin-top:18px;font-size:18px;">Reservierung</div>' +
      '<div class="field"><label for="ccvSTage">Reservierbare Tage (JJJJ-MM-TT, mit Komma)</label><input id="ccvSTage" type="text" value="' + esc(S.tage) + '"><div class="hint">z. B. 2027-01-16, 2027-01-23</div></div>' +
      f("ccvSRes", "Reservierungsgebühr (€)", (S.resCents/100).toFixed(2), "0.5", "Muss zum Betrag im Stripe-Link passen.") +
      f("ccvSKul", "Kulanz bei Verspätung (Min)", S.kulanzMin, "1") +
      '<div class="field"><label for="ccvSOpen">Öffnungszeit heute</label><div class="cz-btn-row"><input id="ccvSOpen" type="time" value="' + esc(S.oeffnet) + '"><input id="ccvSClose" type="time" value="' + esc(S.schliesst) + '"></div></div>' +
      '<div class="cz-btn-row"><button class="cz-btn cz-btn-secondary" data-act="closeSettings2" type="button">Abbrechen</button><button class="cz-btn cz-btn-primary" data-act="saveSettings" type="button">Speichern</button></div></div></div>';
  }

  function render(){
    root.innerHTML = (DEMO ? '<div class="demo-bar">Demo-Modus – Daten nur in diesem Browser</div>' : '') + '<div class="cz-wrap">' + (user ? vMain() : vLogin()) + '</div>';
    bind();
  }
  function bind(){
    on('[data-act="login"]', "click", function(){
      err = ""; store.login($("#ccvMail").value.trim(), $("#ccvPw").value).catch(function(){ err = "Login fehlgeschlagen."; render(); });
    });
    on('[data-act="logout"]', "click", function(){ store.logout(); });
    on("[data-start]", "click", function(e, el){
      var n = Date.now(), id = el.getAttribute("data-start"), j = jobs.find(function(x){ return x.id === id; }), r = j && matchRes(j);
      var p = { status: "laeuft", startedAt: n, keyStaffAt: n };
      if (r){ p.depositCents = r.resCents || S.resCents; p.resId = r.id; store.updateRes(r.id, { status: "erschienen", jobId: id }, { aus: true }); }
      store.update(id, p);
    });
    on("[data-respaid]", "click", function(e, el){ var id = el.getAttribute("data-respaid"); store.updateRes(id, { paid: true, paidMarkedAt: Date.now() }, { paid: true }); });
    on("[data-resend]", "click", function(e, el){ var id = el.getAttribute("data-resend"); store.updateRes(id, { status: el.getAttribute("data-to"), closedAt: Date.now() }, { aus: true }); });
    on("[data-reject]", "click", function(e, el){ store.update(el.getAttribute("data-reject"), { status: "storniert" }); });
    on("[data-stop]", "click", function(e, el){ store.update(el.getAttribute("data-stop"), { status: "gestoppt", stoppedAt: Date.now(), stoppedBy: "team" }); });
    on("[data-pay]", "click", function(e, el){
      var j = jobs.find(function(x){ return x.id === el.getAttribute("data-pay"); }); if (!j) return;
      var n = Date.now(), c = calc(j, S, n);
      store.update(j.id, { status: "bezahlt", paidAt: n, paidVia: el.getAttribute("data-via"), workMin: c.min, workCents: c.work, feeCents: c.fee, paidCents: c.total, depositCents: c.deposit || 0, rateCents: S.rateCents, keyReturnedAt: n });
    });
    on("[data-ask-undo]", "click", function(e, el){ undoFor = el.getAttribute("data-ask-undo"); render(); });
    on("[data-undo]", "click", function(e, el){ undoFor = null; store.update(el.getAttribute("data-undo"), { status: "gestoppt", paidAt: null, paidVia: null, paidCents: null }); });
    on('[data-act="csv"]', "click", csv);
    on('[data-act="demoReset"]', "click", function(){ store.reset(); });
    on('[data-act="settings"]', "click", function(){ settingsOpen = true; render(); });
    on('[data-act="closeSettings"]', "click", function(e){ if (e.target === e.currentTarget){ settingsOpen = false; render(); } });
    on('[data-act="closeSettings2"]', "click", function(){ settingsOpen = false; render(); });
    on('[data-act="saveSettings"]', "click", function(){
      var n = function(id, fb){ var v = parseFloat(String($("#" + id).value).replace(",", ".")); return isNaN(v) || v < 0 ? fb : v; };
      var s = { rateCents: Math.round(n("ccvSRate", S.rateCents/100)*100), minCents: Math.round(n("ccvSMin", S.minCents/100)*100),
        graceMin: Math.round(n("ccvSGrace", S.graceMin)), blockMin: Math.max(1, Math.round(n("ccvSBlock", S.blockMin))), blockCents: Math.round(n("ccvSBlockC", S.blockCents/100)*100),
        plaetze: Math.max(1, Math.round(n("ccvSPl", S.plaetze))), pufferMin: Math.round(n("ccvSPuf", S.pufferMin)),
        oeffnet: $("#ccvSOpen").value || S.oeffnet, schliesst: $("#ccvSClose").value || S.schliesst,
        tage: $("#ccvSTage").value.trim(), resCents: Math.round(n("ccvSRes", S.resCents/100)*100), kulanzMin: Math.round(n("ccvSKul", S.kulanzMin)) };
      settingsOpen = false; store.saveSettings(s).then(function(){ S = Object.assign({}, S, s); publish(true); });
    });
  }
  function csv(){
    var today = dayKey();
    var paid = jobs.filter(function(j){ return j.status === "bezahlt" && dayKey(j.paidAt) === today; }).sort(function(a,b){ return a.paidAt - b.paidAt; });
    var num = function(c){ return ((c||0)/100).toFixed(2).replace(".", ","); };
    var rows = [["Datum","Kennzeichen","Start","Stopp","Bezahlt","Minuten","Pflege €","Standgebühr €","davon Reservierung (Stripe) €","vor Ort kassiert €","Zahlart vor Ort"]];
    paid.forEach(function(j){ rows.push([today, j.plate, hhmm(j.startedAt), hhmm(j.stoppedAt), hhmm(j.paidAt), j.workMin, num(j.workCents), num(j.feeCents), num(j.depositCents), num(j.paidCents), j.paidVia === "bar" ? "Bar" : "Karte (SumUp)"]); });
    resv.filter(function(r){ return r.status === "verfallen" && r.paid && r.day === today; }).forEach(function(r){ rows.push([today, r.plate, hhmm(r.from), "", "", "", "", "", num(r.resCents), "0,00", "Reservierung verfallen (Stripe)"]); });
    var txt = "﻿" + rows.map(function(r){ return r.map(function(c){ return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(";"); }).join("\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    a.download = "CCV-Shop-Clean-" + today + ".csv"; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  setInterval(function(){
    if (!user) return;
    var needRender = false;
    jobs.forEach(function(j){
      if (j.status === "laeuft"){ var t = root.querySelector('[data-t="' + j.id + '"]'), p = root.querySelector('[data-p="' + j.id + '"]'); if (t) t.textContent = clock(Date.now() - j.startedAt); if (p) p.textContent = euro(calc(j, S).total); }
      if (j.status === "gestoppt"){
        var c = calc(j, S), g = root.querySelector('[data-g="' + j.id + '"]');
        if (g){ var over = c.graceLeft < 0; if (over && g.textContent.indexOf("drüber") < 0) needRender = true; g.textContent = over ? "+" + clock(-c.graceLeft) + " drüber" : clock(c.graceLeft) + " frei"; }
        var tt = root.querySelector('[data-tot="' + j.id + '"]'), f = root.querySelector('[data-fee="' + j.id + '"]'); if (tt) tt.textContent = euro(c.total); if (f) f.textContent = euro(c.fee);
      }
    });
    if (needRender && !settingsOpen) render();
  }, 1000);
}

/* ---------- Start ---------- */
function boot(){
  try { store = DEMO ? DemoStore() : FireStore(); }
  catch(e){ root.innerHTML = '<div class="cz-wrap"><div class="empty" style="margin-top:20px;">App konnte nicht starten: ' + esc(e.message) + '</div></div>'; return; }
  if (MODE === "team") Team(); else Kunde();
}
if (DEMO) boot();
else {
  var tries = 0;
  (function wait(){ if (window.firebase && firebase.firestore && firebase.auth) return boot(); if (++tries > 100){ root.innerHTML = '<div class="cz-wrap"><div class="empty">Verbindung zur Datenbank fehlgeschlagen. Bitte Seite neu laden.</div></div>'; return; } setTimeout(wait, 100); })();
}
})();
