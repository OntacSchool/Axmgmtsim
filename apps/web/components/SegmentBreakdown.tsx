'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CompanyState } from '@axsim/engine';
import { segmentTotalsArray } from '../lib/metrics';
import { segmentLabel } from '../lib/format';

const SEGMENT_COLOR: Record<string, string> = {
  public: 'var(--series-1)',
  enterprise: 'var(--series-2)',
  global: 'var(--series-3)',
  smb: 'var(--series-4)',
};

interface BarTooltipPayload {
  payload?: { segment: string; label: string; eok: number };
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: BarTooltipPayload[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  if (!item) return null;
  return (
    <div
      style={{
        background: 'var(--chart-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <div style={{ color: 'var(--chart-ink-secondary)' }}>{item.label}</div>
      <strong style={{ color: 'var(--chart-ink)' }}>{item.eok}억</strong>
    </div>
  );
}

export function SegmentBreakdown({ state }: { state: CompanyState }) {
  // Recharts 축·틱은 억 단위 정수로 넘긴다 — 원 단위 그대로 넘기면 축 눈금이 그 큰 수에
  // "억"을 붙인 문자열이 되어 좁은 축 너비에서 잘려 보인다.
  const data = segmentTotalsArray(state).map((d) => ({
    segment: d.segment,
    label: segmentLabel(d.segment),
    eok: Math.round(d.totalKRW / 1e8),
  }));

  if (data.every((d) => d.eok === 0)) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>아직 수주 실적이 없습니다.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 20, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'var(--chart-ink-secondary)' }}
          axisLine={{ stroke: 'var(--chart-axis)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--chart-ink-muted)' }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v: number) => `${v}억`}
        />
        <Tooltip content={<BarTooltip />} cursor={{ fill: 'var(--chart-grid)', opacity: 0.4 }} />
        <Bar dataKey="eok" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((d) => (
            <Cell key={d.segment} fill={SEGMENT_COLOR[d.segment]} />
          ))}
          <LabelList
            dataKey="eok"
            position="top"
            formatter={(v: unknown) => `${Number(v) || 0}억`}
            style={{ fill: 'var(--chart-ink-secondary)', fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
