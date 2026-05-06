import { useMemo } from 'react';
import { useUsers } from '@/hooks/useSettingsQuery';

/** UUID → 사용자 이름 매핑. 감사 필드 표시에 공통 사용. */
export function useUserNameMap() {
  const { data: users = [] } = useUsers();
  return useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);
}

/** UUID를 이름으로 변환. 못 찾으면 앞 8자리. null이면 '-'. */
export function resolveUserName(map: Map<string, string>, userId: string | null | undefined): string {
  if (!userId) return '-';
  return map.get(userId) ?? `${userId.slice(0, 8)}…`;
}
