import apiClient from '@/api/client';
import { getInventoryByRack, type RackLocationInventory } from '@/api/inventory';

export interface LocationCellDto {
  locationId: string;
  row: number;
  col: number;
  status: 'EMPTY' | 'OCCUPIED' | 'PENDING';
  locationCode: string;
  productName: string | null;
  qty: number;
}

type LocationStatus = LocationCellDto['status'];

function parseRowColFromCode(locationCode: string): { row: number; col: number } {
  const parts = locationCode.split('-');
  const row = Number(parts[parts.length - 2]);
  const col = Number(parts[parts.length - 1]);
  return {
    row: Number.isFinite(row) && row > 0 ? row : 1,
    col: Number.isFinite(col) && col > 0 ? col : 1,
  };
}

function mapInventoryLocation(loc: RackLocationInventory): LocationCellDto {
  const rc = parseRowColFromCode(loc.location_code);
  let status: LocationCellDto['status'] = 'EMPTY';
  if (loc.pending_qty > 0 || loc.reserved_qty > 0) status = 'PENDING';
  else if (loc.total_qty > 0) status = 'OCCUPIED';
  return {
    locationId: loc.location_id,
    row: rc.row,
    col: rc.col,
    status,
    locationCode: loc.location_code,
    productName: loc.product_name,
    qty: loc.total_qty,
  };
}

/**
 * Rack 상세(LOCATION 단계) 진입 시 지연 로딩.
 * stock-service 표준 경로인 warehouse/{id}/by-rack 만 사용한다.
 */
export async function getRackLocationsLazy(warehouseId: string, rackId: string): Promise<LocationCellDto[]> {
  // 위치 지정 모달의 원본 데이터는 "재고"가 아니라 "마스터 로케이션"이어야 한다.
  // stock by-rack 이 비어도 master 로케이션이 있으면 반드시 선택 가능해야 함.
  try {
    const res = await apiClient.get<{
      content?: Array<{
        id: string;
        code: string;
        floorNo?: number | null;
      }>;
    }>('/master-service/location/list', {
      params: { rackId, size: 200 },
    });
    const list = res.data?.content ?? [];
    if (list.length > 0) {
      return list.map((row) => ({
        locationId: row.id,
        locationCode: row.code,
        row: Number(row.floorNo ?? 1),
        col: 1,
        status: 'EMPTY' as const,
        productName: null,
        qty: 0,
      }));
    }
  } catch {
    // ignore and fallback below
  }

  // 보조 fallback: stock by-rack (수량/점유정보)
  try {
    const byRack = await getInventoryByRack(warehouseId);
    const group = byRack.racks.find((r) => r.rack_id === rackId);
    if (group) return (group.locations ?? []).map(mapInventoryLocation);
    return [];
  } catch {
    return [];
  }
}

async function callWithFallback<T>(calls: Array<() => Promise<T>>): Promise<T> {
  let lastError: unknown;
  for (const call of calls) {
    try {
      return await call();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export async function createRackLocation(
  rackId: string,
  payload: { row: number; col: number; status: LocationStatus; maxCapacity?: number | null },
): Promise<LocationCellDto> {
  const res = await callWithFallback([
    () => apiClient.post('/stock-service/inventory/rack/' + rackId + '/locations', payload),
    () =>
      apiClient.post('/master-service/location/create', {
        rackId,
        floorNo: payload.row,
        maxCapacity: payload.maxCapacity ?? null,
      }),
  ]);
  const d = res.data as Record<string, unknown> | string;
  const createdId =
    typeof d === 'string'
      ? d
      : String((d as Record<string, unknown>).locationId ?? (d as Record<string, unknown>).id ?? `loc-${Date.now()}`);

  // master-service /location/create 는 UUID만 반환하므로 detail 재조회로 코드/층 정보 보강
  let detail: Record<string, unknown> | null = null;
  try {
    const detailRes = await apiClient.get(`/master-service/location/detail/${createdId}`);
    detail = detailRes.data as Record<string, unknown>;
  } catch {
    detail = null;
  }

  const source = detail ?? (typeof d === 'string' ? {} : d);
  const code = String(source.code ?? source.locationCode ?? `${rackId}-${payload.row}-01`);
  return {
    locationId: String(source.id ?? source.locationId ?? createdId),
    row: Number(source.floorNo ?? source.row ?? payload.row),
    col: Number(source.col ?? 1),
    status: String(source.status ?? payload.status ?? 'EMPTY').toUpperCase() as LocationStatus,
    locationCode: code,
    productName: (source.productName as string | null) ?? null,
    qty: Number(source.qty ?? source.totalQty ?? 0),
  };
}

export async function updateRackLocation(
  locationId: string,
  payload: { status?: LocationStatus; row?: number; col?: number },
): Promise<void> {
  await callWithFallback([
    () => apiClient.patch('/stock-service/inventory/locations/' + locationId, payload),
    () =>
      apiClient.patch('/master-service/location/update/' + locationId, {
        status: payload.status,
        rowNo: payload.row,
        colNo: payload.col,
      }),
  ]);
}

/**
 * 로케이션 maxCapacity 변경.
 * - null 전달 시: 무제한/미정으로 되돌림.
 * - 1 미만: BE 가 거부 (비활성화는 별도 deactivate 사용).
 */
export async function updateLocationMaxCapacity(
  locationId: string,
  maxCapacity: number | null,
): Promise<void> {
  await apiClient.patch(`/master-service/location/max-capacity/${locationId}`, { maxCapacity });
}

/**
 * 한 랙의 모든 location maxCapacity 일괄 변경.
 * 레이아웃 에디터에서 "이 랙 전체 층 = 200" 같은 일괄 적용 용도.
 * 반환: 변경된 location 개수.
 */
export async function bulkUpdateRackLocationMaxCapacity(
  rackId: string,
  maxCapacity: number | null,
): Promise<number> {
  const res = await apiClient.patch<{ updated: number }>(
    `/master-service/location/max-capacity-by-rack/${rackId}`,
    { maxCapacity },
  );
  return Number(res.data?.updated ?? 0);
}

export async function deleteRackLocation(locationId: string): Promise<void> {
  await callWithFallback([
    () => apiClient.delete('/stock-service/inventory/locations/' + locationId),
    () => apiClient.put('/master-service/location/deactivate/' + locationId),
  ]);
}

