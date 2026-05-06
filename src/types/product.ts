/** 단위는 BOX 고정 */
export type ProductUnit = 'BOX';

/** 백엔드 OwnerType — 입고처 상품 vs 자사 상품 */
export type OwnerType = 'PARTNER' | 'OWN';

/**
 * master-service Product 매핑 타입.
 * - id 는 UUID 문자열
 * - 치수는 mm / kg 단위 (랙과 동일)
 */
export interface Product {
  id: string;
  owner_type: OwnerType;
  supplier_id?: string | null;
  product_group_id?: string | null;
  product_group_name?: string | null;
  category_id?: string | null;
  category: string;
  sku: string;
  barcode?: string | null;
  name: string;
  name_en?: string | null;
  unit: ProductUnit;
  unit_per_box?: number | null;
  standard_price: number;
  /** 치수 (mm) — 랙 체적과 동일 단위 */
  width: number;
  depth: number;
  height: number;
  is_active: boolean;
}

export type SizeType = 'small' | 'medium' | 'large';

/** 부피 (mm³) */
export function calcVolume(p: Pick<Product, 'width' | 'height' | 'depth'>): number {
  return (p.width ?? 0) * (p.height ?? 0) * (p.depth ?? 0);
}

/** mm³ 기준 사이즈 구분 */
export function getSizeType(volumeMm3: number): SizeType {
  // 5,000 cm³ = 5,000,000,000 mm³ → 소형
  // 50,000 cm³ = 50,000,000,000 mm³ → 중형
  if (volumeMm3 <= 5_000_000_000) return 'small';
  if (volumeMm3 <= 50_000_000_000) return 'medium';
  return 'large';
}
