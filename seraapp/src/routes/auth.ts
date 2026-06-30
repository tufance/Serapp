import { Hono } from "hono";
import { verifyPassword, createSession, deleteSession, hashPassword } from "../auth";
import type { AppContext } from "../types";
import { parseCookie } from "../cookies";

export const authRouter = new Hono<AppContext>();

const COOKIE_NAME = "sera_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function buildCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`;
}

function expiredCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
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

authRouter.post("/auth/logout", async (c) => {
  const token = parseCookie(c.req.header("cookie"), COOKIE_NAME);
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
