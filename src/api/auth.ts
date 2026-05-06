import apiClient from './client';
import type { LoginRequest, LoginTokenResponse, LoginUser } from '@/types/user';
import { decodeJwt, getCurrentJwtPayload } from '@/utils/jwt';

/** myinfo 응답에 JWT의 isDeveloper 플래그를 합쳐서 LoginUser 완성 */
function enrichWithJwt(me: LoginUser & { permissions?: string[] }, token: string | null): LoginUser {
  const payload = decodeJwt(token);
  return { ...me, isDeveloper: payload?.isDeveloper === true, permissions: me.permissions ?? [] };
}

export const login = async (data: LoginRequest): Promise<LoginUser> => {
  // 1) 로그인 → 토큰 발급 (콜드 스타트 대비 timeout 무제한)
  const tokenRes = await apiClient.post<LoginTokenResponse>(
    '/account-service/user/doLogin',
    data,
    { timeout: 0 },
  );
  const accessToken = tokenRes.data.accessToken;
  localStorage.setItem('token', accessToken);
  localStorage.setItem('refreshToken', tokenRes.data.refreshToken);

  // 2) 내 정보 조회 + JWT의 isDeveloper 합치기
  const userRes = await apiClient.get<LoginUser>('/account-service/user/myinfo', { timeout: 0 });
  return enrichWithJwt(userRes.data, accessToken);
};

export const getMyInfo = async (): Promise<LoginUser> => {
  const res = await apiClient.get<LoginUser>('/account-service/user/myinfo');
  // 현재 localStorage 토큰의 isDeveloper 합치기
  const payload = getCurrentJwtPayload();
  return { ...res.data, isDeveloper: payload?.isDeveloper === true };
};

/** RT 로 새 AT 재발급. localStorage 의 token 을 새 값으로 교체 후 새 AT 반환. */
export const refreshAccessToken = async (): Promise<string> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) throw new Error('refresh token 이 없습니다. 다시 로그인해 주세요.');
  const res = await apiClient.post<LoginTokenResponse>(
    '/account-service/user/refresh-at',
    { refreshToken },
  );
  const newAt = res.data.accessToken;
  if (!newAt) throw new Error('새 access token 응답이 비어있습니다.');
  localStorage.setItem('token', newAt);
  return newAt;
};
