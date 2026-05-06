import { Button, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { useAuth } from '@/hooks/useAuth';

interface Props extends ButtonProps {
  resource: string;
  action: string;
  fallback?: 'hide' | 'disable';
}

export default function PermissionButton({
  resource,
  action,
  fallback = 'hide',
  children,
  ...rest
}: Props) {
  const { hasPermission } = useAuth();
  const allowed = hasPermission(resource, action);

  if (!allowed && fallback === 'hide') return null;

  if (!allowed) {
    return (
      <Tooltip title="권한이 없습니다">
        <Button {...rest} disabled>
          {children}
        </Button>
      </Tooltip>
    );
  }

  return <Button {...rest}>{children}</Button>;
}
