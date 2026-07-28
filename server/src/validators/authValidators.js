import { z } from "zod";

export const registerSchema = z.object({
  username: z
    .string({ error: "Username is required" })
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(24, "Username must be at most 24 characters"),
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
  password: z
    .string({ error: "Password is required" })
    .min(6, "Password must be at least 6 characters"),
});

export const loginSchema = z.object({
  email: z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Enter a valid email address"),
  password: z.string({ error: "Password is required" }).min(1, "Password is required"),
});
