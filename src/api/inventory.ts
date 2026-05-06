import apiClient from './client';
import type {
  InventoryStock, InventoryTransaction, StockCountOrder, StockCountItem, StockCountStatus, StockCountItemStatus,
  TransactionType, TransactionDirection,
} from '@/types/inventory';

/* ═══════ 적치 위치 추천 (stock-service) ═══════ */
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

export interface SuggestedLocation {
  location_id: string;
  rack_id: string;
  rack_code: string;
  location_code: string;
  floor_no: number | null;
  reason: string;
  current_qty: number;
  /** null = 수용량 미설정(무제한) */
  max_capacity: number | null;
  current_used: number | null;
  available_capacity: number | null;
}

function mapSuggestedLocation(b: BeSuggestLocationRes): SuggestedLocation {
  // remainCapacity 는 호환용 별칭 — availableCapacity 가 비어있으면 fallback
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

/**
 * GET /stock-service/inventory/suggest-location?productId=&warehouseId=&qty=
 * 적치 위치 추천. 응답 순서: 동일 상품 보관 위치(1순위) → 빈 위치(2순위).
 * one-SKU-per-location 정책상 타 상품이 있는 위치는 반환되지 않는다.
 */
export const getSuggestedLocations = async (
  productId: string,
  warehouseId: string,
  qty?: number,
  purpose?: 'NORMAL' | 'DISPOSAL',
): Promise<SuggestedLocation[]> => {
  const res = await apiClient.get<BeSuggestLocationRes[]>('/stock-service/inventory/suggest-location', {
    params: {
      productId,
      warehouseId,
      ...(qty != null ? { qty } : {}),
      ...(purpose ? { purpose } : {}),
    },
  });
  const arr = Array.isArray(res.data) ? res.data : (res.data as unknown as { content: BeSuggestLocationRes[] }).content ?? [];
  return arr.map(mapSuggestedLocation);
};

/* ═══════ 백엔드(stock-service) 응답 타입 ═══════ */
interface BeInventoryRes {
  id: string;
  productId: string;
  warehouseId: string;
  locationId: string | null;
  availableQty: number | null;
  reservedQty: number | null;
  defectQty: number | null;
  incomingQty: number | null;
  pendingQty: number | null;
  totalQty: number | null;
  updatedAt: string | null;
  productName: string | null;
  productSku: string | null;
  warehouseName: string | null;
  locationCode: string | null;
  // BE 분해 필드 — 프론트 컬럼 분리 표시용
  rackCode: string | null;
  rackName: string | null;
  zoneId: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  floorNo: number | null;
  maxCapacity: number | null;
}

interface BeInventoryTxRes {
  id: string;
  productId: string;
  inventoryId: string;
  warehouseId: string;
  locationId: string | null;
  txType: 'inbound' | 'outbound' | 'reserve' | 'unreserve' | 'transfer' | 'adjust' | 'dispose' | 'returned';
  qty: number;
  qtyBefore: number;
  qtyAfter: number;
  statusFrom: string | null;
  statusTo: string | null;
  refId: string | null;
  refType: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string | null;
  productName: string | null;
  warehouseName: string | null;
  locationCode: string | null;
  createdByName: string | null;
}

/* ═══════ BE → FE 매퍼 ═══════ */
// locationCode 예: "A-01-02-03" → zone=A, rack=A-01, row_no/level_no 파싱 불가 → 기본값
function parseLocationParts(locationCode: string | null): { zone: string; rack: string } {
  if (!locationCode) return { zone: '', rack: '' };
  const firstDash = locationCode.indexOf('-');
  const zone = firstDash > 0 ? locationCode.slice(0, firstDash) : locationCode;
  return { zone, rack: locationCode };
}

function mapBeInventory(b: BeInventoryRes): InventoryStock {
  // BE 가 분해 필드(zoneName/rackName/floorNo 등) 를 주면 그걸 우선 사용.
  // 누락 시에는 legacy locationCode 파싱으로 폴백 — 과거 스키마 호환.
  const legacy = parseLocationParts(b.locationCode);
  return {
    id: b.id,
    // BE 가 진짜 SKU 를 주면 그걸 사용. 누락 시 productId 앞 8자리 폴백 (과거 응답 호환).
    sku: b.productSku ?? b.productId.slice(0, 8),
    product_name: b.productName ?? '-',
    warehouse_code: b.warehouseId.slice(0, 8),
    warehouse_name: b.warehouseName ?? '-',
    zone_code: b.zoneCode ?? legacy.zone,
    zone_name: b.zoneName ?? legacy.zone ?? '-',
    zone_id: b.zoneId ?? undefined,
    rack_code: b.rackCode ?? legacy.rack,
    rack_name: b.rackName ?? undefined,
    floor_no: b.floorNo ?? null,
    available_qty: b.availableQty ?? 0,
    reserved_qty: b.reservedQty ?? 0,
    defective_qty: b.defectQty ?? 0,
    inspecting_qty: b.pendingQty ?? 0,
    total_qty: b.totalQty ?? 0,
    min_stock_qty: 0, // BE 에 기준재고 개념 없음
    product_id: b.productId,
    warehouse_id: b.warehouseId,
    location_id: b.locationId ?? undefined,
    location_code: b.locationCode ?? undefined,
    incoming_qty: b.incomingQty ?? 0,
    updated_at: b.updatedAt ?? undefined,
    max_capacity: b.maxCapacity ?? null,
  };
}

function mapBeTxType(t: BeInventoryTxRes['txType']): TransactionType {
  switch (t) {
    case 'inbound': return 'inbound';
    case 'outbound': return 'outbound';
    case 'reserve': return 'reserve';
    case 'unreserve': return 'unreserve';
    case 'transfer': return 'transfer';
    case 'adjust': return 'adjust';
    case 'dispose': return 'dispose';
    case 'returned': return 'returned';
    default: return 'adjust';
  }
}
function mapBeTxDirection(t: BeInventoryTxRes['txType']): TransactionDirection {
  // 재고 증가 방향
  if (t === 'inbound' || t === 'unreserve' || t === 'returned') return 'in';
  return 'out';
}

const STOCK_STATUS_VALUES = ['available', 'reserved', 'defect', 'incoming', 'pending'] as const;
function mapBeStockStatus(s: string | null | undefined): InventoryTransaction['status_from'] {
  if (!s) return null;
  const lower = s.toLowerCase();
  return (STOCK_STATUS_VALUES as readonly string[]).includes(lower)
    ? (lower as InventoryTransaction['status_to'])
    : null;
}

function mapBeInventoryTx(b: BeInventoryTxRes): InventoryTransaction {
  return {
    id: b.id,
    stock_id: b.inventoryId,
    product_id: b.productId,
    warehouse_id: b.warehouseId,
    location_id: b.locationId ?? undefined,
    type: mapBeTxType(b.txType),
    direction: mapBeTxDirection(b.txType),
    qty: b.qty,
    before_qty: b.qtyBefore,
    after_qty: b.qtyAfter,
    status_from: mapBeStockStatus(b.statusFrom),
    status_to: mapBeStockStatus(b.statusTo),
    ref_type: b.refType ?? '-',
    ref_id: b.refId ?? undefined,
    created_at: (b.createdAt ?? '').replace('T', ' ').slice(0, 19),
    note: b.note ?? undefined,
    created_by_name: b.createdByName ?? undefined,
    created_by: b.createdBy ?? undefined,
    product_name: b.productName ?? undefined,
    warehouse_name: b.warehouseName ?? undefined,
    location_code: b.locationCode ?? undefined,
  };
}

/* ═══════ 랙별 재고 조회 (stock-service) ═══════ */
interface BeRackLocationInventoryDto {
  locationId: string;
  locationCode: string;
  floorNo: number;
  maxCapacity: number | null;
  inventoryId: string | null;
  productId: string | null;
  productSku: string | null;
  productName: string | null;
  availableQty: number | null;
  reservedQty: number | null;
  pendingQty: number | null;
  defectQty: number | null;
  totalQty: number | null;
  updatedAt: string | null;
}

interface BeRackGroupDto {
  rackId: string;
  rackCode: string;
  rackName: string | null;
  zoneId: string;
  zoneCode: string;
  zoneName: string;
  locationCount: number;
  occupiedCount: number;
  totalAvailableQty: number;
  locations: BeRackLocationInventoryDto[];
}

interface BeInventoryByRackRes {
  warehouseId: string;
  warehouseName: string;
  racks: BeRackGroupDto[];
}

/** FE: 랙 그룹 내부의 로케이션(=층) 단위 재고 */
export interface RackLocationInventory {
  location_id: string;
  location_code: string;
  floor_no: number;
  max_capacity: number | null;
  // 재고 (없으면 null/0)
  inventory_id: string | null;
  product_id: string | null;
  product_sku: string | null;
  product_name: string | null;
  available_qty: number;
  reserved_qty: number;
  pending_qty: number;
  defect_qty: number;
  total_qty: number;
  updated_at: string | null;
}

export interface RackInventoryGroup {
  rack_id: string;
  rack_code: string;
  rack_name: string | null;
  zone_id: string;
  zone_code: string;
  zone_name: string;
  location_count: number;
  occupied_count: number;
  total_available_qty: number;
  locations: RackLocationInventory[];
}

export interface InventoryByRack {
  warehouse_id: string;
  warehouse_name: string;
  racks: RackInventoryGroup[];
}

function mapRackLocationInventory(b: BeRackLocationInventoryDto): RackLocationInventory {
  return {
    location_id: b.locationId,
    location_code: b.locationCode,
    floor_no: b.floorNo,
    max_capacity: b.maxCapacity ?? null,
    inventory_id: b.inventoryId ?? null,
    product_id: b.productId ?? null,
    product_sku: b.productSku ?? null,
    product_name: b.productName ?? null,
    available_qty: b.availableQty ?? 0,
    reserved_qty: b.reservedQty ?? 0,
    pending_qty: b.pendingQty ?? 0,
    defect_qty: b.defectQty ?? 0,
    total_qty: b.totalQty ?? 0,
    updated_at: b.updatedAt ?? null,
  };
}

function mapInventoryByRack(b: BeInventoryByRackRes): InventoryByRack {
  return {
    warehouse_id: b.warehouseId,
    warehouse_name: b.warehouseName,
    racks: (b.racks ?? []).map((r) => ({
      rack_id: r.rackId,
      rack_code: r.rackCode,
      rack_name: r.rackName ?? null,
      zone_id: r.zoneId,
      zone_code: r.zoneCode,
      zone_name: r.zoneName,
      location_count: r.locationCount ?? 0,
      occupied_count: r.occupiedCount ?? 0,
      total_available_qty: r.totalAvailableQty ?? 0,
      locations: (r.locations ?? []).map(mapRackLocationInventory),
    })),
  };
}

/**
 * GET /stock-service/inventory/warehouse/{warehouseId}/by-rack
 * 창고의 랙별 로케이션 + 재고 요약 (빈 로케이션 포함).
 * 랙을 외부 그룹, 층(floorNo)을 내부 순서로 제공한다.
 */
export const getInventoryByRack = async (warehouseId: string): Promise<InventoryByRack> => {
  const res = await apiClient.get<BeInventoryByRackRes>(
    `/stock-service/inventory/warehouse/${warehouseId}/by-rack`,
  );
  return mapInventoryByRack(res.data);
};

/* ── 재고 현황 ── */
export const getInventoryStocks = async (
  params?: { warehouseId?: string; zone?: string; search?: string },
): Promise<InventoryStock[]> => {
  // warehouseId 있으면 해당 창고만, 없으면 회사 전체 재고 조회
  const url = params?.warehouseId
    ? `/stock-service/inventory/warehouse/${params.warehouseId}`
    : '/stock-service/inventory/findAll';
  const res = await apiClient.get<BeInventoryRes[]>(url);
  let list = (res.data ?? []).map(mapBeInventory);
  if (params?.search) {
    const kw = params.search.toLowerCase();
    list = list.filter((s) => s.sku.toLowerCase().includes(kw) || s.product_name.toLowerCase().includes(kw));
  }
  if (params?.zone) list = list.filter((s) => s.zone_name === params.zone || s.zone_code === params.zone);
  return list;
};

export const getInventoryTransactions = async (
  stockId: string | number,
): Promise<InventoryTransaction[]> => {
  const res = await apiClient.get<BeInventoryTxRes[]>(
    `/stock-service/inventory/${stockId}/transactions`,
  );
  return (res.data ?? []).map(mapBeInventoryTx);
};

export type InventoryTransactionRefType =
  | 'inbound_order'
  | 'outbound_order'
  | 'transfer_order'
  | 'etc_inout_order'
  | 'stock_count'
  | 'manual';

export const getInventoryTransactionsByRef = async (
  refId: string,
  refType: InventoryTransactionRefType,
): Promise<InventoryTransaction[]> => {
  const res = await apiClient.get<BeInventoryTxRes[]>('/stock-service/inventory/transactions/by-ref', {
    params: { refId, refType },
  });
  return (res.data ?? []).map(mapBeInventoryTx);
};

/* ═══════ 재고 실사 ═══════ */

interface BeStockCountOrderRes {
  id: string; orderNo: string; warehouseId: string | null;
  status: string; createdBy: string | null; note: string | null;
  createdAt: string | null; completedAt: string | null;
  items?: BeStockCountItemRes[] | null;
}

interface BeStockCountItemRes {
  id: string; productId: string; locationId: string;
  systemQty: number; countQty: number | null; diffQty: number | null;
  status: string; countedBy: string | null; countedAt: string | null;
  note: string | null;
}

function mapBeStockCountOrder(b: BeStockCountOrderRes): StockCountOrder {
  return {
    id: b.id, order_no: b.orderNo,
    warehouse_id: b.warehouseId ?? '',
    warehouse_name: '', // 호출부에서 warehouses와 조인
    status: (b.status ?? 'draft') as StockCountStatus,
    created_by: b.createdBy ?? '', note: b.note ?? '',
    created_at: (b.createdAt ?? '').slice(0, 10),
    completed_at: b.completedAt ?? null,
  };
}

function mapBeStockCountItem(b: BeStockCountItemRes): StockCountItem {
  return {
    id: b.id,
    product_id: b.productId,
    product_name: '', // 호출부에서 products와 조인
    sku: '',          // 호출부에서 products와 조인
    location_id: b.locationId,
    location_code: '', // 호출부에서 조인
    system_qty: b.systemQty ?? 0,
    count_qty: b.countQty ?? null,
    diff_qty: b.diffQty ?? null,
    status: (b.status ?? 'pending') as StockCountItemStatus,
    counted_by: b.countedBy ?? null,
    counted_at: b.countedAt ?? null,
    note: b.note ?? null,
  };
}

/** GET /stock-service/stock-count/list */
export const getStockCountOrders = async (): Promise<StockCountOrder[]> => {
  const res = await apiClient.get<{ content: BeStockCountOrderRes[] } | BeStockCountOrderRes[]>(
    '/stock-service/stock-count/list', { params: { size: 200 } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeStockCountOrder);
};

/** POST /stock-service/stock-count/search — 실사 지시서 검색 (productIds 포함). */
export const searchStockCounts = async (
  filters: { status?: string; productIds?: string[] },
  page = 0,
  size = 1000,
  sort?: string,
): Promise<StockCountOrder[]> => {
  const query: Record<string, string | number> = { page, size };
  if (sort) query.sort = sort;
  const body: Record<string, unknown> = {};
  if (filters.status) body.status = filters.status;
  if (filters.productIds && filters.productIds.length > 0) body.productIds = filters.productIds;
  const res = await apiClient.post<{ content: BeStockCountOrderRes[] } | BeStockCountOrderRes[]>(
    '/stock-service/stock-count/search',
    body,
    { params: query },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeStockCountOrder);
};

/** GET /stock-service/stock-count/detail/{id} — 품목 포함 */
export const getStockCountDetail = async (id: string): Promise<{ order: StockCountOrder; items: StockCountItem[] }> => {
  const res = await apiClient.get<BeStockCountOrderRes>(`/stock-service/stock-count/detail/${id}`);
  return {
    order: mapBeStockCountOrder(res.data),
    items: (res.data.items ?? []).map(mapBeStockCountItem),
  };
};

export interface CreateStockCountInput {
  warehouseId: string;
  note: string;
  items: { productId: string; locationId: string }[];
}

/** POST /stock-service/stock-count/create — 응답: UUID string */
export const createStockCountOrder = async (input: CreateStockCountInput): Promise<string> => {
  const res = await apiClient.post<string>('/stock-service/stock-count/create', input);
  return typeof res.data === 'string' ? res.data : String(res.data);
};

/** PATCH /stock-service/stock-count/{id}/start */
export const startStockCount = async (id: string): Promise<void> => {
  await apiClient.patch(`/stock-service/stock-count/${id}/start`);
};

/** PATCH /stock-service/stock-count/{id}/items/{itemId}/count */
export const countStockCountItem = async (orderId: string, itemId: string, countQty: number, note?: string): Promise<void> => {
  await apiClient.patch(`/stock-service/stock-count/${orderId}/items/${itemId}/count`, { countQty, note: note ?? null });
};

/** PATCH /stock-service/stock-count/{id}/complete */
export const completeStockCount = async (id: string): Promise<void> => {
  await apiClient.patch(`/stock-service/stock-count/${id}/complete`);
};

/** PATCH /stock-service/stock-count/{id}/cancel */
export const cancelStockCount = async (id: string): Promise<void> => {
  await apiClient.patch(`/stock-service/stock-count/${id}/cancel`);
};

/* ═══════ 적재율 ═══════ */

import type { RackUsageSummary, ZoneRackUsage } from '@/types/dashboard';

interface BeRackUsageSummary {
  totalLocations: number; occupiedLocations: number; emptyLocations: number; occupancyRate: number;
  totalRacks: number; usedRacks: number; emptyRacks: number; rackOccupancyRate: number;
}

interface BeZoneRackUsage {
  zoneId: string; zoneName: string; zoneCode: string;
  totalLocations: number; occupiedLocations: number; occupancyRate: number;
  totalRacks: number; usedRacks: number;
}

/** GET /stock-service/inventory/rack-usage?warehouseId=... */
export const getRackUsageSummary = async (warehouseId?: string): Promise<RackUsageSummary> => {
  const res = await apiClient.get<BeRackUsageSummary>('/stock-service/inventory/rack-usage', {
    params: warehouseId ? { warehouseId } : {},
  });
  const b = res.data;
  return {
    total_locations: b.totalLocations ?? 0, occupied_locations: b.occupiedLocations ?? 0,
    empty_locations: b.emptyLocations ?? 0, occupancy_rate: b.occupancyRate ?? 0,
    total_racks: b.totalRacks ?? 0, used_racks: b.usedRacks ?? 0,
    empty_racks: b.emptyRacks ?? 0, rack_occupancy_rate: b.rackOccupancyRate ?? 0,
  };
};

/** GET /stock-service/inventory/rack-usage/by-zone?warehouseId=... */
export const getRackUsageByZone = async (warehouseId?: string): Promise<ZoneRackUsage[]> => {
  const res = await apiClient.get<BeZoneRackUsage[]>('/stock-service/inventory/rack-usage/by-zone', {
    params: warehouseId ? { warehouseId } : {},
  });
  return (res.data ?? []).map((b) => ({
    zone_id: b.zoneId, zone_name: b.zoneName, zone_code: b.zoneCode,
    total_locations: b.totalLocations ?? 0, occupied_locations: b.occupiedLocations ?? 0,
    occupancy_rate: b.occupancyRate ?? 0, total_racks: b.totalRacks ?? 0, used_racks: b.usedRacks ?? 0,
  }));
};

/* ═══════ 상품 재고 위치 조회 ═══════ */

export interface ProductLocation {
  warehouse_id: string;
  warehouse_name: string;
  zone_id: string;
  zone_name: string;
  rack_id: string;
  rack_code: string;
  location_id: string;
  location_code: string;
  floor_no: number;
  available_qty: number;
  reserved_qty: number;
  pending_qty: number;
  defect_qty: number;
  total_qty: number;
}

interface BeProductLocationRes {
  warehouseId: string; warehouseName: string;
  zoneId: string; zoneName: string;
  rackId: string; rackCode: string;
  locationId: string; locationCode: string;
  floorNo: number; availableQty: number; reservedQty: number;
  pendingQty: number; defectQty: number; totalQty: number;
}

/** GET /stock-service/inventory/product/{productId}/locations?warehouseId=... */
export const getProductLocations = async (productId: string, warehouseId?: string): Promise<ProductLocation[]> => {
  const res = await apiClient.get<BeProductLocationRes[]>(
    `/stock-service/inventory/product/${productId}/locations`,
    { params: warehouseId ? { warehouseId } : {} },
  );
  return (res.data ?? []).map((b) => ({
    warehouse_id: b.warehouseId, warehouse_name: b.warehouseName,
    zone_id: b.zoneId, zone_name: b.zoneName,
    rack_id: b.rackId, rack_code: b.rackCode,
    location_id: b.locationId, location_code: b.locationCode,
    floor_no: b.floorNo, available_qty: b.availableQty ?? 0,
    reserved_qty: b.reservedQty ?? 0, pending_qty: b.pendingQty ?? 0,
    defect_qty: b.defectQty ?? 0, total_qty: b.totalQty ?? 0,
  }));
};
