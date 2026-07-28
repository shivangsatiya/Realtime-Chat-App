import express from "express";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";
import validate from "../middleware/validate.js";
import { searchQuerySchema } from "../validators/userValidators.js";

const router = express.Router();

// @route  GET /api/users?search=abc
// Returns all users except the requester, optionally filtered by search text
router.get(
  "/",
  protect,
  validate(searchQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { search } = req.query;
    const filter = { _id: { $ne: req.user._id } };

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter).select("-password").limit(50);
    res.json({ users: users.map((u) => u.toSafeObject()) });
  })
);

export default router;