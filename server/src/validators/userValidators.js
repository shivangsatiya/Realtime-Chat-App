import { z } from "zod";

export const searchQuerySchema = z.object({
  search: z.string().trim().max(100, "Search text is too long").optional(),
});
