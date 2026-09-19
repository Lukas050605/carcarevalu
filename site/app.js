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

  var ruhig = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Scroll-Einblendungen mit Staffelung ---------- */
  var targets = document.querySelectorAll("[data-reveal]");
  if (targets.length) {
    // Geschwister innerhalb eines Rasters nacheinander einblenden
    if (!ruhig) {
      var gruppen = {};
      targets.forEach(function (t) {
        var p = t.parentNode, key = gruppen.__i || 0;
        if (!p.__ccvKey) { p.__ccvKey = ++key; gruppen.__i = key; gruppen[key] = 0; }
        var n = gruppen[p.__ccvKey]++;
        if (n) t.style.setProperty("--d", (Math.min(n, 6) * 0.07).toFixed(2) + "s");
      });
    }
    if ("IntersectionObserver" in window && !ruhig) {
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

  /* ---------- Überschriften-Linie ---------- */
  var heads = document.querySelectorAll("section>.wrap>h2");
  if (heads.length && "IntersectionObserver" in window && !ruhig) {
    var ioH = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("drawn"); ioH.unobserve(e.target); }
      });
    }, { threshold: .5 });
    heads.forEach(function (h) { ioH.observe(h); });
  } else {
    heads.forEach(function (h) { h.classList.add("drawn"); });
  }

  /* ---------- Kopfzeile und Lesefortschritt ---------- */
  var kopf = document.querySelector("header");
  var bar = document.createElement("div");
  bar.id = "ccv-progress";
  document.body.appendChild(bar);
  var raf = 0;
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var y = window.pageYOffset || document.documentElement.scrollTop;
      if (kopf) kopf.classList.toggle("scrolled", y > 24);
      var hoehe = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (hoehe > 40 ? Math.min(100, (y / hoehe) * 100) : 0) + "%";
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Zahlen hochzählen ---------- */
  var zahlen = document.querySelectorAll("[data-count]");
  if (zahlen.length && "IntersectionObserver" in window && !ruhig) {
    var ioZ = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        ioZ.unobserve(e.target);
        var el = e.target, ziel = parseFloat(el.dataset.count) || 0;
        var suf = el.dataset.suffix || "", dez = (el.dataset.dez | 0);
        var t0 = performance.now();
        (function tick(t) {
          var p = Math.min(1, (t - t0) / 900), e3 = 1 - Math.pow(1 - p, 3);
          el.textContent = (ziel * e3).toFixed(dez).replace(".", ",") + suf;
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      });
    }, { threshold: .6 });
    zahlen.forEach(function (z) { ioZ.observe(z); });
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
    var typ = document.getElementById("ccv-typ"), klasse = document.getElementById("ccv-klasse");
    var sBasis = document.getElementById("ccv-sum-basis"), sPrem = document.getElementById("ccv-sum-premium");
    var PREISE = { basis: 59, premium: 69 };
    var OWNER = "37613678";
    var TERMIN = {
    "BASIS-GROSS-A": "98466813",
    "BASIS-GROSS-B": "98466830",
    "BASIS-GROSS-C": "98466867",
    "BASIS-GROSS-D": "98466902",
    "BASIS-GROSS-E": "98466923",
    "BASIS-GROSS-F": "98466956",
    "BASIS-PKW-A": "98466460",
    "BASIS-PKW-B": "98466625",
    "BASIS-PKW-C": "98466674",
    "BASIS-PKW-D": "98466712",
    "BASIS-PKW-E": "98466755",
    "BASIS-PKW-F": "98466786",
    "PREMIUM-GROSS-A": "98467130",
    "PREMIUM-GROSS-B": "98467149",
    "PREMIUM-GROSS-C": "98467183",
    "PREMIUM-GROSS-D": "98467204",
    "PREMIUM-GROSS-E": "98467247",
    "PREMIUM-GROSS-F": "98467218",
    "PREMIUM-PKW-A": "98466995",
    "PREMIUM-PKW-B": "98467013",
    "PREMIUM-PKW-C": "98467049",
    "PREMIUM-PKW-D": "98467061",
    "PREMIUM-PKW-E": "98467084",
    "PREMIUM-PKW-F": "98467108"
    };
    var ZONEN = [
      { code: "A", bis: 50, von: 0, mittel: 50 }, { code: "B", bis: 60, von: 51, mittel: 55 },
      { code: "C", bis: 70, von: 61, mittel: 65 }, { code: "D", bis: 80, von: 71, mittel: 75 },
      { code: "E", bis: 90, von: 81, mittel: 85 }, { code: "F", bis: 110, von: 91, mittel: 100 }
    ];
    ZONEN.forEach(function (z) { z.auf = Math.round(Math.max(0, z.mittel - FREI) * 2 * SATZ); });
    var bBasis = document.getElementById("ccv-go-basis");
    var bPrem = document.getElementById("ccv-go-premium");
    var zoneOut = document.getElementById("ccv-zone");
    var km = 12;

    function zoneVon(k) {
      for (var i = 0; i < ZONEN.length; i++) if (k <= ZONEN[i].bis) return ZONEN[i];
      return null;
    }
    function link(paket, gross, z) {
      if (!z) return null;
      var id = TERMIN[paket + "-" + (gross ? "GROSS" : "PKW") + "-" + z.code];
      return id ? "https://app.acuityscheduling.com/schedule.php?owner=" + OWNER + "&appointmentType=" + id : null;
    }

    document.getElementById("ccv-rate").textContent = eur(SATZ) + " / km";
    document.getElementById("ccv-frei").textContent = "bis " + FREI + " km";

    function eur(n) { return n.toFixed(2).replace(".", ",") + " €"; }

    function render() {
      var z = zoneVon(km);
      var betrag = z ? z.auf : 0;
      var f = typ ? parseFloat(typ.value) || 1 : 1;
      var gross = f > 1;
      if (klasse) klasse.textContent = gross ? "+39 % (größer als PKW)" : "Normalpreis";
      if (sBasis) sBasis.textContent = eur(Math.round(PREISE.basis * f) + betrag);
      if (sPrem) sPrem.textContent = eur(Math.round(PREISE.premium * f) + betrag);

      if (zoneOut) zoneOut.textContent = z ? "Zone " + z.code : "über 110 km";
      [[bBasis, "BASIS"], [bPrem, "PREMIUM"]].forEach(function (p) {
        var el = p[0]; if (!el) return;
        var url = link(p[1], gross, z);
        if (url) {
          el.href = url;
          el.removeAttribute("aria-disabled");
          el.textContent = p[1] + " buchen · " + eur(Math.round(PREISE[p[1].toLowerCase()] * f) + betrag);
        } else {
          el.href = "mailto:info@carcarevalu.de?subject=Anfrage%20" + p[1] + "%20ab%20" + km + "%20km";
          el.setAttribute("aria-disabled", "true");
          el.textContent = p[1] + " anfragen · über 110 km";
        }
      });
      num.value = km; range.value = Math.min(120, km);
      extra.textContent = z ? (z.code === "A" ? "bis " + FREI + " km" : z.von + " – " + z.bis + " km") : "über 110 km";
      calcKm.textContent = z ? (z.auf > 0 ? eur(z.auf) : "keine") : "nach Absprache";
      if (!z) {
        out.classList.add("over");
        oLabel.textContent = "AUSSERHALB DER ZONEN";
        oSum.textContent = "auf Anfrage";
        oText.textContent = "Bei " + km + " km liegt die Fahrt außerhalb der festen Zonen. Schreib uns kurz — wir nennen dir einen Preis.";
      } else if (betrag <= 0) {
        out.classList.remove("over");
        oLabel.textContent = "IM KOSTENLOSEN ANFAHRTSBEREICH";
        oSum.textContent = "0,00 €";
        oText.textContent = "Bei " + km + " km liegst du innerhalb der " + FREI + " km. Keine Anfahrtskosten.";
      } else {
        out.classList.add("over");
        oLabel.textContent = "ANFAHRTSPAUSCHALE · ZONE " + z.code;
        oSum.textContent = eur(betrag);
        oText.textContent = "Bei " + km + " km gilt Zone " + z.code + " (" + z.von + " – " + z.bis +
          " km). Die Pauschale deckt Hin- und Rückfahrt der Kilometer über " + FREI +
          " km ab und ist im Buchungspreis bereits enthalten.";
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

    if (typ) typ.addEventListener("change", render);
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
    slider.addEventListener("pointerdown", function (e) { dragging = true; slider.classList.add("touched"); move(e); });
    window.addEventListener("pointermove", function (e) { if (dragging) move(e); });
    window.addEventListener("pointerup", function () { dragging = false; });
    load(0);
  }
})();

/* ---- B2B-Anfrage über Formspree ---- */
(function () {
  var f = document.getElementById("b2b-form");
  if (!f) return;
  var btn = f.querySelector('button[type=submit]');
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!f.reportValidity()) return;
    btn.disabled = true;
    btn.textContent = "Wird gesendet …";
    fetch(f.action, { method: "POST", body: new FormData(f), headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        f.innerHTML = '<span class="mono" style="font-size:10.5px">ANFRAGE EINGEGANGEN</span>' +
          '<h3 style="font-size:20px;margin:6px 0 0">Danke — wir melden uns.</h3>' +
          '<p style="margin:0">Ihre Anfrage ist bei uns. In der Regel antworten wir noch am selben Tag mit einem Terminvorschlag für die Besichtigung.</p>' +
          '<a class="btn" style="margin-top:8px" href="tel:+4915126718415">Lieber gleich anrufen: +49 151 26718415</a>';
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Anfrage absenden →";
        var w = f.querySelector(".ferr");
        if (!w) {
          w = document.createElement("p");
          w.className = "note ferr";
          w.style.color = "#a33";
          f.insertBefore(w, btn);
        }
        w.innerHTML = 'Das Senden hat nicht geklappt. Bitte per E-Mail an <a href="mailto:info@carcarevalu.de">info@carcarevalu.de</a> oder telefonisch unter <a href="tel:+4915126718415">+49 151 26718415</a>.';
      });
  });
})();
