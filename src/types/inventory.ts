export interface InventoryStock {
  id: string | number;
  sku: string;
  product_name: string;
  warehouse_code: string;
  warehouse_name: string;
  zone_code: string;
  zone_name: string;
  rack_code: string;
  rack_name?: string;
  floor_no?: number | null;
  zone_id?: string;
  available_qty: number;
  reserved_qty: number;
  defective_qty: number;
  inspecting_qty: number;
  total_qty: number;
  min_stock_qty: number;
  // 실 BE 전용 필드
  product_id?: string;
  warehouse_id?: string;
  location_id?: string;
  location_code?: string;
  incoming_qty?: number;
  updated_at?: string;
  max_capacity?: number | null;
}

export type TransactionType =
  | 'inbound' | 'outbound' | 'transfer' | 'adjust' | 'inspect'
  | 'reserve' | 'unreserve' | 'dispose' | 'returned';
export type TransactionDirection = 'in' | 'out';

/**
 * 재고 종류 — Inventory.java 의 5개 수량 컬럼과 1:1 매핑.
 *  - available: 가용 재고
 *  - reserved : 출고지시서 승인으로 잠긴 예약 재고
 *  - defect   : 검수 시 불량 판정된 격리 재고
 *  - incoming : 입고지시서 승인 후 도착 전 (영업 참고)
 *  - pending  : 입고 검수 대기 (적치 전)
 */
export type InventoryStockStatus =
  | 'available'
  | 'reserved'
  | 'defect'
  | 'incoming'
  | 'pending';

export interface InventoryTransaction {
  id: string | number;
  stock_id: string | number;
  product_id?: string;
  warehouse_id?: string;
  location_id?: string;
  type: TransactionType;
  direction: TransactionDirection;
  qty: number;
  before_qty: number;
  after_qty: number;
  /** 어떤 종류의 재고에서 빠졌는지 (감소 측) — 같은 종류 안 증가/감소면 status_to와 동일 */
  status_from?: InventoryStockStatus | null;
  /** 어떤 종류의 재고로 들어갔는지 (증가 측) */
  status_to?: InventoryStockStatus | null;
  ref_type: string;
  ref_id?: string;
  created_at: string;
  // 실 BE 전용
  note?: string;
  created_by_name?: string;
  created_by?: string;
  product_name?: string;
  warehouse_name?: string;
  location_code?: string;
}

export type StockCountStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';
export type StockCountItemStatus = 'pending' | 'counted' | 'adjusted';

export interface StockCountOrder {
  id: string;
  order_no: string;
  warehouse_id: string;
  /** 프론트에서 warehouses와 조인해서 채움 */
  warehouse_name: string;
  status: StockCountStatus;
  created_by: string;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  note: string;
  created_at: string;
  completed_at: string | null;
}

export interface StockCountItem {
  id: string;
  product_id: string;
  /** 프론트에서 products와 조인해서 채움 */
  product_name: string;
  /** 프론트에서 products와 조인해서 채움 */
  sku: string;
  location_id: string;
  /** 프론트에서 inventory와 조인해서 채움 */
  location_code: string;
  system_qty: number;
  count_qty: number | null;
  diff_qty: number | null;
  status: StockCountItemStatus;
  counted_by: string | null;
  counted_at: string | null;
  note: string | null;
}
