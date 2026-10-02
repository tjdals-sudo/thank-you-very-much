// 닉네임 생성·검사
(function () {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  // "성씨 + 성경 인물" 랜덤 조합. 반환: { name, person, intro }
  window.randomNickname = function () {
    const surname = pick(window.SURNAMES);
    const person = pick(window.BIBLE_PEOPLE);
    return { name: surname + person.name, person: person.name, intro: person.intro };
  };

  // 중복되지 않는 랜덤 닉네임 (최대 20회 시도). 실패하면 null
  window.randomUniqueNickname = async function (maxTries = 20) {
    for (let i = 0; i < maxTries; i++) {
      const cand = window.randomNickname();
      try {
        if (!(await window.API.nicknameExists(cand.name))) return cand;
      } catch (e) {
        // 네트워크 문제 등: 한 번 더 시도
      }
    }
    return null;
  };

  // 형식 검사 (중복 확인은 별도). 통과하면 null, 아니면 사유
  window.validateNickname = function (nick) {
    const n = (nick || "").trim();
    if (n.length < 2 || n.length > 10) return "닉네임은 2~10자로 적어주세요";
    if (/\s/.test(n)) return "띄어쓰기 없이 적어주세요";
    if (!/^[가-힣A-Za-z0-9ㄱ-ㅎㅏ-ㅣ]+$/.test(n)) return "한글, 영문, 숫자만 쓸 수 있어요";
    const bad = window.checkBadText(n, { isNickname: true });
    if (bad) return bad;
    return null;
  };

  // 성경 인물 소개 찾기 (닉네임 안에 인물 이름이 들어 있으면)
  window.personIntroFor = function (nick) {
    const p = window.BIBLE_PEOPLE.find(p => nick && nick.endsWith(p.name));
    return p ? `${p.name} — ${p.intro}` : "";
  };
})();
