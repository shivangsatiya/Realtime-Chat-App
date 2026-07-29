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

// Conversations are sorted by updatedAt (most recent activity first), not
// creation order, so a single-field cursor risks colliding when two
// conversations share the same updatedAt. This pairs it with the
// conversation's own _id as a tiebreaker for a stable cursor.
export const conversationsPaginationQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  cursorId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});
