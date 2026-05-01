import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { User as SelectUser } from "@workspace/db";

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
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "salespro-secret",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  };

  if (app.get("env") === "production") {
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
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
  
  app.post("/api/forgot-password", async (req, res) => {
    const { username } = req.body;
    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(404).send("User not found");
    
    if (user.role !== "admin") {
      return res.status(403).send("Only admin can use forgot password functionality");
    }
    
    const tempPassword = Math.random().toString(36).slice(-8);
    await storage.updateUser(user.id, { 
      tempPassword, 
      mustResetPassword: true 
    });
    
    res.json({ message: "Temporary password generated", tempPassword });
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
