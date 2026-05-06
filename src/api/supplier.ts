import apiClient from './client';

/**
 * master-service supplier 연동 경량 타입.
 * 기존 legacy Vendor(id: number)와 분리 — 랙 supplier 지정 등 UUID 기반 참조에 사용.
 */
export interface Supplier {
  id: string;
  code: string;
  name: string;
  bizNo: string | null;
  ceoName: string | null;
  tel: string | null;
  email: string | null;
  address: string | null;
  esgGrade: string | null;
  ecoCertified: boolean;
  esgMemo: string | null;
  isActive: boolean;
}

interface BeSupplierResDto {
  id: string;
  name: string;
  bizNo: string | null;
  code: string;
  ceoName: string | null;
  tel: string | null;
  email: string | null;
  address: string | null;
  esgGrade: string | null;
  ecoCertified: boolean | null;
  esgMemo: string | null;
  isActive: boolean | null;
}
interface BePage<T> { content: T[]; totalElements?: number; totalPages?: number }

function mapBeSupplier(b: BeSupplierResDto): Supplier {
  return {
    id: b.id,
    name: b.name,
    bizNo: b.bizNo ?? null,
    code: b.code,
    ceoName: b.ceoName ?? null,
    tel: b.tel ?? null,
    email: b.email ?? null,
    address: b.address ?? null,
    esgGrade: b.esgGrade ?? null,
    ecoCertified: b.ecoCertified === true,
    esgMemo: b.esgMemo ?? null,
    isActive: b.isActive !== false,
  };
}

/** GET /master-service/supplier/list — 입고처 목록 (기본: 활성만) */
export const getSuppliers = async (opts?: { includeInactive?: boolean }): Promise<Supplier[]> => {
  const res = await apiClient.get<BePage<BeSupplierResDto> | BeSupplierResDto[]>(
    '/master-service/supplier/list',
    { params: { size: 200, sort: 'name,asc' } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  const all = arr.map(mapBeSupplier);
  return opts?.includeInactive ? all : all.filter((s) => s.isActive);
};

/** GET /master-service/supplier/detail/{id} */
export const getSupplier = async (id: string): Promise<Supplier | null> => {
  const res = await apiClient.get<BeSupplierResDto>(`/master-service/supplier/detail/${id}`);
  return res.data ? mapBeSupplier(res.data) : null;
};

export interface CreateSupplierInput {
  name: string;
  code: string;
  bizNo?: string | null;
  ceoName?: string | null;
  tel?: string | null;
  email?: string | null;
  address?: string | null;
  esgGrade?: string | null;
  ecoCertified?: boolean | null;
  esgMemo?: string | null;
}

export interface UpdateSupplierInput {
  name?: string;
  bizNo?: string | null;
  ceoName?: string | null;
  tel?: string | null;
  email?: string | null;
  address?: string | null;
  esgGrade?: string | null;
  ecoCertified?: boolean | null;
  esgMemo?: string | null;
}

/** POST /master-service/supplier/create — 응답으로 UUID 문자열 반환 */
export const createSupplier = async (input: CreateSupplierInput): Promise<Supplier> => {
  const res = await apiClient.post<string>('/master-service/supplier/create', input);
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const fresh = await getSupplier(newId);
  if (!fresh) throw new Error('입고처 생성 후 조회 실패');
  return fresh;
};

/** PUT /master-service/supplier/update/{id} */
export const updateSupplier = async (id: string, input: UpdateSupplierInput): Promise<void> => {
  await apiClient.put(`/master-service/supplier/update/${id}`, input);
};

/** PUT /master-service/supplier/deactivate/{id} */
export const deactivateSupplier = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/supplier/deactivate/${id}`);
};

/** PUT /master-service/supplier/activate/{id} */
export const activateSupplier = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/supplier/activate/${id}`);
};
