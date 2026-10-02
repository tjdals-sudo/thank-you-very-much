# 🍓 땡큐 베리 머치!

> 익명으로 나누는 감사 노트

누구나 로그인 없이 접속해 익명으로 감사 노트를 쓰고, 서로의 감사에 🍓 딸기로 반응하는 모바일 우선 웹앱입니다.
순수 HTML + CSS + JavaScript 로 만들어져 빌드 없이 GitHub Pages 에 바로 배포되고, 공유 데이터와 관리자 로그인은 Supabase 무료 플랜을 사용합니다.

- 프론트엔드: 정적 HTML/CSS/JS (빌드 도구 없음)
- 데이터·관리자 인증: Supabase (supabase-js CDN, RLS + RPC)
- 날씨: Open-Meteo (무료, 키 불필요) · 차트: Chart.js · 워드클라우드: wordcloud2.js
- 말씀 추천: AI 없이 브라우저에서 점수 계산 (`js/verse-match.js`), 성경 본문은 표시하지 않고 장절만 안내

---

## 목차

1. [빠른 시작 (데모 모드)](#1-빠른-시작-데모-모드)
2. [Supabase 연결](#2-supabase-연결)
3. [관리자 페이지 설정](#3-관리자-페이지-설정)
4. [주간 시상 자동 마감 (pg_cron)](#4-주간-시상-자동-마감-pg_cron)
5. [수상 확인 코드 대조 방법](#5-수상-확인-코드-대조-방법)
6. [GitHub Pages 배포](#6-github-pages-배포)
7. [폰트 (경기천년제목)](#7-폰트-경기천년제목)
8. [테마 색상 바꾸기](#8-테마-색상-바꾸기)
9. [데이터 추가·삭제 (이름, 말씀, 단어 사전 등)](#9-데이터-추가삭제)
10. [보안: anon key 가 공개돼도 괜찮은 이유](#10-보안-anon-key-가-공개돼도-괜찮은-이유)
11. [Supabase 무료 플랜 일시정지 안내](#11-supabase-무료-플랜-일시정지-안내)
12. [저장소 구조](#12-저장소-구조)

---

## 1. 빠른 시작 (데모 모드)

`js/config.js` 의 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 가 비어 있으면 **데모 모드**로 동작합니다.

- 예시 감사 노트 10개, 예시 딸기와 딸기 준 사람 목록이 표시됩니다.
- 닉네임 중복 확인·딸기·신고는 이 브라우저의 localStorage 기준으로 동작합니다.
- `admin.html` 은 로그인 없이 예시 랭킹으로 화면만 확인할 수 있습니다. (실제 연결 시에는 반드시 로그인 필요)

로컬에서 보기:

```bash
# 아무 정적 서버면 됩니다 (file:// 로 열면 폰트·fetch 가 막힐 수 있어요)
python3 -m http.server 8080
# → http://localhost:8080
```

---

## 2. Supabase 연결

### 2-1. 프로젝트 만들기

1. https://supabase.com 에서 무료 프로젝트를 만듭니다. (Region: Northeast Asia (Seoul) 추천)
2. 데이터베이스 비밀번호는 안전한 곳에 적어두세요.

### 2-2. schema.sql 실행

**방법 A — 대시보드 (가장 쉬움)**
1. Supabase 대시보드 → **SQL Editor** → **New query**
2. `supabase/schema.sql` 전체를 붙여넣고 **Run**
3. "Success" 가 뜨면 끝. (pg_cron 관련 NOTICE 가 뜨면 4번 항목을 참고하세요)

**방법 B — Supabase CLI**
```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref <프로젝트-ref>      # 프로젝트 설정 > General 에서 확인
supabase db query --file supabase/schema.sql     # 또는 migrations 로 복사 후 supabase db push
```

`schema.sql` 은 여러 번 실행해도 안전합니다 (`if not exists` / `or replace`).

### 2-3. config.js 에 URL·anon key 입력

대시보드 → **Project Settings → API** 에서 복사:

```js
// js/config.js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",   // anon / public key
  AWARD_PERIOD: "week",                 // "week" 또는 "month"
  AWARD_TOP_N: 3,
  ...
};
```

> `AWARD_PERIOD`, `AWARD_TOP_N` 을 바꾸면 DB 의 `app_settings` 도 같이 바꿔주세요:
> ```sql
> update app_settings set value = 'month' where key = 'award_period';
> update app_settings set value = '5'     where key = 'award_top_n';
> ```

---

## 3. 관리자 페이지 설정

관리자 페이지(`admin.html`)는 일반 화면 어디에도 링크가 없고, **아이디 + 비밀번호 로그인**으로만 들어갈 수 있습니다.
관리자 여부는 서버(DB)의 `admins` 테이블로 판단하므로, 주소를 알아도 등록된 계정으로 로그인하지 않으면 어떤 데이터도 볼 수 없습니다.

Supabase Auth 는 이메일 형식 계정을 쓰기 때문에, 아이디 뒤에 `js/config.js` 의 `ADMIN_ID_DOMAIN` (기본 `tvm.local`)을 붙인 이메일을 내부적으로 사용합니다.
예) 아이디 `john` → 계정 이메일 `john@tvm.local`

### 3-1. 관리자 계정 만들기

1. Supabase 대시보드 → **Authentication → Users → Add user → Create new user**
   - Email: `아이디@tvm.local` (예: `john@tvm.local`)
   - Password: 원하는 비밀번호 (6자 이상)
   - **Auto Confirm User** 체크
2. SQL Editor 에서 `admins` 테이블에 같은 이메일 등록:
   ```sql
   insert into public.admins(email) values ('john@tvm.local') on conflict do nothing;
   ```

비밀번호 변경: Authentication → Users → 해당 사용자 → **Reset password** 또는 **Send password recovery** (recovery 는 실제 메일 주소가 아니면 쓸 수 없으니 Reset 을 사용).
관리자 삭제: `admins` 테이블에서 행 삭제 (Auth 사용자도 함께 지우면 깔끔합니다).

### 3-2. Auth 설정

- **Authentication → Providers → Email**: Enable 켜기 (기본값). 이게 꺼지면 아이디+비밀번호 로그인 자체가 막힙니다.
- **Authentication → Sign In / Providers → "Allow new users to sign up"**: 끄기 (공개 회원가입 차단). `supabase/config.toml` 에서는 최상위 `[auth] enable_signup = false` 에 해당하며, `[auth.email] enable_signup` 은 이메일 제공자 스위치이므로 `true` 로 둡니다.
- **Authentication → URL Configuration → Site URL**: `https://<깃허브아이디>.github.io/<저장소이름>/`
  (CLI 로 `supabase config push` 하면 `supabase/config.toml` 의 값이 반영됩니다)

### 3-3. 접속

`https://<깃허브아이디>.github.io/<저장소이름>/admin.html` → 아이디 · 비밀번호 입력 → 관리자 페이지.
로그인 상태는 브라우저에 유지되며, 우측 상단 **로그아웃**으로 끝낼 수 있습니다.

관리자 페이지 기능:
- 이번 주 딸기 랭킹 TOP 20 (동점 → 감사 노트 수 → 공동 순위), 남은 기간 카운트다운
- 지난 기간 수상자 + 수상 확인 코드 대조 + "상품 전달 완료" 체크
- 주차별 수상 기록
- 의심 활동 (10분 내 딸기 8개 이상 몰린 글 / 같은 기기에서 여러 닉네임으로 딸기)
- 위기 신호 감지 글 "확인 필요" 목록
- 신고로 숨겨진 글 복구·삭제

---

## 4. 주간 시상 자동 마감 (pg_cron)

`close_award_period()` 함수가 직전 기간의 상위 `award_top_n` 명을 `awards` 테이블에 기록합니다.
`schema.sql` 이 pg_cron 에 **매일 15:00 UTC (= 한국 시간 0시)** 로 등록하며, 함수 안에서 기간 경계일(주간: 월요일 / 월간: 1일)에만 실제로 마감합니다. 같은 기간을 두 번 마감하지 않습니다.

pg_cron 이 켜져 있지 않아 NOTICE 가 떴다면:

1. 대시보드 → **Database → Extensions** → `pg_cron` 검색 → Enable
2. SQL Editor 에서 다시 등록:
   ```sql
   select cron.schedule('tvm-close-award-period', '0 15 * * *', 'select public.close_award_period(false)');
   ```
3. 등록 확인: `select * from cron.job;`
4. 실행 기록: `select * from cron.job_run_details order by start_time desc limit 10;`

수동 마감(테스트·비상용)은 관리자 페이지의 **수동 마감 실행** 버튼, 또는 SQL 로 `select public.close_award_period(true);`.

---

## 5. 수상 확인 코드 대조 방법

1. 마감 후, 수상자가 **글을 작성했던 기기**의 "내 기록" 탭에 들어가면 축하 배너와 **6자리 수상 확인 코드**가 표시됩니다. (다른 사람에게는 누가 받았는지 보이지 않습니다)
2. 수상자가 관리자에게 코드를 보여줍니다.
3. 관리자 페이지 → **지난 기간 수상자 · 코드 대조** 에서 해당 수상자 칸에 코드를 입력하고 **대조**.
4. "✅ 코드가 일치해요" 가 뜨면 상품을 전달하고 **전달 완료** 를 누릅니다.

코드는 DB 에 해시로만 저장되며, 서버 비밀값(`app_secrets.claim_salt`)과 award id 로 결정되기 때문에 본인 기기(글 소유 토큰 보유)에서만 조회할 수 있습니다.

---

## 6. GitHub Pages 배포

빌드가 필요 없으므로 저장소 루트를 그대로 Pages 로 서빙합니다. (`.nojekyll` 포함)

**GitHub CLI**
```bash
gh repo create thank-you-very-much --public --source . --push
gh api -X POST repos/<아이디>/thank-you-very-much/pages -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"
```

**웹에서**: 저장소 → Settings → Pages → Source: *Deploy from a branch* → Branch `main` / `/ (root)` → Save.
1~2분 뒤 `https://<아이디>.github.io/thank-you-very-much/` 에서 열립니다.

배포 후 Supabase **Authentication → URL Configuration** 의 Site URL 에 이 주소를 넣어주세요 (3-2 참고).

---

## 7. 폰트 (경기천년제목)

경기도 공식 서체 "경기천년제목 Medium" 을 `/fonts` 에서 직접 호스팅합니다. (`css/style.css` 의 `@font-face`)

- 다운로드: 경기도청 → 경기도 소개 → 상징 → 경기도 서체
  https://www.gg.go.kr/contents/contents.do?ciIdx=679&menuId=2457
  "경기서체 웹폰트" zip 안에 `Title_Medium.otf`, `woff/Title_Medium.woff` 가 들어 있습니다.
- `fonts/GyeonggiTitleM.woff2` (otf → woff2 변환), `fonts/GyeonggiTitleM.woff` 로 저장해 두었습니다.
  직접 변환하려면 `brew install woff2 && woff2_compress Title_Medium.otf`.
- 경기천년체는 개인·기업 모두 무료로 사용할 수 있으며, 서체 자체를 판매하는 것만 금지됩니다. (경기도 서체 사용 안내 참고)
- fallback: `'Pretendard', 'Noto Sans KR', sans-serif`

---

## 8. 테마 색상 바꾸기

`css/style.css` **맨 위** `:root { ... }` 블록의 CSS 변수만 바꾸면 전체에 적용됩니다.

```css
:root {
  --primary: #1F2A44;     /* 메인 (짙은 남색) */
  --secondary: #2F5D50;   /* 보조 (짙은 초록) */
  --accent: #C9A96E;      /* 포인트 (차분한 골드) — 소량만 사용 */
  --bg: #F7F6F2;          /* 배경 (따뜻한 오프화이트) */
  ...
}
```

다크 모드 색상은 바로 아래 `@media (prefers-color-scheme: dark)` 와 `:root[data-theme="dark"]` 블록에 있습니다.
(이미지 저장용 색상은 공유 일관성을 위해 `js/app.js` 의 `exportCardImage()` 에 라이트 색상으로 고정돼 있습니다.)

---

## 9. 데이터 추가·삭제

모든 데이터는 `data/` 폴더의 JS 파일입니다. 저장 후 새로고침하면 바로 반영됩니다.

| 파일 | 내용 | 추가 방법 |
|---|---|---|
| `data/names.js` | 한국 성씨(`SURNAMES`), 성경 인물(`BIBLE_PEOPLE`) | 배열에 `"성"` 또는 `{ name: "인물", intro: "한 줄 소개" }` 추가. 악인·동명이인 중 악인이 있는 이름은 넣지 마세요 |
| `data/verse-pool.js` | 말씀 장절 풀 (본문 없음) | `V.push([...])` 안에 `["고유id","책이름",장,절,["주제"],["감정이모지"],"한 줄 요약","연결문장1","연결문장2"]` 한 줄 추가. 책 이름은 `BIBLE_BOOK_CODES` 의 키와 같아야 함. 연결 문장은 40자 이내, 본문 인용 금지 |
| `data/keywords.js` | 단어 → 주제 사전(`KEYWORD_TOPICS`), 위기 단어(`CRISIS_KEYWORDS`), 태그→주제(`TAG_TO_TOPIC`) | 해당 주제 배열에 단어(어근) 추가. 한 글자 단어는 오탐이 많으니 조사를 붙인 형태로 |
| `data/stories.js` | 오늘의 감사 이야기 | `{ title, body, source }` 추가. 실존 인물·연구는 사실에 근거한 내용만 |
| `data/prompts.js` | 작성 도움 질문 | 문자열 추가 |
| `data/badwords.js` | 금칙어·패턴·연락처 패턴 | `words` 배열 또는 정규식 추가 |

말씀 추천 점수 (`js/verse-match.js`): 태그 주제 일치 +3 (태그마다) / 내용 단어 주제 일치 +2 (최대 3단어) / 감정 일치 +1 / 최근 7일 이 기기에서 추천된 구절 −5 → 최고점 중 랜덤, 맞는 게 없으면 "감사" 주제에서 랜덤.

---

## 10. 보안: anon key 가 공개돼도 괜찮은 이유

`config.js` 의 anon key 는 브라우저에 그대로 노출되지만, Supabase 에서 anon key 는 "공개 키"로 설계되어 있습니다. 실제 권한은 데이터베이스의 **RLS(Row Level Security)** 와 **함수 권한**이 결정합니다.

이 프로젝트의 권한 설계 (`supabase/schema.sql`):
- 모든 테이블 RLS 활성화, 기본 권한 전부 회수(`revoke all`)
- anon 직접 권한: `gratitudes` **insert** 와, `is_hidden = false` 행의 공개 컬럼만 **select** (`gratitudes_public` 뷰).
  `device_id`, `owner_token_hash`, `needs_review` 는 컬럼 권한에서 제외되어 읽을 수 없음
- `strawberries`, `awards`, `admins`, `nicknames` 등은 직접 읽기·쓰기 불가 → `security definer` RPC 로만 접근
- 내 글 삭제·내 딸기 수·수상 코드 조회는 글 작성 시 기기에만 저장되는 **소유 토큰**(해시만 서버 저장)으로 확인
- 관리자 RPC 는 함수 안에서 `is_admin()`(로그인 계정 이메일이 `admins` 에 있는지)을 검사, 아니면 에러
- 같은 기기 1분 내 연속 등록 제한(트리거), 딸기 1분 30회 제한, 글 300자·닉네임 2~10자·감정 허용값 check 제약

> **service_role key 는 절대 프론트엔드에 넣지 마세요.** 그 키는 RLS 를 우회합니다.

---

## 11. Supabase 무료 플랜 일시정지 안내

Supabase 무료 플랜 프로젝트는 **7일 동안 API 요청이 없으면 자동으로 일시정지(paused)** 됩니다. 일시정지되면 앱에서 "인터넷 연결을 확인해주세요" 류의 오류가 나고 데이터가 보이지 않습니다. (데이터는 지워지지 않습니다)

다시 켜는 방법:
1. https://supabase.com/dashboard 로그인
2. 해당 프로젝트 카드에 **Paused** 표시 → 프로젝트 클릭
3. **Restore project** 버튼 클릭 → 1~2분 후 다시 동작

주 1회 이상 누군가 접속하면 멈추지 않습니다. 방학 등 긴 공백이 예상되면 미리 안내해두세요.
(pg_cron 작업은 DB 내부 실행이라 "API 요청"으로 집계되지 않습니다.)

---

## 12. 저장소 구조

```
/
├─ index.html            메인 앱 (홈 / 감사하기 / 모아보기 / 내 기록)
├─ admin.html            관리자 페이지 (링크 없음, 아이디+비밀번호 로그인)
├─ css/style.css         스타일 (맨 위 :root 에 테마 색상)
├─ fonts/                경기천년제목 Medium (woff2, woff)
├─ js/config.js          Supabase 설정, 시상 주기 등 (유일한 설정 파일)
├─ js/app.js             화면 전환, 홈/작성/피드/내 기록, 이미지 저장
├─ js/api.js             Supabase 통신 + 데모 모드
├─ js/nickname.js        닉네임 생성·검사
├─ js/strawberry.js      딸기 반응·준 사람 목록(툴팁/롱프레스 시트)
├─ js/verse-match.js     말씀 추천 점수 계산, 오늘의 말씀/이야기
├─ js/weather.js         Open-Meteo 날씨
├─ js/stats.js           Chart.js 도넛 + wordcloud2 워드클라우드
├─ js/admin.js           관리자 페이지 로직
├─ data/names.js         성씨 70개, 성경 인물 100명+ (한 줄 소개)
├─ data/verse-pool.js    말씀 장절 730개+ (본문 없음)
├─ data/keywords.js      단어→주제 사전 800개+, 위기 단어
├─ data/stories.js       오늘의 감사 이야기 46개
├─ data/prompts.js       작성 도움 질문 30개
├─ data/badwords.js      금칙어·연락처 패턴
├─ supabase/schema.sql   테이블, RLS, RPC, 자동 시상, pg_cron
└─ README.md
```

### 사용자 데이터가 저장되는 곳

- **Supabase**: 감사 노트, 딸기, 신고, 닉네임 선점, 수상 기록
- **이 기기의 localStorage 만**: 내 닉네임·기기 ID, 내가 쓴 글 ID·소유 토큰, 딸기 준 글 ID, 최근 추천 말씀, 테마, 연령대 선택값
  → 기기나 브라우저를 바꾸면 "내 기록"은 보이지 않습니다. (글 자체는 모아보기에 남습니다)

### 라이선스·출처

- 경기천년체: 경기도 (무료 사용, 판매 금지)
- 성경 장절 링크: 대한성서공회 성경읽기 (bskorea.or.kr), 개역개정
- 날씨: Open-Meteo (CC BY 4.0)
