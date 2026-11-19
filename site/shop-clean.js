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
  standort: "REWE Center Nidderau",
  imgBase: "images/",                          // Ordner mit deinen Website-Fotos
  firma: "CAR CARE VALU"
};
var DEFAULTS = { rateCents: 90, minCents: 2500, graceMin: 15, blockMin: 15, blockCents: 500 };
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
  r.total = r.work + r.fee;
  if (j.status === "bezahlt" && typeof j.paidCents === "number"){ r.total = j.paidCents; r.work = j.workCents; r.fee = j.feeCents; r.min = j.workMin; }
  return r;
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
    }
  };
}

var store, S = Object.assign({}, DEFAULTS);

/* =========================================================
   KUNDEN-APP
   ========================================================= */
function Kunde(){
  var MY = "ccvShopClean.meinAuftrag";
  var st = { step: "welcome", est: 30, plate: "", phone: "", prefs: [], note: "", acc1: false, acc2: false, val: false, key: false, err: "", jobId: null, job: null, confirmStop: false, busy: false, ba: "kofferraum" };
  var unsubJob = null;
  var STEPS = ["welcome","zeit","daten","auto","schluessel"];

  var mine = lsGet(MY);
  if (mine && mine.id && mine.until > Date.now()) { st.step = "status"; watch(mine.id); }

  store.settings(function(s){ S = s; if (["welcome","zeit"].indexOf(st.step) >= 0 || st.step === "status") render(); });

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
    '<div class="price-row"><div class="price-box"><span>pro Minute</span><b>' + euro(S.rateCents) + '</b></div>' +
    '<div class="price-box"><span>Mindestbetrag</span><b>' + euroS(S.minCents) + '</b></div></div></div>' +

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
          '<div class="row total"><span>Zu zahlen</span><span class="cz-mono" id="ccvTot">' + euro(c.total) + '</span></div></div></div>' +
        '<p class="small center" style="margin-top:10px;">Am Auto wird nichts mehr gemacht. Bezahlung mit Karte oder bar am Zelt.</p>';
    }
    return plate + '<div class="meter"><div class="ml">Danke!</div><div class="mt" style="font-size:34px;">Bezahlt</div><div class="mp">' + euro(c.total) + '</div><div class="ms">Gute Fahrt – bis zum nächsten Einkauf!</div></div>' +
      '<button class="cz-btn cz-btn-secondary" data-act="leave" type="button">Fertig</button>';
  }

  function render(){
    var v = { welcome: vWelcome, zeit: vZeit, daten: vDaten, auto: vAuto, schluessel: vSchluessel, find: vFind, status: vStatus }[st.step]();
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
    var p = $("#ccvPlate"), t = $("#ccvPhone"), n = $("#ccvNote");
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
  var jobs = [], user = null, err = "", unsub = null, settingsOpen = false, undoFor = null;

  store.settings(function(s){ S = s; if (user) render(); });
  store.onAuth(function(u){
    user = u && (DEMO || (u.email || "").toLowerCase() === CFG.adminEmail.toLowerCase()) ? u : null;
    if (u && !user){ err = "Dieses Konto hat keinen Zugriff."; store.logout(); }
    if (unsub){ unsub(); unsub = null; }
    if (user){
      unsub = store.all(function(list){ jobs = list; render(); }, function(e){ err = "Fehler: " + e.message; render(); });
      store.cleanup();
    }
    render();
  });

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

  function cardWaiting(j){
    return '<div class="job"><div class="job-h"><div class="pl">' + esc(j.plate) + '</div><div class="fig"><span>Code</span><b style="color:var(--ink)">' + esc(j.pin) + '</b></div></div>' +
      '<div class="meta">angemeldet ' + hhmm(j.createdAt) + ' · ca. ' + j.estMin + ' Min einkaufen · ' + tel(j) + '</div>' + prefsTags(j) +
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
      '<div class="meta">Pflege ' + c.min + ' Min = ' + euro(c.work) + ' · Standgebühr <span data-fee="' + j.id + '">' + euro(c.fee) + '</span> · Code ' + esc(j.pin) + ' · ' + tel(j) + '</div>' +
      '<p class="small" style="margin-top:6px;">Nicht mehr am Auto arbeiten. Schlüssel nur gegen Code ' + esc(j.pin) + '.</p>' +
      '<div class="cz-btn-row"><button class="cz-btn cz-btn-money" data-pay="' + j.id + '" data-via="bar" type="button">Bar bezahlt</button><button class="cz-btn cz-btn-primary" data-pay="' + j.id + '" data-via="karte" type="button">Karte (SumUp)</button></div></div>';
  }

  function vMain(){
    var today = dayKey();
    var wait = jobs.filter(function(j){ return j.status === "angemeldet"; }).sort(function(a,b){ return a.createdAt - b.createdAt; });
    var run = jobs.filter(function(j){ return j.status === "laeuft"; }).sort(function(a,b){ return a.startedAt - b.startedAt; });
    var stop = jobs.filter(function(j){ return j.status === "gestoppt"; }).sort(function(a,b){ return a.stoppedAt - b.stoppedAt; });
    var paid = jobs.filter(function(j){ return j.status === "bezahlt" && dayKey(j.paidAt) === today; }).sort(function(a,b){ return b.paidAt - a.paidAt; });
    var sum = paid.reduce(function(s,j){ return s + (j.paidCents || 0); }, 0);
    var mins = paid.reduce(function(s,j){ return s + (j.workMin || 0); }, 0);
    var sec = function(title, arr, fn, emptyTxt){ return '<div class="label">' + title + (arr.length ? " (" + arr.length + ")" : "") + '</div>' + (arr.length ? arr.map(fn).join("") : '<div class="empty">' + emptyTxt + '</div>'); };

    return '<div class="top"><div class="cz-logo">CCV</div><div class="top-t"><b>Shop &amp; Clean · Kasse</b><span>' + esc(CFG.standort) + ' · ' + euro(S.rateCents) + '/Min</span></div>' +
      '<button class="chip-btn" data-act="settings" type="button">⚙︎</button>' + (DEMO ? "" : '<button class="chip-btn" data-act="logout" type="button">Logout</button>') + '</div>' +
      (err ? '<div class="err">' + esc(err) + '</div>' : '') +
      '<div class="stats"><div class="cz-stat"><small>Umsatz heute</small><b>' + euro(sum) + '</b></div><div class="cz-stat"><small>Autos</small><b>' + paid.length + '</b></div><div class="cz-stat"><small>Ø €/Std</small><b>' + (mins ? euroS(Math.round(sum / mins * 60 / 100) * 100) : "–") + '</b></div></div>' +
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
    on("[data-start]", "click", function(e, el){ var n = Date.now(); store.update(el.getAttribute("data-start"), { status: "laeuft", startedAt: n, keyStaffAt: n }); });
    on("[data-reject]", "click", function(e, el){ store.update(el.getAttribute("data-reject"), { status: "storniert" }); });
    on("[data-stop]", "click", function(e, el){ store.update(el.getAttribute("data-stop"), { status: "gestoppt", stoppedAt: Date.now(), stoppedBy: "team" }); });
    on("[data-pay]", "click", function(e, el){
      var j = jobs.find(function(x){ return x.id === el.getAttribute("data-pay"); }); if (!j) return;
      var n = Date.now(), c = calc(j, S, n);
      store.update(j.id, { status: "bezahlt", paidAt: n, paidVia: el.getAttribute("data-via"), workMin: c.min, workCents: c.work, feeCents: c.fee, paidCents: c.total, rateCents: S.rateCents, keyReturnedAt: n });
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
        graceMin: Math.round(n("ccvSGrace", S.graceMin)), blockMin: Math.max(1, Math.round(n("ccvSBlock", S.blockMin))), blockCents: Math.round(n("ccvSBlockC", S.blockCents/100)*100) };
      settingsOpen = false; store.saveSettings(s);
    });
  }
  function csv(){
    var today = dayKey();
    var paid = jobs.filter(function(j){ return j.status === "bezahlt" && dayKey(j.paidAt) === today; }).sort(function(a,b){ return a.paidAt - b.paidAt; });
    var num = function(c){ return ((c||0)/100).toFixed(2).replace(".", ","); };
    var rows = [["Datum","Kennzeichen","Start","Stopp","Bezahlt","Minuten","Pflege €","Standgebühr €","Gesamt €","Zahlart"]];
    paid.forEach(function(j){ rows.push([today, j.plate, hhmm(j.startedAt), hhmm(j.stoppedAt), hhmm(j.paidAt), j.workMin, num(j.workCents), num(j.feeCents), num(j.paidCents), j.paidVia === "bar" ? "Bar" : "Karte (SumUp)"]); });
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
