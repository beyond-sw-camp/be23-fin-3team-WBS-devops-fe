import apiClient from './client';
import type { UserListItem, CreateUserRequest, UpdateUserRequest, User } from '@/types/user';

/** 사용자 목록 (admin) — GET /admin/users → UserListResDto[] */
export const getUsers = async (): Promise<UserListItem[]> => {
  return (await apiClient.get<UserListItem[]>('/account-service/admin/users')).data;
};

/** 사용자 생성 (admin) — POST /admin/users → UUID */
export const createUser = async (data: CreateUserRequest): Promise<string> => {
  const res = await apiClient.post<string>('/account-service/admin/users', data);
  return res.data;
};

/** 사용자 상세 (admin) — GET /admin/users/{id} → UserDetailResDto */
export const getUser = async (id: string): Promise<User> => {
  return (await apiClient.get<User>(`/account-service/admin/users/${id}`)).data;
};

/** 사용자 수정 (admin) — PATCH /admin/users/{id} */
export const updateUser = async (id: string, data: UpdateUserRequest): Promise<void> => {
  await apiClient.patch(`/account-service/admin/users/${id}`, data);
};

/** 사용자 비활성화 (admin) — DELETE /admin/users/{id} (soft delete) */
export const deleteUser = async (id: string): Promise<void> => {
  await apiClient.delete(`/account-service/admin/users/${id}`);
};
