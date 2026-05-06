import apiClient from './client';
import type { WarehouseType } from '@/types/warehouse';

/**
 * master-service 창고 목록 연동 경량 타입.
 * - id 는 실제 UUID(string).
 * - 현재 주문(입출고) 모듈에서 드롭다운으로 창고를 고를 때 사용한다.
 */
export interface MasterWarehouse {
  id: string;
  code: string;
  name: string;
  address: string;
  active: boolean;
  warehouse_type?: WarehouseType;
}

/** Lombok Boolean isActive → JSON "isActive". Page 래퍼 또는 배열 모두 지원 */
interface BeMasterWarehouseRes {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean | null;
  warehouseType?: WarehouseType | null;
}
interface BePage<T> { content: T[]; totalElements?: number; totalPages?: number }

function mapBeWarehouse(b: BeMasterWarehouseRes): MasterWarehouse {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address ?? '',
    active: b.isActive !== false,
    warehouse_type: b.warehouseType ?? 'NORMAL',
  };
}

/** GET /master-service/warehouse/list — 소속 회사의 창고 목록 (활성 우선) */
export const getMasterWarehouses = async (): Promise<MasterWarehouse[]> => {
  const res = await apiClient.get<BePage<BeMasterWarehouseRes> | BeMasterWarehouseRes[]>(
    '/master-service/warehouse/list',
    { params: { size: 100, sort: 'id,desc' } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeWarehouse).filter((w) => w.active);
};
