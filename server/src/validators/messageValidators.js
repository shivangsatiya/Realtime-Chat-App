import { z } from "zod";

export const conversationIdParamSchema = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid conversation ID"),
});
