/**
 * 시드 데이터 검증 스키마.
 *
 * 엔진의 타입(packages/engine/src/types.ts)과 1:1로 대응한다. 나중에 나라장터
 * 실데이터 파이프라인을 붙일 때 이 스키마가 계약(contract) 역할을 한다 —
 * 어떤 소스에서 오든 여기를 통과해야 엔진에 들어간다.
 */

import { z } from 'zod';

export const periodSchema = z
  .string()
  .regex(/^\d{4}Q[1-4]$/, '분기는 "2023Q1" 형식이어야 합니다');

export const segmentSchema = z.enum(['public', 'enterprise', 'global', 'smb']);
export const domainSchema = z.enum(['ai', 'data', 'si', 'edu', 'cloud']);
export const gradeSchema = z.enum(['principal', 'senior', 'mid', 'junior']);
export const certSchema = z.enum(['swBusinessCert', 'isms', 'gsCert', 'cmmi', 'iso27001']);

export const staffMixSchema = z.record(gradeSchema, z.number().int().nonnegative()).default({});

export const techWeightsSchema = z
  .object({
    실적: z.number().nonnegative(),
    인력: z.number().nonnegative(),
    기술능력: z.number().nonnegative(),
    관리방법: z.number().nonnegative(),
    상생: z.number().nonnegative(),
  })
  .refine((w) => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 100) < 0.01, {
    message: '기술평가 배점의 합은 100이어야 합니다',
  });

export const dealSchema = z.object({
  id: z.string().min(1),
  period: periodSchema,
  segment: segmentSchema,
  agency: z.string().min(1),
  title: z.string().min(1),
  budgetKRW: z.number().positive(),
  durationQuarters: z.number().int().min(1).max(12),
  domain: z.array(domainSchema).min(1),
  requirements: z.object({
    mandatoryCerts: z.array(certSchema),
    minTrackRecords: z
      .object({
        domain: domainSchema,
        count: z.number().int().nonnegative(),
        minAmountKRW: z.number().nonnegative(),
      })
      .nullable(),
    staffMix: staffMixSchema,
    vendorRegistration: z.string().optional(),
  }),
  scoring: z
    .object({ tech: z.number().nonnegative(), price: z.number().nonnegative() })
    .refine((s) => Math.abs(s.tech + s.price - 100) < 0.01, {
      message: '기술:가격 배점의 합은 100이어야 합니다',
    }),
  techWeights: techWeightsSchema,
  competition: z.object({
    count: z.number().int().nonnegative(),
    strength: z.number().min(0).max(1),
  }),
  incumbentAdvantage: z.number().min(0).max(1),
  tags: z.array(z.string()).optional(),
});

export const talentEffectsSchema = z.object({
  channel: z.record(segmentSchema, z.number()).optional(),
  capability: z.record(domainSchema, z.number()).optional(),
  relations: z.record(z.string(), z.number()).optional(),
  bidWinBonus: z.number().min(0).max(0.3).optional(),
  vendorRegistrations: z.array(z.string()).optional(),
  deliveryQuality: z.number().min(-0.3).max(0.3).optional(),
  moraleDelta: z.number().optional(),
});

export const talentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  availableFrom: periodSchema,
  grade: gradeSchema,
  cost: z.object({
    signingKRW: z.number().nonnegative(),
    quarterlyKRW: z.number().nonnegative(),
  }),
  effects: talentEffectsSchema,
  rampQuarters: z.number().int().min(0).max(8),
  attritionRisk: z.number().min(0).max(0.5),
  cultureFitSensitivity: z.number().min(0).max(1),
});

export const inheritedTrackRecordSchema = z.object({
  domain: domainSchema,
  segment: segmentSchema,
  amountKRW: z.number().nonnegative(),
  agency: z.string().min(1),
  quality: z.number().min(0).max(1),
});

export const acquisitionTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  availableFrom: periodSchema,
  priceKRW: z.number().positive(),
  brings: z.object({
    annualRevenueKRW: z.number().nonnegative(),
    headcount: staffMixSchema,
    certs: z.array(certSchema),
    trackRecords: z.array(inheritedTrackRecordSchema),
    channel: z.record(segmentSchema, z.number().min(0).max(100)),
    capability: z.record(domainSchema, z.number().min(0).max(100)),
    relations: z.record(z.string(), z.number().min(0).max(100)).optional(),
    vendorRegistrations: z.array(z.string()).optional(),
    products: z.array(z.string()),
    customers: z.number().int().nonnegative(),
  }),
  pmi: z.object({
    integrationQuarters: z.number().int().min(0).max(8),
    attrition: z.number().min(0).max(1),
    cultureFit: z.number().min(0).max(1),
    costRate: z.number().min(0).max(1),
  }),
});

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.array(domainSchema).min(1),
  rndToLaunchKRW: z.number().positive(),
  arpuQuarterlyKRW: z.number().nonnegative(),
  bidTechBonus: z.number().min(0).max(0.3),
  availableFrom: periodSchema,
});

export const initialProjectSchema = z.object({
  title: z.string().min(1),
  agency: z.string().min(1),
  segment: segmentSchema,
  domain: z.array(domainSchema).min(1),
  contractKRW: z.number().positive(),
  totalQuarters: z.number().int().min(1),
  quartersLeft: z.number().int().min(1),
});

export const companyProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    startPeriod: periodSchema,
    cashKRW: z.number(),
    staff: z.object({
      principal: z.number().int().nonnegative(),
      senior: z.number().int().nonnegative(),
      mid: z.number().int().nonnegative(),
      junior: z.number().int().nonnegative(),
    }),
    capability: z.object({
      ai: z.number().min(0).max(100),
      data: z.number().min(0).max(100),
      si: z.number().min(0).max(100),
      edu: z.number().min(0).max(100),
      cloud: z.number().min(0).max(100),
    }),
    channel: z.object({
      public: z.number().min(0).max(100),
      enterprise: z.number().min(0).max(100),
      global: z.number().min(0).max(100),
      smb: z.number().min(0).max(100),
    }),
    certs: z.array(certSchema),
    relations: z.record(z.string(), z.number().min(0).max(100)),
    vendorRegistrations: z.array(z.string()),
    trackRecords: z.array(inheritedTrackRecordSchema),
    initialProjects: z.array(initialProjectSchema),
    brand: z.number().min(0).max(100),
    morale: z.number().min(0).max(100),
    techDebt: z.number().min(0).max(100),
  })
  .refine((p) => p.initialProjects.every((ip) => ip.quartersLeft <= ip.totalQuarters), {
    message: '남은 기간이 총 기간보다 길 수 없습니다',
  });

export const simConfigSchema = z.object({
  totalTurns: z.number().int().min(1),
  quarterlyCostByGrade: z.record(gradeSchema, z.number().positive()),
  recruitCostByGrade: z.record(gradeSchema, z.number().nonnegative()),
  fixedOverheadKRW: z.number().nonnegative(),
  overheadRate: z.number().min(0).max(2),
  proposalCostRate: z.number().min(0).max(0.2),
  directCostRate: z.number().min(0).max(0.8),
  maxDiscountRate: z.number().min(0).max(0.5),
  bankruptcyCashKRW: z.number(),
  bankruptcyQuarters: z.number().int().min(1),
  certCostKRW: z.record(certSchema, z.number().nonnegative()),
  certLeadQuarters: z.number().int().min(0),
});

export const datasetSchema = z.object({
  deals: z.array(dealSchema),
  talents: z.array(talentSchema),
  targets: z.array(acquisitionTargetSchema),
  products: z.array(productSchema),
  profiles: z.array(companyProfileSchema).min(1),
  config: simConfigSchema,
});
