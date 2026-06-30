# Sera Takip — Faz 4 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development.

**Goal:** Modül 5 (satış + piyasa fiyatı snapshot) + Modül 6 (ortak ödemeleri + sezon mutabakatı). Pano sekmesi artık özet kartlarla dolar (ciro, ortak payı, ödenen, bakiye).

**Architecture:** İki yeni hareket tablosu (`sales`, `market_price_snapshots`) + bir yeni ödeme tablosu (`partner_payouts`). Mutabakat sorguyla: `SUM(sales.total_revenue) × seasons.partner_share_pct / 100 − SUM(partner_payouts.amount)`. Frontend'de Satış sekmesi 2 alt-tab, Ortak sekmesi mutabakat kartı, Pano artık dolu.

**Spec:** `docs/superpowers/specs/2026-06-30-sera-takip-design.md` (Modül 5-6)
**Branch:** `feat/seraapp-faz-4` from `main`

---

## File Structure

```
seraapp/
├── migrations/
│   ├── 0008_sales.sql                # YENİ — sales + market_price_snapshots
│   └── 0009_payouts.sql              # YENİ — partner_payouts
├── src/
│   ├── routes/
│   │   ├── sales.ts                  # YENİ
│   │   ├── market-prices.ts          # YENİ
│   │   ├── payouts.ts                # YENİ
│   │   └── reports.ts                # DEĞİŞ — season-summary + reconciliation eklenir
│   └── index.ts                      # DEĞİŞ — yeni router'ları mount
├── test/
│   ├── sales.test.ts                 # YENİ
│   ├── market-prices.test.ts         # YENİ
│   ├── payouts.test.ts               # YENİ
│   └── reports.test.ts               # DEĞİŞ — yeni testler eklenir
└── public/app.js                     # DEĞİŞ — Satış, Ortak, Pano dolar
```

---

## Task 1: Branch + plan

Bu commit zaten yapıldı (plan dosyası + branch). Tests baseline: 79/79.

---

## Task 2: 0008 sales + market_price_snapshots migration

```sql
CREATE TABLE sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  sale_date TEXT NOT NULL,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE RESTRICT,
  crop_variety_id INTEGER NOT NULL REFERENCES crop_varieties(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  total_revenue REAL NOT NULL CHECK (total_revenue >= 0),
  unit_cost REAL,
  total_cost REAL,
  buyer TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sales_season ON sales(season_id);
CREATE INDEX idx_sales_date ON sales(sale_date);

CREATE TABLE market_price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE RESTRICT,
  crop_variety_id INTEGER NOT NULL REFERENCES crop_varieties(id) ON DELETE RESTRICT,
  market_price REAL NOT NULL CHECK (market_price >= 0),
  source TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_market_prices_date ON market_price_snapshots(snapshot_date);
CREATE INDEX idx_market_prices_type ON market_price_snapshots(crop_type_id);
```

Commit: `feat(db): add sales + market_price_snapshots`

---

## Task 3: Sales CRUD

`/api/sales` GET (season_id), POST, PATCH, DELETE. Validation: season FK, type/variety match, quantity > 0, prices >= 0, unit_cost/total_cost opsiyonel (sales spec'te elle girilebilir).

Test coverage (6):
1. requires auth
2. POST creates + returns
3. GET lists by season
4. PATCH updates buyer/cost
5. DELETE removes
6. rejects type/variety mismatch

Commit: `feat(sales): add CRUD endpoints`
Expected: 6/6 + 86/86 total.

---

## Task 4: Market price snapshots CRUD

`/api/market-prices` GET (opsiyonel crop_type_id query), POST, DELETE. PATCH yok (snapshot her zaman yeni kayıt).

Test (4):
1. requires auth
2. POST creates
3. GET filters by crop_type_id
4. DELETE removes

Commit: `feat(market-prices): add snapshot CRUD`
Expected: 4/4 + 90/90.

---

## Task 5: 0009 partner_payouts migration

```sql
CREATE TABLE partner_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  payout_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  method TEXT NOT NULL CHECK (method IN ('nakit','havale','diğer')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payouts_season ON partner_payouts(season_id);
CREATE INDEX idx_payouts_date ON partner_payouts(payout_date);
```

Commit: `feat(db): add partner_payouts`

---

## Task 6: Partner payouts CRUD

`/api/payouts` GET (season_id), POST, PATCH, DELETE. Validation: season FK, amount >= 0, method enum.

Test (4):
1. requires auth
2. POST + GET roundtrip
3. PATCH amount
4. rejects invalid method

Commit: `feat(payouts): add partner payouts CRUD`
Expected: 4/4 + 94/94.

---

## Task 7: Reports — season-summary + reconciliation

`src/routes/reports.ts`'i extend:

**`GET /api/reports/season-summary?season_id=`**:
```json
{
  "total_revenue": 127450,
  "total_cost_recorded": 42300,
  "net_estimated": 85150,
  "partner_share_pct": 25,
  "partner_share": 31862.5,
  "partner_paid": 22000,
  "partner_balance": 9862.5
}
```

`total_cost_recorded` = `SUM(sales.total_cost)` (elle girilen, opsiyonel)
`net_estimated` = `total_revenue − total_cost_recorded` (ham tahmin; gerçek net Faz 5'te detaylı)
`partner_share_pct` = `seasons.partner_share_pct`

**`GET /api/reports/reconciliation?season_id=`**:
Daha detaylı: sales/payouts listesi + sonuçlar.
```json
{
  "season": { id, name, partner_share_pct },
  "total_revenue": 127450,
  "partner_share": 31862.5,
  "partner_paid": 22000,
  "partner_balance": 9862.5,
  "payouts": [ ... ]
}
```

Test (4 yeni):
1. season-summary returns calculations
2. season-summary requires season_id
3. reconciliation with no sales = 0 share
4. reconciliation with sales + payouts

Commit: `feat(reports): season summary + reconciliation`
Expected: 4/4 + 98/98.

---

## Task 8: Frontend — Satış sekmesi shell + Satışlar UI

State:
```javascript
state.satisSubTab = state.satisSubTab || "satislar";
```

`renderTabContent` Satış için:
```javascript
else if (state.activeTab === "satis") renderSatisTab(c);
```

`renderSatisTab`:
- 2 alt-tab: Satışlar / Piyasa fiyatları
- Aktif sezona scoped

`renderSatislar(body)`:
- Form: tarih, tür, cins (filtreli), kg miktar, birim fiyat (TL/kg), total_revenue (auto), unit_cost (ops.), total_cost (auto/ops.), alıcı, notlar.
- Liste + sil.

Placeholder `renderPiyasaFiyatlari` Task 9'da.

Commit: `feat(frontend): satış sekmesi + satışlar UI`

---

## Task 9: Frontend — Piyasa fiyatları UI

`renderPiyasaFiyatlari(body)`:
- Form: tarih, tür, cins, market_price (TL/kg), kaynak (ops.).
- Liste: tarih desc, ürün × cins × fiyat.
- Mini grafik OPSIYONEL — Faz 5'e bırak.

Commit: `feat(frontend): piyasa fiyatları snapshot UI`

---

## Task 10: Frontend — Ortak sekmesi UI

`renderOrtakTab(container)`:
- Mutabakat kartı: ciro / pay (%) / ödenen / bakiye (alacak/borç renkli)
- Yeni ödeme formu: tarih (default bugün) + tutar + yöntem (nakit/havale/diğer) + notlar
- Ödeme listesi + sil
- (`/api/reports/reconciliation`'dan fetch)

Commit: `feat(frontend): ortak ödemeleri + mutabakat kartı`

---

## Task 11: Frontend — Pano sekmesi gerçek

`renderTabContent` pano dalı:
```javascript
if (state.activeTab === "pano") renderPano(c);
```

`renderPano(container)`:
- 4 özet kart: Ciro / Net tahmini / Ortak payı / Bakiye
- "Son hareketler" listesi (son 5 satış/alım/uygulama, tarihsel)
- Eksik veriyse "Henüz veri yok" mesajı

Commit: `feat(frontend): pano with summary cards`

---

## Task 12: Push + PR + merge

```bash
git push -u origin feat/seraapp-faz-4
gh pr create --base main --head feat/seraapp-faz-4 --title "feat(seraapp): Faz 4 — satış + piyasa snapshot + ortak mutabakat" --body "..."
gh pr merge --squash --delete-branch
```

Expected: 98/98 vitest, main güncel.

---

## Faz 4 tamamlandı

- Modül 5 & 6 tam: satış + piyasa snapshot + ortak ödeme + mutabakat
- Pano sekmesi dolu (özet kartlar)
- Tüm sekmeler işlevsel

**Sonraki:** Faz 5 (Cila — grafikler, modaller, app.js modülerleştirme).
