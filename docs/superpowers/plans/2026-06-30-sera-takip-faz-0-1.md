# Sera Takip — Faz 0+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloudflare Pages + Workers + D1 üzerinde tek-kullanıcılı, sezon ve master data yönetebilen, login olunabilen sera takip uygulamasının altyapısını kur. Modül 1-6 hareket tabloları sonraki planlarda eklenecek.

**Architecture:** `seraapp/` altında ayrı bir proje. Worker (Hono router + D1 + KV) backend, vanilla JS static frontend Workers Assets ile aynı Worker'dan servis edilir (same-origin, CORS yok). Tüm `/api/*` rotalar JSON; korumalı olanlar cookie-based session ile geçer. Tüm hareketler sezon bazlı; mutabakat ve raporlar sezon scoped.

**Tech Stack:**
- Backend: Cloudflare Worker, Hono 4, TypeScript, D1 (SQLite), KV
- Auth: PBKDF2 + Web Crypto API + KV-saklı session token
- Test: vitest + `@cloudflare/vitest-pool-workers`
- Frontend: vanilla JS, mobile-first CSS, Chart.js CDN
- Deployment: `wrangler deploy` (Workers Assets, same-origin)

**Spec:** `docs/superpowers/specs/2026-06-30-sera-takip-design.md`

**Sonraki planlar (bu plan tamamlandıktan sonra):**
- Faz 2: Modül 1-3 (fidan/sarf/ilaç alımları + stok hareketleri)
- Faz 3: Modül 4 (tüketim + aylık rapor)
- Faz 4: Modül 5-6 (satış + piyasa snapshot + ortak mutabakat)
- Faz 5: Cila (grafikler, modaller, edge case'ler)

---

## File Structure

```
Financial-tracking/                         # mevcut, dokunulmuyor (portföy app)
├── index.html                              # mevcut portföy uygulaması
├── README.md
├── CLAUDE_CODE_BRIEF.md
├── docs/superpowers/                       # spec + planlar
└── seraapp/                                # YENİ: sera takip projesi
    ├── README.md                           # kurulum + deploy talimatı
    ├── package.json
    ├── tsconfig.json
    ├── wrangler.toml
    ├── vitest.config.ts
    ├── src/                                # worker kaynak kodu
    │   ├── index.ts                        # Hono app + healthcheck + route mount
    │   ├── types.ts                        # ortak TS tipleri (Env, Session, vb.)
    │   ├── db.ts                           # D1 prepared statement helper'ları
    │   ├── auth.ts                         # PBKDF2 hash/verify + session yönetimi
    │   ├── middleware.ts                   # auth middleware
    │   └── routes/
    │       ├── setup.ts                    # POST /api/setup (ilk parola)
    │       ├── auth.ts                     # /api/auth/login,logout,change-password
    │       ├── seasons.ts                  # /api/seasons CRUD + activate
    │       └── master.ts                   # /api/master/* generic CRUD
    ├── migrations/
    │   ├── 0001_init.sql                   # app_config + seasons
    │   ├── 0002_master.sql                 # tüm master tabloları
    │   └── 0003_seed.sql                   # minimal seed master data
    ├── test/
    │   ├── helpers.ts                      # test setup, migration runner
    │   ├── auth.test.ts
    │   ├── seasons.test.ts
    │   └── master.test.ts
    └── public/                             # static frontend (Workers Assets)
        ├── index.html                      # uygulama kabuk
        ├── app.js                          # SPA mantığı + sayfa render
        └── styles.css                      # mobile-first stiller
```

**Sorumluluk ayrımı:**
- `src/index.ts`: Hono app, healthcheck, route mount, hata yakalama. Mantık yok.
- `src/db.ts`: D1 helper'ları (`one`, `all`, `run`); tek doğruluk kaynağı SQL erişimi.
- `src/auth.ts`: PBKDF2 ve session işlemleri; cookie I/O.
- `src/middleware.ts`: Hono middleware; cookie → KV → ctx; yoksa 401.
- `src/routes/*`: her dosya tek sorumluluk; route handler'lar + input validation.
- `src/routes/master.ts`: tek dosyada tüm master tabloları için generic CRUD (DRY); her tablo için config.
- `public/app.js`: tek SPA dosyası; sayfalar fonksiyonlardan render edilir.

---

## Kurulum öncesi (kullanıcı tarafı)

Bu plan başlamadan önce kullanıcının yapması gereken manuel adımlar:
1. Cloudflare hesabı (varsa atla)
2. `wrangler` CLI: `npm i -g wrangler` (veya proje-içi `npx`)
3. `wrangler login`
4. D1 database ve KV namespace bu plan içinde komutla oluşturulacak

---

## Task 1: Proje iskeleti ve klasör yapısı

**Files:**
- Create: `seraapp/.gitignore`
- Create: `seraapp/README.md`

- [ ] **Step 1: Klasör yapısını oluştur**

```bash
mkdir -p seraapp/{src/routes,migrations,test,public}
```

- [ ] **Step 2: `.gitignore` yaz**

`seraapp/.gitignore`:
```
node_modules/
.wrangler/
.dev.vars
dist/
*.log
.env
.env.local
```

- [ ] **Step 3: Boş README placeholder**

`seraapp/README.md`:
```markdown
# Sera Takip Uygulaması

Cloudflare Pages + Workers + D1 üzerinde, mobil-first sera takip aracı.

Spec: `../docs/superpowers/specs/2026-06-30-sera-takip-design.md`

## Kurulum
Tamamlanacak (Task 2-3 sonrası).
```

- [ ] **Step 4: Commit**

```bash
git add seraapp/
git commit -m "chore: scaffold seraapp directory"
```

---

## Task 2: Worker proje yapılandırması (package.json, tsconfig, wrangler.toml)

**Files:**
- Create: `seraapp/package.json`
- Create: `seraapp/tsconfig.json`
- Create: `seraapp/wrangler.toml`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "seraapp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate:local": "wrangler d1 migrations apply seraapp --local",
    "migrate:remote": "wrangler d1 migrations apply seraapp --remote"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.6.0",
    "vitest": "~1.5.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*", "test/**/*", "vitest.config.ts"]
}
```

- [ ] **Step 3: `wrangler.toml` (placeholder ID'ler — Task 3'te dolduracağız)**

```toml
name = "seraapp"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[assets]
directory = "./public"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "seraapp"
database_id = "PLACEHOLDER_FILL_AFTER_CREATE"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "SESSIONS"
id = "PLACEHOLDER_FILL_AFTER_CREATE"
```

- [ ] **Step 4: Bağımlılıkları kur**

```bash
cd seraapp && npm install
```

Expected: `node_modules/` oluşur, hata yok.

- [ ] **Step 5: Commit**

```bash
git add seraapp/package.json seraapp/package-lock.json seraapp/tsconfig.json seraapp/wrangler.toml
git commit -m "chore: add seraapp worker config and dependencies"
```

---

## Task 3: D1 ve KV namespace oluşturma + wrangler.toml güncelleme

**Files:**
- Modify: `seraapp/wrangler.toml`
- Create: `seraapp/.dev.vars` (gitignored)

- [ ] **Step 1: D1 database oluştur**

```bash
cd seraapp && npx wrangler d1 create seraapp
```

Expected: `database_id = "xxxxxxx-xxxx-..."` yazısı çıkar. Bu ID'yi kopyala.

- [ ] **Step 2: KV namespace oluştur**

```bash
npx wrangler kv namespace create SESSIONS
```

Expected: `id = "yyyyyyy"` çıkar. Bu ID'yi kopyala.

- [ ] **Step 3: `wrangler.toml`'da PLACEHOLDER'ları değiştir**

`database_id = "PLACEHOLDER_FILL_AFTER_CREATE"` → gerçek D1 ID
`id = "PLACEHOLDER_FILL_AFTER_CREATE"` (KV altında) → gerçek KV ID

- [ ] **Step 4: `.dev.vars` (lokal development için)**

```
# (henüz secret yok; ileride eklenecek)
```

- [ ] **Step 5: Commit**

```bash
git add seraapp/wrangler.toml
git commit -m "chore: bind D1 and KV in wrangler config"
```

---

## Task 4: vitest yapılandırması + test helper iskelet

**Files:**
- Create: `seraapp/vitest.config.ts`
- Create: `seraapp/test/helpers.ts`
- Create: `seraapp/src/types.ts`

- [ ] **Step 1: `vitest.config.ts`**

```typescript
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          d1Databases: ["DB"],
          kvNamespaces: ["SESSIONS"],
        },
      },
    },
  },
});
```

- [ ] **Step 2: `src/types.ts` (ortak tipler)**

```typescript
export type Env = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  ASSETS: Fetcher;
};

export type SessionPayload = {
  userId: "owner"; // tek kullanıcı
  createdAt: number;
};

export type AppContext = {
  Bindings: Env;
  Variables: {
    session?: SessionPayload;
  };
};
```

- [ ] **Step 3: `test/helpers.ts`**

```typescript
import { env } from "cloudflare:test";
import type { Env } from "../src/types";

export function testEnv(): Env {
  return env as unknown as Env;
}

// Test başında D1'i sıfırla ve migration'ları çalıştır
export async function resetDb() {
  const db = testEnv().DB;
  const tables = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%'")
    .all<{ name: string }>();
  for (const { name } of tables.results) {
    await db.prepare(`DROP TABLE IF EXISTS ${name}`).run();
  }
}

export async function clearKV() {
  const kv = testEnv().SESSIONS;
  const list = await kv.list();
  await Promise.all(list.keys.map((k) => kv.delete(k.name)));
}
```

- [ ] **Step 4: Commit**

```bash
git add seraapp/vitest.config.ts seraapp/src/types.ts seraapp/test/helpers.ts
git commit -m "chore: add vitest config and shared types"
```

---

## Task 5: İlk migration — `app_config` + `seasons`

**Files:**
- Create: `seraapp/migrations/0001_init.sql`

- [ ] **Step 1: Migration dosyası yaz**

`seraapp/migrations/0001_init.sql`:
```sql
-- Tek satırlık yapılandırma (parola hash vb.)
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Sezonlar
CREATE TABLE seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,        -- 'YYYY-MM-DD'
  end_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  partner_share_pct REAL NOT NULL DEFAULT 25,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tek bir aktif sezon zorunluluğu (unique partial index)
CREATE UNIQUE INDEX idx_seasons_only_one_active ON seasons(is_active) WHERE is_active = 1;
```

- [ ] **Step 2: Migration'ı lokal D1'e uygula**

```bash
cd seraapp && npm run migrate:local
```

Expected: "Migrations applied" mesajı, hatasız.

- [ ] **Step 3: Commit**

```bash
git add seraapp/migrations/0001_init.sql
git commit -m "feat(db): init schema with app_config and seasons"
```

---

## Task 6: Worker entry + healthcheck endpoint

**Files:**
- Create: `seraapp/src/index.ts`
- Create: `seraapp/test/health.test.ts`

- [ ] **Step 1: `test/health.test.ts` (failing test)**

```typescript
import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("healthcheck", () => {
  it("GET /api/health returns ok", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Test'i çalıştır → FAIL**

```bash
cd seraapp && npm test -- health
```

Expected: FAIL ("Cannot find module ../src/index" veya 404).

- [ ] **Step 3: `src/index.ts` minimal Hono uygulaması**

```typescript
import { Hono } from "hono";
import type { AppContext } from "./types";

const app = new Hono<AppContext>();

app.get("/api/health", (c) => c.json({ ok: true }));

// Fallback: statik dosyalar
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
```

- [ ] **Step 4: Test'i çalıştır → PASS**

```bash
npm test -- health
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add seraapp/src/index.ts seraapp/test/health.test.ts
git commit -m "feat(worker): add Hono entry with healthcheck"
```

---

## Task 7: Auth helper — PBKDF2 hash & verify

**Files:**
- Create: `seraapp/src/auth.ts`
- Create: `seraapp/test/auth.test.ts`

- [ ] **Step 1: `test/auth.test.ts` (failing tests)**

```typescript
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth";

describe("password hashing", () => {
  it("hashPassword returns a string in pbkdf2 format", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).toMatch(/^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("verifyPassword returns true for correct password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("two hashes of same password differ (salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});
```

- [ ] **Step 2: Test'i çalıştır → FAIL**

```bash
npm test -- auth
```

Expected: FAIL ("Cannot find module ../src/auth").

- [ ] **Step 3: `src/auth.ts` (sadece hash/verify; session sonra)**

```typescript
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number, bytes: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    bytes * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS, HASH_BYTES);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64encode(salt.buffer)}$${b64encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  const salt = b64decode(parts[2]);
  const expected = b64decode(parts[3]);
  const computed = new Uint8Array(await pbkdf2(password, salt, iterations, expected.length));
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed[i] ^ expected[i];
  return diff === 0;
}
```

- [ ] **Step 4: Test'i çalıştır → PASS**

```bash
npm test -- auth
```

Expected: 4 test PASS.

- [ ] **Step 5: Commit**

```bash
git add seraapp/src/auth.ts seraapp/test/auth.test.ts
git commit -m "feat(auth): add PBKDF2 password hashing"
```

---

## Task 8: Session helper (KV)

**Files:**
- Modify: `seraapp/src/auth.ts`
- Modify: `seraapp/test/auth.test.ts`

- [ ] **Step 1: `test/auth.test.ts` üstüne session testleri ekle**

Bu blok mevcut testlerin altına eklenir:
```typescript
import { createSession, getSession, deleteSession } from "../src/auth";
import { testEnv, clearKV } from "./helpers";
import { beforeEach } from "vitest";

describe("session", () => {
  beforeEach(async () => {
    await clearKV();
  });

  it("createSession returns token and writes to KV", async () => {
    const token = await createSession(testEnv());
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const stored = await testEnv().SESSIONS.get(`sess:${token}`);
    expect(stored).not.toBeNull();
  });

  it("getSession returns payload for valid token", async () => {
    const token = await createSession(testEnv());
    const payload = await getSession(testEnv(), token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("owner");
  });

  it("getSession returns null for unknown token", async () => {
    const payload = await getSession(testEnv(), "nonexistent");
    expect(payload).toBeNull();
  });

  it("deleteSession removes the session", async () => {
    const token = await createSession(testEnv());
    await deleteSession(testEnv(), token);
    expect(await getSession(testEnv(), token)).toBeNull();
  });
});
```

- [ ] **Step 2: Test'i çalıştır → FAIL**

```bash
npm test -- auth
```

Expected: session testleri FAIL ("createSession is not defined").

- [ ] **Step 3: `src/auth.ts` sonuna session fonksiyonlarını ekle**

```typescript
import type { Env, SessionPayload } from "./types";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 gün

function randomToken(): string {
  const buf = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createSession(env: Env): Promise<string> {
  const token = randomToken();
  const payload: SessionPayload = { userId: "owner", createdAt: Date.now() };
  await env.SESSIONS.put(`sess:${token}`, JSON.stringify(payload), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function getSession(env: Env, token: string): Promise<SessionPayload | null> {
  const raw = await env.SESSIONS.get(`sess:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteSession(env: Env, token: string): Promise<void> {
  await env.SESSIONS.delete(`sess:${token}`);
}
```

- [ ] **Step 4: Test'i çalıştır → PASS**

```bash
npm test -- auth
```

Expected: 8 test PASS.

- [ ] **Step 5: Commit**

```bash
git add seraapp/src/auth.ts seraapp/test/auth.test.ts
git commit -m "feat(auth): add KV-backed sessions"
```

---

## Task 9: Setup endpoint — ilk parola

**Files:**
- Create: `seraapp/src/routes/setup.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/setup.test.ts`

- [ ] **Step 1: `test/setup.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb } from "./helpers";

async function applyInitMigration() {
  // Migration zaten miniflare tarafından uygulanmış; gerekirse re-apply için
  // miniflare config'inde `migrations` ile çözülecek. Burada sadece sıfırlama.
}

describe("POST /api/setup", () => {
  beforeEach(async () => {
    await resetDb();
    await applyInitMigration();
    // Migration'ları manuel re-apply için raw SQL çalıştır:
    await env.DB.prepare(`CREATE TABLE app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`).run();
  });

  it("first call accepts password and stores hash", async () => {
    const res = await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT value FROM app_config WHERE key='password_hash'")
      .first<{ value: string }>();
    expect(row?.value).toMatch(/^pbkdf2\$/);
  });

  it("second call (when already set) returns 409", async () => {
    await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "first" }),
    });
    const res = await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "second" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects empty password", async () => {
    const res = await SELF.fetch("https://example.com/api/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "" }),
    });
    expect(res.status).toBe(400);
  });
});
```

> **Not:** `test/helpers.ts`'a `resetDb` ve migration replay desteği için ek helper gerekirse Step 2'de eklenir. Bu Task'ta minimum şema raw SQL ile kuruluyor.

- [ ] **Step 2: Test'i çalıştır → FAIL**

```bash
npm test -- setup
```

Expected: FAIL ("Cannot find module ../src/routes/setup" veya 404).

- [ ] **Step 3: `src/routes/setup.ts`**

```typescript
import { Hono } from "hono";
import { hashPassword } from "../auth";
import type { AppContext } from "../types";

export const setupRouter = new Hono<AppContext>();

setupRouter.post("/setup", async (c) => {
  const body = await c.req.json().catch(() => null) as { password?: string } | null;
  if (!body || typeof body.password !== "string" || body.password.length < 1) {
    return c.json({ error: "password required" }, 400);
  }

  const existing = await c.env.DB
    .prepare("SELECT value FROM app_config WHERE key = 'password_hash'")
    .first<{ value: string }>();
  if (existing) {
    return c.json({ error: "already initialized" }, 409);
  }

  const hash = await hashPassword(body.password);
  await c.env.DB
    .prepare("INSERT INTO app_config (key, value) VALUES ('password_hash', ?)")
    .bind(hash)
    .run();

  return c.json({ ok: true });
});
```

- [ ] **Step 4: `src/index.ts`'te router'ı mount et**

```typescript
import { Hono } from "hono";
import type { AppContext } from "./types";
import { setupRouter } from "./routes/setup";

const app = new Hono<AppContext>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", setupRouter);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
```

- [ ] **Step 5: Test'i çalıştır → PASS**

```bash
npm test -- setup
```

Expected: 3 test PASS.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/routes/setup.ts seraapp/src/index.ts seraapp/test/setup.test.ts
git commit -m "feat(auth): add /api/setup for initial password"
```

---

## Task 10: Migration replay helper (test'lerde D1 şeması)

**Files:**
- Modify: `seraapp/test/helpers.ts`

> **Not:** Task 9'da test'te raw SQL ile şema kurduk. Şimdi tüm testlerin migration'ları okuyup uygulamasını sağlayacak helper yazıyoruz; ileri task'ların hayatını kolaylaştırır.

- [ ] **Step 1: `helpers.ts`'a migration replay fonksiyonu ekle**

`test/helpers.ts` aşağıdaki gibi olur (mevcutun üzerine ekleme):
```typescript
import { env, applyD1Migrations } from "cloudflare:test";
import type { Env } from "../src/types";

export function testEnv(): Env {
  return env as unknown as Env;
}

export async function resetDb() {
  const db = testEnv().DB;
  const tables = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%'")
    .all<{ name: string }>();
  for (const { name } of tables.results) {
    await db.prepare(`DROP TABLE IF EXISTS ${name}`).run();
  }
}

export async function clearKV() {
  const kv = testEnv().SESSIONS;
  const list = await kv.list();
  await Promise.all(list.keys.map((k) => kv.delete(k.name)));
}

export async function migrate() {
  // Cloudflare's vitest helper for replaying configured migrations
  await applyD1Migrations(testEnv().DB, env.TEST_MIGRATIONS as any);
}
```

> Eğer `applyD1Migrations` veya `TEST_MIGRATIONS` binding henüz hazır değilse, alternatif: `migrations/*.sql` dosyalarını manuel okuyup çalıştıran bir fonksiyon yaz. Cloudflare vitest pool, `wrangler.toml`'daki `migrations_dir` ayarını test sırasında otomatik uygular; bu durumda `migrate()` no-op olur ve `resetDb` + yeniden migrate yerine sadece `resetDb` yetmez. Pratik çözüm: `test/helpers.ts` içinde migration SQL'lerini doğrudan oku ve çalıştır:

```typescript
import fs from "node:fs/promises";
import path from "node:path";

export async function migrate() {
  const dir = path.join(__dirname, "..", "migrations");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = await fs.readFile(path.join(dir, f), "utf8");
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await testEnv().DB.prepare(stmt).run();
    }
  }
}
```

> Worker pool'da `fs` yok; bu helper test runner tarafında çalışır. Vitest config'inde `experimentalVmThreadsPool` yerine standart node runner gerekirse, `helpers.ts`'i sadece test setup için tut.

> **Pragmatik çözüm**: vitest-pool-workers `applyD1Migrations` desteklediği için, doğrudan onu kullanırız. Yukarıdaki `migrate()` fonksiyonu bunu yapar; helper'a sadece bunu koy.

`test/helpers.ts` (final hali):
```typescript
import { env, applyD1Migrations } from "cloudflare:test";
import type { Env } from "../src/types";

export function testEnv(): Env {
  return env as unknown as Env;
}

export async function resetDb() {
  const db = testEnv().DB;
  const tables = await db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%'")
    .all<{ name: string }>();
  for (const { name } of tables.results) {
    await db.prepare(`DROP TABLE IF EXISTS ${name}`).run();
  }
}

export async function clearKV() {
  const kv = testEnv().SESSIONS;
  const list = await kv.list();
  await Promise.all(list.keys.map((k) => kv.delete(k.name)));
}

export async function migrate() {
  await applyD1Migrations(testEnv().DB, env.MIGRATIONS as any);
}
```

- [ ] **Step 2: `wrangler.toml`'a test migrations binding ekle**

```toml
# wrangler.toml'a şu ekle:
[[test.d1_databases]]
binding = "MIGRATIONS"
database_name = "seraapp"
database_id = "<aynı D1 ID>"
migrations_dir = "migrations"
```

> Eğer `vitest-pool-workers` `migrations_dir`'i otomatik tanırsa bu adım gereksizdir. Pratik test: Task 11'de setup testini `migrate()` kullanarak çalıştır ve gözle.

- [ ] **Step 3: Commit**

```bash
git add seraapp/test/helpers.ts seraapp/wrangler.toml
git commit -m "test: add migration replay helper"
```

---

## Task 11: Login endpoint + Set-Cookie

**Files:**
- Create: `seraapp/src/routes/auth.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/login.test.ts`

- [ ] **Step 1: `test/login.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await resetDb();
    await clearKV();
    await migrate();
    const hash = await hashPassword("hunter2");
    await env.DB
      .prepare("INSERT INTO app_config (key, value) VALUES ('password_hash', ?)")
      .bind(hash)
      .run();
  });

  it("correct password returns 200 + Set-Cookie", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/sera_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("wrong password returns 401", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("missing password returns 400", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("login before setup returns 401", async () => {
    await env.DB.prepare("DELETE FROM app_config WHERE key='password_hash'").run();
    const res = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "anything" }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- login
```

Expected: FAIL ("Cannot find module ../src/routes/auth").

- [ ] **Step 3: `src/routes/auth.ts`**

```typescript
import { Hono } from "hono";
import { verifyPassword, createSession } from "../auth";
import type { AppContext } from "../types";

export const authRouter = new Hono<AppContext>();

const COOKIE_NAME = "sera_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function buildCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

authRouter.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => null) as { password?: string } | null;
  if (!body || typeof body.password !== "string") {
    return c.json({ error: "password required" }, 400);
  }

  const row = await c.env.DB
    .prepare("SELECT value FROM app_config WHERE key='password_hash'")
    .first<{ value: string }>();
  if (!row) return c.json({ error: "not initialized" }, 401);

  const ok = await verifyPassword(body.password, row.value);
  if (!ok) return c.json({ error: "invalid credentials" }, 401);

  const token = await createSession(c.env);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": buildCookie(token),
    },
  });
});
```

- [ ] **Step 4: `src/index.ts`'a mount**

```typescript
// import ekle:
import { authRouter } from "./routes/auth";

// route mount sırasına ekle:
app.route("/api", authRouter);
```

- [ ] **Step 5: Test → PASS**

```bash
npm test -- login
```

Expected: 4 test PASS.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/routes/auth.ts seraapp/src/index.ts seraapp/test/login.test.ts
git commit -m "feat(auth): add /api/auth/login with cookie session"
```

---

## Task 12: Auth middleware + korumalı rota örneği

**Files:**
- Create: `seraapp/src/middleware.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/middleware.test.ts`

- [ ] **Step 1: `test/middleware.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function login(password = "hunter2"): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = res.headers.get("set-cookie")!;
  return cookie.split(";")[0]; // "sera_session=..."
}

describe("auth middleware", () => {
  beforeEach(async () => {
    await resetDb();
    await clearKV();
    await migrate();
    const hash = await hashPassword("hunter2");
    await env.DB.prepare("INSERT INTO app_config (key,value) VALUES ('password_hash',?)").bind(hash).run();
  });

  it("protected route without cookie returns 401", async () => {
    const res = await SELF.fetch("https://example.com/api/me");
    expect(res.status).toBe(401);
  });

  it("protected route with valid cookie returns 200", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/me", {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "owner" });
  });

  it("protected route with invalid cookie returns 401", async () => {
    const res = await SELF.fetch("https://example.com/api/me", {
      headers: { cookie: "sera_session=bogus" },
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- middleware
```

Expected: FAIL.

- [ ] **Step 3: `src/middleware.ts`**

```typescript
import type { Context, Next } from "hono";
import { getSession } from "./auth";
import type { AppContext } from "./types";

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v;
  }
  return null;
}

export async function requireAuth(c: Context<AppContext>, next: Next) {
  const token = parseCookie(c.req.header("cookie"), "sera_session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const session = await getSession(c.env, token);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("session", session);
  await next();
}
```

- [ ] **Step 4: `src/index.ts`'te `/api/me` örnek korumalı rota**

```typescript
// import ekle:
import { requireAuth } from "./middleware";

// auth router'dan sonra:
app.use("/api/me", requireAuth);
app.get("/api/me", (c) => {
  const session = c.get("session")!;
  return c.json({ userId: session.userId });
});
```

- [ ] **Step 5: Test → PASS**

```bash
npm test -- middleware
```

Expected: 3 test PASS.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/middleware.ts seraapp/src/index.ts seraapp/test/middleware.test.ts
git commit -m "feat(auth): add requireAuth middleware and /api/me"
```

---

## Task 13: Logout + change password

**Files:**
- Modify: `seraapp/src/routes/auth.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/logout.test.ts`

- [ ] **Step 1: `test/logout.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function login(password = "hunter2"): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("logout & change-password", () => {
  beforeEach(async () => {
    await resetDb();
    await clearKV();
    await migrate();
    const hash = await hashPassword("hunter2");
    await env.DB.prepare("INSERT INTO app_config (key,value) VALUES ('password_hash',?)").bind(hash).run();
  });

  it("logout invalidates session", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/auth/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    // sonraki istek 401
    const r2 = await SELF.fetch("https://example.com/api/me", { headers: { cookie } });
    expect(r2.status).toBe(401);
  });

  it("change-password with correct current succeeds", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ current: "hunter2", next: "newpass" }),
    });
    expect(res.status).toBe(200);
    // eski parola artık geçersiz
    const r2 = await SELF.fetch("https://example.com/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "hunter2" }),
    });
    expect(r2.status).toBe(401);
  });

  it("change-password with wrong current returns 401", async () => {
    const cookie = await login();
    const res = await SELF.fetch("https://example.com/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ current: "wrong", next: "newpass" }),
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- logout
```

Expected: FAIL.

- [ ] **Step 3: `src/routes/auth.ts`'a logout + change-password ekle**

```typescript
import { deleteSession, hashPassword } from "../auth";

function expiredCookie(): string {
  return `sera_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v;
  }
  return null;
}

authRouter.post("/auth/logout", async (c) => {
  const token = parseCookie(c.req.header("cookie"), "sera_session");
  if (token) await deleteSession(c.env, token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": expiredCookie() },
  });
});

authRouter.post("/auth/change-password", async (c) => {
  const body = await c.req.json().catch(() => null) as { current?: string; next?: string } | null;
  if (!body || typeof body.current !== "string" || typeof body.next !== "string" || body.next.length < 1) {
    return c.json({ error: "current and next required" }, 400);
  }
  const row = await c.env.DB.prepare("SELECT value FROM app_config WHERE key='password_hash'").first<{ value: string }>();
  if (!row) return c.json({ error: "not initialized" }, 401);
  const ok = await verifyPassword(body.current, row.value);
  if (!ok) return c.json({ error: "invalid current" }, 401);
  const hash = await hashPassword(body.next);
  await c.env.DB.prepare("UPDATE app_config SET value=? WHERE key='password_hash'").bind(hash).run();
  return c.json({ ok: true });
});
```

- [ ] **Step 4: `src/index.ts`'te change-password ve logout için middleware**

```typescript
// Mount sırasını netleştir:
app.use("/api/auth/logout", requireAuth);
app.use("/api/auth/change-password", requireAuth);
// (login & setup açık kalır)
```

- [ ] **Step 5: Test → PASS**

```bash
npm test -- logout
```

Expected: 3 test PASS.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/routes/auth.ts seraapp/src/index.ts seraapp/test/logout.test.ts
git commit -m "feat(auth): add logout and change-password endpoints"
```

---

## Task 14: D1 helper modülü

**Files:**
- Create: `seraapp/src/db.ts`

- [ ] **Step 1: `src/db.ts`** (test gerektirmez — sadece helper'lar)

```typescript
// Tip güvenli, prepared statement helper'ları
import type { D1Database } from "@cloudflare/workers-types";

export async function one<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<T | null> {
  return db.prepare(sql).bind(...binds).first<T>();
}

export async function all<T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<T[]> {
  const res = await db.prepare(sql).bind(...binds).all<T>();
  return res.results ?? [];
}

export async function run(
  db: D1Database,
  sql: string,
  ...binds: unknown[]
): Promise<D1Result> {
  return db.prepare(sql).bind(...binds).run();
}
```

- [ ] **Step 2: Commit**

```bash
git add seraapp/src/db.ts
git commit -m "chore(db): add D1 query helpers"
```

---

## Task 15: Seasons CRUD endpoint'leri

**Files:**
- Create: `seraapp/src/routes/seasons.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/seasons.test.ts`

- [ ] **Step 1: `test/seasons.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function authedCookie(): Promise<string> {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const res = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("seasons CRUD", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("requires auth", async () => {
    const res = await SELF.fetch("https://example.com/api/seasons");
    expect(res.status).toBe(401);
  });

  it("POST creates a season", async () => {
    const res = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "2025-2026",
        start_date: "2025-09-01",
        end_date: "2026-08-31",
        partner_share_pct: 25,
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as any;
    expect(json.id).toBeTypeOf("number");
    expect(json.name).toBe("2025-2026");
  });

  it("GET lists seasons", async () => {
    await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "2025-01-01", end_date: "2025-12-31" }),
    });
    const res = await SELF.fetch("https://example.com/api/seasons", { headers: { cookie } });
    expect(res.status).toBe(200);
    const list = await res.json() as any[];
    expect(list.length).toBe(1);
  });

  it("PATCH updates name and dates", async () => {
    const c = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "2025-01-01", end_date: "2025-12-31" }),
    });
    const id = (await c.json() as any).id;
    const res = await SELF.fetch(`https://example.com/api/seasons/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).name).toBe("Renamed");
  });

  it("DELETE removes season", async () => {
    const c = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "2025-01-01", end_date: "2025-12-31" }),
    });
    const id = (await c.json() as any).id;
    const res = await SELF.fetch(`https://example.com/api/seasons/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(res.status).toBe(204);
    const list = await SELF.fetch("https://example.com/api/seasons", { headers: { cookie } });
    expect((await list.json() as any[]).length).toBe(0);
  });

  it("rejects invalid date format", async () => {
    const res = await SELF.fetch("https://example.com/api/seasons", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "not-a-date", end_date: "2025-12-31" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- seasons
```

- [ ] **Step 3: `src/routes/seasons.ts`**

```typescript
import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const seasonsRouter = new Hono<AppContext>();
seasonsRouter.use("*", requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Season = {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: number;
  partner_share_pct: number;
  created_at: string;
  updated_at: string;
};

seasonsRouter.get("/seasons", async (c) => {
  const rows = await all<Season>(c.env.DB, "SELECT * FROM seasons ORDER BY start_date DESC");
  return c.json(rows);
});

seasonsRouter.post("/seasons", async (c) => {
  const body = await c.req.json().catch(() => null) as Partial<Season> | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name required" }, 400);
  }
  if (!DATE_RE.test(body.start_date ?? "") || !DATE_RE.test(body.end_date ?? "")) {
    return c.json({ error: "valid start_date and end_date required (YYYY-MM-DD)" }, 400);
  }
  const pct = typeof body.partner_share_pct === "number" ? body.partner_share_pct : 25;
  const result = await run(
    c.env.DB,
    "INSERT INTO seasons (name, start_date, end_date, partner_share_pct) VALUES (?, ?, ?, ?)",
    body.name.trim(), body.start_date, body.end_date, pct,
  );
  const row = await one<Season>(c.env.DB, "SELECT * FROM seasons WHERE id=?", result.meta.last_row_id);
  return c.json(row, 201);
});

seasonsRouter.patch("/seasons/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null) as Partial<Season> | null;
  if (!body) return c.json({ error: "body required" }, 400);

  const existing = await one<Season>(c.env.DB, "SELECT * FROM seasons WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body.start_date && DATE_RE.test(body.start_date)) updates.start_date = body.start_date;
  if (body.end_date && DATE_RE.test(body.end_date)) updates.end_date = body.end_date;
  if (typeof body.partner_share_pct === "number") updates.partner_share_pct = body.partner_share_pct;
  if (Object.keys(updates).length === 0) return c.json(existing);

  const set = Object.keys(updates).map((k) => `${k}=?`).join(", ");
  await run(
    c.env.DB,
    `UPDATE seasons SET ${set}, updated_at=datetime('now') WHERE id=?`,
    ...Object.values(updates), id,
  );
  const row = await one<Season>(c.env.DB, "SELECT * FROM seasons WHERE id=?", id);
  return c.json(row);
});

seasonsRouter.delete("/seasons/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await run(c.env.DB, "DELETE FROM seasons WHERE id=?", id);
  return new Response(null, { status: 204 });
});
```

- [ ] **Step 4: `src/index.ts`'a mount**

```typescript
// import:
import { seasonsRouter } from "./routes/seasons";
// mount (auth router'dan sonra):
app.route("/api", seasonsRouter);
```

- [ ] **Step 5: Test → PASS**

```bash
npm test -- seasons
```

Expected: 6 test PASS.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/routes/seasons.ts seraapp/src/index.ts seraapp/test/seasons.test.ts
git commit -m "feat(seasons): add CRUD endpoints"
```

---

## Task 16: Activate season endpoint

**Files:**
- Modify: `seraapp/src/routes/seasons.ts`
- Modify: `seraapp/test/seasons.test.ts`

- [ ] **Step 1: `seasons.test.ts`'a activate testleri ekle**

```typescript
describe("activate season", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("activates a season and deactivates others", async () => {
    const a = (await (await SELF.fetch("https://example.com/api/seasons", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "A", start_date: "2024-01-01", end_date: "2024-12-31" }),
    })).json()) as any;
    const b = (await (await SELF.fetch("https://example.com/api/seasons", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "B", start_date: "2025-01-01", end_date: "2025-12-31" }),
    })).json()) as any;

    const r1 = await SELF.fetch(`https://example.com/api/seasons/${a.id}/activate`, {
      method: "POST", headers: { cookie },
    });
    expect(r1.status).toBe(200);

    const r2 = await SELF.fetch(`https://example.com/api/seasons/${b.id}/activate`, {
      method: "POST", headers: { cookie },
    });
    expect(r2.status).toBe(200);

    const list = await (await SELF.fetch("https://example.com/api/seasons", { headers: { cookie } })).json() as any[];
    expect(list.find(s => s.id === a.id).is_active).toBe(0);
    expect(list.find(s => s.id === b.id).is_active).toBe(1);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- seasons
```

Expected: activate testi FAIL.

- [ ] **Step 3: `src/routes/seasons.ts`'a activate handler ekle**

```typescript
seasonsRouter.post("/seasons/:id/activate", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await one(c.env.DB, "SELECT id FROM seasons WHERE id=?", id);
  if (!existing) return c.json({ error: "not found" }, 404);

  // batch: önce hepsini pasif et, sonra hedefi aktif et
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE seasons SET is_active=0, updated_at=datetime('now')"),
    c.env.DB.prepare("UPDATE seasons SET is_active=1, updated_at=datetime('now') WHERE id=?").bind(id),
  ]);

  const row = await one(c.env.DB, "SELECT * FROM seasons WHERE id=?", id);
  return c.json(row);
});
```

- [ ] **Step 4: Test → PASS**

```bash
npm test -- seasons
```

Expected: 7 test PASS.

- [ ] **Step 5: Commit**

```bash
git add seraapp/src/routes/seasons.ts seraapp/test/seasons.test.ts
git commit -m "feat(seasons): add activate endpoint with mutual exclusion"
```

---

## Task 17: Master data tabloları migration

**Files:**
- Create: `seraapp/migrations/0002_master.sql`

- [ ] **Step 1: Migration dosyası**

```sql
CREATE TABLE crop_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE crop_varieties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crop_type_id INTEGER NOT NULL REFERENCES crop_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (crop_type_id, name)
);

CREATE TABLE supply_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE utility_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE diseases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE medicines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  active_ingredient TEXT,
  unit TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE disease_medicine_map (
  disease_id INTEGER NOT NULL REFERENCES diseases(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  PRIMARY KEY (disease_id, medicine_id)
);
```

- [ ] **Step 2: Lokal migration**

```bash
npm run migrate:local
```

- [ ] **Step 3: Commit**

```bash
git add seraapp/migrations/0002_master.sql
git commit -m "feat(db): add master data tables"
```

---

## Task 18: Generic master CRUD helper + crop_types/varieties endpoints

**Files:**
- Create: `seraapp/src/routes/master.ts`
- Modify: `seraapp/src/index.ts`
- Create: `seraapp/test/master.test.ts`

- [ ] **Step 1: `test/master.test.ts` (crop_types için)**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function authedCookie(): Promise<string> {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const res = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("master /crop-types CRUD", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/master/crop-types")).status).toBe(401);
  });

  it("POST + GET roundtrip", async () => {
    const create = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domates" }),
    });
    expect(create.status).toBe(201);
    const list = await (await SELF.fetch("https://example.com/api/master/crop-types", { headers: { cookie } })).json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("domates");
  });

  it("PATCH renames", async () => {
    const c = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domats" }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/master/crop-types/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domates" }),
    });
    expect((await r.json() as any).name).toBe("domates");
  });

  it("DELETE removes", async () => {
    const c = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "x" }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/master/crop-types/${id}`, {
      method: "DELETE", headers: { cookie },
    });
    expect(r.status).toBe(204);
  });

  it("duplicate name returns 409", async () => {
    await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "x" }),
    });
    const r = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "x" }),
    });
    expect(r.status).toBe(409);
  });
});

describe("master /crop-varieties CRUD", () => {
  let cookie: string;
  let typeId: number;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
    const c = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domates" }),
    });
    typeId = (await c.json() as any).id;
  });

  it("creates variety bound to type", async () => {
    const r = await SELF.fetch("https://example.com/api/master/crop-varieties", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ crop_type_id: typeId, name: "çeri" }),
    });
    expect(r.status).toBe(201);
    const list = await (await SELF.fetch("https://example.com/api/master/crop-varieties", { headers: { cookie } })).json() as any[];
    expect(list[0].crop_type_id).toBe(typeId);
  });

  it("rejects variety without valid type", async () => {
    const r = await SELF.fetch("https://example.com/api/master/crop-varieties", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ crop_type_id: 99999, name: "x" }),
    });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- master
```

- [ ] **Step 3: `src/routes/master.ts` (generic helper + 2 endpoint set)**

```typescript
import { Hono } from "hono";
import { all, one, run } from "../db";
import { requireAuth } from "../middleware";
import type { AppContext } from "../types";

export const masterRouter = new Hono<AppContext>();
masterRouter.use("*", requireAuth);

type FieldDef = {
  name: string;
  required?: boolean;
  type?: "string" | "number" | "fk";
  fkTable?: string;          // FK validation için
};

type MasterTable = {
  path: string;              // ör. "crop-types"
  table: string;             // ör. "crop_types"
  fields: FieldDef[];        // CRUD'da kabul edilen kolonlar
  orderBy?: string;
};

function trimStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function validateBody(c: any, def: MasterTable, isCreate: boolean): Promise<Record<string, unknown> | { error: string; status: number }> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") return { error: "body required", status: 400 };
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const v = body[f.name];
    if (v === undefined) {
      if (isCreate && f.required) return { error: `${f.name} required`, status: 400 };
      continue;
    }
    if (f.type === "string") {
      const s = trimStr(v);
      if (!s) {
        if (isCreate && f.required) return { error: `${f.name} required`, status: 400 };
        continue;
      }
      out[f.name] = s;
    } else if (f.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return { error: `${f.name} must be number`, status: 400 };
      out[f.name] = v;
    } else if (f.type === "fk") {
      if (typeof v !== "number") return { error: `${f.name} must be id`, status: 400 };
      const exists = await one(c.env.DB, `SELECT id FROM ${f.fkTable} WHERE id=?`, v);
      if (!exists) return { error: `${f.name} not found`, status: 400 };
      out[f.name] = v;
    }
  }
  return out;
}

function mountTable(def: MasterTable) {
  masterRouter.get(`/master/${def.path}`, async (c) => {
    const order = def.orderBy ?? "name ASC";
    const rows = await all(c.env.DB, `SELECT * FROM ${def.table} ORDER BY ${order}`);
    return c.json(rows);
  });

  masterRouter.post(`/master/${def.path}`, async (c) => {
    const validated = await validateBody(c, def, true);
    if ("error" in validated) return c.json({ error: validated.error }, validated.status as 400 | 409);
    try {
      const cols = Object.keys(validated);
      const placeholders = cols.map(() => "?").join(", ");
      const result = await run(
        c.env.DB,
        `INSERT INTO ${def.table} (${cols.join(",")}) VALUES (${placeholders})`,
        ...Object.values(validated),
      );
      const row = await one(c.env.DB, `SELECT * FROM ${def.table} WHERE id=?`, result.meta.last_row_id);
      return c.json(row, 201);
    } catch (e: any) {
      if (String(e).includes("UNIQUE")) return c.json({ error: "duplicate" }, 409);
      throw e;
    }
  });

  masterRouter.patch(`/master/${def.path}/:id`, async (c) => {
    const id = Number(c.req.param("id"));
    const existing = await one(c.env.DB, `SELECT * FROM ${def.table} WHERE id=?`, id);
    if (!existing) return c.json({ error: "not found" }, 404);
    const validated = await validateBody(c, def, false);
    if ("error" in validated) return c.json({ error: validated.error }, validated.status as 400 | 409);
    if (Object.keys(validated).length === 0) return c.json(existing);
    const set = Object.keys(validated).map((k) => `${k}=?`).join(", ");
    try {
      await run(
        c.env.DB,
        `UPDATE ${def.table} SET ${set} WHERE id=?`,
        ...Object.values(validated), id,
      );
      const row = await one(c.env.DB, `SELECT * FROM ${def.table} WHERE id=?`, id);
      return c.json(row);
    } catch (e: any) {
      if (String(e).includes("UNIQUE")) return c.json({ error: "duplicate" }, 409);
      throw e;
    }
  });

  masterRouter.delete(`/master/${def.path}/:id`, async (c) => {
    const id = Number(c.req.param("id"));
    await run(c.env.DB, `DELETE FROM ${def.table} WHERE id=?`, id);
    return new Response(null, { status: 204 });
  });
}

// Table config'leri:
mountTable({
  path: "crop-types",
  table: "crop_types",
  fields: [{ name: "name", required: true, type: "string" }],
});

mountTable({
  path: "crop-varieties",
  table: "crop_varieties",
  fields: [
    { name: "crop_type_id", required: true, type: "fk", fkTable: "crop_types" },
    { name: "name", required: true, type: "string" },
  ],
});
```

- [ ] **Step 4: `src/index.ts`'a mount**

```typescript
import { masterRouter } from "./routes/master";
app.route("/api", masterRouter);
```

- [ ] **Step 5: Test → PASS**

```bash
npm test -- master
```

Expected: 7 test PASS.

- [ ] **Step 6: Commit**

```bash
git add seraapp/src/routes/master.ts seraapp/src/index.ts seraapp/test/master.test.ts
git commit -m "feat(master): add generic CRUD for crop types & varieties"
```

---

## Task 19: Supply categories + utility types endpoints

**Files:**
- Modify: `seraapp/src/routes/master.ts`
- Modify: `seraapp/test/master.test.ts`

- [ ] **Step 1: Test ekle**

`test/master.test.ts` sonuna:
```typescript
describe("supply_categories & utility_types", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("supply: requires name and unit", async () => {
    const r = await SELF.fetch("https://example.com/api/master/supplies", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "kömür" }),
    });
    expect(r.status).toBe(400);
  });

  it("supply: full create succeeds", async () => {
    const r = await SELF.fetch("https://example.com/api/master/supplies", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "kömür", unit: "kg" }),
    });
    expect(r.status).toBe(201);
  });

  it("utility: create electricity", async () => {
    const r = await SELF.fetch("https://example.com/api/master/utilities", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "elektrik", unit: "kWh" }),
    });
    expect(r.status).toBe(201);
  });
});
```

- [ ] **Step 2: Test → FAIL**

```bash
npm test -- master
```

- [ ] **Step 3: `src/routes/master.ts` sonuna table config'leri ekle**

```typescript
mountTable({
  path: "supplies",
  table: "supply_categories",
  fields: [
    { name: "name", required: true, type: "string" },
    { name: "unit", required: true, type: "string" },
  ],
});

mountTable({
  path: "utilities",
  table: "utility_types",
  fields: [
    { name: "name", required: true, type: "string" },
    { name: "unit", required: true, type: "string" },
  ],
});
```

- [ ] **Step 4: Test → PASS**

```bash
npm test -- master
```

- [ ] **Step 5: Commit**

```bash
git add seraapp/src/routes/master.ts seraapp/test/master.test.ts
git commit -m "feat(master): add supplies & utilities CRUD"
```

---

## Task 20: Diseases + medicines + disease-medicine map

**Files:**
- Modify: `seraapp/src/routes/master.ts`
- Modify: `seraapp/test/master.test.ts`

- [ ] **Step 1: Test ekle**

```typescript
describe("diseases, medicines, mapping", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("creates disease and medicine", async () => {
    const d = await SELF.fetch("https://example.com/api/master/diseases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "mildiyö" }),
    });
    expect(d.status).toBe(201);
    const m = await SELF.fetch("https://example.com/api/master/medicines", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Ridomil", active_ingredient: "metalaksil", unit: "g" }),
    });
    expect(m.status).toBe(201);
  });

  it("maps disease to medicine and lists by disease", async () => {
    const d = await (await SELF.fetch("https://example.com/api/master/diseases", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "mildiyö" }),
    })).json() as any;
    const m = await (await SELF.fetch("https://example.com/api/master/medicines", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Ridomil", unit: "g" }),
    })).json() as any;
    const map = await SELF.fetch("https://example.com/api/master/disease-medicine-map", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ disease_id: d.id, medicine_id: m.id }),
    });
    expect(map.status).toBe(201);
    const list = await (await SELF.fetch(`https://example.com/api/master/disease-medicine-map?disease_id=${d.id}`, {
      headers: { cookie },
    })).json() as any[];
    expect(list).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Test → FAIL**

- [ ] **Step 3: `src/routes/master.ts`'a ekle**

```typescript
mountTable({
  path: "diseases",
  table: "diseases",
  fields: [{ name: "name", required: true, type: "string" }],
});

mountTable({
  path: "medicines",
  table: "medicines",
  fields: [
    { name: "name", required: true, type: "string" },
    { name: "active_ingredient", type: "string" },
    { name: "unit", required: true, type: "string" },
  ],
});

// map'ı manuel ekle (composite key, generic helper'a uymuyor)
masterRouter.get("/master/disease-medicine-map", async (c) => {
  const diseaseId = c.req.query("disease_id");
  const medicineId = c.req.query("medicine_id");
  if (diseaseId) {
    return c.json(await all(c.env.DB, "SELECT * FROM disease_medicine_map WHERE disease_id=?", Number(diseaseId)));
  }
  if (medicineId) {
    return c.json(await all(c.env.DB, "SELECT * FROM disease_medicine_map WHERE medicine_id=?", Number(medicineId)));
  }
  return c.json(await all(c.env.DB, "SELECT * FROM disease_medicine_map"));
});

masterRouter.post("/master/disease-medicine-map", async (c) => {
  const body = await c.req.json().catch(() => null) as { disease_id?: number; medicine_id?: number } | null;
  if (!body || typeof body.disease_id !== "number" || typeof body.medicine_id !== "number") {
    return c.json({ error: "disease_id and medicine_id required" }, 400);
  }
  const d = await one(c.env.DB, "SELECT id FROM diseases WHERE id=?", body.disease_id);
  const m = await one(c.env.DB, "SELECT id FROM medicines WHERE id=?", body.medicine_id);
  if (!d || !m) return c.json({ error: "disease or medicine not found" }, 400);
  try {
    await run(c.env.DB, "INSERT INTO disease_medicine_map (disease_id, medicine_id) VALUES (?, ?)", body.disease_id, body.medicine_id);
  } catch (e: any) {
    if (String(e).includes("UNIQUE") || String(e).includes("PRIMARY")) return c.json({ error: "duplicate" }, 409);
    throw e;
  }
  return c.json({ disease_id: body.disease_id, medicine_id: body.medicine_id }, 201);
});

masterRouter.delete("/master/disease-medicine-map", async (c) => {
  const diseaseId = Number(c.req.query("disease_id"));
  const medicineId = Number(c.req.query("medicine_id"));
  if (!diseaseId || !medicineId) return c.json({ error: "disease_id and medicine_id required" }, 400);
  await run(c.env.DB, "DELETE FROM disease_medicine_map WHERE disease_id=? AND medicine_id=?", diseaseId, medicineId);
  return new Response(null, { status: 204 });
});
```

- [ ] **Step 4: Test → PASS**

- [ ] **Step 5: Commit**

```bash
git add seraapp/src/routes/master.ts seraapp/test/master.test.ts
git commit -m "feat(master): add diseases, medicines, and mapping CRUD"
```

---

## Task 21: Seed migration — minimal master data

**Files:**
- Create: `seraapp/migrations/0003_seed.sql`

- [ ] **Step 1: Seed dosyası**

```sql
-- Ürün türleri
INSERT INTO crop_types (name) VALUES
  ('domates'), ('salatalık'), ('biber'), ('patlıcan');

-- Birkaç cins (örnek)
INSERT INTO crop_varieties (crop_type_id, name)
SELECT id, 'standart' FROM crop_types;

-- Sarf malzeme kategorileri
INSERT INTO supply_categories (name, unit) VALUES
  ('naylon', 'm2'),
  ('odun', 'kg'),
  ('kömür', 'kg'),
  ('gübre', 'kg');

-- Tüketim (stoksuz) kalemleri
INSERT INTO utility_types (name, unit) VALUES
  ('elektrik', 'kWh'),
  ('su', 'm3');

-- Bazı hastalıklar
INSERT INTO diseases (name) VALUES
  ('mildiyö'),
  ('külleme'),
  ('yaprak biti');
```

- [ ] **Step 2: Lokal uygula**

```bash
npm run migrate:local
```

- [ ] **Step 3: Commit**

```bash
git add seraapp/migrations/0003_seed.sql
git commit -m "feat(db): seed minimal master data"
```

---

## Task 22: Frontend kabuk + mobile-first CSS

**Files:**
- Create: `seraapp/public/index.html`
- Create: `seraapp/public/styles.css`
- Create: `seraapp/public/app.js`

- [ ] **Step 1: `public/index.html`**

```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#1f6f3f" />
  <title>Sera Takip</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div id="app"></div>
  <script src="/app.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: `public/styles.css` (mobile-first temel)**

```css
:root {
  --bg: #0f1411;
  --panel: #18211c;
  --panel-2: #20302a;
  --text: #e6efe7;
  --muted: #8aa394;
  --accent: #4ad28f;
  --danger: #ff5d6c;
  --warn: #ffb454;
  --line: #2a3b33;
  --radius: 14px;
  font-size: 16px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
body { min-height: 100dvh; padding-bottom: 72px; }

header.season-bar {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: var(--panel);
  border-bottom: 1px solid var(--line);
}
header.season-bar .label { color: var(--muted); font-size: 12px; }
header.season-bar .value { font-weight: 600; }
header.season-bar button.settings { background: transparent; border: 0; color: var(--text); font-size: 22px; }

main { padding: 16px; max-width: 720px; margin: 0 auto; }

nav.bottom {
  position: fixed; bottom: 0; left: 0; right: 0;
  display: grid; grid-template-columns: repeat(5, 1fr);
  background: var(--panel); border-top: 1px solid var(--line);
  padding: 8px 4px env(safe-area-inset-bottom, 8px);
}
nav.bottom button { background: transparent; border: 0; color: var(--muted); font-size: 12px; padding: 6px 0; display: flex; flex-direction: column; gap: 4px; align-items: center; }
nav.bottom button.active { color: var(--accent); }

.card { background: var(--panel); border-radius: var(--radius); padding: 16px; margin: 0 0 12px; }
.card h2 { margin: 0 0 12px; font-size: 16px; color: var(--muted); font-weight: 500; letter-spacing: 0.4px; text-transform: uppercase; }

button.primary { background: var(--accent); color: #0a1410; border: 0; border-radius: 12px; padding: 14px 18px; font-weight: 600; min-height: 48px; width: 100%; }
button.secondary { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; min-height: 48px; }
button.danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); border-radius: 12px; padding: 12px 16px; }

input, select, textarea {
  width: 100%; background: var(--panel-2); border: 1px solid var(--line);
  color: var(--text); border-radius: 12px; padding: 14px 14px;
  font-size: 16px; min-height: 48px;
}
label { display: block; color: var(--muted); font-size: 13px; margin: 12px 0 6px; }

.list-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line); }
.list-item:last-child { border-bottom: 0; }
.list-item .meta { color: var(--muted); font-size: 13px; margin-top: 2px; }
.row { display: flex; gap: 8px; align-items: center; }

.toast { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: var(--panel-2); color: var(--text); border: 1px solid var(--line); padding: 12px 16px; border-radius: 10px; z-index: 50; }
.toast.error { border-color: var(--danger); color: var(--danger); }
.empty { text-align: center; color: var(--muted); padding: 40px 16px; }
```

- [ ] **Step 3: `public/app.js` minimal kabuk (boş ekran "Yükleniyor...")**

```javascript
const app = document.getElementById("app");
app.innerHTML = `<div class="empty">Yükleniyor…</div>`;

// Burada gerçek SPA render Task 24'ten itibaren doldurulacak
```

- [ ] **Step 4: Lokal dev'de kontrol**

```bash
cd seraapp && npm run dev
```

Tarayıcıdan `http://localhost:8787` → "Yükleniyor..." görünmeli.

- [ ] **Step 5: Commit**

```bash
git add seraapp/public/index.html seraapp/public/styles.css seraapp/public/app.js
git commit -m "feat(frontend): scaffold mobile-first shell"
```

---

## Task 23: apiCall wrapper + auth state + setup/login render

**Files:**
- Modify: `seraapp/public/app.js`

- [ ] **Step 1: `public/app.js`'i şu hale getir**

```javascript
const app = document.getElementById("app");

const state = {
  authed: false,
  needsSetup: false,
  activeSeason: null,
  page: "loading", // loading|setup|login|home
};

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
  // Task 24'te gerçek sekmeli yapı gelecek; şimdilik placeholder
  app.innerHTML = `
    <header class="season-bar">
      <div>
        <div class="label">Aktif sezon</div>
        <div class="value">${state.activeSeason ? escape(state.activeSeason.name) : "—"}</div>
      </div>
      <button class="settings" id="logout" aria-label="Çıkış">⎋</button>
    </header>
    <main>
      <div class="card">
        <h2>Pano</h2>
        <div class="empty">Modüller sonraki fazlarda gelecek.</div>
      </div>
    </main>
  `;
  document.getElementById("logout").onclick = async () => {
    await apiCall("/api/auth/logout", { method: "POST" }).catch(()=>{});
    state.authed = false;
    state.page = "login";
    render();
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
```

> **Not:** Bu wrapper çok basit ve XSS açısından `escape()` yardımcısıyla korunuyor; dinamik içerik daima `textContent` ile yazılır. İleride bir mini render kütüphanesine ihtiyaç olursa Task 25+'da değerlendirilir.

- [ ] **Step 2: Tarayıcıda smoke test**

```bash
npm run dev
```

Tarayıcı:
1. Hiç kurulum yapılmamışken `/` açıldığında setup ekranı görünür.
2. Parola gir → "Kurulum tamam" → login ekranı.
3. Parola ile giriş → home ekranı, "Pano" placeholder + üst bar.
4. ⎋ tıkla → tekrar login.

- [ ] **Step 3: Commit**

```bash
git add seraapp/public/app.js
git commit -m "feat(frontend): add setup, login, and home shell"
```

---

## Task 24: Sekme yapısı (bottom nav) + Ayarlar girişi

**Files:**
- Modify: `seraapp/public/app.js`

- [ ] **Step 1: `renderHome()` ve genel kabuğu güncelle**

`renderHome` aşağıdaki gibi olur (önceki versiyonun yerine):

```javascript
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
```

- [ ] **Step 2: `renderSettings()` placeholder**

```javascript
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
  document.getElementById("settingsBody").innerHTML =
    `<div class="card"><div class="empty">${escape(state.settingsTab)} ekranı bir sonraki task'ta gelecek.</div></div>`;
}
```

- [ ] **Step 3: Smoke test**

`npm run dev` → login → home → ⚙ → ayarlar tabları geçişi çalışmalı, ← ile dönmeli.

- [ ] **Step 4: Commit**

```bash
git add seraapp/public/app.js
git commit -m "feat(frontend): bottom-nav tabs and settings shell"
```

---

## Task 25: Ayarlar > Sezonlar UI

**Files:**
- Modify: `seraapp/public/app.js`

- [ ] **Step 1: `renderSettings()` içinde `settingsBody` render'ını şuna değiştir**

```javascript
// renderSettings sonunda, settingsBody'yi doldur:
const body = document.getElementById("settingsBody");
if (state.settingsTab === "seasons") renderSeasonsSettings(body);
else body.innerHTML = `<div class="card"><div class="empty">${escape(state.settingsTab)} ekranı sonraki task'ta.</div></div>`;
```

- [ ] **Step 2: `renderSeasonsSettings`'i ekle**

```javascript
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
```

- [ ] **Step 3: Smoke test**

`npm run dev` → ayarlar → Sezonlar → sezon ekle → aktif et → üst başlığa yansır.

- [ ] **Step 4: Commit**

```bash
git add seraapp/public/app.js
git commit -m "feat(frontend): seasons settings UI"
```

---

## Task 26: Ayarlar > Master data (Tür/Cins, Sarf/Utility, İlaç/Hastalık) — generic UI

**Files:**
- Modify: `seraapp/public/app.js`

- [ ] **Step 1: Generic master CRUD renderer ekle**

```javascript
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
```

- [ ] **Step 2: `renderSettings()` body switch'ini genişlet**

```javascript
// renderSettings içindeki settingsBody dolumunu güncelle:
const body = document.getElementById("settingsBody");
if (state.settingsTab === "seasons") renderSeasonsSettings(body);
else if (state.settingsTab === "types") renderTypesSettings(body);
else if (state.settingsTab === "supplies") renderSuppliesSettings(body);
else if (state.settingsTab === "medicines") renderMedicinesSettings(body);
else if (state.settingsTab === "password") renderPasswordSettings(body);
```

- [ ] **Step 3: Tür/Cins ekranı (iki-aşamalı: önce tür, sonra cins)**

```javascript
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
```

- [ ] **Step 4: Sarf + Utility ekranı**

```javascript
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
```

- [ ] **Step 5: İlaç + Hastalık + Map ekranı**

```javascript
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
```

- [ ] **Step 6: Parola değiştirme ekranı**

```javascript
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
```

- [ ] **Step 7: Smoke test**

`npm run dev`:
- Tür ekle → cins ekle (tür dropdown'da görünür)
- Sarf ve utility ekle
- İlaç + hastalık + eşleme ekle
- Parola değiştir, çıkış yap, yeni parolayla giriş

- [ ] **Step 8: Commit**

```bash
git add seraapp/public/app.js
git commit -m "feat(frontend): master data settings (types, supplies, medicines, password)"
```

---

## Task 27: Production deploy + smoke

**Files:**
- Modify: `seraapp/README.md`

- [ ] **Step 1: Production migration uygula**

```bash
cd seraapp && npm run migrate:remote
```

Expected: "3 migrations applied" benzeri çıktı.

- [ ] **Step 2: Worker'ı deploy et**

```bash
npm run deploy
```

Expected: `https://seraapp.<accountname>.workers.dev` URL'i.

- [ ] **Step 3: Smoke test (tarayıcı, mümkünse telefondan)**

1. URL'i aç → setup ekranı
2. Parola belirle → login
3. Sezon oluştur, aktif et
4. Tür, cins, sarf, ilaç, hastalık ekle
5. Eşleme ekle, sil
6. Parolayı değiştir, yeniden giriş
7. ⎋ → çıkış → tekrar giriş

- [ ] **Step 4: `README.md`'yi güncelle**

```markdown
# Sera Takip Uygulaması

Cloudflare Pages + Workers + D1 üzerinde, mobil-first sera takip aracı.

Spec: `../docs/superpowers/specs/2026-06-30-sera-takip-design.md`
Plan: `../docs/superpowers/plans/2026-06-30-sera-takip-faz-0-1.md`

## Kurulum

1. `npm install`
2. `npx wrangler login`
3. D1 ve KV oluştur, ID'leri `wrangler.toml`'a yaz (bkz. plan Task 3)
4. Migration: `npm run migrate:remote`
5. Deploy: `npm run deploy`
6. Tarayıcıdan ilk açılışta parola belirle

## Komutlar

- `npm run dev` — lokal (miniflare) sunucu
- `npm test` — vitest
- `npm run migrate:local` / `migrate:remote` — D1 migration

## Sonraki fazlar

Modül 1-6 hareket tabloları sonraki planlarda eklenecek:
- Faz 2: Fidan/sarf/ilaç alımları + stok
- Faz 3: Tüketim + aylık rapor
- Faz 4: Satış + piyasa snapshot + ortak mutabakat
- Faz 5: Grafikler, modaller, cila
```

- [ ] **Step 5: Tüm testleri tekrar çalıştır**

```bash
npm test
```

Expected: tüm testler PASS.

- [ ] **Step 6: Commit**

```bash
git add seraapp/README.md
git commit -m "docs(seraapp): update README with setup steps and deploy notes"
```

---

## Faz 0+1 tamamlandı

Bu noktada elinizde:
- Çalışan bulut tabanlı uygulama, gerçek URL'de
- Tek-kullanıcılı login + parola değiştirme
- Sezon yönetimi (CRUD + aktif et)
- Tüm master data (türler, cinsler, sarf, utility, ilaç, hastalık, eşleme)
- Mobil-first UI, alt sekme + ayarlar
- Vitest test paketi

**Sonraki faz:** Faz 2 (Modül 1-3 alımları + stok) için ayrı plan yazılacak. Tetiklemek için: "Faz 2 planını yaz" deyin.
