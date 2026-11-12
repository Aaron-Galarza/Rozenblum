import type { AdminEventAction, AdminEventEntity, StoredAdminEvent, StoredCourse, StoredUser } from "../types.js";
import type { Pagination } from "../lib/pagination.js";
import { newId, nowIso } from "../lib/utils.js";
import { getRepositories } from "../repositories/index.js";

type AuditInput = {
  actor: StoredUser;
  action: AdminEventAction;
  entity: AdminEventEntity;
  entityId: string;
  reason: string;
  previousState?: Record<string, unknown>;
  nextState?: Record<string, unknown>;
};

/** Keeps credentials out of the audit trail while preserving the rest of the record. */
export function safeUserState(user: StoredUser): Record<string, unknown> {
  const { passwordHash: _passwordHash, ...state } = user;
  return state;
}

/** Courses carry large lesson documents; the audit only needs their metadata. */
export function safeCourseState(course: StoredCourse): Record<string, unknown> {
  return {
    id: course.legacyId,
    slug: course.slug,
    title: course.title,
    status: course.status,
    professorEmail: course.professorEmail,
    priceCents: course.priceCents,
    accessDays: course.accessDays,
    revision: course.revision ?? 0,
  };
}

/**
 * Records who changed an administrative record, when, why and its previous
 * state. Financial transitions already use `payment_events` for the same goal.
 */
export async function recordAdminEvent(input: AuditInput): Promise<StoredAdminEvent> {
  const reason = input.reason.trim() || "Cambio administrativo sin motivo detallado.";
  return getRepositories().adminEvents.create({
    id: newId("aud"),
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    ...(input.previousState ? { previousState: input.previousState } : {}),
    ...(input.nextState ? { nextState: input.nextState } : {}),
    reason,
    createdAt: nowIso(),
  });
}

export async function listAdminEvents(
  page?: Pagination,
  entity?: AdminEventEntity,
): Promise<{ events: StoredAdminEvent[]; total: number }> {
  const repos = getRepositories();
  const [events, total] = await Promise.all([
    repos.adminEvents.list(page, entity),
    repos.adminEvents.count(entity),
  ]);
  return { events, total };
}
