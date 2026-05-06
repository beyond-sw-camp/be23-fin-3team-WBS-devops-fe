import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  resource: string;
  children: React.ReactNode;
}

export default function PermissionGuard({ resource, children }: Props) {
  const { hasPermission } = useAuth();

  if (!hasPermission(resource)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
