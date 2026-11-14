import { logger } from "./logger.js";
import { archiveDueCourses } from "../services/course-archive.js";
import { getRepositories } from "../repositories/index.js";

/** Runs on startup and every minute; a restart catches deadlines missed while offline. */
export function startCourseExpirySweep(): () => Promise<void> {
  let running: Promise<void> | null = null;
  const run = () => {
    if (running) return;
    running = (async () => {
      const expired = await getRepositories().orders.expireDue(new Date().toISOString());
      if (expired) logger.info("payment_orders_expired", { count: expired });
      await archiveDueCourses();
    })()
      .catch((error) => logger.error("expiry_sweep_failed", {
        message: error instanceof Error ? error.message : String(error),
      }))
      .finally(() => { running = null; });
  };
  run();
  const timer = setInterval(run, 60_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
