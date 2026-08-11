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
  const res = await fetch(path);
  if (!res.ok) throw new Error(`加载失败: ${path} (${res.status})`);
  return res.json();
}

export function pad2(n) {
  return String(n).padStart(2, "0");
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
