import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { api } from "./src/server/api";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = new Hono();
const PORT = 3000;

// Mount our shared API under root (it hasBasePath('/api/v1') inside)
app.route("/", api);

async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    // Bridge Hono request/response to Connect/Vite dev server
    app.use("*", async (c, next) => {
      const req = (c.env as any).incoming;
      const res = (c.env as any).outgoing;
      if (!req || !res) {
        return next();
      }

      let handled = true;
      await new Promise<void>((resolve) => {
        vite.middlewares(req, res, () => {
          handled = false;
          resolve();
        });
        res.on("finish", resolve);
        res.on("close", resolve);
      });

      if (!handled) {
        return next();
      }

      // If handled by Vite, prevent Hono Node.js adapter from writing headers or data again to the finished response
      res.setHeader = () => res;
      res.writeHead = () => res;
      res.write = () => true;
      res.end = () => res;
      return c.text("");
    });
  } else {
    // Serve static files in production
    app.use("*", serveStatic({ root: "./dist" }));
    app.get("*", async (c) => {
      const htmlPath = path.join(process.cwd(), "dist/index.html");
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, "utf-8");
        return c.html(html);
      }
      return c.text("Production build not found. Run npm run build first.", 404);
    });
  }

  serve({
    fetch: app.fetch,
    port: PORT,
    hostname: "0.0.0.0"
  }, (info) => {
    console.log(`Server running on http://0.0.0.0:${info.port}`);
  });
}

initServer().catch((err) => {
  console.error("Failed to start server:", err);
});
