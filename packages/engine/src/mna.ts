/**
 * M&A — 인수, 시너지, PMI.
 *
 * 핵심 설계: 역량과 채널은 '합'이 아니라 'max + 중복 할인'으로 병합된다.
 * 이미 잘하는 영역을 사면 거의 값이 없고, 없는 걸 사야 값이 있다는 뜻이다.
 * 반대로 자격·실적·벤더등록은 승계되므로 공공/대기업 진입 시간을 실제로 단축시킨다.
 */

import { GRADES, type AcquisitionState, type AcquisitionTarget, type Cert, type CompanyState, type Grade, type SimEvent, type TrackRecord } from './types.ts';
import type { Rng } from './rng.ts';

/** 중복 역량의 잔존 가치. 0이면 겹치는 부분은 완전히 버려진다. */
const OVERLAP_RETENTION = 0.15;

/** 통합 완료 후 분기당 교차판매 전환율 */
const CROSS_SELL_RATE = 0.12;

/**
 * 승계 매출의 분기당 자연 감소율.
 *
 * 인수로 넘어온 매출은 연금이 아니다. 기존 계약은 만료되고 고객은 이탈하므로,
 * 인수한 회사의 매출을 유지하려면 결국 그 채널에서 새 사업을 따야 한다.
 * 이 감소율이 없으면 M&A 가 리스크 없는 지배 전략이 된다.
 */
const INHERITED_REVENUE_DECAY = 0.12;

/** 통합 종료 시점의 PMI 실패 확률 계수 (문화 적합도가 낮을수록 커진다) */
const PMI_FAILURE_COEFFICIENT = 0.5;

/** PMI 실패 시 남는 승계 매출 비율 */
const PMI_FAILURE_REVENUE_RETENTION = 0.55;

function mergeScore(mine: number, theirs: number): number {
  return Math.min(100, Math.max(mine, theirs) + Math.min(mine, theirs) * OVERLAP_RETENTION);
}

export interface AcquisitionApplication {
  state: CompanyState;
  events: SimEvent[];
  /** 실제로 지출된 현금 */
  cashSpentKRW: number;
  /** 새로 생긴 차입 */
  debtAddedKRW: number;
}

/**
 * 차입 한도 — 직전 4분기 매출의 1.5배, 최소 10억.
 *
 * 이 한 줄이 M&A 전략의 리듬을 만든다. 매출이 없는 회사는 큰 회사를 살 수 없고,
 * 먼저 사업으로 규모를 키워야 레버리지를 쓸 수 있다.
 */
export function debtCapacity(state: CompanyState): number {
  const trailing = state.history.slice(-4).reduce((sum, h) => sum + h.revenueKRW, 0);
  return Math.max(1_000_000_000, trailing * 1.5);
}

export function financingSplit(
  target: AcquisitionTarget,
  financing: 'cash' | 'debt' | 'mixed',
): { totalKRW: number; cashKRW: number; debtKRW: number } {
  const totalKRW = target.priceKRW * (1 + target.pmi.costRate);
  const cashKRW = financing === 'cash' ? totalKRW : financing === 'mixed' ? totalKRW * 0.5 : 0;
  return { totalKRW, cashKRW, debtKRW: totalKRW - cashKRW };
}

export function canAcquire(
  state: CompanyState,
  target: AcquisitionTarget,
  financing: 'cash' | 'debt' | 'mixed',
): { ok: boolean; reason?: string } {
  if (state.acquisitions.some((a) => a.targetId === target.id)) {
    return { ok: false, reason: '이미 인수한 회사입니다' };
  }
  const split = financingSplit(target, financing);
  if (state.cashKRW < split.cashKRW) {
    return { ok: false, reason: `현금 부족 (필요 ${(split.cashKRW / 1e8).toFixed(1)}억)` };
  }
  const capacity = debtCapacity(state);
  if (state.debtKRW + split.debtKRW > capacity) {
    return {
      ok: false,
      reason: `차입 한도 초과 (한도 ${(capacity / 1e8).toFixed(0)}억, 필요 ${((state.debtKRW + split.debtKRW) / 1e8).toFixed(0)}억)`,
    };
  }
  return { ok: true };
}

/** 인수를 즉시 적용한다. 자격·실적·채널은 승계되고, 인력은 이탈률만큼 깎여서 들어온다. */
export function applyAcquisition(
  state: CompanyState,
  target: AcquisitionTarget,
  financing: 'cash' | 'debt' | 'mixed',
): AcquisitionApplication {
  const events: SimEvent[] = [];
  const { totalKRW: totalCost, cashKRW: cashSpentKRW, debtKRW: debtAddedKRW } = financingSplit(target, financing);

  // 인력 — PMI 이탈을 즉시 반영한다.
  const staff = { ...state.staff };
  const retained = 1 - target.pmi.attrition;
  for (const g of GRADES) {
    staff[g] += Math.round((target.brings.headcount[g] ?? 0) * retained);
  }

  // 역량·채널은 중복 할인 병합
  const capability = { ...state.capability };
  for (const [d, v] of Object.entries(target.brings.capability)) {
    const key = d as keyof typeof capability;
    capability[key] = mergeScore(capability[key], v);
  }
  const channel = { ...state.channel };
  for (const [s, v] of Object.entries(target.brings.channel)) {
    const key = s as keyof typeof channel;
    channel[key] = mergeScore(channel[key], v);
  }

  // 벤더 등록(상거래 관계)은 계약 이전과 함께 바로 넘어오지만,
  // 조달 실적과 인증은 법인 통합 절차가 끝나야 우리 이름으로 쓸 수 있다.
  // 그래서 인수의 핵심 값어치는 통합에 성공해야만 손에 들어온다 — tickAcquisitions 참조.
  const vendorRegistrations = Array.from(
    new Set([...state.vendorRegistrations, ...(target.brings.vendorRegistrations ?? [])]),
  );

  const relations = { ...state.relations };
  for (const [agency, v] of Object.entries(target.brings.relations ?? {})) {
    relations[agency] = Math.min(100, Math.max(relations[agency] ?? 0, v));
  }

  // 제품 승계 — 이미 출시된 상태로 들어온다.
  const products = [...state.products];
  for (const productId of target.brings.products) {
    const existing = products.find((p) => p.productId === productId);
    if (existing) {
      products[products.indexOf(existing)] = { ...existing, launched: true };
    } else {
      products.push({ productId, rndInvestedKRW: 0, launched: true, launchedPeriod: state.period, customers: 0 });
    }
  }

  const acquisition: AcquisitionState = {
    targetId: target.id,
    acquiredPeriod: state.period,
    integrationLeft: target.pmi.integrationQuarters,
    customersRemaining: target.brings.customers,
    quarterlyRevenueKRW: (target.brings.annualRevenueKRW / 4) * retained,
  };

  // 문화 적합도가 낮은 인수는 조직 사기를 흔든다.
  const moraleHit = (1 - target.pmi.cultureFit) * 18;

  events.push({
    kind: 'acquire.done',
    period: state.period,
    message: `인수 완료: ${target.name} — ${Math.round(totalCost / 1e8) / 10}억 (통합 ${target.pmi.integrationQuarters}분기)`,
    data: { targetId: target.id, totalCost, financing },
  });

  return {
    state: {
      ...state,
      cashKRW: state.cashKRW - cashSpentKRW,
      debtKRW: state.debtKRW + debtAddedKRW,
      staff,
      capability,
      channel,
      vendorRegistrations,
      relations,
      products,
      acquisitions: [...state.acquisitions, acquisition],
      morale: Math.max(0, state.morale - moraleHit),
      techDebt: Math.min(100, state.techDebt + (1 - target.pmi.cultureFit) * 10),
    },
    events,
    cashSpentKRW,
    debtAddedKRW,
  };
}

export interface AcquisitionTickResult {
  acquisitions: AcquisitionState[];
  /** 승계 매출 + 교차판매로 늘어난 제품 고객 */
  inheritedRevenueKRW: number;
  crossSoldCustomers: number;
  events: SimEvent[];
  /** PMI 실패로 추가 이탈한 인력 */
  staffLoss: Partial<Record<Grade, number>>;
  moraleDelta: number;
  /** 통합 완료로 우리 이름이 된 조달 실적 */
  inheritedTrackRecords: TrackRecord[];
  /** 통합 완료로 승계된 인증 */
  inheritedCerts: Cert[];
}

/** 매 분기 통합 진행. 통합이 끝나야 교차판매가 시작된다. */
export function tickAcquisitions(
  state: CompanyState,
  targets: Map<string, AcquisitionTarget>,
  rng: Rng,
): AcquisitionTickResult {
  const events: SimEvent[] = [];
  const staffLoss: Partial<Record<Grade, number>> = {};
  const inheritedTrackRecords: TrackRecord[] = [];
  const inheritedCerts: Cert[] = [];
  let inheritedRevenueKRW = 0;
  let crossSoldCustomers = 0;
  let moraleDelta = 0;

  const succeed = (target: AcquisitionTarget, keepRatio: number) => {
    inheritedCerts.push(...target.brings.certs);
    const records = target.brings.trackRecords.slice(
      0,
      Math.max(0, Math.round(target.brings.trackRecords.length * keepRatio)),
    );
    inheritedTrackRecords.push(
      ...records.map((tr, i) => ({
        ...tr,
        dealId: `${target.id}-INHERIT-${i}`,
        completedPeriod: state.period,
      })),
    );
  };

  const acquisitions = state.acquisitions.map((acq) => {
    const target = targets.get(acq.targetId);
    if (!target) return acq;

    if (acq.integrationLeft > 0) {
      // 통합 기간에는 승계 매출도 일부만 잡힌다.
      inheritedRevenueKRW += acq.quarterlyRevenueKRW * 0.7;
      const left = acq.integrationLeft - 1;
      if (left > 0) return { ...acq, integrationLeft: left };

      // 통합이 끝나는 순간 PMI 성패가 갈린다.
      const failureProb = (1 - target.pmi.cultureFit) * PMI_FAILURE_COEFFICIENT;
      if (rng.chance(failureProb)) {
        for (const g of GRADES) {
          const brought = Math.round((target.brings.headcount[g] ?? 0) * (1 - target.pmi.attrition));
          const lost = Math.round(brought * 0.4);
          if (lost > 0) staffLoss[g] = (staffLoss[g] ?? 0) + lost;
        }
        moraleDelta -= 12;
        // 실패해도 인증과 실적 절반은 넘어온다. 완전히 헛돈은 아니지만 값은 반토막이다.
        succeed(target, 0.5);
        events.push({
          kind: 'acquire.integrated',
          period: state.period,
          message: `통합 실패: ${target.name} — 핵심 인력 이탈, 승계 매출 ${Math.round((1 - PMI_FAILURE_REVENUE_RETENTION) * 100)}% 소실, 실적 절반만 승계`,
          data: { targetId: target.id, failed: true },
        });
        return {
          ...acq,
          integrationLeft: 0,
          quarterlyRevenueKRW: acq.quarterlyRevenueKRW * PMI_FAILURE_REVENUE_RETENTION,
          customersRemaining: Math.round(acq.customersRemaining * 0.5),
        };
      }

      succeed(target, 1);
      events.push({
        kind: 'acquire.integrated',
        period: state.period,
        message: `통합 완료: ${target.name} — 실적 ${target.brings.trackRecords.length}건·인증 ${target.brings.certs.length}개 승계, 교차판매 개시`,
        data: { targetId: target.id, failed: false },
      });
      return { ...acq, integrationLeft: 0 };
    }

    inheritedRevenueKRW += acq.quarterlyRevenueKRW;

    // 통합 완료 후 교차판매
    let customersRemaining = acq.customersRemaining;
    if (customersRemaining > 0) {
      let converted = 0;
      for (let i = 0; i < customersRemaining; i++) {
        if (rng.chance(CROSS_SELL_RATE)) converted++;
      }
      crossSoldCustomers += converted;
      customersRemaining -= converted;
    }

    // 승계 매출은 계약 만료와 함께 줄어든다. 유지하려면 새로 따와야 한다.
    return {
      ...acq,
      customersRemaining,
      quarterlyRevenueKRW: acq.quarterlyRevenueKRW * (1 - INHERITED_REVENUE_DECAY),
    };
  });

  return {
    acquisitions,
    inheritedRevenueKRW,
    crossSoldCustomers,
    events,
    staffLoss,
    moraleDelta,
    inheritedTrackRecords,
    inheritedCerts,
  };
}
