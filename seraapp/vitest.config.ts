import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            d1Databases: ["DB"],
            kvNamespaces: ["SESSIONS"],
            // D1 migration listesini test'lere binding olarak geçir.
            // helpers.ts içindeki migrate() bunu kullanır.
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
