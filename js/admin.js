// 관리자 페이지 로직 (admin.html)
(function () {
  const C = window.APP_CONFIG || {};
  const $ = s => document.querySelector(s); const esc = window.escapeHtml; const Store = window.Store; const A = window.API.admin;
  let toastTimer;
  window.toast = (m, ms = 2600) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms); };
  window.openSheet = (html) => { $("#sheet-body").innerHTML = html; $("#overlay").classList.add("show", "center"); };
  window.closeSheet = () => $("#overlay").classList.remove("show");
  $("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") window.closeSheet(); });

  // 테마
  function applyTheme() {
    const t = Store.get("theme", "auto");
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
    const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    $("#theme-toggle").textContent = dark ? "☀️" : "🌙";
  }
  $("#theme-toggle").addEventListener("click", () => { const cur = Store.get("theme", "auto"); const dark = cur === "dark" || (cur === "auto" && matchMedia("(prefers-color-scheme: dark)").matches); Store.set("theme", dark ? "light" : "dark"); applyTheme(); });
  applyTheme();

  const show = id => { ["login", "forbidden", "dash"].forEach(s => $("#" + s).classList.toggle("hidden", s !== id)); };
  const fmt = iso => window.formatDate(iso);
  const fmtRange = (s, e) => `${fmt(s)} ~ ${fmt(new Date(new Date(e).getTime() - 1).toISOString())}`;
  const fmtTime = iso => { const d = new Date(iso); return `${fmt(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

  // ---------- 로그인 흐름 ----------
  async function init() {
    if (window.API.isDemo) { $("#demo-banner").classList.remove("hidden"); show("dash"); loadAll(); return; }
    A.onAuthChange(() => check());
    check();
    $("#login-form").addEventListener("submit", async e => {
      e.preventDefault(); const loginId = $("#login-id").value.trim(), pw = $("#login-pw").value; if (!loginId || !pw) return;
      $("#login-btn").disabled = true; $("#login-help").textContent = "";
      try { await A.signIn(loginId, pw); $("#login-pw").value = ""; await check(); }
      catch (err) { $("#login-help").textContent = window.friendlyError(err); }
      finally { $("#login-btn").disabled = false; }
    });
    $("#signout").addEventListener("click", async () => { await A.signOut(); location.hash = ""; check(); });
    $("#forbidden-signout").addEventListener("click", async () => { await A.signOut(); check(); });
  }
  let checking = false;
  async function check() {
    if (checking) return; checking = true;
    try {
      const session = await A.getSession();
      if (!session) { show("login"); $("#signout").classList.add("hidden"); $("#admin-email").classList.add("hidden"); return; }
      $("#admin-email").textContent = (session.user.email || "").split("@")[0]; $("#admin-email").classList.remove("hidden"); $("#signout").classList.remove("hidden");
      const ok = await A.isAdmin();
      if (!ok) { show("forbidden"); return; }
      show("dash"); loadAll();
    } catch (e) { console.error(e); show("login"); $("#login-help").textContent = window.friendlyError(e); }
    finally { checking = false; }
  }

  // ---------- 대시보드 ----------
  let periodEnd = null, cdTimer = null;
  function tickCountdown() {
    if (!periodEnd) return;
    const ms = new Date(periodEnd) - Date.now();
    if (ms <= 0) { $("#countdown").textContent = "마감 처리 중"; return; }
    const d = Math.floor(ms / 86400000), h = Math.floor(ms % 86400000 / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    $("#countdown").textContent = `${d}일 ${h}시간 ${m}분 ${s}초`;
  }
  async function loadRanking() {
    try {
      const r = await A.getRanking();
      periodEnd = r.period_end; clearInterval(cdTimer); cdTimer = setInterval(tickCountdown, 1000); tickCountdown();
      $("#rank-title").textContent = r.period_type === "month" ? "이번 달" : "이번 주";
      $("#rank-period").textContent = fmtRange(r.period_start, r.period_end);
      $("#rank-topn").textContent = `시상 인원 ${r.top_n}명`;
      const rows = r.rows || [];
      $("#rank-body").innerHTML = rows.length ? rows.map(x => `<tr class="${x.rank <= r.top_n ? "top" : ""}"><td>${x.rank}</td><td>${esc(x.nickname)}</td><td>🍓 ${x.strawberry_total}</td><td>${x.gratitude_count}</td></tr>`).join("")
        : `<tr><td colspan="4" class="muted">아직 이번 기간에 받은 딸기가 없어요</td></tr>`;
    } catch (e) { $("#rank-body").innerHTML = `<tr><td colspan="4" class="muted">${esc(window.friendlyError(e))}</td></tr>`; }
  }
  async function loadAwards() {
    try {
      const list = await A.getAwardHistory();
      // 가장 최근 기간
      const latestStart = list.length ? list[0].period_start : null;
      const latest = list.filter(a => a.period_start === latestStart);
      $("#last-awards").innerHTML = latest.length ? latest.map(a => `
        <div class="card" style="padding:12px;margin-bottom:8px">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <strong>${a.rank}위 ${esc(a.nickname)}</strong><span class="muted small">🍓 ${a.strawberry_total} · ${fmtRange(a.period_start, a.period_end)}</span>
            <span class="badge ${a.delivered ? "ok" : ""}" style="margin-left:auto">${a.delivered ? "전달 완료" : "미전달"}</span>
          </div>
          <div class="inline-form" style="margin-top:8px">
            <input class="input" inputmode="numeric" maxlength="7" placeholder="수상자가 보여준 6자리 코드" data-code-for="${a.id}">
            <button class="btn btn-outline btn-sm" data-verify="${a.id}">대조</button>
            <button class="btn btn-secondary btn-sm" data-deliver="${a.id}" data-delivered="${a.delivered ? 1 : 0}">${a.delivered ? "전달 취소" : "전달 완료"}</button>
          </div>
          <div class="help" data-result="${a.id}"></div>
        </div>`).join("") : `<p class="muted small">아직 마감된 기간이 없어요.</p>`;
      $("#history-body").innerHTML = list.length ? list.map(a => `<tr><td>${fmtRange(a.period_start, a.period_end)}</td><td>${a.rank}</td><td>${esc(a.nickname)}</td><td>${a.strawberry_total}</td><td>${a.delivered ? '<span class="badge ok">완료</span>' : '<span class="badge">대기</span>'}</td></tr>`).join("")
        : `<tr><td colspan="5" class="muted">기록이 없어요</td></tr>`;
    } catch (e) { $("#last-awards").innerHTML = `<p class="muted small">${esc(window.friendlyError(e))}</p>`; }
  }
  $("#last-awards").addEventListener("click", async e => {
    const v = e.target.closest("[data-verify]"), d = e.target.closest("[data-deliver]");
    if (v) {
      const id = v.dataset.verify; const code = document.querySelector(`[data-code-for="${id}"]`).value; const out = document.querySelector(`[data-result="${id}"]`);
      try { const ok = await A.verifyClaimCode(id, code); out.textContent = ok ? "✅ 코드가 일치해요" : "❌ 코드가 달라요"; out.className = "help " + (ok ? "" : "error"); }
      catch (err) { out.textContent = window.friendlyError(err); }
    }
    if (d) {
      const id = d.dataset.deliver; const cur = d.dataset.delivered === "1";
      try { await A.markDelivered(id, !cur); window.toast(cur ? "전달 완료를 취소했어요" : "상품 전달 완료로 표시했어요"); loadAwards(); }
      catch (err) { window.toast(window.friendlyError(err)); }
    }
  });
  $("#close-period").addEventListener("click", async () => {
    if (!confirm("직전 기간의 시상을 지금 마감할까요?\n이미 마감된 기간이면 아무 일도 일어나지 않아요.")) return;
    try { const r = await A.closePeriod(); window.toast(r.closed ? `마감 완료: 수상자 ${r.winners}명` : `마감하지 않았어요 (${r.reason})`, 3500); loadAwards(); }
    catch (e) { window.toast(window.friendlyError(e)); }
  });
  async function loadSuspicious() {
    try {
      const s = await A.getSuspicious();
      $("#burst-body").innerHTML = (s.burst || []).length ? s.burst.map(b => `<tr><td>${esc(b.nickname)}</td><td class="small">${esc(b.content)}</td><td>${b.strawberry_count}</td><td>${b.burst_count}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">없음</td></tr>`;
      $("#multi-body").innerHTML = (s.multi_nickname || []).length ? s.multi_nickname.map(m => `<tr><td class="small">${esc(String(m.device_id).slice(0, 8))}…</td><td>${(m.nicknames || []).map(esc).join(", ")}</td><td>${m.strawberry_count}</td><td class="small">${fmtTime(m.last_at)}</td></tr>`).join("") : `<tr><td colspan="4" class="muted">없음</td></tr>`;
    } catch (e) { $("#burst-body").innerHTML = `<tr><td colspan="4" class="muted">${esc(window.friendlyError(e))}</td></tr>`; }
  }
  const miniCard = (g, actions) => `<div class="card" style="padding:12px;margin-bottom:8px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><strong>${esc(g.nickname)}</strong><span class="muted small">${g.emotion || ""} ${fmtTime(g.created_at)}</span>
        ${g.report_count ? `<span class="badge warn">신고 ${g.report_count}</span>` : ""}${g.is_hidden ? `<span class="badge">숨김</span>` : ""}${g.needs_review ? `<span class="badge warn">확인 필요</span>` : ""}</div>
      <p class="small" style="margin:6px 0;white-space:pre-wrap">${esc(g.content)}</p>
      <div class="btn-row">${actions}</div></div>`;
  async function loadReview() {
    try {
      const list = await A.getNeedsReview();
      $("#review-list").innerHTML = list.length ? list.map(g => miniCard(g, `<button class="btn btn-danger btn-sm" data-del="${g.id}">삭제</button>`)).join("") : `<p class="muted small">확인이 필요한 글이 없어요.</p>`;
    } catch (e) { $("#review-list").innerHTML = `<p class="muted small">${esc(window.friendlyError(e))}</p>`; }
  }
  async function loadHidden() {
    try {
      const list = await A.getHidden();
      $("#hidden-list").innerHTML = list.length ? list.map(g => miniCard(g, `<button class="btn btn-outline btn-sm" data-restore="${g.id}">복구</button><button class="btn btn-danger btn-sm" data-del="${g.id}">삭제</button>`)).join("") : `<p class="muted small">숨겨진 글이 없어요.</p>`;
    } catch (e) { $("#hidden-list").innerHTML = `<p class="muted small">${esc(window.friendlyError(e))}</p>`; }
  }
  document.addEventListener("click", async e => {
    const r = e.target.closest("[data-restore]"), d = e.target.closest("[data-del]");
    if (r) { try { await A.restore(r.dataset.restore); window.toast("복구했어요"); loadHidden(); } catch (err) { window.toast(window.friendlyError(err)); } }
    if (d) { if (!confirm("이 글을 완전히 삭제할까요?")) return; try { await A.adminDelete(d.dataset.del); window.toast("삭제했어요"); loadHidden(); loadReview(); } catch (err) { window.toast(window.friendlyError(err)); } }
  });
  $("#rank-refresh").addEventListener("click", loadRanking);
  function loadAll() { loadRanking(); loadAwards(); loadSuspicious(); loadReview(); loadHidden(); }

  init();
})();
