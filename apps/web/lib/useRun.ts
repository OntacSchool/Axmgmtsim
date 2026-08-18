'use client';

/**
 * 한 판의 상태를 React 에 연결하는 훅.
 *
 * React state 는 CompanyState 가 아니라 RunLog(결정 로그) 를 들고, 화면에 쓰는
 * CompanyState 는 매번 replay() 로 파생시킨다. 28분기짜리 한 판을 재생하는 비용은
 * 수 밀리초 수준이라 매 턴마다 처음부터 다시 재생해도 체감 지연이 없다 — 그 대가로
 * "상태"와 "그 상태를 만든 결정들"이 항상 정확히 일치한다는 것을 무료로 얻는다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ENGINE_VERSION, replay, type CompanyState, type Decision, type RunLog, type TurnResult } from '@axsim/engine';
import { getDataset } from './dataset';
import { loadRun, saveRun, type RunMeta } from './storage';

export interface UseRunResult {
  log: RunLog | null;
  state: CompanyState | null;
  results: TurnResult[];
  /** 가장 최근에 진행된 턴의 결과 (이벤트 로그 표시용). 아직 한 턴도 안 돌았으면 null. */
  lastResult: TurnResult | null;
  versionMismatch: boolean;
  submitTurn: (decisions: Decision[]) => void;
  notFound: boolean;
}

function profileName(dataset: ReturnType<typeof getDataset>, profileId: string): string {
  return dataset.profiles.find((p) => p.id === profileId)?.name ?? profileId;
}

export function useRun(runId: string): UseRunResult {
  const dataset = getDataset();
  const [log, setLog] = useState<RunLog | null>(null);
  const [notFound, setNotFound] = useState(false);

  // 최초 마운트 시 localStorage 에서 불러온다 (서버 렌더 시점엔 localStorage 가 없다).
  useEffect(() => {
    const found = loadRun(runId);
    if (found) setLog(found);
    else setNotFound(true);
  }, [runId]);

  const { state, results } = useMemo(() => {
    if (!log) return { state: null, results: [] as TurnResult[] };
    return replay(log, dataset);
  }, [log, dataset]);

  // 상태가 바뀔 때마다 저장한다 (RunLog 원본 + 화면 목록용 요약 meta).
  useEffect(() => {
    if (!log || !state) return;
    saveRun(log, {
      profileName: profileName(dataset, log.profileId),
      period: state.period,
      turn: state.turn,
      cashKRW: state.cashKRW,
      bankrupt: state.bankrupt,
      updatedAt: new Date().toISOString(),
    } satisfies Omit<RunMeta, 'runId' | 'profileId' | 'seed' | 'engineVersion'>);
  }, [log, state, dataset]);

  const submitTurn = useCallback((decisions: Decision[]) => {
    setLog((prev) => {
      if (!prev) return prev;
      return { ...prev, turns: [...prev.turns, { turn: prev.turns.length, decisions }] };
    });
  }, []);

  return {
    log,
    state,
    results,
    lastResult: results.length > 0 ? results[results.length - 1] : null,
    versionMismatch: log !== null && log.engineVersion !== ENGINE_VERSION,
    submitTurn,
    notFound,
  };
}
