import { Hono } from "hono";
import type { AppContext } from "./types";
import { setupRouter } from "./routes/setup";
import { authRouter } from "./routes/auth";

const app = new Hono<AppContext>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", setupRouter);
app.route("/api", authRouter);

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
