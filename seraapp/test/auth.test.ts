import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, createSession, getSession, deleteSession } from "../src/auth";
import { testEnv, clearKV } from "./helpers";

describe("password hashing", () => {
  it("hashPassword returns a string in pbkdf2 format", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).toMatch(/^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it("verifyPassword returns true for correct password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash)).toBe(true);
  });

  it("verifyPassword returns false for wrong password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("two hashes of same password differ (salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

describe("session", () => {
  beforeEach(async () => {
    await clearKV();
  });

  it("createSession returns token and writes to KV", async () => {
    const token = await createSession(testEnv());
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    const stored = await testEnv().SESSIONS.get(`sess:${token}`);
    expect(stored).not.toBeNull();
  });

  it("getSession returns payload for valid token", async () => {
    const token = await createSession(testEnv());
    const payload = await getSession(testEnv(), token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe("owner");
  });

  it("getSession returns null for unknown token", async () => {
    const payload = await getSession(testEnv(), "nonexistent");
    expect(payload).toBeNull();
  });

  it("deleteSession removes the session", async () => {
    const token = await createSession(testEnv());
    await deleteSession(testEnv(), token);
    expect(await getSession(testEnv(), token)).toBeNull();
  });
});
