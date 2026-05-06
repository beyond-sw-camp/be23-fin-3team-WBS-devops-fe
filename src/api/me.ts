import apiClient from './client';
import type { UpdateMyInfoRequest, ChangePasswordRequest } from '@/types/user';

/** PATCH /user/myinfo — 내 정보 수정 (이메일, 전화번호) */
export const updateMyInfo = async (data: UpdateMyInfoRequest): Promise<void> => {
  await apiClient.patch('/account-service/user/myinfo', data);
};

/** PATCH /user/password — 비밀번호 변경 */
export const changePassword = async (data: ChangePasswordRequest): Promise<void> => {
  await apiClient.patch('/account-service/user/password', data);
};
