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
