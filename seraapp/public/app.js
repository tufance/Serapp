const app = document.getElementById("app");

const state = {
  authed: false,
  needsSetup: false,
  activeSeason: null,
  page: "loading", // loading|setup|login|home
};

const TABS = [
  { key: "pano", label: "Pano" },
  { key: "alim", label: "Alım" },
  { key: "hareket", label: "Hareket" },
  { key: "satis", label: "Satış" },
  { key: "ortak", label: "Ortak" },
];

state.activeTab = state.activeTab || "pano";
state.alimSubTab = state.alimSubTab || "fidan";
state.hareketSubTab = state.hareketSubTab || "ilac";
state.satisSubTab = state.satisSubTab || "satislar";
state.settingsOpen = state.settingsOpen || false;
state.settingsTab = state.settingsTab || "seasons";

async function apiCall(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    credentials: "same-origin",
  });
  if (res.status === 401) {
    state.authed = false;
    if (state.page !== "setup") state.page = "login";
    render();
    throw new Error("unauthorized");
  }
  if (!res.ok && res.status !== 204) {
    let msg = "Beklenmedik hata";
    try { msg = (await res.json()).error || msg; } catch {}
    toast(msg, "error");
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal({ title, body, onSave, saveLabel = "Kaydet" }) {
  // body: HTML string with form fields (inputs should have ids)
  // onSave: async (modalRoot) => Promise<boolean> — return true to close
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <h2>${escape(title)}</h2>
      ${body}
      <div class="modal-actions">
        <button class="secondary" id="modal_cancel">İptal</button>
        <button class="primary" id="modal_save">${escape(saveLabel)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.getElementById("modal_cancel").onclick = close;
  document.getElementById("modal_save").onclick = async () => {
    const btn = document.getElementById("modal_save");
    btn.disabled = true;
    try {
      const ok = await onSave(overlay);
      if (ok !== false) close();
    } finally {
      btn.disabled = false;
    }
  };
}

function html(strings, ...values) {
  // basit template helper; XSS önlemiyor — tüm dinamik metinler textContent ile yazılır
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ""), "");
}

// --- Sayfalar ---

function renderLoading() {
  app.innerHTML = `<div class="empty">Yükleniyor…</div>`;
}

function renderSetup() {
  app.innerHTML = `
    <main>
      <img src="/logo.svg" alt="SerApp" style="display:block; margin:40px auto 12px; width:80px; height:80px;" />
      <h1 style="text-align:center; margin:0;">SerApp</h1>
      <p style="text-align:center; color:var(--muted);">İlk kurulum: parola belirle.</p>
      <div class="card" style="margin-top:24px;">
        <label>Parola</label>
        <input id="pw" type="password" autocomplete="new-password" />
        <div style="height:16px;"></div>
        <button class="primary" id="submit">Kur</button>
      </div>
    </main>
  `;
  document.getElementById("submit").onclick = async () => {
    const pw = document.getElementById("pw").value;
    if (!pw) return toast("Parola gerekli", "error");
    try {
      await apiCall("/api/setup", { method: "POST", body: JSON.stringify({ password: pw }) });
      toast("Kurulum tamam. Giriş yapabilirsin.");
      state.needsSetup = false;
      state.page = "login";
      render();
    } catch {}
  };
}

function renderLogin() {
  app.innerHTML = `
    <main>
      <img src="/logo.svg" alt="SerApp" style="display:block; margin:40px auto 12px; width:80px; height:80px;" />
      <h1 style="text-align:center; margin:0;">SerApp</h1>
      <div class="card" style="margin-top:24px;">
        <label>Parola</label>
        <input id="pw" type="password" autocomplete="current-password" />
        <div style="height:16px;"></div>
        <button class="primary" id="submit">Giriş</button>
      </div>
    </main>
  `;
  document.getElementById("submit").onclick = async () => {
    const pw = document.getElementById("pw").value;
    try {
      await apiCall("/api/auth/login", { method: "POST", body: JSON.stringify({ password: pw }) });
      state.authed = true;
      state.page = "home";
      await bootstrap();
    } catch {}
  };
}

function renderHome() {
  app.innerHTML = `
    <header class="season-bar">
      <div class="row" style="gap:10px; align-items:center;">
        <img src="/logo.svg" alt="" style="width:28px; height:28px; flex-shrink:0;" />
        <div>
          <div class="label">Aktif sezon</div>
          <div class="value" id="seasonName">${state.activeSeason ? escape(state.activeSeason.name) : "Sezon yok"}</div>
        </div>
      </div>
      <button class="settings" id="openSettings" aria-label="Ayarlar">⚙</button>
    </header>
    <main id="content"></main>
    <nav class="bottom">
      ${TABS.map(t => `<button data-tab="${t.key}" class="${state.activeTab === t.key ? "active" : ""}">${t.label}</button>`).join("")}
    </nav>
  `;
  document.querySelectorAll("nav.bottom button").forEach(b => {
    b.onclick = () => { state.activeTab = b.dataset.tab; renderHome(); };
  });
  document.getElementById("openSettings").onclick = () => { state.settingsOpen = true; renderSettings(); };
  renderTabContent();
}

function renderTabContent() {
  const c = document.getElementById("content");
  if (!state.activeSeason && state.activeTab !== "pano") {
    c.innerHTML = `<div class="card"><div class="empty">Önce ⚙ Ayarlar > Sezonlar'dan bir sezon oluşturup "Aktif et" deyin.</div></div>`;
    return;
  }
  if (state.activeTab === "pano") {
    renderPano(c);
  } else if (state.activeTab === "alim") {
    renderAlimTab(c);
  } else if (state.activeTab === "hareket") {
    renderHareketTab(c);
  } else if (state.activeTab === "satis") {
    renderSatisTab(c);
  } else if (state.activeTab === "ortak") {
    renderOrtakTab(c);
  } else {
    c.innerHTML = `<div class="card"><h2>${escape(TABS.find(t=>t.key===state.activeTab).label)}</h2><div class="empty">Bu modül sonraki fazlarda gelecek.</div></div>`;
  }
}

function renderAlimTab(container) {
  const SUBS = [
    { key: "fidan", label: "Fidan" },
    { key: "sarf", label: "Sarf" },
    { key: "ilac", label: "İlaç" },
  ];
  container.innerHTML = `
    <div class="card">
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        ${SUBS.map(s =>
          `<button class="${state.alimSubTab===s.key?"primary":"secondary"}" data-sub="${s.key}">${s.label}</button>`
        ).join("")}
      </div>
    </div>
    <div id="alimBody"></div>
  `;
  container.querySelectorAll("[data-sub]").forEach(b => {
    b.onclick = () => { state.alimSubTab = b.dataset.sub; renderTabContent(); };
  });
  const body = document.getElementById("alimBody");
  if (state.alimSubTab === "fidan") renderFidanAlim(body);
  else if (state.alimSubTab === "sarf") renderSarfAlim(body);
  else if (state.alimSubTab === "ilac") renderIlacAlim(body);
}

async function renderFidanAlim(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const [types, varieties, list] = await Promise.all([
    apiCall("/api/master/crop-types"),
    apiCall("/api/master/crop-varieties"),
    apiCall(`/api/seedlings?season_id=${seasonId}`),
  ]);
  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="card">
      <h2>Yeni fidan alımı</h2>
      <label>Tarih</label><input id="f_date" type="date" value="${today}" />
      <label>Tür</label>
      <select id="f_type">${types.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join("")}</select>
      <label>Cins</label>
      <select id="f_variety"></select>
      <label>Adet</label><input id="f_qty" type="number" inputmode="numeric" min="1" />
      <label>Birim maliyet (TL)</label><input id="f_unit" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Toplam (TL)</label><input id="f_total" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Tedarikçi (ops.)</label><input id="f_supplier" />
      <label>Notlar (ops.)</label><input id="f_notes" />
      <div style="height:12px;"></div>
      <button class="primary" id="f_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Bu sezonun fidan alımları</h2>
      ${list.length === 0 ? `<div class="empty">Bu sezonda henüz alım kaydı yok. Yukarıdaki formdan ekleyebilirsin.</div>` :
        list.map(r => {
          const t = types.find(x => x.id === r.crop_type_id);
          const v = varieties.find(x => x.id === r.crop_variety_id);
          return `<div class="list-item">
            <div>
              <div>${escape((t?.name ?? "?"))} · ${escape((v?.name ?? "?"))}</div>
              <div class="meta">${r.purchase_date} · ${r.quantity} adet × ₺${r.unit_cost.toFixed(2)} = ₺${r.total_cost.toFixed(2)}${r.supplier ? ` · ${escape(r.supplier)}` : ""}</div>
            </div>
            <button class="danger" data-del="${r.id}">Sil</button>
          </div>`;
        }).join("")
      }
    </div>
  `;

  function refreshVarietyOptions() {
    const sel = document.getElementById("f_variety");
    const tid = Number(document.getElementById("f_type").value);
    const matches = varieties.filter(v => v.crop_type_id === tid);
    sel.innerHTML = matches.length
      ? matches.map(v => `<option value="${v.id}">${escape(v.name)}</option>`).join("")
      : `<option value="">— Bu tür için cins yok —</option>`;
  }
  refreshVarietyOptions();
  document.getElementById("f_type").onchange = refreshVarietyOptions;

  const qty = document.getElementById("f_qty");
  const unit = document.getElementById("f_unit");
  const total = document.getElementById("f_total");
  function recalc() {
    const q = Number(qty.value), u = Number(unit.value);
    if (q > 0 && u >= 0) total.value = (q * u).toFixed(2);
  }
  qty.oninput = recalc; unit.oninput = recalc;

  document.getElementById("f_create").onclick = async () => {
    const varietyVal = document.getElementById("f_variety").value;
    if (!varietyVal) return toast("Önce bir cins ekle", "error");
    const payload = {
      season_id: seasonId,
      purchase_date: document.getElementById("f_date").value,
      crop_type_id: Number(document.getElementById("f_type").value),
      crop_variety_id: Number(varietyVal),
      quantity: Number(qty.value),
      unit_cost: Number(unit.value),
      total_cost: Number(total.value),
      supplier: document.getElementById("f_supplier").value.trim() || undefined,
      notes: document.getElementById("f_notes").value.trim() || undefined,
    };
    if (!payload.purchase_date || !(payload.quantity > 0) || !(payload.unit_cost >= 0)) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/seedlings", { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderFidanAlim(body);
    } catch {}
  };

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/seedlings/${btn.dataset.del}`, { method: "DELETE" });
      renderFidanAlim(body);
    };
  });
}
async function renderSarfAlim(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const [cats, list, stock] = await Promise.all([
    apiCall("/api/master/supplies"),
    apiCall(`/api/supply-purchases?season_id=${seasonId}`),
    apiCall("/api/stock/supplies"),
  ]);
  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="card">
      <h2>Stok durumu</h2>
      ${stock.length === 0 ? `<div class="empty">Henüz stok hareketi yok.</div>` :
        stock.map(s => `<div class="list-item">
          <div>${escape(s.name)}</div>
          <div class="meta">${s.balance} ${escape(s.unit)}</div>
        </div>`).join("")}
    </div>
    <div class="card">
      <h2>Yeni sarf alımı</h2>
      <label>Tarih</label><input id="sp_date" type="date" value="${today}" />
      <label>Kategori</label>
      <select id="sp_cat">${cats.map(c => `<option value="${c.id}" data-unit="${escape(c.unit)}">${escape(c.name)} (${escape(c.unit)})</option>`).join("")}</select>
      <label>Miktar</label><input id="sp_qty" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Birim (otomatik)</label><input id="sp_unit" readonly />
      <label>Birim maliyet (TL)</label><input id="sp_uc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Toplam (TL)</label><input id="sp_tc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Tedarikçi (ops.)</label><input id="sp_supplier" />
      <label>Notlar (ops.)</label><input id="sp_notes" />
      <div style="height:12px;"></div>
      <button class="primary" id="sp_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Bu sezonun sarf alımları</h2>
      ${list.length === 0 ? `<div class="empty">Bu sezonda henüz alım kaydı yok. Yukarıdaki formdan ekleyebilirsin.</div>` :
        list.map(r => {
          const cat = cats.find(c => c.id === r.supply_category_id);
          return `<div class="list-item">
            <div>
              <div>${escape(cat?.name ?? "?")}</div>
              <div class="meta">${r.purchase_date} · ${r.quantity} ${escape(r.unit)} × ₺${r.unit_cost.toFixed(2)} = ₺${r.total_cost.toFixed(2)}</div>
            </div>
            <button class="danger" data-del="${r.id}">Sil</button>
          </div>`;
        }).join("")}
    </div>
  `;

  function syncUnit() {
    const sel = document.getElementById("sp_cat");
    document.getElementById("sp_unit").value = sel.options[sel.selectedIndex]?.dataset.unit ?? "";
  }
  syncUnit();
  document.getElementById("sp_cat").onchange = syncUnit;

  const qty = document.getElementById("sp_qty"), uc = document.getElementById("sp_uc"), tc = document.getElementById("sp_tc");
  function recalc() {
    const q = Number(qty.value), u = Number(uc.value);
    if (q > 0 && u >= 0) tc.value = (q * u).toFixed(2);
  }
  qty.oninput = recalc; uc.oninput = recalc;

  document.getElementById("sp_create").onclick = async () => {
    const payload = {
      season_id: seasonId,
      purchase_date: document.getElementById("sp_date").value,
      supply_category_id: Number(document.getElementById("sp_cat").value),
      quantity: Number(qty.value),
      unit: document.getElementById("sp_unit").value,
      unit_cost: Number(uc.value),
      total_cost: Number(tc.value),
      supplier: document.getElementById("sp_supplier").value.trim() || undefined,
      notes: document.getElementById("sp_notes").value.trim() || undefined,
    };
    if (!payload.purchase_date || !(payload.quantity > 0) || !payload.unit) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/supply-purchases", { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderSarfAlim(body);
    } catch {}
  };

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/supply-purchases/${btn.dataset.del}`, { method: "DELETE" });
      renderSarfAlim(body);
    };
  });
}
async function renderIlacAlim(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const [meds, list, stock] = await Promise.all([
    apiCall("/api/master/medicines"),
    apiCall(`/api/medicine-purchases?season_id=${seasonId}`),
    apiCall("/api/stock/medicines"),
  ]);
  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="card">
      <h2>Stok durumu</h2>
      ${stock.length === 0 ? `<div class="empty">Henüz stok hareketi yok.</div>` :
        stock.map(s => `<div class="list-item">
          <div>${escape(s.name)}</div>
          <div class="meta">${s.balance} ${escape(s.unit)}</div>
        </div>`).join("")}
    </div>
    <div class="card">
      <h2>Yeni ilaç alımı</h2>
      <label>Tarih</label><input id="mp_date" type="date" value="${today}" />
      <label>İlaç</label>
      <select id="mp_med">${meds.map(m => `<option value="${m.id}" data-unit="${escape(m.unit)}">${escape(m.name)} (${escape(m.unit)})</option>`).join("")}</select>
      <label>Miktar</label><input id="mp_qty" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Birim (otomatik)</label><input id="mp_unit" readonly />
      <label>Birim maliyet (TL)</label><input id="mp_uc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Toplam (TL)</label><input id="mp_tc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Tedarikçi (ops.)</label><input id="mp_supplier" />
      <label>Notlar (ops.)</label><input id="mp_notes" />
      <div style="height:12px;"></div>
      <button class="primary" id="mp_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Bu sezonun ilaç alımları</h2>
      ${list.length === 0 ? `<div class="empty">Bu sezonda henüz alım kaydı yok. Yukarıdaki formdan ekleyebilirsin.</div>` :
        list.map(r => {
          const m = meds.find(x => x.id === r.medicine_id);
          return `<div class="list-item">
            <div>
              <div>${escape(m?.name ?? "?")}</div>
              <div class="meta">${r.purchase_date} · ${r.quantity} ${escape(r.unit)} × ₺${r.unit_cost.toFixed(2)} = ₺${r.total_cost.toFixed(2)}</div>
            </div>
            <button class="danger" data-del="${r.id}">Sil</button>
          </div>`;
        }).join("")}
    </div>
  `;

  function syncUnit() {
    const sel = document.getElementById("mp_med");
    document.getElementById("mp_unit").value = sel.options[sel.selectedIndex]?.dataset.unit ?? "";
  }
  syncUnit();
  document.getElementById("mp_med").onchange = syncUnit;

  const qty = document.getElementById("mp_qty"), uc = document.getElementById("mp_uc"), tc = document.getElementById("mp_tc");
  function recalc() {
    const q = Number(qty.value), u = Number(uc.value);
    if (q > 0 && u >= 0) tc.value = (q * u).toFixed(2);
  }
  qty.oninput = recalc; uc.oninput = recalc;

  document.getElementById("mp_create").onclick = async () => {
    const payload = {
      season_id: seasonId,
      purchase_date: document.getElementById("mp_date").value,
      medicine_id: Number(document.getElementById("mp_med").value),
      quantity: Number(qty.value),
      unit: document.getElementById("mp_unit").value,
      unit_cost: Number(uc.value),
      total_cost: Number(tc.value),
      supplier: document.getElementById("mp_supplier").value.trim() || undefined,
      notes: document.getElementById("mp_notes").value.trim() || undefined,
    };
    if (!payload.purchase_date || !(payload.quantity > 0) || !payload.unit) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/medicine-purchases", { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderIlacAlim(body);
    } catch {}
  };

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/medicine-purchases/${btn.dataset.del}`, { method: "DELETE" });
      renderIlacAlim(body);
    };
  });
}
async function renderHareketTab(container) {
  const SUBS = [
    { key: "ilac", label: "İlaç uygulaması" },
    { key: "tuketim", label: "Tüketim" },
  ];
  container.innerHTML = `
    <div class="card">
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        ${SUBS.map(s =>
          `<button class="${state.hareketSubTab===s.key?"primary":"secondary"}" data-sub="${s.key}">${s.label}</button>`
        ).join("")}
      </div>
    </div>
    <div id="hareketBody"></div>
  `;
  container.querySelectorAll("[data-sub]").forEach(b => {
    b.onclick = () => { state.hareketSubTab = b.dataset.sub; renderTabContent(); };
  });
  const body = document.getElementById("hareketBody");
  if (state.hareketSubTab === "ilac") await renderIlacUygulama(body);
  else if (state.hareketSubTab === "tuketim") await renderTuketim(body);
}

async function renderTuketim(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const [supplies, utilities, list, monthly] = await Promise.all([
    apiCall("/api/master/supplies"),
    apiCall("/api/master/utilities"),
    apiCall(`/api/consumption?season_id=${seasonId}`),
    apiCall(`/api/reports/monthly-consumption?season_id=${seasonId}`),
  ]);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const monthlyTotals = {};
  for (const r of monthly) {
    monthlyTotals[r.period_month] = (monthlyTotals[r.period_month] || 0) + (r.total_cost || 0);
  }
  const monthsSorted = Object.keys(monthlyTotals).sort().reverse();

  body.innerHTML = `
    <div class="card">
      <h2>Aylık tüketim özeti</h2>
      ${monthsSorted.length === 0 ? `<div class="empty">Henüz kayıt yok.</div>` :
        monthsSorted.map(m => `<div class="list-item">
          <div>${m}</div>
          <div class="meta">₺${monthlyTotals[m].toFixed(2)}</div>
        </div>`).join("")}
    </div>
    <div class="card">
      <h2>Yeni tüketim kaydı</h2>
      <label>Tür</label>
      <select id="t_type">
        <option value="supply">Sarf (stoklu)</option>
        <option value="utility">Tüketim kalemi (elektrik/su...)</option>
      </select>
      <label>Kalem</label>
      <select id="t_ref"></select>
      <label>Dönem (ay)</label><input id="t_month" type="month" value="${currentMonth}" />
      <label>Miktar</label><input id="t_qty" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Birim (otomatik)</label><input id="t_unit" readonly />
      <label>Birim maliyet (ops.)</label><input id="t_uc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Toplam (TL, ops.)</label><input id="t_tc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Notlar (ops.)</label><input id="t_notes" />
      <div style="height:12px;"></div>
      <button class="primary" id="t_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Bu sezonun kayıtları</h2>
      ${list.length === 0 ? `<div class="empty">Bu sezonda henüz tüketim kaydı yok. Yukarıdaki formdan ekleyebilirsin.</div>` :
        list.map(r => {
          const pool = r.item_type === "supply" ? supplies : utilities;
          const it = pool.find(x => x.id === r.ref_id);
          const cost = r.total_cost != null ? ` · ₺${r.total_cost.toFixed(2)}` : "";
          return `<div class="list-item">
            <div>
              <div>${escape(it?.name ?? "?")} <span class="meta">[${r.item_type}]</span></div>
              <div class="meta">${r.period_month} · ${r.quantity} ${escape(r.unit)}${cost}</div>
            </div>
            <button class="danger" data-del="${r.id}">Sil</button>
          </div>`;
        }).join("")}
    </div>
  `;

  function refreshRefOptions() {
    const type = document.getElementById("t_type").value;
    const pool = type === "supply" ? supplies : utilities;
    const sel = document.getElementById("t_ref");
    sel.innerHTML = pool.length
      ? pool.map(p => `<option value="${p.id}" data-unit="${escape(p.unit)}">${escape(p.name)} (${escape(p.unit)})</option>`).join("")
      : `<option value="">— Bu tür için kalem yok —</option>`;
    syncUnit();
  }
  function syncUnit() {
    const sel = document.getElementById("t_ref");
    document.getElementById("t_unit").value = sel.options[sel.selectedIndex]?.dataset.unit ?? "";
  }
  refreshRefOptions();
  document.getElementById("t_type").onchange = refreshRefOptions;
  document.getElementById("t_ref").onchange = syncUnit;

  const qty = document.getElementById("t_qty"), uc = document.getElementById("t_uc"), tc = document.getElementById("t_tc");
  function recalc() {
    const q = Number(qty.value), u = Number(uc.value);
    if (q > 0 && u >= 0) tc.value = (q * u).toFixed(2);
  }
  qty.oninput = recalc; uc.oninput = recalc;

  document.getElementById("t_create").onclick = async () => {
    const refVal = document.getElementById("t_ref").value;
    if (!refVal) return toast("Kalem seç", "error");
    const payload = {
      season_id: seasonId,
      period_month: document.getElementById("t_month").value,
      item_type: document.getElementById("t_type").value,
      ref_id: Number(refVal),
      quantity: Number(qty.value),
      unit: document.getElementById("t_unit").value,
      unit_cost: uc.value ? Number(uc.value) : undefined,
      total_cost: tc.value ? Number(tc.value) : undefined,
      notes: document.getElementById("t_notes").value.trim() || undefined,
    };
    if (!payload.period_month || !(payload.quantity > 0) || !payload.unit) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/consumption", { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderTuketim(body);
    } catch {}
  };

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/consumption/${btn.dataset.del}`, { method: "DELETE" });
      renderTuketim(body);
    };
  });
}

function renderSatisTab(container) {
  const SUBS = [
    { key: "satislar", label: "Satışlar" },
    { key: "piyasa", label: "Piyasa fiyatları" },
  ];
  container.innerHTML = `
    <div class="card">
      <div class="row" style="gap:8px; flex-wrap:wrap;">
        ${SUBS.map(s =>
          `<button class="${state.satisSubTab===s.key?"primary":"secondary"}" data-sub="${s.key}">${s.label}</button>`
        ).join("")}
      </div>
    </div>
    <div id="satisBody"></div>
  `;
  container.querySelectorAll("[data-sub]").forEach(b => {
    b.onclick = () => { state.satisSubTab = b.dataset.sub; renderTabContent(); };
  });
  const body = document.getElementById("satisBody");
  if (state.satisSubTab === "satislar") renderSatislar(body);
  else if (state.satisSubTab === "piyasa") renderPiyasaFiyatlari(body);
}

async function renderSatislar(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const [types, varieties, list] = await Promise.all([
    apiCall("/api/master/crop-types"),
    apiCall("/api/master/crop-varieties"),
    apiCall(`/api/sales?season_id=${seasonId}`),
  ]);
  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="card">
      <h2>Yeni satış</h2>
      <label>Tarih</label><input id="sale_date" type="date" value="${today}" />
      <label>Tür</label>
      <select id="sale_type">${types.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join("")}</select>
      <label>Cins</label>
      <select id="sale_var"></select>
      <label>Miktar (kg)</label><input id="sale_qty" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Birim fiyat (TL/kg)</label><input id="sale_up" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Toplam ciro (TL)</label><input id="sale_tr" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Birim maliyet (TL/kg, ops.)</label><input id="sale_uc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Toplam maliyet (TL, ops.)</label><input id="sale_tc" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Alıcı (ops.)</label><input id="sale_buyer" />
      <label>Notlar (ops.)</label><input id="sale_notes" />
      <div style="height:12px;"></div>
      <button class="primary" id="sale_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Bu sezonun satışları</h2>
      ${list.length === 0 ? `<div class="empty">Bu sezonda henüz satış kaydı yok. Yukarıdaki formdan ekleyebilirsin.</div>` :
        list.map(r => {
          const t = types.find(x => x.id === r.crop_type_id);
          const v = varieties.find(x => x.id === r.crop_variety_id);
          return `<div class="list-item">
            <div>
              <div>${escape(t?.name ?? "?")} · ${escape(v?.name ?? "?")}${r.buyer ? ` → ${escape(r.buyer)}` : ""}</div>
              <div class="meta">${r.sale_date} · ${r.quantity} kg × ₺${r.unit_price.toFixed(2)} = ₺${r.total_revenue.toFixed(2)}</div>
            </div>
            <div class="row">
              <button class="secondary" data-edit="${r.id}">Düzenle</button>
              <button class="danger" data-del="${r.id}">Sil</button>
            </div>
          </div>`;
        }).join("")}
    </div>
  `;

  function refreshVar() {
    const sel = document.getElementById("sale_var");
    const tid = Number(document.getElementById("sale_type").value);
    const matches = varieties.filter(v => v.crop_type_id === tid);
    sel.innerHTML = matches.length
      ? matches.map(v => `<option value="${v.id}">${escape(v.name)}</option>`).join("")
      : `<option value="">— Bu tür için cins yok —</option>`;
  }
  refreshVar();
  document.getElementById("sale_type").onchange = refreshVar;

  const qty = document.getElementById("sale_qty");
  const up = document.getElementById("sale_up");
  const tr = document.getElementById("sale_tr");
  const uc = document.getElementById("sale_uc");
  const tc = document.getElementById("sale_tc");
  function recalcRev() {
    const q = Number(qty.value), p = Number(up.value);
    if (q > 0 && p >= 0) tr.value = (q * p).toFixed(2);
  }
  function recalcCost() {
    const q = Number(qty.value), p = Number(uc.value);
    if (q > 0 && p >= 0) tc.value = (q * p).toFixed(2);
  }
  qty.oninput = () => { recalcRev(); recalcCost(); };
  up.oninput = recalcRev;
  uc.oninput = recalcCost;

  document.getElementById("sale_create").onclick = async () => {
    const varVal = document.getElementById("sale_var").value;
    if (!varVal) return toast("Önce bir cins ekle", "error");
    const payload = {
      season_id: seasonId,
      sale_date: document.getElementById("sale_date").value,
      crop_type_id: Number(document.getElementById("sale_type").value),
      crop_variety_id: Number(varVal),
      quantity: Number(qty.value),
      unit_price: Number(up.value),
      total_revenue: Number(tr.value),
      unit_cost: uc.value ? Number(uc.value) : undefined,
      total_cost: tc.value ? Number(tc.value) : undefined,
      buyer: document.getElementById("sale_buyer").value.trim() || undefined,
      notes: document.getElementById("sale_notes").value.trim() || undefined,
    };
    if (!payload.sale_date || !(payload.quantity > 0) || !(payload.unit_price >= 0) || !(payload.total_revenue >= 0)) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/sales", { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderSatislar(body);
    } catch {}
  };

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/sales/${btn.dataset.del}`, { method: "DELETE" });
      renderSatislar(body);
    };
  });

  body.querySelectorAll("[data-edit]").forEach(btn => {
    btn.onclick = () => {
      const id = Number(btn.dataset.edit);
      const r = list.find(x => x.id === id);
      if (!r) return;
      openModal({
        title: "Satış düzenle",
        body: `
          <label>Tarih</label><input id="em_date" type="date" value="${r.sale_date}" />
          <label>Miktar (kg)</label><input id="em_qty" type="number" inputmode="decimal" min="0" step="0.01" value="${r.quantity}" />
          <label>Birim fiyat (TL/kg)</label><input id="em_up" type="number" inputmode="decimal" min="0" step="0.01" value="${r.unit_price}" />
          <label>Toplam ciro (TL)</label><input id="em_tr" type="number" inputmode="decimal" min="0" step="0.01" value="${r.total_revenue}" />
          <label>Birim maliyet (TL/kg, ops.)</label><input id="em_uc" type="number" inputmode="decimal" min="0" step="0.01" value="${r.unit_cost ?? ''}" />
          <label>Toplam maliyet (TL, ops.)</label><input id="em_tc" type="number" inputmode="decimal" min="0" step="0.01" value="${r.total_cost ?? ''}" />
          <label>Alıcı (ops.)</label><input id="em_buyer" value="${escape(r.buyer ?? '')}" />
          <label>Notlar (ops.)</label><input id="em_notes" value="${escape(r.notes ?? '')}" />
        `,
        onSave: async () => {
          const payload = {
            sale_date: document.getElementById("em_date").value,
            quantity: Number(document.getElementById("em_qty").value),
            unit_price: Number(document.getElementById("em_up").value),
            total_revenue: Number(document.getElementById("em_tr").value),
            buyer: document.getElementById("em_buyer").value.trim(),
            notes: document.getElementById("em_notes").value.trim(),
          };
          const ucVal = document.getElementById("em_uc").value;
          const tcVal = document.getElementById("em_tc").value;
          if (ucVal !== "") payload.unit_cost = Number(ucVal);
          if (tcVal !== "") payload.total_cost = Number(tcVal);
          if (!(payload.quantity > 0) || !(payload.unit_price >= 0)) {
            toast("Geçersiz miktar/fiyat", "error");
            return false;
          }
          try {
            await apiCall(`/api/sales/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
            toast("Güncellendi");
            renderSatislar(body);
            return true;
          } catch {
            return false;
          }
        },
      });
    };
  });
}

async function renderPiyasaFiyatlari(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const [types, varieties, list] = await Promise.all([
    apiCall("/api/master/crop-types"),
    apiCall("/api/master/crop-varieties"),
    apiCall("/api/market-prices"),
  ]);
  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="card">
      <h2>Yeni piyasa fiyatı kaydı</h2>
      <label>Tarih</label><input id="mp_date" type="date" value="${today}" />
      <label>Tür</label>
      <select id="mp_type">${types.map(t => `<option value="${t.id}">${escape(t.name)}</option>`).join("")}</select>
      <label>Cins</label>
      <select id="mp_var"></select>
      <label>Piyasa fiyatı (TL/kg)</label><input id="mp_price" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Kaynak (ops.)</label><input id="mp_source" placeholder="Antalya hali" />
      <label>Notlar (ops.)</label><input id="mp_notes" />
      <div style="height:12px;"></div>
      <button class="primary" id="mp_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Son piyasa fiyatları</h2>
      ${list.length === 0 ? `<div class="empty">Henüz piyasa fiyatı kaydı yok. Yukarıdaki formdan ekleyebilirsin.</div>` :
        list.map(r => {
          const t = types.find(x => x.id === r.crop_type_id);
          const v = varieties.find(x => x.id === r.crop_variety_id);
          return `<div class="list-item">
            <div>
              <div>${escape(t?.name ?? "?")} · ${escape(v?.name ?? "?")}</div>
              <div class="meta">${r.snapshot_date} · ₺${r.market_price.toFixed(2)}/kg${r.source ? ` · ${escape(r.source)}` : ""}</div>
            </div>
            <button class="danger" data-del="${r.id}">Sil</button>
          </div>`;
        }).join("")}
    </div>
  `;

  function refreshVar() {
    const sel = document.getElementById("mp_var");
    const tid = Number(document.getElementById("mp_type").value);
    const matches = varieties.filter(v => v.crop_type_id === tid);
    sel.innerHTML = matches.length
      ? matches.map(v => `<option value="${v.id}">${escape(v.name)}</option>`).join("")
      : `<option value="">— Bu tür için cins yok —</option>`;
  }
  refreshVar();
  document.getElementById("mp_type").onchange = refreshVar;

  document.getElementById("mp_create").onclick = async () => {
    const varVal = document.getElementById("mp_var").value;
    if (!varVal) return toast("Önce bir cins ekle", "error");
    const payload = {
      snapshot_date: document.getElementById("mp_date").value,
      crop_type_id: Number(document.getElementById("mp_type").value),
      crop_variety_id: Number(varVal),
      market_price: Number(document.getElementById("mp_price").value),
      source: document.getElementById("mp_source").value.trim() || undefined,
      notes: document.getElementById("mp_notes").value.trim() || undefined,
    };
    if (!payload.snapshot_date || !(payload.market_price >= 0)) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/market-prices", { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderPiyasaFiyatlari(body);
    } catch {}
  };

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/market-prices/${btn.dataset.del}`, { method: "DELETE" });
      renderPiyasaFiyatlari(body);
    };
  });
}

async function renderOrtakTab(container) {
  container.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const today = new Date().toISOString().slice(0,10);
  const recon = await apiCall(`/api/reports/reconciliation?season_id=${seasonId}`);
  const payouts = recon.payouts || [];

  const balanceLabel = recon.partner_balance > 0 ? "borç" : (recon.partner_balance < 0 ? "fazla ödenmiş" : "denk");
  const balanceColor = recon.partner_balance > 0 ? "var(--danger)" : (recon.partner_balance < 0 ? "var(--warn)" : "var(--accent)");

  container.innerHTML = `
    <div class="card">
      <h2>Sezon mutabakatı</h2>
      <div class="list-item">
        <div>Brüt ciro</div>
        <div class="meta">₺${recon.total_revenue.toFixed(2)}</div>
      </div>
      <div class="list-item">
        <div>Ortak payı (%${recon.season.partner_share_pct})</div>
        <div class="meta">₺${recon.partner_share.toFixed(2)}</div>
      </div>
      <div class="list-item">
        <div>Ödenen</div>
        <div class="meta">₺${recon.partner_paid.toFixed(2)}</div>
      </div>
      <div class="list-item">
        <div><strong>Bakiye</strong></div>
        <div style="color:${balanceColor};font-weight:600;">₺${Math.abs(recon.partner_balance).toFixed(2)} ${balanceLabel}</div>
      </div>
    </div>
    <div class="card">
      <h2>Yeni ödeme</h2>
      <label>Tarih</label><input id="p_date" type="date" value="${today}" />
      <label>Tutar (TL)</label><input id="p_amount" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Yöntem</label>
      <select id="p_method">
        <option value="nakit">Nakit</option>
        <option value="havale">Havale</option>
        <option value="diğer">Diğer</option>
      </select>
      <label>Notlar (ops.)</label><input id="p_notes" />
      <div style="height:12px;"></div>
      <button class="primary" id="p_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Bu sezonun ödemeleri</h2>
      ${payouts.length === 0 ? `<div class="empty">Bu sezonda henüz ödeme yok. Yukarıdaki formdan ortak ödemesi kaydet.</div>` :
        payouts.map(p => `<div class="list-item">
          <div>
            <div>₺${p.amount.toFixed(2)} <span class="meta">[${p.method}]</span></div>
            <div class="meta">${p.payout_date}${p.notes ? ` · ${escape(p.notes)}` : ""}</div>
          </div>
          <button class="danger" data-del="${p.id}">Sil</button>
        </div>`).join("")}
    </div>
  `;

  document.getElementById("p_create").onclick = async () => {
    const payload = {
      season_id: seasonId,
      payout_date: document.getElementById("p_date").value,
      amount: Number(document.getElementById("p_amount").value),
      method: document.getElementById("p_method").value,
      notes: document.getElementById("p_notes").value.trim() || undefined,
    };
    if (!payload.payout_date || !(payload.amount >= 0)) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/payouts", { method: "POST", body: JSON.stringify(payload) });
      toast("Ödeme kaydedildi");
      renderOrtakTab(container);
    } catch {}
  };

  container.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/payouts/${btn.dataset.del}`, { method: "DELETE" });
      renderOrtakTab(container);
    };
  });
}

async function renderPano(container) {
  if (!state.activeSeason) {
    container.innerHTML = `<div class="card"><h2>Pano</h2><div class="empty">Önce ⚙ Ayarlar > Sezonlar'dan bir sezon oluşturup "Aktif et" deyin.</div></div>`;
    return;
  }
  container.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const [summary, sales, payouts, monthly, prices, types, varieties] = await Promise.all([
    apiCall(`/api/reports/season-summary?season_id=${seasonId}`),
    apiCall(`/api/sales?season_id=${seasonId}`),
    apiCall(`/api/payouts?season_id=${seasonId}`),
    apiCall(`/api/reports/monthly-consumption?season_id=${seasonId}`),
    apiCall(`/api/market-prices`),
    apiCall(`/api/master/crop-types`),
    apiCall(`/api/master/crop-varieties`),
  ]);

  const balanceLabel = summary.partner_balance > 0 ? "borç" : (summary.partner_balance < 0 ? "fazla" : "denk");
  const balanceColor = summary.partner_balance > 0 ? "var(--danger)" : (summary.partner_balance < 0 ? "var(--warn)" : "var(--accent)");

  const recent = [];
  for (const s of sales.slice(0, 5)) {
    recent.push({ date: s.sale_date, label: `Satış: ${s.quantity} kg ₺${s.total_revenue.toFixed(2)}` });
  }
  for (const p of payouts.slice(0, 5)) {
    recent.push({ date: p.payout_date, label: `Ortak ödeme: ₺${p.amount.toFixed(2)} [${p.method}]` });
  }
  recent.sort((a, b) => b.date.localeCompare(a.date));
  const top5 = recent.slice(0, 5);

  // Monthly chart data: month → total_cost
  const monthlyTotals = {};
  for (const r of monthly) {
    monthlyTotals[r.period_month] = (monthlyTotals[r.period_month] || 0) + (r.total_cost || 0);
  }
  const monthLabels = Object.keys(monthlyTotals).sort();
  const monthData = monthLabels.map(m => monthlyTotals[m]);

  // Price series: group by `type · variety`, map date → market_price
  const priceSeries = {};
  for (const p of prices) {
    const t = types.find(x => x.id === p.crop_type_id);
    const v = varieties.find(x => x.id === p.crop_variety_id);
    const key = `${t?.name ?? "?"} · ${v?.name ?? "?"}`;
    (priceSeries[key] = priceSeries[key] || []).push({ x: p.snapshot_date, y: p.market_price });
  }
  // Sort each series by date asc
  for (const key of Object.keys(priceSeries)) {
    priceSeries[key].sort((a, b) => a.x.localeCompare(b.x));
  }
  const allDates = [...new Set(prices.map(p => p.snapshot_date))].sort();

  container.innerHTML = `
    <div class="card">
      <h2>${escape(state.activeSeason.name)}</h2>
      <div class="list-item"><div>Brüt ciro</div><div class="meta" style="font-size:16px;color:var(--text);">₺${summary.total_revenue.toFixed(2)}</div></div>
      <div class="list-item"><div>Net tahmini</div><div class="meta" style="font-size:16px;color:var(--accent);">₺${summary.net_estimated.toFixed(2)}</div></div>
      <div class="list-item"><div>Ortak payı (%${summary.partner_share_pct})</div><div class="meta">₺${summary.partner_share.toFixed(2)}</div></div>
      <div class="list-item"><div>Ödenen</div><div class="meta">₺${summary.partner_paid.toFixed(2)}</div></div>
      <div class="list-item"><div><strong>Bakiye</strong></div><div style="color:${balanceColor};font-weight:600;">₺${Math.abs(summary.partner_balance).toFixed(2)} ${balanceLabel}</div></div>
    </div>

    <div class="card">
      <h2>Aylık tüketim (TL)</h2>
      ${monthLabels.length === 0 ? `<div class="empty">Henüz tüketim kaydı yok.</div>` : `<div class="chart-wrap"><canvas id="chart_monthly"></canvas></div>`}
    </div>

    <div class="card">
      <h2>Piyasa fiyatları (TL/kg)</h2>
      ${allDates.length === 0 ? `<div class="empty">Henüz piyasa fiyatı kaydı yok.</div>` : `<div class="chart-wrap"><canvas id="chart_prices"></canvas></div>`}
    </div>

    <div class="card">
      <h2>Son hareketler</h2>
      ${top5.length === 0 ? `<div class="empty">Henüz satış veya ortak ödemesi yok.</div>` :
        top5.map(r => `<div class="list-item"><div>${escape(r.label)}</div><div class="meta">${r.date}</div></div>`).join("")}
    </div>
  `;

  // Charts
  if (monthLabels.length > 0 && typeof Chart !== "undefined") {
    new Chart(document.getElementById("chart_monthly"), {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [{
          label: "Tüketim (TL)",
          data: monthData,
          backgroundColor: "rgba(74, 210, 143, 0.5)",
          borderColor: "rgba(74, 210, 143, 1)",
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8aa394" }, grid: { color: "rgba(42,59,51,0.4)" } },
          y: { ticks: { color: "#8aa394" }, grid: { color: "rgba(42,59,51,0.4)" }, beginAtZero: true },
        },
      },
    });
  }

  if (allDates.length > 0 && typeof Chart !== "undefined") {
    const palette = ["#4ad28f","#ffb454","#ff5d6c","#7aa2f7","#bb9af7","#9ece6a","#f7768e","#e0af68"];
    const datasets = Object.keys(priceSeries).map((key, i) => ({
      label: key,
      data: priceSeries[key],
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length],
      tension: 0.2,
      borderWidth: 2,
    }));
    new Chart(document.getElementById("chart_prices"), {
      type: "line",
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        parsing: { xAxisKey: "x", yAxisKey: "y" },
        plugins: { legend: { labels: { color: "#e6efe7" } } },
        scales: {
          x: { type: "category", labels: allDates, ticks: { color: "#8aa394" }, grid: { color: "rgba(42,59,51,0.4)" } },
          y: { ticks: { color: "#8aa394" }, grid: { color: "rgba(42,59,51,0.4)" }, beginAtZero: true },
        },
      },
    });
  }
}

async function renderIlacUygulama(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasonId = state.activeSeason.id;
  const [meds, diseases, mapping, list, stock] = await Promise.all([
    apiCall("/api/master/medicines"),
    apiCall("/api/master/diseases"),
    apiCall("/api/master/disease-medicine-map"),
    apiCall(`/api/medicine-applications?season_id=${seasonId}`),
    apiCall("/api/stock/medicines"),
  ]);
  const today = new Date().toISOString().slice(0,10);

  body.innerHTML = `
    <div class="card">
      <h2>İlaç stok durumu</h2>
      ${stock.length === 0 ? `<div class="empty">Stok hareketi yok.</div>` :
        stock.map(s => `<div class="list-item">
          <div>${escape(s.name)}</div>
          <div class="meta">${s.balance} ${escape(s.unit)}</div>
        </div>`).join("")}
    </div>
    <div class="card">
      <h2>Yeni ilaç uygulaması</h2>
      <label>Tarih</label><input id="ma_date" type="date" value="${today}" />
      <label>Hastalık</label>
      <select id="ma_disease">${diseases.map(d => `<option value="${d.id}">${escape(d.name)}</option>`).join("")}</select>
      <label>İlaç</label>
      <select id="ma_med"></select>
      <label>Kullanılan miktar</label><input id="ma_qty" type="number" inputmode="decimal" min="0" step="0.01" />
      <label>Hedef/Notlar (ops.)</label><input id="ma_target" placeholder="kuzey blok" />
      <div style="height:12px;"></div>
      <button class="primary" id="ma_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Bu sezonun uygulamaları</h2>
      ${list.length === 0 ? `<div class="empty">Henüz ilaç uygulaması yok. Bir hastalık seçip eşli ilacı uygula.</div>` :
        list.map(r => {
          const m = meds.find(x => x.id === r.medicine_id);
          const d = diseases.find(x => x.id === r.disease_id);
          return `<div class="list-item">
            <div>
              <div>${escape(d?.name ?? "?")} → ${escape(m?.name ?? "?")}</div>
              <div class="meta">${r.application_date} · ${r.quantity_used}${r.target ? ` · ${escape(r.target)}` : ""}</div>
            </div>
            <button class="danger" data-del="${r.id}">Sil</button>
          </div>`;
        }).join("")}
    </div>
  `;

  function refreshMedOptions() {
    const did = Number(document.getElementById("ma_disease").value);
    const allowedIds = new Set(mapping.filter(x => x.disease_id === did).map(x => x.medicine_id));
    const sel = document.getElementById("ma_med");
    const matches = meds.filter(m => allowedIds.has(m.id));
    sel.innerHTML = matches.length
      ? matches.map(m => `<option value="${m.id}">${escape(m.name)}</option>`).join("")
      : `<option value="">— Bu hastalık için ilaç eşlemesi yok —</option>`;
  }
  refreshMedOptions();
  document.getElementById("ma_disease").onchange = refreshMedOptions;

  document.getElementById("ma_create").onclick = async () => {
    const medVal = document.getElementById("ma_med").value;
    if (!medVal) return toast("Önce bu hastalığa ilaç eşle", "error");
    const payload = {
      season_id: seasonId,
      application_date: document.getElementById("ma_date").value,
      medicine_id: Number(medVal),
      disease_id: Number(document.getElementById("ma_disease").value),
      quantity_used: Number(document.getElementById("ma_qty").value),
      target: document.getElementById("ma_target").value.trim() || undefined,
    };
    if (!payload.application_date || !(payload.quantity_used > 0)) {
      return toast("Eksik veya geçersiz alan", "error");
    }
    try {
      await apiCall("/api/medicine-applications", { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderIlacUygulama(body);
    } catch {}
  };

  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/medicine-applications/${btn.dataset.del}`, { method: "DELETE" });
      renderIlacUygulama(body);
    };
  });
}

function renderSettings() {
  app.innerHTML = `
    <header class="season-bar">
      <button class="settings" id="back" aria-label="Geri">←</button>
      <div class="value">Ayarlar</div>
      <button class="settings" id="logout" aria-label="Çıkış">⎋</button>
    </header>
    <main>
      <div class="card">
        <div class="row" style="gap:8px; flex-wrap:wrap;">
          ${["seasons","types","supplies","medicines","password"].map(k =>
            `<button class="${state.settingsTab===k?"primary":"secondary"}" data-stab="${k}">${({seasons:"Sezonlar",types:"Tür/Cins",supplies:"Sarf/Utility",medicines:"İlaç/Hastalık",password:"Parola"})[k]}</button>`
          ).join("")}
        </div>
      </div>
      <div id="settingsBody"></div>
    </main>
  `;
  document.getElementById("back").onclick = () => { state.settingsOpen = false; renderHome(); };
  document.getElementById("logout").onclick = async () => {
    await apiCall("/api/auth/logout", { method: "POST" }).catch(()=>{});
    state.authed = false; state.page = "login"; render();
  };
  document.querySelectorAll("[data-stab]").forEach(b => {
    b.onclick = () => { state.settingsTab = b.dataset.stab; renderSettings(); };
  });
  const body = document.getElementById("settingsBody");
  if (state.settingsTab === "seasons") renderSeasonsSettings(body);
  else if (state.settingsTab === "types") renderTypesSettings(body);
  else if (state.settingsTab === "supplies") renderSuppliesSettings(body);
  else if (state.settingsTab === "medicines") renderMedicinesSettings(body);
  else if (state.settingsTab === "password") renderPasswordSettings(body);
}

async function renderSeasonsSettings(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  const seasons = await apiCall("/api/seasons");
  const today = new Date().toISOString().slice(0,10);
  body.innerHTML = `
    <div class="card">
      <h2>Yeni sezon</h2>
      <label>Ad</label><input id="s_name" placeholder="2025–2026 sezonu" />
      <label>Başlangıç</label><input id="s_start" type="date" value="${today}" />
      <label>Bitiş</label><input id="s_end" type="date" value="${today}" />
      <label>Ortak payı (%)</label><input id="s_pct" type="number" inputmode="decimal" value="25" />
      <div style="height:12px;"></div>
      <button class="primary" id="s_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>Sezonlar</h2>
      ${seasons.length === 0 ? `<div class="empty">Henüz sezon yok. Yukarıdaki formla ilk sezonu ekleyin, sonra "Aktif et" deyin.</div>` :
        seasons.map(s => `
          <div class="list-item">
            <div>
              <div>${escape(s.name)} ${s.is_active ? "🟢" : ""}</div>
              <div class="meta">${s.start_date} → ${s.end_date} · ortak %${s.partner_share_pct}</div>
            </div>
            <div class="row">
              ${s.is_active ? "" : `<button class="secondary" data-act="${s.id}">Aktif et</button>`}
              <button class="danger" data-del="${s.id}">Sil</button>
            </div>
          </div>
        `).join("")
      }
    </div>
  `;
  document.getElementById("s_create").onclick = async () => {
    const payload = {
      name: document.getElementById("s_name").value.trim(),
      start_date: document.getElementById("s_start").value,
      end_date: document.getElementById("s_end").value,
      partner_share_pct: Number(document.getElementById("s_pct").value),
    };
    if (!payload.name) return toast("Ad zorunlu", "error");
    try {
      await apiCall("/api/seasons", { method: "POST", body: JSON.stringify(payload) });
      toast("Sezon eklendi");
      renderSeasonsSettings(body);
    } catch {}
  };
  body.querySelectorAll("[data-act]").forEach(btn => {
    btn.onclick = async () => {
      await apiCall(`/api/seasons/${btn.dataset.act}/activate`, { method: "POST" });
      const seasons = await apiCall("/api/seasons");
      state.activeSeason = seasons.find(s => s.is_active) ?? null;
      toast("Aktif edildi");
      renderSeasonsSettings(body);
    };
  });
  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`/api/seasons/${btn.dataset.del}`, { method: "DELETE" });
      const seasons = await apiCall("/api/seasons");
      state.activeSeason = seasons.find(s => s.is_active) ?? null;
      renderSeasonsSettings(body);
    };
  });
}

async function renderMasterCRUD(body, opts) {
  // opts: { title, endpoint, fields: [{key,label,type,options?}], display(row) -> string }
  const rows = await apiCall(opts.endpoint);
  body.innerHTML = `
    <div class="card">
      <h2>Yeni ${escape(opts.title)}</h2>
      ${opts.fields.map(f => `
        <label>${escape(f.label)}</label>
        ${f.type === "select"
          ? `<select data-k="${f.key}">${f.options.map(o => `<option value="${o.value}">${escape(o.label)}</option>`).join("")}</select>`
          : `<input data-k="${f.key}" type="${f.type === "number" ? "number" : "text"}" ${f.type === "number" ? 'inputmode="decimal"' : ""} />`
        }
      `).join("")}
      <div style="height:12px;"></div>
      <button class="primary" id="m_create">Kaydet</button>
    </div>
    <div class="card">
      <h2>${escape(opts.title)} listesi</h2>
      ${rows.length === 0 ? `<div class="empty">Henüz kayıt yok.</div>` :
        rows.map(r => `
          <div class="list-item">
            <div>${escape(opts.display(r))}</div>
            <button class="danger" data-del="${r.id}">Sil</button>
          </div>`).join("")
      }
    </div>
  `;
  document.getElementById("m_create").onclick = async () => {
    const payload = {};
    for (const f of opts.fields) {
      const el = body.querySelector(`[data-k="${f.key}"]`);
      let v = el.value;
      if (f.type === "number") v = v === "" ? undefined : Number(v);
      if (f.type === "select") v = Number(v);
      payload[f.key] = v;
    }
    try {
      await apiCall(opts.endpoint, { method: "POST", body: JSON.stringify(payload) });
      toast("Eklendi");
      renderMasterCRUD(body, opts);
    } catch {}
  };
  body.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      if (!confirm("Silinsin mi?")) return;
      await apiCall(`${opts.endpoint}/${btn.dataset.del}`, { method: "DELETE" });
      renderMasterCRUD(body, opts);
    };
  });
}

async function renderTypesSettings(body) {
  body.innerHTML = `<div class="card"><div class="empty">Yükleniyor…</div></div>`;
  await renderMasterCRUD(body, {
    title: "tür",
    endpoint: "/api/master/crop-types",
    fields: [{ key: "name", label: "Ad", type: "text" }],
    display: (r) => r.name,
  });
  // altına varieties:
  const types = await apiCall("/api/master/crop-types");
  const extra = document.createElement("div");
  body.appendChild(extra);
  await renderMasterCRUD(extra, {
    title: "cins",
    endpoint: "/api/master/crop-varieties",
    fields: [
      { key: "crop_type_id", label: "Tür", type: "select",
        options: types.map(t => ({ value: t.id, label: t.name })) },
      { key: "name", label: "Cins adı", type: "text" },
    ],
    display: (r) => {
      const t = types.find(x => x.id === r.crop_type_id);
      return `${t ? t.name + " · " : ""}${r.name}`;
    },
  });
}

async function renderSuppliesSettings(body) {
  body.innerHTML = "";
  const sup = document.createElement("div"); body.appendChild(sup);
  await renderMasterCRUD(sup, {
    title: "sarf",
    endpoint: "/api/master/supplies",
    fields: [
      { key: "name", label: "Ad", type: "text" },
      { key: "unit", label: "Birim (kg/m2/...)", type: "text" },
    ],
    display: (r) => `${r.name} (${r.unit})`,
  });
  const ut = document.createElement("div"); body.appendChild(ut);
  await renderMasterCRUD(ut, {
    title: "tüketim kalemi",
    endpoint: "/api/master/utilities",
    fields: [
      { key: "name", label: "Ad", type: "text" },
      { key: "unit", label: "Birim (kWh/m3/...)", type: "text" },
    ],
    display: (r) => `${r.name} (${r.unit})`,
  });
}

async function renderMedicinesSettings(body) {
  body.innerHTML = "";
  const dis = document.createElement("div"); body.appendChild(dis);
  await renderMasterCRUD(dis, {
    title: "hastalık",
    endpoint: "/api/master/diseases",
    fields: [{ key: "name", label: "Ad", type: "text" }],
    display: (r) => r.name,
  });
  const med = document.createElement("div"); body.appendChild(med);
  await renderMasterCRUD(med, {
    title: "ilaç",
    endpoint: "/api/master/medicines",
    fields: [
      { key: "name", label: "Ad", type: "text" },
      { key: "active_ingredient", label: "Etken madde (ops.)", type: "text" },
      { key: "unit", label: "Birim (ml/g/...)", type: "text" },
    ],
    display: (r) => `${r.name}${r.active_ingredient ? ` · ${r.active_ingredient}` : ""} (${r.unit})`,
  });

  // disease-medicine map UI: select x select + listele
  const diseases = await apiCall("/api/master/diseases");
  const medicines = await apiCall("/api/master/medicines");
  const map = await apiCall("/api/master/disease-medicine-map");
  const mapCard = document.createElement("div");
  mapCard.className = "card";
  mapCard.innerHTML = `
    <h2>Hastalık ↔ İlaç eşlemeleri</h2>
    <label>Hastalık</label>
    <select id="m_disease">${diseases.map(d => `<option value="${d.id}">${escape(d.name)}</option>`).join("")}</select>
    <label>İlaç</label>
    <select id="m_med">${medicines.map(m => `<option value="${m.id}">${escape(m.name)}</option>`).join("")}</select>
    <div style="height:12px;"></div>
    <button class="primary" id="m_map_add">Eşle</button>
    <div style="height:16px;"></div>
    ${map.length === 0 ? `<div class="empty">Henüz eşleme yok.</div>` :
      map.map(m => {
        const d = diseases.find(x => x.id === m.disease_id);
        const med = medicines.find(x => x.id === m.medicine_id);
        return `<div class="list-item">
          <div>${escape(d?.name ?? "?")} ↔ ${escape(med?.name ?? "?")}</div>
          <button class="danger" data-d="${m.disease_id}" data-m="${m.medicine_id}">Kaldır</button>
        </div>`;
      }).join("")
    }
  `;
  body.appendChild(mapCard);
  document.getElementById("m_map_add").onclick = async () => {
    const disease_id = Number(document.getElementById("m_disease").value);
    const medicine_id = Number(document.getElementById("m_med").value);
    try {
      await apiCall("/api/master/disease-medicine-map", {
        method: "POST", body: JSON.stringify({ disease_id, medicine_id }),
      });
      renderMedicinesSettings(body);
    } catch {}
  };
  mapCard.querySelectorAll("[data-d]").forEach(btn => {
    btn.onclick = async () => {
      await apiCall(`/api/master/disease-medicine-map?disease_id=${btn.dataset.d}&medicine_id=${btn.dataset.m}`, {
        method: "DELETE",
      });
      renderMedicinesSettings(body);
    };
  });
}

function renderPasswordSettings(body) {
  body.innerHTML = `
    <div class="card">
      <h2>Parola değiştir</h2>
      <label>Mevcut parola</label><input id="cur" type="password" autocomplete="current-password" />
      <label>Yeni parola</label><input id="next" type="password" autocomplete="new-password" />
      <div style="height:12px;"></div>
      <button class="primary" id="changeBtn">Değiştir</button>
    </div>
  `;
  document.getElementById("changeBtn").onclick = async () => {
    const current = document.getElementById("cur").value;
    const next = document.getElementById("next").value;
    if (!current || !next) return toast("Tüm alanlar gerekli", "error");
    try {
      await apiCall("/api/auth/change-password", {
        method: "POST", body: JSON.stringify({ current, next }),
      });
      toast("Parola güncellendi");
    } catch {}
  };
}

function escape(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function render() {
  if (state.page === "loading") renderLoading();
  else if (state.page === "setup") renderSetup();
  else if (state.page === "login") renderLogin();
  else if (state.page === "home") renderHome();
}

async function bootstrap() {
  state.page = "loading";
  render();
  try {
    const me = await fetch("/api/me", { credentials: "same-origin" });
    if (me.status === 401) {
      const statusRes = await fetch("/api/setup-status");
      const status = await statusRes.json().catch(() => ({}));
      state.needsSetup = status.initialized === false;
      state.authed = false;
      state.page = state.needsSetup ? "setup" : "login";
    } else if (me.ok) {
      state.authed = true;
      state.page = "home";
      // aktif sezonu fetch et
      const seasons = await apiCall("/api/seasons").catch(() => []);
      state.activeSeason = seasons.find((s) => s.is_active) ?? null;
    }
  } catch (e) {
    state.page = "login";
  }
  render();
}

bootstrap();
