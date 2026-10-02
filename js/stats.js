// 통계: 워드클라우드(wordcloud2.js) + 감정 도넛(Chart.js)
(function () {
  const EMOTIONS = window.EMOTIONS = [
    { emo: "😊", name: "기쁨" }, { emo: "🥰", name: "따뜻함" }, { emo: "😌", name: "평안" },
    { emo: "🙏", name: "감사" }, { emo: "🥹", name: "위로받음" }, { emo: "💪", name: "힘얻음" }
  ];
  let chart = null;

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function palette() {
    return [cssVar("--primary"), cssVar("--secondary"), cssVar("--accent"), cssVar("--primary-soft"), cssVar("--secondary-soft"), cssVar("--text-muted")];
  }

  window.renderWordCloud = function (canvas, tags) {
    const entries = Object.entries(tags || {}).sort((a, b) => b[1] - a[1]).slice(0, 40);
    const wrap = canvas.parentElement;
    const empty = wrap.querySelector(".empty");
    if (!entries.length) {
      canvas.classList.add("hidden"); if (empty) empty.classList.remove("hidden"); return;
    }
    canvas.classList.remove("hidden"); if (empty) empty.classList.add("hidden");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth || 320, h = wrap.clientHeight || 220;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    const max = entries[0][1], min = entries[entries.length - 1][1];
    const colors = palette();
    if (!window.WordCloud) return;
    window.WordCloud(canvas, {
      list: entries.map(([t, c]) => [t, c]),
      gridSize: Math.round(10 * dpr),
      weightFactor: c => {
        const base = max === min ? 1 : (c - min) / (max - min);
        return (14 + base * 30) * dpr;
      },
      fontFamily: getComputedStyle(document.body).fontFamily,
      color: (word, weight) => {
        const base = max === min ? 1 : (weight - min) / (max - min);
        return base > 0.66 ? colors[0] : base > 0.33 ? colors[1] : colors[2];
      },
      rotateRatio: 0.15, rotationSteps: 2, backgroundColor: "transparent", shuffle: true, drawOutOfBound: false, shrinkToFit: true
    });
  };

  window.renderEmotionChart = function (canvas, emotions) {
    const data = EMOTIONS.map(e => (emotions && emotions[e.emo]) || 0);
    const total = data.reduce((a, b) => a + b, 0);
    const wrap = canvas.parentElement; const empty = wrap.querySelector(".empty");
    if (!total) { canvas.classList.add("hidden"); if (empty) empty.classList.remove("hidden"); if (chart) { chart.destroy(); chart = null; } return; }
    canvas.classList.remove("hidden"); if (empty) empty.classList.add("hidden");
    if (!window.Chart) return;
    const colors = palette();
    const cfg = {
      type: "doughnut",
      data: { labels: EMOTIONS.map(e => `${e.emo} ${e.name}`), datasets: [{ data, backgroundColor: colors, borderColor: cssVar("--surface"), borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "58%",
        plugins: {
          legend: { position: "right", labels: { color: cssVar("--text"), boxWidth: 12, font: { family: getComputedStyle(document.body).fontFamily, size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}개 (${Math.round(ctx.raw / total * 100)}%)` } }
        }
      }
    };
    if (chart) { chart.data = cfg.data; chart.options = cfg.options; chart.update(); }
    else chart = new window.Chart(canvas, cfg);
  };

  window.refreshChartTheme = function () { if (chart) { chart.destroy(); chart = null; } };
})();
