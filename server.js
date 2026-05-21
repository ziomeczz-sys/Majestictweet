"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "database.json");
const SESSIONS_PATH = path.join(DATA_DIR, "sessions.json");
const PORT = Number(process.env.PORT || 3000);
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "ziomeczz";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_BODY_BYTES = 1024 * 64;
const PBKDF2_ITERATIONS = 210000;
const SECRET = process.env.SESSION_SECRET || "change-this-secret-before-public-hosting";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
};

let db = null;
let sessions = null;

function now() {
  return Date.now();
}

function id(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    color: user.color,
    role: user.role,
    title: user.title,
    verified: Boolean(user.verified),
    suspended: Boolean(user.suspended),
    joinedAt: user.joinedAt,
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, "sha512").toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [kind, iterationsText, salt, expected] = String(stored || "").split("$");
  if (kind !== "pbkdf2" || !salt || !expected) return false;
  const iterations = Number(iterationsText);
  const actual = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512");
  const expectedBuffer = Buffer.from(expected, "hex");
  return expectedBuffer.length === actual.length && crypto.timingSafeEqual(expectedBuffer, actual);
}

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("hex");
}

function signedSessionCookie(sessionId) {
  const payload = `${sessionId}.${sign(sessionId)}`;
  return `mt_session=${payload}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

function clearSessionCookie() {
  return "mt_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function parseCookies(req) {
  const output = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key) output[key] = decodeURIComponent(value.join("="));
  }
  return output;
}

function getSession(req) {
  const raw = parseCookies(req).mt_session;
  if (!raw) return null;
  const [sessionId, signature] = raw.split(".");
  if (!sessionId || signature !== sign(sessionId)) return null;
  const session = sessions[sessionId];
  if (!session || session.expiresAt < now()) {
    delete sessions[sessionId];
    persistSessions();
    return null;
  }
  const user = db.users.find((item) => item.id === session.userId && !item.suspended);
  return user ? { sessionId, user } : null;
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Musisz sie zalogowac." });
    return null;
  }
  return session;
}

function requireOwner(req, res) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (session.user.role !== "owner") {
    sendJson(res, 403, { error: "Brak dostepu do panelu wlasciciela." });
    return null;
  }
  return session;
}

async function ensureData() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const owner = {
      id: "owner",
      username: "ziomeczz",
      passwordHash: hashPassword(OWNER_PASSWORD),
      displayName: "ziomeczz",
      bio: "Konto wlasciciela Majestic Twitter.",
      color: "#0f1419",
      role: "owner",
      title: "CEO",
      verified: true,
      suspended: false,
      joinedAt: now(),
    };
    db = {
      users: [owner],
      posts: [
        {
          id: id("post"),
          userId: owner.id,
          text: "Witaj na Majestic Twitter. Tu wlasciciel ma panel, weryfikacje i etykiete CEO przy postach.",
          createdAt: now() - 60000,
        },
      ],
    };
    await persistDb();
  } else {
    db = JSON.parse(await fsp.readFile(DB_PATH, "utf8"));
  }

  if (!fs.existsSync(SESSIONS_PATH)) {
    sessions = {};
    await persistSessions();
  } else {
    sessions = JSON.parse(await fsp.readFile(SESSIONS_PATH, "utf8"));
  }
}

async function persistDb() {
  await fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

async function persistSessions() {
  await fsp.writeFile(SESSIONS_PATH, JSON.stringify(sessions, null, 2));
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(text);
}

function sanitizeUserName(username) {
  return String(username || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
}

function sanitizeText(value, max) {
  return String(value || "").replace(/\s+\n/g, "\n").trim().slice(0, max);
}

function validatePassword(password) {
  return typeof password === "string" && password.length >= 8 && password.length <= 128;
}

function validateColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#1d9bf0";
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Za duze dane."));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Niepoprawny JSON."));
      }
    });
    req.on("error", reject);
  });
}

function withAuthors(posts) {
  return posts
    .map((post) => {
      const author = db.users.find((user) => user.id === post.userId);
      if (!author || author.suspended) return null;
      return { ...post, author: publicUser(author) };
    })
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/session") {
      const session = getSession(req);
      sendJson(res, 200, {
        user: session ? publicUser(session.user) : null,
        posts: session ? withAuthors(db.posts) : [],
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/register") {
      const body = await readBody(req);
      const username = sanitizeUserName(body.username);
      const password = String(body.password || "");
      const displayName = sanitizeText(body.displayName, 32);
      const bio = sanitizeText(body.bio, 160);

      if (username.length < 3 || username.length > 24) {
        sendJson(res, 400, { error: "Login musi miec od 3 do 24 znakow." });
        return;
      }
      if (!validatePassword(password)) {
        sendJson(res, 400, { error: "Haslo musi miec minimum 8 znakow." });
        return;
      }
      if (!displayName) {
        sendJson(res, 400, { error: "Ustaw nazwe profilu." });
        return;
      }
      if (db.users.some((user) => user.username === username)) {
        sendJson(res, 409, { error: "Taki login juz istnieje." });
        return;
      }

      const user = {
        id: id("user"),
        username,
        passwordHash: hashPassword(password),
        displayName,
        bio,
        color: validateColor(body.color),
        role: "user",
        title: "",
        verified: false,
        suspended: false,
        joinedAt: now(),
      };
      db.users.push(user);
      await persistDb();
      await createSession(res, user);
      sendJson(res, 201, { user: publicUser(user), posts: withAuthors(db.posts) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/login") {
      const body = await readBody(req);
      const username = sanitizeUserName(body.username);
      const password = String(body.password || "");
      const user = db.users.find((item) => item.username === username);
      if (!user || user.suspended || !verifyPassword(password, user.passwordHash)) {
        sendJson(res, 401, { error: "Zly login albo haslo." });
        return;
      }
      await createSession(res, user);
      sendJson(res, 200, { user: publicUser(user), posts: withAuthors(db.posts) });
      return;
    }

    if (req.method === "POST" && pathname === "/api/logout") {
      const session = getSession(req);
      if (session) {
        delete sessions[session.sessionId];
        await persistSessions();
      }
      sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
      return;
    }

    if (req.method === "POST" && pathname === "/api/posts") {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await readBody(req);
      const text = sanitizeText(body.text, 280);
      if (!text) {
        sendJson(res, 400, { error: "Post nie moze byc pusty." });
        return;
      }
      const post = { id: id("post"), userId: session.user.id, text, createdAt: now() };
      db.posts.push(post);
      await persistDb();
      sendJson(res, 201, { post: withAuthors([post])[0], posts: withAuthors(db.posts) });
      return;
    }

    if (req.method === "PATCH" && pathname === "/api/profile") {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await readBody(req);
      session.user.displayName = sanitizeText(body.displayName, 32) || session.user.displayName;
      session.user.bio = sanitizeText(body.bio, 160);
      session.user.color = validateColor(body.color);
      await persistDb();
      sendJson(res, 200, { user: publicUser(session.user), posts: withAuthors(db.posts) });
      return;
    }

    if (req.method === "PATCH" && pathname === "/api/password") {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await readBody(req);
      if (!verifyPassword(String(body.currentPassword || ""), session.user.passwordHash)) {
        sendJson(res, 403, { error: "Aktualne haslo jest niepoprawne." });
        return;
      }
      if (!validatePassword(String(body.newPassword || ""))) {
        sendJson(res, 400, { error: "Nowe haslo musi miec minimum 8 znakow." });
        return;
      }
      session.user.passwordHash = hashPassword(String(body.newPassword));
      await persistDb();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/admin/users") {
      if (!requireOwner(req, res)) return;
      sendJson(res, 200, { users: db.users.map(publicUser) });
      return;
    }

    if (req.method === "PATCH" && pathname.startsWith("/api/admin/users/")) {
      if (!requireOwner(req, res)) return;
      const userId = pathname.split("/").pop();
      const target = db.users.find((user) => user.id === userId);
      if (!target) {
        sendJson(res, 404, { error: "Nie ma takiego uzytkownika." });
        return;
      }
      if (target.role === "owner") {
        sendJson(res, 400, { error: "Konta wlasciciela nie mozna zmienic z panelu." });
        return;
      }
      const body = await readBody(req);
      if (typeof body.verified === "boolean") target.verified = body.verified;
      if (typeof body.suspended === "boolean") target.suspended = body.suspended;
      if (typeof body.title === "string") target.title = sanitizeText(body.title, 16);
      await persistDb();
      sendJson(res, 200, { user: publicUser(target), users: db.users.map(publicUser), posts: withAuthors(db.posts) });
      return;
    }

    sendJson(res, 404, { error: "Nie znaleziono API." });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Blad zadania." });
  }
}

async function createSession(res, user) {
  const sessionId = id("session");
  sessions[sessionId] = { userId: user.id, createdAt: now(), expiresAt: now() + SESSION_TTL_MS };
  await persistSessions();
  res.setHeader("Set-Cookie", signedSessionCookie(sessionId));
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) sendText(res, 404, "Not found");
        else {
          res.writeHead(200, securityHeaders(".html"));
          res.end(fallback);
        }
      });
      return;
    }
    res.writeHead(200, securityHeaders(path.extname(filePath)));
    res.end(content);
  });
}

function securityHeaders(ext) {
  return {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'none'",
  };
}

async function main() {
  await ensureData();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  });
  server.listen(PORT, () => {
    console.log(`Majestic Twitter dziala: http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
