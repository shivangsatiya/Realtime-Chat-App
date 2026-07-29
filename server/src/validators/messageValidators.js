import { z } from "zod";

export const conversationIdParamSchema = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversation ID"),
});

export const searchMessagesQuerySchema = z.object({
  q: z
    .string({ error: "Search text is required" })
    .trim()
    .min(1, "Search text is required")
    .max(200, "Search text is too long"),
});