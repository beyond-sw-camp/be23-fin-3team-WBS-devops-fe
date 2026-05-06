import { useMemo, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { AppRole } from '@/types/permission';

export function useAuth() {
  const { user } = useAuthStore();
  const currentRole = useMemo<AppRole>(() => {
    if (user?.isDeveloper) return 'DEVELOPER';

    const code = user?.roleCode;
    if (code === 'DEVELOPER') return 'DEVELOPER';
    if (code === 'ADMIN') return 'ADMIN';
    if (code === 'MANAGER') return 'MANAGER';
    if (code === 'OPERATOR') return 'OPERATOR';
    return 'OPERATOR';
  }, [user?.isDeveloper, user?.roleCode]);

  const permissions = useMemo<Set<string>>(
    () => new Set(user?.permissions ?? []),
    [user?.permissions],
  );

  const permissionsLoaded = permissions.size > 0;

  /** "RESOURCE:ACTION" 형식 권한 보유 여부. DEVELOPER/ADMIN은 전체 접근.
   *  permissions가 아직 없으면(백엔드 미구현) 모든 메뉴 허용(하위 호환). */
  const hasPermission = useCallback(
    (resource: string, action?: string): boolean => {
      if (currentRole === 'DEVELOPER' || currentRole === 'ADMIN') return true;
      if (!permissionsLoaded) return true;
      if (action) return permissions.has(`${resource}:${action}`);
      for (const p of permissions) {
        if (p.startsWith(`${resource}:`)) return true;
      }
      return false;
    },
    [currentRole, permissions, permissionsLoaded],
  );

  return { user, currentRole, permissions, hasPermission };
}
