import type { ActiveProject } from '@axsim/engine';
import { eok, segmentLabel } from '../lib/format';

const SEGMENT_COLOR: Record<string, string> = {
  public: 'var(--series-1)',
  enterprise: 'var(--series-2)',
  global: 'var(--series-3)',
  smb: 'var(--series-4)',
};

function ProjectRow({ project }: { project: ActiveProject }) {
  const progress = project.quartersWorked / project.totalQuarters;
  const color = SEGMENT_COLOR[project.segment] ?? 'var(--accent)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
      <span style={{ width: 44, color: 'var(--text-faint)', flexShrink: 0 }}>{segmentLabel(project.segment)}</span>
      <span
        style={{
          width: 140,
          flexShrink: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
        title={project.title}
      >
        {project.title}
      </span>
      <div
        style={{
          flex: 1,
          height: 14,
          borderRadius: 4,
          background: 'var(--chart-grid)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, progress * 100)}%`,
            height: '100%',
            background: color,
            borderRadius: 4,
          }}
        />
      </div>
      <span className="mono" style={{ width: 40, color: 'var(--text-dim)', flexShrink: 0, textAlign: 'right' }}>
        {project.quartersWorked}/{project.totalQuarters}Q
      </span>
      <span className="mono" style={{ width: 60, color: 'var(--text-dim)', flexShrink: 0, textAlign: 'right' }}>
        {eok(project.contractKRW)}
      </span>
    </div>
  );
}

export function ProjectPipeline({ projects }: { projects: ActiveProject[] }) {
  if (projects.length === 0) {
    return <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>현재 수행 중인 사업이 없습니다.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {projects.map((p) => (
        <ProjectRow key={p.dealId} project={p} />
      ))}
    </div>
  );
}
