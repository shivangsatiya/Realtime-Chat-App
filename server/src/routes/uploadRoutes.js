import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import { protect } from "../middleware/auth.js";
import asyncHandler from "../middleware/asyncHandler.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB cap
});

// Wrap multer so its errors (e.g. file too large) return a clean 400
// instead of falling through as an unhandled 500.
const uploadMiddleware = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Upload failed" });
    }
    next();
  });
};

// @route  POST /api/uploads
// Accepts a single file (multipart field name "file"), forwards it to
// Cloudinary, and returns the resulting URL for the client to attach to a
// message via the message:send socket event.
router.post(
  "/",
  protect,
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const isImage = req.file.mimetype.startsWith("image/");

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "wire-chat", resource_type: isImage ? "image" : "raw" },
        (error, uploadResult) => {
          if (error) reject(error);
          else resolve(uploadResult);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    res.status(201).json({
      url: result.secure_url,
      type: isImage ? "image" : "file",
      name: req.file.originalname,
    });
  })
);

export default router;
