// ui.js：操作面板与视图（原生 DOM，无弹窗）
import { render } from "./app.js";

export function mount(spec, parts) {
  parts.log.textContent = "事件 " + (spec.events || []).length + " 条，本轮处理预算 "
    + (spec.budget || 0) + " 条，当前主节点 " + (((spec.state || {}).primary) || "（没有，只读）") + "。";

  function draw() {
    let view = null;
    try {
      view = render(spec);
    } catch (error) {
      parts.out.textContent = String(error && error.code ? error.code : error);
      parts.log.textContent = "跑不动：" + String(error && error.message ? error.message : error);
      return;
    }
    parts.out.textContent = JSON.stringify(view, null, 1);
    parts.stage.textContent = "";
    const head = document.createElement("div");
    head.className = "row";
    const headText = document.createElement("span");
    headText.textContent = "主节点 " + (view.primary || "（没有）");
    head.appendChild(headText);
    const chip = document.createElement("span");
    chip.className = "chip" + (view.primary ? "" : " warn");
    chip.textContent = view.primary ? "可写" : "只读窗口";
    head.appendChild(chip);
    parts.stage.appendChild(head);
    (view.points || []).forEach(function (row) {
      const line = document.createElement("div");
      line.className = "row ghost";
      const text = document.createElement("span");
      text.textContent = "副本 " + row[0] + " 同步到 " + row[1];
      line.appendChild(text);
      parts.stage.appendChild(line);
    });
    (view.switches || []).forEach(function (row) {
      const line = document.createElement("div");
      line.className = "row";
      const text = document.createElement("span");
      text.textContent = "换手 " + (row[0] || "（无）") + " 到 " + (row[1] || "（无）")
        + "，位点 " + row[2];
      line.appendChild(text);
      parts.stage.appendChild(line);
    });
    (view.ledger || []).forEach(function (row) {
      const line = document.createElement("div");
      line.className = "row";
      const text = document.createElement("span");
      text.textContent = "事件 " + row[1] + " 压在账上";
      line.appendChild(text);
      const chip = document.createElement("span");
      chip.className = "chip warn";
      chip.textContent = "等收尾";
      line.appendChild(chip);
      parts.stage.appendChild(line);
    });
    parts.legend.textContent = "首轮处理 " + view.served_first + " 条，二档 "
      + view.served_wide + " 条，收尾前账 " + view.ledger_before + " 条，收尾补齐 "
      + view.catchup + " 条，收尾后账 " + view.ledger_after + " 条";
    parts.log.textContent = "工作计数 " + view.judged + " / 上界 " + view.judged_bound
      + "，重放新处理 " + view.replay_new + "，与全量对照差异 " + view.full_diff;
  }

  const budgetInput = document.createElement("input");
  budgetInput.type = "number";
  budgetInput.value = "1";
  parts.controls.appendChild(budgetInput);

  const runButton = document.createElement("button");
  runButton.className = "primary";
  runButton.textContent = "跑一遍";
  runButton.addEventListener("click", draw);
  parts.controls.appendChild(runButton);

  const budgetButton = document.createElement("button");
  budgetButton.textContent = "把处理预算换成输入框的值";
  budgetButton.addEventListener("click", function () {
    const next = Number(budgetInput.value);
    spec.budget = Number.isFinite(next) ? Math.max(1, Math.round(next)) : 1;
    draw();
  });
  parts.controls.appendChild(budgetButton);

  const dropButton = document.createElement("button");
  dropButton.textContent = "删最后一条事件";
  dropButton.addEventListener("click", function () {
    spec.events = (spec.events || []).slice(0, Math.max(0, (spec.events || []).length - 1));
    draw();
  });
  parts.controls.appendChild(dropButton);

  draw();
}
