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
      <h1 style="text-align:center; margin-top:40px;">Hoş geldin</h1>
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
      <h1 style="text-align:center; margin-top:40px;">Sera Takip</h1>
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
      <div>
        <div class="label">Aktif sezon</div>
        <div class="value" id="seasonName">${state.activeSeason ? escape(state.activeSeason.name) : "Sezon yok"}</div>
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
    c.innerHTML = `<div class="card"><div class="empty">Önce ayarlardan bir sezon oluştur ve aktif et.</div></div>`;
    return;
  }
  if (state.activeTab === "pano") c.innerHTML = `<div class="card"><h2>Pano</h2><div class="empty">Sonraki fazlarda dolacak.</div></div>`;
  else c.innerHTML = `<div class="card"><h2>${escape(TABS.find(t=>t.key===state.activeTab).label)}</h2><div class="empty">Bu modül sonraki fazlarda gelecek.</div></div>`;
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
  else body.innerHTML = `<div class="card"><div class="empty">${escape(state.settingsTab)} ekranı sonraki task'ta.</div></div>`;
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
      ${seasons.length === 0 ? `<div class="empty">Henüz sezon yok.</div>` :
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
      // setup gerekli mi?
      const probe = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "__probe__" }),
      });
      if (probe.status === 401) {
        // login mevcut, ama probe ile kontrol için: setup yapılmış mı?
        const errBody = await probe.json().catch(() => ({}));
        state.needsSetup = errBody.error === "not initialized";
      }
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
