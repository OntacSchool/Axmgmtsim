/**
 * AX 경영 시뮬레이션 — 핵심 타입 정의 (단일 진실 원천)
 *
 * 이 파일의 타입은 엔진 / 데이터 / CLI / (2차) 웹·모바일이 공유한다.
 * 엔진은 순수 함수로만 구성되며 상태 변경은 reduce.ts 의 리듀서를 통해서만 일어난다.
 */

/** 시장 세그먼트 */
export type Segment = 'public' | 'enterprise' | 'global' | 'smb';
export const SEGMENTS: Segment[] = ['public', 'enterprise', 'global', 'smb'];

/** 기술 도메인 */
export type Domain = 'ai' | 'data' | 'si' | 'edu' | 'cloud';
export const DOMAINS: Domain[] = ['ai', 'data', 'si', 'edu', 'cloud'];

/** 인력 등급 (공공 SW사업 대가기준의 특급/고급/중급/초급) */
export type Grade = 'principal' | 'senior' | 'mid' | 'junior';
export const GRADES: Grade[] = ['principal', 'senior', 'mid', 'junior'];

/** 자격·인증. 공공 입찰의 게이트 역할을 한다. */
export type Cert = 'swBusinessCert' | 'isms' | 'gsCert' | 'cmmi' | 'iso27001';

/** 기술평가 배점 항목 */
export type TechCriterion = '실적' | '인력' | '기술능력' | '관리방법' | '상생';
export const TECH_CRITERIA: TechCriterion[] = ['실적', '인력', '기술능력', '관리방법', '상생'];

/** 투자 대상 */
export type InvestTarget = 'rnd' | 'sales' | 'marketing' | 'cert' | 'training';

export type StaffMix = Partial<Record<Grade, number>>;

// ─────────────────────────────────────────────────────────────
// 시장 데이터 (외생 — packages/data 에서 주입)
// ─────────────────────────────────────────────────────────────

/** 사업 공고 카드. 실제 공공 제안요청서(RFP)의 평가 구조를 본떴다. */
export interface Deal {
  id: string;
  /** 공고가 열리는 분기. "2023Q1" 형식 */
  period: string;
  segment: Segment;
  /** 발주기관 / 발주사. 관계자본(relations)의 키가 된다. */
  agency: string;
  title: string;
  budgetKRW: number;
  /** 사업 수행 기간(분기). 매출은 이 기간에 걸쳐 분할 인식된다. */
  durationQuarters: number;
  domain: Domain[];
  requirements: DealRequirements;
  /** 기술 : 가격 배점 (합 100) */
  scoring: { tech: number; price: number };
  /** 기술평가 세부 배점 (합 100) */
  techWeights: Record<TechCriterion, number>;
  competition: {
    /** 경쟁사 수 */
    count: number;
    /** 경쟁 강도 0~1. 높을수록 경쟁사 기술점수 기대값이 높다. */
    strength: number;
  };
  /** 기존 수행사 프리미엄 0~1. 우리가 그 사업의 실적 보유자면 이 값을 가산받는다. */
  incumbentAdvantage: number;
  tags?: string[];
}

export interface DealRequirements {
  /** 없으면 입찰 자체가 불가능한 자격 (컨소시엄으로 보완 가능) */
  mandatoryCerts: Cert[];
  /** 요구 유사실적 */
  minTrackRecords: { domain: Domain; count: number; minAmountKRW: number } | null;
  /** 분기당 투입해야 하는 등급별 인력 */
  staffMix: StaffMix;
  /** 벤더 등록이 필요한 경우 (주로 대기업·글로벌 세그먼트의 게이트) */
  vendorRegistration?: string;
}

/** 인재 카드. 영입은 즉효약이 아니다 — rampQuarters 와 attritionRisk 가 핵심. */
export interface Talent {
  id: string;
  title: string;
  /** 등장 가능 시점. 이 분기 이전에는 영입 불가. */
  availableFrom: string;
  grade: Grade;
  cost: { signingKRW: number; quarterlyKRW: number };
  effects: TalentEffects;
  /** 효과가 100% 발현되기까지 걸리는 분기 수 */
  rampQuarters: number;
  /** 분기당 이탈 확률의 기준값 */
  attritionRisk: number;
  /** 조직 사기(morale)에 대한 민감도 0~1. 높을수록 사기가 낮을 때 잘 나간다. */
  cultureFitSensitivity: number;
}

export interface TalentEffects {
  channel?: Partial<Record<Segment, number>>;
  capability?: Partial<Record<Domain, number>>;
  relations?: Record<string, number>;
  /** 입찰 승률에 직접 가산되는 보정 (기술점수 환산 가점) */
  bidWinBonus?: number;
  /** 획득하는 벤더 등록 */
  vendorRegistrations?: string[];
  /** 수행 품질 보정 */
  deliveryQuality?: number;
  moraleDelta?: number;
}

/** M&A 대상 */
export interface AcquisitionTarget {
  id: string;
  name: string;
  availableFrom: string;
  priceKRW: number;
  brings: {
    annualRevenueKRW: number;
    headcount: StaffMix;
    certs: Cert[];
    trackRecords: InheritedTrackRecord[];
    channel: Partial<Record<Segment, number>>;
    capability: Partial<Record<Domain, number>>;
    relations?: Record<string, number>;
    vendorRegistrations?: string[];
    products: string[];
    /** 교차판매 모수가 되는 기존 고객 수 */
    customers: number;
  };
  pmi: {
    /** 통합 기간(분기). 이 동안 생산성 페널티가 걸린다. */
    integrationQuarters: number;
    /** 인수 직후 인력 이탈률 */
    attrition: number;
    /** 조직 문화 적합도 0~1. 낮으면 이탈·사기 하락이 커진다. */
    cultureFit: number;
    /** 인수대금 대비 통합 비용 비율 */
    costRate: number;
  };
}

/** 제품. 투자로 성숙도를 올리면 반복 매출이 붙고 입찰 기술점수도 오른다. */
export interface Product {
  id: string;
  name: string;
  domain: Domain[];
  /** 제품화에 필요한 누적 R&D 투자액 */
  rndToLaunchKRW: number;
  /** 출시 후 고객 1곳당 분기 반복매출 */
  arpuQuarterlyKRW: number;
  /** 보유 시 관련 도메인 입찰의 기술능력 점수 보정 0~1 */
  bidTechBonus: number;
  availableFrom: string;
}

/** 회사 시작 프로필 (자사형 / 가상형 모두 데이터로 표현) */
export interface CompanyProfile {
  id: string;
  name: string;
  description: string;
  startPeriod: string;
  cashKRW: number;
  staff: Record<Grade, number>;
  capability: Record<Domain, number>;
  channel: Record<Segment, number>;
  certs: Cert[];
  relations: Record<string, number>;
  vendorRegistrations: string[];
  trackRecords: InheritedTrackRecord[];
  /** 시작 시점에 수행 중인 사업. 회사는 진공에서 시작하지 않는다. */
  initialProjects: InitialProject[];
  brand: number;
  morale: number;
  techDebt: number;
}

/** 프로필 시작 시점에 이미 수행 중인 사업 */
export interface InitialProject {
  title: string;
  agency: string;
  segment: Segment;
  domain: Domain[];
  contractKRW: number;
  totalQuarters: number;
  quartersLeft: number;
}

export interface InheritedTrackRecord {
  domain: Domain;
  segment: Segment;
  amountKRW: number;
  agency: string;
  /** 수행 품질 0~1 */
  quality: number;
}

/** 엔진에 주입되는 전체 데이터셋 */
export interface Dataset {
  deals: Deal[];
  talents: Talent[];
  targets: AcquisitionTarget[];
  products: Product[];
  profiles: CompanyProfile[];
  /** 밸런싱 계수 */
  config: SimConfig;
}

export interface SimConfig {
  /** 시뮬레이션 총 턴 수 */
  totalTurns: number;
  /** 등급별 분기 인건비 */
  quarterlyCostByGrade: Record<Grade, number>;
  /** 등급별 일반 채용 비용 (1인) */
  recruitCostByGrade: Record<Grade, number>;
  /** 분기 고정 간접비 */
  fixedOverheadKRW: number;
  /** 인건비 대비 간접비 배수 */
  overheadRate: number;
  /** 입찰 제안 비용 (예산 대비 비율) */
  proposalCostRate: number;
  /** 사업 원가율 (계약금액 대비 직접 외주·재료비) */
  directCostRate: number;
  /** 최대 허용 할인율 */
  maxDiscountRate: number;
  /** 파산 판정: 현금이 이 값 미만인 상태가 연속 N분기 */
  bankruptcyCashKRW: number;
  bankruptcyQuarters: number;
  /** 자격 취득 비용 */
  certCostKRW: Record<Cert, number>;
  /** 자격 취득 소요 분기 */
  certLeadQuarters: number;
}

// ─────────────────────────────────────────────────────────────
// 회사 상태
// ─────────────────────────────────────────────────────────────

export interface TrackRecord extends InheritedTrackRecord {
  dealId: string;
  completedPeriod: string;
}

/** 수행 중인 사업 */
export interface ActiveProject {
  dealId: string;
  title: string;
  agency: string;
  segment: Segment;
  domain: Domain[];
  /** 계약금액 (예산 × (1 − 할인율)) */
  contractKRW: number;
  totalQuarters: number;
  quartersLeft: number;
  staffMix: StaffMix;
  /** 지금까지 누적된 품질 합 (완료 시 분기수로 나눠 평균 품질을 낸다) */
  qualityAcc: number;
  quartersWorked: number;
}

/** 영입된 인재의 런타임 상태 */
export interface HiredTalent {
  talentId: string;
  hiredPeriod: string;
  /** 0~1. rampQuarters 에 걸쳐 1로 수렴한다. */
  ramp: number;
  active: boolean;
  leftPeriod?: string;
}

/** 인수한 회사의 런타임 상태 */
export interface AcquisitionState {
  targetId: string;
  acquiredPeriod: string;
  /** 남은 통합 기간 */
  integrationLeft: number;
  /** 승계된 고객 중 아직 교차판매되지 않은 수 */
  customersRemaining: number;
  /** 승계 매출의 분기 환산액 (통합 기간 중 이탈로 감소) */
  quarterlyRevenueKRW: number;
}

export interface ProductState {
  productId: string;
  rndInvestedKRW: number;
  launched: boolean;
  launchedPeriod?: string;
  /** 유료 고객 수 */
  customers: number;
}

export interface PendingCert {
  cert: Cert;
  quartersLeft: number;
}

export interface CompanyState {
  profileId: string;
  period: string;
  turn: number;
  cashKRW: number;
  debtKRW: number;
  staff: Record<Grade, number>;
  morale: number;
  capability: Record<Domain, number>;
  channel: Record<Segment, number>;
  certs: Cert[];
  pendingCerts: PendingCert[];
  trackRecords: TrackRecord[];
  relations: Record<string, number>;
  vendorRegistrations: string[];
  products: ProductState[];
  projects: ActiveProject[];
  hires: HiredTalent[];
  acquisitions: AcquisitionState[];
  brand: number;
  techDebt: number;
  bankrupt: boolean;
  /** 현금이 파산 기준 아래인 연속 분기 수 */
  distressQuarters: number;
  /** 분기별 요약 기록 */
  history: TurnSummary[];
}

// ─────────────────────────────────────────────────────────────
// 결정 (플레이어 입력)
// ─────────────────────────────────────────────────────────────

export type Decision =
  | { type: 'bid'; dealId: string; discountRate: number; consortium: boolean }
  | { type: 'hire'; talentId: string }
  | { type: 'recruit'; grade: Grade; count: number }
  | { type: 'layoff'; grade: Grade; count: number }
  | { type: 'invest'; target: InvestTarget; amountKRW: number; domain?: Domain; segment?: Segment; cert?: Cert }
  | { type: 'rnd'; productId: string; amountKRW: number }
  | { type: 'acquire'; targetId: string; financing: 'cash' | 'debt' | 'mixed' }
  | { type: 'pass' };

// ─────────────────────────────────────────────────────────────
// 결과 / 이벤트
// ─────────────────────────────────────────────────────────────

export type SimEventKind =
  | 'bid.won' | 'bid.lost' | 'bid.blocked'
  | 'project.completed' | 'project.quality'
  | 'hire.joined' | 'hire.left'
  | 'acquire.done' | 'acquire.integrated'
  | 'product.launched'
  | 'cert.acquired'
  | 'finance.quarter'
  | 'company.bankrupt';

export interface SimEvent {
  kind: SimEventKind;
  period: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface TurnSummary {
  period: string;
  turn: number;
  revenueKRW: number;
  costKRW: number;
  profitKRW: number;
  cashKRW: number;
  backlogKRW: number;
  headcount: number;
  bidsSubmitted: number;
  bidsWon: number;
  trackRecordCount: number;
  utilization: number;
}

/** 적합도 계산 결과. 화면에 그대로 보여줄 수 있도록 세부 점수를 모두 담는다. */
export interface FitResult {
  dealId: string;
  /** 필수자격을 충족했는가 */
  gate: boolean;
  gateReason?: string;
  /** 항목별 0~1 점수 */
  breakdown: Record<TechCriterion, number>;
  /** 가중 합산 기술점수 0~100 */
  techScore: number;
  /** 관계자본 보너스 0~100 스케일 */
  relationBonus: number;
  /** 최종 기술 환산점수 0~100 */
  fitScore: number;
}

export interface BidOutcome {
  dealId: string;
  won: boolean;
  fit: FitResult;
  myTotal: number;
  bestCompetitor: number;
  proposalCostKRW: number;
  contractKRW: number;
}

/** 한 턴 진행 결과 */
export interface TurnResult {
  state: CompanyState;
  events: SimEvent[];
  bids: BidOutcome[];
  summary: TurnSummary;
}
