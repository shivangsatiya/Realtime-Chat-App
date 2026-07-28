import { z } from "zod";

// Matches a Mongo ObjectId's shape: 24 hex characters
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Must be a valid ID");

export const startPrivateSchema = z.object({
  userId: objectId,
});

export const createGroupSchema = z.object({
  name: z
    .string({ error: "Group name is required" })
    .trim()
    .min(1, "Group name is required")
    .max(80, "Group name must be at most 80 characters"),
  participantIds: z
    .array(objectId, { error: "participantIds is required" })
    .min(2, "A group needs at least 2 other participants"),
});
