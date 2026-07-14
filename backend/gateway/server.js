const express = require("express");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const app = express();
const PORT = process.env.PORT || 8000;

const ALLOWED_ORIGINS = [
  "https://studyhub-platform.pages.dev",
  "http://localhost:5173",
];

const CORS_HEADERS = {
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "Accept, Authorization, Content-Type, X-Requested-With",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-expose-headers": "X-Auth-Token",
  "access-control-max-age": "3600",
};

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  }
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.get("/health", (_req, res) => res.send("OK"));

function proxyTo(url, method, headers, body, timeoutMs) {
  const parsed = new URL(url);
  const httpModule = parsed.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: method,
      timeout: timeoutMs,
      rejectUnauthorized: false,
    };
    const req = httpModule.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

async function proxyWithRetry(targetPath, method, headers, body, timeoutMs = 30000) {
  const MAX_RETRIES = 12;
  const RETRY_DELAY = 5000;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await proxyTo(targetPath, method, headers, body, timeoutMs);
      if (result.status !== 502) return result;
      if (attempt < MAX_RETRIES) {
        console.warn(`[gateway] 502 on ${targetPath}, retry ${attempt}/${MAX_RETRIES}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      } else {
        return result;
      }
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[gateway] error on ${targetPath}: ${err.message}, retry ${attempt}/${MAX_RETRIES}`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      } else {
        throw err;
      }
    }
  }
}

const services = [
  { path: "/api/v1/auth", target: "https://sh-auth-service.onrender.com" },
  { path: "/api/v1/user", target: "https://sh-user-service.onrender.com" },
  { path: "/api/v1/group", target: "https://sh-group-service.onrender.com" },
  { path: "/api/v1/document", target: "https://sh-document-service.onrender.com" },
  { path: "/api/v1/chat", target: "https://sh-chat-service.onrender.com" },
  { path: "/api/v1/notification", target: "https://sh-notification-service.onrender.com" },
];

services.forEach(({ path, target }) => {
  app.use(path, async (req, res) => {
    const targetUrl = target + req.originalUrl;
    const requestBody = req.method !== "GET" && req.method !== "HEAD"
      ? JSON.stringify(req.body || {}) : null;
    try {
      const result = await proxyWithRetry(targetUrl, req.method, req.headers, requestBody, 30000);
      const bodyStr = result.body.toString("utf-8");
      if (result.headers["content-type"]) {
        res.setHeader("content-type", result.headers["content-type"]);
      }
      res.status(result.status).send(bodyStr);
    } catch (err) {
      console.error(`[gateway] proxy failed for ${targetUrl}: ${err.message}`);
      res.status(502).send("Bad Gateway");
    }
  });
});

app.listen(PORT, () => console.log(`gateway listening on ${PORT}`));
