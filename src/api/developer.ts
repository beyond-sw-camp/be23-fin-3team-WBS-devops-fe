import apiClient from './client';
import type { UserListItem } from '@/types/user';

export interface CreateCompanyRequest {
  name: string;
  bizNo: string;
  masterName: string;
  masterLoginId: string;
  masterEmail?: string;
  masterPassword: string;
}

/** 회사 목록 아이템 (ClientResDto) */
export interface ClientItem {
  id: string;
  name: string;
  bizNo: string;
  active: boolean;       // Lombok boolean isActive → JSON "active"
  createdAt: string;
}

/** 회사 상세 (ClientDetailResDto) */
export interface ClientDetail extends ClientItem {
  users: UserListItem[];
}

// ── API ──

/** POST /developer/clients — 회사 + ADMIN 계정 동시 생성 */
export const createCompany = async (data: CreateCompanyRequest): Promise<string> => {
  const res = await apiClient.post<string>('/account-service/developer/clients', data);
  return res.data;
};

/** GET /developer/clients — 회사 목록 (활성만) */
export const getClients = async (): Promise<ClientItem[]> => {
  const res = await apiClient.get<ClientItem[]>('/account-service/developer/clients');
  return res.data;
};

/** GET /developer/clients/{id} — 회사 상세 (소속 사용자 포함) */
export const getClientDetail = async (clientId: string): Promise<ClientDetail> => {
  const res = await apiClient.get<ClientDetail>(`/account-service/developer/clients/${clientId}`);
  return res.data;
};

/** DELETE /developer/clients/{id} — 회사 비활성화 (소속 사용자 전체 비활성화) */
export const deactivateClient = async (clientId: string): Promise<void> => {
  await apiClient.delete(`/account-service/developer/clients/${clientId}`);
};
