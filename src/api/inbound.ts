import apiClient from './client';
import type {
  AsnOrder, InboundOrder, InboundOrderItem, InboundReceipt, InboundReceiptItem, PlacementItem, PlacementOrder,
  OrderStatus, InboundItemStatus, PlacementOrderStatus,
} from '@/types/order';
import type { SuggestedLocation } from '@/api/inventory';

/* ═══════ 백엔드(stock-service) 응답 타입 ═══════ */
interface BeAsnItemRes { sku: string; productName: string; qty: number; unitPrice: number | string | null }
interface BeAsnOrderRes { id: string; asnNo: string; supplierName: string | null; shipDate: string | null; expectedDate: string | null; items: BeAsnItemRes[] }
interface BeInboundOrderRes { id: string; orderNo: string; supplierId: string | null; supplierName: string | null; warehouseId: string | null; warehouseName: string | null; expectedDate: string | null; status: OrderStatus; source: string | null; originId: string | null; returnFrom: string | null; createdBy: string | null; createdAt: string | null; approvedBy: string | null; approvedAt: string | null; totalItems: number | null; totalQty: number | null }
interface BeInboundOrderItemRes { id: string; orderId: string; productId: string | null; sku: string | null; productName: string | null; orderedQty: number; receivedQty: number; defectiveQty: number; remainingQty: number | null; unitPrice: number | string | null; status: InboundItemStatus; lotNo: string | null }
interface BeInboundReceiptItemRes { id: string; receiptId: string; orderItemId: string; productId: string | null; sku: string | null; productName: string | null; qty: number | null; lotNo: string | null; itemCondition: string | null; inspectedBy: string | null; unitPrice: number | string | null; createdAt: string | null }
interface BeInboundReceiptRes { id: string; inboundOrderId: string; orderNo: string | null; supplierId: string | null; supplierName: string | null; warehouseId: string | null; warehouseName: string | null; receivedBy: string | null; receivedByName: string | null; receiptNo: string; receivedAt: string | null; note: string | null; createdAt: string | null; items: BeInboundReceiptItemRes[] }

interface BePlacementItemRes {
  id: string; placementOrderId: string; inboundOrderId: string;
  warehouseId: string | null;
  orderNo: string | null; placementNo: string | null; seq: number;
  sku: string | null; productName: string | null; qty: number;
  lotNo: string | null; zoneName: string | null; rackCode: string | null;
  locationId: string | null;   // null 이면 "위치 미정"
  locationCode: string | null;
  productId: string | null;
  placed: boolean;
  unassignedReason?: string | null;
  defect?: boolean;             // 검수 단계 불량 여부 (qty 전량이 불량인 레코드)
  defectQty?: number;            // 적치 중 파손 수량 (정상 레코드 내부의 파손분)
}

interface BePlacementOrderRes {
  id: string; inboundOrderId: string; placementNo: string; orderNo: string;
  status: PlacementOrderStatus; createdAt: string | null; completedAt: string | null;
  totalItems: number; placedItems: number; items: BePlacementItemRes[];
}

interface BeSuggestLocationRes {
  locationId: string;
  rackId: string;
  rackCode: string;
  locationCode: string;
  floorNo: number | null;
  reason: string;
  currentQty: number;
  /** 신규 — 수용량 인지 응답 (null = 무제한/미설정) */
  maxCapacity?: number | null;
  currentUsed?: number | null;
  availableCapacity?: number | null;
  remainCapacity?: number | null;
}

/* ═══════ BE → FE 매퍼 ═══════ */
function mapBeAsn(b: BeAsnOrderRes): AsnOrder {
  return {
    id: b.id, asn_no: b.asnNo, vendor_name: b.supplierName ?? '-',
    ship_date: b.shipDate ?? '', expected_date: b.expectedDate ?? '',
    items: (b.items ?? []).map((it) => ({
      sku: it.sku, product_name: it.productName ?? '-', qty: it.qty ?? 0,
      unit_price: typeof it.unitPrice === 'string' ? Number(it.unitPrice) : (it.unitPrice ?? 0),
    })),
  };
}

function mapBeInboundOrder(b: BeInboundOrderRes): InboundOrder {
  return {
    id: b.id, order_no: b.orderNo, vendor_name: b.supplierName ?? '-',
    supplier_id: b.supplierId ?? null,
    warehouse_id: b.warehouseId ?? undefined,
    warehouse_name: b.warehouseName ?? '-', expected_date: b.expectedDate ?? '',
    status: b.status, source: b.source ?? '',
    origin_id: b.originId ?? null, return_from: b.returnFrom ?? null,
    created_by: b.createdBy ?? '',
    approved_by: b.approvedBy ?? null,
    approved_at: b.approvedAt ?? null,
    created_at: (b.createdAt ?? '').slice(0, 10),
    total_items: b.totalItems ?? 0, total_qty: b.totalQty ?? 0,
  };
}

function mapBeInboundItem(b: BeInboundOrderItemRes): InboundOrderItem {
  return {
    id: b.id, order_id: b.orderId,
    product_id: b.productId ?? undefined,
    sku: b.sku ?? '-', product_name: b.productName ?? '-',
    ordered_qty: b.orderedQty ?? 0, received_qty: b.receivedQty ?? 0,
    defective_qty: b.defectiveQty ?? 0,
    remaining_qty: b.remainingQty ?? Math.max(0, (b.orderedQty ?? 0) - (b.receivedQty ?? 0) - (b.defectiveQty ?? 0)),
    unit_price: typeof b.unitPrice === 'string' ? Number(b.unitPrice) : (b.unitPrice ?? 0),
    status: b.status, lot_no: b.lotNo ?? '',
  };
}

function mapBeInboundReceiptItem(b: BeInboundReceiptItemRes): InboundReceiptItem {
  return {
    id: b.id,
    receipt_id: b.receiptId,
    order_item_id: b.orderItemId,
    product_id: b.productId ?? undefined,
    sku: b.sku ?? '-',
    product_name: b.productName ?? '-',
    qty: b.qty ?? 0,
    lot_no: b.lotNo ?? '',
    item_condition: b.itemCondition ?? 'normal',
    inspected_by: b.inspectedBy ?? null,
    unit_price: typeof b.unitPrice === 'string' ? Number(b.unitPrice) : (b.unitPrice ?? 0),
    created_at: b.createdAt ?? null,
  };
}

function mapBeInboundReceipt(b: BeInboundReceiptRes): InboundReceipt {
  return {
    id: b.id,
    inbound_order_id: b.inboundOrderId,
    order_no: b.orderNo ?? '-',
    vendor_name: b.supplierName ?? '-',
    warehouse_id: b.warehouseId ?? undefined,
    warehouse_name: b.warehouseName ?? '-',
    received_by: b.receivedBy ?? null,
    received_by_name: b.receivedByName ?? null,
    receipt_no: b.receiptNo,
    received_at: b.receivedAt ?? '',
    note: b.note ?? null,
    created_at: b.createdAt ?? null,
    items: (b.items ?? []).map(mapBeInboundReceiptItem),
  };
}

function mapBePlacementItem(b: BePlacementItemRes): PlacementItem {
  return {
    id: b.id, placement_order_id: b.placementOrderId,
    inbound_order_id: b.inboundOrderId, order_no: b.orderNo ?? undefined,
    warehouse_id: b.warehouseId ?? undefined,
    placement_no: b.placementNo ?? undefined, seq: b.seq,
    sku: b.sku ?? '-', product_name: b.productName ?? '-',
    product_id: b.productId ?? undefined,
    qty: b.qty ?? 0, lot_no: b.lotNo ?? '',
    zone_name: b.locationId == null ? '(미정)' : (b.zoneName ?? '-'),
    rack_code: b.locationId == null ? '(미정)' : (b.rackCode ?? '-'),
    location_id: b.locationId ?? undefined,
    location_code: b.locationId == null ? undefined : (b.locationCode ?? undefined),
    is_placed: b.placed,
    is_unassigned: b.locationId == null,
    unassigned_reason: b.unassignedReason ?? undefined,
    is_defect: (b.defect ?? (b as unknown as { isDefect?: boolean }).isDefect) ?? false,
    defect_qty: b.defectQty ?? 0,
  };
}

function mapBePlacementOrder(b: BePlacementOrderRes): PlacementOrder {
  return {
    id: b.id, inbound_order_id: b.inboundOrderId,
    placement_no: b.placementNo, order_no: b.orderNo,
    status: b.status, created_at: b.createdAt ?? '',
    completed_at: b.completedAt ?? null,
    total_items: b.totalItems, placed_items: b.placedItems,
    items: (b.items ?? []).map(mapBePlacementItem),
  };
}

function mapSuggestedLocation(b: BeSuggestLocationRes): SuggestedLocation {
  const avail = b.availableCapacity ?? b.remainCapacity ?? null;
  return {
    location_id: b.locationId,
    rack_id: b.rackId,
    rack_code: b.rackCode,
    location_code: b.locationCode,
    floor_no: b.floorNo ?? null,
    reason: b.reason,
    current_qty: b.currentQty ?? 0,
    max_capacity: b.maxCapacity ?? null,
    current_used: b.currentUsed ?? null,
    available_capacity: avail,
  };
}

/* ═══════ API 함수 ═══════ */

/** GET /stock-service/inbound/asn-orders */
export const getAsnOrders = async (): Promise<AsnOrder[]> => {
  return (await apiClient.get<BeAsnOrderRes[]>('/stock-service/inbound/asn-orders')).data.map(mapBeAsn);
};

/* ═══════ ASN 미리보기 (등록 여부 매칭) ═══════ */
export interface AsnPreviewItem {
  product_id: string | null;
  sku: string | null;
  product_name: string | null;
  qty: number;
  unit_price: number | null;
  matched: boolean;
}

export interface AsnPreview {
  id: string;
  asn_no: string;
  supplier_name: string;
  ship_date: string;
  expected_date: string;
  items: AsnPreviewItem[];
  all_matched: boolean;
}

interface BeAsnPreviewItem {
  productId: string | null;
  sku: string | null;
  productName: string | null;
  qty: number;
  unitPrice: number | string | null;
  matched: boolean;
}
interface BeAsnPreviewRes {
  id: string;
  asnNo: string;
  supplierName: string | null;
  shipDate: string | null;
  expectedDate: string | null;
  items: BeAsnPreviewItem[];
  allMatched: boolean;
}

/** GET /stock-service/inbound/asn-orders/{asnId}/preview */
export const getAsnPreview = async (asnId: string): Promise<AsnPreview> => {
  const res = await apiClient.get<BeAsnPreviewRes>(`/stock-service/inbound/asn-orders/${asnId}/preview`);
  const b = res.data;
  return {
    id: b.id,
    asn_no: b.asnNo,
    supplier_name: b.supplierName ?? '-',
    ship_date: b.shipDate ?? '',
    expected_date: b.expectedDate ?? '',
    all_matched: b.allMatched,
    items: (b.items ?? []).map((it) => ({
      product_id: it.productId,
      sku: it.sku,
      product_name: it.productName,
      qty: it.qty,
      unit_price: typeof it.unitPrice === 'string' ? Number(it.unitPrice) : it.unitPrice,
      matched: it.matched,
    })),
  };
};

/** POST /stock-service/inbound/inbound-orders/from-asn */
export const createInboundFromAsn = async (asnId: string, warehouseCode: string): Promise<InboundOrder> => {
  const res = await apiClient.post<BeInboundOrderRes>('/stock-service/inbound/inbound-orders/from-asn', { asnId, warehouse: warehouseCode });
  return mapBeInboundOrder(res.data);
};

/* ── 발주서 목록 + 진행률 (InboundListPage Segmented "발주서 목록" 탭) ── */
export type PurchaseOrderProcessStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type ErpPurchaseOrderStatus = 'draft' | 'approved' | 'closed';

export interface PurchaseOrderListItem {
  id: string;
  po_no: string;
  supplier_id: string | null;
  supplier_name: string | null;
  order_date: string;
  scheduled_date: string;
  po_status: ErpPurchaseOrderStatus;
  process_status: PurchaseOrderProcessStatus;
  // 연결된 입고지시서 (NOT_STARTED 면 null)
  inbound_order_id: string | null;
  inbound_order_no: string | null;
  inbound_status: OrderStatus | null;
  /** 0..100 — sum(received_qty) / sum(ordered_qty) * 100 */
  receive_progress_percent: number;
  item_count: number;
  total_ordered_qty: number;
}

export interface PurchaseOrderListPage {
  content: PurchaseOrderListItem[];
  total_elements: number;
  total_pages: number;
  number: number;
  size: number;
}

export interface PurchaseOrderListParams {
  status?: PurchaseOrderProcessStatus | 'ALL';
  poNoKeyword?: string;
  dateFrom?: string;
  dateTo?: string;
  hideCompleted?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

interface BePurchaseOrderListItem {
  id: string;
  poNo: string;
  supplierId: string | null;
  supplierName: string | null;
  orderDate: string;
  scheduledDate: string;
  poStatus: ErpPurchaseOrderStatus;
  processStatus: PurchaseOrderProcessStatus;
  inboundOrderId: string | null;
  inboundOrderNo: string | null;
  inboundStatus: OrderStatus | null;
  receiveProgressPercent: number;
  itemCount: number;
  totalOrderedQty: number;
}

interface BePurchaseOrderListPage {
  content: BePurchaseOrderListItem[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

function mapBePurchaseOrderListItem(b: BePurchaseOrderListItem): PurchaseOrderListItem {
  return {
    id: b.id,
    po_no: b.poNo,
    supplier_id: b.supplierId,
    supplier_name: b.supplierName,
    order_date: b.orderDate,
    scheduled_date: b.scheduledDate,
    po_status: b.poStatus,
    process_status: b.processStatus,
    inbound_order_id: b.inboundOrderId,
    inbound_order_no: b.inboundOrderNo,
    inbound_status: b.inboundStatus,
    receive_progress_percent: b.receiveProgressPercent ?? 0,
    item_count: b.itemCount ?? 0,
    total_ordered_qty: b.totalOrderedQty ?? 0,
  };
}

/** GET /stock-service/inbound/purchase-orders */
export const getPurchaseOrderList = async (
  params: PurchaseOrderListParams = {},
): Promise<PurchaseOrderListPage> => {
  const query: Record<string, string | number | boolean> = {
    page: params.page ?? 0,
    size: params.size ?? 20,
    sort: params.sort ?? 'scheduledDate,asc',
  };
  if (params.status && params.status !== 'ALL') query.status = params.status;
  if (params.poNoKeyword?.trim()) query.poNoKeyword = params.poNoKeyword.trim();
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  if (params.hideCompleted) query.hideCompleted = true;

  const res = await apiClient.get<BePurchaseOrderListPage>('/stock-service/inbound/purchase-orders', { params: query });
  const d = res.data;
  return {
    content: (d.content ?? []).map(mapBePurchaseOrderListItem),
    total_elements: d.totalElements ?? 0,
    total_pages: d.totalPages ?? 0,
    number: d.number ?? 0,
    size: d.size ?? 20,
  };
};

/* ── 발주서 → 입고지시서 생성 전 — 창고 추천 ── */
export interface PoRecommendationItem {
  product_id: string;
  sku: string | null;
  product_name: string | null;
  qty: number;
}

export interface WarehouseCandidate {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  /** 이 협력사 전용 랙이 그 창고에 몇 개 있는지 */
  supplier_rack_count: number;
  /** PO 품목 카테고리에 매칭되는 zone 개수 */
  category_zone_count: number;
  /** 그 창고의 전체 활성 location 수 */
  total_locations: number;
  /** 비어있는 (inventory 행 없는) location 수 — 점수에 미포함, 정보 표시용 */
  empty_locations: number;
  /** 종합 점수 (높을수록 추천) */
  fit_score: number;
  /** 추천 사유 한글 문구 */
  reason: string;
}

export interface PoRecommendation {
  purchase_order_id: string;
  po_no: string;
  supplier_id: string | null;
  supplier_name: string | null;
  scheduled_date: string;
  items: PoRecommendationItem[];
  /** 추천 창고 (점수 1위) — 자동 선택 X, FE 강조 표시만 */
  recommended_warehouse_id: string | null;
  candidates: WarehouseCandidate[];
}

export interface RecommendWarehousesResponse {
  recommendations: PoRecommendation[];
}

interface BeWarehouseCandidate {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  supplierRackCount: number;
  categoryZoneCount: number;
  totalLocations: number;
  emptyLocations: number;
  fitScore: number;
  reason: string;
}

interface BePoRecommendationItem {
  productId: string;
  sku: string | null;
  productName: string | null;
  qty: number;
}

interface BePoRecommendation {
  purchaseOrderId: string;
  poNo: string;
  supplierId: string | null;
  supplierName: string | null;
  scheduledDate: string;
  items: BePoRecommendationItem[];
  recommendedWarehouseId: string | null;
  candidates: BeWarehouseCandidate[];
}

interface BeRecommendWarehousesResponse {
  recommendations: BePoRecommendation[];
}

/** POST /stock-service/inbound/recommend-warehouses */
export const recommendWarehousesForPos = async (poIds: string[]): Promise<RecommendWarehousesResponse> => {
  const res = await apiClient.post<BeRecommendWarehousesResponse>(
    '/stock-service/inbound/recommend-warehouses',
    { purchaseOrderIds: poIds },
  );
  return {
    recommendations: (res.data.recommendations ?? []).map((r) => ({
      purchase_order_id: r.purchaseOrderId,
      po_no: r.poNo,
      supplier_id: r.supplierId,
      supplier_name: r.supplierName,
      scheduled_date: r.scheduledDate,
      items: (r.items ?? []).map((it) => ({
        product_id: it.productId,
        sku: it.sku,
        product_name: it.productName,
        qty: it.qty,
      })),
      recommended_warehouse_id: r.recommendedWarehouseId,
      candidates: (r.candidates ?? []).map((c) => ({
        warehouse_id: c.warehouseId,
        warehouse_code: c.warehouseCode,
        warehouse_name: c.warehouseName,
        supplier_rack_count: c.supplierRackCount,
        category_zone_count: c.categoryZoneCount,
        total_locations: c.totalLocations ?? 0,
        empty_locations: c.emptyLocations ?? 0,
        fit_score: c.fitScore,
        reason: c.reason,
      })),
    })),
  };
};

export interface CreateManualInboundInput {
  /** null = 자사 입고 (owner_type=OWN 상품) */
  supplierId: string | null;
  warehouseId: string;
  expectedDate: string;
  source?: string;
  items: {
    productId: string;
    qty: number;
    unitPrice?: number | null;
  }[];
}

/** POST /stock-service/inbound/inbound-orders */
export const createManualInbound = async (input: CreateManualInboundInput): Promise<InboundOrder> => {
  const res = await apiClient.post<BeInboundOrderRes>('/stock-service/inbound/inbound-orders', input);
  return mapBeInboundOrder(res.data);
};

/** PATCH /stock-service/inbound/inbound-orders/{id}/cancel — draft / approved 만 가능 */
export const cancelInboundOrder = async (id: string): Promise<void> => {
  await apiClient.patch(`/stock-service/inbound/inbound-orders/${id}/cancel`);
};

/** POST /stock-service/inbound/inbound-orders/from-return — 반품 입고 지시서 생성 */
export interface CreateReturnInboundInput {
  outboundOrderId: string;
  warehouseId: string;
  reason?: string;
  items: { productId: string; qty: number }[];
}

export const createInboundFromReturn = async (input: CreateReturnInboundInput): Promise<InboundOrder> => {
  const res = await apiClient.post<BeInboundOrderRes>('/stock-service/inbound/inbound-orders/from-return', input);
  return mapBeInboundOrder(res.data);
};

/** GET /stock-service/inbound/inbound-orders */
export const getInboundOrders = async (
  params?: { status?: OrderStatus | OrderStatus[]; originType?: 'return'; excludeOriginType?: 'return' },
): Promise<InboundOrder[]> => {
  const query: Record<string, unknown> = {};
  if (params?.status) {
    query.status = Array.isArray(params.status) ? params.status : [params.status];
  }
  if (params?.originType) query.originType = params.originType;
  if (params?.excludeOriginType) query.excludeOriginType = params.excludeOriginType;
  const res = await apiClient.get<BeInboundOrderRes[]>('/stock-service/inbound/inbound-orders', {
    params: Object.keys(query).length > 0 ? query : undefined,
  });
  const arr = Array.isArray(res.data) ? res.data : ((res.data as { content?: BeInboundOrderRes[] }).content ?? []);
  return arr.map(mapBeInboundOrder);
};

/** POST /stock-service/inbound/inbound-orders/search — productIds 또는 status로 좁힌 입고지시서 목록.
 *  서버 페이징 지원이지만 화면이 클라이언트 페이징이라 size를 크게 받음. */
export const searchInboundOrders = async (
  filters: { status?: OrderStatus[]; productIds?: string[]; originType?: 'return'; excludeOriginType?: 'return' },
  page = 0,
  size = 1000,
  sort?: string,
): Promise<InboundOrder[]> => {
  const query: Record<string, string | number> = { page, size };
  if (sort) query.sort = sort;
  const body: Record<string, unknown> = {};
  if (filters.status && filters.status.length > 0) body.status = filters.status;
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;
  if (filters.originType) body.originType = filters.originType;
  if (filters.excludeOriginType) body.excludeOriginType = filters.excludeOriginType;
  const res = await apiClient.post<BeInboundOrderRes[] | { content?: BeInboundOrderRes[] }>(
    '/stock-service/inbound/inbound-orders/search',
    body,
    { params: query },
  );
  const arr = Array.isArray(res.data) ? res.data : (res.data.content ?? []);
  return arr.map(mapBeInboundOrder);
};

/** GET /stock-service/inbound/inbound-orders/{id} */
export const getInboundOrder = async (id: string): Promise<InboundOrder | undefined> => {
  return mapBeInboundOrder((await apiClient.get<BeInboundOrderRes>(`/stock-service/inbound/inbound-orders/${id}`)).data);
};

/** GET /stock-service/inbound/inbound-orders/{id}/items */
export const getInboundItems = async (orderId: string): Promise<InboundOrderItem[]> => {
  return (await apiClient.get<BeInboundOrderItemRes[]>(`/stock-service/inbound/inbound-orders/${orderId}/items`)).data.map(mapBeInboundItem);
};

/** POST /stock-service/inbound/inbound-orders/{id}/items/search — productIds 비면 전체 반환 */
export const searchInboundOrderItems = async (
  orderId: string,
  productIds: string[],
): Promise<InboundOrderItem[]> => {
  const res = await apiClient.post<BeInboundOrderItemRes[]>(
    `/stock-service/inbound/inbound-orders/${orderId}/items/search`,
    { productIds },
  );
  return (res.data ?? []).map(mapBeInboundItem);
};

/** GET /stock-service/inbound/inbound-orders/{id}/receipt — 입고 전표 조회 */
export const getInboundReceipt = async (orderId: string): Promise<InboundReceipt> => {
  const res = await apiClient.get<BeInboundReceiptRes>(`/stock-service/inbound/inbound-orders/${orderId}/receipt`);
  return mapBeInboundReceipt(res.data);
};

/* ── 입고 전표 목록 (페이지네이션) ── */
export type InboundReceiptOriginType = 'purchase_order' | 'manual' | 'return';

export interface InboundReceiptListItem {
  id: string;
  receipt_no: string;
  received_at: string;
  created_at: string | null;
  inbound_order_id: string;
  order_no: string;
  origin_type: InboundReceiptOriginType | null;
  origin_id: string | null;
  origin_no: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  received_by: string | null;
  received_by_name: string | null;
}

export interface InboundReceiptListParams {
  dateFrom?: string;
  dateTo?: string;
  warehouseId?: string;
  originType?: InboundReceiptOriginType | 'ALL';
  receiptNoKeyword?: string;
  orderNoKeyword?: string;
  page?: number;
  size?: number;
  sort?: string;
}

interface BePage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first?: boolean;
  last?: boolean;
  empty?: boolean;
}

interface BeInboundReceiptListItem {
  id: string;
  receiptNo: string;
  receivedAt: string;
  createdAt: string | null;
  inboundOrderId: string;
  orderNo: string;
  originType: InboundReceiptOriginType | null;
  originId: string | null;
  originNo: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  receivedBy: string | null;
  receivedByName: string | null;
}

function mapBeInboundReceiptListItem(b: BeInboundReceiptListItem): InboundReceiptListItem {
  return {
    id: b.id,
    receipt_no: b.receiptNo,
    received_at: b.receivedAt,
    created_at: b.createdAt,
    inbound_order_id: b.inboundOrderId,
    order_no: b.orderNo,
    origin_type: b.originType,
    origin_id: b.originId,
    origin_no: b.originNo,
    warehouse_id: b.warehouseId,
    warehouse_name: b.warehouseName,
    supplier_id: b.supplierId,
    supplier_name: b.supplierName,
    received_by: b.receivedBy,
    received_by_name: b.receivedByName,
  };
}

export interface InboundReceiptListPage {
  content: InboundReceiptListItem[];
  total_elements: number;
  total_pages: number;
  number: number;
  size: number;
}

/** POST /stock-service/inbound/receipts/search — 입고 전표 검색 (productIds 포함). 응답은 GET와 동일 Page<T>. */
export const searchInboundReceipts = async (
  filters: InboundReceiptListParams & { productIds?: string[] } = {},
): Promise<InboundReceiptListPage> => {
  const query: Record<string, string | number> = {
    page: filters.page ?? 0,
    size: filters.size ?? 20,
    sort: filters.sort ?? 'receivedAt,desc',
  };
  const body: Record<string, unknown> = {};
  if (filters.dateFrom) body.dateFrom = filters.dateFrom;
  if (filters.dateTo) body.dateTo = filters.dateTo;
  if (filters.warehouseId) body.warehouseId = filters.warehouseId;
  if (filters.originType && filters.originType !== 'ALL') body.originType = filters.originType;
  if (filters.receiptNoKeyword?.trim()) body.receiptNoKeyword = filters.receiptNoKeyword.trim();
  if (filters.orderNoKeyword?.trim()) body.orderNoKeyword = filters.orderNoKeyword.trim();
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;

  const res = await apiClient.post<BePage<BeInboundReceiptListItem>>(
    '/stock-service/inbound/receipts/search',
    body,
    { params: query },
  );
  const d = res.data;
  return {
    content: (d.content ?? []).map(mapBeInboundReceiptListItem),
    total_elements: d.totalElements ?? 0,
    total_pages: d.totalPages ?? 0,
    number: d.number ?? 0,
    size: d.size ?? 20,
  };
};

/** GET /stock-service/inbound/receipts — 입고 전표 목록 (페이지네이션) */
export const getInboundReceipts = async (params: InboundReceiptListParams = {}): Promise<InboundReceiptListPage> => {
  const query: Record<string, string | number> = {
    page: params.page ?? 0,
    size: params.size ?? 20,
    sort: params.sort ?? 'receivedAt,desc',
  };
  if (params.dateFrom) query.dateFrom = params.dateFrom;
  if (params.dateTo) query.dateTo = params.dateTo;
  if (params.warehouseId) query.warehouseId = params.warehouseId;
  if (params.originType && params.originType !== 'ALL') query.originType = params.originType;
  if (params.receiptNoKeyword?.trim()) query.receiptNoKeyword = params.receiptNoKeyword.trim();
  if (params.orderNoKeyword?.trim()) query.orderNoKeyword = params.orderNoKeyword.trim();

  const res = await apiClient.get<BePage<BeInboundReceiptListItem>>('/stock-service/inbound/receipts', { params: query });
  const d = res.data;
  return {
    content: (d.content ?? []).map(mapBeInboundReceiptListItem),
    total_elements: d.totalElements ?? 0,
    total_pages: d.totalPages ?? 0,
    number: d.number ?? 0,
    size: d.size ?? 20,
  };
};

/** POST /stock-service/inbound/inbound-orders/{id}/approve */
export const approveInboundOrder = async (id: string): Promise<void> => {
  await apiClient.post(`/stock-service/inbound/inbound-orders/${id}/approve`);
};

/* ── 입고 확정 (수량 검수) ── */

export interface ReceiveRow {
  item_id: string;
  qty: number;
  defective: number;
}

/** POST /stock-service/inbound/inbound-orders/{id}/receive — 입고 확정 */
export const receiveInbound = async (orderId: string, rows: ReceiveRow[]): Promise<InboundOrderItem[]> => {
  const body = { rows: rows.map((r) => ({ itemId: r.item_id, qty: r.qty, defective: r.defective })) };
  return (await apiClient.post<BeInboundOrderItemRes[]>(`/stock-service/inbound/inbound-orders/${orderId}/receive`, body)).data.map(mapBeInboundItem);
};

/* ── 적치 조회/완료 ── */

/** GET /stock-service/inbound/inbound-orders/{id}/placements — 지시서별 적치 지시서 목록 */
export const getPlacementOrders = async (orderId: string): Promise<PlacementOrder[]> => {
  return (await apiClient.get<BePlacementOrderRes[]>(`/stock-service/inbound/inbound-orders/${orderId}/placements`)).data.map(mapBePlacementOrder);
};

/** GET /stock-service/inbound/placements — 전체 적치 목록 (현장 작업자용) */
export const getAllPlacements = async (status?: 'pending' | 'placed'): Promise<PlacementItem[]> => {
  return (await apiClient.get<BePlacementItemRes[]>('/stock-service/inbound/placements', {
    params: status ? { status } : undefined,
  })).data.map(mapBePlacementItem);
};

/** POST /stock-service/inbound/placement-orders/search — 적치 지시서 검색 (productIds 포함). */
export const searchPlacementOrders = async (
  filters: { status?: string; warehouseId?: string; assignedTo?: string; productIds?: string[] },
  page = 0,
  size = 1000,
  sort?: string,
): Promise<PlacementItem[]> => {
  const query: Record<string, string | number> = { page, size };
  if (sort) query.sort = sort;
  const body: Record<string, unknown> = {};
  if (filters.status) body.status = filters.status;
  if (filters.warehouseId) body.warehouseId = filters.warehouseId;
  if (filters.assignedTo) body.assignedTo = filters.assignedTo;
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;
  const res = await apiClient.post<BePlacementItemRes[] | { content?: BePlacementItemRes[] }>(
    '/stock-service/inbound/placement-orders/search',
    body,
    { params: query },
  );
  const arr = Array.isArray(res.data) ? res.data : (res.data.content ?? []);
  return arr.map(mapBePlacementItem);
};

/** PATCH /stock-service/inbound/placements/{itemId}/complete — 개별 적치 완료 */
export const completePlacementItem = async (itemId: string): Promise<void> => {
  await apiClient.patch(`/stock-service/inbound/placements/${itemId}/complete`);
};

/** PATCH /stock-service/inbound/placements/{itemId}/assign-location — 미배정 적치 아이템에 위치 지정 */
export const assignPlacementLocation = async (itemId: string, locationId: string): Promise<void> => {
  await apiClient.patch(`/stock-service/inbound/placements/${itemId}/assign-location`, { locationId });
};

/** POST /stock-service/inbound/placements/{itemId}/split-assign — 미배정 적치 아이템 분할 위치 지정 */
export interface SplitAssignment {
  locationId: string;
  qty: number;
}
export const splitAssignPlacementLocation = async (
  itemId: string,
  assignments: SplitAssignment[],
): Promise<void> => {
  await apiClient.post(
    `/stock-service/inbound/placements/${itemId}/split-assign`,
    { assignments },
  );
};

/** GET /stock-service/inbound/placements/{itemId}/suggest-locations — 미배정 적치 아이템 기준 위치 재추천 */
export const getPlacementLocationSuggestions = async (itemId: string): Promise<SuggestedLocation[]> => {
  const res = await apiClient.get<BeSuggestLocationRes[]>(`/stock-service/inbound/placements/${itemId}/suggest-locations`);
  const arr = Array.isArray(res.data) ? res.data : [];
  return arr.map(mapSuggestedLocation);
};

/** POST /stock-service/inbound/placement-orders/{id}/complete — 적치 지시서 전체 완료 */
export const completePlacementOrder = async (placementOrderId: string): Promise<void> => {
  await apiClient.post(`/stock-service/inbound/placement-orders/${placementOrderId}/complete`);
};
