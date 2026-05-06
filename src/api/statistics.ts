import apiClient from './client';
import type { MonthlyInOut, DailyInOut, MonthlyTurnover, SkuRanking, LowStockItem } from '@/types/statistics';

/* ── BE 응답 매퍼 ── */

interface BeMonthlyInOut { month: string; inboundQty: number; outboundQty: number }
interface BeDailyInOut { date: string; inboundQty: number; outboundQty: number }
interface BeTurnover { month: string; outboundQty: number; averageInventory: number; turnoverRate: number }
interface BeRanking { rank: number; productId: string; sku: string; productName: string; outboundQty: number }
interface BeLowStock { productId: string; sku: string; productName: string; warehouseId: string; warehouseName: string; availableQty: number; minStockQty: number }

function mapMonthly(b: BeMonthlyInOut): MonthlyInOut {
  return { month: b.month, inbound_qty: b.inboundQty ?? 0, outbound_qty: b.outboundQty ?? 0 };
}
function mapDaily(b: BeDailyInOut): DailyInOut {
  return { date: b.date, inbound_qty: b.inboundQty ?? 0, outbound_qty: b.outboundQty ?? 0 };
}
function mapTurnover(b: BeTurnover): MonthlyTurnover {
  return { month: b.month, outbound_qty: b.outboundQty ?? 0, average_inventory: b.averageInventory ?? 0, turnover_rate: b.turnoverRate ?? 0 };
}
function mapRanking(b: BeRanking): SkuRanking {
  return { rank: b.rank, product_id: b.productId, sku: b.sku, product_name: b.productName ?? '-', outbound_qty: b.outboundQty ?? 0 };
}
function mapLowStock(b: BeLowStock): LowStockItem {
  return { product_id: b.productId, sku: b.sku, product_name: b.productName ?? '-', warehouse_id: b.warehouseId, warehouse_name: b.warehouseName ?? '-', available_qty: b.availableQty ?? 0, min_stock_qty: b.minStockQty ?? 0 };
}

/* ── API ── */

export const getMonthlyInOut = async (from: string, to: string): Promise<MonthlyInOut[]> => {
  const res = await apiClient.get<BeMonthlyInOut[]>('/stock-service/statistic/monthly-inout', { params: { from, to } });
  return (res.data ?? []).map(mapMonthly);
};

export const getDailyInOut = async (from: string, to: string, warehouseId?: string): Promise<DailyInOut[]> => {
  const res = await apiClient.get<BeDailyInOut[]>('/stock-service/statistic/daily-inout', { params: { from, to, ...(warehouseId ? { warehouseId } : {}) } });
  return (res.data ?? []).map(mapDaily);
};

export const getMonthlyTurnovers = async (from: string, to: string): Promise<MonthlyTurnover[]> => {
  const res = await apiClient.get<BeTurnover[]>('/stock-service/statistic/turnover', { params: { from, to } });
  return (res.data ?? []).map(mapTurnover);
};

export const getSkuRankings = async (from: string, to: string, limit = 10): Promise<SkuRanking[]> => {
  const res = await apiClient.get<BeRanking[]>('/stock-service/statistic/outbound-rank', { params: { from, to, limit } });
  return (res.data ?? []).map(mapRanking);
};

export const getLowStockItems = async (): Promise<LowStockItem[]> => {
  const res = await apiClient.get<BeLowStock[]>('/stock-service/alert/low-stock');
  return (res.data ?? []).map(mapLowStock);
};
