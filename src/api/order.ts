import apiClient from './client';
import type {
  OutboundOrder, OutboundOrderItem, OrderStatus,
  OutboundDispatch, OutboundDispatchItem,
  EtcInOutOrder, EtcInOutItem, EtcInOutIoType, EtcInOutStatus, ItemCondition,
  EtcInOutCancellationCandidate, EtcInOutSampleSuggestion, EtcInOutStockShortageError,
  PickingList, PickingItem, PickingStatus,
  TransferOrder, TransferOrderItem, TransferOrderStatus, TransferItemStatus,
  ErpPurchaseOrder, ErpSalesOrder, ErpSalesOrderListFilter,
  OutboundPreviewResponse, SplitRecommendationResponse,
  CreateOutboundFromSalesOrdersRequest, CreateOutboundResponse,
  SalesOrderProgressResponse,
} from '@/types/order';
import { ensureLocationCode } from '@/utils/locationCode';

/* ═══════ 백엔드(stock-service) 응답 타입 ═══════ */
interface BeOutboundOrderRes {
  id: string; orderNo: string;
  warehouseName: string | null; storeName: string | null;
  scheduledDate: string | null;
  status: OrderStatus;
  totalQty: number | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  createdAt: string | null;
  // ── 반품 출고 식별 (BE 가 신규 추가, 일반 출고는 null) ──
  originType?: 'sales_order' | 'manual' | 'return' | null;
  originId?: string | null;
  returnFromOrderNo?: string | null;
  destinationType?: 'store' | 'supplier' | null;
  supplierId?: string | null;
  supplierName?: string | null;
  returnReason?: string | null;
}
interface BeOutboundOrderItemRes {
  id: string; productId: string; sku: string | null; productName: string | null;
  orderedQty: number; pickedQty: number | null; dispatchedQty: number | null;
  unitPrice: number | string | null;
  status: 'pending' | 'picking' | 'completed' | 'shortage';
}
interface BeOutboundOrderDetailRes extends BeOutboundOrderRes {
  warehouseId: string; storeId: string;
  createdByName: string | null; approvedByName: string | null;
  shippingAddress: string | null;
  note: string | null;
  approvedAt: string | null; updatedAt: string | null;
  items: BeOutboundOrderItemRes[];
  pickingListIds?: string[] | null;
  sourceSalesOrderIds?: string[] | null;
  sourceSalesOrderNos?: string[] | null;
}
interface BePage<T> { content: T[]; totalElements?: number; totalPages?: number }
interface BeErpSalesOrderRes {
  id: string; clientId: string; storeId: string; storeName: string | null;
  soNo: string; status: 'draft' | 'approved' | 'closed';
  orderDate: string; scheduledDate: string | null;
  shippingAddress: string | null; note: string | null; createdAt: string | null;
  alreadyConverted?: boolean | null;
  // 보강 필드 (FE 선택 화면)
  processStatus?: 'NOT_STARTED' | 'PARTIAL' | 'COMPLETED' | null;
  dispatchProgressPercent?: number | null;
  itemCount?: number | null;
  totalOrderedQty?: number | null;
  itemPreview?: { productId: string; productName: string | null; qty: number | null }[] | null;
}
interface BePickingListRes {
  id: string; pickingNo: string;
  warehouseName: string | null;
  assignedTo: string | null;
  assignedToName: string | null; createdByName: string | null;
  status: PickingStatus;
  startedAt: string | null; completedAt: string | null; createdAt: string | null;
  outboundOrderIds?: string[] | null;
  outboundIds?: string[] | null;
  outboundOrderId?: string | null;
  outboundCount?: number | null;
  outboundOrderCount?: number | null;
}
interface BePickingListItemRes {
  id: string; productId: string; sku: string | null; productName: string | null;
  locationId: string | null; zoneName: string | null; rackCode: string | null;
  locationCode: string | null; floorNo: number | null;
  qty: number; pickedQty: number | null;
  lotNo: string | null;
  status: 'pending' | 'picking' | 'completed' | 'shortage';
  pickedAt: string | null;
}
interface BePickingListDetailRes extends BePickingListRes { items: BePickingListItemRes[] }

/* ═══════ BE→FE 매퍼 ═══════ */
function mapItemStatusToOrderStatus(s: BeOutboundOrderItemRes['status']): OrderStatus {
  switch (s) {
    case 'pending': return 'draft';
    case 'picking': return 'in_progress';
    case 'completed': return 'completed';
    case 'shortage': return 'partial';
    default: return 'draft';
  }
}
function mapPickingItemStatus(s: BePickingListItemRes['status']): PickingStatus {
  switch (s) {
    case 'pending': return 'pending';
    case 'picking': return 'in_progress';
    case 'completed': return 'completed';
    case 'shortage': return 'partial';
    default: return 'pending';
  }
}

function mapBeOutboundOrder(b: BeOutboundOrderRes): OutboundOrder {
  // 반품 출고는 store_name 이 null — supplier_name 으로 표시
  const isReturn = b.originType === 'return';
  return {
    id: b.id,
    order_no: b.orderNo,
    store_name: b.storeName ?? (isReturn ? (b.supplierName ?? '-') : '-'),
    warehouse_name: b.warehouseName ?? '-',
    expected_date: b.scheduledDate ?? '',
    shipping_address: '',
    status: b.status,
    source: isReturn ? 'return' : 'ERP',
    created_by: '',
    created_at: (b.createdAt ?? '').slice(0, 10),
    assigned_to: b.assignedTo ?? null,
    assigned_to_name: b.assignedToName ?? null,
    total_qty: b.totalQty ?? 0,
    origin_type: b.originType ?? null,
    origin_id: b.originId ?? null,
    return_from_order_no: b.returnFromOrderNo ?? null,
    destination_type: b.destinationType ?? null,
    supplier_id: b.supplierId ?? null,
    supplier_name: b.supplierName ?? null,
    return_reason: b.returnReason ?? null,
  };
}

function mapBeOutboundDetail(b: BeOutboundOrderDetailRes): OutboundOrder {
  const base = mapBeOutboundOrder(b);
  return {
    ...base,
    shipping_address: b.shippingAddress ?? '',
    // BE 가 이름을 직접 내려주므로 UUID 매핑(useUserNameMap)을 거치지 않음
    created_by_name: b.createdByName,
    approved_by_name: b.approvedByName,
    approved_at: b.approvedAt,
    assigned_to: b.assignedTo ?? null,
    assigned_to_name: b.assignedToName ?? null,
    total_items: b.items?.length ?? 0,
    picking_list_ids: b.pickingListIds ?? [],
    source_sales_order_ids: b.sourceSalesOrderIds ?? [],
    source_sales_order_nos: b.sourceSalesOrderNos ?? [],
  };
}

function mapBeOutboundItem(orderId: string, b: BeOutboundOrderItemRes): OutboundOrderItem {
  return {
    id: b.id,
    order_id: orderId,
    product_id: b.productId,
    sku: b.sku ?? '-',
    product_name: b.productName ?? '-',
    ordered_qty: b.orderedQty,
    picked_qty: b.pickedQty ?? 0,
    unit_price: typeof b.unitPrice === 'string' ? Number(b.unitPrice) : (b.unitPrice ?? 0),
    status: mapItemStatusToOrderStatus(b.status),
  };
}

function mapBeErpSalesOrder(b: BeErpSalesOrderRes): ErpSalesOrder {
  return {
    id: b.id,
    so_no: b.soNo,
    store_id: b.storeId,
    store_name: b.storeName ?? '-',
    status: b.status,
    order_date: b.orderDate,
    scheduled_date: b.scheduledDate ?? '',
    shipping_address: b.shippingAddress ?? '',
    note: b.note ?? undefined,
    items: [],
    already_converted: b.alreadyConverted ?? false,
    process_status: b.processStatus ?? 'NOT_STARTED',
    dispatch_progress_percent: b.dispatchProgressPercent ?? 0,
    item_count: b.itemCount ?? 0,
    total_ordered_qty: b.totalOrderedQty ?? 0,
    item_preview: (b.itemPreview ?? []).map((p) => ({
      product_id: p.productId,
      product_name: p.productName ?? '-',
      qty: p.qty ?? 0,
    })),
  };
}

function mapBePickingList(b: BePickingListRes): PickingList {
  const outboundOrderIds = (
    (Array.isArray(b.outboundOrderIds) ? b.outboundOrderIds : null)
    ?? (Array.isArray(b.outboundIds) ? b.outboundIds : null)
    ?? (b.outboundOrderId ? [b.outboundOrderId] : [])
  )
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  const outboundCount = b.outboundCount
    ?? b.outboundOrderCount
    ?? outboundOrderIds.length;

  return {
    id: b.id,
    picking_no: b.pickingNo,
    warehouse_name: b.warehouseName ?? '-',
    assignee: b.assignedToName ?? '-',
    assigned_to: b.assignedTo ?? undefined,
    outbound_order_ids: outboundOrderIds,
    outbound_count: outboundCount,
    status: b.status,
    started_at: b.startedAt,
    completed_at: b.completedAt,
    created_at: b.createdAt,
  };
}

function mapBePickingItem(pickingId: string, b: BePickingListItemRes): PickingItem {
  const zone = b.zoneName ?? '-';
  const rack = b.rackCode ?? '-';
  // BE 가 floorNo (층) 까지 내려주므로 같은 랙의 다른 층 품목이 별도 location 으로 구분된다.
  const levelNo = b.floorNo ?? 1;
  const location_code = ensureLocationCode(b.locationCode ?? '', {
    zone: zone.slice(0, 1).toUpperCase(),
    rack,
    rowNo: 1,
    levelNo,
  });
  return {
    id: b.id,
    picking_id: pickingId,
    location_code,
    location_id: b.locationId ?? undefined,
    zone_code: zone,
    rack_code: rack,
    row_no: 1,
    level_no: levelNo,
    sku: b.sku ?? '-',
    product_name: b.productName ?? '-',
    target_qty: b.qty,
    picked_qty: b.pickedQty ?? 0,
    lot_no: b.lotNo ?? '',
    status: mapPickingItemStatus(b.status),
  };
}

/* ═══════ 입고 지시서: api/inbound.ts 로 이동 ═══════ */

/* ═══════ 출고 지시서 ═══════ */
export const getOutboundOrders = async (
  params?: { status?: string | string[]; originType?: 'return'; excludeOriginType?: 'return' },
): Promise<OutboundOrder[]> => {
  // 실 BE: stock-service /outbound/findAll (Page 응답)
  const status = Array.isArray(params?.status) ? params!.status[0] : params?.status;
  const query: Record<string, unknown> = { status, size: 100 };
  if (params?.originType) query.originType = params.originType;
  if (params?.excludeOriginType) query.excludeOriginType = params.excludeOriginType;
  const res = await apiClient.get<BePage<BeOutboundOrderRes> | BeOutboundOrderRes[]>(
    '/stock-service/outbound/findAll',
    { params: query },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeOutboundOrder);
};

/** POST /stock-service/outbound/orders/search — productIds/status/창고/출고처로 좁힘.
 *  서버 페이징 지원이지만 화면이 클라이언트 페이징이라 size를 크게 받음. */
export const searchOutboundOrders = async (
  filters: {
    status?: string;
    warehouseId?: string;
    storeId?: string;
    productIds?: string[];
    originType?: 'return';
    excludeOriginType?: 'return';
  },
  page = 0,
  size = 1000,
  sort?: string,
): Promise<OutboundOrder[]> => {
  const query: Record<string, string | number> = { page, size };
  if (sort) query.sort = sort;
  const body: Record<string, unknown> = {};
  if (filters.status) body.status = filters.status;
  if (filters.warehouseId) body.warehouseId = filters.warehouseId;
  if (filters.storeId) body.storeId = filters.storeId;
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;
  if (filters.originType) body.originType = filters.originType;
  if (filters.excludeOriginType) body.excludeOriginType = filters.excludeOriginType;
  const res = await apiClient.post<BePage<BeOutboundOrderRes> | BeOutboundOrderRes[]>(
    '/stock-service/outbound/orders/search',
    body,
    { params: query },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeOutboundOrder);
};

// 상세 캐시: items 조회 시 재요청 회피용
const outboundDetailCache = new Map<string, { order: OutboundOrder; items: OutboundOrderItem[]; ts: number }>();
const DETAIL_TTL_MS = 2_000;

async function fetchOutboundDetail(id: string): Promise<{ order: OutboundOrder; items: OutboundOrderItem[] }> {
  const cached = outboundDetailCache.get(id);
  if (cached && Date.now() - cached.ts < DETAIL_TTL_MS) {
    return { order: cached.order, items: cached.items };
  }
  const res = await apiClient.get<BeOutboundOrderDetailRes>(`/stock-service/outbound/detail/${id}`);
  const order = mapBeOutboundDetail(res.data);
  const items = (res.data.items ?? []).map((it) => mapBeOutboundItem(id, it));
  outboundDetailCache.set(id, { order, items, ts: Date.now() });
  return { order, items };
}

export const getOutboundOrder = async (id: string): Promise<OutboundOrder | undefined> => {
  const { order } = await fetchOutboundDetail(id);
  return order;
};

export const getOutboundItems = async (orderId: string): Promise<OutboundOrderItem[]> => {
  const { items } = await fetchOutboundDetail(orderId);
  return items;
};

/** POST /stock-service/outbound/orders/{id}/items/search — productIds 비면 전체 반환 */
export const searchOutboundOrderItems = async (
  orderId: string,
  productIds: string[],
): Promise<OutboundOrderItem[]> => {
  const res = await apiClient.post<BeOutboundOrderItemRes[]>(
    `/stock-service/outbound/orders/${orderId}/items/search`,
    { productIds },
  );
  return (res.data ?? []).map((it) => mapBeOutboundItem(orderId, it));
};

export const createOutboundOrder = async (_data: {
  store_code: string; warehouse_code: string; expected_date: string; shipping_address: string;
  items: { sku: string; product_name: string; qty: number; unit_price: number }[];
}): Promise<OutboundOrder> => {
  // 실 BE: 직접 출고지시서 생성 엔드포인트는 없음 (ERP 수주서 기반만 지원)
  throw new Error('실 백엔드에서는 ERP 수주서 기반으로만 출고 지시서를 생성할 수 있습니다.');
};

export const approveOutboundOrder = async (id: string): Promise<void> => {
  await apiClient.patch(`/stock-service/outbound/${id}/approve`);
  outboundDetailCache.delete(id);
};

export const cancelOutboundOrder = async (id: string): Promise<void> => {
  await apiClient.patch(`/stock-service/outbound/${id}/cancel`);
  outboundDetailCache.delete(id);
};

export const confirmOutboundOrder = async (id: string): Promise<void> => {
  // 실 BE: 출고확정 = 출고전표 생성 (POST /outbound/dispatches)
  await apiClient.post('/stock-service/outbound/dispatches', { outboundOrderId: id });
  outboundDetailCache.delete(id);
};

/* ── 출고 전표(Dispatch) 조회 ── */
interface BeOutboundDispatchItemRes {
  id: string;
  productId: string | null;
  sku: string | null;
  productName: string | null;
  qty: number | null;
  unitPrice: number | string | null;
  lotNo: string | null;
  locationCode: string | null;
}
interface BeOutboundDispatchRes {
  id: string;
  orderNo: string | null;
  dispatchNo: string;
  warehouseName: string | null;
  storeName: string | null;
  dispatchedBy: string | null;
  dispatchedByName: string | null;
  dispatchedAt: string | null;
  createdAt: string | null;
  items: BeOutboundDispatchItemRes[];
  originType?: string | null;
  originRefs?: { id: string; no: string }[] | null;
}
function mapBeOutboundDispatchItem(b: BeOutboundDispatchItemRes): OutboundDispatchItem {
  return {
    id: b.id,
    product_id: b.productId ?? undefined,
    sku: b.sku ?? '',
    product_name: b.productName ?? '-',
    qty: b.qty ?? 0,
    unit_price: typeof b.unitPrice === 'string' ? Number(b.unitPrice) : (b.unitPrice ?? 0),
    lot_no: b.lotNo ?? undefined,
    location_code: b.locationCode ?? undefined,
  };
}
function mapBeOutboundDispatch(b: BeOutboundDispatchRes): OutboundDispatch {
  return {
    id: b.id,
    order_no: b.orderNo ?? '',
    dispatch_no: b.dispatchNo,
    warehouse_name: b.warehouseName ?? '-',
    store_name: b.storeName ?? '-',
    dispatched_by: b.dispatchedBy ?? null,
    dispatched_by_name: b.dispatchedByName ?? null,
    dispatched_at: b.dispatchedAt ?? '',
    created_at: b.createdAt,
    items: (b.items ?? []).map(mapBeOutboundDispatchItem),
    origin_type: b.originType ?? null,
    origin_refs: b.originRefs ?? [],
  };
}
export const getOutboundDispatch = async (orderId: string): Promise<OutboundDispatch> => {
  const res = await apiClient.get<BeOutboundDispatchRes>(`/stock-service/outbound/orders/${orderId}/dispatch`);
  return mapBeOutboundDispatch(res.data);
};

/* ── 출고 전표 목록 (페이지네이션) ── */
export type OutboundDispatchOriginType = 'sales_order' | 'manual';

export interface OutboundDispatchOriginRef {
  id: string;
  no: string;
}

export interface OutboundDispatchListItem {
  id: string;
  dispatch_no: string;
  dispatched_at: string;
  created_at: string | null;
  outbound_order_id: string;
  order_no: string;
  origin_type: OutboundDispatchOriginType | null;
  /** 분할 출고 시 N개. 길이 0/1/N 가능. */
  origin_refs: OutboundDispatchOriginRef[];
  warehouse_id: string | null;
  warehouse_name: string | null;
  store_id: string | null;
  store_name: string | null;
  dispatched_by: string | null;
  dispatched_by_name: string | null;
}

export interface OutboundDispatchListParams {
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
  originType?: OutboundDispatchOriginType | 'ALL';
  dispatchNoKeyword?: string;
  orderNoKeyword?: string;
  page?: number;
  size?: number;
  sort?: string;
}

interface BeDispatchOriginRef { id: string; no: string }
interface BeOutboundDispatchListItem {
  id: string;
  dispatchNo: string;
  dispatchedAt: string;
  createdAt: string | null;
  outboundOrderId: string;
  orderNo: string;
  originType: OutboundDispatchOriginType | null;
  originRefs: BeDispatchOriginRef[] | null;
  warehouseId: string | null;
  warehouseName: string | null;
  storeId: string | null;
  storeName: string | null;
  dispatchedBy: string | null;
  dispatchedByName: string | null;
}

interface BeDispatchListPage {
  content: BeOutboundDispatchListItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

function mapBeDispatchListItem(b: BeOutboundDispatchListItem): OutboundDispatchListItem {
  return {
    id: b.id,
    dispatch_no: b.dispatchNo,
    dispatched_at: b.dispatchedAt,
    created_at: b.createdAt,
    outbound_order_id: b.outboundOrderId,
    order_no: b.orderNo,
    origin_type: b.originType,
    origin_refs: (b.originRefs ?? []).map((r) => ({ id: r.id, no: r.no })),
    warehouse_id: b.warehouseId,
    warehouse_name: b.warehouseName,
    store_id: b.storeId,
    store_name: b.storeName,
    dispatched_by: b.dispatchedBy,
    dispatched_by_name: b.dispatchedByName,
  };
}

export interface OutboundDispatchListPage {
  content: OutboundDispatchListItem[];
  total_elements: number;
  total_pages: number;
  number: number;
  size: number;
}

/** GET /stock-service/outbound/dispatches — 출고 전표 목록 (페이지네이션) */
/** POST /stock-service/outbound/dispatches/search — 출고 전표 검색 (productIds 포함). */
export const searchOutboundDispatches = async (
  filters: OutboundDispatchListParams & { productIds?: string[] } = {},
): Promise<OutboundDispatchListPage> => {
  const query: Record<string, string | number> = {
    page: filters.page ?? 0,
    size: filters.size ?? 20,
    sort: filters.sort ?? 'dispatchedAt,desc',
  };
  const body: Record<string, unknown> = {};
  if (filters.dateFrom) body.dateFrom = filters.dateFrom;
  if (filters.dateTo) body.dateTo = filters.dateTo;
  if (filters.warehouseId) body.warehouseId = filters.warehouseId;
  if (filters.originType && filters.originType !== 'ALL') body.originType = filters.originType;
  if (filters.dispatchNoKeyword?.trim()) body.dispatchNoKeyword = filters.dispatchNoKeyword.trim();
  if (filters.orderNoKeyword?.trim()) body.orderNoKeyword = filters.orderNoKeyword.trim();
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;

  const res = await apiClient.post<BeDispatchListPage>(
    '/stock-service/outbound/dispatches/search',
    body,
    { params: query },
  );
  const d = res.data;
  return {
    content: (d.content ?? []).map(mapBeDispatchListItem),
    total_elements: d.totalElements ?? 0,
    total_pages: d.totalPages ?? 0,
    number: d.number ?? 0,
    size: d.size ?? 20,
  };
};

export const getOutboundDispatches = async (params: OutboundDispatchListParams = {}): Promise<OutboundDispatchListPage> => {
  const query: Record<string, string | number> = {
    page: params.page ?? 0,
    size: params.size ?? 20,
    sort: params.sort ?? 'dispatchedAt,desc',
  };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  if (params.warehouseId) query.warehouseId = params.warehouseId;
  if (params.originType && params.originType !== 'ALL') query.originType = params.originType;
  if (params.dispatchNoKeyword?.trim()) query.dispatchNoKeyword = params.dispatchNoKeyword.trim();
  if (params.orderNoKeyword?.trim()) query.orderNoKeyword = params.orderNoKeyword.trim();

  const res = await apiClient.get<BeDispatchListPage>('/stock-service/outbound/dispatches', { params: query });
  const d = res.data;
  return {
    content: (d.content ?? []).map(mapBeDispatchListItem),
    total_elements: d.totalElements ?? 0,
    total_pages: d.totalPages ?? 0,
    number: d.number ?? 0,
    size: d.size ?? 20,
  };
};

// 잔여 출고 처리 — 출고확정 후 좀비처럼 남은 reserved 재고를 강제 release
// 운영자가 실재고 0임을 확인한 후에만 사용해야 함
export const forceReleaseResidual = async (id: string): Promise<{ residualLocations: number }> => {
  const res = await apiClient.post<{ residualLocations: number }>(
    `/stock-service/outbound/${id}/force-release-residual`,
  );
  outboundDetailCache.delete(id);
  return res.data;
};

/** 수동 출고지시서 생성 — ERP 수주서 없이 거래처/창고/품목 직접 입력. draft 상태로 저장. */
export interface CreateManualOutboundInput {
  storeId: string;
  warehouseId: string;
  scheduledDate: string;  // YYYY-MM-DD
  shippingAddress?: string;
  note?: string;
  items: {
    productId: string;
    qty: number;
    unitPrice?: number | null;
  }[];
}

export const createManualOutbound = async (input: CreateManualOutboundInput): Promise<OutboundOrder> => {
  const res = await apiClient.post<BeOutboundOrderRes>('/stock-service/outbound/manual', input);
  return mapBeOutboundOrder(res.data);
};

/* ─── 반품 출고 ─── */
export interface CreateReturnOutboundInput {
  inboundOrderId: string;        // 원본 입고지시서 (필수)
  warehouseId: string;            // 출고 창고 (= 그 입고가 들어간 창고)
  supplierId: string;             // 반품 대상 입고처
  reason: string;                 // 사유
  returnMethod?: 'courier' | 'pickup';
  note?: string;
  scheduledDate?: string;         // YYYY-MM-DD, null 이면 BE 기본값(오늘)
  items: { productId: string; qty: number }[];
}

/** POST /stock-service/outbound/return — 반품 출고 지시서 생성. */
export const createReturnOutbound = async (input: CreateReturnOutboundInput): Promise<OutboundOrder> => {
  const res = await apiClient.post<BeOutboundOrderRes>('/stock-service/outbound/return', input);
  return mapBeOutboundOrder(res.data);
};

/* ═══════ 기타 입출고 ═══════ */

interface BeEtcInOutRes {
  id: string; orderNo: string; ioType: string; direction: string;
  warehouseId: string | null; warehouseName: string | null;
  status: string; note: string | null;
  supplierId: string | null; supplierName: string | null;
  storeId: string | null; storeName: string | null;
  createdBy: string | null; createdAt: string | null;
  // 모바일 흐름 도입 후 추가된 감사 필드
  assignedTo: string | null;
  assignedToName?: string | null;
  approvedBy: string | null;
  approvedByName?: string | null;
  approvedAt: string | null;
  completedBy: string | null;
  completedByName?: string | null;
  completedAt: string | null;
  // 재고 부족으로 취소된 연결 출고지시서
  cancellationLinks?: { outboundOrderId: string; orderNo: string; cancelledAt: string }[] | null;
}

interface BeEtcInOutItemRes {
  id: string; productId: string; productName: string | null;
  locationId: string; qty: number; lotNo: string | null;
  pickedQty?: number | null;
  condition: string | null; note: string | null;
  defectQty: number | null;
  processedQty: number; status: string;
  defectLocationId?: string | null;
  defectLocationCode?: string | null;
  defaultDefectLocationId?: string | null;
  defaultDefectLocationCode?: string | null;
  // BE 보강분 — 사람이 읽는 위치 코드
  locationCode?: string | null;
  rackCode?: string | null;
  zoneCode?: string | null;
}

function mapBeEtcInOut(b: BeEtcInOutRes): EtcInOutOrder {
  return {
    id: b.id, order_no: b.orderNo,
    io_type: b.ioType as EtcInOutIoType,
    direction: (b.direction ?? (b.ioType?.endsWith('_in') ? 'in' : 'out')) as 'in' | 'out',
    warehouse_id: b.warehouseId ?? '',
    warehouse_name: b.warehouseName ?? '-',
    status: b.status as EtcInOutStatus,
    note: b.note ?? null,
    supplier_id: b.supplierId ?? null,
    supplier_name: b.supplierName ?? null,
    store_id: b.storeId ?? null,
    store_name: b.storeName ?? null,
    created_by: b.createdBy ?? '',
    created_at: (b.createdAt ?? '').slice(0, 10),
    assigned_to: b.assignedTo ?? null,
    assigned_to_name: b.assignedToName ?? null,
    approved_by: b.approvedBy ?? null,
    approved_by_name: b.approvedByName ?? null,
    approved_at: b.approvedAt ?? null,
    completed_by: b.completedBy ?? null,
    completed_by_name: b.completedByName ?? null,
    completed_at: b.completedAt ?? null,
    cancellation_links: (b.cancellationLinks ?? []).map((c) => ({
      outbound_order_id: c.outboundOrderId,
      order_no: c.orderNo,
      cancelled_at: c.cancelledAt,
    })),
  };
}

function mapBeEtcInOutItem(b: BeEtcInOutItemRes): EtcInOutItem {
  return {
    id: b.id, product_id: b.productId,
    product_name: b.productName ?? '-',
    location_id: b.locationId,
    location_code: b.locationCode ?? null,
    rack_code: b.rackCode ?? null,
    zone_code: b.zoneCode ?? null,
    qty: b.qty,
    picked_qty: b.pickedQty ?? 0,
    lot_no: b.lotNo ?? null,
    condition: (b.condition ?? 'normal') as ItemCondition,
    defect_qty: b.defectQty ?? 0,
    note: b.note ?? null,
    processed_qty: b.processedQty ?? 0,
    defect_location_id: b.defectLocationId ?? null,
    defect_location_code: b.defectLocationCode ?? null,
    default_defect_location_id: b.defaultDefectLocationId ?? null,
    default_defect_location_code: b.defaultDefectLocationCode ?? null,
    status: b.status ?? 'pending',
  };
}

export interface CreateEtcInOutInput {
  warehouseId: string;
  ioType: EtcInOutIoType;
  note?: string;
  supplierId?: string | null;
  /** 출고처 (sample_out / etc_out / dispose_out 시 필수) */
  storeId?: string | null;
  items?: {
    productId: string;
    locationId: string;
    qty: number;
    processedQty?: number;
    defectQty?: number;
    defectLocationId?: string | null;
    lotNo?: string | null;
    condition?: ItemCondition;
    defectReason?: string | null;
    note?: string;
  }[];
  /** 출고지시서 취소 후 등록 시 — 백엔드가 cancellation_link 자동 저장 + 메일 본문 자동 생성 */
  cancelledOutboundIds?: string[];
}

export const getEtcInOutOrders = async (): Promise<EtcInOutOrder[]> => {
  const res = await apiClient.get<BeEtcInOutRes[] | { content: BeEtcInOutRes[] }>(
    '/stock-service/etc-inout/list',
    { params: { size: 200 } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeEtcInOut);
};

export const getEtcInOutDetail = async (id: string): Promise<EtcInOutOrder | undefined> => {
  const res = await apiClient.get<BeEtcInOutRes>(`/stock-service/etc-inout/detail/${id}`);
  return mapBeEtcInOut(res.data);
};

export const getEtcInOutItems = async (id: string): Promise<EtcInOutItem[]> => {
  const res = await apiClient.get<BeEtcInOutItemRes[]>(`/stock-service/etc-inout/${id}/items`);
  return (res.data ?? []).map(mapBeEtcInOutItem);
};

/** PUT /etc-inout/{id}/items/{itemId} — 품목 수정 (정상/불량 수량 갱신, draft 만 허용) */
export const updateEtcInOutItem = async (
  orderId: string,
  itemId: string,
  payload: { qty: number; processedQty?: number; defectQty?: number; defectLocationId?: string | null },
): Promise<void> => {
  await apiClient.put(`/stock-service/etc-inout/${orderId}/items/${itemId}`, payload);
};

export const createEtcInOutOrder = async (input: CreateEtcInOutInput): Promise<EtcInOutOrder> => {
  const res = await apiClient.post<BeEtcInOutRes | string>('/stock-service/etc-inout/create', input);
  if (typeof res.data === 'string') {
    const detail = await apiClient.get<BeEtcInOutRes>(`/stock-service/etc-inout/detail/${res.data}`);
    return mapBeEtcInOut(detail.data);
  }
  return mapBeEtcInOut(res.data);
};

/** PUT /etc-inout/approve/{id} — draft → approved + 작업자 자동 배정 */
export const approveEtcInOut = async (id: string): Promise<void> => {
  await apiClient.put(`/stock-service/etc-inout/approve/${id}`);
};

export const completeEtcInOut = async (id: string): Promise<void> => {
  await apiClient.put(`/stock-service/etc-inout/complete/${id}`);
};

export const cancelEtcInOut = async (id: string): Promise<void> => {
  await apiClient.put(`/stock-service/etc-inout/cancel/${id}`);
};

/* ═══════ 기타출고 — 가용재고 부족 보정용 (draft 출고지시서 합산, 취소 후보) ═══════ */

/** 창고별 draft 상태 출고지시서가 잡고 있는 상품별 합계 + 지시서별 detail (가용재고 표시 + 취소 후보용)
 *  - GET /outbound/findAll?status=draft&warehouseId={id} 는 헤더만 반환 → 각 order detail 별도 호출
 *  - by-rack 응답의 availableQty 는 draft 미차감이라 프론트가 직접 차감해야 함 */
export interface DraftOutboundDigest {
  /** productId → 잡혀있는 합계 */
  demandByProduct: Map<string, number>;
  /** 출고지시서 단위 상세 — 취소 후보 모달용 */
  orders: {
    order: OutboundOrder;
    items: OutboundOrderItem[];
  }[];
}
export const getDraftOutboundsDigest = async (warehouseId: string): Promise<DraftOutboundDigest> => {
  // 1) 헤더 페이지 조회 — draft + approved 둘 다 (취소 가능한 상태 전부)
  const [draftRes, approvedRes] = await Promise.all([
    apiClient.get<BePage<BeOutboundOrderRes> | BeOutboundOrderRes[]>(
      '/stock-service/outbound/findAll',
      { params: { status: 'draft', warehouseId, size: 200 } },
    ),
    apiClient.get<BePage<BeOutboundOrderRes> | BeOutboundOrderRes[]>(
      '/stock-service/outbound/findAll',
      { params: { status: 'approved', warehouseId, size: 200 } },
    ),
  ]);
  const draftHeaders = Array.isArray(draftRes.data) ? draftRes.data : (draftRes.data.content ?? []);
  const approvedHeaders = Array.isArray(approvedRes.data) ? approvedRes.data : (approvedRes.data.content ?? []);
  const headers = [...draftHeaders, ...approvedHeaders];

  // 2) 각 지시서의 detail 병렬 조회 (캐시 활용)
  const orders = await Promise.all(
    headers.map(async (h) => {
      try {
        return await fetchOutboundDetail(h.id);
      } catch {
        return null;
      }
    }),
  );

  // 3) productId 별 합산 — draft만! approved는 BE의 available_qty 에 이미 reserved로 차감돼 있음 (이중차감 방지)
  //    orders 목록(취소 후보 모달용)은 draft + approved 둘 다 그대로 유지
  const demandByProduct = new Map<string, number>();
  const validOrders = orders.filter((o): o is { order: OutboundOrder; items: OutboundOrderItem[] } => o !== null);
  validOrders.forEach(({ order, items }) => {
    if (order.status !== 'draft') return;
    items.forEach((it) => {
      if (!it.product_id) return;
      demandByProduct.set(it.product_id, (demandByProduct.get(it.product_id) ?? 0) + (it.ordered_qty ?? 0));
    });
  });
  return { demandByProduct, orders: validOrders };
};

/** 기타출고 가용재고 부족 시 — 취소 가능한 출고지시서 후보 조회 */
export interface CancellationCandidate {
  outboundOrderId: string;
  orderNo: string;
  scheduledDate: string | null;
  storeId: string | null;
  storeName: string | null;
  reservedQty: number;
  status: 'draft' | 'approved';
}
export const getEtcInoutCancellationCandidates = async (etcOrderId: string): Promise<CancellationCandidate[]> => {
  const res = await apiClient.get<CancellationCandidate[] | { content?: CancellationCandidate[] }>(
    `/stock-service/etc-inout/${etcOrderId}/cancellation-candidates`,
  );
  return Array.isArray(res.data) ? res.data : (res.data.content ?? []);
};

/** 선택한 출고지시서들을 일괄 취소하고 기타출고 진행 가능 상태로 만듦 */
export const cancelOutboundsForEtcInout = async (etcOrderId: string, outboundOrderIds: string[]): Promise<void> => {
  await apiClient.post(`/stock-service/etc-inout/${etcOrderId}/cancel-outbounds`, outboundOrderIds);
};

/** 기타출고 — 입고 요청 메일 미리보기 양식 받기 (백엔드 SMTP 자동 발송 방식)
 *  운영자가 폼에서 편집 후 send-inbound-request 로 전송 */
export interface EtcInoutInboundRequestPreview {
  recipient: string;
  senderName: string;
  subject: string;
  body: string;
}
export const getEtcInoutInboundRequestPreview = async (id: string): Promise<EtcInoutInboundRequestPreview> => {
  const res = await apiClient.get<EtcInoutInboundRequestPreview>(`/stock-service/etc-inout/${id}/inbound-request-preview`);
  return res.data;
};

/** 기타출고 — 백엔드 SMTP 로 입고 요청 메일 발송 */
export interface EtcInoutSendInboundRequestInput {
  recipient?: string;
  senderName?: string;
  subject?: string;
  body?: string;
  shortageItems?: {
    productId: string;
    productName: string;
    requested: number;
    available: number;
    shortage: number;
  }[];
}
export interface EtcInoutSendInboundRequestRes {
  emailLogId: string;
  sentAt: string | null;
  status: 'sent' | 'failed';
  errorMessage?: string;
}
export const sendEtcInoutInboundRequest = async (
  id: string,
  input: EtcInoutSendInboundRequestInput,
): Promise<EtcInoutSendInboundRequestRes> => {
  const res = await apiClient.post<EtcInoutSendInboundRequestRes>(
    `/stock-service/etc-inout/${id}/send-inbound-request`,
    input,
  );
  return res.data;
};

/** 기타출고 — 입고 요청 메일 발송 이력 */
export interface EtcInoutEmailHistoryItem {
  id: string;
  sentAt: string | null;
  createdAt: string;
  sentByName: string | null;
  sentByEmail: string | null;
  recipient: string;
  subject: string;
  status: 'sent' | 'failed';
  errorMessage: string | null;
}
export const getEtcInoutEmailHistory = async (id: string): Promise<EtcInoutEmailHistoryItem[]> => {
  const res = await apiClient.get<EtcInoutEmailHistoryItem[]>(`/stock-service/etc-inout/${id}/email-history`);
  return res.data ?? [];
};

/* ── 기타입출고 출고 사이드: 재고 부족 처리 ── */

interface BeCancellationCandidate {
  outboundOrderId: string;
  orderNo: string;
  storeName: string | null;
  expectedDate: string | null;
  reservedQty: number;
}

/** GET /etc-inout/{id}/cancellation-candidates — 재고 부족 시 취소 후보 출고지시서 (출고일 먼 순) */
export const getEtcInOutCancellationCandidates = async (
  id: string,
): Promise<EtcInOutCancellationCandidate[]> => {
  const res = await apiClient.get<BeCancellationCandidate[]>(
    `/stock-service/etc-inout/${id}/cancellation-candidates`,
  );
  return (res.data ?? []).map((c) => ({
    outbound_order_id: c.outboundOrderId,
    order_no: c.orderNo,
    store_name: c.storeName ?? '-',
    expected_date: c.expectedDate,
    reserved_qty: c.reservedQty,
  }));
};

/** POST /etc-inout/{id}/cancel-outbounds — 선택한 출고지시서들 취소 + 링크 기록 */
export const cancelLinkedOutbounds = async (
  id: string,
  outboundOrderIds: string[],
): Promise<void> => {
  await apiClient.post(`/stock-service/etc-inout/${id}/cancel-outbounds`, outboundOrderIds);
};

/** POST /etc-inout/{id}/inbound-request — OMS 입고 요청 (현재 stub) */
export const requestEtcInOutInbound = async (id: string): Promise<void> => {
  await apiClient.post(`/stock-service/etc-inout/${id}/inbound-request`);
};

/** GET /etc-inout/sample-suggestions — 최근 sample_in으로 들어온 추천 상품 (백엔드 미구현 시 404 → 빈 배열) */
export const getEtcInOutSampleSuggestions = async (
  warehouseId: string,
): Promise<EtcInOutSampleSuggestion[]> => {
  try {
    const res = await apiClient.get<{
      productId: string; sku: string | null; productName: string | null;
      availableQty: number; lastInAt: string | null;
    }[]>('/stock-service/etc-inout/sample-suggestions', { params: { warehouseId } });
    return (res.data ?? []).map((s) => ({
      product_id: s.productId,
      sku: s.sku ?? '-',
      product_name: s.productName ?? '-',
      available_qty: s.availableQty,
      last_in_at: s.lastInAt,
    }));
  } catch {
    return [];
  }
};

/** STOCK_SHORTAGE 에러 응답 타입 가드 */
export const isStockShortageError = (err: unknown): err is { response: { status: 409; data: EtcInOutStockShortageError } } => {
  const e = err as { response?: { status?: number; data?: { error?: string } } };
  return e?.response?.status === 409 && e?.response?.data?.error === 'STOCK_SHORTAGE';
};

/* ═══════ 피킹 ═══════ */
const pickingDetailCache = new Map<string, { picking: PickingList; items: PickingItem[]; ts: number }>();

async function fetchPickingDetail(id: string): Promise<{ picking: PickingList; items: PickingItem[] }> {
  const cached = pickingDetailCache.get(id);
  if (cached && Date.now() - cached.ts < DETAIL_TTL_MS) {
    return { picking: cached.picking, items: cached.items };
  }
  const res = await apiClient.get<BePickingListDetailRes>(`/stock-service/pickingList/detail/${id}`);
  const picking = mapBePickingList(res.data);
  const items = (res.data.items ?? []).map((it) => mapBePickingItem(id, it));
  pickingDetailCache.set(id, { picking, items, ts: Date.now() });
  return { picking, items };
}

export const getPickingLists = async (): Promise<PickingList[]> => {
  const res = await apiClient.get<BePage<BePickingListRes> | BePickingListRes[]>(
    '/stock-service/pickingList/findAll',
    { params: { size: 100 } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBePickingList);
};

/** POST /stock-service/pickingList/search — productIds/status/warehouseId로 좁힘. */
export const searchPickingLists = async (
  filters: { status?: string; warehouseId?: string; productIds?: string[] },
  page = 0,
  size = 1000,
  sort?: string,
): Promise<PickingList[]> => {
  const query: Record<string, string | number> = { page, size };
  if (sort) query.sort = sort;
  const body: Record<string, unknown> = {};
  if (filters.status) body.status = filters.status;
  if (filters.warehouseId) body.warehouseId = filters.warehouseId;
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;
  const res = await apiClient.post<BePage<BePickingListRes> | BePickingListRes[]>(
    '/stock-service/pickingList/search',
    body,
    { params: query },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBePickingList);
};

export const getPickingList = async (id: string): Promise<PickingList | undefined> => {
  const { picking } = await fetchPickingDetail(id);
  return picking;
};

export const getPickingItems = async (pickingId: string): Promise<PickingItem[]> => {
  const { items } = await fetchPickingDetail(pickingId);
  return items;
};

/** POST /stock-service/pickingList/{id}/items/search — productIds 비면 전체 반환 */
export const searchPickingListItems = async (
  pickingId: string,
  productIds: string[],
): Promise<PickingItem[]> => {
  const res = await apiClient.post<BePickingListItemRes[]>(
    `/stock-service/pickingList/${pickingId}/items/search`,
    { productIds },
  );
  return (res.data ?? []).map((it) => mapBePickingItem(pickingId, it));
};

export const completePickingList = async (id: string, items: { id: string; picked_qty: number }[]): Promise<void> => {
  // 실 BE: 품목별 PATCH /pickingList/{id}/items/{itemId}/pick → 마지막에 PATCH /pickingList/{id}/complete
  for (const row of items) {
    await apiClient.patch(
      `/stock-service/pickingList/${id}/items/${row.id}/pick`,
      { pickedQty: row.picked_qty },
    );
  }
  await apiClient.patch(`/stock-service/pickingList/${id}/complete`);
  pickingDetailCache.delete(id);
};

/* ═══════ 이동 지시서 ═══════ */

interface BeTransferOrderRes {
  id: string; orderNo: string;
  fromWarehouseId: string | null; fromWarehouseName: string | null;
  toWarehouseId: string | null; toWarehouseName: string | null;
  expectedDate: string | null; note: string | null;
  status: string; createdBy: string | null;
  approvedBy: string | null; assignedTo?: string | null; assignedToName?: string | null; approvedAt: string | null;
  createdAt: string | null; totalItems: number; totalQty: number;
  items?: BeTransferItemRes[];
}

interface BeTransferItemRes {
  id: string; transferOrderId: string; productId: string;
  productName: string | null; fromLocationId: string; toLocationId: string;
  fromLocationCode: string | null; toLocationCode: string | null;
  orderedQty: number; processedQty: number; defectQty: number;
  lotNo: string | null; status: string;
}

function mapBeTransferOrder(b: BeTransferOrderRes): TransferOrder {
  return {
    id: b.id, order_no: b.orderNo,
    from_warehouse_id: b.fromWarehouseId ?? '',
    from_warehouse_name: b.fromWarehouseName ?? '-',
    to_warehouse_id: b.toWarehouseId ?? '',
    to_warehouse_name: b.toWarehouseName ?? '-',
    expected_date: b.expectedDate ?? null,
    note: b.note ?? null,
    status: b.status as TransferOrderStatus,
    created_by: b.createdBy ?? '',
    approved_by: b.approvedBy ?? null,
    assigned_to: b.assignedTo ?? null,
    assigned_to_name: b.assignedToName ?? null,
    approved_at: b.approvedAt ?? null,
    created_at: (b.createdAt ?? '').slice(0, 10),
    total_items: b.totalItems ?? 0,
    total_qty: b.totalQty ?? 0,
  };
}

function mapBeTransferItem(b: BeTransferItemRes): TransferOrderItem {
  return {
    id: b.id, transfer_order_id: b.transferOrderId,
    product_id: b.productId, product_name: b.productName ?? '-',
    from_location_id: b.fromLocationId, to_location_id: b.toLocationId,
    from_location_code: b.fromLocationCode ?? null,
    to_location_code: b.toLocationCode ?? null,
    ordered_qty: b.orderedQty, processed_qty: b.processedQty,
    defect_qty: b.defectQty ?? 0, lot_no: b.lotNo ?? null,
    status: b.status as TransferItemStatus,
  };
}

export interface CreateTransferInput {
  fromWarehouseId: string;
  toWarehouseId: string;
  expectedDate?: string;
  note?: string;
  items: {
    productId: string;
    fromLocationId: string;
    toLocationId: string;
    orderedQty: number;
    lotNo?: string | null;
  }[];
}

export const getTransferOrders = async (): Promise<TransferOrder[]> => {
  const res = await apiClient.get<BeTransferOrderRes[] | { content: BeTransferOrderRes[] }>(
    '/stock-service/transfer/list',
    { params: { size: 200 } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeTransferOrder);
};

/** POST /stock-service/transfer/search — 이동 지시서 검색 (productIds 포함). */
export const searchTransferOrders = async (
  filters: { status?: string; fromWarehouseId?: string; toWarehouseId?: string; productIds?: string[] },
  page = 0,
  size = 1000,
  sort?: string,
): Promise<TransferOrder[]> => {
  const query: Record<string, string | number> = { page, size };
  if (sort) query.sort = sort;
  const body: Record<string, unknown> = {};
  if (filters.status) body.status = filters.status;
  if (filters.fromWarehouseId) body.fromWarehouseId = filters.fromWarehouseId;
  if (filters.toWarehouseId) body.toWarehouseId = filters.toWarehouseId;
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;
  const res = await apiClient.post<BeTransferOrderRes[] | { content: BeTransferOrderRes[] }>(
    '/stock-service/transfer/search',
    body,
    { params: query },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeTransferOrder);
};

export const getTransferOrder = async (id: string): Promise<TransferOrder | undefined> => {
  const res = await apiClient.get<BeTransferOrderRes>(`/stock-service/transfer/${id}`);
  return mapBeTransferOrder(res.data);
};

export const getTransferItems = async (orderId: string): Promise<TransferOrderItem[]> => {
  const res = await apiClient.get<BeTransferItemRes[]>(`/stock-service/transfer/${orderId}/items`);
  return (res.data ?? []).map(mapBeTransferItem);
};

export const createTransferOrder = async (input: CreateTransferInput): Promise<TransferOrder> => {
  const res = await apiClient.post<BeTransferOrderRes>('/stock-service/transfer/create', input);
  return mapBeTransferOrder(res.data);
};

export const approveTransferOrder = async (id: string): Promise<void> => {
  await apiClient.post(`/stock-service/transfer/${id}/approve`);
};

export const cancelTransferOrder = async (id: string): Promise<void> => {
  await apiClient.post(`/stock-service/transfer/${id}/cancel`);
};

export const completeTransferOrder = async (id: string): Promise<void> => {
  await apiClient.post(`/stock-service/transfer/${id}/complete`);
};

export const processTransferItem = async (itemId: string, goodQty: number, defectQty: number): Promise<void> => {
  await apiClient.post(`/stock-service/transfer/items/${itemId}/process`, { goodQty, defectQty });
};

/* ═══════ ERP 연동 ═══════ */
export const getErpPurchaseOrders = async (): Promise<ErpPurchaseOrder[]> => {
  return (await apiClient.get('/erp/purchase-orders')).data;
};

export const getErpSalesOrders = async (filter?: ErpSalesOrderListFilter): Promise<ErpSalesOrder[]> => {
  const params: Record<string, string | boolean> = {};
  if (filter?.status) params.status = filter.status;
  if (filter?.store_id) params.storeId = filter.store_id;
  if (filter?.date_from) params.dateFrom = filter.date_from;
  if (filter?.date_to) params.dateTo = filter.date_to;
  if (filter?.so_no_keyword) params.soNoKeyword = filter.so_no_keyword;
  if (filter?.hide_completed) params.hideCompleted = true;
  const res = await apiClient.get<BeErpSalesOrderRes[]>(
    '/stock-service/outbound/erp-sales-orders',
    { params },
  );
  return (res.data ?? []).map(mapBeErpSalesOrder);
};

/* ═══════ 출고지시서 — 다중 SO 흐름 ═══════ */

/** 미리보기 — (창고 × 품목) 가용재고 매트릭스 */
export const previewOutboundFromSalesOrders = async (
  salesOrderIds: string[],
  excludeOutboundOrderId?: string,
): Promise<OutboundPreviewResponse> => {
  const res = await apiClient.post<BeOutboundPreviewRes>('/stock-service/outbound/preview', {
    salesOrderIds,
    excludeOutboundOrderId,
  });
  return mapBeOutboundPreview(res.data);
};

/** 수동 출고 미리보기 — 사용자가 입력한 품목 기준 (창고 × 품목) 매트릭스 + 추천 창고 */
export interface ManualPreviewInput {
  storeId: string;
  scheduledDate: string;  // YYYY-MM-DD
  items: { productId: string; qty: number }[];
}
export const previewManualOutbound = async (input: ManualPreviewInput): Promise<OutboundPreviewResponse> => {
  const res = await apiClient.post<BeOutboundPreviewRes>('/stock-service/outbound/preview/manual', input);
  return mapBeOutboundPreview(res.data);
};

/** 분할 출고 자동 추천 — 한 출고처 단위 */
export const recommendOutboundSplit = async (
  salesOrderIds: string[],
  storeId: string,
  excludeOutboundOrderId?: string,
): Promise<SplitRecommendationResponse> => {
  const res = await apiClient.post<BeSplitRecommendationRes>(
    '/stock-service/outbound/preview/split-recommendation',
    { salesOrderIds, storeId, excludeOutboundOrderId },
  );
  return mapBeSplitRecommendation(res.data);
};

/** 다중 SO → 출고지시서 생성 (단일/분할 통합) */
export const createOutboundFromSalesOrders = async (
  req: CreateOutboundFromSalesOrdersRequest,
): Promise<CreateOutboundResponse> => {
  const res = await apiClient.post<BeCreateOutboundRes>(
    '/stock-service/outbound/from-sales-orders',
    {
      salesOrderIds: req.sales_order_ids,
      warehouseAllocations: req.warehouse_allocations.map((wa) => ({
        warehouseId: wa.warehouse_id,
        productAllocations: wa.product_allocations.map((pa) => ({
          productId: pa.product_id,
          qty: pa.qty,
        })),
      })),
    },
  );
  return {
    outbound_order_ids: res.data.outboundOrderIds ?? [],
    unallocated_qty: res.data.unallocatedQty ?? 0,
  };
};

/** 수주서 진행률 조회 */
export const getSalesOrderProgress = async (salesOrderId: string): Promise<SalesOrderProgressResponse> => {
  const res = await apiClient.get<BeSalesOrderProgressRes>(
    `/stock-service/outbound/sales-orders/${salesOrderId}/progress`,
  );
  return mapBeSalesOrderProgress(res.data);
};

/* ── BE 응답 타입 + 매퍼 ── */

interface BeOutboundPreviewRes {
  shipDate: string;
  storeGroups: {
    storeId: string;
    storeName: string;
    salesOrderIds: string[];
    requirements: {
      productId: string;
      productName: string;
      sku: string;
      requiredQty: number;
      warehouses: {
        warehouseId: string;
        warehouseName: string;
        currentAvailableQty: number;
        incomingQty: number;
        draftReservedQty: number;
        projectedQty: number;
        status: 'SUFFICIENT' | 'SHORTAGE' | 'NONE';
      }[];
    }[];
    recommendedWarehouseId: string | null;
  }[];
}

function mapBeOutboundPreview(b: BeOutboundPreviewRes): OutboundPreviewResponse {
  return {
    ship_date: b.shipDate,
    store_groups: (b.storeGroups ?? []).map((g) => ({
      store_id: g.storeId,
      store_name: g.storeName,
      sales_order_ids: g.salesOrderIds ?? [],
      recommended_warehouse_id: g.recommendedWarehouseId,
      requirements: (g.requirements ?? []).map((r) => ({
        product_id: r.productId,
        product_name: r.productName,
        sku: r.sku,
        required_qty: r.requiredQty,
        warehouses: (r.warehouses ?? []).map((w) => ({
          warehouse_id: w.warehouseId,
          warehouse_name: w.warehouseName,
          current_available_qty: w.currentAvailableQty,
          incoming_qty: w.incomingQty,
          draft_reserved_qty: w.draftReservedQty,
          projected_qty: w.projectedQty,
          status: w.status,
        })),
      })),
    })),
  };
}

interface BeSplitRecommendationRes {
  recommendations: {
    warehouseId: string;
    productAllocations: { productId: string; qty: number }[];
  }[];
  unallocatedQty: number;
  shortages: {
    productId: string;
    productName: string;
    requiredQty: number;
    allocatedQty: number;
    shortageQty: number;
  }[];
}

function mapBeSplitRecommendation(b: BeSplitRecommendationRes): SplitRecommendationResponse {
  return {
    unallocated_qty: b.unallocatedQty ?? 0,
    recommendations: (b.recommendations ?? []).map((r) => ({
      warehouse_id: r.warehouseId,
      product_allocations: (r.productAllocations ?? []).map((p) => ({
        product_id: p.productId,
        qty: p.qty,
      })),
    })),
    shortages: (b.shortages ?? []).map((s) => ({
      product_id: s.productId,
      product_name: s.productName,
      required_qty: s.requiredQty,
      allocated_qty: s.allocatedQty,
      shortage_qty: s.shortageQty,
    })),
  };
}

interface BeCreateOutboundRes {
  outboundOrderIds: string[];
  unallocatedQty: number;
}

interface BeSalesOrderProgressRes {
  id: string;
  salesOrderNumber: string;
  storeId: string;
  storeName: string;
  orderDate: string;
  scheduledDate: string;
  status: string;
  totalOrderedQty: number;
  totalAllocatedQty: number;
  totalDispatchedQty: number;
  dispatchProgressPercent: number;
  items: {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    orderedQty: number;
    allocatedQty: number;
    dispatchedQty: number;
    remainingToDispatch: number;
    remainingToAllocate: number;
    dispatchProgressPercent: number;
  }[];
  linkedOutbounds: {
    outboundOrderId: string;
    outboundOrderNo: string;
    warehouseId: string;
    warehouseName: string;
    status: string;
    scheduledDate: string;
    items: { productId: string; productName: string; qty: number }[];
    cancelled: boolean;
    cancelledAt: string | null;
  }[];
}

function mapBeSalesOrderProgress(b: BeSalesOrderProgressRes): SalesOrderProgressResponse {
  return {
    id: b.id,
    sales_order_number: b.salesOrderNumber,
    store_id: b.storeId,
    store_name: b.storeName,
    order_date: b.orderDate,
    scheduled_date: b.scheduledDate,
    status: b.status,
    total_ordered_qty: b.totalOrderedQty ?? 0,
    total_allocated_qty: b.totalAllocatedQty ?? 0,
    total_dispatched_qty: b.totalDispatchedQty ?? 0,
    dispatch_progress_percent: b.dispatchProgressPercent ?? 0,
    items: (b.items ?? []).map((i) => ({
      id: i.id,
      product_id: i.productId,
      product_name: i.productName,
      sku: i.sku,
      ordered_qty: i.orderedQty,
      allocated_qty: i.allocatedQty,
      dispatched_qty: i.dispatchedQty,
      remaining_to_dispatch: i.remainingToDispatch,
      remaining_to_allocate: i.remainingToAllocate,
      dispatch_progress_percent: i.dispatchProgressPercent,
    })),
    linked_outbounds: (b.linkedOutbounds ?? []).map((o) => ({
      outbound_order_id: o.outboundOrderId,
      outbound_order_no: o.outboundOrderNo,
      warehouse_id: o.warehouseId,
      warehouse_name: o.warehouseName,
      status: o.status,
      scheduled_date: o.scheduledDate,
      items: (o.items ?? []).map((it) => ({
        product_id: it.productId,
        product_name: it.productName,
        qty: it.qty,
      })),
      cancelled: !!o.cancelled,
      cancelled_at: o.cancelledAt,
    })),
  };
}
