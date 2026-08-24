import Fastify from "fastify";
import { loadEnv } from "./config/env.js";

const env = loadEnv();

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
});

// Health check endpoint
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`🏥 Healthcare API running on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
