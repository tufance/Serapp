import type { Context, Next } from "hono";
import { getSession } from "./auth";
import type { AppContext } from "./types";
import { parseCookie } from "./cookies";

export async function requireAuth(c: Context<AppContext>, next: Next) {
  const token = parseCookie(c.req.header("cookie"), "sera_session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const session = await getSession(c.env, token);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  c.set("session", session);
  await next();
}
