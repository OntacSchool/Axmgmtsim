'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { STRATEGY_PRESETS, buildVariants } from '@axsim/engine';
import { getDataset } from '../../../lib/dataset';
import { useRun } from '../../../lib/useRun';
import { useCompare } from '../../../lib/worker/useCompare';
import { VariantCompare } from '../../../components/VariantCompare';

const STRATEGY_KEYS = Object.keys(STRATEGY_PRESETS);

export default function ComparePage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const dataset = getDataset();
  const { state, notFound } = useRun(runId);
  const { running, progress, report, error, run } = useCompare();

  const [strategyKey, setStrategyKey] = useState('balanced');
  const [runs, setRuns] = useState(100);
  const [horizon, setHorizon] = useState(12);

  const variants = useMemo(() => (state ? buildVariants(dataset, state) : []), [dataset, state]);

  if (notFound) {
    return (
      <main className="container">
        <p>판을 찾을 수 없습니다.</p>
        <Link href="/">홈으로</Link>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="container">
        <p style={{ color: 'var(--text-faint)' }}>불러오는 중…</p>
      </main>
    );
  }

  function handleRun() {
    if (!state) return;
    run({ snapshot: state, variants, strategyKey, horizon, runs, seed: 20260818 });
  }

  return (
    <main className="container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          ← 홈
        </Link>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href={`/play/${runId}`} style={{ fontSize: 13, color: 'var(--accent)' }}>
            플레이 →
          </Link>
          <Link href={`/dashboard/${runId}`} style={{ fontSize: 13, color: 'var(--accent)' }}>
            대시보드 →
          </Link>
        </div>
      </div>

      <div>
        <h1 style={{ margin: '0 0 4px' }}>반사실 분석</h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: 0 }}>
          {state.period} 시점 · 현금 {(state.cashKRW / 1e8).toFixed(1)}억 · 실적 {state.trackRecords.length}건 —
          지금 실제로 가능한 선택지를 골라 이후 전략적으로 어떻게 달라지는지 비교합니다.
        </p>
      </div>

      {variants.length < 2 ? (
        <div className="card" style={{ color: 'var(--text-faint)', fontSize: 13 }}>
          비교할 선택지가 없습니다. 이 시점에는 인수 가능한 대상이 없습니다 — 판을 더 진행해 보세요.
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0 }}>비교 설정</h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              이후 전략
              <select value={strategyKey} onChange={(e) => setStrategyKey(e.target.value)}>
                {STRATEGY_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {STRATEGY_PRESETS[k].name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              진행 분기
              <input
                type="number"
                min={4}
                max={28}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                style={{ width: 60 }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              변형당 시뮬레이션 횟수
              <input
                type="number"
                min={20}
                max={500}
                step={20}
                value={runs}
                onChange={(e) => setRuns(Number(e.target.value))}
                style={{ width: 70 }}
              />
            </label>
            <button
              onClick={handleRun}
              disabled={running}
              style={{
                background: running ? 'var(--surface-2)' : 'var(--accent)',
                color: running ? 'var(--text-faint)' : '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '8px 18px',
                fontWeight: 600,
                fontSize: 13,
                cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              {running ? '계산 중…' : '비교 실행'}
            </button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>
            선택지: {variants.map((v) => v.label).join(' · ')}
          </p>
        </div>
      )}

      {running && progress && (
        <div className="card" style={{ fontSize: 13 }}>
          <div style={{ marginBottom: 6 }}>
            계산 중 ({progress.completed}/{progress.total}) — {progress.label}
          </div>
          <div style={{ height: 6, background: 'var(--chart-grid)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(progress.completed / progress.total) * 100}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width 0.2s',
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="card" style={{ color: 'var(--bad)', fontSize: 13 }}>
          계산 실패: {error}
        </div>
      )}

      {report && <VariantCompare report={report} />}
    </main>
  );
}
