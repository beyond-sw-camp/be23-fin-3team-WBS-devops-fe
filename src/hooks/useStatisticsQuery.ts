import { useQuery } from '@tanstack/react-query';
import * as api from '@/api/statistics';

export const useMonthlyInOut = (from: string, to: string, warehouseId?: string) =>
  useQuery({ queryKey: ['monthly-inout', from, to, warehouseId], queryFn: () => api.getMonthlyInOut(from, to, warehouseId), enabled: !!from && !!to });

export const useDailyInOut = (from: string, to: string, warehouseId?: string) =>
  useQuery({ queryKey: ['daily-inout', from, to, warehouseId], queryFn: () => api.getDailyInOut(from, to, warehouseId), enabled: !!from && !!to });

export const useMonthlyTurnovers = (from: string, to: string) =>
  useQuery({ queryKey: ['monthly-turnovers', from, to], queryFn: () => api.getMonthlyTurnovers(from, to), enabled: !!from && !!to });

export const useSkuRankings = (from: string, to: string, limit = 10) =>
  useQuery({ queryKey: ['sku-rankings', from, to, limit], queryFn: () => api.getSkuRankings(from, to, limit), enabled: !!from && !!to });

export const useLowStockItems = () =>
  useQuery({ queryKey: ['low-stock'], queryFn: () => api.getLowStockItems() });
