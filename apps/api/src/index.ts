import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadEnv } from "./config/env.js";
import { authRoutes } from "./auth/auth.routes.js";
import { userRoutes } from "./users/user.routes.js";
import { specialisationRoutes } from "./specialisations/specialisation.routes.js";
import { doctorRoutes } from "./doctors/doctor.routes.js";
import { appointmentRoutes } from "./appointments/appointment.routes.js";
import { visitRoutes } from "./visits/visit.routes.js";
import { leaveRoutes } from "./leaves/leave.routes.js";
import { startJobs } from "./jobs/index.js";

const env = loadEnv();

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
});

// CORS
app.register(cors, {
  origin: env.FRONTEND_URL || true,
  credentials: true,
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
app.register(appointmentRoutes);
app.register(visitRoutes);
app.register(leaveRoutes);

async function start() {
  try {
    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`🏥 Healthcare API running on port ${env.PORT}`);

    // Start background jobs in production
    if (env.NODE_ENV === "production") {
      startJobs(30_000);
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { app };
