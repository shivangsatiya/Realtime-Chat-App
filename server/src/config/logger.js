import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

// JSON logs in production (what a log aggregator / Render's log viewer wants),
// human-readable in development. Same logger instance either way — nothing
// else in the app needs to know which mode it's in.
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
});

export default logger;
