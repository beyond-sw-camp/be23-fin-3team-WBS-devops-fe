import { create } from 'zustand';

/**
 * 재고 부족 (low-stock) 실시간 트래커.
 *
 * BE WebSocket 채널 `/topic/admin/alerts/{clientId}` 의 메시지 type:
 *   - "low_stock_added"    → addLowStock(payload)
 *   - "low_stock_resolved" → resolveLowStock(productId, warehouseId)
 *
 * 동일 (product × warehouse) 가 여러 번 발생해도 added 는 1회만 push 됨 (BE Redis diff).
 * 해소 시 resolved 1회 push.
 *
 * Map key 는 `${productId}:${warehouseId}` — 같은 SKU 라도 창고별로 별개 알림.
 */
export interface LowStockPayload {
  productId: string;
  productName: string;
  sku: string;
  warehouseId: string;
  warehouseName: string | null;
  availableQty: number;
  minStockQty: number;
}

const keyOf = (p: { productId: string; warehouseId: string }) =>
  `${p.productId}:${p.warehouseId}`;

interface LowStockState {
  /** `${productId}:${warehouseId}` → 부족 스냅샷 */
  shortages: Map<string, LowStockPayload>;
  /** baseline (REST) 응답을 받아 store 가 한 번 채워졌는지 — 토스트 정책 분기용 */
  isInitialized: boolean;
  /** 페이지 진입/새로고침 시 REST API 응답으로 전체 교체 (baseline seed) */
  setShortages: (list: LowStockPayload[]) => void;
  addShortage: (payload: LowStockPayload) => void;
  resolveShortage: (productId: string, warehouseId: string) => void;
  clear: () => void;
}

export const useLowStockStore = create<LowStockState>((set) => ({
  shortages: new Map(),
  isInitialized: false,
  setShortages: (list) =>
    set(() => {
      const next = new Map<string, LowStockPayload>();
      for (const p of list) next.set(keyOf(p), p);
      return { shortages: next, isInitialized: true };
    }),
  addShortage: (payload) =>
    set((state) => {
      const next = new Map(state.shortages);
      next.set(keyOf(payload), payload);
      return { shortages: next };
    }),
  resolveShortage: (productId, warehouseId) =>
    set((state) => {
      const k = keyOf({ productId, warehouseId });
      if (!state.shortages.has(k)) return state;
      const next = new Map(state.shortages);
      next.delete(k);
      return { shortages: next };
    }),
  clear: () => set({ shortages: new Map(), isInitialized: false }),
}));

/** 셀렉터 — 부족 (product × warehouse) 개수만 구독하고 싶을 때 */
export const useLowStockCount = () =>
  useLowStockStore((s) => s.shortages.size);
