import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole, PermissionAction, PermissionDomain, PermissionMatrix } from '@/types/permission';

type OverrideMap = Partial<Record<AppRole, Partial<PermissionMatrix>>>;

function allTrue(): Record<PermissionAction, boolean> {
  return { read: true, create: true, update: true, delete: true };
}

function from(read: boolean, create: boolean, update: boolean, del: boolean): Record<PermissionAction, boolean> {
  return { read, create, update, delete: del };
}

/**
 * 기본 RBAC 역할별 권한 매트릭스.
 * 추후 API 연동 시 `usePermission(overrides)`의 overrides 로 서버 응답을 주입.
 */
const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, PermissionMatrix> = {
  DEVELOPER: {
    USER_MGMT: allTrue(),
    ITEM_MASTER: allTrue(),
    INBOUND: allTrue(),
    OUTBOUND: allTrue(),
    PICKING_LIST: allTrue(),
    STOCK_VIEW: allTrue(),
    STOCK_AUDIT: allTrue(),
    STOCK_ADJUST: allTrue(),
  },
  ADMIN: {
    USER_MGMT: allTrue(),
    ITEM_MASTER: allTrue(),
    INBOUND: allTrue(),
    OUTBOUND: allTrue(),
    PICKING_LIST: allTrue(),
    STOCK_VIEW: allTrue(),
    STOCK_AUDIT: allTrue(),
    STOCK_ADJUST: allTrue(),
  },
  MANAGER: {
    USER_MGMT: from(true, false, true, false),
    ITEM_MASTER: from(true, true, true, false),
    INBOUND: from(true, true, true, false),
    OUTBOUND: from(true, true, true, false),
    PICKING_LIST: from(true, true, true, false),
    STOCK_VIEW: from(true, false, false, false),
    STOCK_AUDIT: from(true, true, true, false),
    STOCK_ADJUST: from(true, true, true, false),
  },
  OPERATOR: {
    USER_MGMT: from(false, false, false, false),
    ITEM_MASTER: from(true, false, false, false),
    INBOUND: from(true, true, false, false),
    OUTBOUND: from(true, true, false, false),
    PICKING_LIST: from(true, true, true, false),
    STOCK_VIEW: from(true, false, false, false),
    STOCK_AUDIT: from(true, true, false, false),
    STOCK_ADJUST: from(false, false, false, false),
  },
};

/**
 * RBAC 확장용 기본 훅.
 * 추후 API 연동 시 `overrides`를 서버 응답으로 치환하면 된다.
 */
export function usePermission(overrides?: OverrideMap) {
  const { currentRole } = useAuth();
  // 개발 단계 프리패스: RBAC 구조는 유지하되 모든 역할 수정 허용
  const DEV_PERMISSION_BYPASS = true;

  const merged = useMemo<Record<AppRole, PermissionMatrix>>(() => {
    const roles: AppRole[] = ['DEVELOPER', 'ADMIN', 'MANAGER', 'OPERATOR'];
    const next = { ...DEFAULT_ROLE_PERMISSIONS } as Record<AppRole, PermissionMatrix>;
    roles.forEach((role) => {
      const roleOverrides = overrides?.[role];
      if (!roleOverrides) return;
      (Object.keys(roleOverrides) as PermissionDomain[]).forEach((domain) => {
        next[role] = {
          ...next[role],
          [domain]: {
            ...next[role][domain],
            ...roleOverrides[domain],
          },
        };
      });
    });
    return next;
  }, [overrides]);

  const hasPermission = (domain: PermissionDomain, action: PermissionAction, role?: AppRole): boolean => {
    if (DEV_PERMISSION_BYPASS) return true;
    const targetRole = role ?? currentRole;
    return !!merged[targetRole]?.[domain]?.[action];
  };

  return { currentRole, permissionsByRole: merged, hasPermission };
}
