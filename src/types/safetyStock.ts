/**
 * 안전재고 (상품 × 창고) — master-service ProductWarehouseSetting.
 *
 * BE 테이블: product_warehouse_settings, unique (product_id, warehouse_id).
 * row 가 없으면 = 미설정 (재고 부족 알림 발생 안 함).
 */
export interface SafetyStock {
  id: string;
  product_id: string;
  warehouse_id: string;
  product_name: string;
  sku: string;
  warehouse_name: string;
  min_stock_qty: number;
}
