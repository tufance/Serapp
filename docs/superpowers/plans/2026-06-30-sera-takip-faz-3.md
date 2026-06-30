# Sera Takip — Faz 3 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** Modül 4 (tüketim takibi + aylık rapor). Supply tüketimi otomatik stok'tan düşer (trigger). Utility tüketimi (elektrik/su) sadece kayıt, stok yok.

**Architecture:** `consumption_records` tek tablo, `item_type` ile supply/utility ayrımı. Trigger sadece supply tüketimi için stok hareketine (-) ekler. Aylık rapor sezon × ay × kategori bazlı SUM. Frontend'de Hareket sekmesi 2 alt-tab'a böl (İlaç / Tüketim).

**Spec:** `docs/superpowers/specs/2026-06-30-sera-takip-design.md` (Modül 4)
**Branch:** `feat/seraapp-faz-3` from `main`

---

## File Structure

```
seraapp/
├── migrations/
│   └── 0007_consumption.sql               # YENİ
├── src/
│   ├── routes/
│   │   ├── consumption.ts                 # YENİ — CRUD
│   │   └── reports.ts                     # YENİ — /api/reports/monthly-consumption
│   └── index.ts                           # DEĞİŞ — yeni router mount'lar
├── test/
│   ├── consumption.test.ts                # YENİ
│   └── reports.test.ts                    # YENİ
└── public/app.js                          # DEĞİŞ — Hareket sekmesi 2 alt-tab + Tüketim UI
```

---

## Task 1: Branch + plan commit

```bash
git checkout -b feat/seraapp-faz-3
git add docs/superpowers/plans/2026-06-30-sera-takip-faz-3.md
git commit -m "Add Faz 3 plan (consumption + monthly report)"
```

Tests baseline: 70/70 PASS.

---

## Task 2: Migration — `consumption_records` + trigger

`seraapp/migrations/0007_consumption.sql`:

```sql
CREATE TABLE consumption_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  period_month TEXT NOT NULL,                -- 'YYYY-MM'
  item_type TEXT NOT NULL CHECK (item_type IN ('supply','utility')),
  ref_id INTEGER NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost REAL,
  total_cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_consumption_season ON consumption_records(season_id);
CREATE INDEX idx_consumption_month ON consumption_records(period_month);
CREATE INDEX idx_consumption_ref ON consumption_records(item_type, ref_id);

-- Supply tüketimi → supply_stock_movements'a (-) hareket
-- movement_date = period_month + '-01' (ayın ilk günü)
CREATE TRIGGER trg_consumption_supply_insert
AFTER INSERT ON consumption_records
WHEN NEW.item_type='supply'
BEGIN
  INSERT INTO supply_stock_movements (supply_category_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.ref_id, NEW.period_month || '-01', -NEW.quantity, 'consumption', NEW.id);
END;

CREATE TRIGGER trg_consumption_supply_update
AFTER UPDATE ON consumption_records
WHEN NEW.item_type='supply'
BEGIN
  UPDATE supply_stock_movements
  SET supply_category_id = NEW.ref_id,
      movement_date      = NEW.period_month || '-01',
      delta_qty          = -NEW.quantity
  WHERE source_type='consumption' AND source_id=NEW.id;
END;

CREATE TRIGGER trg_consumption_supply_delete
AFTER DELETE ON consumption_records
WHEN OLD.item_type='supply'
BEGIN
  DELETE FROM supply_stock_movements
  WHERE source_type='consumption' AND source_id=OLD.id;
END;
```

Apply: `npm run migrate:local`. Sanity: `SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_consumption%'` → 3 trigger.

Commit: `feat(db): add consumption_records + stock triggers`

---

## Task 3: Consumption CRUD endpoint

`seraapp/src/routes/consumption.ts` + `seraapp/test/consumption.test.ts`.

Endpoints:
- `GET /api/consumption?season_id=` (zorunlu) — listele
- `POST /api/consumption` — yarat
- `PATCH /api/consumption/:id`
- `DELETE /api/consumption/:id`

Body alanları: `season_id`, `period_month` (YYYY-MM regex), `item_type` (supply|utility), `ref_id`, `quantity`, `unit`, `unit_cost?`, `total_cost?`, `notes?`.

Validation:
- season_id, item_type, ref_id, period_month, quantity, unit zorunlu
- `period_month` regex: `^\d{4}-\d{2}$`
- `item_type='supply'` ise `supply_categories` tablosunda ref_id var mı
- `item_type='utility'` ise `utility_types` tablosunda ref_id var mı

Test coverage (6 test):
1. requires auth
2. POST supply → stock movement (-) oluşur
3. POST utility → stok hareketi yok
4. DELETE supply → stock movement silinir
5. GET requires season_id
6. rejects invalid period_month format

Route'u `src/index.ts`'e mount.

Commit: `feat(consumption): add CRUD endpoints (supply auto-tracks stock)`

Expected: 6/6 + 76/76 toplam.

---

## Task 4: Monthly consumption report endpoint

`seraapp/src/routes/reports.ts` + `seraapp/test/reports.test.ts`.

```typescript
GET /api/reports/monthly-consumption?season_id=
```

Response shape:
```json
[
  {
    "period_month": "2025-10",
    "item_type": "supply",
    "ref_id": 1,
    "name": "kömür",
    "unit": "kg",
    "total_quantity": 120,
    "total_cost": 600
  },
  ...
]
```

SQL: `consumption_records` × `supply_categories`/`utility_types` JOIN (CASE göre), GROUP BY period_month, item_type, ref_id.

Test (2 test):
1. boş listeyi döner
2. iki kayıt → toplanmış aylık çıktı

Commit: `feat(reports): monthly consumption aggregation endpoint`

Expected: 8/8 + 78/78 toplam.

---

## Task 5: Frontend — Hareket sekmesi 2 alt-tab

`renderHareketTab` mevcut hali sadece `renderIlacUygulama` çağırıyor. Onu 2 alt-tab'lı yapacağız.

State:
```javascript
state.hareketSubTab = state.hareketSubTab || "ilac";  // (zaten T2.T12'de eklendi)
```

```javascript
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

async function renderTuketim(body) { body.innerHTML = `<div class="card"><div class="empty">Tüketim UI (Task 6)</div></div>`; }
```

Verify: node --check + tests 78/78.

Commit: `feat(frontend): split Hareket tab into 2 sub-tabs`

---

## Task 6: Frontend — Tüketim UI

`renderTuketim` full implementation:
- Form: item_type select (Sarf / Tüketim kalemi) → ref_id select (item_type'a göre filtreli), period_month input (default current month), quantity, unit (auto from category/utility), unit_cost (ops.), total_cost (auto = qty × unit_cost), notes.
- Liste: aktif sezonun tüm kayıtları, period_month desc, ref name + qty + cost.
- Aylık özet kartı: SUM(total_cost) by period_month.

```javascript
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

  // Aylık toplam karta:
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
      ${list.length === 0 ? `<div class="empty">Henüz kayıt yok.</div>` :
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
```

Verify: node --check + 78/78.
Commit: `feat(frontend): tüketim UI with monthly summary`

---

## Task 7: Deploy + PR

1. `cd seraapp && npm test` → 78/78.
2. `npm run migrate:remote` (0007 uygulanır).
3. `npm run deploy`.
4. Smoke (tarayıcı):
   - Hareket > Tüketim
   - Sarf kömür tüketim ekle → "Alım > Sarf > Stok durumu"nda miktar düşer ✓
   - Utility (elektrik) tüketim ekle → stok kartında değişiklik yok (utility stoksuz) ✓
   - Aylık özet kartı dolur
5. `git push -u origin feat/seraapp-faz-3`
6. `gh pr create --base main --head feat/seraapp-faz-3 --title "feat(seraapp): Faz 3 — tüketim takibi + aylık rapor" --body "..."`
7. Squash merge.

---

## Faz 3 tamamlandı

- 78/78 vitest
- Modül 4 tam (tüketim + supply stok düşüşü + utility stoksuz + aylık rapor)
- Hareket sekmesi 2 alt-tab (İlaç / Tüketim)

**Sonraki:** Faz 4 (Modül 5-6 — satış + piyasa snapshot + ortak mutabakat).
