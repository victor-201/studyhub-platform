// src/app.js
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import compression from "compression";

import env from "./config/env.js";

// Repositories
import { ConversationRepository } from "./repos/ConversationRepository.js";
import { MessageRepository } from "./repos/MessageRepository.js";

// Services
import { ChatService } from "./services/ChatService.js";

// Routes
import { createChatRouter } from "./routes/chatRoutes.js";

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
    const conversationRepo = new ConversationRepository();
    const messageRepo = new MessageRepository();

    // ===== Services =====
    const chatService = new ChatService({
        conversationRepo,
        messageRepo,
    });

    const deps = { chatService, conversationRepo };

    // ===== Routes =====
    app.use(env.API_PREFIX || "/api/v1/chat", createChatRouter(deps));

    // ===== Health check =====
    app.get("/health", (req, res) => {
        res.json({
            status: "ok",
            service: "chat-service",
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
        console.error("[ChatService] Unhandled error:", err);
        res.status(err.status || 500).json({
            error: err.message || "Internal Server Error",
        });
    });

    // ===== Attach deps to app.locals =====
    app.locals.deps = deps;
    app.locals.repos = {
        conversationRepo,
        messageRepo,
    };

    return app;
}
