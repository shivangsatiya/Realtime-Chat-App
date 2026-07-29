import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import validate from "../src/middleware/validate.js";
import { ValidationError } from "../src/middleware/ValidationError.js";
import asyncHandler from "../src/middleware/asyncHandler.js";

describe("validate middleware", () => {
  const schema = z.object({ name: z.string().min(1, "Name is required") });

  it("calls next() with no arguments on valid input, and replaces req.body with the parsed value", () => {
    const req = { body: { name: "  Wire  " } };
    const next = vi.fn();
    const withTrim = z.object({ name: z.string().trim().min(1) });

    validate(withTrim)(req, {}, next);

    expect(next).toHaveBeenCalledWith(); // called with no error
    expect(req.body.name).toBe("Wire"); // trimmed
  });

  it("calls next(ValidationError) on invalid input, without ever calling the route handler", () => {
    const req = { body: { name: "" } };
    const next = vi.fn();

    validate(schema)(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errArg = next.mock.calls[0][0];
    expect(errArg).toBeInstanceOf(ValidationError);
    expect(errArg.statusCode).toBe(400);
    expect(errArg.details).toEqual([{ field: "name", message: "Name is required" }]);
  });

  it("validates req.params or req.query when a source is given, not just req.body", () => {
    const paramsSchema = z.object({ id: z.string().regex(/^[0-9a-fA-F]{24}$/) });
    const req = { params: { id: "not-a-real-id" } };
    const next = vi.fn();

    validate(paramsSchema, "params")(req, {}, next);

    expect(next.mock.calls[0][0]).toBeInstanceOf(ValidationError);
  });
});

describe("asyncHandler", () => {
  it("calls the wrapped handler normally when it resolves", async () => {
    const handler = vi.fn(async (req, res) => res.send("ok"));
    const wrapped = asyncHandler(handler);
    const res = { send: vi.fn() };
    const next = vi.fn();

    await wrapped({}, res, next);

    expect(res.send).toHaveBeenCalledWith("ok");
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a thrown/rejected error to next(err) instead of crashing", async () => {
    const boom = new Error("boom");
    const handler = vi.fn(async () => {
      throw boom;
    });
    const wrapped = asyncHandler(handler);
    const next = vi.fn();

    await wrapped({}, {}, next);

    expect(next).toHaveBeenCalledWith(boom);
  });
});
