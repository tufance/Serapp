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
