/** 표시 포맷 헬퍼 — CLI 의 apps/cli/src/format.ts 와 같은 규칙을 웹에서도 쓴다. */

export function eok(krw: number, digits = 1): string {
  return `${(krw / 1e8).toFixed(digits)}억`;
}

export function pct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

const GRADE_LABEL: Record<string, string> = {
  principal: '특급',
  senior: '고급',
  mid: '중급',
  junior: '초급',
};

export function gradeLabel(grade: string): string {
  return GRADE_LABEL[grade] ?? grade;
}

const SEGMENT_LABEL: Record<string, string> = {
  public: '공공',
  enterprise: '대기업',
  global: '글로벌',
  smb: '중소',
};

export function segmentLabel(segment: string): string {
  return SEGMENT_LABEL[segment] ?? segment;
}

const DOMAIN_LABEL: Record<string, string> = {
  ai: 'AI',
  data: '데이터',
  si: 'SI',
  edu: '교육',
  cloud: '클라우드',
};

export function domainLabel(domain: string): string {
  return DOMAIN_LABEL[domain] ?? domain;
}

export function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars - 1) + '…';
}
