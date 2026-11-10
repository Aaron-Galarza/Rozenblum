import assert from "node:assert/strict";
import test from "node:test";
import { canRetryEditorOperation, editorErrorMessage, moveIdInOrder } from "./editor-operations.ts";

test("moveIdInOrder swaps adjacent stable IDs without renumbering", () => {
  assert.deepEqual(moveIdInOrder([10, 30, 80], 30, "up"), [30, 10, 80]);
  assert.deepEqual(moveIdInOrder(["1.1", "1.4", "1.8"], "1.4", "down"), ["1.1", "1.8", "1.4"]);
});

test("moveIdInOrder refuses missing, duplicate and boundary IDs", () => {
  assert.equal(moveIdInOrder([10, 30], 10, "up"), null);
  assert.equal(moveIdInOrder([10, 30], 99, "down"), null);
  assert.equal(moveIdInOrder([10, 10], 10, "down"), null);
});

test("editor errors explain conflicts and uncertain creates without retrying conflicts", () => {
  const conflict = { status: 409, code: "CONFLICT" };
  assert.match(editorErrorMessage(conflict), /no se sobrescribieron/i);
  assert.equal(canRetryEditorOperation(conflict), false);
  assert.match(editorErrorMessage({ ...conflict, details: { currentRevision: 12, updatedAt: "2026-11-10T12:00:00.000Z" } }), /versión actual del curso es 12/i);
  assert.match(editorErrorMessage({ status: 0 }, { creationMayHaveSucceeded: true }), /evitar duplicados/i);
  assert.match(editorErrorMessage({ status: 0 }, { verifyBeforeRetry: true }), /comprobar/i);
  assert.match(editorErrorMessage({ status: 503 }, { verifyBeforeRetry: true }), /comprobar/i);
  assert.equal(canRetryEditorOperation({ status: 0 }), true);
  assert.equal(canRetryEditorOperation({ status: 503 }), true);
});
