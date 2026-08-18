# 02. 데이터 스키마

모든 시뮬레이션 데이터는 `packages/data/seed/*.json` 에 있고,
`packages/data/src/schemas/index.ts` 의 zod 스키마를 통과해야 엔진에 들어간다.

**이 스키마가 계약(contract) 이다.** 나중에 나라장터 실데이터 파이프라인을 붙여도
소스만 바뀌고 스키마는 그대로다.

```
npm run validate   # 스키마 + 정합성 검증
```

## 데이터 출처에 대한 고지

시드 데이터의 사업명·발주기관·예산은 **2020~2026년 국내 공공 AI·교육 사업의
실제 유형을 참고해 손으로 작성한 큐레이션 데이터**다. 특정 공고의 실제 기록을
그대로 옮긴 것이 아니다. 규모와 요구조건은 현실적인 범위에 맞췄지만,
실제 입찰 판단의 근거로 쓰려면 4차 단계의 실데이터 연동이 필요하다.

기업 고객은 실명 대신 `국내 대형 제조사 A`, `금융지주 B` 같은 익명 표기를 쓴다.
가상의 사업을 실존 기업 이름에 붙이지 않기 위해서다.

## 현재 데이터셋 규모

| 항목 | 수량 | 비고 |
|---|---:|---|
| 사업(deals) | 124건 / 2,589억 | 28개 분기 전체 커버, 분기 평균 4.4건 |
| ├ 공공 | 69건 / 1,582억 | |
| ├ 대기업 | 30건 / 677억 | 벤더 등록 필요 |
| ├ 글로벌 | 8건 / 232억 | 글로벌파트너십 등록 필요 |
| └ 중소 | 17건 / 98억 | |
| 인재(talents) | 20장 | |
| M&A 대상(targets) | 8곳 | 45억 ~ 152억 |
| 제품(products) | 6개 | |
| 회사 프로필 | 2개 | `ontact`(자사형) / `generic`(가상형) |

## 1. 사업 (deals.json)

```jsonc
{
  "id": "PUB-2024Q1-01",
  "period": "2024Q1",                  // 공고가 열리는 분기
  "segment": "public",                 // public | enterprise | global | smb
  "agency": "한국교육학술정보원",       // relations 의 키가 된다
  "title": "AI 디지털교과서 도입 지원 사업",
  "budgetKRW": 8000000000,
  "durationQuarters": 5,               // 매출은 이 기간에 걸쳐 분할 인식
  "domain": ["ai", "edu"],
  "requirements": {
    "mandatoryCerts": ["swBusinessCert", "isms"],   // 없으면 입찰 불가 (컨소시엄 보완 가능)
    "minTrackRecords": {                            // 요구 유사실적
      "domain": "ai", "count": 3, "minAmountKRW": 960000000
    },
    "staffMix": { "principal": 3, "senior": 5, "mid": 8, "junior": 5 },  // 분기당 투입
    "vendorRegistration": "제조사A-벤더"            // 있으면 컨소시엄으로도 보완 불가
  },
  "scoring": { "tech": 90, "price": 10 },           // 합 100
  "techWeights": {                                   // 합 100
    "실적": 25, "인력": 20, "기술능력": 30, "관리방법": 15, "상생": 10
  },
  "competition": { "count": 3, "strength": 0.8 },   // 경쟁사 수, 강도 0~1
  "incumbentAdvantage": 0.15                        // 기존 수행사 프리미엄
}
```

### 파생 규칙 (데이터 작성 시 적용한 규칙)

| 필드 | 규칙 |
|---|---|
| `scoring` | 공공 10억↑ 90:10, 공공 10억↓ 80:20, 대기업 70:30, 글로벌 75:25, 중소 60:40 |
| `staffMix` | 분기 매출의 32%를 직접 인건비로 잡고 등급별 배분 |
| `competition.count` | 5억 미만 5곳, 50억 미만 4곳, 이상 3곳 |
| `competition.strength` | `0.35 + min(0.45, 예산/80억 × 0.45)` |
| `minTrackRecords` | 5억↓ 없음 / 15억↓ 1건·예산20% / 40억↓ 2건·15% / 이상 3건·12% |
| `mandatoryCerts` | 공공은 `swBusinessCert`, 30억↑ `isms` 추가 |

## 2. 인재 (talents.json)

```jsonc
{
  "id": "T-ENT-01",
  "title": "대기업 영업총괄 (전 제조사 A 구매·IT)",
  "availableFrom": "2020Q3",           // 이 분기 이전에는 영입 불가
  "grade": "principal",
  "cost": { "signingKRW": 110000000, "quarterlyKRW": 52000000 },
  "effects": {
    "channel": { "enterprise": 20 },
    "relations": { "국내 대형 제조사 A": 25 },
    "vendorRegistrations": ["제조사A-벤더"],   // 합류 즉시 열린다 (부분 발현 없음)
    "bidWinBonus": 0.03,                       // 입찰 가점 (×100 점)
    "capability": { "ai": 8 },
    "deliveryQuality": 0.05,
    "moraleDelta": 14
  },
  "rampQuarters": 2,                   // 효과 100% 발현까지
  "attritionRisk": 0.10,               // 분기당 기준 이탈 확률
  "cultureFitSensitivity": 0.7         // 사기가 낮을 때 얼마나 잘 나가는가 0~1
}
```

## 3. M&A 대상 (targets.json)

```jsonc
{
  "id": "MNA-SI-01",
  "name": "중견 SI G사",
  "availableFrom": "2024Q4",
  "priceKRW": 15200000000,
  "brings": {
    "annualRevenueKRW": 4900000000,    // 승계 매출 (분기 환산 후 12%/분기 감소)
    "headcount": { "principal": 4, "senior": 12, "mid": 22, "junior": 14 },
    "certs": ["swBusinessCert", "isms", "cmmi"],      // 통합 완료 후 승계
    "trackRecords": [ /* … */ ],                       // 통합 완료 후 승계
    "channel": { "public": 64, "enterprise": 52 },     // max + 중복할인 병합
    "capability": { "si": 72, "cloud": 55 },           // max + 중복할인 병합
    "relations": { "과학기술정보통신부": 46 },
    "vendorRegistrations": ["제조사A-벤더"],           // 즉시 승계
    "products": ["P-LMS"],
    "customers": 18                                    // 교차판매 모수
  },
  "pmi": {
    "integrationQuarters": 4,   // 통합 기간
    "attrition": 0.16,          // 인수 직후 이탈률
    "cultureFit": 0.62,         // 낮을수록 통합 실패 확률↑ (실패확률 = (1−적합도) × 0.5)
    "costRate": 0.16            // 인수대금 대비 통합 비용
  }
}
```

## 4. 제품 (products.json)

```jsonc
{
  "id": "P-AXCOPILOT",
  "name": "업무 AX 코파일럿",
  "domain": ["ai", "cloud"],
  "rndToLaunchKRW": 3000000000,   // 누적 R&D 가 이 금액을 넘으면 출시
  "arpuQuarterlyKRW": 34000000,   // 고객 1곳당 분기 반복매출
  "bidTechBonus": 0.10,           // 관련 도메인 입찰의 기술능력 점수 가점
  "availableFrom": "2024Q1"
}
```

제품은 두 가지로 값을 한다: **반복 매출**과 **입찰 기술점수**.
추가로 출시 제품 수에 따라 수행 품질이 최대 +0.12 오른다.

## 5. 회사 프로필 (companies.json)

시작 조건을 데이터로 분리했다. 자사형(`ontact`)과 가상형(`generic`) 둘 다 지원하며,
새 프로필을 추가하면 그대로 시나리오가 된다.

```jsonc
{
  "id": "ontact",
  "name": "온택트스쿨 (자사형 프로필)",
  "startPeriod": "2020Q1",
  "cashKRW": 2000000000,
  "staff": { "principal": 1, "senior": 3, "mid": 7, "junior": 5 },
  "capability": { "ai": 52, "data": 44, "si": 38, "edu": 70, "cloud": 32 },
  "channel": { "public": 45, "enterprise": 18, "global": 8, "smb": 36 },
  "certs": ["swBusinessCert"],
  "relations": { "한국교육학술정보원": 38, "…": 0 },
  "vendorRegistrations": [],
  "trackRecords": [ /* 시작 시점 보유 실적 */ ],
  "initialProjects": [ /* 이미 수행 중인 사업 — 회사는 진공에서 시작하지 않는다 */ ],
  "brand": 40, "morale": 66, "techDebt": 25
}
```

## 6. 밸런싱 계수 (config.json)

| 키 | 값 | 의미 |
|---|---:|---|
| `totalTurns` | 28 | 시뮬레이션 분기 수 |
| `quarterlyCostByGrade` | 4200/3000/2100/1400만 | 등급별 분기 인건비 |
| `recruitCostByGrade` | 6000/3500/2000/1000만 | 등급별 1인 채용 비용 |
| `fixedOverheadKRW` | 1.1억 | 분기 고정 간접비 |
| `overheadRate` | 0.22 | 인건비 대비 간접비 배수 |
| `proposalCostRate` | 0.018 | 제안 비용 (예산 대비) |
| `directCostRate` | 0.08 | 사업 직접 원가율 |
| `maxDiscountRate` | 0.20 | 최대 할인율 |
| `bankruptcyCashKRW` | −10억 | 파산 기준 현금 |
| `bankruptcyQuarters` | 3 | 연속 몇 분기면 파산인가 |
| `certCostKRW` | 자격별 | 취득 비용 |
| `certLeadQuarters` | 2 | 자격 취득 소요 분기 |

## 7. 정합성 검증

`npm run validate` 는 스키마 외에 다음을 확인한다.

- ID 중복
- 모든 사업이 시뮬레이션 기간 안에 있는가
- **공고가 하나도 없는 분기가 있는가** (있으면 플레이가 멈춘다)
- **딜이 요구하는 벤더 등록을 획득할 경로가 있는가** — 인재·인수·프로필 중 어디에도
  없으면 그 사업은 영원히 입찰 불가능한 죽은 데이터다
- 인수 대상이 들고 오는 제품이 제품 목록에 실재하는가
- 필수 자격의 취득 비용이 config 에 정의되어 있는가

## 8. 실데이터 전환 계획 (4차)

나라장터/조달청 공공데이터 API 의 낙찰·공고 정보를 이 스키마로 매핑한다.

| 스키마 필드 | 실데이터 소스 |
|---|---|
| `agency`, `title`, `budgetKRW` | 입찰공고 기본정보 |
| `durationQuarters` | 계약기간 |
| `requirements.mandatoryCerts` | 참가자격 항목 파싱 |
| `requirements.minTrackRecords` | 제안요청서 유사실적 요건 파싱 |
| `techWeights`, `scoring` | 제안서 평가기준표 |
| `competition` | 과거 동종 사업의 입찰 참가업체 수 통계 |

`domain` 분류와 `staffMix` 는 자동 추출이 어려우므로 분류 모델 또는 규칙 기반
보정이 필요하다. 이 부분은 실데이터 단계에서 별도 설계한다.
