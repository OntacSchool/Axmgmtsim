'use client';

/** compare.worker.ts 를 감싸는 훅 — 로딩·진행률·결과·에러를 React state 로 노출한다. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComparisonReport } from '@axsim/engine';
import type { CompareWorkerRequest, CompareWorkerResponse } from './compare.worker';

export interface CompareProgress {
  completed: number;
  total: number;
  label: string;
}

export interface UseCompareResult {
  running: boolean;
  progress: CompareProgress | null;
  report: ComparisonReport | null;
  error: string | null;
  run: (input: Omit<CompareWorkerRequest, 'type'>) => void;
}

export function useCompare(): UseCompareResult {
  const workerRef = useRef<Worker | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<CompareProgress | null>(null);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('./compare.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<CompareWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        setProgress({ completed: msg.completed, total: msg.total, label: msg.label });
      } else if (msg.type === 'done') {
        setReport(msg.report);
        setRunning(false);
      } else if (msg.type === 'error') {
        setError(msg.message);
        setRunning(false);
      }
    };
    worker.onerror = (event) => {
      setError(event.message || '알 수 없는 오류로 계산에 실패했습니다.');
      setRunning(false);
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const run = useCallback((input: Omit<CompareWorkerRequest, 'type'>) => {
    if (!workerRef.current) return;
    setRunning(true);
    setProgress(null);
    setReport(null);
    setError(null);
    const message: CompareWorkerRequest = { type: 'run', ...input };
    workerRef.current.postMessage(message);
  }, []);

  return { running, progress, report, error, run };
}
