/**
 * localStorage 영속화.
 *
 * 진실의 원천은 상태가 아니라 결정 로그(RunLog)다 — 1차에서 설계한 이벤트 소싱과
 * 같은 모양이고, 나중에 Postgres 로 옮길 때 이 스키마가 그대로 이관된다.
 *
 * RunMeta 인덱스는 홈 화면 목록을 그릴 때 매번 replay() 하지 않기 위한 캐시일 뿐이다.
 * 원본은 언제나 axsim:run:<id> 의 RunLog 이고, 인덱스는 저장할 때마다 함께 갱신한다.
 */

import type { RunLog } from '@axsim/engine';

export interface RunMeta {
  runId: string;
  profileId: string;
  profileName: string;
  seed: number;
  engineVersion: string;
  period: string;
  turn: number;
  cashKRW: number;
  bankrupt: boolean;
  updatedAt: string;
}

const INDEX_KEY = 'axsim:runs';
const runKey = (id: string) => `axsim:run:${id}`;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function createRunId(): string {
  return crypto.randomUUID();
}

export function loadRun(runId: string): RunLog | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(runKey(runId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunLog;
  } catch {
    return null;
  }
}

export function listRuns(): RunMeta[] {
  if (!isBrowser()) return [];
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RunMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** RunLog 와 함께 화면 표시용 요약(meta)을 저장한다. meta 는 호출부가 replay 결과에서 뽑아 넘긴다. */
export function saveRun(log: RunLog, meta: Omit<RunMeta, 'runId' | 'profileId' | 'seed' | 'engineVersion'>): void {
  if (!isBrowser()) return;
  localStorage.setItem(runKey(log.runId), JSON.stringify(log));

  const index = listRuns().filter((r) => r.runId !== log.runId);
  index.unshift({
    runId: log.runId,
    profileId: log.profileId,
    seed: log.seed,
    engineVersion: log.engineVersion,
    ...meta,
  });
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function deleteRun(runId: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(runKey(runId));
  localStorage.setItem(INDEX_KEY, JSON.stringify(listRuns().filter((r) => r.runId !== runId)));
}

export function createEmptyRunLog(profileId: string, seed: number, engineVersion: string): RunLog {
  return { runId: createRunId(), seed, profileId, engineVersion, turns: [] };
}
