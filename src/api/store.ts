import apiClient from './client';
import type { Store } from '@/types/store';

/* ═══════ 백엔드 master-service StoreResDto ═══════ */
interface BeStoreResDto {
  id: string;
  name: string;
  bizNo: string | null;
  code: string;
  ceoName: string | null;
  tel: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean | null;
  autoWaveEnabled: boolean | null;
}
interface BePage<T> { content: T[]; totalElements?: number; totalPages?: number }

function mapBeStore(b: BeStoreResDto): Store {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    business_no: b.bizNo ?? '',
    ceo_name: b.ceoName,
    tel: b.tel ?? '',
    email: b.email ?? '',
    address: b.address ?? '',
    is_active: b.isActive !== false,
    auto_wave_enabled: b.autoWaveEnabled === true,
  };
}

export interface CreateStoreInput {
  name: string;
  code: string;
  business_no?: string;
  ceo_name?: string | null;
  tel?: string;
  email?: string;
  address?: string;
}

/** GET /master-service/store/list */
export const getStores = async (): Promise<Store[]> => {
  const res = await apiClient.get<BePage<BeStoreResDto> | BeStoreResDto[]>(
    '/master-service/store/list',
    { params: { size: 200, sort: 'id,desc' } },
  );
  const arr = Array.isArray(res.data) ? res.data : res.data.content ?? [];
  return arr.map(mapBeStore);
};

/** GET /master-service/store/detail/{id} */
export const getStore = async (id: string): Promise<Store | null> => {
  const res = await apiClient.get<BeStoreResDto>(`/master-service/store/detail/${id}`);
  return res.data ? mapBeStore(res.data) : null;
};

/** POST /master-service/store/create — 응답으로 UUID 문자열 반환 */
export const createStore = async (input: CreateStoreInput): Promise<Store> => {
  const res = await apiClient.post<string>('/master-service/store/create', {
    name: input.name,
    code: input.code,
    bizNo: input.business_no,
    ceoName: input.ceo_name ?? null,
    tel: input.tel,
    email: input.email,
    address: input.address,
  });
  const newId = typeof res.data === 'string' ? res.data : String(res.data);
  const fresh = await getStore(newId);
  if (!fresh) throw new Error('출고처 생성 후 조회 실패');
  return fresh;
};

/** PUT /master-service/store/deactivate/{id} */
export const deactivateStore = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/store/deactivate/${id}`);
};

/** PUT /master-service/store/activate/{id} (백엔드에 있다면) */
export const activateStore = async (id: string): Promise<void> => {
  await apiClient.put(`/master-service/store/activate/${id}`);
};

/**
 * PATCH /master-service/store/{id}/auto-wave
 * true → 매일 07:00 스케줄러가 이 출고처의 OB 를 자동 웨이브 처리.
 * false → 자동 처리 제외 (수동 웨이브 생성만 가능).
 */
export const toggleStoreAutoWave = async (id: string, enabled: boolean): Promise<Store> => {
  const res = await apiClient.patch<BeStoreResDto>(
    `/master-service/store/${id}/auto-wave`,
    { autoWaveEnabled: enabled },
  );
  return mapBeStore(res.data);
};
