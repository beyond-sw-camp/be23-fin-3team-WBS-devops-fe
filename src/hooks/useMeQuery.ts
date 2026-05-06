import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/api/me';
import { getMyInfo } from '@/api/auth';
import { useAuthStore } from '@/stores/authStore';

export const useUpdateMyInfo = () => {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: api.updateMyInfo,
    onSuccess: async () => {
      // 서버 최신 정보로 store 갱신
      const fresh = await getMyInfo();
      setUser(fresh);
      qc.invalidateQueries({ queryKey: ['myinfo'] });
    },
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: api.changePassword,
  });
