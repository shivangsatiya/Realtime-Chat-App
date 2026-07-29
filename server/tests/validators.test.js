import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema } from "../src/validators/authValidators.js";
import { startPrivateSchema, createGroupSchema } from "../src/validators/conversationValidators.js";
import {
  conversationIdParamSchema,
  searchMessagesQuerySchema,
} from "../src/validators/messageValidators.js";
import { searchQuerySchema } from "../src/validators/userValidators.js";

describe("registerSchema", () => {
  it("accepts valid input and normalizes email casing/whitespace", () => {
    const result = registerSchema.safeParse({
      username: "  Shivang  ",
      email: "  Foo@BAR.com  ",
      password: "abcdef",
    });
    expect(result.success).toBe(true);
    expect(result.data.username).toBe("Shivang");
    expect(result.data.email).toBe("foo@bar.com");
  });

  it("rejects a username shorter than 3 characters", () => {
    const result = registerSchema.safeParse({ username: "ab", email: "a@b.com", password: "abcdef" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = registerSchema.safeParse({
      username: "shivang",
      email: "not-an-email",
      password: "abcdef",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 6 characters", () => {
    const result = registerSchema.safeParse({ username: "shivang", email: "a@b.com", password: "123" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = registerSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "anything" });
    expect(result.success).toBe(true);
  });

  it("normalizes email casing on login too (the case-sensitivity bug fix)", () => {
    const result = loginSchema.safeParse({ email: "Foo@BAR.com", password: "x" });
    expect(result.data.email).toBe("foo@bar.com");
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("startPrivateSchema", () => {
  it("accepts a valid 24-character hex ObjectId", () => {
    const result = startPrivateSchema.safeParse({ userId: "507f1f77bcf86cd799439011" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-ObjectId string", () => {
    const result = startPrivateSchema.safeParse({ userId: "not-a-real-id" });
    expect(result.success).toBe(false);
  });
});

describe("createGroupSchema", () => {
  const validIds = ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"];

  it("accepts a valid group", () => {
    const result = createGroupSchema.safeParse({ name: "Team", participantIds: validIds });
    expect(result.success).toBe(true);
  });

  it("rejects a group with fewer than 2 participants", () => {
    const result = createGroupSchema.safeParse({ name: "Team", participantIds: [validIds[0]] });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than 80 characters", () => {
    const result = createGroupSchema.safeParse({ name: "x".repeat(81), participantIds: validIds });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = createGroupSchema.safeParse({ name: "", participantIds: validIds });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed participant id mixed in with valid ones", () => {
    const result = createGroupSchema.safeParse({ name: "Team", participantIds: [validIds[0], "bad-id"] });
    expect(result.success).toBe(false);
  });
});

describe("conversationIdParamSchema", () => {
  it("accepts a valid ObjectId", () => {
    const result = conversationIdParamSchema.safeParse({ conversationId: "507f1f77bcf86cd799439011" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed id — this is the exact CastError-to-400 fix", () => {
    const result = conversationIdParamSchema.safeParse({ conversationId: "not-a-real-id" });
    expect(result.success).toBe(false);
  });
});

describe("searchMessagesQuerySchema", () => {
  it("accepts a normal query", () => {
    const result = searchMessagesQuerySchema.safeParse({ q: "hello" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty query", () => {
    const result = searchMessagesQuerySchema.safeParse({ q: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an overly long query", () => {
    const result = searchMessagesQuerySchema.safeParse({ q: "x".repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe("searchQuerySchema (user search)", () => {
  it("allows an entirely absent search param (it's optional)", () => {
    const result = searchQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("trims whitespace", () => {
    const result = searchQuerySchema.safeParse({ search: "  bob  " });
    expect(result.data.search).toBe("bob");
  });

  it("rejects a search string over 100 characters", () => {
    const result = searchQuerySchema.safeParse({ search: "x".repeat(101) });
    expect(result.success).toBe(false);
  });
});
