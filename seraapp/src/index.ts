import { Hono } from "hono";
import type { AppContext } from "./types";
import { setupRouter } from "./routes/setup";
import { authRouter } from "./routes/auth";
import { seasonsRouter } from "./routes/seasons";
import { masterRouter } from "./routes/master";
import { seedlingsRouter } from "./routes/seedlings";
import { supplyPurchasesRouter } from "./routes/supply-purchases";
import { medicinePurchasesRouter } from "./routes/medicine-purchases";
import { medicineApplicationsRouter } from "./routes/medicine-applications";
import { stockRouter } from "./routes/stock";
import { consumptionRouter } from "./routes/consumption";
import { reportsRouter } from "./routes/reports";
import { salesRouter } from "./routes/sales";
import { marketPricesRouter } from "./routes/market-prices";
import { requireAuth } from "./middleware";

const app = new Hono<AppContext>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api", setupRouter);
app.use("/api/auth/logout", requireAuth);
app.use("/api/auth/change-password", requireAuth);
app.route("/api", authRouter);
app.route("/api", seasonsRouter);
app.route("/api", masterRouter);
app.route("/api", seedlingsRouter);
app.route("/api", supplyPurchasesRouter);
app.route("/api", medicinePurchasesRouter);
app.route("/api", medicineApplicationsRouter);
app.route("/api", stockRouter);
app.route("/api", consumptionRouter);
app.route("/api", reportsRouter);
app.route("/api", salesRouter);
app.route("/api", marketPricesRouter);

app.use("/api/me", requireAuth);
app.get("/api/me", (c) => {
  const session = c.get("session")!;
  return c.json({ userId: session.userId });
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
