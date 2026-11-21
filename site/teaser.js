/* CAR CARE VALU — kleiner Teaser für CCV Shop & Clean (Premiere 16.01.2027) */
(function () {
  "use strict";
  var ENDE = new Date("2027-01-16T21:00:00+01:00").getTime();
  var START = new Date("2027-01-16T10:00:00+01:00").getTime();
  var KEY = "ccv_sc_teaser_zu", TAGE = 3;
  if (Date.now() > ENDE) return;
  try { if (Date.now() - Number(localStorage.getItem(KEY) || 0) < TAGE * 864e5) return; } catch (e) {}

  var heute = Date.now() >= START;
  var css = document.createElement("style");
  css.textContent =
    ".sct{position:fixed;left:16px;bottom:16px;z-index:70;width:330px;max-width:calc(100vw - 100px);display:flex;gap:12px;align-items:center;" +
    "background:#14110d;color:#f3efe7;border:1px solid rgba(205,180,138,.4);border-radius:16px;padding:12px 38px 12px 12px;" +
    "box-shadow:0 18px 40px -16px rgba(0,0,0,.55);font-family:Manrope,Arial,sans-serif;transform:translateY(140%);opacity:0;transition:transform .5s cubic-bezier(.16,1,.3,1),opacity .4s}" +
    ".sct.open{transform:none;opacity:1}" +
    ".sct img{width:62px;height:62px;border-radius:11px;object-fit:cover;flex:none;background:#000}" +
    ".sct .k{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#cdb48a}" +
    ".sct b{display:block;font-family:Archivo,Manrope,sans-serif;font-size:15.5px;line-height:1.25;margin-top:2px;color:#fff}" +
    ".sct p{margin:3px 0 0;font-size:12.5px;line-height:1.4;color:rgba(243,239,231,.75)}" +
    ".sct a.go{display:inline-block;margin-top:6px;font-size:12.5px;font-weight:700;color:#cdb48a;text-decoration:none}" +
    ".sct a.go:hover{color:#fff}" +
    ".sct .x{position:absolute;right:8px;top:8px;width:26px;height:26px;border-radius:8px;border:none;background:rgba(243,239,231,.08);color:#f3efe7;cursor:pointer;font-size:13px}" +
    ".sct .x:hover{background:rgba(243,239,231,.18)}" +
    "@media(max-width:620px){.sct{bottom:84px}}" +
    "@media(prefers-reduced-motion:reduce){.sct{transition:none}}";
  document.head.appendChild(css);

  var el = document.createElement("aside");
  el.className = "sct";
  el.setAttribute("aria-label", "Neu: CCV Shop & Clean");
  el.innerHTML =
    '<img src="images/hero-car.jpg" alt="">' +
    '<div><span class="k">' + (heute ? "Heute live · bis 21 Uhr" : "Neu · Sa, 16.01.2027") + '</span>' +
    '<b>Shop &amp; Clean im Nidder Forum</b>' +
    '<p>Dein Auto wird gepflegt, während du einkaufst. 10–21 Uhr, 0,90 €/Min.</p>' +
    '<a class="go" href="shop-clean.html">Mehr erfahren →</a></div>' +
    '<button type="button" class="x" aria-label="Schließen">✕</button>';

  function zeigen() {
    try { if (sessionStorage.getItem("ccv_popup_besuch")) return; sessionStorage.setItem("ccv_popup_besuch", "teaser"); } catch (e) {} // nur ein Pop-up pro Besuch
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("open"); }); });
  }
  el.querySelector(".x").addEventListener("click", function () {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    el.classList.remove("open"); setTimeout(function () { el.remove(); }, 450);
  });
  setTimeout(zeigen, 3500);
})();
