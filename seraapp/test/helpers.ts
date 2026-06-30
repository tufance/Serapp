import { env, applyD1Migrations } from "cloudflare:test";
import type { Env } from "../src/types";

// Test ortamında miniflare bindings.TEST_MIGRATIONS ile geçilen
// D1 migration listesi mevcuttur (vitest.config.ts içinde readD1Migrations
// ile dolduruluyor). Tip artırımı applyD1Migrations çağrısını sadeleştirir.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}

export function testEnv(): Env {
  return env as unknown as Env;
}

// Test başında D1'i sıfırla
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

// seraapp/migrations/ altındaki SQL migration'larını test D1 şemasına replay et.
// Migration'lar vitest.config.ts'de readD1Migrations() ile okunup
// miniflare bindings üzerinden TEST_MIGRATIONS olarak iletilir.
export async function migrate() {
  await applyD1Migrations(testEnv().DB, env.TEST_MIGRATIONS);
}
