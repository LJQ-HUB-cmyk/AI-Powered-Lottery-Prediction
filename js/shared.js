/**
 * Shared helpers for SSQ / DLT pages
 */

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function $all(sel, root = document) {
  return [...root.querySelectorAll(sel)];
}

export async function loadJson(path) {
  const url = `${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`加载失败: ${path} (${res.status})`);
  return res.json();
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

/** 解析球号输入：支持空格、逗号、顿号等分隔 */
export function parseBallQuery(text) {
  if (!text || !String(text).trim()) return [];
  const seen = new Set();
  const out = [];
  for (const part of String(text).split(/[\s,，、;；|/\\-]+/)) {
    if (!part) continue;
    const n = parseInt(part, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    const ball = pad2(n);
    if (seen.has(ball)) continue;
    seen.add(ball);
    out.push(ball);
  }
  return out;
}

/**
 * 按期号 / 红球 / 蓝球筛选历史开奖。
 * 红球、蓝球均为「包含全部查询号」；多条件 AND。
 */
export function filterHistoryDraws(draws, { period = "", reds = [], blues = [] } = {}) {
  const periodQ = String(period || "").trim();
  return (draws || []).filter((d) => {
    if (periodQ && !String(d.period || "").includes(periodQ)) return false;
    if (reds.length && !reds.every((b) => (d.red_balls || []).includes(b))) return false;
    if (blues.length) {
      const drawBlue = d.blue_balls
        ? d.blue_balls
        : d.blue_ball
          ? Array.isArray(d.blue_ball)
            ? d.blue_ball
            : [d.blue_ball]
          : [];
      if (!blues.every((b) => drawBlue.includes(b))) return false;
    }
    return true;
  });
}

export function setupHistorySearch({ draws, isDlt = false, render }) {
  const form = $("#historySearch");
  if (!form || typeof render !== "function") return;

  const periodInput = $("#searchPeriod");
  const redInput = $("#searchRed");
  const blueInput = $("#searchBlue");
  const meta = $("#historySearchMeta");
  const defaultLimit = 100;
  const searchLimit = 500;

  const run = () => {
    const period = periodInput?.value || "";
    const reds = parseBallQuery(redInput?.value || "");
    const blues = parseBallQuery(blueInput?.value || "");
    const active = Boolean(period.trim() || reds.length || blues.length);
    const matched = filterHistoryDraws(draws, { period, reds, blues });
    const limit = active ? searchLimit : defaultLimit;
    const rows = matched.slice(0, limit);

    if (meta) {
      if (!active) {
        meta.textContent = `共 ${draws.length} 期 · 默认展示最近 ${rows.length} 期`;
      } else if (matched.length === 0) {
        meta.textContent = "无匹配结果，试试放宽条件";
      } else if (matched.length > limit) {
        meta.textContent = `匹配 ${matched.length} 期 · 展示前 ${limit} 期`;
      } else {
        meta.textContent = `匹配 ${matched.length} 期`;
      }
    }

    render(rows, { reds, blues, isDlt, active });
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    run();
  });

  const resetBtn = $("#searchReset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (periodInput) periodInput.value = "";
      if (redInput) redInput.value = "";
      if (blueInput) blueInput.value = "";
      run();
    });
  }

  run();
}

export function compareSsq(prediction, actual) {
  const redHits = prediction.red_balls.filter((b) => actual.red_balls.includes(b));
  const blueHit = prediction.blue_ball === actual.blue_ball;
  return {
    red_hits: redHits,
    red_hit_count: redHits.length,
    blue_hit: blueHit,
    total_hits: redHits.length + (blueHit ? 1 : 0),
  };
}

export function compareDlt(prediction, actual) {
  const redHits = prediction.red_balls.filter((b) => actual.red_balls.includes(b));
  const actualBlue = actual.blue_balls || (actual.blue_ball ? [actual.blue_ball] : []);
  const predBlue = prediction.blue_balls || [];
  const blueHits = predBlue.filter((b) => actualBlue.includes(b));
  return {
    red_hits: redHits,
    red_hit_count: redHits.length,
    blue_hits: blueHits,
    blue_hit_count: blueHits.length,
    total_hits: redHits.length + blueHits.length,
  };
}

export function renderBalls(container, { red = [], blue = [], blueList = null, hits = null }) {
  container.innerHTML = "";
  const hitSet = new Set(hits?.red_hits || []);
  const blueHitSet = new Set(hits?.blue_hits || []);

  red.forEach((n) => {
    const el = document.createElement("span");
    el.className = `ball red${hitSet.has(n) ? " hit" : ""}`;
    el.textContent = n;
    container.appendChild(el);
  });

  const sep = document.createElement("span");
  sep.className = "ball-sep";
  container.appendChild(sep);

  const blues = blueList || (blue ? [blue] : []);
  blues.forEach((n) => {
    const el = document.createElement("span");
    const isHit = hits
      ? blueList
        ? blueHitSet.has(n)
        : hits.blue_hit
      : false;
    el.className = `ball blue${isHit ? " hit" : ""}`;
    el.textContent = n;
    container.appendChild(el);
  });
}

export function setupTabs() {
  const buttons = $all(".tab-btn");
  const panels = $all(".panel");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      panels.forEach((p) => p.classList.toggle("active", p.dataset.panel === tab));
      if (tab === "analysis") {
        window.dispatchEvent(new CustomEvent("render-analysis"));
      }
    });
  });
}

export function hideLoading() {
  const el = $("#loading");
  if (el) el.classList.add("hidden");
  const app = $("#app");
  if (app) app.classList.remove("hidden");
}

export function frequencyMap(draws, key, rangeMax, take = 30) {
  const map = Array.from({ length: rangeMax }, (_, i) => ({
    num: pad2(i + 1),
    count: 0,
  }));
  draws.slice(0, take).forEach((d) => {
    const values = key === "blue_balls"
      ? d.blue_balls || []
      : key === "blue_ball"
        ? [d.blue_ball]
        : d.red_balls || [];
    values.forEach((v) => {
      const idx = parseInt(v, 10) - 1;
      if (idx >= 0 && idx < map.length) map[idx].count += 1;
    });
  });
  return map;
}

let chartInstances = [];

export function clearCharts() {
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];
}

export function makeBarChart(canvas, labels, values, color) {
  if (!window.Chart || !canvas) return;
  const chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: color,
          borderRadius: 4,
          maxBarThickness: 14,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 10 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
          grid: { color: "rgba(20,32,51,0.06)" },
        },
      },
    },
  });
  chartInstances.push(chart);
  return chart;
}

export function makeLineChart(canvas, labels, values, color) {
  if (!window.Chart || !canvas) return;
  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: color,
          backgroundColor: color + "22",
          fill: true,
          tension: 0.35,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "rgba(20,32,51,0.06)" } },
      },
    },
  });
  chartInstances.push(chart);
  return chart;
}
