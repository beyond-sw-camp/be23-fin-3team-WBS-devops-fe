import { useCallback, useState } from 'react';
import { App } from 'antd';
import { searchProductsAdvanced } from '@/api/product';
import type { ProductSearchCondition } from '@/components/ProductSearch';
import { extractApiErrorMessage } from '@/utils/apiError';

/**
 * 지시서 상세 화면용 "상품 필터" 컨트롤러.
 *
 * 흐름:
 *  1) 사용자가 ProductSearchFilterModal에서 멀티필터 condition 적용
 *  2) condition을 master-service /product/search-advanced 에 보내 productIds[] 추출
 *  3) 부모는 productIds 변화에 따라 도메인별 items/search 훅을 호출해 라인 좁힘
 *
 * 반환:
 *  - open / openModal / closeModal : 모달 토글
 *  - productIds : null = 필터 미적용(전체) | string[] = 매칭된 상품 ID 목록 (빈 배열 = 매칭 없음)
 *  - condition  : 칩 표시용 마지막 적용 조건
 *  - apply(cond) : search-advanced 호출 후 productIds/condition 셋업, 모달 닫기
 *  - reset()    : productIds=null, condition={}
 *  - isFiltering : productIds !== null
 */
const SEARCH_PAGE_SIZE = 200;

export function useProductFilterForOrder() {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [productIds, setProductIds] = useState<string[] | null>(null);
  const [condition, setCondition] = useState<ProductSearchCondition>({});
  const [busy, setBusy] = useState(false);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => setOpen(false), []);

  const apply = useCallback(
    async (cond: ProductSearchCondition) => {
      setBusy(true);
      try {
        const page = await searchProductsAdvanced(cond, 0, SEARCH_PAGE_SIZE);
        const ids = page.content.map((p) => p.id);
        if (page.totalElements > SEARCH_PAGE_SIZE) {
          message.warning(
            `매칭된 상품이 ${page.totalElements.toLocaleString()}건입니다. 상위 ${SEARCH_PAGE_SIZE}건으로 좁혀졌습니다 — 조건을 더 추가해 주세요.`,
          );
        }
        setProductIds(ids);
        setCondition(cond);
        setOpen(false);
      } catch (err) {
        message.error(extractApiErrorMessage(err, '상품 검색 실패'));
      } finally {
        setBusy(false);
      }
    },
    [message],
  );

  const reset = useCallback(() => {
    setProductIds(null);
    setCondition({});
  }, []);

  return {
    open,
    openModal,
    closeModal,
    productIds,
    condition,
    apply,
    reset,
    isFiltering: productIds !== null,
    busy,
  };
}
