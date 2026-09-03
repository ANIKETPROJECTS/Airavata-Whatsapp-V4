import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import webhookRouter from "./routes/webhook";
import { logger } from "./lib/logger";

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
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);
// Accept the webhook at the root path as well as /api/webhook. Meta callback
// URLs are commonly configured without the API prefix, and both paths are
// safe because webhookRouter contains only Meta's verification/event handlers.
app.use(webhookRouter);

// Serve React frontend static files
// __dirname = <root>/artifacts/api-server/dist
// ../../../ → dist → api-server → artifacts → workspace root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../../artifacts/airavata/dist/public");

app.use(express.static(frontendDist));

// SPA fallback – any non-API route returns index.html
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

export default app;
