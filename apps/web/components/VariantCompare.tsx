import type { ComparisonReport, Distribution } from '@axsim/engine';
import { eok, pct } from '../lib/format';
import { buildInterpretation } from '../lib/interpret';

const SERIES_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

/**
 * 분포 구간 막대(P10–중앙–P90). 라이브러리 차트로는 표현하기 애매한 형태라
 * (스킬 문서에서도 이런 경우는 직접 그려도 된다고 본다) HTML/CSS 로 직접 그린다.
 */
function RangeBar({ dist, max, color }: { dist: Distribution; max: number; color: string }) {
  const toPct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ position: 'relative', height: 18, background: 'var(--chart-grid)', borderRadius: 4 }}>
        <div
          style={{
            position: 'absolute',
            left: toPct(dist.p10),
            width: `calc(${toPct(dist.p90)} - ${toPct(dist.p10)})`,
            top: 0,
            bottom: 0,
            background: color,
            opacity: 0.35,
            borderRadius: 4,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: toPct(dist.median),
            top: -2,
            bottom: -2,
            width: 3,
            background: color,
            borderRadius: 2,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--chart-ink-muted)' }}>
        <span>P10 {eok(dist.p10, 0)}</span>
        <span style={{ color: 'var(--chart-ink)', fontWeight: 600 }}>중앙 {eok(dist.median, 0)}</span>
        <span>P90 {eok(dist.p90, 0)}</span>
      </div>
    </div>
  );
}

export function VariantCompare({ report }: { report: ComparisonReport }) {
  const maxRevenue = Math.max(...report.variants.map((v) => v.cumulativeRevenue.p90), 1);
  const interpretation = buildInterpretation(report);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
        목표: {report.milestone.label} · 이후 {report.horizon}분기 · 변형당 {report.seeds}판
      </p>

      {report.variants.map((v, i) => (
        <div key={v.label} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <h4 style={{ margin: 0 }}>{v.label}</h4>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-dim)' }}>
              <span>
                파산 확률{' '}
                <strong style={{ color: v.bankruptcyRate > 0.15 ? 'var(--bad)' : 'var(--text)' }}>
                  {pct(v.bankruptcyRate, 1)}
                </strong>
              </span>
              <span>
                목표 달성 <strong style={{ color: 'var(--text)' }}>{pct(v.milestoneAchievedRate, 1)}</strong>
                {v.milestoneAchievedRate > 0 && ` (중앙 ${v.quartersToMilestone.median.toFixed(0)}분기)`}
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>누적 매출</div>
            <RangeBar dist={v.cumulativeRevenue} max={maxRevenue} color={SERIES_COLORS[i % SERIES_COLORS.length]} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            최종 현금 중앙 {eok(v.finalCash.median, 0)} (P10 {eok(v.finalCash.p10, 0)} / P90 {eok(v.finalCash.p90, 0)}) · 실적
            건수 중앙 {v.trackRecords.median.toFixed(0)}건
          </div>
        </div>
      ))}

      {interpretation.length > 0 && (
        <div className="card">
          <h4 style={{ marginTop: 0 }}>해석</h4>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {interpretation.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
