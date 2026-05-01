import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, RequestHandler } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { User as SelectUser } from "@workspace/db";
import { logger } from "./lib/logger";

const DEV_SESSION_SECRET_FALLBACK = "salespro-dev-only-not-for-production";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

/**
 * Middleware that requires a valid authenticated session.
 * Returns 401 with `{ message: "Unauthorized" }` and does not invoke any
 * downstream handler when the request is not authenticated.
 * Apply this to any /api route that should only serve logged-in users.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

/**
 * Middleware that requires the authenticated user to have role === "admin".
 * Returns 401 if not authenticated, 403 if authenticated but not an admin.
 * Apply this to any /api route that performs destructive or admin-only writes
 * (deletes, bulk uploads, archive imports, admin exports, etc.).
 *
 * Should be chained AFTER `requireAuth` (or after the global `requireAuth`
 * mount on the `/api` router) so the 401 case is already handled, but it is
 * also safe to use stand-alone — it returns 401 when there is no user.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if ((req.user as SelectUser).role !== "admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  return next();
};

export function setupAuth(app: Express) {
  const isProduction = app.get("env") === "production";

  // SESSION_SECRET is required in production. The startup check in
  // src/index.ts already enforces this and aborts the process if it's
  // missing, so by the time we get here in production the env var must
  // be set. The check below is a defensive last line of defence in case
  // setupAuth is ever invoked from a different entry point.
  const envSecret = process.env.SESSION_SECRET;
  if (isProduction && !envSecret) {
    throw new Error(
      "SESSION_SECRET environment variable is required in production. " +
        "Refusing to start with a hardcoded fallback secret because that " +
        "would let anyone forge valid login cookies for any user.",
    );
  }
  if (!envSecret) {
    logger.warn(
      "SESSION_SECRET is not set; using an insecure development fallback. " +
        "Set SESSION_SECRET to a long random value before deploying.",
    );
  }
  const secret = envSecret || DEV_SESSION_SECRET_FALLBACK;

  const sessionSettings: session.SessionOptions = {
    secret,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  };

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          // Check for temp password
          if (user.tempPassword && password === user.tempPassword) {
             return done(null, user);
          }
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const hashedPassword = await bcrypt.hash(req.body.password, 10);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);
        res.clearCookie("connect.sid", { path: "/" });
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
  
  // Generate a temporary password for a user. Restricted to authenticated
  // admins. The endpoint must NOT be reachable anonymously — previously it
  // returned the temp password to anyone who knew an admin username, which
  // let anyone take over an admin account.
  //
  // The freshly-generated temp password is stored on the user record but
  // is intentionally NOT included in the response body. To retrieve it,
  // an admin must make a separate explicit call to
  // POST /api/admin/reveal-temp-password. This split keeps credential
  // material out of the response that triggers generation (so things like
  // request loggers, response interceptors, or accidentally-shared
  // browser network logs don't capture a usable password).
  app.post("/api/forgot-password", requireAdmin, async (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).send("Username is required");
    }

    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(404).send("User not found");

    const tempPassword = Math.random().toString(36).slice(-8);
    await storage.updateUser(user.id, {
      tempPassword,
      mustResetPassword: true,
    });

    return res.json({
      message:
        "Temporary password issued. Use POST /api/admin/reveal-temp-password to retrieve it.",
    });
  });

  // Admin-only endpoint that returns the currently-stored temporary
  // password for a user. Kept separate from /api/forgot-password so the
  // act of generating a temp password and the act of revealing one are
  // distinct, auditable operations. Returns 404 if the user has no
  // pending temp password so callers can't probe for active resets they
  // didn't initiate.
  app.post("/api/admin/reveal-temp-password", requireAdmin, async (req, res) => {
    const { username } = req.body;
    if (!username || typeof username !== "string") {
      return res.status(400).send("Username is required");
    }

    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(404).send("User not found");
    if (!user.tempPassword) {
      return res
        .status(404)
        .send("No temporary password is set for this user");
    }

    return res.json({ tempPassword: user.tempPassword });
  });

  app.post("/api/reset-password", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    await storage.updateUser(req.user!.id, { 
      password: hashedPassword, 
      tempPassword: null, 
      mustResetPassword: false 
    });
    res.sendStatus(200);
  });
}
