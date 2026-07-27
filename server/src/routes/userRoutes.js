import express from "express";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @route  GET /api/users?search=abc
// Returns all users except the requester, optionally filtered by search text
router.get("/", protect, async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch users", error: err.message });
  }
});

export default router;
