import { create } from 'zustand';
import type { LoginUser } from '@/types/user';
import { activateStomp, deactivateStomp } from '@/lib/stompClient';

interface AuthState {
  isLoggedIn: boolean;
  user: LoginUser | null;
  login: (user: LoginUser) => void;
  logout: () => void;
  setUser: (user: LoginUser) => void;
}

/**
 * 회사(client) 단위로 격리되는 사용자 선호 / 캐시 키들.
 * 로그아웃 또는 다른 회사 계정으로 갈아탈 때 잔존하면
 * 이전 회사의 warehouseId 등이 새 세션에서 호출돼 403을 유발한다.
 */
const TENANT_SCOPED_LS_KEYS = [
  'inbound:lastWarehouseId',
  'wbs:layout:returnTo',
  'wbs:layout:returnLabel',
];

function clearTenantScopedStorage() {
  for (const key of TENANT_SCOPED_LS_KEYS) {
    localStorage.removeItem(key);
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: !!localStorage.getItem('token'),
  user: null,
  login: (user) => {
    localStorage.setItem('userName', user.name);
    set({ isLoggedIn: true, user });
    activateStomp();
  },
  setUser: (user) => {
    localStorage.setItem('userName', user.name);
    set({ user });
  },
  logout: () => {
    deactivateStomp();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    clearTenantScopedStorage();
    localStorage.removeItem('userName');
    set({ isLoggedIn: false, user: null });
  },
}));

if (typeof window !== 'undefined' && localStorage.getItem('token')) {
  activateStomp();
}
