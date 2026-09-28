import assert from "node:assert";
import { pointOf, tellOf } from "../role.js";
import { step, close } from "../rolerun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { primary: "", points: [], switches: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "sync", replica: "a", upto: 5 }],
  bad_replica_code: "E_BAD_REPLICA", bad_point_code: "E_BAD_POINT",
  stale_code: "E_STALE_POINT", has_primary_code: "E_HAS_PRIMARY",
  no_primary_code: "E_NO_PRIMARY", no_replica_code: "E_NO_REPLICA",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("pointOf returns a number", () => {
  assert.strictEqual(typeof pointOf([["a", 5]], "a"), "number");
});

check("tellOf returns primary and point", () => {
  const got = tellOf("", [["a", 5]], "a");
  assert.strictEqual(typeof got.point, "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
