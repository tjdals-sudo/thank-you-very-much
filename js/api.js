// =====================================================================
// Supabase 통신 계층 + 데모 모드 (config.js 가 비어 있으면 자동으로 데모 모드)
// 모든 화면은 window.API 만 사용하므로, 저장소를 바꾸려면 이 파일만 수정하면 됩니다.
// =====================================================================
(function () {
  const C = window.APP_CONFIG || {};
  const isDemo = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;

  // ---------- 공통 유틸 ----------
  window.escapeHtml = function (s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };
  window.uuid = function () {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };
  window.randomToken = function () {
    const a = new Uint8Array(24); crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
  };
  window.sha256Hex = async function (text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
  };
  // 한국 시간 기준 날짜 문자열 YYYY-MM-DD
  window.kstDateStr = function (d = new Date()) {
    const k = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60000);
    return `${k.getFullYear()}-${String(k.getMonth() + 1).padStart(2, "0")}-${String(k.getDate()).padStart(2, "0")}`;
  };
  window.kstParts = function (d = new Date()) {
    const k = new Date(d.getTime() + (9 * 60 + d.getTimezoneOffset()) * 60000);
    return { y: k.getFullYear(), m: k.getMonth() + 1, d: k.getDate(), dow: k.getDay(), date: k };
  };
  window.formatDate = function (iso) {
    const p = window.kstParts(new Date(iso));
    return `${p.y}.${String(p.m).padStart(2, "0")}.${String(p.d).padStart(2, "0")}`;
  };
  // 이번 시상 기간 시작 (KST) — 로컬 표시용
  window.periodStart = function (type = C.AWARD_PERIOD || "week", now = new Date()) {
    const p = window.kstParts(now);
    const k = p.date;
    let start;
    if (type === "month") start = new Date(k.getFullYear(), k.getMonth(), 1);
    else { const dow = (k.getDay() + 6) % 7; start = new Date(k.getFullYear(), k.getMonth(), k.getDate() - dow); }
    // KST 자정을 UTC 기준 Date 로 환산
    return new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) - 9 * 3600 * 1000);
  };

  // localStorage 래퍼 (개인 편의 정보만 저장)
  const Store = {
    get(k, def = null) { try { const v = localStorage.getItem("tvm_" + k); return v === null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem("tvm_" + k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem("tvm_" + k); } catch {} }
  };
  window.Store = Store;
  if (!Store.get("device_id")) Store.set("device_id", window.uuid());
  if (!Store.get("nick_token")) Store.set("nick_token", window.randomToken());

  // 오류 메시지 변환
  const ERR = {
    RATE_LIMIT: "조금 천천히 해주세요. 1분 뒤에 다시 시도할 수 있어요",
    OWN_POST: "내 글에는 딸기를 줄 수 없어요",
    NOT_FOUND: "글을 찾을 수 없어요",
    HIDDEN: "숨겨진 글이에요",
    FORBIDDEN: "관리자만 사용할 수 있어요",
    "Invalid login credentials": "아이디 또는 비밀번호가 맞지 않아요",
    "Email not confirmed": "아직 확인되지 않은 계정이에요",
    TAKEN: "이미 누군가 쓰고 있는 이름이에요",
    NOT_OWNER: "닉네임 소유 확인에 실패했어요",
    INVALID: "닉네임은 2~10자여야 해요"
  };
  window.friendlyError = function (e) {
    const msg = (e && (e.message || e.error || e)) + "";
    for (const k of Object.keys(ERR)) if (msg.includes(k)) return ERR[k];
    if (/Failed to fetch|NetworkError|network/i.test(msg)) return "인터넷 연결을 확인해주세요";
    return e && e.hint ? e.hint : "잠시 문제가 생겼어요. 다시 시도해주세요";
  };

  // =====================================================================
  // 데모 모드 저장소
  // =====================================================================
  const DEMO_NICKS = ["김베드로", "이한나", "박바울", "최다윗", "정에스더", "강요셉", "조다니엘", "윤룻", "장드보라", "임디모데", "한마리아", "오갈렙"];
  function seedDemo() {
    const now = Date.now(), H = 3600 * 1000;
    const mk = (i, nick, content, emotion, tags, age, vid, reason, hoursAgo, berries) => ({
      id: "demo-" + i, nickname: nick, device_id: "demo-device-" + nick, content, emotion, tags, age_group: age,
      verse_id: vid, verse_reason: reason, needs_review: false, owner_token_hash: "demo",
      strawberry_count: berries.length, report_count: 0, is_hidden: false,
      created_at: new Date(now - hoursAgo * H).toISOString(),
      _berries: berries.map((n, j) => ({ device_id: "demo-device-" + n, nickname: n, created_at: new Date(now - hoursAgo * H + (j + 1) * 600000).toISOString() }))
    });
    const g = [
      mk(1, "김베드로", "오늘 급식에 떡볶이 나왔다! 매운데 맛있어서 친구들이랑 웃으면서 먹었다. 별거 아닌데 하루가 즐거워졌다.", "😊", ["음식", "친구"], "중등", "ps34-8", "맛있는 걸 먹을 때마다 선하심을 맛봐요", 2, ["이한나", "박바울", "최다윗", "정에스더", "강요셉", "조다니엘", "윤룻"]),
      mk(2, "이한나", "시험 망한 줄 알았는데 생각보다 괜찮게 나왔다. 그동안 밤늦게까지 같이 공부해준 짝꿍한테 감사하다.", "💪", ["학교·일", "친구"], "고등", "ps126-5", "울면서 한 노력, 기쁨으로 돌아와요", 5, ["김베드로", "최다윗", "임디모데"]),
      mk(3, "박바울", "엄마가 아침에 말없이 도시락 싸주셨다. 늘 당연하게 생각했는데 오늘은 좀 울컥했다.", "🥹", ["가족", "음식"], "고등", "ps103-13", "가족의 사랑에서 하나님을 봐요", 8, ["이한나", "정에스더", "한마리아", "오갈렙", "장드보라", "윤룻"]),
      mk(4, "최다윗", "감기 때문에 일주일 내내 아팠는데 드디어 다 나았다. 숨 쉬는 게 이렇게 편한 거였구나.", "😌", ["건강"], "청년", "ps103-3", "회복은 하나님의 일이에요", 12, ["김베드로", "박바울"]),
      mk(5, "정에스더", "퇴근길에 노을이 진짜 예뻤다. 잠깐 멈춰서 하늘 보는데 괜히 마음이 놓였다.", "😌", ["자연", "일상"], "성인", "ps19-1", "하늘을 보며 감탄한 순간, 좋은 기도예요", 20, ["강요셉", "이한나", "조다니엘", "임디모데", "한마리아"]),
      mk(6, "강요셉", "수련회에서 처음으로 진심으로 기도했다. 뭐라 설명은 못 하겠는데 마음이 따뜻해졌다.", "🥰", ["신앙"], "중등", "jer29-13", "온 마음으로 찾으면 만나요", 26, ["김베드로", "정에스더", "장드보라", "윤룻"]),
      mk(7, "조다니엘", "동생이랑 맨날 싸우는데 오늘은 동생이 먼저 사과했다. 아이스크림 하나 사줬다.", "😊", ["가족"], "초등", "ps133-1", "같이 있어서 아름다운 하루였어요", 30, ["박바울", "최다윗", "오갈렙"]),
      mk(8, "윤룻", "면접 떨어졌다. 근데 친구가 바로 전화해서 한 시간 동안 들어줬다. 그게 너무 감사했다.", "🥹", ["친구", "나 자신"], "청년", "pro17-17", "힘들 때 곁에 있는 친구가 진짜예요", 40, ["이한나", "정에스더", "강요셉", "임디모데", "한마리아", "김베드로", "조다니엘", "장드보라"]),
      mk(9, "장드보라", "비 오는 날 우산 없었는데 모르는 분이 같이 쓰고 가주셨다. 세상에 좋은 사람 많다.", "🥰", ["일상", "자연"], "성인", "luk10-33", "오늘 나의 사마리아인은 누구였나요", 50, ["최다윗", "윤룻"]),
      mk(10, "임디모데", "오늘 아침에 일찍 일어나서 운동했다. 미루던 걸 해낸 내가 좀 대견하다.", "💪", ["나 자신", "건강"], "고등", "pro31-25", "당당하게 하루를 마쳤네요", 70, ["김베드로", "박바울", "한마리아", "오갈렙"])
    ];
    return { gratitudes: g, nicknames: DEMO_NICKS.map(n => ({ nickname: n, owner_token_hash: "demo" })), reports: {}, awards: [], events: [] };
  }
  function demoDB() {
    let db = Store.get("demo_db");
    if (!db || !db.gratitudes) { db = seedDemo(); Store.set("demo_db", db); }
    return db;
  }
  function saveDemo(db) { Store.set("demo_db", db); }
  const pub = g => {
    const { device_id, owner_token_hash, needs_review, _berries, ...rest } = g; return rest;
  };

  // =====================================================================
  // 실제 Supabase 클라이언트
  // =====================================================================
  let sb = null;
  if (!isDemo) {
    if (!window.supabase) console.error("supabase-js 가 로드되지 않았어요");
    else sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  }
  async function rpc(name, params) {
    const { data, error } = await sb.rpc(name, params);
    if (error) throw error;
    return data;
  }
  function applyFilters(q, f) {
    if (f.tag) q = q.contains("tags", [f.tag]);
    if (f.emotion) q = q.eq("emotion", f.emotion);
    if (f.age) q = q.eq("age_group", f.age);
    return q;
  }

  const API = {
    isDemo,
    client: () => sb,
    deviceId: () => Store.get("device_id"),

    // ---------- 닉네임 ----------
    async nicknameExists(nick) {
      if (isDemo) return demoDB().nicknames.some(n => n.nickname === nick.trim());
      return !!(await rpc("nickname_exists", { p_nickname: nick }));
    },
    async claimNickname(nick, token) {
      if (isDemo) {
        const db = demoDB();
        if (db.nicknames.some(n => n.nickname === nick.trim())) return { ok: false, error: "TAKEN" };
        db.nicknames.push({ nickname: nick.trim(), owner_token_hash: token }); saveDemo(db);
        return { ok: true };
      }
      return await rpc("claim_nickname", { p_nickname: nick, p_token: token });
    },
    async changeNickname(oldNick, newNick, token) {
      if (isDemo) {
        const db = demoDB();
        if (db.nicknames.some(n => n.nickname === newNick.trim())) return { ok: false, error: "TAKEN" };
        db.nicknames.push({ nickname: newNick.trim(), owner_token_hash: token }); saveDemo(db);
        return { ok: true };
      }
      return await rpc("change_nickname", { p_old: oldNick, p_new: newNick, p_token: token });
    },

    // ---------- 감사 노트 ----------
    async createGratitude(row) {
      if (isDemo) {
        const db = demoDB();
        const last = db.gratitudes.filter(g => g.device_id === row.device_id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (last && Date.now() - new Date(last.created_at).getTime() < 60000) throw new Error("RATE_LIMIT");
        const g = { ...row, id: window.uuid(), strawberry_count: 0, report_count: 0, is_hidden: false, created_at: new Date().toISOString(), _berries: [] };
        db.gratitudes.unshift(g); saveDemo(db);
        return { id: g.id, created_at: g.created_at };
      }
      const { data, error } = await sb.from("gratitudes").insert(row).select("id, created_at").single();
      if (error) throw error;
      return data;
    },
    async fetchFeed({ offset = 0, limit = C.PAGE_SIZE || 20, tag = "", emotion = "", age = "" } = {}) {
      if (isDemo) {
        let list = demoDB().gratitudes.filter(g => !g.is_hidden);
        if (tag) list = list.filter(g => g.tags.includes(tag));
        if (emotion) list = list.filter(g => g.emotion === emotion);
        if (age) list = list.filter(g => g.age_group === age);
        list.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return list.slice(offset, offset + limit).map(pub);
      }
      let q = sb.from("gratitudes_public").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
      q = applyFilters(q, { tag, emotion, age });
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    async fetchRecent(n = C.RECENT_COUNT || 5) { return API.fetchFeed({ offset: 0, limit: n }); },
    async fetchByIds(ids) {
      if (!ids || !ids.length) return [];
      if (isDemo) return demoDB().gratitudes.filter(g => ids.includes(g.id) && !g.is_hidden).map(pub);
      const { data, error } = await sb.from("gratitudes_public").select("*").in("id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async deleteGratitude(id, token) {
      if (isDemo) {
        const db = demoDB(); const i = db.gratitudes.findIndex(g => g.id === id);
        if (i >= 0) { db.gratitudes.splice(i, 1); saveDemo(db); return true; }
        return false;
      }
      return !!(await rpc("delete_gratitude", { p_gratitude_id: id, p_token: token }));
    },
    async report(id) {
      if (isDemo) {
        const db = demoDB(); const dev = Store.get("device_id");
        db.reports[id] = db.reports[id] || [];
        if (!db.reports[id].includes(dev)) db.reports[id].push(dev);
        const g = db.gratitudes.find(x => x.id === id);
        if (g) { g.report_count = db.reports[id].length; g.is_hidden = g.report_count >= 3; }
        saveDemo(db);
        return { report_count: g ? g.report_count : 0, hidden: g ? g.is_hidden : false };
      }
      return await rpc("report_gratitude", { p_gratitude_id: id, p_device_id: Store.get("device_id") });
    },

    // ---------- 딸기 ----------
    async toggleStrawberry(id, nickname) {
      const dev = Store.get("device_id");
      if (isDemo) {
        const db = demoDB(); const g = db.gratitudes.find(x => x.id === id);
        if (!g) throw new Error("NOT_FOUND");
        if (g.device_id === dev) throw new Error("OWN_POST");
        db.events = (db.events || []).filter(t => Date.now() - t < 60000);
        if (db.events.length >= 30) throw new Error("RATE_LIMIT");
        db.events.push(Date.now());
        const i = g._berries.findIndex(b => b.device_id === dev);
        let given;
        if (i >= 0) { g._berries.splice(i, 1); given = false; }
        else { g._berries.push({ device_id: dev, nickname, created_at: new Date().toISOString() }); given = true; }
        g.strawberry_count = g._berries.length; saveDemo(db);
        return { count: g.strawberry_count, given };
      }
      return await rpc("toggle_strawberry", { p_gratitude_id: id, p_device_id: dev, p_nickname: nickname });
    },
    async getGivers(id) {
      if (isDemo) {
        const g = demoDB().gratitudes.find(x => x.id === id);
        return g ? g._berries.slice(-50).map(b => b.nickname) : [];
      }
      return (await rpc("get_strawberry_givers", { p_gratitude_id: id })) || [];
    },
    async getMyStrawberries(tokens) {
      if (isDemo) {
        const ids = (Store.get("posts", [])).map(p => p.id); const start = window.periodStart().toISOString();
        return demoDB().gratitudes.filter(g => ids.includes(g.id) && !g.is_hidden)
          .reduce((a, g) => a + g._berries.filter(b => b.created_at >= start).length, 0);
      }
      if (!tokens || !tokens.length) return 0;
      return (await rpc("get_my_strawberries", { p_tokens: tokens })) || 0;
    },
    async getMyAward(tokens) {
      if (isDemo) return null;
      if (!tokens || !tokens.length) return null;
      return await rpc("get_my_award", { p_tokens: tokens });
    },

    // ---------- 통계 ----------
    async getStats(period = "all") {
      if (isDemo) {
        const list = demoDB().gratitudes.filter(g => !g.is_hidden);
        const todayStr = window.kstDateStr();
        const start = period === "today" ? new Date(window.kstDateStr() + "T00:00:00+09:00")
          : period === "week" ? window.periodStart("week") : period === "month" ? window.periodStart("month") : new Date(0);
        const inP = list.filter(g => new Date(g.created_at) >= start);
        const tags = {}, emotions = {};
        for (const g of inP) { for (const t of g.tags) tags[t] = (tags[t] || 0) + 1; emotions[g.emotion] = (emotions[g.emotion] || 0) + 1; }
        return { tags, emotions, period_count: inP.length, today_count: list.filter(g => window.kstDateStr(new Date(g.created_at)) === todayStr).length, total_count: list.length };
      }
      return await rpc("get_stats", { p_period: period });
    },

    // ---------- 관리자 ----------
    admin: {
      async getSession() { if (isDemo || !sb) return null; const { data } = await sb.auth.getSession(); return data.session; },
      onAuthChange(cb) { if (sb) sb.auth.onAuthStateChange((_e, s) => cb(s)); },
      // 아이디 + 비밀번호 로그인 (아이디는 내부적으로 아이디@ADMIN_ID_DOMAIN 이메일로 변환)
      async signIn(loginId, password) {
        const id = String(loginId || "").trim().toLowerCase();
        const email = id.includes("@") ? id : `${id}@${C.ADMIN_ID_DOMAIN || "tvm.local"}`;
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signOut() { if (sb) await sb.auth.signOut(); },
      async isAdmin() { if (isDemo) return true; return !!(await rpc("is_admin", {})); },
      async getRanking(period) {
        if (isDemo) {
          const start = window.periodStart().toISOString(); const list = demoDB().gratitudes.filter(g => !g.is_hidden);
          const t = {}; for (const g of list) { const c = g._berries.filter(b => b.created_at >= start).length; if (c) t[g.nickname] = (t[g.nickname] || 0) + c; }
          const posts = {}; for (const g of list) if (g.created_at >= start) posts[g.nickname] = (posts[g.nickname] || 0) + 1;
          const rows = Object.entries(t).map(([nickname, total]) => ({ nickname, strawberry_total: total, gratitude_count: posts[nickname] || 0 }))
            .sort((a, b) => b.strawberry_total - a.strawberry_total || b.gratitude_count - a.gratitude_count);
          let rank = 0; rows.forEach((r, i) => { if (i === 0 || r.strawberry_total !== rows[i - 1].strawberry_total || r.gratitude_count !== rows[i - 1].gratitude_count) rank = i + 1; r.rank = rank; });
          const ps = window.periodStart(); const pe = new Date(ps); if ((C.AWARD_PERIOD || "week") === "month") pe.setUTCMonth(pe.getUTCMonth() + 1); else pe.setUTCDate(pe.getUTCDate() + 7);
          return { period_type: C.AWARD_PERIOD || "week", period_start: ps.toISOString(), period_end: pe.toISOString(), top_n: C.AWARD_TOP_N || 3, rows: rows.slice(0, 20) };
        }
        return await rpc("get_ranking", { p_period: period || null });
      },
      async getAwardHistory() {
        if (isDemo) {
          const ps = window.periodStart(); const prev = new Date(ps); prev.setUTCDate(prev.getUTCDate() - 7);
          return [
            { id: "demo-award-1", period_type: "week", period_start: prev.toISOString(), period_end: ps.toISOString(), rank: 1, nickname: "윤룻", strawberry_total: 8, gratitude_count: 1, delivered: false },
            { id: "demo-award-2", period_type: "week", period_start: prev.toISOString(), period_end: ps.toISOString(), rank: 2, nickname: "김베드로", strawberry_total: 7, gratitude_count: 1, delivered: true },
            { id: "demo-award-3", period_type: "week", period_start: prev.toISOString(), period_end: ps.toISOString(), rank: 3, nickname: "박바울", strawberry_total: 6, gratitude_count: 1, delivered: false }
          ];
        }
        return await rpc("get_award_history", {});
      },
      async verifyClaimCode(awardId, code) { if (isDemo) return code.replace(/\D/g, "") === "123456"; return !!(await rpc("verify_claim_code", { p_award_id: awardId, p_code: code })); },
      async markDelivered(awardId, delivered = true) { if (isDemo) return true; return !!(await rpc("mark_delivered", { p_award_id: awardId, p_delivered: delivered })); },
      async getSuspicious() {
        if (isDemo) return { burst: [{ id: "demo-8", nickname: "윤룻", content: "면접 떨어졌다. 근데 친구가…", strawberry_count: 8, burst_count: 8, first_at: new Date().toISOString(), created_at: new Date().toISOString() }], multi_nickname: [{ device_id: "demo-device-xyz", nicknames: ["김베드로", "박바울"], nickname_count: 2, strawberry_count: 5, last_at: new Date().toISOString() }] };
        return await rpc("get_suspicious_activity", {});
      },
      async getNeedsReview() { if (isDemo) return []; return await rpc("get_needs_review", {}); },
      async getHidden() { if (isDemo) return demoDB().gratitudes.filter(g => g.is_hidden).map(pub); return await rpc("get_hidden_gratitudes", {}); },
      async restore(id) {
        if (isDemo) { const db = demoDB(); const g = db.gratitudes.find(x => x.id === id); if (g) { g.is_hidden = false; g.report_count = 0; delete db.reports[id]; saveDemo(db); } return true; }
        return !!(await rpc("restore_gratitude", { p_gratitude_id: id }));
      },
      async adminDelete(id) {
        if (isDemo) { const db = demoDB(); db.gratitudes = db.gratitudes.filter(x => x.id !== id); saveDemo(db); return true; }
        return !!(await rpc("admin_delete_gratitude", { p_gratitude_id: id }));
      },
      async closePeriod() { if (isDemo) return { closed: false, reason: "DEMO" }; return await rpc("admin_close_award_period", { p_force: true }); }
    }
  };
  window.API = API;
})();
