// 말씀 추천 로직 (AI 없이 브라우저에서 점수 계산)
(function () {
  const RECENT_KEY = "recent_verses"; // [{id, date}]
  const DAYS7 = 7 * 24 * 3600 * 1000;

  function recentIds() {
    const list = (window.Store.get(RECENT_KEY, []) || []).filter(r => Date.now() - r.date < DAYS7);
    window.Store.set(RECENT_KEY, list);
    return new Set(list.map(r => r.id));
  }
  function rememberVerse(id) {
    const list = (window.Store.get(RECENT_KEY, []) || []).filter(r => Date.now() - r.date < DAYS7);
    list.push({ id, date: Date.now() });
    window.Store.set(RECENT_KEY, list);
  }
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // 태그 → 주제 (직접 입력 태그는 단어 사전으로 추정)
  function tagTopics(tags) {
    const out = [];
    for (const t of tags || []) {
      if (window.TAG_TO_TOPIC[t]) out.push(window.TAG_TO_TOPIC[t]);
      else {
        const found = window.findTopicWords(t);
        if (found.length) out.push(found[0].topic);
        else if (Object.keys(window.KEYWORD_TOPICS).includes(t)) out.push(t);
      }
    }
    return out;
  }

  /**
   * 추천 말씀 선택
   * @param {string} content 감사 내용
   * @param {string[]} tags 선택 태그
   * @param {string} emotion 감정 이모티콘
   * @returns {{verse, reason, score, matchedWords}}
   */
  window.recommendVerse = function (content, tags, emotion) {
    const pool = window.VERSE_POOL;
    const recent = recentIds();
    const topicsFromTags = tagTopics(tags);
    const words = window.findTopicWords(content).slice(0, 3); // 단어 최대 3개
    const wordTopics = words.map(w => w.topic);

    let best = -Infinity, cands = [];
    for (const v of pool) {
      let s = 0;
      for (const t of topicsFromTags) if (v.topics.includes(t)) s += 3;
      for (const t of wordTopics) if (v.topics.includes(t)) s += 2;
      if (emotion && v.emotions.includes(emotion)) s += 1;
      if (recent.has(v.id)) s -= 5;
      if (s > best) { best = s; cands = [v]; }
      else if (s === best) cands.push(v);
    }
    // 아무것도 맞지 않으면 감사 주제에서 랜덤
    if (best <= 0) {
      const fallback = pool.filter(v => v.topics.includes("감사") && !recent.has(v.id));
      cands = fallback.length ? fallback : pool.filter(v => v.topics.includes("감사"));
    }
    const verse = pick(cands);
    const reason = pick(verse.reasons);
    rememberVerse(verse.id);
    return { verse, reason, score: best, matchedWords: words.map(w => w.word) };
  };

  window.verseById = function (id) { return window.VERSE_POOL.find(v => v.id === id) || null; };
  window.verseRef = v => `${v.book} ${v.chapter}:${v.verse}`;

  // 오늘의 말씀: 날짜(KST) 기준으로 하루 고정, 누구에게나 같은 구절
  window.verseOfTheDay = function () {
    const d = window.kstDateStr();
    let h = 0; for (const ch of d) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = window.VERSE_POOL;
    return pool[h % pool.length];
  };
  window.storyOfTheDay = function () {
    const d = window.kstDateStr();
    let h = 7; for (const ch of d) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
    return window.STORIES[h % window.STORIES.length];
  };
})();
