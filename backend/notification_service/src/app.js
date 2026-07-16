// src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";

import env from "./config/env.js";

// Repositories
import { NotificationRepository } from "./repos/NotificationRepository.js";
import { NotificationReceiverRepository } from "./repos/NotificationReceiverRepository.js";

// Services
import { NotificationService } from "./services/NotificationService.js";

// Routes
import { createNotificationRouter } from "./routes/notificationRoutes.js";

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
    const notificationRepo = new NotificationRepository();
    const receiverRepo = new NotificationReceiverRepository();

    // ===== Services =====
    const notificationService = new NotificationService({
        notificationRepo,
        receiverRepo,
    });

    const deps = { notificationService };

    // ===== Routes =====
    app.use(env.API_PREFIX || "/api/v1/notification", createNotificationRouter(deps));

    // ===== Health check =====
    app.get("/health", (req, res) => {
        res.json({
            status: "ok",
            service: "notification-service",
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
        console.error("[NotificationService] Unhandled error:", err);
        res.status(err.status || 500).json({
            error: err.message || "Internal Server Error",
        });
    });

    // ===== Attach deps to app.locals =====
    app.locals.deps = deps;
    app.locals.repos = {
        notificationRepo,
        receiverRepo,
    };

    return app;
}
