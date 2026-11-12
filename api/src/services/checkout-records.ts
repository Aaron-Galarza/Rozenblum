import { badRequest } from "../lib/http.js";
import { getRepositories } from "../repositories/index.js";
import type { StoredEnrollment, StoredOrder } from "../types.js";

export async function persistCheckoutRecords(
  order: StoredOrder,
): Promise<{ createdOrder: StoredOrder; enrollment: StoredEnrollment }> {
  const repos = getRepositories();
  try {
    return await repos.withTransaction(async () => {
      if (await repos.enrollments.findByStudentAndCourse(order.email, order.courseId)) {
        throw badRequest("Ya existe una inscripción para este curso y correo.");
      }
      const createdOrder = await repos.orders.create(order);
      const enrollment = await repos.enrollments.create({
        studentEmail: order.email,
        studentName: order.alumno,
        courseId: order.courseId,
        status: "Pendiente",
        completedLessonIds: [],
      });
      return { createdOrder, enrollment };
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw badRequest("Ya existe una inscripción para este curso y correo.");
    }
    throw error;
  }
}
