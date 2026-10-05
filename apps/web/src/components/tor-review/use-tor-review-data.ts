'use client';

import { useEffect, useState } from 'react';
import type { Procurement } from '@torfun/types';
import { ApiError, fetchTor } from '@/lib/api';

export type TorReviewData = {
  projectId: string;
  title: string;
  agency: string;
  location: null;
  budget: number | null;
  status: string;
  technologies: string[];
  summary: string | null;
  objectives: string[];
  scope: string[];
  bidderQualifications: string[];
  announcementDate: string | null;
  submissionDeadline: string | null;
  procurementMethod: string | null;
  fiscalYear: number;
  referencePrice: number | null;
  durationDays: number | null;
  platforms: string[];
  confidence: 'high' | 'low' | null;
  matchScore: number | null;
};

export interface TorReviewState {
  projectId: string | null;
  data: TorReviewData | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
}

const STATUS_LABELS: Record<Procurement['status'], string> = {
  drafting_tor: 'จัดทำ TOR',
  requisition: 'รายงานขอซื้อขอจ้าง',
  invitation: 'เปิดรับข้อเสนอ',
  award_announced: 'ประกาศผลผู้ชนะ',
  contracted: 'จัดทำสัญญา/บริหารสัญญา',
  cancelled: 'ยกเลิกโครงการ',
  unknown: 'สถานะไม่ทราบ',
};

function toReviewData(procurement: Procurement): TorReviewData {
  const analysis = procurement.analysis;
  return {
    projectId: procurement.projectId,
    title: procurement.projectName,
    agency: procurement.deptName,
    location: null,
    budget: procurement.projectMoney,
    status: STATUS_LABELS[procurement.status],
    technologies: analysis?.techStack ?? [],
    summary: analysis?.summary ?? null,
    objectives: [],
    scope: analysis?.scopeOfWork ?? [],
    bidderQualifications: analysis?.requiredQualifications ?? [],
    announcementDate: procurement.announceDate,
    submissionDeadline: analysis?.deadlineAt ?? null,
    procurementMethod: procurement.purchaseMethodName,
    fiscalYear: procurement.year,
    referencePrice: procurement.priceBuild,
    durationDays: analysis?.durationDays ?? null,
    platforms: analysis?.targetPlatforms ?? [],
    confidence: analysis?.confidence ?? null,
    matchScore: null,
  };
}

export function useTorReviewData(projectId: string): TorReviewState {
  const [state, setState] = useState<TorReviewState>({
    projectId: null,
    data: null,
    loading: true,
    notFound: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetchTor(projectId).then(
      (procurement) => {
        if (cancelled) return;
        setState({
          projectId,
          data: toReviewData(procurement),
          loading: false,
          notFound: false,
          error: null,
        });
      },
      (caught: unknown) => {
        if (cancelled) return;
        const notFound = caught instanceof ApiError && caught.status === 404;
        setState({
          projectId,
          data: null,
          loading: false,
          notFound,
          error: notFound ? null : caught instanceof ApiError ? caught.message : 'โหลดข้อมูล TOR ไม่สำเร็จ',
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return {
    ...state,
    projectId: state.projectId === projectId ? state.projectId : projectId,
    data: state.projectId === projectId ? state.data : null,
    loading: state.projectId !== projectId || state.loading,
    notFound: state.projectId === projectId && state.notFound,
    error: state.projectId === projectId ? state.error : null,
  };
}
