/**
 * 이벤트 소싱 — 결정 로그만으로 상태를 재현한다.
 *
 * 모바일 클라이언트는 엔진을 직접 실행하고 서버에는 decisions 만 append 한다.
 * 서버는 같은 엔진 버전으로 여기 replay() 를 돌려 상태를 재구성하고 checksum 으로
 * 검증한다. 웹 대시보드도 같은 로그를 재생해 동일 화면을 그린다.
 */

import { advanceTurn } from './reduce.ts';
import { indexDataset } from './market.ts';
import { createRng, hashSeed, type Rng } from './rng.ts';
import { createInitialState } from './state.ts';
import type { CompanyState, Dataset, Decision, TurnResult } from './types.ts';

export const ENGINE_VERSION = '0.1.0';

export interface TurnLog {
  turn: number;
  decisions: Decision[];
}

export interface RunLog {
  runId: string;
  seed: number;
  profileId: string;
  engineVersion: string;
  turns: TurnLog[];
}

/**
 * 턴별 RNG. 시드와 턴 번호에서 파생시키면 임의의 턴에서 분기(branch)해도
 * 그 이후의 난수열이 원본과 동일하게 재현된다 — 반사실 분석의 전제 조건이다.
 */
export function rngForTurn(seed: number, turn: number): Rng {
  return createRng(hashSeed(`turn:${turn}`, seed));
}

export function replay(log: RunLog, dataset: Dataset): { state: CompanyState; results: TurnResult[] } {
  const profile = dataset.profiles.find((p) => p.id === log.profileId);
  if (!profile) throw new Error(`알 수 없는 회사 프로필: ${log.profileId}`);

  const index = indexDataset(dataset);
  let state = createInitialState(profile);
  const results: TurnResult[] = [];

  for (const turnLog of log.turns) {
    const result = advanceTurn(state, turnLog.decisions, { dataset, index }, rngForTurn(log.seed, turnLog.turn));
    state = result.state;
    results.push(result);
  }

  return { state, results };
}

/**
 * 상태 체크섬. 서버가 클라이언트 보고 상태를 검증할 때 쓴다.
 * 부동소수 오차에 흔들리지 않도록 주요 지표를 반올림해 해싱한다.
 */
export function checksum(state: CompanyState): string {
  const canonical = JSON.stringify({
    turn: state.turn,
    period: state.period,
    cash: Math.round(state.cashKRW / 1e6),
    debt: Math.round(state.debtKRW / 1e6),
    staff: state.staff,
    capability: Object.fromEntries(Object.entries(state.capability).map(([k, v]) => [k, Math.round(v * 10)])),
    channel: Object.fromEntries(Object.entries(state.channel).map(([k, v]) => [k, Math.round(v * 10)])),
    certs: [...state.certs].sort(),
    vendors: [...state.vendorRegistrations].sort(),
    records: state.trackRecords.length,
    projects: state.projects.map((p) => p.dealId).sort(),
    bankrupt: state.bankrupt,
  });
  return hashSeed(canonical).toString(16).padStart(8, '0');
}
