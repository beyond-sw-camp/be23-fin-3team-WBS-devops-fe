import apiClient from './client';

/* ── 스케줄러 잡 이력 ── */

export type SchedulerStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'RUNNING';

/**
 * 스케줄러 실행 이력. 백엔드가 향후 다른 잡(재고 스냅샷, 야간 통계 등) 을 추가해도
 * 구조 변화 없이 쌓이도록 jobName 은 string 으로 열어둔다.
 */
export interface SchedulerHistory {
  id: string;
  job_name: string;
  status: SchedulerStatus;
  triggered_manually: boolean;
  started_at: string;
  finished_at: string | null;
  target_count: number;
  success_count: number;
  failed_count: number;
  error_message: string | null;
}

export interface SchedulerHistoryPage {
  content: SchedulerHistory[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

interface BeSchedulerHistoryRes {
  id: string;
  jobName: string;
  status: SchedulerStatus;
  triggeredManually: boolean;
  startedAt: string;
  finishedAt: string | null;
  targetCount: number;
  successCount: number;
  failedCount: number;
  errorMessage: string | null;
}

interface BePageRes<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

function mapBeHistory(b: BeSchedulerHistoryRes): SchedulerHistory {
  return {
    id: b.id,
    job_name: b.jobName,
    status: b.status,
    triggered_manually: b.triggeredManually,
    started_at: b.startedAt,
    finished_at: b.finishedAt,
    target_count: b.targetCount ?? 0,
    success_count: b.successCount ?? 0,
    failed_count: b.failedCount ?? 0,
    error_message: b.errorMessage,
  };
}

/** 수동으로 웨이브 스케줄러 실행 → 실행 결과 1건 반환 */
export const runWaveScheduler = async (): Promise<SchedulerHistory> => {
  const res = await apiClient.post<BeSchedulerHistoryRes>('/stock-service/scheduler/wave/run');
  return mapBeHistory(res.data);
};

/**
 * 한 스케줄러 실행의 처리 상세 — 펼치기 UI 용.
 *
 * BE 응답 한 행 = (OB × SO) 한 쌍. 분할 출고면 같은 OB 에 SO 수만큼 행이 들어옴.
 * FE 는 OB 단위로 그룹핑해서 표시 (`groupDetailsByOrder`).
 */
export interface SchedulerHistoryDetail {
  id: string;
  history_id: string;
  warehouse_id: string | null;
  warehouse_name: string | null;
  outbound_order_id: string;
  order_no: string | null;
  store_id: string | null;
  store_name: string | null;
  sales_order_id: string | null;
  so_no: string | null;
  picking_list_id: string | null;
  picking_no: string | null;
}

interface BeSchedulerHistoryDetail {
  id: string;
  historyId: string;
  warehouseId: string | null;
  warehouseName: string | null;
  outboundOrderId: string;
  orderNo: string | null;
  storeId: string | null;
  storeName: string | null;
  salesOrderId: string | null;
  soNo: string | null;
  pickingListId: string | null;
  pickingNo: string | null;
}

function mapBeHistoryDetail(b: BeSchedulerHistoryDetail): SchedulerHistoryDetail {
  return {
    id: b.id,
    history_id: b.historyId,
    warehouse_id: b.warehouseId,
    warehouse_name: b.warehouseName,
    outbound_order_id: b.outboundOrderId,
    order_no: b.orderNo,
    store_id: b.storeId,
    store_name: b.storeName,
    sales_order_id: b.salesOrderId,
    so_no: b.soNo,
    picking_list_id: b.pickingListId,
    picking_no: b.pickingNo,
  };
}

/** OB 단위 그룹 — 펼치기 표 한 행에 대응 */
export interface SchedulerHistoryOrderGroup {
  outbound_order_id: string;
  order_no: string | null;
  warehouse_name: string | null;
  store_name: string | null;
  picking_list_id: string | null;
  picking_no: string | null;
  /** 이 OB 가 묶인 수주서 번호들 (분할 출고면 다수) */
  so_nos: string[];
}

export function groupDetailsByOrder(rows: SchedulerHistoryDetail[]): SchedulerHistoryOrderGroup[] {
  const map = new Map<string, SchedulerHistoryOrderGroup>();
  for (const r of rows) {
    let g = map.get(r.outbound_order_id);
    if (!g) {
      g = {
        outbound_order_id: r.outbound_order_id,
        order_no: r.order_no,
        warehouse_name: r.warehouse_name,
        store_name: r.store_name,
        picking_list_id: r.picking_list_id,
        picking_no: r.picking_no,
        so_nos: [],
      };
      map.set(r.outbound_order_id, g);
    }
    if (r.so_no && !g.so_nos.includes(r.so_no)) g.so_nos.push(r.so_no);
  }
  return Array.from(map.values());
}

/** GET /scheduler/history/{id}/detail — 한 실행이 처리한 OB × SO 행 목록 */
export const getSchedulerHistoryDetail = async (historyId: string): Promise<SchedulerHistoryDetail[]> => {
  const res = await apiClient.get<BeSchedulerHistoryDetail[]>(
    `/stock-service/scheduler/history/${historyId}/detail`,
  );
  return (res.data ?? []).map(mapBeHistoryDetail);
};

/** 스케줄러 실행 이력 (페이징) */
export const getSchedulerHistory = async (params: {
  jobName?: string;
  page?: number;
  size?: number;
}): Promise<SchedulerHistoryPage> => {
  const { jobName, page = 0, size = 20 } = params;
  const res = await apiClient.get<BePageRes<BeSchedulerHistoryRes>>('/stock-service/scheduler/history', {
    params: {
      ...(jobName ? { jobName } : {}),
      page,
      size,
    },
  });
  return {
    content: (res.data.content ?? []).map(mapBeHistory),
    totalElements: res.data.totalElements ?? 0,
    totalPages: res.data.totalPages ?? 0,
    number: res.data.number ?? 0,
    size: res.data.size ?? size,
  };
};
