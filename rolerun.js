// rolerun.js：按处理预算处理并留账（基线：一律给空表）
import { pointOf, tellOf } from "./role.js";

export function step(spec) {
  return { state: spec.state, served: 0, ledger_before: 0, ledger: [], judged: 0, judged_bound: 0 };
}

export function close(spec) {
  return { state: spec.state, catchup: 0 };
}
