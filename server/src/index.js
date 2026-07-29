import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import mongoose from "mongoose";
import pinoHttp from "pino-http";
import { Server } from "socket.io";

import { connectDB } from "./config/db.js";
import logger from "./config/logger.js";
import { initSocket } from "./sockets/socketHandler.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import conversationRoutes from "./routes/conversationRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";

dotenv.config();

// Fail fast at boot if required config is missing, rather than failing
// confusingly deep inside the first request that needs it (e.g. jwt.sign
// throwing on an undefined secret during the first login attempt).
const REQUIRED_ENV_VARS = ["MONGO_URI", "JWT_SECRET"];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  logger.fatal(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));

// Reports actual dependency health (the database connection), not just
// "the process is running" — so an orchestrator/load balancer can tell a
// genuinely degraded instance apart from a healthy one.
app.get("/api/health", (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? "ok" : "degraded",
    database: dbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/uploads", uploadRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Centralized error handler. Every route error now funnels through here —
// unexpected exceptions via asyncHandler, and validation failures via
// ValidationError — both simply call next(err). Anything without a
// .statusCode (i.e. every error case that existed before this change)
// behaves exactly as it did previously: logged, and a generic 500.
app.use((err, req, res, next) => {
  logger.error({ err }, "Request error");
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;
  const response = { message };
  if (err.details) response.details = err.details;
  res.status(statusCode).json(response);
});

const io = new Server(server, {
  cors: { origin: CLIENT_URL, credentials: true },
});
initSocket(io);

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// and sockets drain, close the DB connection, then exit. Render (and any
// real deploy platform) sends SIGTERM on every redeploy — without this,
// that abruptly drops whatever was in flight at that moment.
const shutdown = (signal) => {
  logger.info(`${signal} received, starting graceful shutdown`);

  io.close(async () => {
    logger.info("Server and socket connections closed");
    try {
      await mongoose.connection.close(false);
      logger.info("MongoDB connection closed");
    } catch (err) {
      logger.error({ err }, "Error closing MongoDB connection");
    } finally {
      process.exit(0);
    }
  });

  // Don't hang forever if something (e.g. a stuck connection) never drains
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
