// rolerun.js：按处理预算处理事件，用尽则连着载压账，收尾把账做完
import { pointOf, tellOf } from "./role.js";

class RuleError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "RuleError";
    this.code = code;
  }
}

function isNonNegInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// 事件入账的统一编码：[kind, replica, upto]，没有的侧记 null
function encode(kind, replica, upto) {
  return [kind, replica === undefined ? null : replica, upto === undefined ? null : upto];
}

function signature(row) {
  return row[0] + "\u0000" + (row[1] === null ? "" : row[1])
    + "\u0000" + (row[2] === null ? "" : String(row[2]));
}

// 结构校验（先校验）：不合法 E_BAD_EVENT，名字空 E_BAD_REPLICA，位点非非负整数 E_BAD_POINT
function inspect(event, codes) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new RuleError(codes.event_error_code);
  }
  if (event.kind === "sync") {
    if (typeof event.replica !== "string" || event.replica.length === 0) {
      throw new RuleError(codes.bad_replica_code);
    }
    if (!isNonNegInt(event.upto)) {
      throw new RuleError(codes.bad_point_code);
    }
    return;
  }
  if (event.kind === "lead") {
    if (typeof event.replica !== "string" || event.replica.length === 0) {
      throw new RuleError(codes.bad_replica_code);
    }
    return;
  }
  if (event.kind === "fail") {
    return;
  }
  throw new RuleError(codes.event_error_code);
}

// 语义校验 + 应用：按当前位点表与主节点判
function applyEvent(state, event, codes) {
  if (event.kind === "sync") {
    const replica = event.replica;
    const upto = event.upto;
    const current = pointOf(state.points, replica);
    if (current !== -1 && upto < current) {
      throw new RuleError(codes.stale_code);
    }
    if (current === -1) {
      state.points.push([replica, upto]);
      state.points.sort(function (a, b) {
        return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
      });
    } else {
      for (const row of state.points) {
        if (row[0] === replica) { row[1] = upto; break; }
      }
    }
    return;
  }
  if (event.kind === "lead") {
    const replica = event.replica;
    const point = pointOf(state.points, replica);
    if (point === -1) {
      throw new RuleError(codes.no_replica_code);
    }
    if (state.primary !== "") {
      throw new RuleError(codes.has_primary_code);
    }
    const oldPrimary = state.primary;
    const told = tellOf(oldPrimary, state.points, replica);
    state.primary = told.primary;
    state.switches.push([oldPrimary, told.primary, told.point]);
    return;
  }
  // fail
  if (state.primary === "") {
    throw new RuleError(codes.no_primary_code);
  }
  const oldPrimary = state.primary;
  const oldPoint = pointOf(state.points, oldPrimary);
  state.primary = "";
  state.switches.push([oldPrimary, "", oldPoint]);
}

function toLedgerRow(row) {
  const kind = row[0];
  const replica = row[1];
  const upto = row[2];
  if (kind === "sync") return { kind: "sync", replica: replica, upto: upto };
  if (kind === "lead") return { kind: "lead", replica: replica };
  return { kind: "fail" };
}

function budgetOf(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const floored = Math.floor(num);
  return floored < 0 ? 0 : floored;
}

function codesFrom(spec) {
  return {
    bad_replica_code: spec.bad_replica_code || "E_BAD_REPLICA",
    bad_point_code: spec.bad_point_code || "E_BAD_POINT",
    stale_code: spec.stale_code || "E_STALE_POINT",
    has_primary_code: spec.has_primary_code || "E_HAS_PRIMARY",
    no_primary_code: spec.no_primary_code || "E_NO_PRIMARY",
    no_replica_code: spec.no_replica_code || "E_NO_REPLICA",
    event_error_code: spec.event_error_code || "E_BAD_EVENT"
  };
}

function cloneState(state) {
  const src = state || {};
  return {
    primary: typeof src.primary === "string" ? src.primary : "",
    points: (src.points || []).map(function (row) { return [row[0], row[1]]; }),
    switches: (src.switches || []).map(function (row) { return [row[0], row[1], row[2]]; }),
    ledger: (src.ledger || []).map(function (row) {
      return [row[0], row[1] === undefined ? null : row[1], row[2] === undefined ? null : row[2]];
    }),
    applied: (src.applied || []).slice()
  };
}

// 用统一处理预算跑一遍：先压旧账，再处理新事件；用尽后余下的连着载压账
function run(state, rows, remaining, codes) {
  let served = 0;
  const applied = state.applied;
  const leftovers = [];
  for (const item of rows) {
    const sig = signature(item.row);
    if (applied.indexOf(sig) !== -1) {
      // 重放已处理项：不花预算，也不再压账
      item.consumed = false;
      continue;
    }
    if (remaining <= 0) {
      leftovers.push(item.row);
      item.consumed = false;
      continue;
    }
    const event = item.fromLedger ? toLedgerRow(item.row) : item.raw;
    inspect(event, codes);
    applyEvent(state, event, codes);
    applied.push(sig);
    remaining -= 1;
    served += 1;
    item.consumed = true;
  }
  state.ledger = leftovers;
  return served;
}

export function step(spec) {
  const codes = codesFrom(spec);
  const state = cloneState(spec.state);
  const remaining0 = budgetOf(spec.budget);
  const incomingLedger = state.ledger.length;

  const rows = [];
  state.ledger.forEach(function (row) {
    rows.push({ row: row, fromLedger: true, raw: null, consumed: false });
  });
  (spec.events || []).forEach(function (event) {
    const kind = event !== null && typeof event === "object" && !Array.isArray(event)
      ? event.kind
      : undefined;
    const row = kind === "sync"
      ? encode("sync", event.replica, event.upto)
      : kind === "lead"
        ? encode("lead", event.replica, null)
        : encode(kind, null, null);
    rows.push({ row: row, fromLedger: false, raw: event, consumed: false });
  });

  const served = run(state, rows, remaining0, codes);

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) {
      return [row[0], row[1] === undefined ? null : row[1], row[2] === undefined ? null : row[2]];
    }),
    judged: served,
    judged_bound: incomingLedger + (spec.events || []).length
  };
}

// 收尾：把账做完（不收新事件），返回补齐条数
export function close(spec) {
  const codes = codesFrom(spec);
  const state = cloneState(spec.state);
  const pending = state.ledger.length;
  const result = run(state, state.ledger.map(function (row) {
    return { row: row, fromLedger: true, raw: null, consumed: false };
  }), pending, codes);
  return { state: state, catchup: result };
}
