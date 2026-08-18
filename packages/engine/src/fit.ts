/**
 * 적합도(fit) 계산 — 이 게임의 심장.
 *
 * 실제 공공 제안 평가표(실적/인력/기술능력/관리방법/상생 배점)를 본떠 항목별 0~1
 * 점수를 내고 배점으로 가중 합산한다. 세부 점수를 전부 반환하는 이유는 플레이어에게
 * "왜 떨어졌는지"를 그대로 보여주기 위해서다.
 */

import { availableStaff, fillStaff } from './capacity.ts';
import {
  TECH_CRITERIA,
  type CompanyState,
  type Deal,
  type FitResult,
  type Product,
  type TechCriterion,
  type Segment,
} from './types.ts';

/** 컨소시엄으로 넘기는 계약 지분. 자격은 빌리지만 매출은 나눈다. */
export const CONSORTIUM_SHARE = 0.3;

/** 세그먼트별 관계자본의 중요도. 공공·대기업은 관계가 크게 작동한다. */
const RELATION_WEIGHT: Record<Segment, number> = {
  public: 12,
  enterprise: 15,
  global: 7,
  smb: 6,
};

/** 세그먼트별 영업 채널 강도의 기여도 */
const CHANNEL_WEIGHT: Record<Segment, number> = {
  public: 8,
  enterprise: 10,
  global: 12,
  smb: 6,
};

export interface FitOptions {
  consortium: boolean;
  /** 영입 인재들이 제공하는 입찰 가점 합계 (0~1 스케일) */
  bidWinBonus?: number;
  /** 출시된 제품 목록 (기술능력 가점 계산용) */
  launchedProducts?: Product[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 필수 자격·벤더 등록 게이트. 통과하지 못하면 입찰 자체가 불가능하다. */
export function checkGate(
  state: CompanyState,
  deal: Deal,
  consortium: boolean,
): { gate: boolean; reason?: string } {
  const missingCerts = deal.requirements.mandatoryCerts.filter((c) => !state.certs.includes(c));
  if (missingCerts.length > 0 && !consortium) {
    return { gate: false, reason: `필수 자격 미보유: ${missingCerts.join(', ')} (컨소시엄으로 보완 가능)` };
  }

  // 벤더 등록은 회사 고유 자격이라 컨소시엄으로 대체할 수 없다.
  // 대기업·글로벌 진출이 인재 영입이나 M&A 로만 열리는 이유가 여기에 있다.
  const vendor = deal.requirements.vendorRegistration;
  if (vendor && !state.vendorRegistrations.includes(vendor)) {
    return { gate: false, reason: `벤더 등록 필요: ${vendor} (영입 또는 인수로만 획득 가능)` };
  }

  return { gate: true };
}

/** 실적 점수: 유사 실적 건수와 품질. 상한을 1.2 로 둬 초과 실적에도 약간의 보상을 준다. */
function scoreTrackRecord(state: CompanyState, deal: Deal): number {
  const req = deal.requirements.minTrackRecords;
  if (!req) return 0.8; // 실적 요구가 없어도 무실적 업체보다는 낫다는 정도로만 반영

  const relevant = state.trackRecords.filter(
    (tr) => tr.domain === req.domain && tr.amountKRW >= req.minAmountKRW,
  );
  if (relevant.length === 0) return 0;

  const countRatio = clamp(relevant.length / Math.max(1, req.count), 0, 1.2);
  const avgQuality = relevant.reduce((s, tr) => s + tr.quality, 0) / relevant.length;
  // 품질이 나쁜 실적은 건수는 채워도 점수가 덜 나온다.
  return clamp(countRatio * (0.7 + 0.3 * avgQuality), 0, 1.2);
}

/** 인력 점수: 여유 인력으로 요구 투입인력을 채울 수 있는가 */
function scoreStaff(state: CompanyState, deal: Deal, consortium: boolean): number {
  const fill = fillStaff(availableStaff(state), deal.requirements.staffMix);
  if (!consortium) return clamp(fill.ratio, 0, 1);
  // 컨소시엄은 부족분을 파트너가 메우지만 자사 수행 비중이 낮아 만점은 못 받는다.
  return clamp(Math.max(fill.ratio, 0.85), 0, 0.95);
}

/** 기술능력 점수: 도메인 역량 평균 + 보유 제품 가점 */
function scoreCapability(state: CompanyState, deal: Deal, products: Product[]): number {
  const domains = deal.domain.length > 0 ? deal.domain : (['si'] as const);
  const avg = domains.reduce((s, d) => s + state.capability[d], 0) / domains.length / 100;

  const productBonus = products
    .filter((p) => p.domain.some((d) => deal.domain.includes(d)))
    .reduce((s, p) => s + p.bidTechBonus, 0);

  return clamp(avg + productBonus, 0, 1);
}

/** 관리방법 점수: 브랜드·사기는 올리고 기술부채는 깎는다 */
function scoreManagement(state: CompanyState): number {
  const base = 0.45 + state.brand / 250 + state.morale / 400 - state.techDebt / 200;
  return clamp(base, 0, 1);
}

/** 상생 점수: 컨소시엄 구성이 실제 평가에서 가점 요소인 것을 반영 */
function scorePartnership(state: CompanyState, consortium: boolean): number {
  return clamp((consortium ? 0.9 : 0.5) + state.brand / 500, 0, 1);
}

export function computeFit(
  state: CompanyState,
  deal: Deal,
  options: FitOptions,
): FitResult {
  const { consortium } = options;
  const gate = checkGate(state, deal, consortium);

  const breakdown: Record<TechCriterion, number> = {
    실적: scoreTrackRecord(state, deal),
    인력: scoreStaff(state, deal, consortium),
    기술능력: scoreCapability(state, deal, options.launchedProducts ?? []),
    관리방법: scoreManagement(state),
    상생: scorePartnership(state, consortium),
  };

  // 기존 수행사 프리미엄: 같은 발주기관 + 같은 도메인 실적이 있으면 가산
  const isIncumbent = state.trackRecords.some(
    (tr) => tr.agency === deal.agency && deal.domain.includes(tr.domain),
  );
  if (isIncumbent) {
    breakdown.실적 = clamp(breakdown.실적 + deal.incumbentAdvantage, 0, 1.3);
  }

  const techScore = TECH_CRITERIA.reduce(
    (sum, c) => sum + deal.techWeights[c] * breakdown[c],
    0,
  );

  const relation = state.relations[deal.agency] ?? 0;
  const relationBonus =
    (relation / 100) * RELATION_WEIGHT[deal.segment] +
    (state.channel[deal.segment] / 100) * CHANNEL_WEIGHT[deal.segment];

  const hireBonus = (options.bidWinBonus ?? 0) * 100;

  return {
    dealId: deal.id,
    gate: gate.gate,
    gateReason: gate.reason,
    breakdown,
    techScore,
    relationBonus,
    fitScore: clamp(techScore + relationBonus + hireBonus, 0, 100),
  };
}
