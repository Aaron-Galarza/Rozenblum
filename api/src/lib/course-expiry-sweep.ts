import { logger } from "./logger.js";
import { archiveDueCourses } from "../services/course-archive.js";

/** Runs on startup and every minute; a restart catches dates missed while offline. */
export function startCourseExpirySweep(): () => Promise<void> {
  let running: Promise<void> | null = null;
  const run = () => {
    if (running) return;
    running = archiveDueCourses()
      .catch((error) => logger.error("course_expiry_sweep_failed", {
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
