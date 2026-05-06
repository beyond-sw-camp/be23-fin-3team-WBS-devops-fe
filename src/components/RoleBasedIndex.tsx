import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import DashboardPage from '@/pages/common/DashboardPage';

/**
 * 루트 경로(/)에서 역할에 따라 렌더링을 분기.
 * DEVELOPER → 회사 목록으로 리다이렉트
 * 나머지 → 대시보드
 */
export default function RoleBasedIndex() {
  const { currentRole } = useAuth();

  if (currentRole === 'DEVELOPER') {
    return <Navigate to="/developer/clients" replace />;
  }

  return <DashboardPage />;
}
