import Fastify from "fastify";
import { loadEnv } from "./config/env.js";
import { authRoutes } from "./auth/auth.routes.js";
import { userRoutes } from "./users/user.routes.js";
import { specialisationRoutes } from "./specialisations/specialisation.routes.js";
import { doctorRoutes } from "./doctors/doctor.routes.js";

const env = loadEnv();

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
});

// Health check
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Register route modules
app.register(authRoutes);
app.register(userRoutes);
app.register(specialisationRoutes);
app.register(doctorRoutes);

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

export { app };
