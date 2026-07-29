import mongoose from "mongoose";
import logger from "./logger.js";

export const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error("MONGO_URI is not set in .env");
    }
    const conn = await mongoose.connect(uri);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error({ err }, "MongoDB connection error");
    process.exit(1);
  }
};
