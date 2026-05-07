import apiClient from './client';
import type { Product, OwnerType, ProductUnit } from '@/types/product';

/**
 * master-service Product 실연동.
 * Product 는 ProductGroup 을 통해 ProductCategory(대→중→소 계층) 와 연결된다.
 */

interface BeProductListResDto {
  id: string;
  ownerType: OwnerType;
  supplierId: string | null;
  productGroupId: string | null;
  productGroupName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  nameEn: string | null;
  unit: string;
  unitPerBox: number | null;
  standardPrice: number | string | null;
  isActive: boolean | null;
  weight: number | string | null;
  width: number | string | null;
  depth: number | string | null;
  height: number | string | null;
  weightKg: number | string | null;
}
interface BePage<T> { content: T[]; totalElements?: number; totalPages?: number }

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapBeProduct(b: BeProductListResDto): Product {
  return {
    id: b.id,
    owner_type: b.ownerType,
    supplier_id: b.supplierId ?? null,
    product_group_id: b.productGroupId ?? null,
    product_group_name: b.productGroupName ?? null,
    category_id: b.categoryId ?? null,
    category: b.categoryName ?? '',
    sku: b.sku,
    barcode: b.barcode ?? null,
    name: b.name,
    name_en: b.nameEn ?? null,
    unit: (b.unit as ProductUnit) ?? 'EA',
    unit_per_box: b.unitPerBox ?? null,
    standard_price: toNum(b.standardPrice),
    width: toNum(b.width),
    depth: toNum(b.depth),
    height: toNum(b.height),
    is_active: b.isActive !== false,
  };
}

export interface CreateProductInput {
  owner_type: OwnerType;
  supplier_id?: string | null;
  product_group_id?: string | null;
  sku: string;
  barcode?: string | null;
  name: string;
  name_en?: string | null;
  description?: string | null;
  unit: string;
  unit_per_box?: number | null;
  standard_price?: number | null;
  width: number;
  depth: number;
  height: number;
  option_value_ids?: string[];
}

/** GET /master-service/product/suggest-sku?productGroupId={uuid} → 자동제안 SKU 문자열 */
export const suggestProductSku = async (productGroupId: string): Promise<string> => {
  const res = await apiClient.get<string>('/master-service/product/suggest-sku', {
    params: { productGroupId },
  });
  return typeof res.data === 'string' ? res.data : String(res.data);
};

export const getProductsReal = async (): Promise<Product[]> => {
  const res = await apiClient.get<BePage<BeProductListResDto> | BeProductListResDto[]>(
    '/master-service/product/list',
    { params: { size: 1000, sort: 'id,desc' } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeProduct);
};

export const getProductReal = async (id: string): Promise<Product | null> => {
  const res = await apiClient.get<BeProductListResDto>(`/master-service/product/detail/${id}`);
  return res.data ? mapBeProduct(res.data) : null;
};

export const createProductReal = async (input: CreateProductInput): Promise<Product> => {
  const body: Record<string, unknown> = {
    ownerType: input.owner_type,
    supplierId: input.supplier_id ?? null,
    productGroupId: input.product_group_id ?? null,
    sku: input.sku,
    barcode: input.barcode ?? null,
    name: input.name,
    nameEn: input.name_en ?? null,
    description: input.description ?? null,
    unit: input.unit,
    unitPerBox: input.unit_per_box ?? null,
    standardPrice: input.standard_price ?? null,
    width: input.width,
    depth: input.depth,
    height: input.height,
  };
  if (input.option_value_ids && input.option_value_ids.length > 0) {
    body.optionValueIds = input.option_value_ids;
  }
  const res = await apiClient.post<string>('/master-service/product/create', body);
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const detail = await apiClient.get<BeProductListResDto>(`/master-service/product/detail/${newId}`);
  return mapBeProduct(detail.data);
};

export const deactivateProductReal = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/product/deactivate/${id}`);
};

/** PATCH /master-service/product/update/{id} — 변경할 필드만 전송.
 *  optionValueIds 의미: undefined = 변경 안 함, [] = 모두 제거, [...] = 기존 매핑 전체 교체. */
export interface UpdateProductInput {
  name?: string;
  barcode?: string;
  standard_price?: number;
  width?: number;
  depth?: number;
  height?: number;
  product_group_id?: string;
  option_value_ids?: string[];
}

export const updateProductReal = async (id: string, input: UpdateProductInput): Promise<Product> => {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.barcode !== undefined) body.barcode = input.barcode;
  if (input.standard_price !== undefined) body.standardPrice = input.standard_price;
  if (input.width !== undefined) body.width = input.width;
  if (input.depth !== undefined) body.depth = input.depth;
  if (input.height !== undefined) body.height = input.height;
  if (input.product_group_id !== undefined) body.productGroupId = input.product_group_id;
  if (input.option_value_ids !== undefined) body.optionValueIds = input.option_value_ids;
  const res = await apiClient.patch<BeProductListResDto>(`/master-service/product/update/${id}`, body);
  return mapBeProduct(res.data);
};

/** GET /master-service/product/search?keyword=...&page=0&size=20 — 상품 키워드 검색 */
export const searchProducts = async (keyword: string, page = 0, size = 20): Promise<Product[]> => {
  const res = await apiClient.get<BePage<BeProductListResDto>>(
    '/master-service/product/search',
    { params: { keyword, page, size } },
  );
  return (res.data.content ?? []).map(mapBeProduct);
};

/* ──────────── 멀티필터 검색 ──────────── */

export interface AdvancedSearchParams {
  keyword?: string;
  sku?: string;
  /** SKU prefix 모드 — BE는 단순 LIKE이므로 클라이언트에서 sku 끝에 %를 붙이는 대신 BE에서 처리됨 */
  barcode?: string;
  name?: string;
  categoryId?: string;
  supplierId?: string;
  productGroupId?: string;
  ownerType?: OwnerType;
  isActive?: boolean;
  priceMin?: number;
  priceMax?: number;
  /** 옵션 값 ID — 같은 타입 내 OR, 다른 타입 간 AND (BE가 typeId로 자동 그룹화) */
  optionValueIds?: string[];
}

export interface ProductPage {
  content: Product[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

/** GET /master-service/product/search-advanced — 멀티필터 검색 */
export const searchProductsAdvanced = async (
  params: AdvancedSearchParams,
  page = 0,
  size = 20,
  sort?: string,
): Promise<ProductPage> => {
  const query: Record<string, string | number | boolean> = { page, size };
  if (params.keyword) query.keyword = params.keyword;
  if (params.sku) query.sku = params.sku;
  if (params.barcode) query.barcode = params.barcode;
  if (params.name) query.name = params.name;
  if (params.categoryId) query.categoryId = params.categoryId;
  if (params.supplierId) query.supplierId = params.supplierId;
  if (params.productGroupId) query.productGroupId = params.productGroupId;
  if (params.ownerType) query.ownerType = params.ownerType;
  if (params.isActive !== undefined) query.isActive = params.isActive;
  if (params.priceMin !== undefined) query.priceMin = params.priceMin;
  if (params.priceMax !== undefined) query.priceMax = params.priceMax;
  if (params.optionValueIds && params.optionValueIds.length > 0) {
    query.optionValueIds = params.optionValueIds.join(',');
  }
  if (sort) query.sort = sort;

  const res = await apiClient.get<BePage<BeProductListResDto>>(
    '/master-service/product/search-advanced',
    { params: query },
  );
  return {
    content: (res.data.content ?? []).map(mapBeProduct),
    totalElements: res.data.totalElements ?? 0,
    totalPages: res.data.totalPages ?? 0,
    number: page,
    size,
  };
};

/** GET /master-service/product/by-barcode?barcode=... — EAN-13 정확매칭, 404면 null */
export const getProductByBarcode = async (barcode: string): Promise<Product | null> => {
  try {
    const res = await apiClient.get<BeProductListResDto>('/master-service/product/by-barcode', {
      params: { barcode },
    });
    return res.data ? mapBeProduct(res.data) : null;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw err;
  }
};

/** GET /master-service/product/group/brands — distinct brand 목록 (가나다 정렬) */
export const getBrands = async (): Promise<string[]> => {
  const res = await apiClient.get<string[]>('/master-service/product/group/brands');
  return Array.isArray(res.data) ? res.data : [];
};
