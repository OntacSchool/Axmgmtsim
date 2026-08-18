/**
 * 핵심 리듀서 — 한 분기를 진행시킨다.
 *
 * advanceTurn(state, decisions, ...) 은 순수 함수다. 입력 상태를 변형하지 않고
 * 새 상태를 반환하며, 모든 무작위성은 주입된 Rng 에서만 나온다.
 * 이 성질 덕분에 (1) 서버가 결정 로그만으로 상태를 재현할 수 있고,
 * (2) 같은 상태에서 다른 결정을 돌려보는 반사실 분석이 가능하다.
 *
 * 분기 처리 순서:
 *   1) 조직/투자/인수 결정 반영 (일회성 지출 발생)
 *   2) 입찰 판정
 *   3) 기존 사업 수행 (매출 인식, 품질, 실적 축적)
 *   4) 수주한 사업을 다음 분기 수행 대상으로 편입
 *   5) 제품/인수 승계 매출
 *   6) 인재 ramp·이탈
 *   7) 재무 정산 및 파산 판정
 *   8) 사기·기술부채·자격취득 등 드리프트, 분기 진행
 */

import { resolveBid } from './bidding.ts';
import { totalStaff, utilization } from './capacity.ts';
import { progressProjects } from './delivery.ts';
import { backlog, checkBankruptcy, settleQuarter } from './finance.ts';
import { applyAcquisition, canAcquire, tickAcquisitions } from './mna.ts';
import { indexDataset, type DatasetIndex } from './market.ts';
import { addQuarters, comparePeriod } from './period.ts';
import type { Rng } from './rng.ts';
import { hireQuarterlyCost, tickTalents, totalBidBonus, totalDeliveryBonus } from './talent.ts';
import {
  DOMAINS,
  SEGMENTS,
  type ActiveProject,
  type BidOutcome,
  type CompanyState,
  type Dataset,
  type Decision,
  type Product,
  type SimEvent,
  type TalentEffects,
  type TurnResult,
  type TurnSummary,
} from './types.ts';

/** 투자 수익 체감. 억 단위 투자액의 제곱근에 비례해 효과가 붙는다. */
function investGain(amountKRW: number, k: number): number {
  return k * Math.sqrt(Math.max(0, amountKRW) / 100_000_000);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 인재 효과 증분을 상태에 더한다 (음수면 이탈 되돌림). */
function applyTalentDelta(state: CompanyState, delta: TalentEffects): void {
  for (const [seg, v] of Object.entries(delta.channel ?? {})) {
    const key = seg as (typeof SEGMENTS)[number];
    if (state.channel[key] !== undefined) state.channel[key] = clamp(state.channel[key] + v, 0, 100);
  }
  for (const [dom, v] of Object.entries(delta.capability ?? {})) {
    const key = dom as (typeof DOMAINS)[number];
    if (state.capability[key] !== undefined) state.capability[key] = clamp(state.capability[key] + v, 0, 100);
  }
  for (const [agency, v] of Object.entries(delta.relations ?? {})) {
    state.relations[agency] = clamp((state.relations[agency] ?? 0) + v, 0, 100);
  }
}

export interface AdvanceOptions {
  dataset: Dataset;
  index?: DatasetIndex;
}

export function advanceTurn(
  prev: CompanyState,
  decisions: Decision[],
  options: AdvanceOptions,
  rng: Rng,
): TurnResult {
  const { dataset } = options;
  const index = options.index ?? indexDataset(dataset);
  const config = dataset.config;

  if (prev.bankrupt) {
    const summary = emptySummary(prev);
    return { state: prev, events: [], bids: [], summary };
  }

  let state: CompanyState = structuredClone(prev);
  const events: SimEvent[] = [];
  let oneOffCostKRW = 0;

  // ── 1) 조직 / 투자 / 인수 결정 ────────────────────────────────
  for (const decision of decisions) {
    switch (decision.type) {
      case 'hire': {
        const talent = index.talents.get(decision.talentId);
        if (!talent) break;
        if (comparePeriod(talent.availableFrom, state.period) > 0) break;
        if (state.hires.some((h) => h.talentId === talent.id && h.active)) break;
        if (state.cashKRW < talent.cost.signingKRW) break;

        oneOffCostKRW += talent.cost.signingKRW;
        state.hires.push({ talentId: talent.id, hiredPeriod: state.period, ramp: 0, active: true });
        state.staff[talent.grade] += 1;
        // 벤더 등록은 합류 즉시 열린다 — 대기업·글로벌 진출의 관문.
        for (const v of talent.effects.vendorRegistrations ?? []) {
          if (!state.vendorRegistrations.includes(v)) state.vendorRegistrations.push(v);
        }
        state.morale = clamp(state.morale + (talent.effects.moraleDelta ?? 0), 0, 100);
        events.push({
          kind: 'hire.joined',
          period: state.period,
          message: `영입: ${talent.title} (효과 발현 ${talent.rampQuarters}분기)`,
          data: { talentId: talent.id },
        });
        break;
      }

      case 'recruit': {
        const count = Math.max(0, Math.floor(decision.count));
        const cost = config.recruitCostByGrade[decision.grade] * count;
        if (count === 0 || state.cashKRW < cost) break;
        oneOffCostKRW += cost;
        state.staff[decision.grade] += count;
        // 급격한 채용은 조직을 희석시킨다.
        state.morale = clamp(state.morale - Math.min(6, count * 0.4), 0, 100);
        state.techDebt = clamp(state.techDebt + count * 0.3, 0, 100);
        break;
      }

      case 'layoff': {
        const count = Math.min(state.staff[decision.grade], Math.max(0, Math.floor(decision.count)));
        if (count === 0) break;
        // 퇴직금 2분기치
        oneOffCostKRW += config.quarterlyCostByGrade[decision.grade] * count * 2;
        state.staff[decision.grade] -= count;
        state.morale = clamp(state.morale - Math.min(18, count * 1.5), 0, 100);
        break;
      }

      case 'invest': {
        const amount = Math.max(0, decision.amountKRW);
        if (decision.target === 'cert') {
          const cert = decision.cert;
          if (!cert) break;
          if (state.certs.includes(cert) || state.pendingCerts.some((p) => p.cert === cert)) break;
          const cost = config.certCostKRW[cert];
          if (state.cashKRW < cost) break;
          oneOffCostKRW += cost;
          state.pendingCerts.push({ cert, quartersLeft: config.certLeadQuarters });
          break;
        }
        if (amount === 0 || state.cashKRW < amount) break;
        oneOffCostKRW += amount;
        if (decision.target === 'sales') {
          const seg = decision.segment ?? 'public';
          state.channel[seg] = clamp(state.channel[seg] + investGain(amount, 1.8), 0, 100);
        } else if (decision.target === 'marketing') {
          state.brand = clamp(state.brand + investGain(amount, 1.6), 0, 100);
        } else if (decision.target === 'training') {
          const dom = decision.domain ?? 'ai';
          state.capability[dom] = clamp(state.capability[dom] + investGain(amount, 1.5), 0, 100);
          state.morale = clamp(state.morale + investGain(amount, 0.6), 0, 100);
          state.techDebt = clamp(state.techDebt - investGain(amount, 0.8), 0, 100);
        } else if (decision.target === 'rnd') {
          // 제품 지정 없는 일반 R&D 는 역량으로 환원된다.
          const dom = decision.domain ?? 'ai';
          state.capability[dom] = clamp(state.capability[dom] + investGain(amount, 1.2), 0, 100);
        }
        break;
      }

      case 'rnd': {
        const product = index.products.get(decision.productId);
        const amount = Math.max(0, decision.amountKRW);
        if (!product || amount === 0 || state.cashKRW < amount) break;
        if (comparePeriod(product.availableFrom, state.period) > 0) break;
        oneOffCostKRW += amount;

        let ps = state.products.find((p) => p.productId === product.id);
        if (!ps) {
          ps = { productId: product.id, rndInvestedKRW: 0, launched: false, customers: 0 };
          state.products.push(ps);
        }
        ps.rndInvestedKRW += amount;
        if (!ps.launched && ps.rndInvestedKRW >= product.rndToLaunchKRW) {
          ps.launched = true;
          ps.launchedPeriod = state.period;
          events.push({
            kind: 'product.launched',
            period: state.period,
            message: `제품 출시: ${product.name}`,
            data: { productId: product.id },
          });
        }
        break;
      }

      case 'acquire': {
        const target = index.targets.get(decision.targetId);
        if (!target) break;
        if (comparePeriod(target.availableFrom, state.period) > 0) break;
        const check = canAcquire(state, target, decision.financing);
        if (!check.ok) break;
        const applied = applyAcquisition(state, target, decision.financing);
        state = applied.state;
        events.push(...applied.events);
        break;
      }

      case 'bid':
      case 'pass':
        break;
    }
  }

  // ── 2) 입찰 판정 ──────────────────────────────────────────────
  const launchedProducts: Product[] = state.products
    .filter((p) => p.launched)
    .map((p) => index.products.get(p.productId))
    .filter((p): p is Product => Boolean(p));

  const bidBonus = totalBidBonus(state, index.talents);
  const bids: BidOutcome[] = [];
  const wonProjects: ActiveProject[] = [];

  for (const decision of decisions) {
    if (decision.type !== 'bid') continue;
    const deal = index.deals.get(decision.dealId);
    if (!deal || deal.period !== state.period) continue;

    const outcome = resolveBid(
      state,
      { deal, discountRate: decision.discountRate, consortium: decision.consortium },
      config,
      rng,
      { bidWinBonus: bidBonus, launchedProducts },
    );
    bids.push(outcome);
    oneOffCostKRW += outcome.proposalCostKRW;

    if (!outcome.fit.gate) {
      events.push({
        kind: 'bid.blocked',
        period: state.period,
        message: `입찰 불가: ${deal.title} — ${outcome.fit.gateReason}`,
        data: { dealId: deal.id },
      });
      continue;
    }

    if (outcome.won) {
      wonProjects.push({
        dealId: deal.id,
        title: deal.title,
        agency: deal.agency,
        segment: deal.segment,
        domain: [...deal.domain],
        contractKRW: outcome.contractKRW,
        totalQuarters: deal.durationQuarters,
        quartersLeft: deal.durationQuarters,
        staffMix: { ...deal.requirements.staffMix },
        qualityAcc: 0,
        quartersWorked: 0,
      });
      events.push({
        kind: 'bid.won',
        period: state.period,
        message: `수주: ${deal.title} (${deal.agency}) — ${(outcome.contractKRW / 1e8).toFixed(1)}억 / 내 ${outcome.myTotal.toFixed(1)} vs 경쟁 ${outcome.bestCompetitor.toFixed(1)}`,
        data: { dealId: deal.id, contractKRW: outcome.contractKRW },
      });
    } else {
      events.push({
        kind: 'bid.lost',
        period: state.period,
        message: `탈락: ${deal.title} — 내 ${outcome.myTotal.toFixed(1)} vs 경쟁 ${outcome.bestCompetitor.toFixed(1)}`,
        data: { dealId: deal.id },
      });
    }
  }

  // ── 3) 기존 사업 수행 ─────────────────────────────────────────
  // 자사 제품을 얹어 수행하면 품질이 올라간다 — 제품 보유의 두 번째 값어치다.
  const productDeliveryBonus = Math.min(0.12, launchedProducts.length * 0.04);
  const deliveryBonus = totalDeliveryBonus(state, index.talents) + productDeliveryBonus;
  const delivery = progressProjects(state, deliveryBonus, config, rng);
  events.push(...delivery.events);

  state.projects = delivery.ongoing;
  state.trackRecords.push(...delivery.newTrackRecords);
  for (const [agency, d] of Object.entries(delivery.relationDeltas)) {
    state.relations[agency] = clamp((state.relations[agency] ?? 0) + d, 0, 100);
  }
  for (const [dom, d] of Object.entries(delivery.capabilityDeltas)) {
    const key = dom as (typeof DOMAINS)[number];
    if (state.capability[key] !== undefined) state.capability[key] = clamp(state.capability[key] + (d ?? 0), 0, 100);
  }
  state.techDebt = clamp(state.techDebt + delivery.techDebtDelta, 0, 100);
  state.brand = clamp(state.brand + delivery.brandDelta, 0, 100);

  // ── 4) 수주분 편입 (다음 분기부터 수행) ──────────────────────
  state.projects.push(...wonProjects);

  // ── 5) 제품 / 인수 승계 매출 ─────────────────────────────────
  const acqTick = tickAcquisitions(state, index.targets, rng);
  state.acquisitions = acqTick.acquisitions;
  events.push(...acqTick.events);
  for (const [grade, lost] of Object.entries(acqTick.staffLoss)) {
    const g = grade as keyof typeof state.staff;
    state.staff[g] = Math.max(0, state.staff[g] - (lost ?? 0));
  }
  state.morale = clamp(state.morale + acqTick.moraleDelta, 0, 100);
  state.trackRecords.push(...acqTick.inheritedTrackRecords);
  for (const cert of acqTick.inheritedCerts) {
    if (!state.certs.includes(cert)) state.certs.push(cert);
  }

  let productRevenueKRW = 0;
  let crossSellPool = acqTick.crossSoldCustomers;
  for (const ps of state.products) {
    if (!ps.launched) continue;
    const product = index.products.get(ps.productId);
    if (!product) continue;

    // 교차판매 고객을 출시 제품에 배분
    if (crossSellPool > 0) {
      ps.customers += crossSellPool;
      crossSellPool = 0;
    }
    // 브랜드와 채널이 만드는 자연 유입.
    // 제품은 SMB 뿐 아니라 기존 대기업·공공 고객에게도 얹어 팔린다.
    const organicExpected =
      state.brand / 45 +
      (state.channel.smb + state.channel.enterprise * 0.5 + state.channel.public * 0.3) / 100;
    ps.customers += Math.floor(organicExpected) + (rng.chance(organicExpected % 1) ? 1 : 0);

    productRevenueKRW += ps.customers * product.arpuQuarterlyKRW;
  }

  // ── 6) 인재 ramp / 이탈 ──────────────────────────────────────
  const talentTick = tickTalents(state, index.talents, rng);
  state.hires = talentTick.hires;
  for (const delta of talentTick.deltas) applyTalentDelta(state, delta);
  events.push(...talentTick.events);
  state.morale = clamp(state.morale + talentTick.moraleDelta, 0, 100);
  // 이탈자는 인원에서도 빠진다.
  for (const ev of talentTick.events) {
    const talent = index.talents.get(String(ev.data?.talentId ?? ''));
    if (talent && state.staff[talent.grade] > 0) state.staff[talent.grade] -= 1;
  }

  // ── 7) 재무 정산 ─────────────────────────────────────────────
  const finance = settleQuarter(
    state,
    {
      projectRevenueKRW: delivery.revenueKRW,
      productRevenueKRW,
      inheritedRevenueKRW: acqTick.inheritedRevenueKRW,
      hireCostKRW: hireQuarterlyCost(state, index.talents),
      oneOffCostKRW,
    },
    config,
  );
  state.cashKRW = finance.cashKRW;
  state.debtKRW = finance.debtKRW;

  const bankruptcy = checkBankruptcy(state.cashKRW, state.distressQuarters, config);
  state.distressQuarters = bankruptcy.distressQuarters;
  if (bankruptcy.bankrupt) {
    state.bankrupt = true;
    events.push({
      kind: 'company.bankrupt',
      period: state.period,
      message: `파산: 현금 ${(state.cashKRW / 1e8).toFixed(1)}억이 ${config.bankruptcyQuarters}분기 연속 기준 미달`,
    });
  }

  // ── 8) 드리프트 및 분기 진행 ─────────────────────────────────
  const util = utilization(state);
  // 사기는 60을 향해 회귀하되 과부하면 깎인다.
  state.morale = clamp(state.morale + (60 - state.morale) * 0.15 - Math.max(0, util - 1) * 12, 0, 100);
  // 기술부채는 저절로 조금씩 상환된다.
  state.techDebt = clamp(state.techDebt - 1.5, 0, 100);

  state.pendingCerts = state.pendingCerts
    .map((p) => ({ ...p, quartersLeft: p.quartersLeft - 1 }))
    .filter((p) => {
      if (p.quartersLeft > 0) return true;
      if (!state.certs.includes(p.cert)) state.certs.push(p.cert);
      events.push({
        kind: 'cert.acquired',
        period: state.period,
        message: `자격 취득: ${p.cert}`,
        data: { cert: p.cert },
      });
      return false;
    });

  const summary: TurnSummary = {
    period: state.period,
    turn: state.turn,
    revenueKRW: finance.revenueKRW,
    costKRW: finance.costKRW,
    profitKRW: finance.profitKRW,
    cashKRW: state.cashKRW,
    backlogKRW: backlog(state),
    headcount: totalStaff(state.staff),
    bidsSubmitted: bids.length,
    bidsWon: bids.filter((b) => b.won).length,
    trackRecordCount: state.trackRecords.length,
    utilization: util,
  };

  events.push({
    kind: 'finance.quarter',
    period: state.period,
    message: `매출 ${(finance.revenueKRW / 1e8).toFixed(1)}억 / 손익 ${(finance.profitKRW / 1e8).toFixed(1)}억 / 현금 ${(state.cashKRW / 1e8).toFixed(1)}억`,
    data: { ...finance },
  });

  state.history.push(summary);
  state.period = addQuarters(state.period, 1);
  state.turn += 1;

  return { state, events, bids, summary };
}

function emptySummary(state: CompanyState): TurnSummary {
  return {
    period: state.period,
    turn: state.turn,
    revenueKRW: 0,
    costKRW: 0,
    profitKRW: 0,
    cashKRW: state.cashKRW,
    backlogKRW: 0,
    headcount: totalStaff(state.staff),
    bidsSubmitted: 0,
    bidsWon: 0,
    trackRecordCount: state.trackRecords.length,
    utilization: 0,
  };
}
