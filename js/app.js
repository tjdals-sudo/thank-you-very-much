// =====================================================================
// 화면 전환 · 공통 UI · 홈/작성/피드/내 기록 로직
// =====================================================================
(function () {
  const C = window.APP_CONFIG || {};
  const TAGS = ["가족", "친구", "건강", "학교·일", "자연", "신앙", "일상", "음식", "나 자신"];
  const AGES = ["초등", "중등", "고등", "청년", "성인"];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const Store = window.Store, esc = window.escapeHtml;
  const periodLabel = (C.AWARD_PERIOD === "month") ? "이번 달" : "이번 주";

  // ---------- 공통 UI ----------
  let toastTimer = null;
  window.toast = function (msg, ms = 2600) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms);
  };
  window.openSheet = function (html, { center = false } = {}) {
    const ov = $("#overlay"); $("#sheet-body").innerHTML = html;
    ov.classList.toggle("center", center); ov.classList.add("show");
  };
  window.closeSheet = function () { $("#overlay").classList.remove("show"); };
  $("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") window.closeSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") window.closeSheet(); });

  // ---------- 테마 ----------
  function applyTheme() {
    const t = Store.get("theme", "auto");
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
    const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    $("#theme-toggle").textContent = dark ? "☀️" : "🌙";
    $('meta[name="theme-color"]').setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  }
  $("#theme-toggle").addEventListener("click", () => {
    const cur = Store.get("theme", "auto");
    const dark = cur === "dark" || (cur === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    Store.set("theme", dark ? "light" : "dark"); applyTheme();
    window.refreshChartTheme(); if (statsCache) renderStats(statsCache);
  });

  // ---------- 내 글 (localStorage) ----------
  const myPosts = () => Store.get("posts", []);
  const myTokens = () => myPosts().map(p => p.token);
  const myIds = () => new Set(myPosts().map(p => p.id));
  function addMyPost(p) { const list = myPosts(); list.unshift(p); Store.set("posts", list.slice(0, 500)); }
  function removeMyPost(id) { Store.set("posts", myPosts().filter(p => p.id !== id)); }

  // ---------- 감사 카드 렌더링 (모든 화면 공통) ----------
  window.renderCard = function (g, { mine = false, deletable = false } = {}) {
    const isMine = mine || myIds().has(g.id);
    const v = g.verse_id ? window.verseById(g.verse_id) : null;
    const verseHtml = v ? `
      <div class="verse-box">
        <div class="vb-head">🕊 오늘 이 말씀을 읽어보세요</div>
        <div class="vb-ref">${esc(window.verseRef(v))}</div>
        ${g.verse_reason ? `<div class="vb-reason">“${esc(g.verse_reason)}”</div>` : ""}
        <a class="vb-link" href="${window.bibleLink(v.book, v.chapter, v.verse)}" target="_blank" rel="noopener">성경 펴보기 →</a>
      </div>` : "";
    const tags = (g.tags || []).map(t => `<span class="tag">#${esc(t)}</span>`).join("");
    const actions = deletable
      ? `<div class="gcard-actions">${window.renderBerryButton(g, true)}<button type="button" class="report-btn delete-btn" data-id="${esc(g.id)}">삭제</button></div>`
      : `<div class="gcard-actions">${window.renderBerryButton(g, isMine)}${isMine ? '<span class="muted small">내 글</span>' : `<button type="button" class="report-btn" data-id="${esc(g.id)}">신고</button>`}</div>`;
    return `<article class="card gcard" data-id="${esc(g.id)}">
      <div class="gcard-nick">${esc(g.nickname)}</div>
      <div class="gcard-meta"><span class="emo">${esc(g.emotion)}</span><span>${window.formatDate(g.created_at)}</span>${g.age_group ? `<span>· ${esc(g.age_group)}</span>` : ""}</div>
      <p class="gcard-content">${esc(g.content)}</p>
      ${verseHtml}
      <div class="gcard-tags">${tags}</div>
      ${actions}
    </article>`;
  };
  const emptyHtml = (emo, msg) => `<div class="empty"><span class="emo">${emo}</span>${msg}</div>`;

  // 신고 / 삭제 (이벤트 위임)
  document.addEventListener("click", async e => {
    const rep = e.target.closest(".report-btn:not(.delete-btn)");
    if (rep) {
      if (!confirm("이 글을 신고할까요?\n욕설·비방·개인정보 등 문제가 있는 글만 신고해주세요.")) return;
      try {
        const r = await window.API.report(rep.dataset.id);
        window.toast(r.hidden ? "신고가 접수되어 글이 숨겨졌어요" : "신고가 접수됐어요. 확인 후 조치할게요");
        if (r.hidden) $$(`.gcard[data-id="${rep.dataset.id}"]`).forEach(c => c.remove());
      } catch (err) { window.toast(window.friendlyError(err)); }
    }
    const del = e.target.closest(".delete-btn");
    if (del) {
      if (!confirm("이 감사 노트를 삭제할까요? 되돌릴 수 없어요.")) return;
      const p = myPosts().find(x => x.id === del.dataset.id);
      try {
        const ok = await window.API.deleteGratitude(del.dataset.id, p ? p.token : "");
        if (ok) { removeMyPost(del.dataset.id); window.toast("삭제했어요"); loadMine(); }
        else window.toast("삭제하지 못했어요. 이미 지워졌을 수 있어요");
      } catch (err) { window.toast(window.friendlyError(err)); }
    }
  });

  // ---------- 라우팅 ----------
  const VIEWS = ["home", "write", "feed", "mine"];
  function currentView() { const h = location.hash.replace("#", ""); return VIEWS.includes(h) ? h : "home"; }
  function route() {
    const nick = Store.get("nickname");
    $$(".view").forEach(v => v.classList.remove("active"));
    if (!nick) {
      document.body.classList.add("no-tabbar"); $("#tabbar").classList.add("hidden"); $("#app-header").classList.add("hidden");
      $("#view-nickname").classList.add("active"); initNicknameView(); return;
    }
    document.body.classList.remove("no-tabbar"); $("#tabbar").classList.remove("hidden"); $("#app-header").classList.remove("hidden");
    const v = currentView();
    $("#view-" + v).classList.add("active");
    $$("#tabbar a").forEach(a => a.classList.toggle("active", a.dataset.view === v));
    window.scrollTo({ top: 0 });
    if (v === "home") loadHome();
    if (v === "write") initWrite();
    if (v === "feed") { if (!feed.loadedOnce) resetFeed(); }
    if (v === "mine") loadMine();
  }
  window.addEventListener("hashchange", route);

  // ---------- 0. 닉네임 설정 ----------
  let nickInited = false, nickCandidate = null;
  function initNicknameView() {
    if (nickInited) return; nickInited = true;
    const input = $("#nick-input"), help = $("#nick-help"), pName = $("#nick-preview-name"), pIntro = $("#nick-preview-intro");
    const show = (name, intro) => { pName.textContent = name || "?"; pIntro.textContent = intro || ""; };
    async function randomize() {
      $("#nick-random").disabled = true; show("뽑는 중…", "");
      const c = await window.randomUniqueNickname(20);
      $("#nick-random").disabled = false;
      if (!c) { show("?", ""); help.textContent = "닉네임을 뽑지 못했어요. 다시 뽑기를 눌러주세요"; help.classList.add("error"); return; }
      nickCandidate = c; input.value = c.name; show(c.name, `${c.person} — ${c.intro}`);
      help.textContent = "마음에 들면 시작하기를 눌러요. 직접 고쳐 써도 돼요"; help.classList.remove("error");
    }
    $("#nick-random").addEventListener("click", randomize);
    input.addEventListener("input", () => {
      const n = input.value.trim(); show(n || "?", window.personIntroFor(n));
      const err = window.validateNickname(n);
      help.textContent = err || "실명, 학교명, 전화번호는 쓸 수 없어요"; help.classList.toggle("error", !!err && n.length > 0);
    });
    $("#nick-start").addEventListener("click", async () => {
      const n = input.value.trim(); const err = window.validateNickname(n);
      if (err) { help.textContent = err; help.classList.add("error"); input.focus(); return; }
      const btn = $("#nick-start"); btn.disabled = true; btn.textContent = "확인 중…";
      try {
        const r = await window.API.claimNickname(n, Store.get("nick_token"));
        if (!r.ok) { help.textContent = r.error === "TAKEN" ? "이미 누군가 쓰고 있는 이름이에요" : window.friendlyError(r.error); help.classList.add("error"); return; }
        Store.set("nickname", n); Store.set("nickname_since", new Date().toISOString());
        location.hash = "#home"; route(); window.toast(`${n}님, 반가워요! 🍓`);
      } catch (e) { help.textContent = window.friendlyError(e); help.classList.add("error"); }
      finally { btn.disabled = false; btn.textContent = "시작하기"; }
    });
    randomize();
  }

  // ---------- 1. 홈 ----------
  let statsCache = null, statsPeriod = Store.get("stats_period", "week"), homeLoadedAt = 0, weatherLoaded = false;
  function renderStats(s) {
    $("#count-today").textContent = s.today_count ?? 0;
    $("#count-total").textContent = s.total_count ?? 0;
    window.renderWordCloud($("#cloud"), s.tags);
    window.renderEmotionChart($("#emotion-chart"), s.emotions);
  }
  async function loadStats() {
    $$("#stats-filters .chip").forEach(c => c.classList.toggle("selected", c.dataset.period === statsPeriod));
    try { statsCache = await window.API.getStats(statsPeriod); renderStats(statsCache); }
    catch (e) { console.warn(e); }
  }
  $("#stats-filters").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    statsPeriod = c.dataset.period; Store.set("stats_period", statsPeriod); loadStats();
  });
  async function loadHome() {
    const nick = Store.get("nickname");
    $("#home-greeting").textContent = `${nick}님, 안녕하세요`;
    const p = window.kstParts();
    $("#home-date").textContent = `${p.y}년 ${p.m}월 ${p.d}일 ${["일", "월", "화", "수", "목", "금", "토"][p.dow]}요일`;
    // 오늘의 말씀 / 이야기
    const v = window.verseOfTheDay();
    $("#votd-ref").textContent = window.verseRef(v); $("#votd-summary").textContent = v.summary;
    $("#votd-link").href = window.bibleLink(v.book, v.chapter, v.verse);
    const st = window.storyOfTheDay();
    $("#story-title").textContent = st.title; $("#story-body").textContent = st.body; $("#story-src").textContent = st.source ? `출처: ${st.source}` : "";
    // 날씨 (실패 시 카드 숨김)
    if (!weatherLoaded) {
      weatherLoaded = true;
      window.fetchWeather().then(w => {
        const el = $("#weather"); if (!w) { el.classList.add("hidden"); return; }
        $(".w-icon", el).textContent = w.icon; $(".w-temp", el).textContent = `${w.temp}°`;
        $(".w-desc", el).textContent = `${w.desc} · ${w.isCurrentLocation ? "현재 위치" : "서울"}`; $(".w-phrase", el).textContent = w.phrase;
        el.classList.remove("hidden");
      });
    }
    if (Date.now() - homeLoadedAt < 15000) return; homeLoadedAt = Date.now();
    loadStats();
    try {
      const list = await window.API.fetchRecent(C.RECENT_COUNT || 5);
      $("#home-recent").innerHTML = list.length ? list.map(g => window.renderCard(g)).join("") : emptyHtml("🍓", "아직 감사 노트가 없어요. 첫 번째 감사를 남겨볼까요?");
    } catch (e) { $("#home-recent").innerHTML = emptyHtml("😢", window.friendlyError(e)); }
  }

  // ---------- 2. 감사 작성 ----------
  const W = { emotion: null, tags: new Set(), submitting: false, inited: false, last: null };
  function newPrompt() { $("#prompt-q").textContent = window.PROMPTS[Math.floor(Math.random() * window.PROMPTS.length)]; }
  function initWrite() {
    $("#write-title").textContent = `✍️ ${Store.get("nickname")}님의 오늘 감사`;
    if (W.inited) return; W.inited = true;
    newPrompt(); $("#prompt-refresh").addEventListener("click", newPrompt);
    $("#emotion-grid").innerHTML = window.EMOTIONS.map(e => `<button type="button" class="emotion-btn" data-emo="${e.emo}"><span class="emo">${e.emo}</span><span class="name">${e.name}</span></button>`).join("");
    $("#emotion-grid").addEventListener("click", e => {
      const b = e.target.closest(".emotion-btn"); if (!b) return;
      W.emotion = b.dataset.emo; $$(".emotion-btn").forEach(x => x.classList.toggle("selected", x === b));
    });
    $("#tag-chips").innerHTML = TAGS.map(t => `<button type="button" class="chip" data-tag="${t}">${t}</button>`).join("");
    $("#tag-chips").addEventListener("click", e => {
      const c = e.target.closest(".chip"); if (!c) return; const t = c.dataset.tag;
      if (W.tags.has(t)) W.tags.delete(t);
      else { if (W.tags.size >= 3) { window.toast("키워드는 3개까지 고를 수 있어요"); return; } W.tags.add(t); }
      c.classList.toggle("selected", W.tags.has(t));
    });
    $("#age-group").innerHTML = `<option value="">선택 안 함</option>` + AGES.map(a => `<option value="${a}">${a}</option>`).join("");
    $("#age-group").value = Store.get("age_group", "");
    const ta = $("#content"), counter = $("#content-counter");
    ta.addEventListener("input", () => { const n = ta.value.length; counter.textContent = `${n} / 300`; counter.classList.toggle("over", n >= 300); });
    $("#write-form").addEventListener("submit", submitWrite);
    $("#write-again").addEventListener("click", resetWriteForm);
    $("#save-image").addEventListener("click", () => W.last && exportCardImage(W.last));
  }
  function resetWriteForm() {
    W.emotion = null; W.tags.clear(); W.last = null;
    $("#content").value = ""; $("#content-counter").textContent = "0 / 300"; $("#custom-tag").value = "";
    $$(".emotion-btn").forEach(x => x.classList.remove("selected")); $$("#tag-chips .chip").forEach(x => x.classList.remove("selected"));
    $("#content-help").classList.add("hidden");
    $("#write-form").classList.remove("hidden"); $("#write-result").classList.add("hidden"); newPrompt();
  }
  async function submitWrite(e) {
    e.preventDefault();
    if (W.submitting) return;
    const help = $("#content-help"); help.classList.add("hidden");
    const content = $("#content").value.trim();
    const fail = msg => { help.textContent = msg; help.classList.remove("hidden"); window.toast(msg); };
    if (!content) return fail("감사한 내용을 적어주세요");
    if (content.length > 300) return fail("300자까지 적을 수 있어요");
    const bad = window.checkBadText(content); if (bad) return fail(bad);
    if (!W.emotion) return fail("지금 마음을 하나 골라주세요");
    const tags = [...W.tags];
    const custom = $("#custom-tag").value.trim().replace(/^#/, "");
    if (custom) {
      if (custom.length > 8) return fail("직접 입력 키워드는 8자까지예요");
      const cb = window.checkBadText(custom); if (cb) return fail("키워드에 " + cb);
      if (!tags.includes(custom)) tags.push(custom);
    }
    if (tags.length < 1) return fail("키워드를 1개 이상 골라주세요");
    if (tags.length > 4) return fail("키워드는 선택 3개 + 직접 입력 1개까지예요");
    const lastAt = Store.get("last_post_at", 0);
    if (Date.now() - lastAt < 60000) return fail(`조금만 쉬었다 써요. ${Math.ceil((60000 - (Date.now() - lastAt)) / 1000)}초 뒤에 다시 등록할 수 있어요`);

    W.submitting = true; const btn = $("#submit-btn"); btn.disabled = true; btn.textContent = "남기는 중…";
    const age = $("#age-group").value || null; Store.set("age_group", age || "");
    const nickname = Store.get("nickname");
    const token = window.randomToken();
    const crisis = window.hasCrisisSignal(content);
    let rec = null;
    if (!crisis) rec = window.recommendVerse(content, tags, W.emotion);
    const row = {
      nickname, device_id: Store.get("device_id"), content, emotion: W.emotion, tags, age_group: age,
      verse_id: rec ? rec.verse.id : null, verse_reason: rec ? rec.reason : null,
      needs_review: crisis, owner_token_hash: await window.sha256Hex(token)
    };
    try {
      const r = await window.API.createGratitude(row);
      Store.set("last_post_at", Date.now());
      addMyPost({ id: r.id, token, created_at: r.created_at, emotion: W.emotion, date: window.kstDateStr(new Date(r.created_at)) });
      const g = { ...row, id: r.id, created_at: r.created_at, strawberry_count: 0 };
      W.last = { g, crisis };
      $("#result-card").innerHTML = window.renderCard(g, { mine: true }) + (crisis ? `<div class="care-box">💛 힘든 마음을 나눠줘서 감사해요. 혼자 견디지 않아도 돼요. 주변 어른이나 상담 창구(청소년상담 <a href="tel:1388">1388</a>, 자살예방 <a href="tel:109">109</a>)에 이야기해 보세요.</div>` : "");
      $("#result-sub").textContent = crisis ? "오늘의 마음도 소중한 기록이에요" : (rec ? `“${rec.reason}”` : "");
      $("#write-form").classList.add("hidden"); $("#write-result").classList.remove("hidden");
      celebrate(); homeLoadedAt = 0; feed.loadedOnce = false; window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      fail(window.friendlyError(err));
    } finally { W.submitting = false; btn.disabled = false; btn.textContent = "감사 남기기"; }
  }
  function celebrate() {
    const box = document.createElement("div"); box.className = "confetti";
    for (let i = 0; i < 18; i++) { const s = document.createElement("span"); s.textContent = ["🍓", "✨", "💛", "🍓"][i % 4]; s.style.left = Math.random() * 100 + "%"; s.style.animationDelay = (Math.random() * .6) + "s"; s.style.animationDuration = (1.2 + Math.random() * .9) + "s"; box.appendChild(s); }
    document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
  }

  // ---------- 감사 카드 이미지 저장 (인스타 스토리 9:16) ----------
  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    for (const para of String(text).split("\n")) {
      let line = "";
      for (const ch of para) {
        const test = line + ch;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = ch; } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  async function exportCardImage({ g, crisis }) {
    const btn = $("#save-image"); btn.disabled = true;
    try {
      try { await document.fonts.load("40px GyeonggiTitleM"); } catch {}
      const canvas = $("#export-canvas"); const ctx = canvas.getContext("2d");
      const Wd = 1080, Hd = 1920; canvas.width = Wd; canvas.height = Hd;
      const font = (px, bold = false) => `${bold ? "700 " : ""}${px}px GyeonggiTitleM, 'Pretendard', 'Noto Sans KR', sans-serif`;
      // 색상은 라이트 테마 고정 (공유용)
      const BG = "#F7F6F2", TXT = "#1F2A44", MUTED = "#6B7280", SEC = "#2F5D50", SURF = "#FFFFFF", GOLD = "#C9A96E";
      ctx.fillStyle = BG; ctx.fillRect(0, 0, Wd, Hd);
      ctx.fillStyle = TXT; ctx.textAlign = "center"; ctx.font = font(44, true); ctx.fillText("땡큐 베리 머치!", Wd / 2, 180);
      ctx.fillStyle = MUTED; ctx.font = font(28); ctx.fillText("익명으로 나누는 감사 노트", Wd / 2, 230);
      // 카드 내용 측정
      const pad = 64, cardX = 90, cardW = Wd - 180, innerW = cardW - pad * 2;
      ctx.textAlign = "left";
      ctx.font = font(40); const contentLines = wrapText(ctx, g.content, innerW);
      const v = g.verse_id ? window.verseById(g.verse_id) : null;
      ctx.font = font(30); const reasonLines = v && g.verse_reason ? wrapText(ctx, `“${g.verse_reason}”`, innerW - 60) : [];
      const lineH = 62, reasonH = 44;
      let h = pad + 56 + 50 + 30 + contentLines.length * lineH + 30;
      const verseBoxH = v ? (40 + 44 + reasonLines.length * reasonH + 36) : 0;
      h += verseBoxH + (v ? 30 : 0) + 50 + pad;
      const cardY = Math.max(300, (Hd - h) / 2 - 40);
      ctx.save(); ctx.shadowColor = "rgba(31,42,68,0.12)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
      ctx.fillStyle = SURF; roundRect(ctx, cardX, cardY, cardW, h, 44); ctx.fill(); ctx.restore();
      let y = cardY + pad;
      ctx.fillStyle = TXT; ctx.font = font(48, true); ctx.fillText(g.nickname, cardX + pad, y + 44); y += 56 + 16;
      ctx.font = font(32); ctx.fillText(`${g.emotion}  ${window.formatDate(g.created_at)}`, cardX + pad, y + 28); y += 50 + 30;
      ctx.font = font(40); ctx.fillStyle = TXT;
      for (const l of contentLines) { ctx.fillText(l, cardX + pad, y + 40); y += lineH; }
      y += 30;
      if (v) {
        ctx.fillStyle = "#EEF4F1"; roundRect(ctx, cardX + pad, y, innerW, verseBoxH, 24); ctx.fill();
        ctx.strokeStyle = "#CBDDD5"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = SEC; ctx.font = font(26, true); ctx.fillText("🕊 오늘 이 말씀을 읽어보세요", cardX + pad + 30, y + 40);
        ctx.fillStyle = TXT; ctx.font = font(34, true); ctx.fillText(window.verseRef(v), cardX + pad + 30, y + 40 + 44);
        ctx.fillStyle = MUTED; ctx.font = font(30); let yy = y + 40 + 44 + 44;
        for (const l of reasonLines) { ctx.fillText(l, cardX + pad + 30, yy); yy += reasonH; }
        y += verseBoxH + 30;
      }
      // 태그
      ctx.font = font(28); let tx = cardX + pad;
      for (const t of g.tags || []) {
        const label = "#" + t; const w = ctx.measureText(label).width + 36;
        if (tx + w > cardX + cardW - pad) break;
        ctx.fillStyle = "#E6EFEB"; roundRect(ctx, tx, y, w, 50, 25); ctx.fill();
        ctx.fillStyle = SEC; ctx.fillText(label, tx + 18, y + 35); tx += w + 12;
      }
      // 하단
      ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.font = font(30); ctx.fillText("🍓", Wd / 2, Hd - 150);
      ctx.fillStyle = MUTED; ctx.font = font(26); ctx.fillText(crisis ? "오늘의 마음도 소중한 기록이에요" : "오늘도 감사를 남겼어요", Wd / 2, Hd - 100);
      const blob = await new Promise(res => canvas.toBlob(res, "image/png"));
      const file = new File([blob], `thankyou-${window.kstDateStr()}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "땡큐 베리 머치!" }); return; } catch (e) { if (e.name === "AbortError") return; }
      }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      window.toast("이미지를 저장했어요");
    } catch (e) { console.error(e); window.toast("이미지를 만들지 못했어요"); }
    finally { btn.disabled = false; }
  }

  // ---------- 3. 모아보기 ----------
  const feed = { offset: 0, done: false, loading: false, loadedOnce: false, tag: "", emotion: "", age: "" };
  function initFeedFilters() {
    $("#f-tag").innerHTML = `<option value="">키워드 전체</option>` + TAGS.map(t => `<option value="${t}">#${t}</option>`).join("");
    $("#f-emotion").innerHTML = `<option value="">감정 전체</option>` + window.EMOTIONS.map(e => `<option value="${e.emo}">${e.emo} ${e.name}</option>`).join("");
    $("#f-age").innerHTML = `<option value="">연령대 전체</option>` + AGES.map(a => `<option value="${a}">${a}</option>`).join("");
    ["f-tag", "f-emotion", "f-age"].forEach(id => $("#" + id).addEventListener("change", () => {
      feed.tag = $("#f-tag").value; feed.emotion = $("#f-emotion").value; feed.age = $("#f-age").value; resetFeed();
    }));
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && currentView() === "feed") loadMoreFeed(); }, { rootMargin: "300px" });
    io.observe($("#feed-sentinel"));
  }
  function resetFeed() { feed.offset = 0; feed.done = false; feed.loadedOnce = true; $("#feed-list").innerHTML = ""; loadMoreFeed(); }
  async function loadMoreFeed() {
    if (feed.loading || feed.done) return;
    feed.loading = true; $("#feed-loading").classList.remove("hidden");
    try {
      const list = await window.API.fetchFeed({ offset: feed.offset, limit: C.PAGE_SIZE || 20, tag: feed.tag, emotion: feed.emotion, age: feed.age });
      if (feed.offset === 0 && !list.length) $("#feed-list").innerHTML = emptyHtml("🍓", "조건에 맞는 감사 노트가 없어요");
      else $("#feed-list").insertAdjacentHTML("beforeend", list.map(g => window.renderCard(g)).join(""));
      feed.offset += list.length; if (list.length < (C.PAGE_SIZE || 20)) feed.done = true;
    } catch (e) { if (feed.offset === 0) $("#feed-list").innerHTML = emptyHtml("😢", window.friendlyError(e)); feed.done = true; }
    finally { feed.loading = false; $("#feed-loading").classList.add("hidden"); }
  }

  // ---------- 4. 내 기록 ----------
  let calCursor = null; // {y, m}
  function streakDays(dates) {
    const set = new Set(dates); if (!set.size) return 0;
    const today = window.kstDateStr(); const d = new Date(today + "T00:00:00+09:00");
    const key = dt => window.kstDateStr(dt);
    if (!set.has(key(d))) d.setUTCDate(d.getUTCDate() - 1);
    if (!set.has(key(d))) return 0;
    let n = 0; while (set.has(key(d))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
    return n;
  }
  function renderCalendar(posts) {
    const p = window.kstParts(); if (!calCursor) calCursor = { y: p.y, m: p.m };
    const { y, m } = calCursor;
    $("#cal-title").textContent = `${y}년 ${m}월`;
    const byDate = {}; for (const x of posts) { const k = x.date || window.kstDateStr(new Date(x.created_at)); byDate[k] = byDate[k] || x.emotion; }
    const first = new Date(y, m - 1, 1).getDay(); const days = new Date(y, m, 0).getDate();
    let html = ["일", "월", "화", "수", "목", "금", "토"].map(d => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < first; i++) html += `<div class="day empty"></div>`;
    const todayStr = window.kstDateStr();
    for (let d = 1; d <= days; d++) {
      const k = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const e = byDate[k];
      html += `<div class="day${e ? " has" : ""}${k === todayStr ? " today" : ""}">${e ? `<span class="e">${e}</span>` : ""}<span>${d}</span></div>`;
    }
    $("#calendar").innerHTML = html;
  }
  $("#cal-prev").addEventListener("click", () => { calCursor.m--; if (calCursor.m < 1) { calCursor.m = 12; calCursor.y--; } renderCalendar(myPosts()); });
  $("#cal-next").addEventListener("click", () => { calCursor.m++; if (calCursor.m > 12) { calCursor.m = 1; calCursor.y++; } renderCalendar(myPosts()); });

  async function loadMine() {
    const nick = Store.get("nickname");
    $("#me-nick").textContent = nick; $("#me-intro").textContent = window.personIntroFor(nick);
    $("#me-berries-label").textContent = `${periodLabel} 받은 🍓`;
    const posts = myPosts();
    $("#me-streak").textContent = streakDays(posts.map(p => p.date || window.kstDateStr(new Date(p.created_at))));
    renderCalendar(posts);
    window.API.getMyStrawberries(myTokens()).then(n => { $("#me-berries").textContent = n; }).catch(() => { $("#me-berries").textContent = "-"; });
    // 수상 안내 (본인 기기에만)
    window.API.getMyAward(myTokens()).then(a => {
      const box = $("#award-banner"); if (!a) { box.innerHTML = ""; return; }
      const pl = a.period_type === "month" ? "지난달" : "지난주";
      box.innerHTML = `<div class="card award-banner">
        <div class="card-title">🍓 ${pl} 딸기를 가장 많이 받은 ${a.rank}위예요!</div>
        <p class="muted small">${window.formatDate(a.period_start)} ~ ${window.formatDate(new Date(new Date(a.period_end).getTime() - 1).toISOString())} · 🍓 ${a.strawberry_total}개 (${esc(a.nickname)})</p>
        <p style="margin-top:8px">관리자에게 아래 수상 확인 코드를 보여주세요</p>
        <div class="code">${esc(a.claim_code)}</div>
        ${a.delivered ? '<p class="muted small" style="text-align:center">✅ 상품 전달 완료</p>' : ""}
      </div>`;
    }).catch(() => {});
    // 내가 쓴 글
    const listEl = $("#my-list");
    if (!posts.length) { listEl.innerHTML = emptyHtml("✍️", "아직 이 기기에서 쓴 감사가 없어요"); return; }
    listEl.innerHTML = `<div class="loading">불러오는 중…</div>`;
    try {
      const rows = await window.API.fetchByIds(posts.map(p => p.id));
      const missing = posts.length - rows.length;
      listEl.innerHTML = (rows.length ? rows.map(g => window.renderCard(g, { mine: true, deletable: true })).join("") : emptyHtml("🍓", "표시할 글이 없어요"))
        + (missing > 0 ? `<p class="muted small" style="text-align:center">${missing}개의 글은 삭제되었거나 신고로 숨겨져 보이지 않아요</p>` : "");
    } catch (e) { listEl.innerHTML = emptyHtml("😢", window.friendlyError(e)); }
  }

  // 닉네임 변경
  $("#change-nick").addEventListener("click", () => {
    const cur = Store.get("nickname");
    window.openSheet(`
      <h3>닉네임 변경</h3>
      <p class="muted small" style="margin-bottom:10px">변경 후 쓴 글부터 새 닉네임이 적용돼요. ${periodLabel} 받은 딸기는 이전 닉네임(${esc(cur)})에 남아요.</p>
      <div class="field"><input id="cn-input" class="input" maxlength="10" placeholder="새 닉네임 (2~10자)"><div class="help" id="cn-help">실명, 학교명, 전화번호는 쓸 수 없어요</div></div>
      <div class="btn-row"><button class="btn btn-outline" id="cn-random">🎲 랜덤</button><button class="btn btn-primary" id="cn-save">변경하기</button></div>`, { center: true });
    const input = $("#cn-input"), help = $("#cn-help");
    $("#cn-random").addEventListener("click", async () => { const c = await window.randomUniqueNickname(); if (c) { input.value = c.name; help.textContent = `${c.person} — ${c.intro}`; help.classList.remove("error"); } });
    $("#cn-save").addEventListener("click", async () => {
      const n = input.value.trim(); const err = window.validateNickname(n);
      if (err) { help.textContent = err; help.classList.add("error"); return; }
      if (n === cur) { help.textContent = "지금 닉네임과 같아요"; help.classList.add("error"); return; }
      $("#cn-save").disabled = true;
      try {
        const r = await window.API.changeNickname(cur, n, Store.get("nick_token"));
        if (!r.ok) { help.textContent = r.error === "TAKEN" ? "이미 누군가 쓰고 있는 이름이에요" : window.friendlyError(r.error); help.classList.add("error"); return; }
        const prev = Store.get("prev_nicknames", []); prev.push({ nickname: cur, until: new Date().toISOString() }); Store.set("prev_nicknames", prev);
        Store.set("nickname", n); window.closeSheet(); loadMine();
        window.toast(`닉네임을 ${n}(으)로 바꿨어요. ${periodLabel} 받은 딸기는 이전 닉네임에 남아요`, 3500);
      } catch (e) { help.textContent = window.friendlyError(e); help.classList.add("error"); }
      finally { $("#cn-save").disabled = false; }
    });
    setTimeout(() => input.focus(), 50);
  });

  // ---------- 시작 ----------
  function boot() {
    applyTheme();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { applyTheme(); window.refreshChartTheme(); if (statsCache) renderStats(statsCache); });
    if (window.API.isDemo) $("#demo-banner").classList.remove("hidden");
    $("#stats-filters").innerHTML = [["today", "오늘"], ["week", "이번 주"], ["month", "이번 달"], ["all", "전체"]].map(([k, l]) => `<button type="button" class="chip" data-period="${k}">${l}</button>`).join("");
    initFeedFilters();
    route();
    window.addEventListener("resize", () => { if (statsCache && currentView() === "home") window.renderWordCloud($("#cloud"), statsCache.tags); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
