import apiClient from './client';

/**
 * master-service Product Option 연동.
 * 옵션 타입(예: 색상) → 옵션 값(예: 블랙/화이트) 2단계 구조.
 * 상품-옵션값은 다대다 매핑.
 */

export interface ProductOptionType {
  id: string;
  name: string;
  code: string;
}

export interface ProductOptionValue {
  id: string;
  optionTypeId: string;
  optionTypeName: string;
  value: string;
  code: string;
  sortOrder: number;
}

interface BeOptionTypeResDto {
  id: string;
  name: string;
  code: string;
}

interface BeOptionValueResDto {
  id: string;
  optionTypeId: string;
  optionTypeName: string | null;
  value: string;
  code: string;
  sortOrder: number | null;
}

interface BePage<T> { content?: T[]; totalElements?: number }

function unwrapList<T>(data: T[] | BePage<T> | null | undefined): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  return data.content ?? [];
}

function mapOptionType(b: BeOptionTypeResDto): ProductOptionType {
  return { id: b.id, name: b.name, code: b.code };
}

function mapOptionValue(b: BeOptionValueResDto): ProductOptionValue {
  return {
    id: b.id,
    optionTypeId: b.optionTypeId,
    optionTypeName: b.optionTypeName ?? '',
    value: b.value,
    code: b.code,
    sortOrder: b.sortOrder ?? 0,
  };
}

/** GET /master-service/product/option-type/list */
export const getOptionTypes = async (): Promise<ProductOptionType[]> => {
  const res = await apiClient.get<BeOptionTypeResDto[] | BePage<BeOptionTypeResDto>>(
    '/master-service/product/option-type/list',
  );
  return unwrapList(res.data).map(mapOptionType);
};

export interface CreateOptionTypeInput {
  name: string;
  code: string;
}

/** POST /master-service/product/option-type/create — ADMIN 전용. 응답은 UUID 문자열. */
export const createOptionType = async (input: CreateOptionTypeInput): Promise<string> => {
  const res = await apiClient.post<string>('/master-service/product/option-type/create', {
    name: input.name,
    code: input.code,
  });
  return typeof res.data === 'string' ? res.data : String(res.data);
};

/** GET /master-service/product/option-value/list?optionTypeId=... */
export const getOptionValues = async (optionTypeId: string): Promise<ProductOptionValue[]> => {
  const res = await apiClient.get<BeOptionValueResDto[] | BePage<BeOptionValueResDto>>(
    '/master-service/product/option-value/list',
    { params: { optionTypeId } },
  );
  return unwrapList(res.data).map(mapOptionValue).sort((a, b) => a.sortOrder - b.sortOrder);
};

export interface CreateOptionValueInput {
  optionTypeId: string;
  value: string;
  code: string;
  sortOrder: number;
}

/** POST /master-service/product/option-value/create — ADMIN 전용. */
export const createOptionValue = async (input: CreateOptionValueInput): Promise<string> => {
  const res = await apiClient.post<string>('/master-service/product/option-value/create', {
    optionTypeId: input.optionTypeId,
    value: input.value,
    code: input.code,
    sortOrder: input.sortOrder,
  });
  return typeof res.data === 'string' ? res.data : String(res.data);
};

/* ──────────── 상품-옵션 매핑 조회 ──────────── */

export interface ProductOptionMapping {
  id: string;
  productId: string;
  optionTypeId: string;
  optionTypeName: string;
  optionValueId: string;
  optionValue: string;
  optionValueCode: string;
}

interface BeProductOptionResDto {
  id: string;
  productId: string;
  optionTypeId: string;
  optionTypeName: string | null;
  optionValueId: string;
  optionValue: string;
  optionValueCode: string;
}

function mapProductOption(b: BeProductOptionResDto): ProductOptionMapping {
  return {
    id: b.id,
    productId: b.productId,
    optionTypeId: b.optionTypeId,
    optionTypeName: b.optionTypeName ?? '',
    optionValueId: b.optionValueId,
    optionValue: b.optionValue,
    optionValueCode: b.optionValueCode,
  };
}

/** GET /master-service/product/{id}/options — 특정 상품의 옵션 매핑 목록 */
export const getProductOptions = async (productId: string): Promise<ProductOptionMapping[]> => {
  const res = await apiClient.get<BeProductOptionResDto[] | BePage<BeProductOptionResDto>>(
    `/master-service/product/${productId}/options`,
  );
  return unwrapList(res.data).map(mapProductOption);
};
