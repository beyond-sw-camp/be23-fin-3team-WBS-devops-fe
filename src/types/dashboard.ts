export interface SkuRackStock {
  id: number;
  sku: string;
  product_name: string;
  rack_code: string;
  available_qty: number;
  reserved_qty: number;
  defective_qty: number;
  total_qty: number;
}

export interface SafetyStock {
  id: number;
  sku: string;
  product_name: string;
  safety_qty: number;
  current_qty: number;
  shortage_qty: number;
}

export interface RackUsageSummary {
  total_locations: number;
  occupied_locations: number;
  empty_locations: number;
  occupancy_rate: number;
  total_racks: number;
  used_racks: number;
  empty_racks: number;
  rack_occupancy_rate: number;
}

export interface ZoneRackUsage {
  zone_id: string;
  zone_name: string;
  zone_code: string;
  total_locations: number;
  occupied_locations: number;
  occupancy_rate: number;
  total_racks: number;
  used_racks: number;
}

export interface DashboardSummary {
  // 카드 — "할 일/처리 필요" 기준 (오늘 마감 + 지연)
  today_inbound_count: number;       // 카드 1: 처리 필요 입고 (오늘 마감 + 지연)
  today_outbound_count: number;      // 카드 2: 처리 필요 출고 (오늘 마감 + 지연)
  stock_shortage_count: number;      // 카드 3: 안전재고 미달
  integrated_order_count: number;    // 카드 4: 지시서 통합 (입고+출고+이동 미처리, 날짜 무관)
  pending_approval_count: number;    // 카드 5: 승인 대기 (draft)
  new_sales_order_count: number;     // 신규 주문 — 출고지시서 미생성된 ERP 수주서 수
  new_purchase_order_count: number;  // 신규 발주 — 입고지시서 미생성된 ERP 발주서 수

  // 오늘 처리 현황 — 완료 (오늘 실제 처리된 건수)
  today_placed_count: number;        // 입고: 오늘 적치 완료 (반품 제외)
  today_dispatched_count: number;    // 출고: 오늘 출고 확정
  today_transferred_count: number;   // 이동: 오늘 이동 완료
  today_returned_count: number;      // 반품: 오늘 반품 적치 완료

  // 오늘 처리 현황 — 진행중 (status ∈ ACTIVE, 날짜 무관)
  inbound_active_count: number;
  outbound_active_count: number;
  transfer_active_count: number;
  return_active_count: number;

  // 오늘 처리 현황 — 대기 (expected_date <= today AND status ∈ NOT_STARTED)
  inbound_pending_count: number;
  outbound_pending_count: number;
  transfer_pending_count: number;
  return_pending_count: number;

  // 오늘의 이슈 패널 등에 활용
  delayed_order_count: number;       // 지연 (scheduled < today AND 미완료)
}

export interface DailyPerformance {
  id: number;
  date: string;
  sku: string;
  product_name: string;
  inbound_qty: number;
  outbound_qty: number;
  transfer_qty: number;
}

/** 처리 필요 지시서 1건 — 입고/출고/이동 통합 표현 */
export type PendingOrderType = 'INBOUND' | 'OUTBOUND' | 'TRANSFER';
/**
 * 카테고리:
 *   DELAYED / TODAY                  — 마감일 기반 (지연/오늘)
 *   IN_PROGRESS / PENDING_APPROVAL   — 상태 기반 (진행중/승인대기, 날짜 무관)
 *   UPCOMING                         — 미래 마감 (대시보드 응답에서 제외, 통합 페이지에서만 사용)
 *   COMPLETED / CANCELLED            — 종결 (통합 페이지 전용)
 */
export type PendingOrderCategory =
  | 'DELAYED'
  | 'TODAY'
  | 'IN_PROGRESS'
  | 'PENDING_APPROVAL'
  | 'UPCOMING'
  | 'COMPLETED'
  | 'CANCELLED';

export interface PendingOrderItem {
  type: PendingOrderType;
  order_id: string;
  order_no: string;
  /** 입고: 협력사 / 출고: 거래처 / 이동: 목적지 창고 */
  partner_name: string;
  status: string;
  scheduled_date: string;
  category: PendingOrderCategory;
  /** DELAYED 일 때만 양수 */
  delay_days: number;
  item_count: number;
  total_qty: number;
  created_at: string;
}

export interface PendingOrderResponse {
  items: PendingOrderItem[];
  summary: {
    total: number;
    delayed: number;
    today: number;
    upcoming: number;
    in_progress: number;
    pending_approval: number;
  };
}

/** 지시서 통합 페이지의 페이지네이션 응답 */
export interface IntegratedOrdersPage {
  content: PendingOrderItem[];
  total_elements: number;
  total_pages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}
