# 03. 아키텍처 — 모바일·웹 연동과 확장

## 설계의 출발점

요구사항은 "모바일 기반 게임인데 웹에서도 연동되고, 웹 와이드스크린에서 다시 볼 수
있고, DB 가 계속 쌓여 큰 솔루션이 되는 것"이었다.

이걸 만족시키는 방법은 하나다. **엔진을 순수 함수로 만들고, 상태가 아니라 결정을
저장하는 것.** 그러면 세 가지가 동시에 따라온다.

1. 모바일이 오프라인에서 혼자 굴러간다 (엔진이 클라이언트에 있으므로)
2. 웹이 같은 로그를 재생해 똑같은 화면을 그린다 (같은 엔진, 같은 시드)
3. 쌓인 결정 로그가 그 자체로 학습 데이터가 된다 (나중에 전략 추천 모델의 원료)

## 1. 현재 구조 (1차 완료분)

```
axmgmtsim/
├─ packages/engine/          순수 TypeScript. I/O 없음. Math.random() 없음
│  ├─ types.ts               상태·결정·이벤트 타입 (단일 진실 원천)
│  ├─ rng.ts                 mulberry32 시드 PRNG
│  ├─ period.ts              분기 문자열 유틸
│  ├─ capacity.ts            인력 수급 (fit 과 delivery 가 공유)
│  ├─ fit.ts                 적합도 계산
│  ├─ bidding.ts             승률 판정
│  ├─ delivery.ts            수행·품질·실적 축적
│  ├─ finance.ts             손익·현금흐름·파산
│  ├─ talent.ts              영입·ramp·이탈
│  ├─ mna.ts                 인수·시너지·PMI
│  ├─ market.ts              분기별 시장 조회
│  ├─ state.ts               프로필 → 초기 상태
│  ├─ reduce.ts              advanceTurn() ← 핵심 리듀서
│  ├─ replay.ts              이벤트 로그 재생 + 체크섬
│  ├─ strategies.ts          전략 봇 프리셋
│  └─ counterfactual.ts      반사실 분석 + 몬테카를로
├─ packages/data/            시드 데이터 + zod 스키마 + 검증
└─ apps/cli/                 play / auto / compare / list / validate
```

`apps/web`, `apps/mobile` 은 2차 이후다. 아래 계약만 지키면 엔진을 그대로 붙일 수 있다.

## 2. 엔진의 계약

```ts
advanceTurn(
  prev: CompanyState,
  decisions: Decision[],
  options: { dataset: Dataset; index?: DatasetIndex },
  rng: Rng,
): TurnResult
```

지켜야 하는 성질 (테스트로 강제한다):

- **순수하다** — `prev` 를 변형하지 않는다
- **결정론적이다** — 같은 `(prev, decisions, rng 시드)` 면 항상 같은 결과
- **난수는 주입만 받는다** — 엔진 어디에도 `Math.random()` 이 없다
- **I/O 가 없다** — 파일·네트워크·시계를 건드리지 않는다

난수는 `(시드, 턴 번호)` 에서 파생된다.

```ts
rngForTurn(seed, turn) = createRng(hashSeed(`turn:${turn}`, seed))
```

턴별로 독립적이므로 **임의의 턴에서 갈라져 나가도 그 이후 난수열이 원본과 동일하게
재현된다.** 반사실 분석이 성립하는 이유가 이것이다.

## 3. 이벤트 소싱 — 모바일 ↔ 웹 연동

### 저장하는 것

```ts
Run       { runId, seed, profileId, engineVersion, createdAt }
TurnEvent { runId, turn, decisions: Decision[], stateChecksum }
```

**상태 전체가 아니라 결정만 append 한다.** 한 판 28턴의 로그는 수 KB 수준이다.

### 흐름

```
[모바일]  엔진 로컬 실행 → 턴마다 decisions + checksum 전송 (오프라인이면 큐잉)
   │
   ▼
[서버]    같은 engineVersion 으로 replay() → 상태 재구성 → checksum 대조
   │      불일치 = 클라이언트 변조 또는 버전 불일치
   ▼
[DB]      Run / TurnEvent 누적
   │
   ▼
[웹]      같은 로그를 재생해 와이드스크린 심층 화면 렌더
          (타임라인, 딜 파이프라인, 적합도 분해, 반사실 비교)
```

`replay.ts` 의 `checksum()` 은 부동소수 오차에 흔들리지 않도록 주요 지표를
반올림해 해싱한다 (현금은 백만원 단위, 역량·채널은 소수점 첫째 자리).

### 버전 관리

`ENGINE_VERSION` 이 바뀌면 기존 로그의 재생 결과가 달라질 수 있다.
`Run` 에 엔진 버전을 박아 두고, 재생 시 버전이 다르면 재검증 대신
**저장된 최종 상태 스냅샷으로 대체**하는 것이 2차 구현 시 처리 방침이다.

## 4. DB 스키마 (2차 구현 예정)

Postgres 기준.

```sql
create table runs (
  run_id          uuid primary key,
  user_id         uuid not null,
  seed            bigint not null,
  profile_id      text not null,
  dataset_version text not null,
  engine_version  text not null,
  status          text not null,        -- playing | finished | bankrupt
  created_at      timestamptz not null default now()
);

create table turn_events (
  run_id          uuid not null references runs(run_id),
  turn            int  not null,
  decisions       jsonb not null,
  state_checksum  text not null,
  client_ts       timestamptz,
  created_at      timestamptz not null default now(),
  primary key (run_id, turn)
);

-- 분석·리더보드용 비정규화 테이블 (재생으로 언제든 재구축 가능)
create table turn_snapshots (
  run_id   uuid not null references runs(run_id),
  turn     int  not null,
  period   text not null,
  revenue_krw   bigint, cash_krw bigint, backlog_krw bigint,
  headcount     int,    track_records int,
  utilization   numeric,
  primary key (run_id, turn)
);
```

`turn_snapshots` 는 캐시다. 원본은 언제나 `turn_events` 이고, 스키마가 바뀌면
재생해서 다시 만들면 된다.

## 5. 클라이언트 분담

| | 모바일 (Expo / React Native) | 웹 (Next.js) |
|---|---|---|
| 역할 | 플레이 — 한 턴씩 결정 | 분석 — 한 판 전체를 조망 |
| 화면 | 딜 카드 스와이프, 적합도 요약, 인재/인수 카드 | 타임라인, 딜 파이프라인, 적합도 분해, 반사실 비교, 전략 배치 |
| 엔진 | 로컬 실행 (오프라인 가능) | 로컬 실행 (재생·반사실 롤아웃) |
| 네트워크 | decisions 업로드 | 로그 조회 |

두 클라이언트가 **같은 `@axsim/engine` 패키지를 import** 한다. 규칙이 갈라질 여지가 없다.

## 6. 확장 경로

```
2차  Next.js 웹 대시보드 + Postgres + 동기화 API
     └ 반사실 비교 화면이 핵심. 이미 counterfactual.ts 가 계산을 다 한다

3차  Expo 모바일 클라이언트, 오프라인 큐잉과 동기화

4차  나라장터/조달청 API 파이프라인 → seed 데이터 교체 (스키마는 그대로)
     축적된 결정 로그 기반 전략 추천 — "당신과 비슷한 상황에서 이 선택을 한 회사들은…"

5차  멀티 시나리오 / 조직 단위 워크숍 모드 (같은 시드로 여러 팀이 경쟁)
```

## 7. 왜 이렇게 했는가 — 대안과 비교

| 대안 | 문제 |
|---|---|
| 서버에서만 엔진 실행 | 오프라인 플레이 불가, 턴마다 왕복 지연 |
| 상태 전체를 저장 | 용량이 크고, 반사실 분석을 하려면 결국 결정이 필요하다 |
| 엔진을 각 클라이언트에서 재구현 | 규칙이 갈라진다. 모바일과 웹의 결과가 달라지는 순간 신뢰가 무너진다 |
| Flutter 앱 + 별도 웹 | 엔진을 Dart 로 다시 쓰거나 서버 실행. 코드 재사용률이 낮다 |

TypeScript 모노레포 + 순수 엔진 + 이벤트 소싱 조합이 네 가지 요구
(모바일 플레이 · 웹 분석 · 오프라인 · DB 축적)를 동시에 만족시키는 가장 단순한 답이다.
