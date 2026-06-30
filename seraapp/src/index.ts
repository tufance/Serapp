import { Hono } from "hono";
import type { AppContext } from "./types";
import { setupRouter } from "./routes/setup";

const app = new Hono<AppContext>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", setupRouter);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
