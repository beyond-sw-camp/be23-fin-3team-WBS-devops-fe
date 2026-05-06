import { create } from 'zustand';

/**
 * SO 재고 부족 실시간 트래커.
 *
 * 갱신 흐름:
 *   1. 첫 마운트 시 GET /stock-service/alert/so-shortage 로 현재 부족 SO 전체를 받아
 *      setShortages 로 seed (baseline)
 *   2. 이후 WS `/topic/admin/alerts/{clientId}` 의 added/resolved 이벤트로 실시간 반영
 *      - "so_shortage_added"    → addShortage(payload)
 *      - "so_shortage_resolved" → resolveShortage(salesOrderId)
 */
export interface SoShortageItem {
  productId: string;
  productName: string;
  sku: string;
  requiredQty: number;
  availableQty: number;
  shortageQty: number;
}

export interface SoShortagePayload {
  salesOrderId: string;
  soNo: string;
  scheduledDate: string;
  storeName: string;
  items: SoShortageItem[];
}

interface SoShortageState {
  /** salesOrderId → 부족 스냅샷 */
  shortages: Map<string, SoShortagePayload>;
  /** baseline (REST) 응답을 받아 store 가 한 번 채워졌는지 — 토스트 polic 분기용 */
  isInitialized: boolean;
  /** 페이지 진입/새로고침 시 REST API 응답으로 전체 교체 (baseline seed) */
  setShortages: (list: SoShortagePayload[]) => void;
  addShortage: (payload: SoShortagePayload) => void;
  resolveShortage: (salesOrderId: string) => void;
  clear: () => void;
}

export const useSoShortageStore = create<SoShortageState>((set) => ({
  shortages: new Map(),
  isInitialized: false,
  setShortages: (list) =>
    set(() => {
      const next = new Map<string, SoShortagePayload>();
      for (const p of list) next.set(p.salesOrderId, p);
      return { shortages: next, isInitialized: true };
    }),
  addShortage: (payload) =>
    set((state) => {
      const next = new Map(state.shortages);
      next.set(payload.salesOrderId, payload);
      return { shortages: next };
    }),
  resolveShortage: (salesOrderId) =>
    set((state) => {
      if (!state.shortages.has(salesOrderId)) return state;
      const next = new Map(state.shortages);
      next.delete(salesOrderId);
      return { shortages: next };
    }),
  clear: () => set({ shortages: new Map(), isInitialized: false }),
}));

/** 셀렉터 — 부족 SO 개수만 구독하고 싶을 때 */
export const useSoShortageCount = () =>
  useSoShortageStore((s) => s.shortages.size);
