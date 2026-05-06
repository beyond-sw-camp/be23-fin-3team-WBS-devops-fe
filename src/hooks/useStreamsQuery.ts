import { useQueries, useQuery } from '@tanstack/react-query';
import * as streamsApi from '@/api/streams';
import { getClientIdFromToken } from '@/utils/jwt';

const ACTIVE_ORDERS_INTERVAL_MS = 2_000;
const HOURLY_THROUGHPUT_INTERVAL_MS = 60_000;
const RETURN_RATIO_INTERVAL_MS = 60_000;

/** 진행 중 작업 수 (모듈별) — 2초 폴링 */
export const useActiveOrders = () => {
  const clientId = getClientIdFromToken();
  return useQuery({
    queryKey: ['streams', 'active-orders', clientId],
    queryFn: () => streamsApi.getActiveOrders(clientId!),
    enabled: !!clientId,
    refetchInterval: ACTIVE_ORDERS_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
};

/** 4개 모듈의 시간별 처리량을 동시에 조회 — 1분 폴링 */
export const useHourlyThroughputAll = () => {
  const clientId = getClientIdFromToken();
  const modules: streamsApi.StreamsModule[] = ['inbound', 'outbound', 'transfer', 'etcinout'];
  return useQueries({
    queries: modules.map((module) => ({
      queryKey: ['streams', 'hourly-throughput', clientId, module],
      queryFn: () => streamsApi.getHourlyThroughput(clientId!, module),
      enabled: !!clientId,
      refetchInterval: HOURLY_THROUGHPUT_INTERVAL_MS,
      refetchIntervalInBackground: false,
    })),
  });
};

/** 오늘 반품 비율 — 1분 폴링 */
export const useReturnRatio = () => {
  const clientId = getClientIdFromToken();
  return useQuery({
    queryKey: ['streams', 'return-ratio', clientId],
    queryFn: () => streamsApi.getReturnRatio(clientId!),
    enabled: !!clientId,
    refetchInterval: RETURN_RATIO_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
};
