import apiClient from './client';
import type { Role, Permission, CreateRoleRequest, UpdateRoleRequest } from '@/types/role';

/** 역할 목록 조회 — GET /admin/roles */
export const getRoles = async (): Promise<Role[]> => {
  return (await apiClient.get<Role[]>('/account-service/admin/roles')).data;
};

/** 역할 생성 — POST /admin/roles → UUID */
export const createRole = async (data: CreateRoleRequest): Promise<string> => {
  return (await apiClient.post<string>('/account-service/admin/roles', data)).data;
};

/** 역할 수정 — PATCH /admin/roles/{id} */
export const updateRole = async (id: string, data: UpdateRoleRequest): Promise<void> => {
  await apiClient.patch(`/account-service/admin/roles/${id}`, data);
};

/** 역할 삭제 — DELETE /admin/roles/{id} */
export const deleteRole = async (id: string): Promise<void> => {
  await apiClient.delete(`/account-service/admin/roles/${id}`);
};

/** 권한 마스터 조회 — GET /admin/permissions */
export const getPermissions = async (): Promise<Permission[]> => {
  return (await apiClient.get<Permission[]>('/account-service/admin/permissions')).data;
};
