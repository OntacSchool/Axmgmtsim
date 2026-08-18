import type { SimEvent, SimEventKind } from '@axsim/engine';

const TONE: Partial<Record<SimEventKind, 'good' | 'bad' | 'warn'>> = {
  'bid.won': 'good',
  'bid.lost': 'bad',
  'bid.blocked': 'warn',
  'project.completed': 'good',
  'hire.left': 'bad',
  'acquire.done': 'good',
  'cert.acquired': 'good',
  'company.bankrupt': 'bad',
};

export function EventLog({ events }: { events: SimEvent[] }) {
  if (events.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>이번 분기 이벤트가 없습니다.</p>;
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((e, i) => {
        const tone = TONE[e.kind];
        return (
          <li
            key={i}
            style={{
              fontSize: 13,
              padding: '6px 10px',
              borderLeft: `3px solid ${tone ? `var(--${tone})` : 'var(--border)'}`,
              background: 'var(--surface-2)',
              borderRadius: 4,
            }}
          >
            {e.message}
          </li>
        );
      })}
    </ul>
  );
}
