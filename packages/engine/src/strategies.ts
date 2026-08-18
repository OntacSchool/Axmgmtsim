/**
 * 전략 프리셋 — 밸런싱 검증과 반사실 비교의 대조군.
 *
 * "지배 전략이 없어야 게임이 성립한다"는 밸런싱 기준을 확인하려면 사람 대신
 * 일관되게 플레이하는 봇이 필요하다. 여기 정의된 전략들이 그 역할을 한다.
 */

import { availableStaff, fillStaff, weightedStaff } from './capacity.ts';
import { GRADES } from './types.ts';
import { computeFit } from './fit.ts';
import { canAcquire, financingSplit } from './mna.ts';
import { dealsInPeriod, targetsAvailable, talentsAvailable, type DatasetIndex } from './market.ts';
import type { Rng } from './rng.ts';
import {
  type AcquisitionTarget,
  type CompanyState,
  type Dataset,
  type Deal,
  type Decision,
  type Domain,
  type Grade,
  type Product,
  type Segment,
} from './types.ts';

export interface StrategyContext {
  state: CompanyState;
  dataset: Dataset;
  index: DatasetIndex;
  rng: Rng;
}

export type Strategy = (ctx: StrategyContext) => Decision[];

export interface StrategyParams {
  name: string;
  /** 선호 세그먼트. 앞쪽일수록 우선. */
  segments: Segment[];
  /** 이 점수 미만이면 입찰하지 않는다 (0~100) */
  fitThreshold: number;
  maxBidsPerTurn: number;
  /** 기본 할인율 */
  discount: number;
  /** 이 금액 아래로는 현금을 쓰지 않는다 */
  cashReserveKRW: number;
  /** 분기 여유현금 중 투자에 돌리는 비율 */
  investRate: number;
  /** 인수를 적극적으로 노리는가 */
  seekAcquisition: boolean;
  /**
   * 감당할 부채상환 비율 — 분기 원리금 상환액이 분기 매출의 몇 %까지 괜찮은가.
   * 이 한 줄이 "좋은 인수"와 "무리한 인수"를 가른다.
   */
  maxDebtServiceRatio: number;
  /** 제품 R&D 에 집중하는가 */
  focusProduct: boolean;
  /** 역량 투자 대상 도메인 */
  trainDomain: Domain;
}

const CERT_PRIORITY = ['swBusinessCert', 'isms', 'gsCert', 'cmmi', 'iso27001'] as const;

/** 여유현금 — 투자·영입·인수에 써도 된다고 보는 값 */
function spendable(state: CompanyState, params: StrategyParams): number {
  return Math.max(0, state.cashKRW - params.cashReserveKRW);
}

/**
 * 입찰 예산은 투자 예산과 분리한다.
 * 제안비를 아끼려고 입찰을 멈추면 매출 파이프라인이 끊겨 그대로 죽는다 —
 * 현금이 마른 회사도 제안서는 쓴다는 현실을 반영해 최소 예산을 보장한다.
 */
function bidBudget(state: CompanyState): number {
  return Math.max(state.cashKRW * 0.35, 200_000_000);
}

/**
 * 세그먼트별 할인 폭.
 * 공공 협상계약은 가격 배점이 10점뿐이라 12% 를 깎아도 0.8점밖에 못 얻는다 —
 * 매출을 12% 버리는 최악의 거래다. 가격 배점에 비례해서만 깎는다.
 */
function discountFor(deal: Deal, params: StrategyParams, maxDiscountRate: number): number {
  const scaled = params.discount * (deal.scoring.price / 30);
  return Math.min(maxDiscountRate, Math.max(0.01, scaled));
}

/**
 * 입찰 후보 선정.
 * 인력 풀을 차감해가며 고르므로 무한 수주를 막지만, 과부하 여지는 남겨둔다.
 */
function chooseBids(ctx: StrategyContext, params: StrategyParams): Decision[] {
  const { state, dataset, index } = ctx;
  const deals = dealsInPeriod(dataset, state.period);
  if (deals.length === 0) return [];

  const launchedProducts: Product[] = state.products
    .filter((p) => p.launched)
    .map((p) => index.products.get(p.productId))
    .filter((p): p is Product => Boolean(p));

  const pool = availableStaff(state);
  const decisions: Decision[] = [];
  let budget = bidBudget(state);

  // 선호 세그먼트를 앞세우고, 그 안에서는 적합도 순
  const scored = deals
    .map((deal) => {
      const plain = computeFit(state, deal, { consortium: false, launchedProducts });
      // 자격이 모자라면 컨소시엄으로 보완 가능한지 본다 (벤더 등록은 보완 불가).
      const useConsortium = !plain.gate && !deal.requirements.vendorRegistration;
      const fit = useConsortium
        ? computeFit(state, deal, { consortium: true, launchedProducts })
        : plain;
      const prefRank = params.segments.indexOf(deal.segment);
      return { deal, fit, consortium: useConsortium, prefRank: prefRank < 0 ? 99 : prefRank };
    })
    .filter((c) => c.fit.gate)
    .sort((a, b) => (a.prefRank - b.prefRank) || (b.fit.fitScore - a.fit.fitScore));

  // 조직이 커지면 제안팀도 늘어난다 — 동시 제안 가능 건수를 인원에 연동한다.
  const headcount = GRADES.reduce((sum, g) => sum + state.staff[g], 0);
  const maxBids = params.maxBidsPerTurn + Math.floor(headcount / 20);

  for (const cand of scored) {
    if (decisions.length >= maxBids) break;

    // 선호 세그먼트 밖이면 더 높은 기준을 요구한다.
    const threshold = cand.prefRank === 99 ? params.fitThreshold + 8 : params.fitThreshold;
    if (cand.fit.fitScore < threshold) continue;

    const proposalCost = cand.deal.budgetKRW * dataset.config.proposalCostRate;
    if (proposalCost > budget) continue;

    // 인력이 절반도 안 되면 포기 (컨소시엄이면 완화)
    const fill = fillStaff(pool, cand.deal.requirements.staffMix);
    if (fill.ratio < (cand.consortium ? 0.35 : 0.55)) continue;

    for (const [grade, need] of Object.entries(cand.deal.requirements.staffMix)) {
      const g = grade as Grade;
      pool[g] = Math.max(0, pool[g] - (need ?? 0));
    }
    budget -= proposalCost;
    decisions.push({
      type: 'bid',
      dealId: cand.deal.id,
      discountRate: discountFor(cand.deal, params, dataset.config.maxDiscountRate),
      consortium: cand.consortium,
    });
  }

  return decisions;
}

/** 자격 취득 — 공공 진입의 관문이므로 우선순위가 높다. */
function chooseCert(ctx: StrategyContext, params: StrategyParams): Decision[] {
  const { state, dataset } = ctx;
  for (const cert of CERT_PRIORITY) {
    if (state.certs.includes(cert)) continue;
    if (state.pendingCerts.some((p) => p.cert === cert)) continue;
    const cost = dataset.config.certCostKRW[cert];
    if (cost > spendable(state, params)) continue;
    // 이 자격을 요구하는 사업이 앞으로 실제로 있는지 확인
    const needed = dataset.deals.some(
      (d) => d.requirements.mandatoryCerts.includes(cert) && params.segments.includes(d.segment),
    );
    if (!needed) continue;
    return [{ type: 'invest', target: 'cert', amountKRW: 0, cert }];
  }
  return [];
}

/** 인재 영입 — 선호 세그먼트의 채널을 열어주는 사람을 우선한다. */
function chooseHire(ctx: StrategyContext, params: StrategyParams): Decision[] {
  const { state, dataset } = ctx;
  const already = new Set(state.hires.filter((h) => h.active).map((h) => h.talentId));
  const budget = spendable(state, params);

  const candidates = talentsAvailable(dataset, state.period)
    .filter((t) => !already.has(t.id))
    .filter((t) => t.cost.signingKRW <= budget * 0.5)
    .map((t) => {
      // 선호 세그먼트 채널을 열어주면 가치가 크고, 벤더 등록은 특히 크다.
      const channelValue = params.segments.reduce(
        (s, seg, i) => s + (t.effects.channel?.[seg] ?? 0) / (i + 1),
        0,
      );
      const vendorValue = (t.effects.vendorRegistrations?.length ?? 0) * 25;
      const bidValue = (t.effects.bidWinBonus ?? 0) * 200;
      return { talent: t, value: channelValue + vendorValue + bidValue };
    })
    .filter((c) => c.value > 8)
    .sort((a, b) => b.value - a.value);

  const best = candidates[0];
  return best ? [{ type: 'hire', talentId: best.talent.id }] : [];
}

const FINANCING_ORDER: ('cash' | 'mixed' | 'debt')[] = ['cash', 'mixed', 'debt'];

/** 분기 원리금 상환 부담률 (이자 2.2% + 원금 6%) */
const QUARTERLY_DEBT_SERVICE_RATE = 0.082;

/** 최근 4분기 평균 분기 매출 */
function recentQuarterlyRevenue(state: CompanyState): number {
  const recent = state.history.slice(-4);
  if (recent.length === 0) return 0;
  return recent.reduce((sum, h) => sum + h.revenueKRW, 0) / recent.length;
}

/** 현금을 최대한 아끼면서, 상환 부담을 감당할 수 있는 조달 방식을 고른다. */
function pickFinancing(
  state: CompanyState,
  target: AcquisitionTarget,
  params: StrategyParams,
): 'cash' | 'mixed' | 'debt' | null {
  const revenue = recentQuarterlyRevenue(state);
  for (const financing of FINANCING_ORDER) {
    const split = financingSplit(target, financing);
    // 현금 조달분은 여유현금 안에서만 쓴다 (운영자금까지 태우지 않는다)
    if (split.cashKRW > spendable(state, params)) continue;

    // 인수 후 분기 원리금이 매출 대비 감당 가능한 수준인가
    const service = (state.debtKRW + split.debtKRW) * QUARTERLY_DEBT_SERVICE_RATE;
    if (revenue <= 0 || service > revenue * params.maxDebtServiceRatio) continue;

    if (canAcquire(state, target, financing).ok) return financing;
  }
  return null;
}

function chooseAcquisition(ctx: StrategyContext, params: StrategyParams): Decision[] {
  if (!params.seekAcquisition) return [];
  const { state, dataset } = ctx;
  const owned = new Set(state.acquisitions.map((a) => a.targetId));

  const affordable = targetsAvailable(dataset, state.period)
    .filter((t) => !owned.has(t.id))
    .map((t) => ({ t, financing: pickFinancing(state, t, params) }))
    .filter((c): c is { t: typeof c.t; financing: 'cash' | 'mixed' | 'debt' } => c.financing !== null)
    .map(({ t, financing }) => {
      // 내가 약한 채널을 채워주는 대상일수록 값어치가 크다
      const channelGain = params.segments.reduce(
        (s, seg) => s + Math.max(0, (t.brings.channel[seg] ?? 0) - state.channel[seg]),
        0,
      );
      const certGain = t.brings.certs.filter((c) => !state.certs.includes(c)).length * 15;
      const recordGain = t.brings.trackRecords.length * 6;
      const vendorGain = (t.brings.vendorRegistrations ?? []).filter(
        (v) => !state.vendorRegistrations.includes(v),
      ).length * 30;
      // 가격 대비 가치로 줄을 세운다. 좋은 회사가 아니라 '싸게 사는 좋은 회사'를 고른다.
      const value = channelGain + certGain + recordGain + vendorGain;
      return { target: t, financing, value, efficiency: value / (t.priceKRW / 1e10) };
    })
    .filter((c) => c.value > 20)
    .sort((a, b) => b.efficiency - a.efficiency);

  const best = affordable[0];
  return best ? [{ type: 'acquire', targetId: best.target.id, financing: best.financing }] : [];
}

/**
 * 역량 투자 대상 선택.
 *
 * 고정 도메인에 붓는 것보다, 앞으로 열릴 공고에서 실제로 요구되는 도메인 중
 * 우리가 약한 곳을 채우는 편이 언제나 낫다. 시장 수요 × 역량 격차로 고른다.
 */
function pickTrainDomain(ctx: StrategyContext, params: StrategyParams): Domain {
  const { state, dataset } = ctx;
  const demand = new Map<Domain, number>();

  for (const deal of dataset.deals) {
    if (deal.period < state.period) continue;
    if (!params.segments.includes(deal.segment)) continue;
    for (const d of deal.domain) {
      demand.set(d, (demand.get(d) ?? 0) + deal.budgetKRW);
    }
  }
  if (demand.size === 0) return params.trainDomain;

  let best: Domain = params.trainDomain;
  let bestScore = -Infinity;
  for (const [domain, budget] of demand) {
    // 이미 잘하는 도메인에 더 붓는 것보다 부족한 쪽을 채우는 값이 크다.
    const gap = (100 - state.capability[domain]) / 100;
    const score = budget * gap * (domain === params.trainDomain ? 1.15 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = domain;
    }
  }
  return best;
}

function chooseInvestments(ctx: StrategyContext, params: StrategyParams): Decision[] {
  const { state, dataset } = ctx;
  const budget = spendable(state, params) * params.investRate;
  if (budget <= 0) return [];

  const decisions: Decision[] = [];

  // 제품 R&D 의 함정: 절반만 넣고 멈추면 그 돈은 통째로 사장된다.
  // 그래서 (1) 이미 시작한 제품은 현금이 빠듯해도 끝까지 밀고,
  //        (2) 새 제품은 여유가 확실할 때만 시작한다.
  if (params.focusProduct) {
    const pending = dataset.products
      .filter((p) => p.availableFrom <= state.period)
      .map((p) => ({ product: p, ps: state.products.find((s) => s.productId === p.id) }))
      .filter((c) => !c.ps?.launched)
      .map((c) => ({ ...c, remaining: c.product.rndToLaunchKRW - (c.ps?.rndInvestedKRW ?? 0) }));

    const inProgress = pending
      .filter((c) => (c.ps?.rndInvestedKRW ?? 0) > 0)
      .sort((a, b) => a.remaining - b.remaining)[0];

    const target =
      inProgress ??
      (state.cashKRW > params.cashReserveKRW * 3
        ? pending.sort((a, b) => a.remaining - b.remaining)[0]
        : undefined);

    if (target) {
      // 진행 중인 제품은 여유현금의 60%까지, 새로 시작하는 제품은 50%까지.
      const share = inProgress ? 0.6 : 0.5;
      const commit = Math.min(target.remaining, spendable(state, params) * share);
      if (commit > 0) decisions.push({ type: 'rnd', productId: target.product.id, amountKRW: commit });
    }
  }

  const primary = params.segments[0] ?? 'public';
  decisions.push({ type: 'invest', target: 'sales', amountKRW: budget * 0.25, segment: primary });
  decisions.push({ type: 'invest', target: 'training', amountKRW: budget * 0.15, domain: pickTrainDomain(ctx, params) });

  return decisions;
}

/**
 * 조직 규모 조정.
 *
 * 인력은 곧 수행 능력이고, 수행 능력이 곧 입찰 가능 규모다. 채용을 게을리하면
 * 아무리 좋은 공고가 떠도 인력 배점에서 깎이고 동시 수행도 못 한다. 인수만이
 * 규모를 키우는 유일한 길이 되지 않도록 유기적 성장 경로를 명시적으로 둔다.
 */
function chooseStaffing(ctx: StrategyContext, params: StrategyParams): Decision[] {
  const { state, dataset } = ctx;
  const capacity = weightedStaff(state.staff);
  if (capacity <= 0) return [];

  const committed = state.projects.reduce((s, p) => s + weightedStaff(p.staffMix), 0);
  const util = committed / capacity;
  const headcount = GRADES.reduce((sum, g) => sum + state.staff[g], 0);

  if (util <= 0.75) return [];

  // 조직의 10~15% 규모로 증원하되, 채용비 + 4분기 인건비를 감당할 수 있을 때만.
  const batch = Math.max(2, Math.round(headcount * 0.15));
  const mid = Math.max(1, Math.round(batch * 0.6));
  const junior = Math.max(1, batch - mid);
  const recruitCost =
    dataset.config.recruitCostByGrade.mid * mid + dataset.config.recruitCostByGrade.junior * junior;
  const payrollCost =
    (dataset.config.quarterlyCostByGrade.mid * mid + dataset.config.quarterlyCostByGrade.junior * junior) * 4;

  if (recruitCost + payrollCost > spendable(state, params)) return [];

  return [
    { type: 'recruit', grade: 'mid', count: mid },
    { type: 'recruit', grade: 'junior', count: junior },
  ];
}

export function makeStrategy(params: StrategyParams): Strategy {
  return (ctx) => {
    const decisions: Decision[] = [
      ...chooseAcquisition(ctx, params),
      ...chooseHire(ctx, params),
      ...chooseCert(ctx, params),
      ...chooseStaffing(ctx, params),
      ...chooseInvestments(ctx, params),
      ...chooseBids(ctx, params),
    ];
    return decisions.length > 0 ? decisions : [{ type: 'pass' }];
  };
}

const BASE: Omit<StrategyParams, 'name' | 'segments'> = {
  fitThreshold: 50,
  maxBidsPerTurn: 4,
  discount: 0.08,
  cashReserveKRW: 500_000_000,
  investRate: 0.3,
  seekAcquisition: false,
  maxDebtServiceRatio: 0.25,
  focusProduct: false,
  trainDomain: 'ai',
};

export const STRATEGY_PRESETS: Record<string, StrategyParams> = {
  'public-focus': {
    ...BASE,
    name: '공공 집중',
    segments: ['public'],
    fitThreshold: 48,
    maxBidsPerTurn: 4,
    discount: 0.12,
    trainDomain: 'edu',
  },
  'enterprise-focus': {
    ...BASE,
    name: '대기업 집중',
    // 대기업·SMB 시장만으로는 조직을 먹여 살릴 수 없다. 공공을 후순위로 깔아
    // 현금흐름을 유지하면서 대기업 채널을 여는 것이 현실적인 형태다.
    segments: ['enterprise', 'smb', 'public'],
    fitThreshold: 50,
    discount: 0.06,
    trainDomain: 'ai',
  },
  'mna-first': {
    ...BASE,
    name: 'M&A 우선',
    segments: ['public', 'enterprise'],
    seekAcquisition: true,
    // 공격적으로 레버리지를 쓴다 — 그만큼 파산 확률도 높다.
    maxDebtServiceRatio: 0.45,
    cashReserveKRW: 300_000_000,
    investRate: 0.2,
    trainDomain: 'si',
  },
  'product-rnd': {
    ...BASE,
    name: '제품 R&D',
    // 제품의 기술 가점은 세그먼트를 가리지 않는다. 돈은 공공에 있으므로 공공을 먼저 노리고,
    // 거기서 번 현금으로 제품을 출시해 다시 기술점수를 끌어올리는 순환을 노린다.
    segments: ['public', 'smb', 'enterprise'],
    focusProduct: true,
    investRate: 0.35,
    fitThreshold: 52,
    maxBidsPerTurn: 3,
    trainDomain: 'ai',
  },
  balanced: {
    ...BASE,
    name: '균형',
    segments: ['public', 'enterprise', 'smb', 'global'],
    seekAcquisition: true,
    // 감당 가능한 인수만 한다.
    maxDebtServiceRatio: 0.2,
    focusProduct: true,
    investRate: 0.35,
    trainDomain: 'ai',
  },
};

export function getStrategy(key: string): Strategy {
  const params = STRATEGY_PRESETS[key];
  if (!params) throw new Error(`알 수 없는 전략: ${key} (가능: ${Object.keys(STRATEGY_PRESETS).join(', ')})`);
  return makeStrategy(params);
}
