import apiClient from './client';
import type { SafetyStock } from '@/types/safetyStock';

/**
 * master-service ProductWarehouseSetting CRUD.
 *
 * BE base path: /master-service/product-warehouse-setting
 *   GET    /{productId}/{warehouseId}        — 한 건 조회 (없으면 null)
 *   GET    /by-product/{productId}           — 상품의 모든 창고 settings
 *   GET    /by-warehouse/{warehouseId}       — 창고의 모든 상품 settings
 *   GET    /by-client                        — clientId 의 전체 settings
 *   PUT    /{productId}/{warehouseId}        — upsert (body: {minStockQty})
 *   DELETE /{productId}/{warehouseId}        — 삭제 (= 미설정)
 */

interface BeSafetyStock {
  id: string;
  productId: string;
  warehouseId: string;
  productName: string | null;
  sku: string | null;
  warehouseName: string | null;
  minStockQty: number | null;
}

const BASE = '/master-service/product-warehouse-setting';

function map(b: BeSafetyStock): SafetyStock {
  return {
    id: b.id,
    product_id: b.productId,
    warehouse_id: b.warehouseId,
    product_name: b.productName ?? '-',
    sku: b.sku ?? '-',
    warehouse_name: b.warehouseName ?? '-',
    min_stock_qty: b.minStockQty ?? 0,
  };
}

export const getSafetyStocksByClient = async (): Promise<SafetyStock[]> => {
  const res = await apiClient.get<BeSafetyStock[]>(`${BASE}/by-client`);
  return (res.data ?? []).map(map);
};

export const getSafetyStocksByProduct = async (productId: string): Promise<SafetyStock[]> => {
  const res = await apiClient.get<BeSafetyStock[]>(`${BASE}/by-product/${productId}`);
  return (res.data ?? []).map(map);
};

export const getSafetyStocksByWarehouse = async (warehouseId: string): Promise<SafetyStock[]> => {
  const res = await apiClient.get<BeSafetyStock[]>(`${BASE}/by-warehouse/${warehouseId}`);
  return (res.data ?? []).map(map);
};

/** upsert — 같은 (productId, warehouseId) 가 있으면 수정, 없으면 신규. */
export const upsertSafetyStock = async (
  productId: string,
  warehouseId: string,
  minStockQty: number,
): Promise<SafetyStock> => {
  const res = await apiClient.put<BeSafetyStock>(`${BASE}/${productId}/${warehouseId}`, { minStockQty });
  return map(res.data);
};

export const deleteSafetyStock = async (productId: string, warehouseId: string): Promise<void> => {
  await apiClient.delete(`${BASE}/${productId}/${warehouseId}`);
};

/**
 * 한 상품의 여러 창고에 동일 값 일괄 적용.
 *
 * BE 가 batch endpoint 를 미제공해 FE 가 PUT 을 병렬 호출.
 * 부분 실패가 있어도 성공한 건은 그대로 반영 — 호출자가 결과를 보고 판단하도록 settled 결과 반환.
 */
export const upsertSafetyStockBulk = async (
  productId: string,
  warehouseIds: string[],
  minStockQty: number,
): Promise<{ ok: SafetyStock[]; failed: { warehouseId: string; reason: unknown }[] }> => {
  const results = await Promise.allSettled(
    warehouseIds.map((wid) => upsertSafetyStock(productId, wid, minStockQty)),
  );
  const ok: SafetyStock[] = [];
  const failed: { warehouseId: string; reason: unknown }[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') ok.push(r.value);
    else failed.push({ warehouseId: warehouseIds[i], reason: r.reason });
  });
  return { ok, failed };
};
