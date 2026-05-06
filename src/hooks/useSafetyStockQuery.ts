import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSafetyStocksByClient,
  getSafetyStocksByProduct,
  getSafetyStocksByWarehouse,
  upsertSafetyStock,
  deleteSafetyStock,
  upsertSafetyStockBulk,
} from '@/api/safetyStock';

const KEY = ['safety-stocks'] as const;

export const useSafetyStocksByClient = () =>
  useQuery({ queryKey: [...KEY, 'by-client'], queryFn: getSafetyStocksByClient });

export const useSafetyStocksByProduct = (productId: string | null) =>
  useQuery({
    queryKey: [...KEY, 'by-product', productId],
    queryFn: () => getSafetyStocksByProduct(productId as string),
    enabled: !!productId,
  });

export const useSafetyStocksByWarehouse = (warehouseId: string | null) =>
  useQuery({
    queryKey: [...KEY, 'by-warehouse', warehouseId],
    queryFn: () => getSafetyStocksByWarehouse(warehouseId as string),
    enabled: !!warehouseId,
  });

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: ['low-stock'] });
  qc.invalidateQueries({ queryKey: ['low-stock-baseline'] });
  qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
};

export const useUpsertSafetyStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { productId: string; warehouseId: string; minStockQty: number }) =>
      upsertSafetyStock(p.productId, p.warehouseId, p.minStockQty),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useDeleteSafetyStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { productId: string; warehouseId: string }) =>
      deleteSafetyStock(p.productId, p.warehouseId),
    onSuccess: () => invalidateAll(qc),
  });
};

export const useUpsertSafetyStockBulk = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { productId: string; warehouseIds: string[]; minStockQty: number }) =>
      upsertSafetyStockBulk(p.productId, p.warehouseIds, p.minStockQty),
    onSuccess: () => invalidateAll(qc),
  });
};
