import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSchedulerHistory, getSchedulerHistoryDetail, runWaveScheduler } from '@/api/scheduler';

/**
 * 스케줄러 실행 이력 조회.
 * pollingMs 지정 시 주기적으로 자동 새로고침 (cron 결과 실시간 반영용).
 */
export const useSchedulerHistory = (params: {
  jobName?: string;
  page?: number;
  size?: number;
  pollingMs?: number;
} = {}) => {
  const { jobName, page = 0, size = 20, pollingMs } = params;
  return useQuery({
    queryKey: ['scheduler-history', jobName ?? 'all', page, size],
    queryFn: () => getSchedulerHistory({ jobName, page, size }),
    refetchInterval: pollingMs,
    refetchOnWindowFocus: false,
  });
};

/** 웨이브 스케줄러 수동 실행 — 성공 시 이력 자동 invalidate */
export const useRunWaveScheduler = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: runWaveScheduler,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scheduler-history'] });
    },
  });
};

/** 한 실행 이력의 처리 상세 — historyId 가 truthy 일 때만 fetch (행 펼치기 시) */
export const useSchedulerHistoryDetail = (historyId: string | null) =>
  useQuery({
    queryKey: ['scheduler-history-detail', historyId],
    queryFn: () => getSchedulerHistoryDetail(historyId as string),
    enabled: !!historyId,
    staleTime: 60_000,
  });
