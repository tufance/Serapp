import { describe, it, expect, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { resetDb, clearKV, migrate } from "./helpers";
import { hashPassword } from "../src/auth";

async function authedCookie(): Promise<string> {
  const hash = await hashPassword("pw");
  await env.DB.prepare("INSERT INTO app_config(key,value) VALUES('password_hash',?)").bind(hash).run();
  const res = await SELF.fetch("https://example.com/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "pw" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("master /crop-types CRUD", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("requires auth", async () => {
    expect((await SELF.fetch("https://example.com/api/master/crop-types")).status).toBe(401);
  });

  it("POST + GET roundtrip", async () => {
    const create = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domates" }),
    });
    expect(create.status).toBe(201);
    const list = await (await SELF.fetch("https://example.com/api/master/crop-types", { headers: { cookie } })).json() as any[];
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("domates");
  });

  it("PATCH renames", async () => {
    const c = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domats" }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/master/crop-types/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domates" }),
    });
    expect((await r.json() as any).name).toBe("domates");
  });

  it("DELETE removes", async () => {
    const c = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "x" }),
    });
    const id = (await c.json() as any).id;
    const r = await SELF.fetch(`https://example.com/api/master/crop-types/${id}`, {
      method: "DELETE", headers: { cookie },
    });
    expect(r.status).toBe(204);
  });

  it("duplicate name returns 409", async () => {
    await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "x" }),
    });
    const r = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "x" }),
    });
    expect(r.status).toBe(409);
  });
});

describe("master /crop-varieties CRUD", () => {
  let cookie: string;
  let typeId: number;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
    const c = await SELF.fetch("https://example.com/api/master/crop-types", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "domates" }),
    });
    typeId = (await c.json() as any).id;
  });

  it("creates variety bound to type", async () => {
    const r = await SELF.fetch("https://example.com/api/master/crop-varieties", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ crop_type_id: typeId, name: "çeri" }),
    });
    expect(r.status).toBe(201);
    const list = await (await SELF.fetch("https://example.com/api/master/crop-varieties", { headers: { cookie } })).json() as any[];
    expect(list[0].crop_type_id).toBe(typeId);
  });

  it("rejects variety without valid type", async () => {
    const r = await SELF.fetch("https://example.com/api/master/crop-varieties", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ crop_type_id: 99999, name: "x" }),
    });
    expect(r.status).toBe(400);
  });
});

describe("supply_categories & utility_types", () => {
  let cookie: string;
  beforeEach(async () => {
    await resetDb(); await clearKV(); await migrate();
    cookie = await authedCookie();
  });

  it("supply: requires name and unit", async () => {
    const r = await SELF.fetch("https://example.com/api/master/supplies", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "kömür" }),
    });
    expect(r.status).toBe(400);
  });

  it("supply: full create succeeds", async () => {
    const r = await SELF.fetch("https://example.com/api/master/supplies", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "kömür", unit: "kg" }),
    });
    expect(r.status).toBe(201);
  });

  it("utility: create electricity", async () => {
    const r = await SELF.fetch("https://example.com/api/master/utilities", {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "elektrik", unit: "kWh" }),
    });
    expect(r.status).toBe(201);
  });
});
