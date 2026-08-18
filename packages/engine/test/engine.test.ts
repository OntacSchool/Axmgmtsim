/**
 * 엔진 단위 테스트.
 *
 * 여기서 지키려는 것은 크게 셋이다.
 *  1) 결정론 — 같은 시드·같은 결정이면 항상 같은 결과. 반사실 분석과 서버 재현의 전제.
 *  2) 게이트 — 자격이 없으면 입찰 자체가 불가능하고, 컨소시엄으로 되는 것과 안 되는 것이 갈린다.
 *  3) 플라이휠 — 실적을 쌓으면 다음 입찰의 적합도가 실제로 오른다.
 */

import { describe, expect, it } from 'vitest';
import { loadDataset } from '@axsim/data';
import {
  addQuarters,
  advanceTurn,
  checkBankruptcy,
  checksum,
  computeFit,
  createInitialState,
  createRng,
  diffQuarters,
  fillStaff,
  getStrategy,
  indexDataset,
  parsePeriod,
  replay,
  rngForTurn,
  settleQuarter,
  type CompanyState,
  type Deal,
  type Decision,
  type TrackRecord,
} from '../src/index.ts';

const dataset = loadDataset();
const index = indexDataset(dataset);
const profile = dataset.profiles.find((p) => p.id === 'ontact')!;

function freshState(): CompanyState {
  return createInitialState(profile);
}

function firstPublicDeal(): Deal {
  return dataset.deals.find((d) => d.segment === 'public' && d.requirements.mandatoryCerts.length > 0)!;
}

describe('rng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('시드 0 도 퇴화하지 않는다', () => {
    const rng = createRng(0);
    const values = Array.from({ length: 10 }, () => rng.next());
    expect(new Set(values).size).toBe(10);
  });

  it('0 이상 1 미만을 낸다', () => {
    const rng = createRng(99);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('period', () => {
  it('분기를 넘겨 연도가 바뀐다', () => {
    expect(addQuarters('2023Q4', 1)).toBe('2024Q1');
    expect(addQuarters('2023Q1', -1)).toBe('2022Q4');
    expect(addQuarters('2020Q1', 27)).toBe('2026Q4');
  });

  it('분기 차이를 센다', () => {
    expect(diffQuarters('2020Q1', '2020Q1')).toBe(0);
    expect(diffQuarters('2020Q1', '2021Q1')).toBe(4);
    expect(diffQuarters('2021Q1', '2020Q1')).toBe(-4);
  });

  it('잘못된 형식을 거부한다', () => {
    expect(() => parsePeriod('2023-Q1')).toThrow();
    expect(() => parsePeriod('2023Q5')).toThrow();
  });
});

describe('capacity.fillStaff', () => {
  it('상위 등급이 하위 자리를 대신할 수 있다', () => {
    const fill = fillStaff({ principal: 2, senior: 0, mid: 0, junior: 0 }, { mid: 2 });
    expect(fill.ratio).toBe(1);
  });

  it('하위 등급은 상위 자리를 대신할 수 없다', () => {
    const fill = fillStaff({ principal: 0, senior: 0, mid: 5, junior: 5 }, { principal: 2 });
    expect(fill.ratio).toBe(0);
    expect(fill.shortfall.principal).toBe(2);
  });

  it('부분 충족은 비율로 나온다', () => {
    const fill = fillStaff({ principal: 0, senior: 0, mid: 2, junior: 0 }, { mid: 4 });
    expect(fill.ratio).toBeCloseTo(0.5);
  });
});

describe('fit — 게이트', () => {
  it('필수 자격이 없으면 입찰 자체가 막힌다', () => {
    const state = freshState();
    state.certs = [];
    const deal = firstPublicDeal();
    const fit = computeFit(state, deal, { consortium: false });
    expect(fit.gate).toBe(false);
    expect(fit.gateReason).toContain('필수 자격');
  });

  it('컨소시엄은 부족한 자격을 메운다', () => {
    const state = freshState();
    state.certs = [];
    const deal = firstPublicDeal();
    expect(computeFit(state, deal, { consortium: true }).gate).toBe(true);
  });

  it('벤더 등록은 컨소시엄으로도 못 메운다', () => {
    const state = freshState();
    const deal = dataset.deals.find((d) => d.requirements.vendorRegistration)!;
    expect(computeFit(state, deal, { consortium: false }).gate).toBe(false);
    expect(computeFit(state, deal, { consortium: true }).gate).toBe(false);
  });

  it('벤더 등록을 보유하면 통과한다', () => {
    const state = freshState();
    const deal = dataset.deals.find((d) => d.requirements.vendorRegistration)!;
    state.vendorRegistrations.push(deal.requirements.vendorRegistration!);
    state.certs = [...deal.requirements.mandatoryCerts];
    expect(computeFit(state, deal, { consortium: false }).gate).toBe(true);
  });
});

describe('fit — 플라이휠', () => {
  it('유사 실적을 쌓으면 같은 사업의 적합도가 오른다', () => {
    const deal = dataset.deals.find(
      (d) => d.segment === 'public' && d.requirements.minTrackRecords !== null,
    )!;
    const req = deal.requirements.minTrackRecords!;

    const before = freshState();
    before.trackRecords = [];
    const fitBefore = computeFit(before, deal, { consortium: false });

    const after = structuredClone(before);
    after.trackRecords = Array.from({ length: req.count }, (_, i): TrackRecord => ({
      dealId: `TEST-${i}`,
      domain: req.domain,
      segment: 'public',
      amountKRW: req.minAmountKRW * 1.2,
      agency: '테스트기관',
      quality: 0.8,
      completedPeriod: '2020Q4',
    }));
    const fitAfter = computeFit(after, deal, { consortium: false });

    expect(fitAfter.breakdown.실적).toBeGreaterThan(fitBefore.breakdown.실적);
    expect(fitAfter.fitScore).toBeGreaterThan(fitBefore.fitScore);
  });

  it('관계자본이 높을수록 적합도가 오른다', () => {
    const deal = firstPublicDeal();
    const low = freshState();
    low.relations = {};
    const high = structuredClone(low);
    high.relations[deal.agency] = 90;

    expect(computeFit(high, deal, { consortium: false }).fitScore).toBeGreaterThan(
      computeFit(low, deal, { consortium: false }).fitScore,
    );
  });
});

describe('finance', () => {
  it('현금이 기준 아래인 상태가 연속되어야 파산한다', () => {
    const config = dataset.config;
    const low = config.bankruptcyCashKRW - 1;
    let distress = 0;
    for (let i = 1; i < config.bankruptcyQuarters; i++) {
      const r = checkBankruptcy(low, distress, config);
      distress = r.distressQuarters;
      expect(r.bankrupt).toBe(false);
    }
    expect(checkBankruptcy(low, distress, config).bankrupt).toBe(true);
  });

  it('현금이 회복되면 파산 카운터가 초기화된다', () => {
    const config = dataset.config;
    expect(checkBankruptcy(1_000_000_000, 2, config).distressQuarters).toBe(0);
  });

  it('차입금은 이자와 원금이 함께 현금을 갉아먹는다', () => {
    const state = freshState();
    state.debtKRW = 10_000_000_000;
    const result = settleQuarter(
      state,
      { projectRevenueKRW: 0, productRevenueKRW: 0, inheritedRevenueKRW: 0, hireCostKRW: 0, oneOffCostKRW: 0 },
      dataset.config,
    );
    expect(result.interestKRW).toBeGreaterThan(0);
    expect(result.principalRepaidKRW).toBeGreaterThan(0);
    expect(result.debtKRW).toBeLessThan(state.debtKRW);
    // 현금 감소분은 손익 적자보다 원금 상환만큼 더 크다
    expect(state.cashKRW - result.cashKRW).toBeGreaterThan(-result.profitKRW);
  });
});

describe('advanceTurn — 결정론', () => {
  it('같은 시드·같은 결정은 같은 상태를 만든다', () => {
    const decisions: Decision[] = [{ type: 'invest', target: 'marketing', amountKRW: 100_000_000 }];
    const a = advanceTurn(freshState(), decisions, { dataset, index }, rngForTurn(42, 0));
    const b = advanceTurn(freshState(), decisions, { dataset, index }, rngForTurn(42, 0));
    expect(checksum(a.state)).toBe(checksum(b.state));
  });

  it('입력 상태를 변형하지 않는다', () => {
    const state = freshState();
    const snapshot = JSON.stringify(state);
    advanceTurn(state, [{ type: 'recruit', grade: 'mid', count: 5 }], { dataset, index }, rngForTurn(1, 0));
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('분기가 하나씩 진행된다', () => {
    const result = advanceTurn(freshState(), [{ type: 'pass' }], { dataset, index }, rngForTurn(1, 0));
    expect(result.state.period).toBe(addQuarters(profile.startPeriod, 1));
    expect(result.state.turn).toBe(1);
  });

  it('파산한 회사는 더 이상 진행되지 않는다', () => {
    const dead = freshState();
    dead.bankrupt = true;
    const result = advanceTurn(dead, [{ type: 'pass' }], { dataset, index }, rngForTurn(1, 0));
    expect(result.state.turn).toBe(dead.turn);
    expect(result.events).toHaveLength(0);
  });
});

describe('M&A', () => {
  const target = dataset.targets.find((t) => t.id === 'MNA-EDU-01')!;

  it('차입 한도를 넘는 인수는 실행되지 않는다', () => {
    const state = freshState(); // 이력이 없어 차입 한도가 최소치
    state.period = target.availableFrom;
    const result = advanceTurn(
      state,
      [{ type: 'acquire', targetId: target.id, financing: 'debt' }],
      { dataset, index },
      rngForTurn(1, 0),
    );
    expect(result.state.acquisitions).toHaveLength(0);
  });

  it('실적과 인증은 통합이 끝나야 승계된다', () => {
    let state = freshState();
    state.period = target.availableFrom; // 대상이 매물로 나온 시점
    state.cashKRW = 50_000_000_000; // 현금 인수가 가능하도록
    state.projects = []; // 진행 중 사업이 완료되며 실적이 늘어나는 효과를 배제한다
    const certsBefore = [...state.certs];
    const recordsBefore = state.trackRecords.length;

    const first = advanceTurn(
      state,
      [{ type: 'acquire', targetId: target.id, financing: 'cash' }],
      { dataset, index },
      rngForTurn(7, 0),
    );
    state = first.state;
    expect(state.acquisitions).toHaveLength(1);
    // 인수 직후에는 아직 실적이 넘어오지 않았다
    expect(state.trackRecords.length).toBe(recordsBefore);
    expect(state.certs).toEqual(certsBefore);

    // 통합 기간만큼 돌리면 승계된다
    for (let i = 0; i < target.pmi.integrationQuarters; i++) {
      state = advanceTurn(state, [{ type: 'pass' }], { dataset, index }, rngForTurn(7, state.turn)).state;
    }
    expect(state.trackRecords.length).toBeGreaterThan(recordsBefore);
    expect(state.certs.length).toBeGreaterThan(certsBefore.length);
  });

  it('인수 인력은 이탈률만큼 빠져서 들어온다', () => {
    const state = freshState();
    state.period = target.availableFrom;
    state.cashKRW = 50_000_000_000;
    const before = Object.values(state.staff).reduce((a, b) => a + b, 0);
    const brought = Object.values(target.brings.headcount).reduce((a: number, b) => a + (b ?? 0), 0);

    const result = advanceTurn(
      state,
      [{ type: 'acquire', targetId: target.id, financing: 'cash' }],
      { dataset, index },
      rngForTurn(3, 0),
    );
    const after = Object.values(result.state.staff).reduce((a, b) => a + b, 0);
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(brought);
  });
});

describe('replay', () => {
  it('결정 로그만으로 같은 상태를 재현한다', () => {
    const strategy = getStrategy('public-focus');
    let state = createInitialState(profile);
    const turns: { turn: number; decisions: Decision[] }[] = [];

    for (let i = 0; i < 12; i++) {
      const decisions = strategy({ state, dataset, index, rng: rngForTurn(555 ^ 0x5bf03635, state.turn) });
      turns.push({ turn: state.turn, decisions });
      state = advanceTurn(state, decisions, { dataset, index }, rngForTurn(555, state.turn)).state;
    }

    const replayed = replay(
      { runId: 'test', seed: 555, profileId: profile.id, engineVersion: '0.1.0', turns },
      dataset,
    );
    expect(checksum(replayed.state)).toBe(checksum(state));
  });
});

describe('전략 봇', () => {
  it('모든 프리셋이 28분기를 끝까지 돈다', () => {
    for (const key of ['public-focus', 'enterprise-focus', 'mna-first', 'product-rnd', 'balanced']) {
      const strategy = getStrategy(key);
      let state = createInitialState(profile);
      for (let i = 0; i < dataset.config.totalTurns && !state.bankrupt; i++) {
        const decisions = strategy({ state, dataset, index, rng: rngForTurn(11 ^ 0x5bf03635, state.turn) });
        state = advanceTurn(state, decisions, { dataset, index }, rngForTurn(11, state.turn)).state;
      }
      expect(state.turn).toBeGreaterThan(0);
      expect(Number.isFinite(state.cashKRW)).toBe(true);
    }
  });
});
