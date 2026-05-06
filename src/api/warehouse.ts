import apiClient from './client';
import type { Warehouse, WarehouseType, Zone, ZoneType, Rack, ZoneLayout, RackLayout, RackStock, WarehouseCanvas } from '@/types/warehouse';

/* ── 창고 ── */
/** master-service WarehouseListResDto — Lombok Boolean isActive → JSON "isActive" */
interface BeWarehouseListResDto {
  id: string;
  name: string;
  code: string;
  address: string | null;
  isActive: boolean | null;
  warehouseType?: WarehouseType | null;
  zoneCount?: number | null;
  rackCount?: number | null;
  updatedAt?: string | null;
}
/** master-service WarehouseDetailResDto — 상세 전용 필드 포함 */
interface BeWarehouseDetailResDto extends BeWarehouseListResDto {
  managerName?: string | null;
  phone?: string | null;
  notes?: string | null;
}
interface BePage<T> { content: T[]; totalElements?: number; totalPages?: number }

function mapBeWarehouseList(b: BeWarehouseListResDto): Warehouse {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address ?? '',
    warehouse_type: b.warehouseType ?? 'NORMAL',
    zone_count: b.zoneCount ?? 0,
    rack_count: b.rackCount ?? 0,
    is_active: b.isActive !== false,
    updated_at: b.updatedAt ? b.updatedAt.slice(0, 10) : undefined,
  };
}

function mapBeWarehouseDetail(b: BeWarehouseDetailResDto): Warehouse {
  return {
    ...mapBeWarehouseList(b),
    manager_name: b.managerName ?? undefined,
    phone: b.phone ?? undefined,
    notes: b.notes ?? undefined,
  };
}

export const getWarehouses = async (warehouseType?: WarehouseType): Promise<Warehouse[]> => {
  const res = await apiClient.get<BePage<BeWarehouseListResDto> | BeWarehouseListResDto[]>(
    '/master-service/warehouse/list',
    { params: { size: 100, sort: 'id,desc', ...(warehouseType ? { warehouseType } : {}) } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeWarehouseList);
};

export const createWarehouse = async (data: Omit<Warehouse, 'id' | 'zone_count' | 'rack_count' | 'is_active'>): Promise<Warehouse> => {
  // code 는 백엔드에서 자동 생성 (예: WH-SEL-NOR-001) — 보내지 않음
  const res = await apiClient.post<string>('/master-service/warehouse/create', {
    name: data.name,
    address: data.address,
    regionCode: data.region_code ?? 'SEL',
    warehouseType: data.warehouse_type ?? 'NORMAL',
  });
  // 백엔드는 생성된 UUID 문자열만 반환 → detail 재조회로 전체 필드 채움
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const detail = await apiClient.get<BeWarehouseDetailResDto>(`/master-service/warehouse/detail/${newId}`);
  return mapBeWarehouseDetail(detail.data);
};

/** 부분 업데이트 — null/undefined 필드는 서버에서 무시됨 */
export const updateWarehouse = async (id: string, data: Partial<Warehouse>): Promise<Warehouse> => {
  // is_active 는 별도 activate/deactivate 엔드포인트
  if (data.is_active === true) {
    await apiClient.patch(`/master-service/warehouse/activate/${id}`);
  } else if (data.is_active === false) {
    await apiClient.patch(`/master-service/warehouse/deactivate/${id}`);
  }
  // 나머지 편집 가능 필드
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.address !== undefined) body.address = data.address;
  if (data.manager_name !== undefined) body.managerName = data.manager_name;
  if (data.phone !== undefined) body.phone = data.phone;
  if (data.notes !== undefined) body.notes = data.notes;
  if (Object.keys(body).length > 0) {
    await apiClient.patch(`/master-service/warehouse/update/${id}`, body);
  }
  const fresh = await getWarehouse(id);
  if (!fresh) throw new Error('창고 갱신 후 조회 실패');
  return fresh;
};

export const deactivateWarehouse = async (id: string): Promise<void> => {
  await apiClient.patch(`/master-service/warehouse/deactivate/${id}`);
};

export const activateWarehouse = async (id: string): Promise<void> => {
  await apiClient.patch(`/master-service/warehouse/activate/${id}`);
};

/* ── 구역 ── */
interface BeZoneResDto {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  categoryId?: string | null;
  categoryName?: string | null;
  parentId?: string | null;
  partnerId?: number | null;
  depth?: number | null;
  zoneType: ZoneType;
  rackCount?: number | null;
  sortOrder?: number | null;
  isActive: boolean | null;
}

function mapBeZone(b: BeZoneResDto): Zone {
  return {
    id: b.id,
    warehouse_id: b.warehouseId,
    code: b.code,
    name: b.name,
    category_id: b.categoryId ?? null,
    category_major: b.categoryName ?? undefined,
    zone_type: b.zoneType,
    rack_count: b.rackCount ?? 0,
    sort_order: b.sortOrder ?? 0,
    is_active: b.isActive !== false,
  };
}

export const getZones = async (warehouseId?: string): Promise<Zone[]> => {
  if (!warehouseId) return [];
  const res = await apiClient.get<BePage<BeZoneResDto> | BeZoneResDto[]>('/master-service/zone/list', {
    params: { warehouseId },
  });
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeZone);
};

export const createZone = async (data: Omit<Zone, 'id' | 'rack_count' | 'is_active'>): Promise<Zone> => {
  // code 는 백엔드에서 자동 생성 (예: ZN-SEL-ELC-001)
  const res = await apiClient.post<string>('/master-service/zone/create', {
    warehouseId: data.warehouse_id,
    name: data.name,
    zoneType: data.zone_type,
    sortOrder: data.sort_order ?? null,
    categoryId: data.category_id ?? null,
  });
  // 백엔드는 생성된 UUID 문자열만 반환 → detail 재조회로 전체 필드 채움
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const detail = await apiClient.get<BeZoneResDto>(`/master-service/zone/detail/${newId}`);
  return mapBeZone(detail.data);
};

export const updateZone = async (id: string, data: Partial<Zone>): Promise<Zone> => {
  if (data.is_active === true) {
    await apiClient.patch(`/master-service/zone/activate/${id}`);
  } else if (data.is_active === false) {
    await apiClient.patch(`/master-service/zone/deactivate/${id}`);
  }
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.zone_type !== undefined) body.zoneType = data.zone_type;
  if (data.sort_order !== undefined) body.sortOrder = data.sort_order;
  if (data.category_id !== undefined) body.categoryId = data.category_id;
  if (Object.keys(body).length > 0) {
    await apiClient.patch(`/master-service/zone/update/${id}`, body);
  }
  const res = await apiClient.get<BeZoneResDto>(`/master-service/zone/detail/${id}`);
  return mapBeZone(res.data);
};

export const deactivateZone = async (id: string): Promise<void> => {
  await apiClient.patch(`/master-service/zone/deactivate/${id}`);
};

export const activateZone = async (id: string): Promise<void> => {
  await apiClient.patch(`/master-service/zone/activate/${id}`);
};

/* ── 랙 ── */
interface BeRackListResDto {
  id: string;
  zoneId: string;
  warehouseId: string;
  name: string;
  code: string;
  supplierId?: string | null;
  supplierName?: string | null;
  levelNo?: number | null;
  levelGuideJson?: string | null;
  maxCapacity?: number | null;
  width?: number | null;
  depth?: number | null;
  height?: number | null;
  isActive: boolean | null;
}

function mapBeRack(b: BeRackListResDto): Rack {
  return {
    id: b.id,
    zone_id: b.zoneId,
    warehouse_id: b.warehouseId,
    code: b.code,
    name: b.name,
    supplier_id: b.supplierId ?? null,
    supplier_name: b.supplierName ?? null,
    level_no: b.levelNo ?? 1,
    level_guide_json: b.levelGuideJson ?? null,
    max_capacity: b.maxCapacity ?? undefined,
    width: b.width ?? null,
    depth: b.depth ?? null,
    height: b.height ?? null,
    is_active: b.isActive !== false,
  };
}

export const getRacks = async (params?: { warehouseId?: string; zoneId?: string }): Promise<Rack[]> => {
  const res = await apiClient.get<BePage<BeRackListResDto> | BeRackListResDto[]>('/master-service/rack/list', {
    params: { warehouseId: params?.warehouseId, zoneId: params?.zoneId },
  });
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeRack);
};

export const createRack = async (data: Omit<Rack, 'id' | 'is_active'>): Promise<Rack> => {
  // code 는 백엔드에서 자동 생성 (예: RK-ZN-SEL-ELC-001-LGX-001)
  const res = await apiClient.post<string>('/master-service/rack/create', {
    zoneId: data.zone_id,
    warehouseId: data.warehouse_id,
    supplierId: data.supplier_id ?? null,
    name: data.name,
    levelNo: data.level_no ?? null,
    levelGuideJson: data.level_guide_json ?? null,
    maxCapacity: data.max_capacity ?? null,
    widthMm: data.width ?? null,
    depthMm: data.depth ?? null,
    heightMm: data.height ?? null,
  });
  // controller 가 UUID 문자열만 반환 → 다시 detail 조회해서 전체 채움
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const detail = await apiClient.get<BeRackListResDto>(`/master-service/rack/detail/${newId}`);
  return mapBeRack(detail.data);
};

export const updateRack = async (id: string, data: Partial<Rack>): Promise<Rack> => {
  if (data.is_active === true) {
    await apiClient.patch(`/master-service/rack/activate/${id}`);
  } else if (data.is_active === false) {
    await apiClient.patch(`/master-service/rack/deactivate/${id}`);
  }
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.supplier_id !== undefined) body.supplierId = data.supplier_id;
  if (data.level_no !== undefined) body.levelNo = data.level_no;
  if (data.level_guide_json !== undefined) body.levelGuideJson = data.level_guide_json;
  if (data.max_capacity !== undefined) body.maxCapacity = data.max_capacity;
  if (data.width !== undefined) body.widthMm = data.width;
  if (data.depth !== undefined) body.depthMm = data.depth;
  if (data.height !== undefined) body.heightMm = data.height;
  if (Object.keys(body).length > 0) {
    const res = await apiClient.patch<BeRackListResDto>(`/master-service/rack/update/${id}`, body);
    return mapBeRack(res.data);
  }
  const detail = await apiClient.get<BeRackListResDto>(`/master-service/rack/detail/${id}`);
  return mapBeRack(detail.data);
};

export const deactivateRack = async (id: string): Promise<void> => {
  await apiClient.patch(`/master-service/rack/deactivate/${id}`);
};

export const activateRack = async (id: string): Promise<void> => {
  await apiClient.patch(`/master-service/rack/activate/${id}`);
};

/** @deprecated 백엔드에 hard delete 없음 — deactivateRack 사용 */
export const deleteRack = async (id: string): Promise<void> => {
  return deactivateRack(id);
};

/* ── 단건 조회 ── */
export const getWarehouse = async (id: string): Promise<Warehouse | null> => {
  const res = await apiClient.get<BeWarehouseDetailResDto>(`/master-service/warehouse/detail/${id}`);
  return res.data ? mapBeWarehouseDetail(res.data) : null;
};

/* ── 레이아웃 (창고 캔버스) ── */
interface BeWarehouseLayoutResDto {
  id: string;
  warehouseId: string;
  canvasWidth: number;
  canvasHeight: number;
  bgColor: string | null;
}

function mapBeWarehouseLayout(b: BeWarehouseLayoutResDto): WarehouseCanvas {
  return {
    warehouse_id: b.warehouseId,
    canvas_width: b.canvasWidth ?? 2000,
    canvas_height: b.canvasHeight ?? 1200,
    bg_color: b.bgColor ?? '#f0f3f8',
  };
}

/** 기본 캔버스 — 백엔드에 레이아웃이 아직 없으면 이 값으로 시작 */
const DEFAULT_CANVAS_WIDTH = 2000;
const DEFAULT_CANVAS_HEIGHT = 1200;
const DEFAULT_CANVAS_BG = '#f0f3f8';

function defaultCanvas(warehouseId: string): WarehouseCanvas {
  return {
    warehouse_id: warehouseId,
    canvas_width: DEFAULT_CANVAS_WIDTH,
    canvas_height: DEFAULT_CANVAS_HEIGHT,
    bg_color: DEFAULT_CANVAS_BG,
  };
}

export const getWarehouseCanvas = async (warehouseId: string): Promise<WarehouseCanvas> => {
  try {
    const res = await apiClient.get<BeWarehouseLayoutResDto>(`/master-service/layout/warehouse/${warehouseId}`);
    return res.data ? mapBeWarehouseLayout(res.data) : defaultCanvas(warehouseId);
  } catch {
    return defaultCanvas(warehouseId);
  }
};

export const saveWarehouseCanvas = async (canvas: WarehouseCanvas): Promise<WarehouseCanvas> => {
  const res = await apiClient.put<BeWarehouseLayoutResDto>('/master-service/layout/warehouse/save', {
    warehouseId: canvas.warehouse_id,
    canvasWidth: canvas.canvas_width,
    canvasHeight: canvas.canvas_height,
    bgColor: canvas.bg_color,
  });
  return mapBeWarehouseLayout(res.data);
};

/* ── 레이아웃 (구역) ── */
interface BeZoneLayoutResDto {
  id: string;
  zoneId: string;
  zoneName: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number | null;
  color: string | null;
  sortOrder: number | null;
}

function mapBeZoneLayout(b: BeZoneLayoutResDto, warehouseId: string): ZoneLayout {
  return {
    id: b.id,
    zone_id: b.zoneId,
    warehouse_id: warehouseId,
    pos_x: b.posX,
    pos_y: b.posY,
    width: b.width,
    height: b.height,
    rotation: b.rotation ?? 0,
    color: b.color ?? '#FFFFFF',
  };
}

export const getZoneLayouts = async (warehouseId: string): Promise<ZoneLayout[]> => {
  const res = await apiClient.get<BeZoneLayoutResDto[]>(`/master-service/layout/zone/${warehouseId}`);
  return (res.data ?? []).map((b) => mapBeZoneLayout(b, warehouseId));
};

export const saveZoneLayouts = async (
  warehouseId: string,
  layouts: ZoneLayout[],
  deletedZoneIds: string[] = [],
): Promise<ZoneLayout[]> => {
  const res = await apiClient.put<BeZoneLayoutResDto[]>('/master-service/layout/zone/save', {
    warehouseId,
    items: layouts.map((l) => ({
      zoneId: l.zone_id,
      posX: Math.round(l.pos_x),
      posY: Math.round(l.pos_y),
      width: Math.round(l.width),
      height: Math.round(l.height),
      rotation: Math.round(l.rotation ?? 0),
      color: l.color ?? null,
    })),
    deletedZoneIds,
  });
  return (res.data ?? []).map((b) => mapBeZoneLayout(b, warehouseId));
};

/* ── 레이아웃 (랙) ── */
interface BeRackLayoutResDto {
  id: string;
  rackId: string;
  rackName: string;
  zoneId: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number | null;
  color: string | null;
}

function mapBeRackLayout(b: BeRackLayoutResDto, warehouseId: string): RackLayout {
  return {
    rack_id: b.rackId,
    zone_id: b.zoneId,
    warehouse_id: warehouseId,
    pos_x: b.posX,
    pos_y: b.posY,
    width: b.width,
    height: b.height,
    rotation: b.rotation ?? 0,
  };
}

export const getRackLayouts = async (zoneId: string): Promise<RackLayout[]> => {
  const res = await apiClient.get<BeRackLayoutResDto[]>(`/master-service/layout/rack/${zoneId}`);
  // warehouseId 는 응답에 없음 — 첫 항목에서 추론 실패 시 ''
  const warehouseId = '';
  return (res.data ?? []).map((b) => mapBeRackLayout(b, warehouseId));
};

export const getRackLayoutsByWarehouse = async (warehouseId: string): Promise<RackLayout[]> => {
  const res = await apiClient.get<BeRackLayoutResDto[]>(`/master-service/layout/rack/warehouse/${warehouseId}`);
  return (res.data ?? []).map((b) => mapBeRackLayout(b, warehouseId));
};

export const saveRackLayouts = async (
  zoneId: string,
  warehouseId: string,
  layouts: RackLayout[],
  deletedRackIds: string[] = [],
): Promise<RackLayout[]> => {
  const res = await apiClient.put<BeRackLayoutResDto[]>('/master-service/layout/rack/save', {
    zoneId,
    warehouseId,
    items: layouts.map((l) => ({
      rackId: l.rack_id,
      posX: Math.round(l.pos_x),
      posY: Math.round(l.pos_y),
      width: Math.round(l.width),
      height: Math.round(l.height),
      rotation: l.rotation ?? 0,
      color: null,
    })),
    deletedRackIds,
  });
  return (res.data ?? []).map((b) => mapBeRackLayout(b, warehouseId));
};

/**
 * TODO: 실 BE rack-stock 조회 미구현 — 연동 시 실 API 호출로 교체.
 * 현재는 빈 배열 반환.
 */
export const getRackStocks = async (_warehouseId?: string): Promise<RackStock[]> => {
  return [];
};

