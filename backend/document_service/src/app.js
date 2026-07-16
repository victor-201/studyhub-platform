import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";

import env from "./config/env.js";
import { pool } from "./config/db.js";

// Repos
import DocumentRepository from "./repos/DocumentRepository.js";
import BookmarkRepository from "./repos/DocumentBookmarkRepository.js";
import CommentRepository from "./repos/DocumentCommentRepository.js";
import DownloadRepository from "./repos/DocumentDownloadRepository.js";
import DocumentTagRepository from "./repos/DocumentTagRepository.js";
import DocumentGroupRepository from "./repos/./GroupDocumentRepository.js";
import OutboxRepository from "./repos/OutboxRepository.js";

// Services
import DocumentService from "./services/DocumentService.js";
import DocumentInteractionsService from "./services/DocumentInteractionsService.js";
import OutboxService from "./services/OutboxService.js";

// Integrations
import GroupServiceClient from "./integrations/GroupServiceClient.js";

// Routes
import { createRouter } from "./routes/index.js";

// Events
import { publishPendingEventsLoop } from "./core/events/publish.js";
import { initEventConsumers } from "./core/events/consume.js";

export function createApp() {
  const app = express();
  // ===== Middlewares =====
  app.use(helmet());
  app.use(cors({
    origin: ["https://victor-studyhub.pages.dev", "http://localhost:5173"],
    credentials: true,
  }));
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(env.LOG_FORMAT || "dev"));
  app.use(compression());

  // ===== Repositories =====
  const documentRepo = new DocumentRepository(pool);
  const bookmarkRepo = new BookmarkRepository(pool);
  const commentRepo = new CommentRepository(pool);
  const downloadRepo = new DownloadRepository(pool);
  const tagRepo = new DocumentTagRepository(pool);
  const groupDocRepo = new DocumentGroupRepository(pool);
  const outboxRepo = new OutboxRepository(pool);
  const groupClient = new GroupServiceClient({
    baseURL: env.GROUP_SERVICE_URL,
  });

  // ===== Services =====
  const documentService = new DocumentService({
    documentRepo,
    tagRepo,
    commentRepo,
    bookmarkRepo,
    downloadRepo,
    groupDocRepo,
    groupClient,
    outboxRepo,
  });

  const documentInteractionsService = new DocumentInteractionsService({
    bookmarkRepo,
    commentRepo,
    downloadRepo,
    documentRepo,
    groupDocRepo,
    groupClient,
    outboxRepo,
  });

  const outboxService = new OutboxService({ outboxRepo });

  const deps = {
    documentService,
    documentInteractionsService,
    outboxService,
  };

  // ===== Routes =====
  app.use(env.API_PREFIX || "/api/v1/document", createRouter(deps));

  // ===== Health check =====
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "document-service",
      env: env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ping", (req, res) => res.send("pong"));

  // ===== 404 handler =====
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found", path: req.originalUrl });
  });

  // ===== Error handler =====
  app.use((err, req, res, next) => {
    console.error("[DocumentService] Unhandled error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
    });
  });

  // ===== Attach deps to app.locals =====
  app.locals.deps = deps;
  app.locals.repos = {
    documentRepo,
    bookmarkRepo,
    commentRepo,
    downloadRepo,
    outboxRepo,
  };

  // ===== Start background loops =====
  setImmediate(() => publishPendingEventsLoop(outboxService));
  setImmediate(() => initEventConsumers(deps));

  return app;
}
