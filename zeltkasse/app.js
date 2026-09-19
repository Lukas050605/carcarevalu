(() => {
  "use strict";

  const STORAGE_KEY = "zeltkasse_v1";

  const DEFAULT_PRODUCTS = [
    { id: "p1", name: "Wasser 0,5L", price: 1.00, category: "Getränke", color: "#1565c0" },
    { id: "p2", name: "Apfelschorle", price: 1.50, category: "Getränke", color: "#1565c0" },
    { id: "p3", name: "Cola 0,5L", price: 1.50, category: "Getränke", color: "#1565c0" },
    { id: "p4", name: "Bier 0,5L", price: 2.00, category: "Getränke", color: "#1565c0" },
    { id: "p5", name: "Kaffee", price: 1.00, category: "Getränke", color: "#1565c0" },
    { id: "p6", name: "Bratwurst", price: 2.50, category: "Snacks", color: "#ef6c00" },
    { id: "p7", name: "Pommes", price: 2.00, category: "Snacks", color: "#ef6c00" },
    { id: "p8", name: "Popcorn", price: 1.50, category: "Snacks", color: "#ef6c00" },
    { id: "p9", name: "Kuchen (Stück)", price: 1.50, category: "Backwaren", color: "#8e24aa" },
    { id: "p10", name: "Waffel", price: 2.00, category: "Backwaren", color: "#8e24aa" },
  ];

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.products)) parsed.products = DEFAULT_PRODUCTS.slice();
        if (!Array.isArray(parsed.sales)) parsed.sales = [];
        if (typeof parsed.startFloat !== "number") parsed.startFloat = 0;
        return parsed;
      }
    } catch (e) {
      console.warn("Konnte gespeicherte Daten nicht laden, starte neu.", e);
    }
    return { products: DEFAULT_PRODUCTS.slice(), sales: [], startFloat: 0 };
  }

  let state = loadState();
  let cart = []; // { productId|null, name, price, qty }
  let activeCategory = "Alle";
  let payMethod = "bar";
  let editingProductId = null;

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function fmt(n) {
    return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  function parseGermanNumber(str) {
    if (!str) return NaN;
    const cleaned = str.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    return parseFloat(cleaned);
  }

  function uid() {
    return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------------- Navigation ----------------

  const tabButtons = document.querySelectorAll(".tab-btn");
  const views = {
    kasse: document.getElementById("view-kasse"),
    bericht: document.getElementById("view-bericht"),
    einstellungen: document.getElementById("view-einstellungen"),
  };

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(views).forEach(v => v.classList.remove("active"));
      views[btn.dataset.view].classList.add("active");
      if (btn.dataset.view === "bericht") renderReport();
      if (btn.dataset.view === "einstellungen") renderSettings();
    });
  });

  // ---------------- Products / Kasse view ----------------

  const categoryBar = document.getElementById("categoryBar");
  const productGrid = document.getElementById("productGrid");

  function getCategories() {
    const set = new Set(state.products.map(p => p.category || "Sonstiges"));
    return ["Alle", ...Array.from(set)];
  }

  function renderCategoryBar() {
    const cats = getCategories();
    categoryBar.innerHTML = "";
    cats.forEach(cat => {
      const chip = document.createElement("button");
      chip.className = "category-chip" + (cat === activeCategory ? " active" : "");
      chip.textContent = cat;
      chip.addEventListener("click", () => {
        activeCategory = cat;
        renderCategoryBar();
        renderProductGrid();
      });
      categoryBar.appendChild(chip);
    });
  }

  function renderProductGrid() {
    productGrid.innerHTML = "";
    const list = state.products.filter(p => activeCategory === "Alle" || (p.category || "Sonstiges") === activeCategory);
    if (list.length === 0) {
      productGrid.innerHTML = '<p class="no-products">Keine Produkte in dieser Kategorie.</p>';
      return;
    }
    list.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "product-btn";
      btn.style.background = p.color || "#2e7d32";
      btn.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="price">${fmt(p.price)}</span>`;
      btn.addEventListener("click", () => addToCart(p));
      productGrid.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function addToCart(product) {
    const existing = cart.find(c => c.productId === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ productId: product.id, name: product.name, price: product.price, qty: 1 });
    }
    renderCart();
  }

  function addManualToCart(name, price) {
    cart.push({ productId: null, name: name || "Artikel", price, qty: 1 });
    renderCart();
  }

  // ---------------- Cart ----------------

  const cartItemsEl = document.getElementById("cartItems");
  const cartTotalEl = document.getElementById("cartTotal");
  const btnPay = document.getElementById("btnPay");

  function cartTotal() {
    return cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  }

  function renderCart() {
    cartItemsEl.innerHTML = "";
    if (cart.length === 0) {
      cartItemsEl.innerHTML = '<p class="empty-hint">Noch keine Artikel im Bon.</p>';
    } else {
      cart.forEach((line, idx) => {
        const row = document.createElement("div");
        row.className = "cart-line";
        row.innerHTML = `
          <div class="cart-line-info">
            <div class="cart-line-name">${escapeHtml(line.name)}</div>
            <div class="cart-line-price">${fmt(line.price)} / Stk.</div>
          </div>
          <div class="qty-control">
            <button class="qty-btn" data-action="dec" data-idx="${idx}">−</button>
            <span class="qty-value">${line.qty}</span>
            <button class="qty-btn" data-action="inc" data-idx="${idx}">+</button>
          </div>
          <div class="line-total">${fmt(line.price * line.qty)}</div>
          <button class="line-remove" data-action="remove" data-idx="${idx}">✕</button>
        `;
        cartItemsEl.appendChild(row);
      });
    }
    cartTotalEl.textContent = fmt(cartTotal());
    btnPay.disabled = cart.length === 0;
  }

  cartItemsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx, 10);
    const line = cart[idx];
    if (!line) return;
    if (btn.dataset.action === "inc") line.qty += 1;
    if (btn.dataset.action === "dec") {
      line.qty -= 1;
      if (line.qty <= 0) cart.splice(idx, 1);
    }
    if (btn.dataset.action === "remove") cart.splice(idx, 1);
    renderCart();
  });

  document.getElementById("btnClearCart").addEventListener("click", () => {
    if (cart.length === 0) return;
    if (confirm("Bon wirklich leeren?")) {
      cart = [];
      renderCart();
    }
  });

  // ---------------- Manual item modal ----------------

  const manualModal = document.getElementById("manualModal");
  const manualName = document.getElementById("manualName");
  const manualPrice = document.getElementById("manualPrice");

  document.getElementById("btnManualItem").addEventListener("click", () => {
    manualName.value = "";
    manualPrice.value = "";
    manualModal.classList.remove("hidden");
    manualName.focus();
  });

  document.getElementById("btnCancelManual").addEventListener("click", () => {
    manualModal.classList.add("hidden");
  });

  document.getElementById("btnAddManual").addEventListener("click", () => {
    const price = parseGermanNumber(manualPrice.value);
    if (isNaN(price) || price < 0) {
      alert("Bitte einen gültigen Preis eingeben.");
      return;
    }
    addManualToCart(manualName.value.trim(), price);
    manualModal.classList.add("hidden");
  });

  // ---------------- Pay modal ----------------

  const payModal = document.getElementById("payModal");
  const payTotalAmount = document.getElementById("payTotalAmount");
  const givenAmount = document.getElementById("givenAmount");
  const changeAmount = document.getElementById("changeAmount");
  const cashSection = document.getElementById("cashSection");
  const quickAmounts = document.getElementById("quickAmounts");
  const numpad = document.getElementById("numpad");
  const btnConfirmPay = document.getElementById("btnConfirmPay");

  document.getElementById("btnPay").addEventListener("click", () => {
    if (cart.length === 0) return;
    payMethod = "bar";
    document.querySelectorAll(".method-btn").forEach(b => b.classList.toggle("active", b.dataset.method === "bar"));
    cashSection.style.display = "block";
    givenAmount.value = "";
    payTotalAmount.textContent = fmt(cartTotal());
    renderQuickAmounts();
    updateChange();
    payModal.classList.remove("hidden");
  });

  document.getElementById("btnCancelPay").addEventListener("click", () => {
    payModal.classList.add("hidden");
  });

  document.querySelectorAll(".method-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      payMethod = btn.dataset.method;
      document.querySelectorAll(".method-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      cashSection.style.display = payMethod === "bar" ? "block" : "none";
      updateChange();
    });
  });

  function renderQuickAmounts() {
    const total = cartTotal();
    const roundUp = (n) => Math.ceil(n);
    const candidates = new Set([total, roundUp(total), 5, 10, 20, 50]);
    quickAmounts.innerHTML = "";
    Array.from(candidates)
      .filter(v => v >= total)
      .sort((a, b) => a - b)
      .slice(0, 6)
      .forEach(v => {
        const btn = document.createElement("button");
        btn.className = "quick-amount-btn";
        btn.textContent = v === total ? "Passend" : fmt(v);
        btn.addEventListener("click", () => {
          givenAmount.value = v.toFixed(2).replace(".", ",");
          updateChange();
        });
        quickAmounts.appendChild(btn);
      });
  }

  numpad.innerHTML = "";
  ["1","2","3","4","5","6","7","8","9",",","0","⌫"].forEach(key => {
    const btn = document.createElement("button");
    btn.textContent = key;
    btn.addEventListener("click", () => {
      if (key === "⌫") {
        givenAmount.value = givenAmount.value.slice(0, -1);
      } else {
        if (key === "," && givenAmount.value.includes(",")) return;
        givenAmount.value += key;
      }
      updateChange();
    });
    numpad.appendChild(btn);
  });

  givenAmount.addEventListener("input", updateChange);

  function updateChange() {
    const total = cartTotal();
    const given = parseGermanNumber(givenAmount.value);
    const changeRow = changeAmount.parentElement;
    if (payMethod !== "bar") {
      changeAmount.textContent = fmt(0);
      changeRow.classList.remove("negative");
      btnConfirmPay.disabled = false;
      return;
    }
    if (isNaN(given)) {
      changeAmount.textContent = "–";
      btnConfirmPay.disabled = true;
      return;
    }
    const change = given - total;
    changeAmount.textContent = fmt(Math.abs(change));
    changeRow.classList.toggle("negative", change < 0);
    btnConfirmPay.disabled = change < 0;
  }

  btnConfirmPay.addEventListener("click", () => {
    const total = cartTotal();
    let given = total;
    let change = 0;
    if (payMethod === "bar") {
      given = parseGermanNumber(givenAmount.value);
      if (isNaN(given) || given < total) return;
      change = given - total;
    }
    const sale = {
      id: uid(),
      timestamp: Date.now(),
      items: cart.map(l => ({ name: l.name, price: l.price, qty: l.qty })),
      total,
      paymentMethod: payMethod,
      given: payMethod === "bar" ? given : total,
      change: payMethod === "bar" ? change : 0,
    };
    state.sales.push(sale);
    saveState();
    payModal.classList.add("hidden");
    showReceipt(sale);
    cart = [];
    renderCart();
  });

  // ---------------- Receipt ----------------

  const receiptModal = document.getElementById("receiptModal");
  const receiptContent = document.getElementById("receiptContent");

  function showReceipt(sale) {
    const rows = sale.items.map(i => `
      <tr>
        <td>${escapeHtml(i.name)} ${i.qty > 1 ? "x" + i.qty : ""}</td>
        <td style="text-align:right">${fmt(i.price * i.qty)}</td>
      </tr>`).join("");
    const paymentLine = sale.paymentMethod === "bar"
      ? `<tr><td>Gegeben</td><td style="text-align:right">${fmt(sale.given)}</td></tr>
         <tr><td>Rückgeld</td><td style="text-align:right">${fmt(sale.change)}</td></tr>`
      : `<tr><td colspan="2">Bezahlt mit Karte</td></tr>`;
    receiptContent.innerHTML = `
      <table>
        ${rows}
        <tr class="receipt-total"><td>Summe</td><td style="text-align:right">${fmt(sale.total)}</td></tr>
        ${paymentLine}
      </table>
    `;
    receiptModal.classList.remove("hidden");
  }

  document.getElementById("btnCloseReceipt").addEventListener("click", () => {
    receiptModal.classList.add("hidden");
  });

  // ---------------- Bericht ----------------

  function renderReport() {
    const sales = state.sales;
    const total = sales.reduce((s, sale) => s + sale.total, 0);
    const cash = sales.filter(s => s.paymentMethod === "bar").reduce((s, sale) => s + sale.total, 0);
    const card = sales.filter(s => s.paymentMethod === "karte").reduce((s, sale) => s + sale.total, 0);

    document.getElementById("repTotal").textContent = fmt(total);
    document.getElementById("repCount").textContent = sales.length;
    document.getElementById("repCash").textContent = fmt(cash);
    document.getElementById("repCard").textContent = fmt(card);
    document.getElementById("repExpectedCash").textContent = fmt(state.startFloat + cash);

    const itemMap = new Map();
    sales.forEach(sale => {
      sale.items.forEach(i => {
        const key = i.name;
        const entry = itemMap.get(key) || { qty: 0, revenue: 0 };
        entry.qty += i.qty;
        entry.revenue += i.price * i.qty;
        itemMap.set(key, entry);
      });
    });
    const itemsBody = document.querySelector("#repItemsTable tbody");
    itemsBody.innerHTML = "";
    Array.from(itemMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .forEach(([name, entry]) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(name)}</td><td>${entry.qty}</td><td>${fmt(entry.revenue)}</td>`;
        itemsBody.appendChild(tr);
      });
    if (itemMap.size === 0) {
      itemsBody.innerHTML = '<tr><td colspan="3">Noch keine Verkäufe.</td></tr>';
    }

    const salesBody = document.querySelector("#repSalesTable tbody");
    salesBody.innerHTML = "";
    sales.slice().reverse().forEach(sale => {
      const time = new Date(sale.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      const itemsText = sale.items.map(i => `${i.name}${i.qty > 1 ? " x" + i.qty : ""}`).join(", ");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${time}</td>
        <td>${escapeHtml(itemsText)}</td>
        <td>${sale.paymentMethod === "bar" ? "Bar" : "Karte"}</td>
        <td>${fmt(sale.total)}</td>
        <td><button class="btn-void" data-id="${sale.id}">Stornieren</button></td>
      `;
      salesBody.appendChild(tr);
    });
    if (sales.length === 0) {
      salesBody.innerHTML = '<tr><td colspan="5">Noch keine Verkäufe.</td></tr>';
    }
  }

  document.querySelector("#repSalesTable tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    if (!confirm("Diesen Verkauf wirklich stornieren?")) return;
    state.sales = state.sales.filter(s => s.id !== btn.dataset.id);
    saveState();
    renderReport();
  });

  document.getElementById("btnExportCsv").addEventListener("click", () => {
    const lines = [["Zeit", "Artikel", "Menge", "Einzelpreis", "Zahlart", "Summe"].join(";")];
    state.sales.forEach(sale => {
      const time = new Date(sale.timestamp).toLocaleString("de-DE");
      sale.items.forEach(i => {
        lines.push([
          time,
          i.name,
          i.qty,
          i.price.toFixed(2).replace(".", ","),
          sale.paymentMethod,
          (i.price * i.qty).toFixed(2).replace(".", ","),
        ].join(";"));
      });
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `zeltkasse-bericht-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btnResetDay").addEventListener("click", () => {
    if (state.sales.length === 0) {
      alert("Es liegen keine Verkäufe vor.");
      return;
    }
    if (confirm("Tag wirklich abschließen? Alle Verkäufe des Tages werden gelöscht (vorher CSV exportieren!).")) {
      state.sales = [];
      saveState();
      renderReport();
    }
  });

  // ---------------- Einstellungen ----------------

  const startFloatInput = document.getElementById("startFloat");
  const productAdminList = document.getElementById("productAdminList");
  const productForm = document.getElementById("productForm");
  const prodId = document.getElementById("prodId");
  const prodName = document.getElementById("prodName");
  const prodPrice = document.getElementById("prodPrice");
  const prodCategory = document.getElementById("prodCategory");
  const prodColor = document.getElementById("prodColor");
  const categoryList = document.getElementById("categoryList");

  function renderSettings() {
    startFloatInput.value = state.startFloat;

    categoryList.innerHTML = "";
    getCategories().filter(c => c !== "Alle").forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      categoryList.appendChild(opt);
    });

    productAdminList.innerHTML = "";
    if (state.products.length === 0) {
      productAdminList.innerHTML = '<p class="no-products">Noch keine Produkte angelegt.</p>';
    }
    state.products.forEach(p => {
      const row = document.createElement("div");
      row.className = "product-admin-row";
      row.innerHTML = `
        <span class="product-swatch" style="background:${p.color || "#2e7d32"}"></span>
        <div class="product-admin-info">
          <div class="product-admin-name">${escapeHtml(p.name)}</div>
          <div class="product-admin-meta">${fmt(p.price)} · ${escapeHtml(p.category || "Sonstiges")}</div>
        </div>
        <div class="product-admin-actions">
          <button class="icon-btn" data-action="edit" data-id="${p.id}">Bearbeiten</button>
          <button class="icon-btn" data-action="delete" data-id="${p.id}">Löschen</button>
        </div>
      `;
      productAdminList.appendChild(row);
    });
  }

  startFloatInput.addEventListener("change", () => {
    const val = parseFloat(startFloatInput.value);
    state.startFloat = isNaN(val) ? 0 : val;
    saveState();
  });

  productAdminList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "delete") {
      if (confirm("Produkt wirklich löschen?")) {
        state.products = state.products.filter(p => p.id !== id);
        saveState();
        renderSettings();
        renderCategoryBar();
        renderProductGrid();
      }
    }
    if (btn.dataset.action === "edit") {
      const p = state.products.find(p => p.id === id);
      if (!p) return;
      editingProductId = id;
      prodId.value = id;
      prodName.value = p.name;
      prodPrice.value = p.price;
      prodCategory.value = p.category || "";
      prodColor.value = p.color || "#2e7d32";
      prodName.focus();
    }
  });

  productForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = prodName.value.trim();
    const price = parseFloat(prodPrice.value);
    const category = prodCategory.value.trim() || "Sonstiges";
    const color = prodColor.value;
    if (!name || isNaN(price) || price < 0) {
      alert("Bitte Name und gültigen Preis angeben.");
      return;
    }
    if (editingProductId) {
      const p = state.products.find(p => p.id === editingProductId);
      Object.assign(p, { name, price, category, color });
    } else {
      state.products.push({ id: uid(), name, price, category, color });
    }
    saveState();
    resetProductForm();
    renderSettings();
    renderCategoryBar();
    renderProductGrid();
  });

  document.getElementById("btnCancelEdit").addEventListener("click", resetProductForm);

  function resetProductForm() {
    editingProductId = null;
    productForm.reset();
    prodColor.value = "#2e7d32";
    prodId.value = "";
  }

  document.getElementById("btnResetAll").addEventListener("click", () => {
    if (confirm("Wirklich ALLE Daten (Produkte, Verkäufe, Einstellungen) löschen? Dies kann nicht rückgängig gemacht werden.")) {
      state = { products: DEFAULT_PRODUCTS.slice(), sales: [], startFloat: 0 };
      saveState();
      cart = [];
      activeCategory = "Alle";
      renderCart();
      renderCategoryBar();
      renderProductGrid();
      renderSettings();
      renderReport();
    }
  });

  // ---------------- Init ----------------

  renderCategoryBar();
  renderProductGrid();
  renderCart();
})();
