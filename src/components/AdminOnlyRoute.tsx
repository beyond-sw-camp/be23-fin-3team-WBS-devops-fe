import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

/** ADMIN(또는 DEVELOPER)만 접근 가능한 라우트 가드. 그 외는 홈으로. */
export default function AdminOnlyRoute({ children }: Props) {
  const { currentRole } = useAuth();
  if (currentRole !== 'ADMIN' && currentRole !== 'DEVELOPER') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
