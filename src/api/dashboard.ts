import apiClient from './client';
import type {
  DashboardSummary, DailyPerformance,
  PendingOrderItem, PendingOrderResponse, PendingOrderType, PendingOrderCategory, IntegratedOrdersPage,
} from '@/types/dashboard';

/** BE /dashboard/summary 응답 → FE DashboardSummary 매핑 */
interface BeDashboardSummary {
  todayInboundCount: number;
  todayOutboundCount: number;
  stockShortageCount: number;
  integratedOrderCount: number;
  pendingApprovalCount: number;
  newSalesOrderCount: number;
  newPurchaseOrderCount: number;
  todayPlacedCount: number;
  todayDispatchedCount: number;
  todayTransferredCount: number;
  todayReturnedCount: number;
  inboundActiveCount: number;
  outboundActiveCount: number;
  transferActiveCount: number;
  returnActiveCount: number;
  inboundPendingCount: number;
  outboundPendingCount: number;
  transferPendingCount: number;
  returnPendingCount: number;
  delayedOrderCount: number;
}

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const res = await apiClient.get<BeDashboardSummary>('/stock-service/dashboard/summary');
  const b = res.data;
  return {
    today_inbound_count: b.todayInboundCount ?? 0,
    today_outbound_count: b.todayOutboundCount ?? 0,
    stock_shortage_count: b.stockShortageCount ?? 0,
    integrated_order_count: b.integratedOrderCount ?? 0,
    pending_approval_count: b.pendingApprovalCount ?? 0,
    new_sales_order_count: b.newSalesOrderCount ?? 0,
    new_purchase_order_count: b.newPurchaseOrderCount ?? 0,
    today_placed_count: b.todayPlacedCount ?? 0,
    today_dispatched_count: b.todayDispatchedCount ?? 0,
    today_transferred_count: b.todayTransferredCount ?? 0,
    today_returned_count: b.todayReturnedCount ?? 0,
    inbound_active_count: b.inboundActiveCount ?? 0,
    outbound_active_count: b.outboundActiveCount ?? 0,
    transfer_active_count: b.transferActiveCount ?? 0,
    return_active_count: b.returnActiveCount ?? 0,
    inbound_pending_count: b.inboundPendingCount ?? 0,
    outbound_pending_count: b.outboundPendingCount ?? 0,
    transfer_pending_count: b.transferPendingCount ?? 0,
    return_pending_count: b.returnPendingCount ?? 0,
    delayed_order_count: b.delayedOrderCount ?? 0,
  };
};

/* ───────── 처리 필요 지시서 (대시보드 패널 + 통합 페이지) ───────── */
interface BePendingOrderItem {
  type: PendingOrderType;
  orderId: string;
  orderNo: string;
  partnerName: string | null;
  status: string;
  scheduledDate: string;
  category: PendingOrderCategory;
  delayDays: number | null;
  itemCount: number | null;
  totalQty: number | null;
  createdAt: string;
}
interface BePendingOrderResponse {
  items: BePendingOrderItem[];
  summary: {
    total: number;
    delayed: number;
    today: number;
    upcoming: number;
    inProgress: number;
    pendingApproval: number;
  };
}
interface BeIntegratedOrdersPage {
  content: BePendingOrderItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

function mapPendingOrder(b: BePendingOrderItem): PendingOrderItem {
  return {
    type: b.type,
    order_id: b.orderId,
    order_no: b.orderNo,
    partner_name: b.partnerName ?? '-',
    status: b.status,
    scheduled_date: b.scheduledDate,
    category: b.category,
    delay_days: b.delayDays ?? 0,
    item_count: b.itemCount ?? 0,
    total_qty: b.totalQty ?? 0,
    created_at: b.createdAt,
  };
}

/** 대시보드 "처리 필요 지시서" 패널 미리보기 */
export const getPendingOrders = async (limit: number = 5): Promise<PendingOrderResponse> => {
  const res = await apiClient.get<BePendingOrderResponse>('/stock-service/dashboard/pending-orders', {
    params: { limit },
  });
  const s = res.data.summary;
  return {
    items: (res.data.items ?? []).map(mapPendingOrder),
    summary: {
      total: s?.total ?? 0,
      delayed: s?.delayed ?? 0,
      today: s?.today ?? 0,
      upcoming: s?.upcoming ?? 0,
      in_progress: s?.inProgress ?? 0,
      pending_approval: s?.pendingApproval ?? 0,
    },
  };
};

/** 지시서 통합 페이지 — 페이지네이션 응답 */
export interface GetIntegratedOrdersParams {
  type?: 'ALL' | PendingOrderType;
  category?: 'ALL' | PendingOrderCategory;
  status?: string; // 'ALL' | 도메인 status
  page?: number;
  size?: number;
}

export const getIntegratedOrders = async (params: GetIntegratedOrdersParams = {}): Promise<IntegratedOrdersPage> => {
  const res = await apiClient.get<BeIntegratedOrdersPage>('/stock-service/orders/integrated', {
    params: {
      type: params.type ?? 'ALL',
      category: params.category ?? 'ALL',
      status: params.status ?? 'ALL',
      page: params.page ?? 0,
      size: params.size ?? 20,
    },
  });
  const d = res.data;
  return {
    content: (d.content ?? []).map(mapPendingOrder),
    total_elements: d.totalElements ?? 0,
    total_pages: d.totalPages ?? 0,
    number: d.number ?? 0,
    size: d.size ?? 20,
    first: !!d.first,
    last: !!d.last,
    empty: !!d.empty,
  };
};

/** BE /statistic/daily-inout 응답 → FE DailyPerformance 매핑 (품목별 아닌 일자별 합계) */
interface BeDailyInout {
  date: string;        // YYYY-MM-DD
  inboundQty: number;
  outboundQty: number;
}

export const getDailyPerformances = async (): Promise<DailyPerformance[]> => {
  // 최근 7일 기본값 (from ~ to)
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const res = await apiClient.get<BeDailyInout[]>('/stock-service/statistic/daily-inout', {
    params: { from: fmt(from), to: fmt(today) },
  });
  return (res.data ?? []).map((b, i) => ({
    id: i + 1,
    date: b.date,
    sku: '-',
    product_name: '일별 합계',
    inbound_qty: b.inboundQty ?? 0,
    outbound_qty: b.outboundQty ?? 0,
    transfer_qty: 0,
  }));
};
