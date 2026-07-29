import rateLimit from "express-rate-limit";

// Applied only to /api/auth/register and /api/auth/login — the two routes
// most exposed to brute force / credential stuffing / registration spam.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." },
});
