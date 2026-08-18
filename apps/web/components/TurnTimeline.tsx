'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TurnSummary } from '@axsim/engine';
import { eok } from '../lib/format';

interface TooltipPayloadItem {
  color?: string;
  name?: string;
  value?: number;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
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
      <div style={{ color: 'var(--chart-ink-secondary)', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ display: 'inline-block', width: 10, height: 2, background: p.color }} />
          <span style={{ color: 'var(--chart-ink-secondary)' }}>{p.name}</span>
          <strong style={{ marginLeft: 'auto', color: 'var(--chart-ink)' }}>{eok(p.value ?? 0)}</strong>
        </div>
      ))}
    </div>
  );
}

export function TurnTimeline({ history }: { history: TurnSummary[] }) {
  if (history.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>아직 진행된 분기가 없습니다.</p>;
  }

  const data = history.map((h) => ({
    period: h.period,
    매출: Math.round(h.revenueKRW / 1e8),
    현금: Math.round(h.cashKRW / 1e8),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: 11, fill: 'var(--chart-ink-muted)' }}
          axisLine={{ stroke: 'var(--chart-axis)' }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--chart-ink-muted)' }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v: number) => `${v}억`}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--chart-ink-secondary)' }} />
        <Line type="monotone" dataKey="매출" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        <Line type="monotone" dataKey="현금" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
