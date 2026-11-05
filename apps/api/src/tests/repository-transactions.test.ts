import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockRepositories } from "../repositories/mock.js";

test("a rolled-back mock transaction cannot erase a concurrent committed write", async () => {
  const repos = createMockRepositories();
  let resumeFirst!: () => void;
  const firstMayFinish = new Promise<void>((resolve) => { resumeFirst = resolve; });
  let firstHasWritten!: () => void;
  const firstWrite = new Promise<void>((resolve) => { firstHasWritten = resolve; });

  const failing = repos.withTransaction(async () => {
    await repos.users.create({
      name: "First", email: "first@example.test", role: "alumno",
      initials: "FI", passwordHash: "test-only-hash",
    });
    firstHasWritten();
    await firstMayFinish;
    throw new Error("rollback");
  });
  await firstWrite;
  const succeeding = repos.withTransaction(async () => {
    await repos.users.create({
      name: "Second", email: "second@example.test", role: "alumno",
      initials: "SE", passwordHash: "test-only-hash",
    });
  });
  resumeFirst();

  await assert.rejects(failing, /rollback/);
  await succeeding;
  assert.equal(await repos.users.findByEmail("first@example.test"), null);
  assert.ok(await repos.users.findByEmail("second@example.test"));
});
