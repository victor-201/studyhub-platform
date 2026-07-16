// src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";

import env from "./config/env.js";
import { pool } from "./config/db.js";

// Repositories
import GroupRepository from "./repos/GroupRepository.js";
import GroupMemberRepository from "./repos/GroupMemberRepository.js";
import GroupJoinRequestRepository from "./repos/GroupJoinRequestRepository.js";
import GroupActivityLogRepository from "./repos/GroupActivityLogRepository.js";
import OutboxRepository from "./repos/OutboxRepository.js";
import IncomingEventRepository from "./repos/IncomingEventRepository.js";

// Services
import { GroupService } from "./services/GroupService.js";
import { MemberService } from "./services/MemberService.js";
import { OutboxService } from "./services/OutboxService.js";
import { IncomingEventService } from "./services/IncomingEventService.js";

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
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(env.LOG_FORMAT || "dev"));
  app.use(compression());

  // ===== Repositories =====
  const groupRepo = new GroupRepository(pool);
  const memberRepo = new GroupMemberRepository(pool);
  const joinRepo = new GroupJoinRequestRepository(pool);
  const activityRepo = new GroupActivityLogRepository(pool);
  const outboxRepo = new OutboxRepository(pool);
  const incomingRepo = new IncomingEventRepository(pool);

  // ===== Services =====
  const groupService = new GroupService({ groupRepo, memberRepo, joinRepo, activityRepo });
  const memberService = new MemberService({ memberRepo, activityRepo });
  const outboxService = new OutboxService({ outboxRepo });
  const incomingEventService = new IncomingEventService({ incomingRepo });

  const deps = { groupService, memberService, outboxService, incomingEventService };

  // ===== Routes =====
  app.use(env.API_PREFIX || "/api/v1/group", createRouter(deps));

  // ===== Health check =====
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "group-service",
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
    console.error("[GroupService] Unhandled error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
    });
  });

  // ===== Attach deps to app.locals =====
  app.locals.deps = deps;
  app.locals.repos = {
    groupRepo,
    memberRepo,
    joinRepo,
    activityRepo,
    outboxRepo,
    incomingRepo,
  };

  // ===== Start background event loops (AFTER rabbit is ready) =====
  setImmediate(() => publishPendingEventsLoop(outboxService));
  setImmediate(() => initEventConsumers(deps, incomingEventService));

  return app;
}
