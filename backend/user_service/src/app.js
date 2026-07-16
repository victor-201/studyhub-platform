// src/app.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import bodyParser from "body-parser";

import { pool } from "./config/db.js";

// Routes
import { createRoutes } from "./routes/index.js";

// Repositories
import { UserRepository } from "./repos/UserRepository.js";
import { UserProfileDetailsRepository } from "./repos/UserProfileDetailsRepository.js";
import { UserPrivacySettingsRepository } from "./repos/UserPrivacySettingsRepository.js";
import { UserFollowsRepository } from "./repos/UserFollowsRepository.js";
import { UserSocialLinksRepository } from "./repos/UserSocialLinksRepository.js";
import { UserInterestsRepository } from "./repos/UserInterestsRepository.js";
import { IncomingEventRepository } from "./repos/IncomingEventRepository.js";

// Services
import { ProfileService } from "./services/ProfileService.js";
import { FollowService } from "./services/FollowService.js";

export function createApp() {
  const app = express();

  // Middleware cơ bản
  app.use(helmet());
  app.use(cors({
    origin: ["https://victor-studyhub.pages.dev", "http://localhost:5173"],
    credentials: true,
  }));
  app.use(morgan("dev"));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Initialize repositories
  const userRepo = new UserRepository(pool);
  const profileRepo = new UserProfileDetailsRepository(pool);
  const privacyRepo = new UserPrivacySettingsRepository(pool);
  const followRepo = new UserFollowsRepository(pool);
  const socialRepo = new UserSocialLinksRepository(pool);
  const interestsRepo = new UserInterestsRepository(pool);
  const eventsRepo = new IncomingEventRepository(pool);

  // Initialize services
  const profileService = new ProfileService({
    userRepo,
    profileRepo,
    privacyRepo,
    socialRepo,
    interestsRepo,
    eventsRepo,
  });

  const followService = new FollowService({
    followRepo,
  });

  // Mount routers
  app.use("/api/v1/user", createRoutes({ profileService, followService }));

  // Health check
  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}
