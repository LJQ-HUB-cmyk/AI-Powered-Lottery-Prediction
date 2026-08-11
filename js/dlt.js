import {
  $,
  loadJson,
  compareDlt,
  renderBalls,
  setupTabs,
  hideLoading,
  frequencyMap,
  clearCharts,
  makeBarChart,
  makeLineChart,
} from "./shared.js";

async function main() {
  setupTabs();

  const [history, prediction, predHistory] = await Promise.all([
    loadJson("./data/sports_lottery_data.json"),
    loadJson("./data/dlt_predictions.json"),
    loadJson("./data/dlt_predictions_history.json"),
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
    banner.textContent = `预测期 ${target} 已开奖。下方高亮为命中对比（仅供研究）。`;
    banner.classList.remove("hidden");
  } else {
    banner.className = "banner info";
    banner.textContent = `DeepSeek 当前预测目标期：${target}。`;
    banner.classList.remove("hidden");
  }

  renderPredictions(prediction.predictions || [], actualForTarget);
  renderArchives(predHistory.predictions_history || []);
  renderHistoryTable(history.data || []);

  let analysisDone = false;
  window.addEventListener("render-analysis", () => {
    if (analysisDone) return;
    analysisDone = true;
    renderAnalysis(history.data || [], predHistory.predictions_history || []);
  });

  hideLoading();
}

function normalizeGroup(g) {
  return {
    ...g,
    blue_balls: g.blue_balls || (g.blue_ball ? [g.blue_ball] : []),
  };
}

function renderPredictions(groups, actual) {
  const list = $("#strategyList");
  list.innerHTML = "";
  groups.map(normalizeGroup).forEach((g) => {
    const hits = actual ? compareDlt(g, actual) : null;
    const row = document.createElement("article");
    row.className = "strategy-row";
    row.innerHTML = `
      <div class="strategy-label">
        <strong>${g.strategy || "策略"}</strong>
        <span>第 ${g.group_id} 组</span>
      </div>
      <div class="balls" data-balls></div>
      ${hits ? `<div class="hit-chip">前${hits.red_hit_count} · 后${hits.blue_hit_count}</div>` : ""}
      ${g.description ? `<p class="desc">${g.description}</p>` : ""}
    `;
    renderBalls(row.querySelector("[data-balls]"), {
      red: g.red_balls,
      blueList: g.blue_balls,
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
    item.innerHTML = `
      <div class="archive-top">
        <div>期号 <strong>${rec.target_period}</strong> · ${rec.prediction_date || ""}</div>
        <div>最佳命中 <strong>${rec.best_hit_count ?? "—"}</strong></div>
      </div>
      <div class="balls" data-actual></div>
    `;
    if (rec.actual_result) {
      const a = rec.actual_result;
      renderBalls(item.querySelector("[data-actual]"), {
        red: a.red_balls,
        blueList: a.blue_balls || (a.blue_ball ? [a.blue_ball] : []),
      });
    }
    box.appendChild(item);
  });
}

function renderHistoryTable(rows) {
  const tbody = $("#historyBody");
  tbody.innerHTML = "";
  rows.slice(0, 80).forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${d.period}</td>
      <td>${d.date}</td>
      <td><div class="balls" data-balls></div></td>
    `;
    renderBalls(tr.querySelector("[data-balls]"), {
      red: d.red_balls,
      blueList: d.blue_balls || [],
    });
    tbody.appendChild(tr);
  });
}

function renderAnalysis(draws, archives) {
  clearCharts();
  const redFreq = frequencyMap(draws, "red_balls", 35, 30);
  const blueFreq = frequencyMap(draws, "blue_balls", 12, 30);

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
