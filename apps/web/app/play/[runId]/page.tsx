'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import {
  dealsInPeriod,
  talentsAvailable,
  targetsAvailable,
  type Decision,
  type Product,
} from '@axsim/engine';
import { getDataset } from '../../../lib/dataset';
import { useRun } from '../../../lib/useRun';
import { StateHeader } from '../../../components/StateHeader';
import { DealTable } from '../../../components/DealTable';
import { DecisionPanel } from '../../../components/DecisionPanel';
import { EventLog } from '../../../components/EventLog';

function describeDecision(d: Decision): string {
  switch (d.type) {
    case 'bid':
      return `입찰: ${d.dealId} (할인 ${(d.discountRate * 100).toFixed(0)}%${d.consortium ? ', 컨소시엄' : ''})`;
    case 'hire':
      return `영입: ${d.talentId}`;
    case 'acquire':
      return `인수: ${d.targetId} (${d.financing})`;
    case 'invest':
      return `투자: ${d.target}${d.cert ? ` ${d.cert}` : ''}${d.amountKRW ? ` ${(d.amountKRW / 1e8).toFixed(1)}억` : ''}`;
    case 'rnd':
      return `R&D: ${d.productId} ${(d.amountKRW / 1e8).toFixed(1)}억`;
    case 'recruit':
      return `채용: ${d.grade} ${d.count}명`;
    case 'layoff':
      return `감원: ${d.grade} ${d.count}명`;
    default:
      return '';
  }
}

export default function PlayPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const dataset = getDataset();
  const { state, lastResult, versionMismatch, submitTurn, notFound } = useRun(runId);
  const [staged, setStaged] = useState<Decision[]>([]);

  const deals = useMemo(() => (state ? dealsInPeriod(dataset, state.period) : []), [dataset, state]);

  const talents = useMemo(() => {
    if (!state) return [];
    const hired = new Set(state.hires.filter((h) => h.active).map((h) => h.talentId));
    return talentsAvailable(dataset, state.period).filter((t) => !hired.has(t.id));
  }, [dataset, state]);

  const targets = useMemo(() => {
    if (!state) return [];
    const owned = new Set(state.acquisitions.map((a) => a.targetId));
    return targetsAvailable(dataset, state.period).filter((t) => !owned.has(t.id));
  }, [dataset, state]);

  const launchedProducts: Product[] = useMemo(() => {
    if (!state) return [];
    return state.products
      .filter((p) => p.launched)
      .map((p) => dataset.products.find((d) => d.id === p.productId))
      .filter((p): p is Product => Boolean(p));
  }, [dataset, state]);

  const stagedDealIds = useMemo(
    () => new Set(staged.filter((d): d is Extract<Decision, { type: 'bid' }> => d.type === 'bid').map((d) => d.dealId)),
    [staged],
  );

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

  const finished = state.bankrupt || state.turn >= dataset.config.totalTurns;

  return (
    <main className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Link href="/" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          ← 홈
        </Link>
        <Link href={`/dashboard/${runId}`} style={{ fontSize: 13, color: 'var(--accent)' }}>
          대시보드 보기 →
        </Link>
      </div>

      {versionMismatch && (
        <div className="card" style={{ borderColor: 'var(--warn)', fontSize: 13, color: 'var(--warn)' }}>
          이 판은 다른 엔진 버전으로 저장되었습니다. 재생 결과가 다를 수 있습니다.
        </div>
      )}

      <StateHeader state={state} />

      {lastResult && lastResult.events.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0, fontSize: 14 }}>지난 분기 이벤트</h4>
          <EventLog events={lastResult.events} />
        </div>
      )}

      {finished ? (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <h3>{state.bankrupt ? '파산으로 종료' : '28분기 완주'}</h3>
          <Link href={`/dashboard/${runId}`} style={{ color: 'var(--accent)' }}>
            대시보드에서 결과 보기 →
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <h4 style={{ marginTop: 0, fontSize: 14 }}>공고 사업</h4>
            <DealTable
              deals={deals}
              state={state}
              launchedProducts={launchedProducts}
              maxDiscountRate={dataset.config.maxDiscountRate}
              stagedDealIds={stagedDealIds}
              onBid={(d) => setStaged((prev) => [...prev, d])}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <DecisionPanel
              dataset={dataset}
              state={state}
              talents={talents}
              targets={targets}
              onAdd={(d) => setStaged((prev) => [...prev, d])}
            />

            <div className="card">
              <h4 style={{ marginTop: 0, fontSize: 14 }}>이번 분기 결정 ({staged.length})</h4>
              {staged.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>담긴 결정이 없습니다.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {staged.map((d, i) => (
                    <li key={i} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span>{describeDecision(d)}</span>
                      <button
                        onClick={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--bad)', fontSize: 12 }}
                      >
                        취소
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={() => {
                  submitTurn(staged.length > 0 ? staged : [{ type: 'pass' }]);
                  setStaged([]);
                }}
                style={{
                  marginTop: 12,
                  width: '100%',
                  background: 'var(--good)',
                  color: '#0b0d10',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 0',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                다음 분기로 →
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
