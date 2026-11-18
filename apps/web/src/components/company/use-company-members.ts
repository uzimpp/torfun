'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  answerJoinRequest,
  ApiError,
  fetchCompanyMembers,
  fetchJoinRequests,
  removeCompanyMember,
  setAutoApproveDomain,
  setCompanyManager,
  type CompanyMemberResponse,
  type JoinRequestResponse,
} from '@/lib/api';

/**
 * Who is in the caller's Company, who is waiting to get in, and the Company
 * Manager's answers to both.
 *
 * Requests are read only by a manager: the API refuses everyone else, and
 * asking anyway would put a 403 in front of a member for no reason.
 *
 * Like `useCompanyData`, a failed write leaves a message in `error` and returns
 * false instead of throwing. The API's own message is the useful one here
 * ("A company needs at least one manager"), so it is shown as sent.
 */
export interface CompanyMembers {
  members: CompanyMemberResponse[];
  requests: JoinRequestResponse[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  answer: (userId: string, answer: 'approve' | 'reject') => Promise<boolean>;
  setManager: (userId: string, isManager: boolean) => Promise<boolean>;
  remove: (userId: string) => Promise<boolean>;
  saveAutoApprove: (domain: string | null) => Promise<boolean>;
}

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

export function useCompanyMembers(
  isManager: boolean,
  /** Called after a write that changes the company record itself. */
  onCompanyChanged: () => void,
): CompanyMembers {
  const [members, setMembers] = useState<CompanyMemberResponse[]>([]);
  const [requests, setRequests] = useState<JoinRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCompanyMembers(),
      isManager ? fetchJoinRequests() : Promise.resolve({ requests: [] }),
    ]).then(
      ([memberData, requestData]) => {
        if (cancelled) return;
        setMembers(memberData.members);
        setRequests(requestData.requests);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(messageOf(caught, 'โหลดรายชื่อสมาชิกไม่สำเร็จ'));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isManager, refreshKey]);

  const run = useCallback(async (work: () => Promise<unknown>, fallback: string) => {
    setSaving(true);
    setError(null);
    try {
      await work();
      setRefreshKey((key) => key + 1);
      return true;
    } catch (caught) {
      setError(messageOf(caught, fallback));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    members,
    requests,
    loading,
    saving,
    error,
    answer: (userId, verdict) =>
      run(() => answerJoinRequest(userId, verdict), 'บันทึกคำตอบไม่สำเร็จ'),
    setManager: async (userId, value) => {
      const done = await run(() => setCompanyManager(userId, value), 'เปลี่ยนสิทธิ์ไม่สำเร็จ');
      // Stepping yourself down changes what this page may show you.
      if (done) onCompanyChanged();
      return done;
    },
    remove: async (userId) => {
      const done = await run(() => removeCompanyMember(userId), 'นำสมาชิกออกไม่สำเร็จ');
      if (done) onCompanyChanged();
      return done;
    },
    saveAutoApprove: async (domain) => {
      const done = await run(() => setAutoApproveDomain(domain), 'บันทึกการตั้งค่าไม่สำเร็จ');
      if (done) onCompanyChanged();
      return done;
    },
  };
}
