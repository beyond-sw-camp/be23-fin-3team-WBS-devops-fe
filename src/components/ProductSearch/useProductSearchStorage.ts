import { useCallback } from 'react';
import type { ProductSearchCondition } from './types';

/**
 * localStorage 영속화 — 글로벌 단일 키.
 * 모든 화면이 같은 키를 공유하므로 한 화면에서 적용한 조건이 다른 화면에서도 그대로 복원된다.
 *
 * 키 포맷: wms.productSearch.v1.global  (v1 prefix로 스키마 변경 시 자연 무효화)
 */
const STORAGE_KEY = 'wms.productSearch.v1.global';

export function useProductSearchStorage() {
  const load = useCallback((): ProductSearchCondition | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // 과거 envelope({savedAt, condition}) 형식 호환 — condition만 추출
      if (parsed && typeof parsed === 'object' && 'condition' in parsed) {
        return (parsed as { condition: ProductSearchCondition }).condition ?? null;
      }
      return parsed as ProductSearchCondition;
    } catch {
      return null;
    }
  }, []);

  const save = useCallback((condition: ProductSearchCondition) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(condition));
    } catch {
      /* quota 초과 등은 무시 */
    }
  }, []);

  const clear = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { load, save, clear };
}
