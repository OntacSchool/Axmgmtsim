'use client';

import Link from 'next/link';
import { use } from 'react';
import { DOMAINS, SEGMENTS } from '@axsim/engine';
import { useRun } from '../../../lib/useRun';
import { eok, pct } from '../../../lib/format';
import { TurnTimeline } from '../../../components/TurnTimeline';
import { SegmentBreakdown } from '../../../components/SegmentBreakdown';
import { ProjectPipeline } from '../../../components/ProjectPipeline';

export default function DashboardPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const { state, notFound } = useRun(runId);

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

  const totalRevenue = state.history.reduce((s, h) => s + h.revenueKRW, 0);
  const peakRevenue = Math.max(0, ...state.history.map((h) => h.revenueKRW));
  const totalBids = state.history.reduce((s, h) => s + h.bidsSubmitted, 0);
  const totalWon = state.history.reduce((s, h) => s + h.bidsWon, 0);

  return (
    <main className="container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Link href="/" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            ← 홈
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>
            {state.period} 시점 대시보드{' '}
            {state.bankrupt && <span style={{ color: 'var(--bad)', fontSize: 16 }}>(파산)</span>}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href={`/play/${runId}`} style={{ fontSize: 13, color: 'var(--accent)' }}>
            플레이로 돌아가기 →
          </Link>
          <Link href={`/compare/${runId}`} style={{ fontSize: 13, color: 'var(--accent)' }}>
            반사실 분석 →
          </Link>
        </div>
      </div>

      <div className="grid-3">
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>누적 매출</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{eok(totalRevenue, 0)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>최고 분기매출</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{eok(peakRevenue)}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>입찰 승률</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>
            {totalBids > 0 ? pct(totalWon / totalBids) : '—'}
            <span style={{ fontSize: 13, color: 'var(--text-faint)', marginLeft: 6 }}>
              ({totalWon}/{totalBids})
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>분기별 매출·현금</h3>
        <TurnTimeline history={state.history} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>세그먼트별 수주 규모</h3>
          <SegmentBreakdown state={state} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>보유 역량 · 채널</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>역량</div>
              {DOMAINS.map((d) => (
                <MiniBar key={d} label={d} value={state.capability[d]} color="var(--series-1)" />
              ))}
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 6 }}>채널</div>
              {SEGMENTS.map((s) => (
                <MiniBar key={s} label={s} value={state.channel[s]} color="var(--series-2)" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>수행 중 사업</h3>
        <ProjectPipeline projects={state.projects} />
      </div>
    </main>
  );
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
      <span style={{ width: 60, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--chart-grid)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color }} />
      </div>
      <span className="mono" style={{ width: 28, textAlign: 'right', color: 'var(--text-dim)' }}>
        {value.toFixed(0)}
      </span>
    </div>
  );
}
