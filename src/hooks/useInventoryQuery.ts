import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as inventoryApi from '@/api/inventory';

export const useInventoryStocks = (params?: { warehouseId?: string; zone?: string; search?: string }) =>
  useQuery({ queryKey: ['inventory-stocks', params], queryFn: () => inventoryApi.getInventoryStocks(params) });

/** 조회일자(date) 가 지정되면 by-date 엔드포인트 사용. date=null 이면 hook 비활성. */
export const useInventoryStocksByDate = (
  params: { date: string | null; warehouseId?: string; zone?: string; search?: string },
) =>
  useQuery({
    queryKey: ['inventory-stocks-by-date', params],
    queryFn: () => inventoryApi.getInventoryStocksByDate({
      date: params.date as string,
      warehouseId: params.warehouseId,
      zone: params.zone,
      search: params.search,
    }),
    enabled: !!params.date,
  });

/** 적치 위치 추천 (productId + warehouseId 양쪽이 있을 때만 활성화) */
export const useSuggestedLocations = (productId: string | null, warehouseId: string | null) =>
  useQuery({
    queryKey: ['suggested-locations', productId, warehouseId],
    queryFn: () => inventoryApi.getSuggestedLocations(productId!, warehouseId!),
    enabled: !!productId && !!warehouseId,
    staleTime: 30_000,
  });

export const useInventoryTransactions = (stockId: string | number | null | undefined) =>
  useQuery({
    queryKey: ['inventory-transactions', stockId],
    queryFn: () => inventoryApi.getInventoryTransactions(stockId as string | number),
    enabled: stockId !== null && stockId !== undefined && stockId !== 0 && stockId !== '',
  });

export const useInventoryTransactionsByRef = (
  refId: string | null | undefined,
  refType: inventoryApi.InventoryTransactionRefType | null | undefined,
) =>
  useQuery({
    queryKey: ['inventory-transactions-by-ref', refId, refType],
    queryFn: () => inventoryApi.getInventoryTransactionsByRef(refId!, refType!),
    enabled: !!refId && !!refType,
  });

/** 창고 랙별 재고 조회 — 레이아웃 편집 허브의 "랙별 재고" 탭에서 사용 */
export const useInventoryByRack = (warehouseId: string | null) =>
  useQuery({
    queryKey: ['inventory-by-rack', warehouseId],
    queryFn: () => inventoryApi.getInventoryByRack(warehouseId!),
    enabled: !!warehouseId,
    staleTime: 15_000,
  });

export const useStockCountOrders = () =>
  useQuery({ queryKey: ['stock-count-orders'], queryFn: inventoryApi.getStockCountOrders });

/** 실사 지시서 검색. productIds=null이면 hook 비활성. */
export const useSearchStockCounts = (productIds: string[] | null) =>
  useQuery({
    queryKey: ['stock-count-orders', 'search', productIds],
    queryFn: () => inventoryApi.searchStockCounts({ productIds: productIds ?? [] }),
    enabled: productIds !== null,
  });

export const useStockCountDetail = (id: string) =>
  useQuery({ queryKey: ['stock-count-detail', id], queryFn: () => inventoryApi.getStockCountDetail(id), enabled: !!id });

export const useCreateStockCount = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: inventoryApi.createStockCountOrder, onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-count-orders'] }) });
};

export const useStartStockCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.startStockCount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-count-orders'] }); qc.invalidateQueries({ queryKey: ['stock-count-detail'] }); },
  });
};

export const useCountStockCountItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, itemId, countQty, note }: { orderId: string; itemId: string; countQty: number; note?: string }) =>
      inventoryApi.countStockCountItem(orderId, itemId, countQty, note),
    onSuccess: (_, { orderId }) => { qc.invalidateQueries({ queryKey: ['stock-count-detail', orderId] }); },
  });
};

export const useCompleteStockCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.completeStockCount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-count-orders'] }); qc.invalidateQueries({ queryKey: ['stock-count-detail'] }); },
  });
};

export const useCancelStockCount = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.cancelStockCount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-count-orders'] }),
  });
};

/* ── 상품 재고 위치 ── */
export const useProductLocations = (productId: string | null, warehouseId?: string) =>
  useQuery({
    queryKey: ['product-locations', productId, warehouseId],
    queryFn: () => inventoryApi.getProductLocations(productId!, warehouseId),
    enabled: !!productId,
  });

/* ── 적재율 ── */
export const useRackUsageSummary = (warehouseId?: string) =>
  useQuery({ queryKey: ['rack-usage-summary', warehouseId], queryFn: () => inventoryApi.getRackUsageSummary(warehouseId) });

export const useRackUsageByZone = (warehouseId?: string) =>
  useQuery({ queryKey: ['rack-usage-by-zone', warehouseId], queryFn: () => inventoryApi.getRackUsageByZone(warehouseId) });
