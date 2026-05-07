/* ── 공통 ── */
export type OrderStatus = 'draft' | 'approved' | 'received' | 'placing' | 'in_progress' | 'completed' | 'partial' | 'cancelled';
export type PickingStatus = 'pending' | 'in_progress' | 'completed' | 'partial';
export type PlacementOrderStatus = 'pending' | 'in_progress' | 'completed';

export const ORDER_STATUS_CONFIG: Record<OrderStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '초안' },
  approved: { color: 'processing', label: '승인' },
  received: { color: 'cyan', label: '입고확정' },
  placing: { color: 'orange', label: '적치중' },
  in_progress: { color: 'warning', label: '진행중' },
  completed: { color: 'success', label: '완료' },
  // partial = 검수 불량 OR 적치 중 불량 OR 수량 부족 — 셋 중 하나라도 발생.
  partial: { color: 'warning', label: '부분완료' },
  cancelled: { color: 'error', label: '취소' },
};

export const PLACEMENT_ORDER_STATUS_CONFIG: Record<PlacementOrderStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '대기' },
  in_progress: { color: 'processing', label: '적치중' },
  completed: { color: 'success', label: '완료' },
};

export const PICKING_STATUS_CONFIG: Record<PickingStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '대기' },
  in_progress: { color: 'processing', label: '진행중' },
  completed: { color: 'success', label: '완료' },
  partial: { color: 'warning', label: '부분완료' },
};

/** 입고 라인 아이템 상태 — 백엔드 InboundOrderItemStatus */
export type InboundItemStatus = 'pending' | 'receiving' | 'completed' | 'shortage';

export const INBOUND_ITEM_STATUS_CONFIG: Record<InboundItemStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '대기' },
  receiving: { color: 'processing', label: '검수중' },
  completed: { color: 'success', label: '완료' },
  shortage: { color: 'warning', label: '부족' },
};

/* ── ASN (출하예정통보) ── */
export interface AsnOrder {
  /** 백엔드 UUID */
  id: string;
  asn_no: string;
  vendor_name: string;
  ship_date: string;
  expected_date: string;
  items: { sku: string; product_name: string; qty: number; unit_price: number }[];
}

/* ── 입고 지시서 ── */
export interface InboundOrder {
  /** 백엔드 UUID */
  id: string;
  order_no: string;
  vendor_name: string;
  /** 입고처(공급사) UUID — 반품 출고 생성 시 supplierId 로 사용 */
  supplier_id?: string | null;
  /** 창고 UUID (적치 위치 추천 호출 등에 필요) */
  warehouse_id?: string;
  warehouse_name: string;
  expected_date: string;
  status: OrderStatus;
  source: string;
  /** 원본 문서 ID — purchase_order 면 발주서ID, return 이면 출고지시서ID, manual 이면 null */
  origin_id?: string | null;
  /** 원본 문서 번호 — purchase_order 면 PO-XXX, return 이면 출고지시서 번호, manual 이면 null. 상세 응답에만 채워짐 */
  origin_no?: string | null;
  /** 반품 출고처명 — source=return 일 때만 값 있음 */
  return_from?: string | null;
  created_by: string;
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
  total_items?: number;
  total_qty?: number;
}

export interface InboundOrderItem {
  id: string;
  order_id: string;
  /** 상품 UUID (적치 위치 추천, 재고 이력 등에 사용) */
  product_id?: string;
  sku: string;
  product_name: string;
  ordered_qty: number;
  received_qty: number;
  defective_qty: number;
  /** 미입고 잔여 수량 (orderedQty - receivedQty - defectiveQty, 최소 0) */
  remaining_qty: number;
  unit_price: number;
  /** 백엔드 아이템 상태는 OrderStatus와 다른 별도 enum */
  status: InboundItemStatus | OrderStatus;
  lot_no?: string;
}

export interface InboundReceiptItem {
  id: string;
  receipt_id: string;
  order_item_id: string;
  product_id?: string;
  sku: string;
  product_name: string;
  qty: number;
  lot_no?: string;
  item_condition: 'normal' | 'defect' | 'damaged' | string;
  inspected_by?: string | null;
  unit_price: number;
  created_at?: string | null;
}

export interface InboundReceipt {
  id: string;
  inbound_order_id: string;
  order_no: string;
  vendor_name: string;
  warehouse_id?: string;
  warehouse_name: string;
  received_by?: string | null;
  received_by_name?: string | null;
  receipt_no: string;
  received_at: string;
  note?: string | null;
  created_at?: string | null;
  items: InboundReceiptItem[];
}

/* ── 출고 전표 ── */
export interface OutboundDispatchItem {
  id: string;
  product_id?: string;
  sku: string;
  product_name: string;
  qty: number;
  unit_price: number;
  lot_no?: string;
  location_code?: string;
}

export interface OutboundDispatch {
  id: string;
  order_no: string;
  dispatch_no: string;
  warehouse_name: string;
  store_name: string;
  dispatched_by?: string | null;
  dispatched_by_name?: string | null;
  dispatched_at: string;
  created_at?: string | null;
  items: OutboundDispatchItem[];
  /** 출처 유형 — 'sales_order' | 'manual' | 'return' */
  origin_type?: string | null;
  /** 출처 수주서들 (sales_order 케이스 — 분할 출고 시 N개 가능). manual/return 은 빈 배열 */
  origin_refs?: { id: string; no: string }[];
}

/* ── 적치 지시서 ── */
export interface PlacementItem {
  id: string;
  placement_order_id: string;
  inbound_order_id: string;
  warehouse_id?: string;
  order_no?: string;
  placement_no?: string;
  seq: number;
  sku: string;
  product_name: string;
  product_id?: string;
  qty: number;
  lot_no: string;
  zone_name: string;
  rack_code: string;
  location_id?: string;
  /** 로케이션 코드 (rack_code + 층번호 접미사 포함) — 작업자가 실제 보관할 위치 */
  location_code?: string;
  is_placed: boolean;
  /** 위치 미정 항목 (자동 추천 실패/용량 부족으로 저장된 잔여) */
  is_unassigned?: boolean;
  /** 자동 추천 실패 진단 사유 */
  unassigned_reason?: string;
  is_defect?: boolean;
  /** 적치 중 파손 수량 (정상 레코드 내부의 파손분) */
  defect_qty?: number;
}

export interface PlacementOrder {
  id: string;
  inbound_order_id: string;
  placement_no: string;
  order_no: string;
  status: PlacementOrderStatus;
  created_at: string;
  completed_at: string | null;
  total_items: number;
  placed_items: number;
  items: PlacementItem[];
}

/* ── 출고 지시서 ── */
export interface OutboundOrder {
  /** 백엔드 UUID */
  id: string;
  order_no: string;
  store_name: string;
  warehouse_name: string;
  expected_date: string;
  shipping_address: string;
  status: OrderStatus;
  source: string;
  created_by: string;
  /** BE 가 직접 내려주는 생성자 이름 (감사 필드 표시 전용) */
  created_by_name?: string | null;
  created_at: string;
  approved_by?: string | null;
  /** BE 가 직접 내려주는 승인자 이름 */
  approved_by_name?: string | null;
  approved_at?: string | null;
  total_items?: number;
  total_qty?: number;
  batch_id?: string | null;
  /** 이 출고지시서가 포함된 피킹리스트 UUID 목록 (웨이브 생성 후에만 존재) */
  picking_list_ids?: string[];
  /** 이 출고지시서가 만들어진 원본 ERP 수주서 ID 목록 (활성 링크만, 중복 제거) */
  source_sales_order_ids?: string[];
  /** 위 ID 들의 수주서 번호(SO-XXX) — 같은 순서로 매핑. 화면/인쇄에서 노출용 */
  source_sales_order_nos?: string[];

  /* ── 반품 출고 식별 (BE: originType='return' 일 때만 채워짐) ── */
  /** 'sales_order' | 'manual' | 'return' — BE 가 명시적으로 내려주는 발주 출처 */
  origin_type?: 'sales_order' | 'manual' | 'return' | null;
  /** 반품일 때만: 원본 입고지시서 ID (UUID) — 상세 화면에서 입고로 deep-link */
  origin_id?: string | null;
  /** 반품일 때만: 원본 입고지시서 번호 (IB-XXXXX) — 화면 표시용 */
  return_from_order_no?: string | null;
  /** 'store' | 'supplier' — 반품 출고면 'supplier' (반대 방향) */
  destination_type?: 'store' | 'supplier' | null;
  /** 반품 대상 입고처 ID (반품 출고 전용) */
  supplier_id?: string | null;
  /** 반품 대상 입고처명 — 화면 표시용 (반품 출고면 store_name 대신 이걸 노출) */
  supplier_name?: string | null;
  /** 반품 사유 (반품 출고 전용) */
  return_reason?: string | null;
}

export interface OutboundOrderItem {
  id: string;
  order_id: string;
  /** 상품 UUID (웨이브 생성 시 상품별 담당자 배정에 사용) */
  product_id?: string;
  sku: string;
  product_name: string;
  ordered_qty: number;
  picked_qty: number;
  unit_price: number;
  status: OrderStatus;
}

/* ── 기타 입출고 ── */
export type EtcInOutIoType = 'dispose_out' | 'dispose_in' | 'sample_in' | 'sample_out' | 'adjust_in' | 'adjust_out' | 'etc_in' | 'etc_out';
export type EtcInOutStatus = 'draft' | 'approved' | 'completed' | 'cancelled';
export type ItemCondition = 'normal' | 'defect' | 'expired';

export interface EtcInOutOrder {
  id: string;
  order_no: string;
  io_type: EtcInOutIoType;
  direction: 'in' | 'out';
  warehouse_id: string;
  warehouse_name: string;
  status: EtcInOutStatus;
  note?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  /** 출고처 (sample_out / etc_out / dispose_out 시 필수) */
  store_id?: string | null;
  store_name?: string | null;
  created_by: string;
  created_at: string;
  /** 작업자 자동 배정 (approved 시점에 채워짐) */
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  /** 재고 부족으로 취소된 연결 출고지시서 (있을 때만 표시) */
  cancellation_links?: { outbound_order_id: string; order_no: string; cancelled_at: string }[];
}

export interface EtcInOutItem {
  id: string;
  product_id: string;
  product_name: string;
  location_id: string;
  /** 사람이 읽는 위치 코드 (예: "LC-RK-...-01") — BE 보강분 */
  location_code?: string | null;
  rack_code?: string | null;
  zone_code?: string | null;
  qty: number;
  lot_no: string | null;
  condition: ItemCondition;
  /** 불량 수량 — defect 처리분의 실측 수량 (모바일 흐름에서 채워짐) */
  defect_qty?: number;
  /** 출고 픽업 수량 (출고 케이스에서만 의미) */
  picked_qty?: number;
  note: string | null;
  processed_qty: number;
  status: string;
}

/* 기타입출고 — 출고 사이드 추가 타입 */
export interface EtcInOutShortageDetail {
  itemId: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  requested: number;
  available: number;
  shortage: number;
}

/** 가용재고 부족 시 백엔드가 409로 반환하는 에러 본문 */
export interface EtcInOutStockShortageError {
  error: 'STOCK_SHORTAGE';
  message: string;
  shortages: EtcInOutShortageDetail[];
}

/** 재고 부족 시 취소 후보 출고지시서 1건 */
export interface EtcInOutCancellationCandidate {
  outbound_order_id: string;
  order_no: string;
  store_name: string;
  expected_date: string | null;
  reserved_qty: number;
}

/** 샘플 출고용 추천 상품 (최근 sample_in으로 들어온 것들) */
export interface EtcInOutSampleSuggestion {
  product_id: string;
  sku: string;
  product_name: string;
  available_qty: number;
  last_in_at: string | null;
}

/* ── 피킹 리스트 ── */
export interface PickingList {
  id: string;
  picking_no: string;
  warehouse_name: string;
  assignee: string;
  assigned_to?: string;
  outbound_order_ids?: string[];
  outbound_count: number;
  status: PickingStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at?: string | null;
}

export interface PickingItem {
  id: string;
  picking_id: string;
  /** 표준 로케이션 코드: [구역]-[랙]-[행]-[층] */
  location_code: string;
  /** 로케이션 UUID — 같은 랙 다른 층/행 구분 및 정확한 라우팅용 */
  location_id?: string;
  zone_code?: string;
  rack_code: string;
  row_no?: number;
  level_no?: number;
  sku: string;
  product_name: string;
  target_qty: number;
  picked_qty: number;
  lot_no: string;
  status: PickingStatus;
  picked_by?: string | null;
  picked_at?: string | null;
}

/* ── 이동 지시서 ── */
export type TransferOrderStatus = 'draft' | 'approved' | 'in_progress' | 'completed' | 'partial' | 'cancelled';
export type TransferItemStatus = 'pending' | 'in_progress' | 'completed' | 'shortage';

export interface TransferOrder {
  id: string;
  order_no: string;
  from_warehouse_id: string;
  from_warehouse_name: string;
  to_warehouse_id: string;
  to_warehouse_name: string;
  expected_date: string | null;
  note: string | null;
  status: TransferOrderStatus;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  total_items: number;
  total_qty: number;
}

export interface TransferOrderItem {
  id: string;
  transfer_order_id: string;
  product_id: string;
  product_name: string;
  from_location_id: string;
  to_location_id: string;
  ordered_qty: number;
  processed_qty: number;
  defect_qty: number;
  lot_no: string | null;
  status: TransferItemStatus;
}

/* ── ERP 발주서/수주서 ── */
export interface ErpPurchaseOrder {
  id: number;
  po_no: string;
  vendor_name: string;
  items: { sku: string; product_name: string; qty: number; unit_price: number }[];
  order_date: string;
}

/** 수주서 처리 상태 — allocatedQty(분배된 양) 기준 */
export type SalesOrderProcessStatus = 'NOT_STARTED' | 'PARTIAL' | 'COMPLETED';

export interface ErpSalesOrder {
  id: string;
  so_no: string;
  store_id: string;
  store_name: string;
  status: 'draft' | 'approved' | 'closed';
  order_date: string;
  scheduled_date: string;          // 출고예정일 — 그룹핑 기준
  shipping_address: string;
  note?: string;
  items: { sku: string; product_name: string; qty: number; unit_price: number }[];
  already_converted?: boolean;     // legacy 단일 SO 호환

  // ── FE 선택 화면용 보강 필드 (BE 보강 응답) ──
  process_status: SalesOrderProcessStatus;
  dispatch_progress_percent: number;   // 0~100
  item_count: number;                  // 총 품목 종류
  total_ordered_qty: number;           // 총 주문 수량
  item_preview: ErpSalesOrderItemPreview[]; // 상위 3개
}

export interface ErpSalesOrderItemPreview {
  product_id: string;
  product_name: string;
  qty: number;
}

/** 수주서 목록 조회 필터 */
export interface ErpSalesOrderListFilter {
  status?: 'draft' | 'approved' | 'closed';
  store_id?: string;
  date_from?: string;       // YYYY-MM-DD
  date_to?: string;
  so_no_keyword?: string;
  hide_completed?: boolean;
}

/* ── 출고지시서 미리보기 ── */
export type StockStatus = 'SUFFICIENT' | 'SHORTAGE' | 'NONE';

export interface OutboundPreviewWarehouseStock {
  warehouse_id: string;
  warehouse_name: string;
  current_available_qty: number;
  incoming_qty: number;
  draft_reserved_qty: number;
  projected_qty: number;
  status: StockStatus;
}

export interface OutboundPreviewProductRequirement {
  product_id: string;
  product_name: string;
  sku: string;
  required_qty: number;
  warehouses: OutboundPreviewWarehouseStock[];
}

export interface OutboundPreviewStoreGroup {
  store_id: string;
  store_name: string;
  sales_order_ids: string[];
  requirements: OutboundPreviewProductRequirement[];
  recommended_warehouse_id: string | null; // null = 단일 창고 불가 → 분할 필요
}

export interface OutboundPreviewResponse {
  ship_date: string;
  store_groups: OutboundPreviewStoreGroup[];
}

/* ── 분할 출고 추천 ── */
export interface SplitProductAllocation {
  product_id: string;
  qty: number;
}

export interface SplitWarehouseAllocation {
  warehouse_id: string;
  product_allocations: SplitProductAllocation[];
}

export interface SplitProductShortage {
  product_id: string;
  product_name: string;
  required_qty: number;
  allocated_qty: number;
  shortage_qty: number;
}

export interface SplitRecommendationResponse {
  recommendations: SplitWarehouseAllocation[];
  unallocated_qty: number;
  shortages: SplitProductShortage[];
}

/* ── 출고지시서 생성 (다중 SO) ── */
export interface CreateOutboundFromSalesOrdersRequest {
  sales_order_ids: string[];
  warehouse_allocations: SplitWarehouseAllocation[];
}

export interface CreateOutboundResponse {
  outbound_order_ids: string[];
  unallocated_qty: number;
}

/* ── 수주서 진행률 조회 ── */
export interface SalesOrderProgressItem {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  ordered_qty: number;
  allocated_qty: number;
  dispatched_qty: number;
  remaining_to_dispatch: number;
  remaining_to_allocate: number;
  dispatch_progress_percent: number;
}

export interface SalesOrderProgressLinkedItem {
  product_id: string;
  product_name: string;
  qty: number;
}

export interface SalesOrderProgressLinkedOutbound {
  outbound_order_id: string;
  outbound_order_no: string;
  warehouse_id: string;
  warehouse_name: string;
  status: string;
  scheduled_date: string;
  items: SalesOrderProgressLinkedItem[];
  cancelled: boolean;
  cancelled_at?: string | null;
}

export interface SalesOrderProgressResponse {
  id: string;
  sales_order_number: string;
  store_id: string;
  store_name: string;
  order_date: string;
  scheduled_date: string;
  status: string;
  total_ordered_qty: number;
  total_allocated_qty: number;
  total_dispatched_qty: number;
  dispatch_progress_percent: number;
  items: SalesOrderProgressItem[];
  linked_outbounds: SalesOrderProgressLinkedOutbound[];
}

/* ── 배치 피킹 ── */
export type BatchStatus = 'created' | 'picking' | 'completed';

export const BATCH_STATUS_CONFIG: Record<BatchStatus, { color: string; label: string }> = {
  created: { color: 'default', label: '생성' },
  picking: { color: 'processing', label: '피킹중' },
  completed: { color: 'success', label: '완료' },
};

export interface Batch {
  id: number;
  batch_no: string;
  order_ids: number[];
  total_items: number;
  total_qty: number;
  assignee: string;
  status: BatchStatus;
  created_at: string;
}

export interface BatchPickingItem {
  id: number;
  batch_id: number;
  seq: number;
  zone_name: string;
  rack_code: string;
  sku: string;
  product_name: string;
  total_qty: number;
  sources: { order_no: string; qty: number }[];
  is_picked: boolean;
}
