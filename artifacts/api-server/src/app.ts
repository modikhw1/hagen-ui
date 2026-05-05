import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import webhookRouter from "./routes/stripe-webhook.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = [
  process.env["FRONTEND_URL"],
  process.env["REPLIT_DEV_DOMAIN"]
    ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
    : undefined,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }
      const allowed =
        allowedOrigins.some((o) => origin.startsWith(o)) ||
        origin.includes(".replit.dev") ||
        origin.includes(".repl.co") ||
        origin.includes(".lovable.app") ||
        origin.includes(".lovableproject.com") ||
        origin === "https://letrend.se" ||
        origin === "https://www.letrend.se" ||
        origin === "http://localhost:3000" ||
        origin === "http://localhost:5173" ||
        origin === "http://localhost:8080";
      callback(null, allowed);
    },
    credentials: true,
  }),
);

app.use(cookieParser());

// Stripe webhook must receive the raw body for signature verification.
// Mount BEFORE express.json() so the raw buffer is preserved.
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  webhookRouter,
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
