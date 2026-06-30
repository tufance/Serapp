# Sera Takip Uygulaması — Tasarım Dokümanı

**Tarih:** 2026-06-30
**Durum:** Tasarım onaylandı, planlama bekleniyor
**Repo:** `Financial-tracking` (yeni uygulama, mevcut portföy panosu ayrı kalır)

## 1. Amaç

Seracılık operasyonunun tüm muhasebesini tek yerde tutmak: fidan alımı, sarf malzeme/ilaç alım ve stoğu, aylık tüketim, satışlar ve piyasa fiyatları, ortakla sezon sonu mutabakatı.

## 2. Kullanım modeli

- **Kullanıcı:** Tek hesap (uygulama sahibi). Ortak sisteme giriş yapmıyor, sadece kayıtlarda geçiyor.
- **Cihaz:** Mobil-first. Sera/tarladayken telefondan hızlı veri girişi temel kullanım senaryosu.
- **Depolama:** Bulut tabanlı. Veriler cihazlar arası senkron, tek doğruluk kaynağı uzak DB.
- **Sezon:** Tarihleri elle girilen, her sezon farklı olabilen aralık. Mutabakat sezon bazlı.

## 3. Maliyet ve mutabakat kuralları

- **Fidan birim maliyeti:** Sadece satın alma fiyatı. Toplam maliyet veya birim maliyetten biri girilince diğeri otomatik hesaplanır.
- **Diğer maliyetler:** Otomatik dağıtım yok. Sarf/ilaç/elektrik/su giderleri sezon özetinde toplam olarak görünür, satışın birim maliyetine otomatik bindirilmez.
- **Satış birim maliyeti:** Kullanıcı elle girer (kg başına maliyet tahmini).
- **Ortak payı:** Brüt satış cirosunun yüzdesi. Oran sezon bazında değişebilir (varsayılan %25, `seasons.partner_share_pct` kolonunda saklanır).
- **Mutabakat:** `partner_share = SUM(sales.total_revenue) * pct / 100`; `balance = partner_share − SUM(partner_payouts.amount)`.

## 4. Mimari

```
┌──────────────────────────────────────────────────────┐
│  Frontend (Cloudflare Pages)                         │
│  index.html + app.js + styles.css                    │
│  Mobil-first, vanilla JS, Chart.js (CDN)             │
└─────────────────────┬────────────────────────────────┘
                      │ HTTPS (same-origin)
┌─────────────────────▼────────────────────────────────┐
│  Cloudflare Worker (Hono router)                     │
│  /api/auth/*  /api/seasons  /api/seedlings           │
│  /api/supplies  /api/medicines  /api/consumption     │
│  /api/sales  /api/payouts  /api/reports  /api/setup  │
│  Auth middleware (cookie → KV lookup → 401 veya geç) │
└─────────┬─────────────────────────────────┬──────────┘
          │                                 │
   ┌──────▼──────┐                  ┌───────▼────────┐
   │  D1 (SQLite)│                  │  KV (sessions) │
   │  Master &   │                  │  30 gün TTL    │
   │  hareket    │                  │                │
   │  tabloları  │                  │                │
   └─────────────┘                  └────────────────┘
```

### 4.1 Bileşenler

| Bileşen | Sorumluluk | Bağımlılık |
|---|---|---|
| `index.html` | Kabuk, sekme iskelet, Chart.js yükleme | yok |
| `app.js` | SPA mantığı: yönlendirme, modal/form, `apiCall()` wrapper, sezon state | DOM |
| `styles.css` | Mobil-first stil (44px+ dokunmatik alanlar, alt sekme menüsü) | yok |
| `worker/index.ts` | Hono routing, auth middleware, JSON I/O | Hono |
| `worker/db.ts` | D1 prepared statement helper'ları | D1 |
| `worker/auth.ts` | bcrypt, KV session yönetimi | KV |
| `worker/reports.ts` | Mutabakat, stok bakiye, aylık tüketim aggregate'leri | D1 |
| `migrations/*.sql` | D1 şema migration'ları | — |

### 4.2 Auth

- İlk kurulum (`POST /api/setup`): parola hash (bcrypt) `app_config` tablosuna yazılır. Tek seferlik.
- Login (`POST /api/auth/login`): parola karşılaştır, başarılıysa rastgele token üret → KV'ye 30 gün TTL ile yaz → HttpOnly + Secure + SameSite=Lax cookie ile dön.
- Korumalı rota: middleware cookie → KV → user context. KV miss → 401.
- Logout (`POST /api/auth/logout`): KV sil + cookie temizle.
- Parola değiştir: mevcut parola kontrolüyle Ayarlar sekmesinden.

## 5. Master data (referans tabloları)

| Tablo | Kolonlar | Notlar |
|---|---|---|
| `seasons` | id, name, start_date, end_date, is_active, partner_share_pct (default 25) | Tek satır is_active=1 |
| `crop_types` | id, name | domates, salatalık, biber, patlıcan |
| `crop_varieties` | id, crop_type_id, name | "antalyalı", "çeri" vb. |
| `supply_categories` | id, name, unit | naylon (m²), odun (kg), kömür (kg) — stoklu |
| `utility_types` | id, name, unit | elektrik (kWh), su (m³) — stoksuz |
| `diseases` | id, name | mildiyö, külleme |
| `medicines` | id, name, active_ingredient, unit | Ridomil, vb. |
| `disease_medicine_map` | disease_id, medicine_id | many-to-many |

İlk kurulumda seed ile minimal liste yüklenir; tümü Ayarlar'dan CRUD.

## 6. Veri modeli (hareket tabloları)

Tüm hareket tablolarında ortak kolonlar: `id`, `created_at`, `updated_at`, `season_id` (FK).

### Modül 1 — Fidan alımı
```sql
seedling_purchases (
  id INTEGER PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  purchase_date TEXT NOT NULL,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id),
  crop_variety_id INTEGER NOT NULL REFERENCES crop_varieties(id),
  quantity INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  total_cost REAL NOT NULL,
  supplier TEXT,
  notes TEXT,
  created_at TEXT, updated_at TEXT
)
```

### Modül 2 — Sarf malzeme alımı + stok
```sql
supply_purchases (
  id, season_id, purchase_date,
  supply_category_id, quantity, unit, unit_cost, total_cost,
  supplier, notes, created_at, updated_at
)

supply_stock_movements (
  id, supply_category_id, movement_date,
  delta_qty,                  -- + alım, − tüketim, ± düzeltme
  source_type TEXT CHECK (source_type IN ('purchase','consumption','adjustment')),
  source_id INTEGER,
  notes, created_at
)
```
Bakiye = `SUM(delta_qty)`. Trigger ile `supply_purchases` insert'inde otomatik (+) hareket yazılır; `consumption_records` (item_type='supply') insert'inde (−) hareket yazılır.

### Modül 3 — İlaç alımı + uygulamaları + stok
```sql
medicine_purchases (
  id, season_id, purchase_date,
  medicine_id, quantity, unit, unit_cost, total_cost,
  supplier, notes, created_at, updated_at
)

medicine_applications (
  id, season_id, application_date,
  medicine_id, disease_id,
  quantity_used, target TEXT,    -- "kuzey blok", vb. serbest metin
  notes, created_at, updated_at
)

medicine_stock_movements (
  id, medicine_id, movement_date,
  delta_qty, source_type, source_id, notes, created_at
)
```
Trigger mantığı `supply_stock_movements` ile birebir aynı.

### Modül 4 — Tüketim
```sql
consumption_records (
  id, season_id,
  period_month TEXT NOT NULL,   -- 'YYYY-MM'
  item_type TEXT CHECK (item_type IN ('supply','utility')),
  ref_id INTEGER NOT NULL,      -- supply_category_id veya utility_type_id
  quantity REAL NOT NULL,
  unit TEXT,
  unit_cost REAL,               -- utility için faturadan tutar/birim
  total_cost REAL,
  notes, created_at, updated_at
)
```
- `item_type='supply'` → `supply_stock_movements`'a (−) hareket trigger ile.
- `item_type='utility'` → stok hareketi yok.

### Modül 5 — Satış + piyasa snapshot'ı
```sql
sales (
  id, season_id, sale_date,
  crop_type_id, crop_variety_id,
  quantity REAL,                 -- kg
  unit_price REAL,               -- TL/kg
  total_revenue REAL,
  unit_cost REAL,                -- elle, kg başına tahmini maliyet
  total_cost REAL,
  buyer TEXT, notes,
  created_at, updated_at
)

market_price_snapshots (
  id, snapshot_date,
  crop_type_id, crop_variety_id,
  market_price REAL,
  source TEXT,                   -- "Antalya hali", vb.
  notes, created_at
)
```

### Modül 6 — Ortak ödemeleri
```sql
partner_payouts (
  id, season_id, payout_date,
  amount REAL,
  method TEXT,                   -- 'nakit'|'havale'|'diğer'
  notes, created_at, updated_at
)
```

### Auth/yapılandırma
```sql
app_config (
  key TEXT PRIMARY KEY,          -- 'password_hash' vb.
  value TEXT
)
```

## 7. API yüzeyi (özet)

Tüm rotalar JSON, auth gerektirir (setup ve login hariç).

| Method | Path | Notlar |
|---|---|---|
| POST | `/api/setup` | İlk parola; `app_config.password_hash` boşken çalışır |
| POST | `/api/auth/login` | Parola → cookie |
| POST | `/api/auth/logout` | Cookie temizle |
| GET/POST/PATCH/DELETE | `/api/seasons[/id]` | `is_active` toggle ayrı endpoint: `POST /api/seasons/:id/activate` |
| CRUD | `/api/master/crop-types`, `/api/master/crop-varieties`, `/api/master/supplies`, `/api/master/utilities`, `/api/master/diseases`, `/api/master/medicines`, `/api/master/disease-medicine-map` | |
| CRUD | `/api/seedlings`, `/api/supply-purchases`, `/api/medicine-purchases`, `/api/medicine-applications`, `/api/consumption`, `/api/sales`, `/api/market-prices`, `/api/payouts` | Query: `?season_id=` (zorunlu) |
| GET | `/api/reports/season-summary?season_id=` | Pano kartları için tek payload |
| GET | `/api/reports/stock?season_id=` | Tüm stok bakiyeleri |
| GET | `/api/reports/monthly-consumption?season_id=` | Aylık tüketim aggregate |
| GET | `/api/reports/reconciliation?season_id=` | Ciro, ortak payı, ödenen, bakiye |

## 8. UI yapısı

### Sekmeler (alt menü)
1. **Pano** — sezon özeti, mutabakat, grafikler, son hareketler
2. **Alım** — alt-tab: Fidan / Sarf / İlaç
3. **Hareket** — alt-tab: İlaç uygulaması / Tüketim
4. **Satış** — alt-tab: Satışlar / Piyasa fiyatları
5. **Ortak** — ödeme listesi + mutabakat kartı
6. **Ayarlar** (üst-sağ icon) — sezonlar, master data, parola

### Form kalıbı (mobile-first)
- 44px+ yükseklikte dokunmatik input
- Sayısal alanlarda `inputmode="decimal"`
- Tarih default = bugün
- Cins seçimi türe bağlı filtreli dropdown
- "Yeni cins/sarf/ilaç ekle" inline butonu (modal master data ekleyip dönüş)
- Optimistic UI: kaydet → toast → liste anında güncelleme

### Pano kart taslağı
```
┌──────────────┬──────────────┐
│ Ciro         │ Net (tahmini)│
│ ₺127.450     │ ₺ 42.300     │
├──────────────┼──────────────┤
│ Ortak payı   │ Ödenen       │
│ ₺ 31.862     │ ₺ 22.000     │
│ (%25)        │              │
├──────────────┴──────────────┤
│ Bakiye: ₺9.862 borç         │
└─────────────────────────────┘
```
Altında: piyasa fiyatı zaman serisi (ürün × ay), aylık tüketim bar grafiği, stok özeti listesi.

### Hata/uyarı kuralları
- Stok eksiye düşüyorsa: uyarı toast'u + sarı stok rozeti, ama kayıt geçer (sezon başı düzeltmeleri için).
- Aktif sezon yoksa: pano ve diğer sekmeler "Önce sezon oluşturun" CTA gösterir.
- 401: otomatik login sayfasına yönlendirme.

## 9. Hata yönetimi

- **Frontend `apiCall()`** wrapper: ağ hatası → "Yeniden dene" toast'u; 401 → login; 400 → hata mesajını input altına; 500 → "Beklenmedik hata" toast'u + raporlama hook'u (console.error).
- **Worker**: tüm rotalar try/catch; D1/KV hataları `{ error, code }` JSON'la 500.
- **Validation**: zorunlu alanlar + sayısal aralık kontrolü Worker'da (frontend de yapar ama Worker doğruluk kaynağı).
- **Migration güvenliği**: D1 trigger'ları idempotent; yeniden çalıştırılırsa bozulmaz.

## 10. Test stratejisi

**Worker testleri (`vitest` + `@cloudflare/vitest-pool-workers`):**
- Master data CRUD
- Her hareket için CRUD
- Stok bakiye: alım+tüketim sonrası beklenen değer
- Mutabakat: ciro × oran − ödenen
- Auth: setup → login → korumalı rota erişimi
- Edge case'ler: sıfır cirolu sezon, stok eksiye düşme, sezon değiştirme

**Frontend:**
- Manuel smoke (her sekmede ekle/listele/düzenle/sil)
- Chrome DevTools mobile emulation
- Otomatik E2E yok (scope dışı, tek kullanıcı)

## 11. Faz planı

| Faz | İçerik | Tamamlandığında doğrulama |
|---|---|---|
| **0** | Cloudflare proje kurulumu, Worker iskelet, D1 şeması + seed, frontend kabuk, auth | Setup → login → boş pano açılır |
| **1** | Master data CRUD (Ayarlar), sezon yönetimi | Sezon aç/kapat, türler/cinsler ekle |
| **2** | Modül 1-2-3 alımları, stok hareketi trigger'ları | Alım yap → stok artıyor; uygulama → azalıyor |
| **3** | Modül 4 tüketim + aylık rapor | Aylık tüketim doğru, supply tüketimi stoku düşürüyor |
| **4** | Modül 5+6: satış, piyasa snapshot, ortak ödeme, mutabakat | Pano kartlarında ciro/pay/ödenen/bakiye doğru |
| **5** | Cila: grafikler, düzenle/sil modalları, boş durum/hata mesajları | Tüm sekmeler tam fonksiyonel |

Faz 0+1 ilk teslim. Sonraki fazlar tek tek PR.

## 12. Kapsam dışı (YAGNI)

- Çoklu kullanıcı/yetki sistemi
- Otomatik maliyet dağıtımı (sezon giderlerinin ürüne otomatik bindirilmesi)
- KDV/fatura entegrasyonu
- Otomatik piyasa fiyatı çekme (API yok)
- Push bildirim
- Offline mod (sadece online çalışır, mobil tarayıcı cache'i yeterli)
- E2E testler

## 13. Riskler ve açık noktalar

- **D1 trigger karmaşıklığı:** Stok hareketleri trigger ile yazılıyor; trigger'lar test edilmeli, yoksa veri tutarsızlığı kaynağı olur.
- **Sezon değiştirme UX'i:** Aktif sezon değiştiğinde tüm sekmelerin yeniden yüklenmesi şart; state yönetimi basit kalmalı.
- **Stok eksiye düşme:** "Uyarı ver ama kaydet" politikası kullanıcı dikkatine bağlı; raporda bu kayıtlar işaretlenmeli.
- **Auth basitliği:** Tek kullanıcı + parola yeterli; ileride 2FA gerekirse Worker'a entegre edilebilir ama scope dışı.
