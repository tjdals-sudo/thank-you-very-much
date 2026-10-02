// 🍓 딸기 반응: 토글, 애니메이션, 딸기 준 사람 목록 (툴팁 / 롱프레스 시트)
(function () {
  const giversCache = new Map(); // id -> { list, at }
  const CACHE_MS = 60 * 1000;
  let tooltipEl = null, longPressTimer = null, longPressed = false;

  function givenSet() { return new Set(window.Store.get("strawberries", [])); }
  function setGiven(id, given) {
    const s = givenSet(); if (given) s.add(id); else s.delete(id);
    window.Store.set("strawberries", [...s]);
  }
  window.hasGiven = id => givenSet().has(id);

  async function loadGivers(id, force = false) {
    const c = giversCache.get(id);
    if (!force && c && Date.now() - c.at < CACHE_MS) return c.list;
    const list = await window.API.getGivers(id);
    giversCache.set(id, { list, at: Date.now() });
    return list;
  }
  function nameList(list) {
    const me = window.Store.get("nickname");
    return list.map(n => (n === me ? "나" : n));
  }
  function summary(list) {
    if (!list.length) return "아직 딸기를 준 사람이 없어요. 첫 번째가 되어볼까요?";
    const names = nameList(list);
    if (names.length <= 5) return `${names.join(", ")} 님이 🍓를 줬어요`;
    return `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}명이 🍓를 줬어요 (클릭해서 전체 보기)`;
  }

  // ---------- 툴팁 (PC hover) ----------
  function showTooltip(btn, text) {
    hideTooltip();
    tooltipEl = document.createElement("div");
    tooltipEl.className = "tooltip"; tooltipEl.textContent = text;
    document.body.appendChild(tooltipEl);
    const r = btn.getBoundingClientRect(); const tw = tooltipEl.offsetWidth, th = tooltipEl.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2; left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    let top = r.top - th - 8; if (top < 8) top = r.bottom + 8;
    tooltipEl.style.left = left + "px"; tooltipEl.style.top = top + "px";
  }
  function hideTooltip() { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } }

  // ---------- 시트 (모바일 롱프레스 / 5명 초과 클릭) ----------
  async function openGiversSheet(id) {
    const list = await loadGivers(id, true);
    const names = nameList(list);
    const html = names.length
      ? `<ul class="giver-list">${names.map((n, i) => `<li><span class="n">${i + 1}</span><span class="${n === "나" ? "me" : ""}">${window.escapeHtml(n)}</span></li>`).join("")}</ul>`
      : `<p class="empty">아직 딸기를 준 사람이 없어요</p>`;
    window.openSheet(`<h3>🍓 딸기를 준 사람 <span class="muted">${names.length}명</span></h3>${html}<p class="help">딸기를 준 순서대로 보여요${list.length >= 50 ? " (최근 50명)" : ""}</p>`);
  }

  // ---------- 토글 ----------
  async function toggle(btn) {
    const id = btn.dataset.id;
    if (btn.disabled || btn.dataset.busy) return;
    btn.dataset.busy = "1";
    const countEl = btn.querySelector(".b-count");
    const wasGiven = btn.classList.contains("given");
    const prev = parseInt(countEl.textContent, 10) || 0;
    // 낙관적 업데이트
    btn.classList.toggle("given", !wasGiven);
    countEl.textContent = Math.max(0, prev + (wasGiven ? -1 : 1));
    if (!wasGiven) { btn.classList.remove("pop"); void btn.offsetWidth; btn.classList.add("pop"); const fly = document.createElement("span"); fly.className = "fly"; fly.textContent = "🍓"; btn.appendChild(fly); setTimeout(() => fly.remove(), 700); }
    try {
      const r = await window.API.toggleStrawberry(id, window.Store.get("nickname"));
      btn.classList.toggle("given", !!r.given);
      countEl.textContent = r.count;
      setGiven(id, !!r.given);
      giversCache.delete(id);
      // 같은 글의 다른 버튼(홈 미리보기/피드)도 동기화
      document.querySelectorAll(`.berry-btn[data-id="${id}"]`).forEach(b => { if (b !== btn) { b.classList.toggle("given", !!r.given); b.querySelector(".b-count").textContent = r.count; } });
    } catch (e) {
      btn.classList.toggle("given", wasGiven); countEl.textContent = prev;
      window.toast(window.friendlyError(e));
    } finally { delete btn.dataset.busy; }
  }

  // ---------- 이벤트 위임 ----------
  function isCoarse() { return window.matchMedia && window.matchMedia("(pointer: coarse)").matches; }

  document.addEventListener("pointerdown", e => {
    const btn = e.target.closest(".berry-btn"); if (!btn) return;
    longPressed = false;
    if (btn.disabled) return;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => { longPressed = true; if (navigator.vibrate) navigator.vibrate(10); openGiversSheet(btn.dataset.id); }, 500);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => document.addEventListener(ev, e => {
    if (e.target.closest && e.target.closest(".berry-btn")) clearTimeout(longPressTimer);
  }));
  document.addEventListener("click", async e => {
    const btn = e.target.closest(".berry-btn");
    if (btn) {
      e.preventDefault();
      if (longPressed) { longPressed = false; return; }
      if (btn.disabled) { window.toast(btn.title || "내 글에는 딸기를 줄 수 없어요"); return; }
      // PC에서 5명 넘는 툴팁이 떠 있을 때 클릭하면 전체 목록
      if (!isCoarse() && tooltipEl && tooltipEl.dataset.many === "1") { hideTooltip(); openGiversSheet(btn.dataset.id); return; }
      toggle(btn);
      return;
    }
  });
  // PC hover 툴팁
  document.addEventListener("mouseover", async e => {
    const btn = e.target.closest(".berry-btn"); if (!btn || isCoarse()) return;
    const id = btn.dataset.id;
    showTooltip(btn, "불러오는 중…");
    try {
      const list = await loadGivers(id);
      if (!tooltipEl || !btn.matches(":hover")) return;
      showTooltip(btn, summary(list));
      if (tooltipEl && list.length > 5) tooltipEl.dataset.many = "1";
    } catch { hideTooltip(); }
  });
  document.addEventListener("mouseout", e => { if (e.target.closest && e.target.closest(".berry-btn")) hideTooltip(); });
  document.addEventListener("contextmenu", e => { if (e.target.closest && e.target.closest(".berry-btn")) e.preventDefault(); });
  window.addEventListener("scroll", hideTooltip, { passive: true });

  window.renderBerryButton = function (g, isMine) {
    const given = window.hasGiven(g.id) ? " given" : "";
    const dis = isMine ? ' disabled title="내 글에는 딸기를 줄 수 없어요"' : "";
    return `<button type="button" class="berry-btn${given}" data-id="${window.escapeHtml(g.id)}"${dis} aria-label="딸기 주기">
      <span class="b-ico">🍓</span><span class="b-count">${g.strawberry_count || 0}</span></button>`;
  };
})();
