import { useQuery } from '@tanstack/react-query';
import * as api from '@/api/dashboard';
import { getLowStockItems } from '@/api/statistics';
import type { LowStockItem } from '@/types/statistics';
import type { SafetyStock } from '@/types/dashboard';

export const useDashboardSummary = () =>
  useQuery({ queryKey: ['dashboard-summary'], queryFn: api.getDashboardSummary });

// 같은 /alert/low-stock 응답을 useLowStockItems 와 캐시 공유 — select 로 SafetyStock 형태 변환
export const useSafetyStocks = () =>
  useQuery<LowStockItem[], Error, SafetyStock[]>({
    queryKey: ['low-stock'],
    queryFn: getLowStockItems,
    select: (items) => items.map((b, i) => ({
      id: i + 1,
      sku: b.sku,
      product_name: b.product_name,
      safety_qty: b.min_stock_qty,
      current_qty: b.available_qty,
      shortage_qty: Math.max(0, b.min_stock_qty - b.available_qty),
    })),
  });

export const useDailyPerformances = () =>
  useQuery({ queryKey: ['daily-performances'], queryFn: api.getDailyPerformances });

/** 처리 필요 지시서 패널 (대시보드 미리보기) */
export const usePendingOrders = (limit: number = 5) =>
  useQuery({
    queryKey: ['pending-orders', limit],
    queryFn: () => api.getPendingOrders(limit),
    refetchInterval: 60_000,
  });

/** 지시서 통합 페이지 — 페이지네이션 응답 */
export const useIntegratedOrders = (params: api.GetIntegratedOrdersParams) =>
  useQuery({
    queryKey: ['integrated-orders', params],
    queryFn: () => api.getIntegratedOrders(params),
  });
