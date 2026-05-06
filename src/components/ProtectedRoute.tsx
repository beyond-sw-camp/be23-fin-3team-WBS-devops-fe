import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { getMyInfo } from '@/api/auth';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { isLoggedIn, user, login } = useAuthStore();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(isLoggedIn && !user);

  useEffect(() => {
    if (isLoggedIn && !user) {
      setLoading(true);
      getMyInfo()
        .then(login)
        .catch(() => {
          // 토큰 만료/무효 케이스 — 옛 회사 데이터 잔존 차단
          queryClient.clear();
          useAuthStore.getState().logout();
        })
        .finally(() => setLoading(false));
    }
  }, [isLoggedIn, user, login, queryClient]);

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '200px auto' }} />;
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
