// 금칙어·개인정보 패턴 (닉네임·감사 내용 공통)
// 청소년 사용자를 위한 최소한의 안전장치입니다. 필요에 따라 항목을 추가·삭제하세요.

window.BADWORDS = {
  // 포함되면 차단되는 단어 (공백·특수문자 제거 후 비교)
  words: [
    "시발","씨발","씨빨","시빨","쉬발","씨팔","시팔","십알","씹","좆","존나","졸라","ㅈㄴ","개새","개색","개세",
    "병신","븅신","빙신","지랄","지럴","염병","엠병","닥쳐","꺼져","죽어","뒤져","뒈져","미친놈","미친년",
    "새끼","쌔끼","새꺄","년아","놈아","썅","쌍놈","쌍년","개년","개놈","호로","후레","느금","니애미","니엄마","니미",
    "애미","애비","엄창","창녀","창년","걸레","보지","자지","꼬추","딸딸이","야동","야사","섹스","섹파","성관계","강간",
    "변태","음란","야한","19금","성인물","포르노","콘돔","원나잇","조건만남","스폰",
    "담배","술마시","소주","맥주","마약","대마","필로폰",
    "일베","한남","김치녀","된장녀","틀딱","급식충","맘충","장애인새","흑형","짱깨","쪽바리","왜놈",
    "자살","자해","살인","죽여버","죽일","칼로","때려죽","폭행"
  ],
  // 초성 욕설 패턴 (정규식)
  patterns: [
    /ㅅ\s*ㅂ/, /ㅆ\s*ㅂ/, /ㅂ\s*ㅅ/, /ㅈ\s*ㄹ/, /ㅁ\s*ㅊ/, /ㄲ\s*ㅈ/, /ㅗ/, /ㅄ/, /ㅅㅐㄲ/,
    /[sS][hH]?[iI1!][bB][aA][lL]/, /[fF][uU][cC][kK]/, /[sS][hH][iI][tT]/, /[bB][iI][tT][cC][hH]/
  ],
  // 연락처·URL·SNS 아이디 패턴
  contact: [
    /https?:\/\//i, /www\./i, /\.(com|net|kr|org|io|me|co|ly|gg|tv)\b/i,
    /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/,       // 휴대폰 번호
    /\d{2,3}[-\s.]\d{3,4}[-\s.]\d{4}/,           // 일반 전화번호
    /@[A-Za-z0-9_.]{3,}/,                         // SNS 핸들
    /(인스타|insta|ig)\s*[:：]?\s*[A-Za-z0-9_.]{3,}/i,
    /(카톡|카카오톡|kakao|라인|line|디스코드|discord|텔레그램|telegram)\s*(아이디|id|아디)?\s*[:：]?\s*[A-Za-z0-9_.#]{3,}/i,
    /(아이디|아디|id)\s*[:：]\s*[A-Za-z0-9_.]{3,}/i,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ // 이메일
  ]
};

// 닉네임에서 금지하는 추가 단어 (실명·학교명·관리자 사칭 등)
window.NICKNAME_BLOCKLIST = [
  "관리자","운영자","admin","administrator","master","목사","전도사","선생님","교사","staff",
  "초등학교","중학교","고등학교","대학교","학교","학년","반","교회","온누리"
];

// 텍스트 검사: 통과하면 null, 아니면 사유 문자열 반환
window.checkBadText = function (text, { isNickname = false } = {}) {
  if (!text) return null;
  const raw = String(text);
  const compact = raw.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  for (const w of window.BADWORDS.words) {
    if (compact.includes(w.toLowerCase())) return "사용할 수 없는 표현이 들어 있어요";
  }
  for (const re of window.BADWORDS.patterns) {
    if (re.test(raw)) return "사용할 수 없는 표현이 들어 있어요";
  }
  for (const re of window.BADWORDS.contact) {
    if (re.test(raw)) return "연락처·링크·SNS 아이디는 적을 수 없어요";
  }
  if (isNickname) {
    for (const w of window.NICKNAME_BLOCKLIST) {
      if (compact.includes(w.toLowerCase())) return "실명·학교명·관리자 같은 이름은 쓸 수 없어요";
    }
    if (/\d{3,}/.test(raw)) return "숫자가 너무 많아요 (전화번호·학번 금지)";
  }
  return null;
};
