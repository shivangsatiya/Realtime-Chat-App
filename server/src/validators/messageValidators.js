import { z } from "zod";

export const conversationIdParamSchema = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversation ID"),
});

// Cursor is the _id of the last message already loaded on the client — we
// fetch messages older than it. ObjectIds are roughly time-ordered, so
// sorting/cursoring on _id avoids needing a separate compound index on
// createdAt while giving the same effective ordering.
export const messagesPaginationQuerySchema = z.object({
  cursor: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid cursor").optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});

export const searchMessagesQuerySchema = z.object({
  q: z
    .string({ error: "Search text is required" })
    .trim()
    .min(1, "Search text is required")
    .max(200, "Search text is too long"),
  cursor: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid cursor").optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
});