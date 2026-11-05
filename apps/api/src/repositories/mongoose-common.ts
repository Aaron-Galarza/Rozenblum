export const clean = <T>(doc: unknown): T => {
  const value = { ...(doc as Record<string, unknown>) };
  delete value._id;
  delete value.__v;
  return value as T;
};

/** Older courses have no revision field; treat that state as revision zero. */
export const courseRevisionFilter = (revision: number) => revision === 0
  ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
  : { revision };
