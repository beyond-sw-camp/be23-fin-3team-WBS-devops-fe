import apiClient from './client';

/**
 * master-service ProductGroup 실연동.
 * 상품(Product) 은 반드시 ProductGroup 에 속해야 하고, ProductGroup 은 ProductCategory(소분류) 와 연결된다.
 */
export interface ProductGroup {
  id: string;
  category_id: string | null;
  category_name: string | null;
  name: string;
  code: string;
  brand: string | null;
  description: string | null;
  is_active: boolean;
}

interface BeProductGroupResDto {
  id: string;
  clientId: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  code: string;
  brand: string | null;
  description: string | null;
  isActive: boolean | null;
}
interface BePage<T> { content: T[]; totalElements?: number; totalPages?: number }

function mapBeGroup(b: BeProductGroupResDto): ProductGroup {
  return {
    id: b.id,
    category_id: b.categoryId ?? null,
    category_name: b.categoryName ?? null,
    name: b.name,
    code: b.code,
    brand: b.brand ?? null,
    description: b.description ?? null,
    is_active: b.isActive !== false,
  };
}

export interface CreateProductGroupInput {
  name: string;
  code: string;
  categoryId?: string | null;
  brand?: string | null;
  description?: string | null;
}

export const getProductGroups = async (categoryId?: string | null): Promise<ProductGroup[]> => {
  const res = await apiClient.get<BePage<BeProductGroupResDto> | BeProductGroupResDto[]>(
    '/master-service/product/group/list',
    { params: { size: 100, sort: 'id,desc', categoryId: categoryId ?? undefined } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeGroup).filter((g) => g.is_active);
};

export const createProductGroup = async (input: CreateProductGroupInput): Promise<ProductGroup> => {
  const res = await apiClient.post<string>('/master-service/product/group/create', {
    name: input.name,
    code: input.code,
    categoryId: input.categoryId ?? null,
    brand: input.brand ?? null,
    description: input.description ?? null,
  });
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const detail = await apiClient.get<BeProductGroupResDto>(`/master-service/product/group/detail/${newId}`);
  return mapBeGroup(detail.data);
};

export interface UpdateProductGroupInput {
  name?: string;
  brand?: string | null;
  description?: string | null;
  /** 이동 대상 카테고리 — null 이면 변경 없음, 지정 시 해당 UUID 로 이동 */
  categoryId?: string | null;
}

/** PATCH /master-service/product/group/update/{id} */
export const updateProductGroup = async (
  id: string,
  input: UpdateProductGroupInput,
): Promise<ProductGroup> => {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.brand !== undefined) body.brand = input.brand;
  if (input.description !== undefined) body.description = input.description;
  if (input.categoryId !== undefined) body.categoryId = input.categoryId;
  const res = await apiClient.patch<BeProductGroupResDto>(
    `/master-service/product/group/update/${id}`,
    body,
  );
  return mapBeGroup(res.data);
};

/** PUT /master-service/product/group/deactivate/{id} — 활성 상품 존재 시 거부 */
export const deactivateProductGroup = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/product/group/deactivate/${id}`);
};

/** PUT /master-service/product/group/activate/{id} — 비활성 카테고리 연결 시 거부 */
export const activateProductGroup = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/product/group/activate/${id}`);
};

/* ═══════ 상품그룹 자동 제안 ═══════ */
export interface ProductGroupSuggestion {
  suggested_code: string;
  existing_groups: { name: string; code: string }[];
}

interface BeProductGroupSuggestion {
  suggestedCode: string;
  existingGroups: { name: string; code: string }[];
}

/** GET /master-service/product/group/suggest?categoryId={uuid} */
export const suggestProductGroup = async (categoryId: string): Promise<ProductGroupSuggestion> => {
  const res = await apiClient.get<BeProductGroupSuggestion>('/master-service/product/group/suggest', {
    params: { categoryId },
  });
  return {
    suggested_code: res.data.suggestedCode,
    existing_groups: res.data.existingGroups ?? [],
  };
};
