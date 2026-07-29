import { describe, it, expect } from "vitest";
import { isParticipant } from "../src/sockets/isParticipant.js";

describe("isParticipant", () => {
  it("returns false when the conversation is null (e.g. a deleted or bad ID)", () => {
    expect(isParticipant(null, "user1")).toBe(false);
  });

  it("returns false when the conversation is undefined", () => {
    expect(isParticipant(undefined, "user1")).toBe(false);
  });

  it("returns true when the userId is among the participants", () => {
    const conversation = { participants: ["user1", "user2"] };
    expect(isParticipant(conversation, "user1")).toBe(true);
  });

  it("returns false when the userId is not among the participants", () => {
    const conversation = { participants: ["user1", "user2"] };
    expect(isParticipant(conversation, "user3")).toBe(false);
  });

  it("compares participants as strings, so it works with real Mongoose ObjectIds", () => {
    // Mongoose ObjectIds aren't plain strings — they're objects whose
    // toString() returns the hex id. This is the exact case the
    // Milestone 1 fix depends on: String(objectId) === plainString.
    const fakeObjectId = { toString: () => "507f1f77bcf86cd799439011" };
    const conversation = { participants: [fakeObjectId] };
    expect(isParticipant(conversation, "507f1f77bcf86cd799439011")).toBe(true);
  });

  it("returns false for an empty participants array", () => {
    const conversation = { participants: [] };
    expect(isParticipant(conversation, "user1")).toBe(false);
  });
});
