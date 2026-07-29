import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

// Mock the User model before importing anything that uses it, so the route
// under test never touches a real database.
vi.mock("../src/models/User.js", () => {
  const mockUser = {
    _id: "507f1f77bcf86cd799439011",
    username: "shivang",
    email: "shivang@example.com",
    comparePassword: vi.fn(),
    save: vi.fn(),
    toSafeObject: vi.fn(() => ({
      id: "507f1f77bcf86cd799439011",
      username: "shivang",
      email: "shivang@example.com",
    })),
  };
  return {
    default: {
      findOne: vi.fn(),
      create: vi.fn(),
      __mockUser: mockUser,
    },
  };
});

vi.mock("../src/utils/generateToken.js", () => ({
  generateToken: vi.fn(() => "fake.jwt.token"),
}));

// The real authLimiter is a singleton with persistent in-memory state —
// mocking it out here so these tests exercise route logic, not accumulate
// hits toward the real rate limit as more tests get added over time.
vi.mock("../src/middleware/rateLimiters.js", () => ({
  authLimiter: (req, res, next) => next(),
}));

const { default: User } = await import("../src/models/User.js");
const { default: authRoutes } = await import("../src/routes/authRoutes.js");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  // Minimal version of the real centralized error handler, so a thrown
  // error in a test doesn't crash the whole suite with an unhandled 500.
  app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ message: statusCode === 500 ? "Internal server error" : err.message });
  });
  return app;
};

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for an invalid payload before ever touching the database", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "ab", email: "not-an-email", password: "123" });

    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("returns 409 when the email or username is already in use", async () => {
    User.findOne.mockResolvedValue(User.__mockUser);
    const app = buildApp();

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "shivang", email: "shivang@example.com", password: "abcdef" });

    expect(res.status).toBe(409);
  });

  it("returns 201 and a token on successful registration", async () => {
    User.findOne.mockResolvedValue(null);
    User.create.mockResolvedValue(User.__mockUser);
    const app = buildApp();

    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "shivang", email: "shivang@example.com", password: "abcdef" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe("fake.jwt.token");
    expect(res.body.user.username).toBe("shivang");
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for a missing password before touching the database", async () => {
    const app = buildApp();
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.com" });

    expect(res.status).toBe(400);
    expect(User.findOne).not.toHaveBeenCalled();
  });

  it("returns 401 when the user doesn't exist", async () => {
    User.findOne.mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(res.status).toBe(401);
  });

  it("returns 401 when the password is wrong", async () => {
    User.__mockUser.comparePassword.mockResolvedValue(false);
    User.findOne.mockResolvedValue(User.__mockUser);
    const app = buildApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "shivang@example.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
  });

  it("returns 200 and a token on successful login", async () => {
    User.__mockUser.comparePassword.mockResolvedValue(true);
    User.findOne.mockResolvedValue(User.__mockUser);
    const app = buildApp();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "shivang@example.com", password: "correctpassword" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBe("fake.jwt.token");
  });
});
