# Sera Takip — Faz 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modül 1-3 (fidan + sarf + ilaç alımları + stok hareketleri + ilaç uygulamaları) hareket tablolarını + Alım & Hareket sekmesi UI'larını ekle. Aynı PR'da Faz 0+1 review'inden çıkan iki "Important" follow-up'ı da kapat.

**Architecture:** Yeni hareket tabloları aktif sezona scoped (`season_id` FK). Stok hareketleri trigger'larla otomatik: `supply_purchases` / `medicine_purchases` / `medicine_applications` insert/update/delete'inde `*_stock_movements` tablolarına ilgili (+/-) satır yazılır. Stok bakiyesi `SUM(delta_qty)` ile sorgulanır. Frontend'de Alım sekmesi 3 alt-tab (Fidan/Sarf/İlaç), Hareket sekmesi İlaç-uygulaması alt-tab'i alır; her sekmede ilgili stok özeti küçük kart olarak gösterilir.

**Tech Stack:** Mevcut Faz 0+1 stack: Cloudflare Worker (Hono) + D1 + KV, vitest, vanilla JS frontend.

**Spec:** `docs/superpowers/specs/2026-06-30-sera-takip-design.md` (Modül 1-3)
**Önceki plan:** `docs/superpowers/plans/2026-06-30-sera-takip-faz-0-1.md`

**Branch:** `feat/seraapp-faz-2`, branched from `feat/seraapp-faz-0-1` (PR #1). Faz 0+1 main'e merge olunca bu branch rebase olur.

**Sonraki planlar:**
- Faz 3: Modül 4 (tüketim + aylık rapor)
- Faz 4: Modül 5-6 (satış + piyasa snapshot + ortak mutabakat)
- Faz 5: Cila (grafikler, modaller, edge case'ler)

---

## File Structure

```
seraapp/
├── migrations/
│   ├── 0004_seedlings.sql                  # YENİ — Modül 1
│   ├── 0005_supplies.sql                   # YENİ — Modül 2 (purchases + stock_movements + triggers)
│   └── 0006_medicines.sql                  # YENİ — Modül 3 (purchases + applications + stock_movements + triggers)
├── src/
│   ├── cookies.ts                          # YENİ — paylaşımlı parseCookie (follow-up)
│   ├── middleware.ts                       # DEĞİŞ — cookies.ts'i kullan
│   ├── routes/
│   │   ├── setup.ts                        # DEĞİŞ — GET /api/setup-status ekle (follow-up)
│   │   ├── auth.ts                         # DEĞİŞ — cookies.ts'i kullan
│   │   ├── seedlings.ts                    # YENİ — Modül 1 CRUD
│   │   ├── supply-purchases.ts             # YENİ — Modül 2 alım CRUD
│   │   ├── medicine-purchases.ts           # YENİ — Modül 3 alım CRUD
│   │   ├── medicine-applications.ts        # YENİ — Modül 3 uygulama CRUD
│   │   └── stock.ts                        # YENİ — stok bakiye endpoint'leri
│   └── index.ts                            # DEĞİŞ — yeni router mount'lar + setup-status
├── test/
│   ├── setup-status.test.ts                # YENİ
│   ├── seedlings.test.ts                   # YENİ
│   ├── supply-purchases.test.ts            # YENİ
│   ├── medicine-purchases.test.ts          # YENİ
│   ├── medicine-applications.test.ts       # YENİ
│   └── stock.test.ts                       # YENİ
└── public/
    └── app.js                              # DEĞİŞ — Alım & Hareket sekmesi UI'ları
```

**Sorumluluk ayrımı:**
- `cookies.ts`: tek küçük dosya, sadece `parseCookie()`. middleware.ts ve auth.ts bunu kullanır.
- Her hareket için ayrı route dosyası: net sınır, küçük dosya, kolay test.
- `stock.ts`: stok bakiye sorgularını tek yerde topla (supply + medicine). Generic değil — sadece iki kaynak var ve farklı.
- Migration'lar bağımsız: 0004 fidan, 0005 sarf+stok, 0006 ilaç+stok. Tek tek apply edilebilir.
- Triggers: her purchase/application için 3 trigger (INSERT/UPDATE/DELETE) → stok kaymaz.
- Frontend `app.js`: yeni renderer fonksiyonları (`renderAlimTab`, `renderHareketTab` ve alt-renderer'ları). Faz 0+1 reviewer "Faz 2 öncesi app.js'i böl" demişti — Faz 2 sonunda 700+ satıra yaklaşırsa Faz 3 öncesi bölünür; bu plan henüz bölmüyor.

---

## Task 1: Yeni branch oluştur

**Files:** (none — git operation)

- [ ] **Step 1: Branch oluştur**

```bash
cd /Users/tufancetiner/Financial-tracking
git checkout feat/seraapp-faz-0-1
git checkout -b feat/seraapp-faz-2
git status
```

Expected: clean working tree, on `feat/seraapp-faz-2`.

- [ ] **Step 2: İlk test sanity check**

```bash
cd seraapp && npm test 2>&1 | tail -5
```

Expected: 41/41 PASS (Faz 0+1 test'leri hala geçiyor).

---

## Task 2: Follow-up — GET /api/setup-status endpoint

Faz 0+1 reviewer'ı bootstrap()'taki `__probe__` hack'i "Important" olarak işaretledi. Bu task yeni bir public endpoint ekler ve frontend'i temizler.

**Files:**
- Modify: `seraapp/src/routes/setup.ts`
- Modify: `seraapp/public/app.js`
- Create: `seraapp/test/setup-status.test.ts`

- [ ] **Step 1: Test yaz**

`seraapp/test/setup-status.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

describe("GET /api/setup-status", () => {
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
  });

  it("returns initialized=false when no password set", async () => {
    const res = await SELF.fetch("https://example.com/api/setup-status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ initialized: false });
  });

  it("returns initialized=true after password set", async () => {
    const hash = await hashPassword("x");
    await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
    const res = await SELF.fetch("https://example.com/api/setup-status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ initialized: true });
  });

  it("works without auth", async () => {
    const res = await SELF.fetch("https://example.com/api/setup-status");
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
cd seraapp && npm test -- setup-status
```

Expected: 3 FAILs (404).

- [ ] **Step 3: Endpoint ekle**

`seraapp/src/routes/setup.ts` sonuna ekle:

```typescript
setupRouter.get("/setup-status", async (c) => {
  const existing = await c.env.DB
    .prepare("SELECT value FROM app_config WHERE key='password_hash'")
    .first<{ value: string }>();
  return c.json({ initialized: !!existing });
});
```

- [ ] **Step 4: Test → PASS**

```bash
npm test -- setup-status
```

Expected: 3/3 PASS.

- [ ] **Step 5: Frontend `bootstrap()`'taki `__probe__` hack'i temizle**

`seraapp/public/app.js` içindeki `bootstrap()` fonksiyonunda bu blok:
```javascript
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
    }
```

ile değiştir:
```javascript
    if (me.status === 401) {
      const statusRes = await fetch("/api/setup-status");
      const status = await statusRes.json().catch(() => ({}));
      state.needsSetup = status.initialized === false;
      state.authed = false;
      state.page = state.needsSetup ? "setup" : "login";
    }
```

- [ ] **Step 6: Test + node --check**

```bash
node --check seraapp/public/app.js
npm test 2>&1 | tail -5
```

Expected: tsc clean, 44/44 PASS (41 + 3).

- [ ] **Step 7: Commit**

```bash
git add seraapp/src/routes/setup.ts seraapp/test/setup-status.test.ts seraapp/public/app.js
git commit -m "feat(auth): add /api/setup-status, drop frontend probe hack"
```

---

## Task 3: Follow-up — parseCookie tek modül

Faz 0+1 reviewer'ı `parseCookie()` duplikasyonunu "Important" işaretlemişti.

**Files:**
- Create: `seraapp/src/cookies.ts`
- Modify: `seraapp/src/middleware.ts`
- Modify: `seraapp/src/routes/auth.ts`

- [ ] **Step 1: Yeni helper modül**

`seraapp/src/cookies.ts`:
```typescript
export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v;
  }
  return null;
}
```

- [ ] **Step 2: middleware.ts'i güncelle**

`seraapp/src/middleware.ts`'in tepe importlarına ekle:
```typescript
import { parseCookie } from "./cookies";
```

Sonra dosya içindeki LOCAL `function parseCookie(...) { ... }` tanımını SİL (artık import edildi).

- [ ] **Step 3: routes/auth.ts'i güncelle**

`seraapp/src/routes/auth.ts`'nin tepe importlarına ekle:
```typescript
import { parseCookie } from "../cookies";
```

Sonra dosya içindeki LOCAL `function parseCookie(...) { ... }` tanımını SİL.

- [ ] **Step 4: Test + tsc**

```bash
cd seraapp && npx tsc --noEmit && npm test 2>&1 | tail -5
```

Expected: tsc clean, 44/44 PASS.

- [ ] **Step 5: Commit**

```bash
git add seraapp/src/cookies.ts seraapp/src/middleware.ts seraapp/src/routes/auth.ts
git commit -m "refactor(cookies): hoist parseCookie into shared module"
```

---

## Task 4: Migration — `seedling_purchases` (Modül 1)

**Files:**
- Create: `seraapp/migrations/0004_seedlings.sql`

- [ ] **Step 1: Migration**

`seraapp/migrations/0004_seedlings.sql`:
```sql
CREATE TABLE seedling_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,                       -- 'YYYY-MM-DD'
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE RESTRICT,
  crop_variety_id INTEGER NOT NULL REFERENCES crop_varieties(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_seedling_purchases_season ON seedling_purchases(season_id);
CREATE INDEX idx_seedling_purchases_date ON seedling_purchases(purchase_date);
```

- [ ] **Step 2: Lokal migrate**

```bash
cd seraapp && npm run migrate:local
```

Expected: applied, no errors.

- [ ] **Step 3: Full suite — schema değişikliği regression değil**

```bash
npm test 2>&1 | tail -5
```

Expected: 44/44 PASS.

- [ ] **Step 4: Commit**

```bash
git add seraapp/migrations/0004_seedlings.sql
git commit -m "feat(db): add seedling_purchases table"
```

---

## Task 5: Seedlings CRUD endpoint

**Files:**
- Create: `seraapp/src/routes/seedlings.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/seedlings.test.ts`

- [ ] **Step 1: Test**

`seraapp/test/seedlings.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setup(): Promise<{ cookie: string; seasonId: number; cropTypeId: number; varietyId: number }> {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

  const s = await (await SELF.fetch("https://example.com/api/seasons", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
  })).json() as any;

  const t = await (await SELF.fetch("https://example.com/api/master/crop-types", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "domates" }),
  })).json() as any;

  const v = await (await SELF.fetch("https://example.com/api/master/crop-varieties", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ crop_type_id: t.id, name: "çeri" }),
  })).json() as any;

  return { cookie, seasonId: s.id, cropTypeId: t.id, varietyId: v.id };
}

describe("seedlings CRUD", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/seedlings?season_id=1")).status).toBe(401);
  });

  it("POST creates a seedling purchase", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId,
        purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId,
        crop_variety_id: ctx.varietyId,
        quantity: 100,
        unit_cost: 2.5,
        total_cost: 250,
        supplier: "Antalya Fidancılık",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.id).toBeTypeOf("number");
    expect(json.quantity).toBe(100);
  });

  it("GET lists seedlings for a season", async () => {
    await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    const res = await SELF.fetch(`https://example.com/api/seedlings?season_id=${ctx.seasonId}`, {
      headers: { cookie: ctx.cookie },
    });
    expect(res.status).toBe(200);
    expect((await res.json() as any[]).length).toBe(1);
  });

  it("GET requires season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", { headers: { cookie: ctx.cookie } });
    expect(res.status).toBe(400);
  });

  it("PATCH updates supplier", async () => {
    const c = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/seedlings/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ supplier: "Yeni Tedarikçi" }),
    });
    expect(r.status).toBe(200);
    expect(((await r.json()) as any).supplier).toBe("Yeni Tedarikçi");
  });

  it("DELETE removes", async () => {
    const c = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/seedlings/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    expect(r.status).toBe(204);
  });

  it("rejects unknown season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: 99999, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 100, unit_cost: 2.5, total_cost: 250,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-positive quantity", async () => {
    const res = await SELF.fetch("https://example.com/api/seedlings", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        crop_type_id: ctx.cropTypeId, crop_variety_id: ctx.varietyId,
        quantity: 0, unit_cost: 2.5, total_cost: 0,
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- seedlings
```

- [ ] **Step 3: Route**

`seraapp/src/routes/seedlings.ts`:
```typescript
import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const seedlingsRouter = new Hono<AppContext>();
seedlingsRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SeedlingPurchase = {
  id: number;
  season_id: number;
  purchase_date: string;
  crop_type_id: number;
  crop_variety_id: number;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateFK(c: any, body: any): Promise<string | null> {
  const s = await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id);
  if (!s) return "unknown season_id";
  const t = await one(c.env.DB, "SELECT id FROM crop_types WHERE id=?", body.crop_type_id);
  if (!t) return "unknown crop_type_id";
  const v = await one(c.env.DB, "SELECT id, crop_type_id FROM crop_varieties WHERE id=?", body.crop_variety_id);
  if (!v) return "unknown crop_variety_id";
  if ((v as any).crop_type_id !== body.crop_type_id) return "variety does not match type";
  return null;
}

seedlingsRouter.get("/seedlings", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<SeedlingPurchase>(
    c.env.DB,
    "SELECT * FROM seedling_purchases WHERE season_id=? ORDER BY purchase_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

seedlingsRouter.post("/seedlings", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.purchase_date ?? "")) return c.json({ error: "valid purchase_date required" }, 400);
  if (typeof body.crop_type_id !== "number" || typeof body.crop_variety_id !== "number") {
    return c.json({ error: "crop_type_id and crop_variety_id required" }, 400);
  }
  if (typeof body.quantity !== "number" || body.quantity <= 0) {
    return c.json({ error: "quantity must be > 0" }, 400);
  }
  if (typeof body.unit_cost !== "number" || body.unit_cost < 0) {
    return c.json({ error: "unit_cost must be >= 0" }, 400);
  }
  if (typeof body.total_cost !== "number" || body.total_cost < 0) {
    return c.json({ error: "total_cost must be >= 0" }, 400);
  }
  const fkErr = await validateFK(c, body);
  if (fkErr) return c.json({ error: fkErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO seedling_purchases
      (season_id, purchase_date, crop_type_id, crop_variety_id, quantity, unit_cost, total_cost, supplier, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.purchase_date, body.crop_type_id, body.crop_variety_id,
    body.quantity, body.unit_cost, body.total_cost,
    body.supplier?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<SeedlingPurchase>(c.env.DB, "SELECT * FROM seedling_purchases WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

seedlingsRouter.patch("/seedlings/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<SeedlingPurchase>(c.env.DB, "SELECT * FROM seedling_purchases WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.purchase_date ?? "")) updates.purchase_date = body.purchase_date;
  if (typeof body.quantity === "number" && body.quantity > 0) updates.quantity = body.quantity;
  if (typeof body.unit_cost === "number" && body.unit_cost >= 0) updates.unit_cost = body.unit_cost;
  if (typeof body.total_cost === "number" && body.total_cost >= 0) updates.total_cost = body.total_cost;
  if (typeof body.supplier === "string") updates.supplier = body.supplier.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE seedling_purchases SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<SeedlingPurchase>(c.env.DB, "SELECT * FROM seedling_purchases WHERE id=?", id);
  return c.json(row);
});

seedlingsRouter.delete("/seedlings/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM seedling_purchases WHERE id=?", id);
  return new Response(null, { status: 204 });
});
```

- [ ] **Step 4: Mount**

`seraapp/src/index.ts`'a ekle:
```typescript
import { seedlingsRouter } from "./routes/seedlings";
// (existing route mount'ların yanına)
app.route("/api", seedlingsRouter);
```

- [ ] **Step 5: Test → PASS**

```bash
npm test -- seedlings && npm test 2>&1 | tail -5
```

Expected: 8/8 seedlings + 52/52 total.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/routes/seedlings.ts seraapp/src/index.ts seraapp/test/seedlings.test.ts
git commit -m "feat(seedlings): add CRUD endpoints"
```

---

## Task 6: Migration — `supply_purchases` + `supply_stock_movements` + trigger'lar (Modül 2)

**Files:**
- Create: `seraapp/migrations/0005_supplies.sql`

- [ ] **Step 1: Migration**

`seraapp/migrations/0005_supplies.sql`:
```sql
CREATE TABLE supply_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,
  supply_category_id INTEGER NOT NULL REFERENCES supply_categories(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_supply_purchases_season ON supply_purchases(season_id);
CREATE INDEX idx_supply_purchases_cat ON supply_purchases(supply_category_id);

CREATE TABLE supply_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supply_category_id INTEGER NOT NULL REFERENCES supply_categories(id) ON DELETE CASCADE,
  movement_date TEXT NOT NULL,
  delta_qty REAL NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase','consumption','adjustment')),
  source_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_supply_stock_cat ON supply_stock_movements(supply_category_id);
CREATE INDEX idx_supply_stock_source ON supply_stock_movements(source_type, source_id);

-- Insert -> stoğa (+)
CREATE TRIGGER trg_supply_purchase_insert
AFTER INSERT ON supply_purchases
BEGIN
  INSERT INTO supply_stock_movements (supply_category_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.supply_category_id, NEW.purchase_date, NEW.quantity, 'purchase', NEW.id);
END;

-- Update -> stok satırını eşle (yeni qty / date)
CREATE TRIGGER trg_supply_purchase_update
AFTER UPDATE ON supply_purchases
BEGIN
  UPDATE supply_stock_movements
  SET supply_category_id = NEW.supply_category_id,
      movement_date      = NEW.purchase_date,
      delta_qty          = NEW.quantity
  WHERE source_type='purchase' AND source_id=NEW.id;
END;

-- Delete -> stok satırını sil
CREATE TRIGGER trg_supply_purchase_delete
AFTER DELETE ON supply_purchases
BEGIN
  DELETE FROM supply_stock_movements
  WHERE source_type='purchase' AND source_id=OLD.id;
END;
```

- [ ] **Step 2: Lokal migrate**

```bash
cd seraapp && npm run migrate:local
```

- [ ] **Step 3: Full suite (regression)**

```bash
npm test 2>&1 | tail -5
```

Expected: 52/52 PASS.

- [ ] **Step 4: Commit**

```bash
git add seraapp/migrations/0005_supplies.sql
git commit -m "feat(db): add supply_purchases + stock movements with triggers"
```

---

## Task 7: Supply purchases CRUD endpoint

**Files:**
- Create: `seraapp/src/routes/supply-purchases.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/supply-purchases.test.ts`

- [ ] **Step 1: Test**

`seraapp/test/supply-purchases.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setup() {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];
  const s = await (await SELF.fetch("https://example.com/api/seasons", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
  })).json() as any;
  const cat = await (await SELF.fetch("https://example.com/api/master/supplies", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "kömür", unit: "kg" }),
  })).json() as any;
  return { cookie, seasonId: s.id, catId: cat.id };
}

describe("supply purchases CRUD + stock", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/supply-purchases?season_id=1")).status).toBe(401);
  });

  it("POST creates a purchase AND auto-creates stock movement (+)", async () => {
    const res = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    expect(res.status).toBe(201);
    const mov = await env.DB.prepare("SELECT * FROM supply_stock_movements WHERE source_type='purchase'").all<any>();
    expect(mov.results).toHaveLength(1);
    expect(mov.results[0].delta_qty).toBe(100);
  });

  it("PATCH updates quantity AND stock movement reflects change", async () => {
    const c = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/supply-purchases/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ quantity: 120, total_cost: 600 }),
    });
    const mov = await env.DB.prepare("SELECT delta_qty FROM supply_stock_movements WHERE source_id=?").bind(id).first<any>();
    expect(mov.delta_qty).toBe(120);
  });

  it("DELETE removes purchase AND its stock movement", async () => {
    const c = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/supply-purchases/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    const mov = await env.DB.prepare("SELECT COUNT(*) AS c FROM supply_stock_movements WHERE source_id=?").bind(id).first<any>();
    expect(mov.c).toBe(0);
  });

  it("GET lists for a season", async () => {
    await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    const list = await (await SELF.fetch(`https://example.com/api/supply-purchases?season_id=${ctx.seasonId}`, {
      headers: { cookie: ctx.cookie },
    })).json() as any[];
    expect(list).toHaveLength(1);
  });

  it("rejects non-positive quantity", async () => {
    const res = await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        supply_category_id: ctx.catId, quantity: 0, unit: "kg",
        unit_cost: 5, total_cost: 0,
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Test → FAIL**

- [ ] **Step 3: Route**

`seraapp/src/routes/supply-purchases.ts`:
```typescript
import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const supplyPurchasesRouter = new Hono<AppContext>();
supplyPurchasesRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type SupplyPurchase = {
  id: number;
  season_id: number;
  purchase_date: string;
  supply_category_id: number;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateFK(c: any, body: any): Promise<string | null> {
  if (!await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id)) return "unknown season_id";
  if (!await one(c.env.DB, "SELECT id FROM supply_categories WHERE id=?", body.supply_category_id)) return "unknown supply_category_id";
  return null;
}

supplyPurchasesRouter.get("/supply-purchases", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<SupplyPurchase>(
    c.env.DB,
    "SELECT * FROM supply_purchases WHERE season_id=? ORDER BY purchase_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

supplyPurchasesRouter.post("/supply-purchases", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.purchase_date ?? "")) return c.json({ error: "valid purchase_date required" }, 400);
  if (typeof body.supply_category_id !== "number") return c.json({ error: "supply_category_id required" }, 400);
  if (typeof body.quantity !== "number" || body.quantity <= 0) return c.json({ error: "quantity must be > 0" }, 400);
  if (typeof body.unit !== "string" || !body.unit.trim()) return c.json({ error: "unit required" }, 400);
  if (typeof body.unit_cost !== "number" || body.unit_cost < 0) return c.json({ error: "unit_cost must be >= 0" }, 400);
  if (typeof body.total_cost !== "number" || body.total_cost < 0) return c.json({ error: "total_cost must be >= 0" }, 400);
  const fkErr = await validateFK(c, body);
  if (fkErr) return c.json({ error: fkErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO supply_purchases
      (season_id, purchase_date, supply_category_id, quantity, unit, unit_cost, total_cost, supplier, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.purchase_date, body.supply_category_id,
    body.quantity, body.unit.trim(), body.unit_cost, body.total_cost,
    body.supplier?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<SupplyPurchase>(c.env.DB, "SELECT * FROM supply_purchases WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

supplyPurchasesRouter.patch("/supply-purchases/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<SupplyPurchase>(c.env.DB, "SELECT * FROM supply_purchases WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.purchase_date ?? "")) updates.purchase_date = body.purchase_date;
  if (typeof body.quantity === "number" && body.quantity > 0) updates.quantity = body.quantity;
  if (typeof body.unit === "string" && body.unit.trim()) updates.unit = body.unit.trim();
  if (typeof body.unit_cost === "number" && body.unit_cost >= 0) updates.unit_cost = body.unit_cost;
  if (typeof body.total_cost === "number" && body.total_cost >= 0) updates.total_cost = body.total_cost;
  if (typeof body.supplier === "string") updates.supplier = body.supplier.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE supply_purchases SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<SupplyPurchase>(c.env.DB, "SELECT * FROM supply_purchases WHERE id=?", id);
  return c.json(row);
});

supplyPurchasesRouter.delete("/supply-purchases/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM supply_purchases WHERE id=?", id);
  return new Response(null, { status: 204 });
});
```

- [ ] **Step 4: Mount**

`seraapp/src/index.ts`'a:
```typescript
import { supplyPurchasesRouter } from "./routes/supply-purchases";
app.route("/api", supplyPurchasesRouter);
```

- [ ] **Step 5: Test → PASS**

```bash
npm test -- supply-purchases && npm test 2>&1 | tail -5
```

Expected: 6/6 supply + 58/58 total.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/routes/supply-purchases.ts seraapp/src/index.ts seraapp/test/supply-purchases.test.ts
git commit -m "feat(supplies): add purchase CRUD (auto-tracks stock via triggers)"
```

---

## Task 8: Migration — `medicine_purchases` + `medicine_applications` + `medicine_stock_movements` + trigger'lar (Modül 3)

**Files:**
- Create: `seraapp/migrations/0006_medicines.sql`

- [ ] **Step 1: Migration**

`seraapp/migrations/0006_medicines.sql`:
```sql
CREATE TABLE medicine_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  purchase_date TEXT NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medicine_purchases_season ON medicine_purchases(season_id);
CREATE INDEX idx_medicine_purchases_med ON medicine_purchases(medicine_id);

CREATE TABLE medicine_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  application_date TEXT NOT NULL,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE RESTRICT,
  disease_id INTEGER NOT NULL REFERENCES diseases(id) ON DELETE RESTRICT,
  quantity_used REAL NOT NULL CHECK (quantity_used > 0),
  target TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medicine_apps_season ON medicine_applications(season_id);
CREATE INDEX idx_medicine_apps_med ON medicine_applications(medicine_id);

CREATE TABLE medicine_stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  movement_date TEXT NOT NULL,
  delta_qty REAL NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('purchase','application','adjustment')),
  source_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medicine_stock_med ON medicine_stock_movements(medicine_id);
CREATE INDEX idx_medicine_stock_source ON medicine_stock_movements(source_type, source_id);

-- Purchase triggers (+ stoğa)
CREATE TRIGGER trg_medicine_purchase_insert
AFTER INSERT ON medicine_purchases
BEGIN
  INSERT INTO medicine_stock_movements (medicine_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.medicine_id, NEW.purchase_date, NEW.quantity, 'purchase', NEW.id);
END;

CREATE TRIGGER trg_medicine_purchase_update
AFTER UPDATE ON medicine_purchases
BEGIN
  UPDATE medicine_stock_movements
  SET medicine_id   = NEW.medicine_id,
      movement_date = NEW.purchase_date,
      delta_qty     = NEW.quantity
  WHERE source_type='purchase' AND source_id=NEW.id;
END;

CREATE TRIGGER trg_medicine_purchase_delete
AFTER DELETE ON medicine_purchases
BEGIN
  DELETE FROM medicine_stock_movements
  WHERE source_type='purchase' AND source_id=OLD.id;
END;

-- Application triggers (- stoktan)
CREATE TRIGGER trg_medicine_application_insert
AFTER INSERT ON medicine_applications
BEGIN
  INSERT INTO medicine_stock_movements (medicine_id, movement_date, delta_qty, source_type, source_id)
  VALUES (NEW.medicine_id, NEW.application_date, -NEW.quantity_used, 'application', NEW.id);
END;

CREATE TRIGGER trg_medicine_application_update
AFTER UPDATE ON medicine_applications
BEGIN
  UPDATE medicine_stock_movements
  SET medicine_id   = NEW.medicine_id,
      movement_date = NEW.application_date,
      delta_qty     = -NEW.quantity_used
  WHERE source_type='application' AND source_id=NEW.id;
END;

CREATE TRIGGER trg_medicine_application_delete
AFTER DELETE ON medicine_applications
BEGIN
  DELETE FROM medicine_stock_movements
  WHERE source_type='application' AND source_id=OLD.id;
END;
```

- [ ] **Step 2: Lokal migrate + regression**

```bash
cd seraapp && npm run migrate:local && npm test 2>&1 | tail -5
```

Expected: 58/58 PASS.

- [ ] **Step 3: Commit**

```bash
git add seraapp/migrations/0006_medicines.sql
git commit -m "feat(db): add medicine purchases, applications, stock movements + triggers"
```

---

## Task 9: Medicine purchases CRUD

**Files:**
- Create: `seraapp/src/routes/medicine-purchases.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/medicine-purchases.test.ts`

- [ ] **Step 1: Test**

`seraapp/test/medicine-purchases.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setup() {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];
  const s = await (await SELF.fetch("https://example.com/api/seasons", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
  })).json() as any;
  const m = await (await SELF.fetch("https://example.com/api/master/medicines", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Ridomil", unit: "g" }),
  })).json() as any;
  return { cookie, seasonId: s.id, medId: m.id };
}

describe("medicine purchases CRUD + stock", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/medicine-purchases?season_id=1")).status).toBe(401);
  });

  it("POST + auto stock movement (+)", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        medicine_id: ctx.medId, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    expect(res.status).toBe(201);
    const mov = await env.DB.prepare("SELECT * FROM medicine_stock_movements").all<any>();
    expect(mov.results).toHaveLength(1);
    expect(mov.results[0].delta_qty).toBe(500);
    expect(mov.results[0].source_type).toBe("purchase");
  });

  it("PATCH quantity reflected in stock", async () => {
    const c = await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        medicine_id: ctx.medId, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/medicine-purchases/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({ quantity: 600, total_cost: 240 }),
    });
    const mov = await env.DB.prepare("SELECT delta_qty FROM medicine_stock_movements WHERE source_id=?").bind(id).first<any>();
    expect(mov.delta_qty).toBe(600);
  });

  it("DELETE removes purchase + stock movement", async () => {
    const c = await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, purchase_date: "2025-09-15",
        medicine_id: ctx.medId, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/medicine-purchases/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM medicine_stock_movements").first<any>();
    expect(cnt.c).toBe(0);
  });

  it("GET requires season_id", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-purchases", { headers: { cookie: ctx.cookie } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2-6: Test → FAIL → Route → Mount → Test → PASS → Commit**

`seraapp/src/routes/medicine-purchases.ts` — yapı `supply-purchases.ts`'in birebir aynısı; tek farklar:
- Path: `/medicine-purchases`
- Table: `medicine_purchases`
- FK alanı: `medicine_id` → `medicines` tablosunda kontrol
- Diğer kolonlar aynı: season_id, purchase_date, quantity, unit, unit_cost, total_cost, supplier, notes

Yukarıdaki `supply-purchases.ts` şablonundan kopyala, isimleri değiştir. Validate FK fonksiyonu sadece `medicines` tablosunu kontrol eder.

Mount `index.ts`'te:
```typescript
import { medicinePurchasesRouter } from "./routes/medicine-purchases";
app.route("/api", medicinePurchasesRouter);
```

Commit:
```bash
git add seraapp/src/routes/medicine-purchases.ts seraapp/src/index.ts seraapp/test/medicine-purchases.test.ts
git commit -m "feat(medicines): add purchase CRUD"
```

Expected: 5/5 + 63/63 total.

---

## Task 10: Medicine applications CRUD

**Files:**
- Create: `seraapp/src/routes/medicine-applications.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/medicine-applications.test.ts`

- [ ] **Step 1: Test**

`seraapp/test/medicine-applications.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setup() {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];
  const s = await (await SELF.fetch("https://example.com/api/seasons", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
  })).json() as any;
  const m = await (await SELF.fetch("https://example.com/api/master/medicines", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Ridomil", unit: "g" }),
  })).json() as any;
  const d = await (await SELF.fetch("https://example.com/api/master/diseases", {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "mildiyö" }),
  })).json() as any;
  return { cookie, seasonId: s.id, medId: m.id, diseaseId: d.id };
}

describe("medicine applications CRUD + stock (-)", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    ctx = await setup();
  });

  it("POST creates application AND minus stock movement", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: ctx.medId, disease_id: ctx.diseaseId,
        quantity_used: 50, target: "kuzey blok",
      }),
    });
    expect(res.status).toBe(201);
    const mov = await env.DB.prepare("SELECT * FROM medicine_stock_movements").all<any>();
    expect(mov.results).toHaveLength(1);
    expect(mov.results[0].delta_qty).toBe(-50);
    expect(mov.results[0].source_type).toBe("application");
  });

  it("DELETE removes application + stock movement", async () => {
    const c = await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: ctx.medId, disease_id: ctx.diseaseId, quantity_used: 50,
      }),
    });
    const id = (await c.json() as any).id;
    await SELF.fetch(`https://example.com/api/medicine-applications/${id}`, {
      method: "DELETE", headers: { cookie: ctx.cookie },
    });
    const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM medicine_stock_movements").first<any>();
    expect(cnt.c).toBe(0);
  });

  it("GET lists for season", async () => {
    await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: ctx.medId, disease_id: ctx.diseaseId, quantity_used: 50,
      }),
    });
    const list = await (await SELF.fetch(`https://example.com/api/medicine-applications?season_id=${ctx.seasonId}`, {
      headers: { cookie: ctx.cookie },
    })).json() as any[];
    expect(list).toHaveLength(1);
  });

  it("rejects unknown medicine_id", async () => {
    const res = await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify({
        season_id: ctx.seasonId, application_date: "2025-10-01",
        medicine_id: 99999, disease_id: ctx.diseaseId, quantity_used: 50,
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Test → FAIL**

- [ ] **Step 3: Route**

`seraapp/src/routes/medicine-applications.ts`:
```typescript
import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const medicineApplicationsRouter = new Hono<AppContext>();
medicineApplicationsRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type MedicineApplication = {
  id: number;
  season_id: number;
  application_date: string;
  medicine_id: number;
  disease_id: number;
  quantity_used: number;
  target: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

async function validateFK(c: any, body: any): Promise<string | null> {
  if (!await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", body.season_id)) return "unknown season_id";
  if (!await one(c.env.DB, "SELECT id FROM medicines WHERE id=?", body.medicine_id)) return "unknown medicine_id";
  if (!await one(c.env.DB, "SELECT id FROM diseases WHERE id=?", body.disease_id)) return "unknown disease_id";
  return null;
}

medicineApplicationsRouter.get("/medicine-applications", async (c) => {
  const seasonId = Number(c.req.query("season_id"));
  if (!seasonId) return c.json({ error: "season_id required" }, 400);
  const rows = await all<MedicineApplication>(
    c.env.DB,
    "SELECT * FROM medicine_applications WHERE season_id=? ORDER BY application_date DESC, id DESC",
    seasonId,
  );
  return c.json(rows);
});

medicineApplicationsRouter.post("/medicine-applications", async (c) => {
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);
  if (typeof body.season_id !== "number") return c.json({ error: "season_id required" }, 400);
  if (!DATE_RE.test(body.application_date ?? "")) return c.json({ error: "valid application_date required" }, 400);
  if (typeof body.medicine_id !== "number") return c.json({ error: "medicine_id required" }, 400);
  if (typeof body.disease_id !== "number") return c.json({ error: "disease_id required" }, 400);
  if (typeof body.quantity_used !== "number" || body.quantity_used <= 0) return c.json({ error: "quantity_used must be > 0" }, 400);
  const fkErr = await validateFK(c, body);
  if (fkErr) return c.json({ error: fkErr }, 400);

  const result = await run(
    c.env.DB,
    `INSERT INTO medicine_applications
      (season_id, application_date, medicine_id, disease_id, quantity_used, target, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    body.season_id, body.application_date, body.medicine_id, body.disease_id,
    body.quantity_used, body.target?.trim() || null, body.notes?.trim() || null,
  );
  const row = await one<MedicineApplication>(c.env.DB, "SELECT * FROM medicine_applications WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

medicineApplicationsRouter.patch("/medicine-applications/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one<MedicineApplication>(c.env.DB, "SELECT * FROM medicine_applications WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => null) as any;
  if (!body) return c.json({ error: "body required" }, 400);

  const updates: Record<string, unknown> = {};
  if (DATE_RE.test(body.application_date ?? "")) updates.application_date = body.application_date;
  if (typeof body.quantity_used === "number" && body.quantity_used > 0) updates.quantity_used = body.quantity_used;
  if (typeof body.target === "string") updates.target = body.target.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map(k => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE medicine_applications SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<MedicineApplication>(c.env.DB, "SELECT * FROM medicine_applications WHERE id=?", id);
  return c.json(row);
});

medicineApplicationsRouter.delete("/medicine-applications/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM medicine_applications WHERE id=?", id);
  return new Response(null, { status: 204 });
});
```

- [ ] **Step 4: Mount + test + commit**

```typescript
import { medicineApplicationsRouter } from "./routes/medicine-applications";
app.route("/api", medicineApplicationsRouter);
```

```bash
npm test -- medicine-applications && npm test 2>&1 | tail -5
git add seraapp/src/routes/medicine-applications.ts seraapp/src/index.ts seraapp/test/medicine-applications.test.ts
git commit -m "feat(medicines): add application CRUD (auto-tracks stock via triggers)"
```

Expected: 4/4 + 67/67.

---

## Task 11: Stock balance endpoint'leri

**Files:**
- Create: `seraapp/src/routes/stock.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/stock.test.ts`

- [ ] **Step 1: Test**

`seraapp/test/stock.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function setupAndLogin() {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const loginRes = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  return loginRes.headers.get("set-cookie")!.split(";")[0];
}

describe("GET /api/stock/supplies", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await setupAndLogin();
  });

  it("returns balance per supply category", async () => {
    const s = await (await SELF.fetch("https://example.com/api/seasons", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
    })).json() as any;
    const cat = await (await SELF.fetch("https://example.com/api/master/supplies", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "kömür", unit: "kg" }),
    })).json() as any;
    await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, purchase_date: "2025-09-15",
        supply_category_id: cat.id, quantity: 100, unit: "kg",
        unit_cost: 5, total_cost: 500,
      }),
    });
    await SELF.fetch("https://example.com/api/supply-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, purchase_date: "2025-10-15",
        supply_category_id: cat.id, quantity: 50, unit: "kg",
        unit_cost: 5, total_cost: 250,
      }),
    });
    const res = await SELF.fetch("https://example.com/api/stock/supplies", { headers: { cookie } });
    expect(res.status).toBe(200);
    const list = await res.json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].supply_category_id).toBe(cat.id);
    expect(list[0].balance).toBe(150);
    expect(list[0].name).toBe("kömür");
  });

  it("returns empty when no movements", async () => {
    const res = await SELF.fetch("https://example.com/api/stock/supplies", { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("GET /api/stock/medicines", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await setupAndLogin();
  });

  it("reflects purchase + application", async () => {
    const s = await (await SELF.fetch("https://example.com/api/seasons", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "S1", start_date: "2025-09-01", end_date: "2026-08-31" }),
    })).json() as any;
    const m = await (await SELF.fetch("https://example.com/api/master/medicines", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Ridomil", unit: "g" }),
    })).json() as any;
    const d = await (await SELF.fetch("https://example.com/api/master/diseases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "mildiyö" }),
    })).json() as any;

    await SELF.fetch("https://example.com/api/medicine-purchases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, purchase_date: "2025-09-15",
        medicine_id: m.id, quantity: 500, unit: "g",
        unit_cost: 0.4, total_cost: 200,
      }),
    });
    await SELF.fetch("https://example.com/api/medicine-applications", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        season_id: s.id, application_date: "2025-10-01",
        medicine_id: m.id, disease_id: d.id, quantity_used: 120,
      }),
    });

    const res = await SELF.fetch("https://example.com/api/stock/medicines", { headers: { cookie } });
    const list = await res.json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].balance).toBe(380);
    expect(list[0].name).toBe("Ridomil");
  });
});
```

- [ ] **Step 2: Test → FAIL**

- [ ] **Step 3: Route**

`seraapp/src/routes/stock.ts`:
```typescript
import { Hono } from "hono";
import { all } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const stockRouter = new Hono<AppContext>();
stockRouter.use("*", requireAuth);

stockRouter.get("/stock/supplies", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT sc.id AS supply_category_id, sc.name, sc.unit,
            COALESCE(SUM(m.delta_qty), 0) AS balance
       FROM supply_categories sc
       JOIN supply_stock_movements m ON m.supply_category_id = sc.id
   GROUP BY sc.id
   ORDER BY sc.name ASC`,
  );
  return c.json(rows);
});

stockRouter.get("/stock/medicines", async (c) => {
  const rows = await all(
    c.env.DB,
    `SELECT med.id AS medicine_id, med.name, med.unit,
            COALESCE(SUM(m.delta_qty), 0) AS balance
       FROM medicines med
       JOIN medicine_stock_movements m ON m.medicine_id = med.id
   GROUP BY med.id
   ORDER BY med.name ASC`,
  );
  return c.json(rows);
});
```

- [ ] **Step 4: Mount + test + commit**

```typescript
import { stockRouter } from "./routes/stock";
app.route("/api", stockRouter);
```

```bash
npm test -- stock && npm test 2>&1 | tail -5
git add seraapp/src/routes/stock.ts seraapp/src/index.ts seraapp/test/stock.test.ts
git commit -m "feat(stock): add supply + medicine balance endpoints"
```

Expected: 3/3 + 70/70.

---

## Task 12: Frontend — Alım sekmesi shell (3 alt-tab navigasyon)

**Files:**
- Modify: `seraapp/public/app.js`

Mevcut `renderTabContent` Alım/Hareket/Satış/Ortak sekmeleri için "Bu modül sonraki fazlarda gelecek" placeholder gösteriyor. Bu task Alım sekmesini gerçek render eder; Hareket Task 16'da.

- [ ] **Step 1: state'e Alım alt-tab durumu ekle**

`app.js`'te `state` block'undan sonra:
```javascript
state.alimSubTab = state.alimSubTab || "fidan";
state.hareketSubTab = state.hareketSubTab || "ilac";
```

- [ ] **Step 2: `renderTabContent` güncelle**

```javascript
function renderTabContent() {
  const c = document.getElementById("content");
  if (!state.activeSeason && state.activeTab !== "pano") {
    c.innerHTML = `<div class="card"><div class="empty">Önce ayarlardan bir sezon oluştur ve aktif et.</div></div>`;
    return;
  }
  if (state.activeTab === "pano") {
    c.innerHTML = `<div class="card"><h2>Pano</h2><div class="empty">Sonraki fazlarda dolacak.</div></div>`;
  } else if (state.activeTab === "alim") {
    renderAlimTab(c);
  } else if (state.activeTab === "hareket") {
    renderHareketTab(c);
  } else {
    c.innerHTML = `<div class="card"><h2>${escape(TABS.find(t=>t.key===state.activeTab).label)}</h2><div class="empty">Bu modül sonraki fazlarda gelecek.</div></div>`;
  }
}
```

- [ ] **Step 3: `renderAlimTab` shell ekle**

```javascript
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
```

- [ ] **Step 4: Placeholder renderer'lar (Task 13-15'te dolacak)**

```javascript
async function renderFidanAlim(body) { body.innerHTML = `<div class="card"><div class="empty">Fidan UI (Task 13)</div></div>`; }
async function renderSarfAlim(body) { body.innerHTML = `<div class="card"><div class="empty">Sarf UI (Task 14)</div></div>`; }
async function renderIlacAlim(body) { body.innerHTML = `<div class="card"><div class="empty">İlaç UI (Task 15)</div></div>`; }
async function renderHareketTab(container) { container.innerHTML = `<div class="card"><div class="empty">İlaç uygulamaları UI (Task 16)</div></div>`; }
```

- [ ] **Step 5: node --check + test + commit**

```bash
node --check seraapp/public/app.js
cd seraapp && npm test 2>&1 | tail -5
git add seraapp/public/app.js
git commit -m "feat(frontend): scaffold Alım & Hareket tabs"
```

Expected: 70/70 PASS.

---

## Task 13: Frontend — Fidan alım UI

**Files:**
- Modify: `seraapp/public/app.js`

Replace `renderFidanAlim` body with full UI. Pattern:
- Form: tarih (default bugün) + tür select + cins select (türe bağlı filtreli) + adet + birim maliyet + (otomatik hesaplanan) toplam + tedarikçi (ops.) + notlar (ops.).
- Liste: aktif sezona ait fidan alımları, kart kart, satır başında "tarih · tür/cins · adet × birim maliyet = toplam", Sil butonu.

```javascript
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
      ${list.length === 0 ? `<div class="empty">Henüz alım yok.</div>` :
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

  // qty * unit -> total auto
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
```

- [ ] **Step 1: Yukarıdaki kodla `renderFidanAlim` placeholder'ını değiştir**

- [ ] **Step 2: node --check + commit**

```bash
node --check seraapp/public/app.js
git add seraapp/public/app.js
git commit -m "feat(frontend): fidan alım UI"
```

---

## Task 14: Frontend — Sarf alım UI + stok özeti

**Files:**
- Modify: `seraapp/public/app.js`

```javascript
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
      ${list.length === 0 ? `<div class="empty">Henüz alım yok.</div>` :
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
```

- [ ] **Step 1: `renderSarfAlim` placeholder'ını değiştir**

- [ ] **Step 2: node --check + commit**

```bash
node --check seraapp/public/app.js
git add seraapp/public/app.js
git commit -m "feat(frontend): sarf alım UI + stock summary"
```

---

## Task 15: Frontend — İlaç alım UI + stok özeti

**Files:**
- Modify: `seraapp/public/app.js`

```javascript
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
      ${list.length === 0 ? `<div class="empty">Henüz alım yok.</div>` :
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
```

- [ ] **Step 1: `renderIlacAlim` placeholder'ını değiştir**

- [ ] **Step 2: node --check + commit**

```bash
node --check seraapp/public/app.js
git add seraapp/public/app.js
git commit -m "feat(frontend): ilaç alım UI + stock summary"
```

---

## Task 16: Frontend — Hareket sekmesi: İlaç uygulaması UI

**Files:**
- Modify: `seraapp/public/app.js`

Hareket sekmesi şimdilik tek alt-sekme (İlaç uygulaması). Tüketim Faz 3'te eklenecek.

```javascript
async function renderHareketTab(container) {
  // Şimdilik tek alt-sekme; Faz 3'te "Tüketim" eklenecek
  container.innerHTML = `<div id="hareketBody"></div>`;
  const body = document.getElementById("hareketBody");
  await renderIlacUygulama(body);
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
      ${list.length === 0 ? `<div class="empty">Henüz uygulama yok.</div>` :
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
```

- [ ] **Step 1: `renderHareketTab` placeholder'ını ve `renderIlacUygulama`'yı ekle**

- [ ] **Step 2: node --check + commit**

```bash
node --check seraapp/public/app.js
git add seraapp/public/app.js
git commit -m "feat(frontend): ilaç uygulama UI under Hareket tab"
```

---

## Task 17: Production deploy + smoke + final regression

- [ ] **Step 1: Full suite final**

```bash
cd seraapp && npm test 2>&1 | tail -10
```

Expected: 70/70 PASS.

- [ ] **Step 2: Production migration**

```bash
npm run migrate:remote
```

Expected: 3 migration applied (0004, 0005, 0006).

- [ ] **Step 3: Deploy**

```bash
npm run deploy
```

- [ ] **Step 4: Smoke test (tarayıcı)**

1. Aktif sezon olduğundan emin ol
2. Ayarlar > Tür/Cins'te en az bir tür + cins ekle (yoksa)
3. Ayarlar > Sarf'ta en az bir sarf kategorisi ekle
4. Ayarlar > İlaç/Hastalık'ta bir ilaç + hastalık + eşleme ekle
5. Alım > Fidan: bir fidan alımı ekle, listede görün, sil
6. Alım > Sarf: bir sarf alımı ekle, "stok durumu" kartında miktar görünür, sil → stok 0
7. Alım > İlaç: bir ilaç alımı ekle, stok artar
8. Hareket: ilaç uygulaması ekle, ilaç stoğu azalır

- [ ] **Step 5: PR güncelle (Faz 0+1 PR'a Faz 2 commit'leri eklendi mi yoksa ayrı PR mı?)**

Eğer Faz 0+1 PR henüz merge olmadıysa: yeni PR'ı `feat/seraapp-faz-2 → feat/seraapp-faz-0-1` olarak aç. Aksi takdirde `feat/seraapp-faz-2 → main`.

```bash
gh pr create --base feat/seraapp-faz-0-1 --head feat/seraapp-faz-2 \
  --title "feat(seraapp): Faz 2 — Modül 1-3 alımlar + stok + UI" \
  --body "Modül 1 (fidan alımı), Modül 2 (sarf + stok), Modül 3 (ilaç alım/uygulama + stok). Alım & Hareket sekmesi UI'ları. Faz 0+1 follow-up'ları (setup-status endpoint, parseCookie hoist). Tests: 70/70."
```

---

## Faz 2 tamamlandı

Bu noktada:
- Modül 1-3 tam fonksiyonel (alım + stok + uygulama)
- Stok hareketleri trigger ile tutarlı
- Alım/Hareket sekmeleri çalışıyor
- 70 vitest geçiyor
- Faz 0+1 follow-up'ları kapandı

**Sonraki faz:** Faz 3 (Modül 4 — tüketim + aylık rapor). Tetiklemek için: "Faz 3 planını yaz".
