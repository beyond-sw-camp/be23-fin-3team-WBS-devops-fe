import apiClient from './client';

/**
 * Kafka Streams 기반 실시간 메트릭 API.
 *
 * 모든 응답에 status 필드가 있고, "OK" 또는 "NOT_READY" (Streams 부팅 직후 가능).
 * NOT_READY 시 빈 배열/0 으로 응답되므로 화면에선 빈 상태 처리만 하면 됨.
 */

export type StreamsStatus = 'OK' | 'NOT_READY';

export type StreamsModule = 'inbound' | 'outbound' | 'transfer' | 'etcinout';

/* ── 1. 진행 중 작업 수 ── */
export interface ActiveOrdersResponse {
  clientId: string;
  modules: Record<StreamsModule, number>;
  total: number;
  status: StreamsStatus;
}

export const getActiveOrders = async (clientId: string): Promise<ActiveOrdersResponse> => {
  const res = await apiClient.get<ActiveOrdersResponse>('/stock-service/streams/active-orders', {
    params: { clientId },
  });
  return res.data;
};

/* ── 2. 시간별 처리량 (지난 24h) ── */
export interface HourlyBucket {
  /** ISO local datetime (예: 2026-05-06T03:00) */
  hour: string;
  count: number;
}

export interface HourlyThroughputResponse {
  clientId: string;
  module: StreamsModule;
  buckets: HourlyBucket[];
  status: StreamsStatus;
}

export const getHourlyThroughput = async (
  clientId: string,
  module: StreamsModule,
): Promise<HourlyThroughputResponse> => {
  const res = await apiClient.get<HourlyThroughputResponse>('/stock-service/streams/hourly-throughput', {
    params: { clientId, module },
  });
  return res.data;
};

/* ── 3. 오늘 반품 비율 ── */
export interface ReturnRatioBucket {
  normal: number;
  return: number;
  total: number;
  /** 0.0 ~ 1.0 */
  returnRatio: number;
}

export interface ReturnRatioResponse {
  clientId: string;
  inbound: ReturnRatioBucket;
  outbound: ReturnRatioBucket;
  status: StreamsStatus;
}

export const getReturnRatio = async (clientId: string): Promise<ReturnRatioResponse> => {
  const res = await apiClient.get<ReturnRatioResponse>('/stock-service/streams/return-ratio', {
    params: { clientId },
  });
  return res.data;
};
