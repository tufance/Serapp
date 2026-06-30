import { Hono } from "hono";
import type { AppContext } from "./types";

const app = new Hono<AppContext>();

app.get("/api/health", (c) => c.json({ ok: true }));

// Fallback: statik dosyalar
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
