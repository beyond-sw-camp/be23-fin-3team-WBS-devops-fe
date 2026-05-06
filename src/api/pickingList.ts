import apiClient from '@/api/client';
import type { PickingList } from '@/types/order';

interface BePickingListRes {
  id: string; pickingNo: string;
  warehouseName: string | null;
  assignedTo: string | null;
  assignedToName: string | null; createdByName: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'partial';
  startedAt: string | null; completedAt: string | null; createdAt: string | null;
}
interface BePage<T> { content: T[] }

export const getWavePickingLists = async (): Promise<PickingList[]> => {
  const res = await apiClient.get<BePage<BePickingListRes> | BePickingListRes[]>(
    '/stock-service/pickingList/findAll',
    { params: { size: 100 } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map((b) => ({
    id: b.id,
    picking_no: b.pickingNo,
    warehouse_name: b.warehouseName ?? '-',
    assignee: b.assignedToName ?? '-',
    assigned_to: b.assignedTo ?? undefined,
    outbound_count: 0,
    status: b.status,
    started_at: b.startedAt,
    completed_at: b.completedAt,
  }));
};

/**
 * 웨이브 피킹리스트 생성
 *
 * 백엔드 WaveCreateReqDto:
 *   {
 *     outboundOrderIds: UUID[],
 *     assignments: Map<productId, userId>   // 선택. 비워두면 stock-service가 자동 배정
 *   }
 */
export const createWave = async (
  dto: {
    outboundOrderIds: string[];
    assignments?: Record<string, string>;
  },
): Promise<{ picking: PickingList; itemCount: number }> => {
  const res = await apiClient.post<string[]>('/stock-service/pickingList/wave', {
    outboundOrderIds: dto.outboundOrderIds,
    assignments: dto.assignments ?? {},
  });
  const createdUuids = Array.isArray(res.data) ? res.data : [];
  if (createdUuids.length === 0) throw new Error('피킹리스트 생성 실패');
  const detailRes = await apiClient.get(`/stock-service/pickingList/detail/${createdUuids[0]}`);
  const d = detailRes.data as BePickingListRes & { items?: unknown[] };
  const picking: PickingList = {
    id: d.id,
    picking_no: d.pickingNo,
    warehouse_name: d.warehouseName ?? '-',
    assignee: d.assignedToName ?? '-',
    assigned_to: d.assignedTo ?? undefined,
    outbound_count: dto.outboundOrderIds.length,
    status: d.status,
    started_at: d.startedAt,
    completed_at: d.completedAt,
  };
  return { picking, itemCount: d.items?.length ?? 0 };
};
