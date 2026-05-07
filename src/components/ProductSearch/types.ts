import type { OwnerType } from '@/types/product';

/**
 * 상품 검색 공용 컴포넌트의 폼 상태.
 * localStorage 직렬화 대상이기도 함.
 */
export interface ProductSearchCondition {
  /** 통합 LIKE (name + sku + barcode) — 단순 키워드 모드 */
  keyword?: string;
  sku?: string;
  /** SKU prefix 적용 여부 — UI 토글 */
  skuPrefix?: boolean;
  barcode?: string;
  name?: string;
  /** 카테고리 캐스케이더의 리프 ID (BE가 자손 자동 매칭) */
  categoryId?: string;
  /** 카테고리 캐스케이더 경로 보존용 (대→중→소 순) */
  categoryPath?: string[];
  /** 카테고리 경로 라벨 — 칩 표시용 (예: ["전자제품", "노트북"]) */
  categoryPathLabels?: string[];
  supplierId?: string;
  ownerType?: OwnerType;
  /** undefined = 전체, true = 활성, false = 비활성 */
  isActive?: boolean;
  priceMin?: number;
  priceMax?: number;
  /** 옵션 값 ID — 같은 타입 내 OR, 다른 타입 간 AND (BE가 typeId로 자동 그룹화) */
  optionValueIds?: string[];
}

export type ProductSearchFilterKey =
  | 'keyword'
  | 'sku'
  | 'barcode'
  | 'name'
  | 'category'
  | 'supplier'
  | 'ownerType'
  | 'isActive'
  | 'price'
  | 'options';

export const ALL_FILTER_KEYS: ProductSearchFilterKey[] = [
  'keyword',
  'sku',
  'barcode',
  'name',
  'category',
  'supplier',
  'ownerType',
  'isActive',
  'price',
  'options',
];

export const EMPTY_CONDITION: ProductSearchCondition = {};

/** EAN-13 13자리 숫자 패턴 — 바코드 정확매칭 자동 분기 */
export const EAN13_PATTERN = /^\d{13}$/;
