import apiClient from './client';

/**
 * master-service ProductCategory 연동.
 * 구역(Zone) 에 categoryId(UUID) FK 로 연결된다.
 */
export interface ProductCategory {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  depth: number;
  sortOrder: number;
  isActive: boolean;
}

interface BeProductCategoryResDto {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  depth: number | null;
  sortOrder: number | null;
  isActive: boolean | null;
}

function mapBeCategory(b: BeProductCategoryResDto): ProductCategory {
  return {
    id: b.id,
    parentId: b.parentId ?? null,
    name: b.name,
    code: b.code,
    depth: b.depth ?? 0,
    sortOrder: b.sortOrder ?? 0,
    isActive: b.isActive !== false,
  };
}

/** GET /master-service/product/category/list — 루트(대분류) 목록 */
export const getProductCategoryRoots = async (): Promise<ProductCategory[]> => {
  const res = await apiClient.get<BeProductCategoryResDto[]>('/master-service/product/category/list');
  return (res.data ?? []).map(mapBeCategory).filter((c) => c.isActive);
};

/** GET /master-service/product/category/children/{parentId} — 중분류 조회 */
export const getProductCategoryChildren = async (parentId: string): Promise<ProductCategory[]> => {
  const res = await apiClient.get<BeProductCategoryResDto[]>(`/master-service/product/category/children/${parentId}`);
  return (res.data ?? []).map(mapBeCategory).filter((c) => c.isActive);
};

export interface CreateProductCategoryInput {
  name: string;
  code: string;
  parentId?: string | null;
  sortOrder?: number | null;
}

/** POST /master-service/product/category/create — 카테고리 생성, 응답은 UUID 문자열 */
export const createProductCategory = async (input: CreateProductCategoryInput): Promise<ProductCategory> => {
  const res = await apiClient.post<string>('/master-service/product/category/create', {
    name: input.name,
    code: input.code,
    parentId: input.parentId ?? null,
    sortOrder: input.sortOrder ?? null,
  });
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const detail = await apiClient.get<BeProductCategoryResDto>(`/master-service/product/category/detail/${newId}`);
  return mapBeCategory(detail.data);
};

export interface UpdateProductCategoryInput {
  name?: string;
  sortOrder?: number | null;
}

/** PATCH /master-service/product/category/update/{id} */
export const updateProductCategory = async (
  id: string,
  input: UpdateProductCategoryInput,
): Promise<ProductCategory> => {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.sortOrder !== undefined) body.sortOrder = input.sortOrder;
  const res = await apiClient.patch<BeProductCategoryResDto>(
    `/master-service/product/category/update/${id}`,
    body,
  );
  return mapBeCategory(res.data);
};

/** PUT /master-service/product/category/deactivate/{id} — RESTRICT: 하위 카테고리 또는 활성 그룹 존재 시 거부 */
export const deactivateProductCategory = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/product/category/deactivate/${id}`);
};

/** PUT /master-service/product/category/activate/{id} — 비활성 parent 아래로는 활성화 불가 */
export const activateProductCategory = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/product/category/activate/${id}`);
};
