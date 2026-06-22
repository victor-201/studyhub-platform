# StudyHub

Social learning platform for students. Share study materials, create study groups, real-time chat, threaded comments, and ratings.

## Architecture

Microservice architecture with an API Gateway (Kong) routing to six backend services. Each service has its own database and communicates asynchronously via RabbitMQ using the transactional outbox pattern.

```
Client (React SPA)
    |
Kong API Gateway (:8000)
    |
    +-- auth-service (:3000)        Authentication, OAuth, RBAC, admin    (MySQL)
    +-- user-service (:3001)        Profiles, follows, privacy            (MySQL)
    +-- group-service (:3002)       Study groups, members, requests       (MySQL)
    +-- document-service (:3003)    Documents, tags, comments, bookmarks  (MySQL)
    +-- notification-service (:3005) Notifications                        (MongoDB)
    +-- chat-service (:3006)        Real-time messaging, Socket.IO        (MongoDB)

RabbitMQ (async event bus across all services)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 7, React Router 7, Tailwind CSS 4 |
| Backend | Node.js 20, Express 5 |
| Databases | MySQL 8, MongoDB 6 |
| API Gateway | Kong 3.6 (declarative, DB-less) |
| Message Broker | RabbitMQ |
| Auth | JWT (access + refresh tokens), bcrypt, OAuth 2.0 (Google, Facebook, GitHub, LinkedIn) |
| File Storage | Cloudinary |
| Real-time | Socket.IO |
| i18n | i18next (English, Vietnamese) |
| Container | Docker, Docker Compose |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- MySQL 8.0 (if running services locally)
- MongoDB 6 (if running services locally)

### Environment Setup

Each backend service has an `.env.example` file. Copy it to `.env` and fill in the values:

```bash
cd backend/auth-service && cp .env.example .env
cd backend/user-service && cp .env.example .env
cd backend/group-service && cp .env.example .env
cd backend/document-service && cp .env.example .env
cd backend/chat-service && cp .env.example .env
cd backend/notification-service && cp .env.example .env
```

The frontend also has `.env` for the API gateway URL and OAuth client IDs.

### Run with Docker Compose

```bash
docker compose -f deployment/docker/docker-compose.yml up -d
```

This starts all backend services, databases, RabbitMQ, and Kong. The frontend runs separately:

```bash
cd frontend/web
npm install
npm run dev
```

### Database Setup

SQL schemas and seed data are in `database/`:

```bash
# Import schema
mysql -h localhost -u root -p auth_db < database/schemas/auth_db.sql
mysql -h localhost -u root -p user_db < database/schemas/user_db.sql
# ... repeat for group_db, document_db

# Seed data
mysql -h localhost -u root -p auth_db < database/seeds/auth_db_seed.sql
```

MongoDB collections are created automatically by Mongoose on first run.

## Project Structure

```
backend/
  auth_service/         Registration, login, OAuth, email verification, admin panel
  user_service/         Profile management, follow system, privacy settings
  group_service/        Study groups, members, join requests, activity logs
  document_service/     File upload, tags, bookmarks, threaded comments, approvals
  chat_service/         Conversations, messages, Socket.IO real-time events
  notification_service/ User notification delivery

frontend/web/
  src/
    api/                Axios client with token refresh interceptor
    components/         Reusable UI (common, admin, user)
    contexts/           Auth, Theme
    hooks/              useAuth, useChat, useDocument, useGroup, useSocket, etc.
    i18n/               Locales (en, vi)
    layouts/            AuthLayout, MainLayout
    pages/              auth/, user/, admin/, error/
    routes/             AppRouter, PrivateRoute, PublicRoute
    services/           API service wrappers
    store/              Redux Toolkit (auth slice)
    utils/              Validation, date, Google OAuth helpers

database/
  schemas/              SQL DDL for all four MySQL databases
  seeds/                Sample data for development

deployment/
  docker/               Docker Compose for full-stack orchestration
  kong/                 Kong declarative configuration
```

## API

All endpoints are proxied through Kong at `/api/v1/<service>/...`. See each service's `routes/` directory for the full route map.

Key endpoints:

| Method | Path | Service |
|--------|------|---------|
| POST | /api/v1/auth/register | auth |
| POST | /api/v1/auth/login | auth |
| POST | /api/v1/auth/oauth/login | auth |
| GET | /api/v1/auth/me | auth |
| GET | /api/v1/user/profile/:user_id | user |
| GET/POST | /api/v1/group | group |
| POST | /api/v1/document | document |
| GET | /api/v1/chat/conversations | chat |
| GET | /api/v1/notification | notification |

## Features

- **Authentication**: Email/password, OAuth (Google, Facebook, GitHub, LinkedIn), email verification, password reset
- **Authorization**: Role-based (OWNER, ADMIN, MODERATOR, USER) with granular permissions
- **User Profiles**: Display name, avatar, bio, social links, interests, privacy controls per field
- **Follow System**: One-way follow, mutual follow = friends, friend list view
- **Study Groups**: Public/restricted groups, join requests, member roles, activity logs, ownership transfer
- **Document Sharing**: Upload study materials, tags, threaded comments, bookmarks, download tracking, group document approval workflow
- **Real-time Chat**: Conversations, direct messages, Socket.IO for live updates
- **Notifications**: Event-driven via RabbitMQ, per-user notification list, read/unread tracking
- **Admin Panel**: User management (block/delete/restore), audit logs, role & permission management, dashboard
- **Internationalization**: English and Vietnamese (i18next-based)
- **Dark Mode**: Tailwind CSS class strategy with theme context

## Development

### Running a single service locally

```bash
cd backend/auth-service
npm install
npm run dev    # uses nodemon for hot-reload
```

### Code quality

```bash
npm run lint       # ESLint
npm run test       # Jest (test files not yet implemented)
```

### Commit conventions

Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `style:`, `docs:`

## Known Issues

- The frontend `package.json` shows "ev-charging-portal" as the project name — a remnant from an earlier template. The frontend `index.html` title should also be "StudyHub".
- Several backend services have `"name": "user-service"` in their `package.json` (copy-paste from user-service). Each should reflect its actual service name.
- `@reduxjs/toolkit` is used in `frontend/web/src/store/` but is not declared in `frontend/web/package.json` — it may resolve transitively but should be added explicitly.
- Only `auth.json` locale files exist; other UI text is hardcoded.
- No test files have been written yet despite Jest being configured.
- No frontend Dockerfile or CI/CD pipeline exists.

## License

MIT
