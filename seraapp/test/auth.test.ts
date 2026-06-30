import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth";

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
