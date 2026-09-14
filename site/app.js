/* CAR CARE VALU — gemeinsame Skripte */
(function () {
  "use strict";

  /* ---------- Mobile Navigation ---------- */
  var burger = document.querySelector(".burger");
  if (burger) {
    burger.addEventListener("click", function () {
      var nav = document.querySelector("nav.mob");
      var open = nav.classList.toggle("open");
      burger.textContent = open ? "✕" : "☰";
    });
  }

  /* ---------- Scroll-Einblendungen ---------- */
  var targets = document.querySelectorAll("[data-reveal]");
  if (targets.length) {
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
        });
      }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });
      targets.forEach(function (t) { io.observe(t); });
      setTimeout(function () { targets.forEach(function (t) { t.classList.add("in"); }); }, 2500);
    } else {
      targets.forEach(function (t) { t.classList.add("in"); });
    }
  }

  /* ---------- Anfahrtsrechner ---------- */
  var calc = document.getElementById("ccv-anfahrt");
  if (calc) initCalc();

  function initCalc() {
    var FREI = 50, SATZ = 0.89;
    var ORTE = [
      ["Limeshain","63694",0],["Altenstadt","63674",8],["Hammersbach","63546",12],["Büdingen","63654",13],
      ["Ortenberg","63683",14],["Nidderau","61130",18],["Nidda","63667",20],["Erlensee","63526",20],
      ["Neuberg","63543",21],["Langenselbold","63505",22],["Bruchköbel","63486",22],["Friedberg","61169",24],
      ["Gründau","63584",25],["Karben","61184",26],["Gelnhausen","63571",26],["Hanau","63450",28],
      ["Bad Vilbel","61118",28],["Bad Nauheim","61231",30],["Linsengericht","63589",30],["Maintal","63477",32],
      ["Großkrotzenburg","63538",32],["Freigericht","63579",32],["Wächtersbach","63607",34],["Mühlheim am Main","63165",36],
      ["Hainburg","63512",36],["Butzbach","35510",36],["Kahl am Main","63796",38],["Offenbach am Main","63065",38],
      ["Rodgau","63110",38],["Bad Orb","63619",40],["Seligenstadt","63500",40],["Alzenau","63755",40],
      ["Bad Homburg","61348",40],["Frankfurt am Main","60311",42],["Steinau an der Straße","36396",42],["Oberursel","61440",44],
      ["Gießen","35390",46],["Kronberg im Taunus","61476",46],["Dieburg","64807",50],["Schlüchtern","36381",50],
      ["Hösbach","63768",50],["Königstein im Taunus","61462",50],["Aschaffenburg","63739",52],["Frankfurt Flughafen","60547",52],
      ["Alsfeld","36304",55],["Lauterbach","36341",55],["Hofheim am Taunus","65719",55],["Wetzlar","35578",58],
      ["Rüsselsheim","65428",60],["Darmstadt","64283",62],["Marburg","35037",70],["Wiesbaden","65183",70],
      ["Mainz","55116",72],["Fulda","36037",78],["Limburg an der Lahn","65549",78],["Bad Hersfeld","36251",85],
      ["Würzburg","97070",110]
    ];
    var q = document.getElementById("ccv-q"), list = document.getElementById("ccv-list");
    var num = document.getElementById("ccv-num"), range = document.getElementById("ccv-range");
    var picked = document.getElementById("ccv-picked"), out = document.getElementById("ccv-out");
    var oLabel = document.getElementById("ccv-out-label"), oSum = document.getElementById("ccv-out-sum");
    var oText = document.getElementById("ccv-out-text"), extra = document.getElementById("ccv-extra");
    var calcKm = document.getElementById("ccv-calc"), box = q.closest(".search");
    var km = 12;

    document.getElementById("ccv-rate").textContent = eur(SATZ) + " / km";
    document.getElementById("ccv-frei").textContent = "bis " + FREI + " km";

    function eur(n) { return n.toFixed(2).replace(".", ",") + " €"; }

    function render() {
      var zusatz = Math.max(0, km - FREI), ab = zusatz * 2, betrag = ab * SATZ;
      num.value = km; range.value = Math.min(120, km);
      extra.textContent = zusatz > 0 ? zusatz + " km" : "keine";
      calcKm.textContent = ab > 0 ? ab + " km" : "keine";
      if (zusatz <= 0) {
        out.classList.remove("over");
        oLabel.textContent = "IM KOSTENLOSEN ANFAHRTSBEREICH";
        oSum.textContent = "0,00 €";
        oText.textContent = "Bei " + km + " km liegst du innerhalb der " + FREI + " km. Keine Anfahrtskosten.";
      } else {
        out.classList.add("over");
        oLabel.textContent = "SPRITKOSTEN-ANTEIL";
        oSum.textContent = eur(betrag);
        oText.textContent = "Bei " + km + " km einfacher Strecke liegen " + zusatz + " km über den freien " +
          FREI + " km. Berechnet werden " + ab + " km für Hin- und Rückfahrt zu " + eur(SATZ) + " pro km.";
      }
    }

    function showList() {
      var term = q.value.trim().toLowerCase();
      var hits = (term ? ORTE.filter(function (o) {
        return o[0].toLowerCase().indexOf(term) > -1 || o[1].indexOf(term) === 0;
      }) : ORTE).slice(0, 40);
      list.innerHTML = "";
      if (!hits.length) {
        list.innerHTML = "<p>Kein Ort gefunden. Trag deine Entfernung einfach unten in km ein — wir fahren auch weiter raus.</p>";
      } else {
        hits.forEach(function (o) {
          var b = document.createElement("button");
          b.type = "button";
          b.innerHTML = "<span>" + o[0] + " · " + o[1] + "</span><span>ca. " + o[2] + " km</span>";
          b.addEventListener("click", function () {
            km = o[2]; q.value = o[0];
            picked.textContent = "GEWÄHLT: " + o[0]; picked.hidden = false;
            list.hidden = true; render();
          });
          list.appendChild(b);
        });
      }
      list.hidden = false;
    }

    q.addEventListener("input", function () { picked.hidden = true; showList(); });
    q.addEventListener("focus", showList);
    document.addEventListener("pointerdown", function (e) {
      if (!list.hidden && !box.contains(e.target)) list.hidden = true;
    });
    function onKm(e) {
      km = Math.max(0, Math.min(400, Number(e.target.value) || 0));
      picked.hidden = true; render();
    }
    num.addEventListener("input", onKm);
    range.addEventListener("input", onKm);
    render();
  }

  /* ---------- Vorher/Nachher-Regler ---------- */
  var slider = document.getElementById("ba-slider");
  if (slider) initSlider();

  function initSlider() {
    var SETS = [
      { label: "Kofferraum — Staub und Schmutz vorher, gereinigt nachher",
        v: "images/kofferraum-vorher.jpg", n: "images/kofferraum-nachher.jpg" },
      { label: "Fußraum — eingetretener Schmutz vorher, gereinigt und aufgefrischt nachher",
        v: "images/fussraum-vorher.jpg", n: "images/fussraum-nachher.jpg" },
      { label: "Sitze und Polster — Staub und Abrieb im Gewebe vorher, gereinigt nachher",
        v: "images/sitze-vorher.jpg", n: "images/sitze-nachher.jpg" }
    ];
    var after = document.getElementById("ba-after");
    var before = document.getElementById("ba-before");
    var beforeImg = document.getElementById("ba-before-img");
    var handle = document.getElementById("ba-handle");
    var cap = document.getElementById("ba-cap");
    var tabs = document.querySelectorAll("#ba-tabs button");
    var dragging = false, split = 46;

    function apply() {
      before.style.clipPath = "inset(0 " + (100 - split).toFixed(1) + "% 0 0)";
      handle.style.left = split.toFixed(1) + "%";
    }
    function load(i) {
      split = 46; apply();
      after.style.backgroundImage = "url('" + SETS[i].n + "')";
      beforeImg.style.backgroundImage = "url('" + SETS[i].v + "')";
      cap.textContent = SETS[i].label;
      tabs.forEach(function (t, n) { t.classList.toggle("on", n === i); });
    }
    function move(e) {
      var r = slider.getBoundingClientRect();
      split = Math.max(2, Math.min(98, ((e.clientX - r.left) / r.width) * 100));
      apply();
    }
    tabs.forEach(function (t) {
      t.addEventListener("click", function () { load(Number(t.dataset.i)); });
    });
    slider.addEventListener("pointerdown", function (e) { dragging = true; move(e); });
    window.addEventListener("pointermove", function (e) { if (dragging) move(e); });
    window.addEventListener("pointerup", function () { dragging = false; });
    load(0);
  }
})();
