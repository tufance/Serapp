import { Hono } from "hono";
import type { AppContext } from "./types";
import { setupRouter } from "./routes/setup";
import { authRouter } from "./routes/auth";
import { requireAuth } from "./middleware";

const app = new Hono<AppContext>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", setupRouter);
app.use("/api/auth/logout", requireAuth);
app.use("/api/auth/change-password", requireAuth);
app.route("/api", authRouter);

app.use("/api/me", requireAuth);
app.get("/api/me", (c) => {
  const session = c.get("session")!;
  return c.json({ userId: session.userId });
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
