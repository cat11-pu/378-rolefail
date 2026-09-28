// rolerun.js：按处理预算处理并留账
import { pointOf, tellOf } from "./role.js";

const KINDS = ["sync", "lead", "fail"];

function fault(spec, key, fallback) {
  const code = (spec && spec[key]) || fallback;
  const error = new Error(code);
  error.code = code;
  return error;
}

function tripleOf(event) {
  if (event && event.kind === "sync") return ["sync", event.replica, event.upto];
  if (event && event.kind === "lead") return ["lead", event.replica, null];
  if (event && event.kind === "fail") return ["fail", null, null];
  return [event && event.kind !== undefined ? event.kind : null, null, null];
}

function eventOf(triple) {
  const event = { kind: triple[0] };
  if (triple[1] !== null && triple[1] !== undefined) event.replica = triple[1];
  if (triple[2] !== null && triple[2] !== undefined) event.upto = triple[2];
  return event;
}

function copyState(state) {
  return {
    primary: state.primary,
    points: state.points.map(function (row) { return [row[0], row[1]]; }),
    switches: state.switches.map(function (row) { return [row[0], row[1], row[2]]; }),
    ledger: state.ledger.map(function (row) { return [row[0], row[1], row[2]]; }),
    applied: state.applied.map(function (row) { return Array.isArray(row) ? row.slice() : row; })
  };
}

function validate(spec, event) {
  if (!event || typeof event !== "object" || KINDS.indexOf(event.kind) === -1) {
    throw fault(spec, "event_error_code", "E_BAD_EVENT");
  }
  if (event.kind === "sync" || event.kind === "lead") {
    if (typeof event.replica !== "string" || event.replica === "") {
      throw fault(spec, "bad_replica_code", "E_BAD_REPLICA");
    }
  }
  if (event.kind === "sync") {
    if (typeof event.upto !== "number" || !Number.isInteger(event.upto) || event.upto < 0) {
      throw fault(spec, "bad_point_code", "E_BAD_POINT");
    }
  }
}

function applyEvent(spec, state, event) {
  validate(spec, event);
  if (event.kind === "sync") {
    const current = pointOf(state.points, event.replica);
    if (current >= 0 && event.upto < current) {
      throw fault(spec, "stale_code", "E_STALE_POINT");
    }
    let found = false;
    for (const row of state.points) {
      if (row[0] === event.replica) { row[1] = event.upto; found = true; break; }
    }
    if (!found) {
      state.points.push([event.replica, event.upto]);
      state.points.sort(function (x, y) { return x[0] < y[0] ? -1 : (x[0] > y[0] ? 1 : 0); });
    }
    return;
  }
  if (event.kind === "lead") {
    if (pointOf(state.points, event.replica) < 0) {
      throw fault(spec, "no_replica_code", "E_NO_REPLICA");
    }
    if (state.primary !== "") {
      throw fault(spec, "has_primary_code", "E_HAS_PRIMARY");
    }
    const told = tellOf(state.primary, state.points, event.replica);
    state.switches.push([state.primary, told.primary, told.point]);
    state.primary = told.primary;
    return;
  }
  if (state.primary === "") {
    throw fault(spec, "no_primary_code", "E_NO_PRIMARY");
  }
  const old = state.primary;
  state.switches.push([old, "", pointOf(state.points, old)]);
  state.primary = "";
}

export function step(spec) {
  const state = copyState(spec.state);
  const queue = state.ledger.map(eventOf);
  state.ledger = [];
  const seen = {};
  for (const triple of state.applied) seen[JSON.stringify(triple)] = true;
  for (const event of spec.events || []) {
    if (seen[JSON.stringify(tripleOf(event))]) continue;
    queue.push(event);
  }
  let budget = typeof spec.budget === "number" ? spec.budget : 0;
  let served = 0;
  let judged = 0;
  const rest = [];
  for (const event of queue) {
    judged += 1;
    if (budget > 0) {
      budget -= 1;
      applyEvent(spec, state, event);
      state.applied.push(tripleOf(event));
      served += 1;
    } else {
      rest.push(event);
    }
  }
  state.ledger = rest.map(tripleOf);
  return { state: state, served: served,
           ledger_before: state.ledger.length,
           ledger: state.ledger.map(function (row) { return row.slice(); }),
           judged: judged, judged_bound: queue.length };
}

export function close(spec) {
  const state = copyState(spec.state);
  const pending = state.ledger.map(eventOf);
  state.ledger = [];
  let catchup = 0;
  for (const event of pending) {
    applyEvent(spec, state, event);
    state.applied.push(tripleOf(event));
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
