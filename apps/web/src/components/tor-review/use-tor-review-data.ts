'use client';

import { useEffect, useState } from 'react';
import {
  type DeadlineSource,
  type Procurement,
  type ProcurementStatus,
} from '@torfun/types';
import { ApiError, fetchTor } from '@/lib/api';

export type TorReviewData = {
  projectId: string;
  title: string;
  agency: string;
  location: string | null;
  budget: number | null;
  status: ProcurementStatus;
  technologies: string[];
  summary: string | null;
  objectives: string[];
  scope: string[];
  bidderQualifications: string[];
  announcementDate: string | null;
  submissionDeadline: string | null;
  deadlineSource: DeadlineSource | null;
  procurementMethod: string | null;
  budgetYear: number;
  referencePrice: number | null;
  durationDays: number | null;
  platforms: string[];
  matchScore: number | null;
};

export interface TorReviewState {
  projectId: string | null;
  data: TorReviewData | null;
  loading: boolean;
  notFound: boolean;
  error: string | null;
}

function toReviewData(procurement: Procurement): TorReviewData {
  const analysis = procurement.analysis;
  const location = [procurement.subdistrict, procurement.district, procurement.province]
    .filter((part): part is string => Boolean(part))
    .join(', ');
  return {
    projectId: procurement.projectId,
    title: procurement.projectName,
    agency: procurement.deptName,
    location: location || null,
    budget: procurement.projectMoney,
    status: procurement.status,
    technologies: analysis?.techStack ?? [],
    summary: analysis?.summary ?? null,
    objectives: [],
    scope: analysis?.scopeOfWork ?? [],
    bidderQualifications: analysis?.requiredQualifications ?? [],
    announcementDate: procurement.announceDate,
    submissionDeadline: procurement.deadlineAt,
    deadlineSource: procurement.deadlineSource,
    procurementMethod: procurement.purchaseMethodName,
    budgetYear: procurement.budgetYear,
    referencePrice: procurement.priceBuild,
    durationDays: analysis?.durationDays ?? null,
    platforms: analysis?.targetPlatforms ?? [],
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
