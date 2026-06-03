import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS_ORIGIN: comma-separated list of allowed origins, or "*" for all.
// Defaults to true (mirror request origin) which is fine for same-host setups.
// On Hostinger, set this to your frontend domain, e.g.:
//   CORS_ORIGIN=https://yourdomain.com,http://yourdomain.com
const corsOrigin: string | string[] | boolean = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN === "*"
    ? "*"
    : process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : true;

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    exposedHeaders: ["set-cookie"],
  }),
);
app.use(
  express.json({
    limit: "10mb",
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/api", router);

export default app;
