/**
 * 상품 검색 공용 컴포넌트.
 *
 * 두 가지 사용 모드:
 * - <ProductSearchModal>  : picker 모드 — 다른 화면에서 상품을 골라 attach (예: 발주, 입고, 출고)
 * - <ProductSearchInline> : filter 모드 — 페이지 상단 인라인 필터 바 (예: ProductPage, LowStockAlertPage)
 *
 * 공통:
 * - 10개 필터(상품명/SKU/바코드/브랜드/매입처/카테고리/소속/상태/가격대/옵션) — `enabledFilters`로 노출 제어
 * - localStorage 영속화 (scope별 또는 글로벌 — 사용자 토글)
 * - 바코드 EAN-13 13자리 자동 정확매칭 분기
 * - 옵션은 BE의 패싯 시멘틱(같은 타입 OR + 다른 타입 AND)
 */
export { default as ProductSearchModal } from './ProductSearchModal';
export { default as ProductSearchFilterModal } from './ProductSearchFilterModal';
export { default as ProductSearchInline } from './ProductSearchInline';
export { default as ProductSearchResult } from './ProductSearchResult';
export { default as ProductSearchForm } from './ProductSearchForm';
export { default as ActiveConditionChips } from './ActiveConditionChips';
export { default as ProductFilterButtonBar, ProductFilterTriggerButton, ProductFilterStatusBar } from './ProductFilterButtonBar';
export { useProductSearchStorage } from './useProductSearchStorage';
export type { ProductSearchCondition, ProductSearchFilterKey } from './types';
export { ALL_FILTER_KEYS, EMPTY_CONDITION } from './types';
