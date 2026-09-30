import express, { type ErrorRequestHandler, type Express } from "express";
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
const flowWriteJsonParser = express.json({ limit: "5mb" });
app.use((req, res, next) => {
  const isFlowCreate = req.method === "POST" && req.path === "/api/flows";
  const isFlowUpdate = req.method === "PUT" && /^\/api\/flows\/[^/]+$/.test(req.path);
  if (!isFlowCreate && !isFlowUpdate) return next();
  flowWriteJsonParser(req, res, next);
});
// Imported chatbot graphs commonly exceed Express's 100 KB JSON default.
// 512 KB accommodates imported graphs while keeping individual writes bounded.
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true }));
const bodyParserErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err?.type === "entity.too.large") {
    res.status(413).json({
      error: "Request body too large. Flow edits are limited to 5 MB; other JSON requests are limited to 512 KB.",
    });
    return;
  }
  next(err);
};
app.use(bodyParserErrorHandler);

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
