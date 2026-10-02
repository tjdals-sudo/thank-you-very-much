// =====================================================================
// 땡큐 베리 머치! — 설정
// Supabase 프로젝트 설정 > API 에서 URL 과 anon(public) key 를 복사해 넣으세요.
// 두 값이 비어 있으면 데모 모드(예시 데이터, 기기 내 저장)로 동작합니다.
// anon key 는 공개되어도 괜찮습니다. 데이터 접근은 RLS 와 RPC 로 제한됩니다.
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // 시상 주기: "week" (월요일 0시 ~ 일요일 24시, 한국 시간) 또는 "month"
  // supabase/schema.sql 의 app_settings.award_period 와 같은 값으로 맞추세요.
  AWARD_PERIOD: "week",
  // 시상 인원 (app_settings.award_top_n 과 동일하게)
  AWARD_TOP_N: 3,

  // 피드 한 번에 불러오는 개수
  PAGE_SIZE: 20,
  // 날씨 기본 위치 (위치 권한 거부 시): 서울
  DEFAULT_LAT: 37.5665,
  DEFAULT_LON: 126.9780,
  // 홈 최근 감사 미리보기 개수
  RECENT_COUNT: 5
};
