import type { SimEvent, SimEventKind } from '@axsim/engine';

const STYLE: Partial<Record<SimEventKind, { icon: string; color: string; bg: string }>> = {
  'bid.won': { icon: '🏆', color: 'var(--game-win)', bg: 'var(--game-win-bg)' },
  'bid.lost': { icon: '📉', color: 'var(--text-dim)', bg: 'var(--chart-grid)' },
  'bid.blocked': { icon: '🔒', color: 'var(--game-gold)', bg: 'var(--game-gold-bg)' },
  'project.completed': { icon: '✅', color: 'var(--game-win)', bg: 'var(--game-win-bg)' },
  'hire.joined': { icon: '🙌', color: 'var(--game-info)', bg: 'var(--game-info-bg)' },
  'hire.left': { icon: '👋', color: 'var(--bad)', bg: 'var(--game-danger-bg)' },
  'acquire.done': { icon: '🤝', color: 'var(--game-win)', bg: 'var(--game-win-bg)' },
  'acquire.integrated': { icon: '🏢', color: 'var(--game-info)', bg: 'var(--game-info-bg)' },
  'product.launched': { icon: '🚀', color: 'var(--game-win)', bg: 'var(--game-win-bg)' },
  'cert.acquired': { icon: '📜', color: 'var(--game-gold)', bg: 'var(--game-gold-bg)' },
  'company.bankrupt': { icon: '💥', color: 'var(--bad)', bg: 'var(--game-danger-bg)' },
};

const DEFAULT_STYLE = { icon: '📋', color: 'var(--text-dim)', bg: 'var(--chart-grid)' };

export function EventLog({ events }: { events: SimEvent[] }) {
  if (events.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>이번 분기 이벤트가 없습니다.</p>;
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {events.map((e, i) => {
        const s = STYLE[e.kind] ?? DEFAULT_STYLE;
        return (
          <li
            key={i}
            className="game-slide-down"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              padding: '8px 12px',
              background: s.bg,
              borderRadius: 10,
              animationDelay: `${i * 60}ms`,
              animationFillMode: 'backwards',
            }}
          >
            <span style={{ fontSize: 17, flexShrink: 0 }}>{s.icon}</span>
            <span style={{ color: 'var(--text)' }}>{e.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
