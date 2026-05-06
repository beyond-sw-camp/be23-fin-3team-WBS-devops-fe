import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as storeApi from '@/api/store';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deactivateSupplier,
  activateSupplier,
} from '@/api/supplier';
import type { UpdateSupplierInput } from '@/api/supplier';
import {
  getProductCategoryRoots,
  getProductCategoryChildren,
  createProductCategory,
  updateProductCategory,
  deactivateProductCategory,
  activateProductCategory,
} from '@/api/productCategory';
import type { UpdateProductCategoryInput } from '@/api/productCategory';
import {
  getProductsReal,
  updateProductReal,
  searchProducts,
  createProductReal,
  deactivateProductReal,
  searchProductsAdvanced,
  getProductByBarcode,
  getBrands,
} from '@/api/product';
import type { AdvancedSearchParams } from '@/api/product';
import {
  getProductGroups,
  createProductGroup,
  updateProductGroup,
  deactivateProductGroup,
  activateProductGroup,
} from '@/api/productGroup';
import type { UpdateProductGroupInput } from '@/api/productGroup';
import {
  getOptionTypes,
  createOptionType,
  getOptionValues,
  createOptionValue,
  getProductOptions,
} from '@/api/productOption';

/** master-service 실연동 supplier 목록 (UUID) — 랙/주문 등 UUID FK 선택용 (활성만) */
export const useSuppliers = () =>
  useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers() });

/** 입고처 관리 페이지용 — 비활성 포함 전체 목록 */
export const useAllSuppliers = () =>
  useQuery({ queryKey: ['suppliers', 'all'], queryFn: () => getSuppliers({ includeInactive: true }) });

export const useCreateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSupplier,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

export const useUpdateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSupplierInput }) => updateSupplier(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

export const useDeactivateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateSupplier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

export const useActivateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateSupplier(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

/** 상품 대분류 목록 — 구역 카테고리 선택용 */
export const useProductCategoryRoots = () =>
  useQuery({ queryKey: ['product-category-roots'], queryFn: getProductCategoryRoots });

/** 중분류 목록 */
export const useProductCategoryChildren = (parentId: string | null) =>
  useQuery({
    queryKey: ['product-category-children', parentId],
    queryFn: () => getProductCategoryChildren(parentId as string),
    enabled: !!parentId,
  });

export const useCreateProductCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProductCategory,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-category-roots'] });
      qc.invalidateQueries({ queryKey: ['product-category-children'] });
    },
  });
};

export const useUpdateProductCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductCategoryInput }) =>
      updateProductCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-category-roots'] });
      qc.invalidateQueries({ queryKey: ['product-category-children'] });
    },
  });
};

export const useDeactivateProductCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProductCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-category-roots'] });
      qc.invalidateQueries({ queryKey: ['product-category-children'] });
    },
  });
};

export const useActivateProductCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateProductCategory(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['product-category-roots'] });
      qc.invalidateQueries({ queryKey: ['product-category-children'] });
    },
  });
};

/* ── 출고처(Store) — master-service 실연동 ── */
export const useStores = () =>
  useQuery({ queryKey: ['stores'], queryFn: storeApi.getStores });

export const useCreateStore = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: storeApi.createStore, onSuccess: () => qc.invalidateQueries({ queryKey: ['stores'] }) });
};

export const useDeactivateStore = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: storeApi.deactivateStore, onSuccess: () => qc.invalidateQueries({ queryKey: ['stores'] }) });
};

export const useActivateStore = () => {
  const qc = useQueryClient();
  return useMutation({ mutationFn: storeApi.activateStore, onSuccess: () => qc.invalidateQueries({ queryKey: ['stores'] }) });
};

export const useToggleStoreAutoWave = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      storeApi.toggleStoreAutoWave(id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stores'] }),
  });
};

/* ── 상품 (실연동) ── */
export const useProducts = () =>
  useQuery({ queryKey: ['products'], queryFn: getProductsReal });

export const useSearchProducts = (keyword: string) =>
  useQuery({
    queryKey: ['product-search', keyword],
    queryFn: () => searchProducts(keyword),
    enabled: keyword.length >= 1,
    staleTime: 10_000,
  });

function invalidateAllProductLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['products'] });
  qc.invalidateQueries({ queryKey: ['product-search'] });
  qc.invalidateQueries({ queryKey: ['product-search-advanced'] });
}

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProductReal,
    onSuccess: () => invalidateAllProductLists(qc),
  });
};

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: import('@/api/product').UpdateProductInput }) =>
      updateProductReal(id, data),
    onSuccess: () => invalidateAllProductLists(qc),
  });
};

export const useDeactivateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProductReal(id),
    onSuccess: () => invalidateAllProductLists(qc),
  });
};

/* ── 상품 그룹 ── */
export const useProductGroups = (categoryId: string | null = null) =>
  useQuery({
    queryKey: ['product-groups', categoryId],
    queryFn: () => getProductGroups(categoryId),
  });

export const useCreateProductGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createProductGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-groups'] }),
  });
};

export const useUpdateProductGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductGroupInput }) =>
      updateProductGroup(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-groups'] }),
  });
};

export const useDeactivateProductGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateProductGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-groups'] }),
  });
};

export const useActivateProductGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateProductGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['product-groups'] }),
  });
};

/* ── 멀티필터 검색 ── */
export const useSearchProductsAdvanced = (
  params: AdvancedSearchParams,
  page = 0,
  size = 20,
  options?: { enabled?: boolean; sort?: string },
) =>
  useQuery({
    queryKey: ['product-search-advanced', params, page, size, options?.sort],
    queryFn: () => searchProductsAdvanced(params, page, size, options?.sort),
    enabled: options?.enabled ?? true,
    staleTime: 10_000,
  });

export const useProductByBarcode = (barcode: string | null) =>
  useQuery({
    queryKey: ['product-by-barcode', barcode],
    queryFn: () => getProductByBarcode(barcode as string),
    enabled: !!barcode,
    staleTime: 30_000,
  });

export const useBrands = () =>
  useQuery({
    queryKey: ['product-brands'],
    queryFn: getBrands,
    staleTime: 60_000,
  });

/* ── 상품 옵션 (타입 + 값) ── */
export const useOptionTypes = () =>
  useQuery({ queryKey: ['option-types'], queryFn: getOptionTypes });

export const useCreateOptionType = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOptionType,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['option-types'] }),
  });
};

export const useOptionValues = (optionTypeId: string | null) =>
  useQuery({
    queryKey: ['option-values', optionTypeId],
    queryFn: () => getOptionValues(optionTypeId as string),
    enabled: !!optionTypeId,
  });

export const useCreateOptionValue = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOptionValue,
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['option-values', vars.optionTypeId] }),
  });
};

/** 특정 상품의 옵션 매핑 — 수정 폼 진입 시 미리 체크용 */
export const useProductOptions = (productId: string | null) =>
  useQuery({
    queryKey: ['product-options', productId],
    queryFn: () => getProductOptions(productId as string),
    enabled: !!productId,
    staleTime: 30_000,
  });
