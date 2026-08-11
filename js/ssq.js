import {
  $,
  loadJson,
  compareSsq,
  renderBalls,
  setupTabs,
  hideLoading,
  frequencyMap,
  clearCharts,
  makeBarChart,
  makeLineChart,
  setupHistorySearch,
} from "./shared.js";

const STRATEGY_SHORT = {
  1: "热号",
  2: "冷号",
  3: "平衡",
  4: "周期",
  5: "综合",
};

async function main() {
  setupTabs();

  const [history, prediction, predHistory] = await Promise.all([
    loadJson("./data/lottery_history.json"),
    loadJson("./data/ssq_predictions.json"),
    loadJson("./data/ssq_predictions_history.json"),
  ]);

  const latest = history.data?.[0];
  const next = history.next_draw || {};
  const target = prediction.target_period;
  const drawn = latest && target && Number(target) <= Number(latest.period);
  const actualForTarget = drawn
    ? history.data.find((d) => d.period === target) || latest
    : null;

  $("#heroPeriod").textContent = next.next_period || target || "—";
  $("#heroDate").textContent = next.next_date_display || next.next_date || "—";
  $("#heroWeekday").textContent = next.weekday ? `${next.weekday} ${next.draw_time || ""}` : "—";
  $("#heroUpdated").textContent = (history.last_updated || "").replace("T", " ").replace("Z", " UTC");
  $("#predPeriod").textContent = target || "—";
  $("#predDate").textContent = prediction.prediction_date || "—";

  const banner = $("#statusBanner");
  if (drawn && actualForTarget) {
    banner.className = "banner";
    banner.textContent = `预测期 ${target} 已开奖。下方高亮为与开奖结果的命中对比（仅供研究）。`;
    banner.classList.remove("hidden");
  } else {
    banner.className = "banner info";
    banner.textContent = `DeepSeek 当前预测目标期：${target}（尚未开奖或等待更新）。`;
    banner.classList.remove("hidden");
  }

  renderPredictions(prediction.predictions || [], actualForTarget);
  renderArchives(predHistory.predictions_history || []);
  setupHistorySearch({
    draws: history.data || [],
    isDlt: false,
    render: renderHistoryTable,
  });

  let analysisDone = false;
  window.addEventListener("render-analysis", () => {
    if (analysisDone) return;
    analysisDone = true;
    renderAnalysis(history.data || [], predHistory.predictions_history || []);
  });

  hideLoading();
}

function renderPredictions(groups, actual) {
  const list = $("#strategyList");
  list.innerHTML = "";

  groups.forEach((g) => {
    const hits = actual ? compareSsq(g, actual) : null;
    const row = document.createElement("article");
    row.className = "strategy-row";
    row.innerHTML = `
      <div class="strategy-label">
        <strong>${g.strategy || STRATEGY_SHORT[g.group_id] || "策略"}</strong>
        <span>第 ${g.group_id} 组</span>
      </div>
      <div class="balls" data-balls></div>
      ${hits ? `<div class="hit-chip">红${hits.red_hit_count} · 蓝${hits.blue_hit ? 1 : 0}</div>` : ""}
      ${g.description ? `<p class="desc">${g.description}</p>` : ""}
    `;
    const balls = row.querySelector("[data-balls]");
    renderBalls(balls, {
      red: g.red_balls,
      blue: g.blue_ball,
      hits,
    });
    list.appendChild(row);
  });
}

function renderArchives(records) {
  const box = $("#archiveList");
  box.innerHTML = "";
  records.slice(0, 12).forEach((rec) => {
    const item = document.createElement("div");
    item.className = "archive-item";
    const best = rec.best_hit_count ?? "—";
    item.innerHTML = `
      <div class="archive-top">
        <div>期号 <strong>${rec.target_period}</strong> · ${rec.prediction_date || ""}</div>
        <div>最佳命中 <strong>${best}</strong></div>
      </div>
      <div class="balls" data-actual></div>
    `;
    if (rec.actual_result) {
      renderBalls(item.querySelector("[data-actual]"), {
        red: rec.actual_result.red_balls,
        blue: rec.actual_result.blue_ball,
      });
    }
    box.appendChild(item);
  });
}

function renderHistoryTable(rows, opts = {}) {
  const tbody = $("#historyBody");
  tbody.innerHTML = "";
  const { reds = [], blues = [], active = false } = opts;

  if (!rows.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" style="color:var(--ink-soft)">没有符合条件的开奖记录</td>`;
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${d.period}</td>
      <td>${d.date}</td>
      <td><div class="balls" data-balls></div></td>
    `;
    const hits = active
      ? {
          red_hits: reds.filter((b) => (d.red_balls || []).includes(b)),
          blue_hit: blues.length ? blues.includes(d.blue_ball) : false,
          blue_hits: blues.filter((b) => b === d.blue_ball),
        }
      : null;
    renderBalls(tr.querySelector("[data-balls]"), {
      red: d.red_balls,
      blue: d.blue_ball,
      hits,
    });
    tbody.appendChild(tr);
  });
}

function renderAnalysis(draws, archives) {
  clearCharts();
  const redFreq = frequencyMap(draws, "red_balls", 33, 30);
  const blueFreq = frequencyMap(draws, "blue_ball", 16, 30);

  makeBarChart(
    $("#chartRed"),
    redFreq.map((x) => x.num),
    redFreq.map((x) => x.count),
    "#d32f2f"
  );
  makeBarChart(
    $("#chartBlue"),
    blueFreq.map((x) => x.num),
    blueFreq.map((x) => x.count),
    "#1e6fd9"
  );

  const recent = [...archives].slice(0, 15).reverse();
  makeLineChart(
    $("#chartHits"),
    recent.map((r) => r.target_period),
    recent.map((r) => Number(r.best_hit_count || 0)),
    "#0f766e"
  );

  const sums = draws.slice(0, 20).map((d) =>
    d.red_balls.reduce((s, n) => s + parseInt(n, 10), 0)
  );
  makeLineChart(
    $("#chartSum"),
    draws.slice(0, 20).map((d) => d.period).reverse(),
    [...sums].reverse(),
    "#0f4fa8"
  );
}

main().catch((err) => {
  console.error(err);
  $("#loadingText").textContent = `加载失败：${err.message}`;
});
