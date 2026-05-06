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

export const useAuthStore = create<AuthState>((set) => ({
  isLoggedIn: !!localStorage.getItem('token'),
  user: null,
  login: (user) => {
    set({ isLoggedIn: true, user });
    activateStomp();
  },
  setUser: (user) => set({ user }),
  logout: () => {
    deactivateStomp();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    set({ isLoggedIn: false, user: null });
  },
}));

if (typeof window !== 'undefined' && localStorage.getItem('token')) {
  activateStomp();
}
