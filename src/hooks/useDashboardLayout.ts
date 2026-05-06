import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

/**
 * 대시보드 패널 ID — 사용자가 표시/숨김/순서를 커스터마이즈 가능한 항목들.
 * KPI 카드 / 최근 작업 로그는 고정이므로 여기에 포함되지 않음.
 */
export type DashboardPanelId =
  | 'pendingOrders'
  | 'activeOrders'        // (신규) 실시간 진행 상황 — Streams 기반
  | 'minimap'
  | 'weeklyTrend'
  | 'hourlyThroughput'    // (신규) 시간별 처리량 — Streams 기반
  | 'returnRatio'         // (신규) 오늘 반품 비율 — Streams 기반
  | 'todayIssues'
  | 'lowStock';

export interface PanelConfig {
  id: DashboardPanelId;
  visible: boolean;
}

/**
 * 기본 레이아웃 — 신규 사용자 / 저장된 설정 없을 때 노출.
 *
 * 순서 의도:
 *   1. activeOrders — 한 row 통째로 (full width). 운영 한눈에.
 *   2. pendingOrders / minimap / weeklyTrend — 작업 + 시각화 + 추세
 *   3. hourlyThroughput / returnRatio / todayIssues — 처리량/반품/이슈
 *   4. lowStock — 마지막
 */
const DEFAULT_LAYOUT: PanelConfig[] = [
  { id: 'activeOrders',      visible: true },
  { id: 'pendingOrders',     visible: true },
  { id: 'minimap',           visible: true },
  { id: 'weeklyTrend',       visible: true },
  { id: 'hourlyThroughput',  visible: true },
  { id: 'returnRatio',       visible: true },
  { id: 'todayIssues',       visible: true },
  { id: 'lowStock',          visible: true },
];

const KEY_PREFIX = 'dashboard-layout';

function storageKey(userId: string | undefined | null): string {
  return userId ? `${KEY_PREFIX}-${userId}` : `${KEY_PREFIX}-anonymous`;
}

/**
 * 저장된 레이아웃을 읽되, 누락된 panel ID 가 있으면 기본 위치에 추가하고
 * 모르는 ID 는 무시 — 패널을 새로 추가하거나 제거해도 안전하게 마이그레이션.
 */
function reconcile(saved: PanelConfig[]): PanelConfig[] {
  const known = new Map(DEFAULT_LAYOUT.map((p) => [p.id, p]));
  const seen = new Set<DashboardPanelId>();
  const result: PanelConfig[] = [];
  for (const item of saved) {
    if (known.has(item.id) && !seen.has(item.id)) {
      result.push({ id: item.id, visible: !!item.visible });
      seen.add(item.id);
    }
  }
  for (const def of DEFAULT_LAYOUT) {
    if (!seen.has(def.id)) result.push(def);
  }
  return result;
}

function load(userId: string | undefined | null): PanelConfig[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;
    return reconcile(parsed as PanelConfig[]);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function save(userId: string | undefined | null, layout: PanelConfig[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(layout));
  } catch {
    // 저장 실패는 조용히 무시 — 표시는 정상 동작
  }
}

/**
 * 사용자별 대시보드 레이아웃 훅.
 * 저장 위치: localStorage key `dashboard-layout-{userId}`
 *   - 같은 사용자: 다시 로그인해도 본인 설정 그대로
 *   - 다른 사용자: 본인 키로 따로 저장 (서로 안 보임)
 */
export function useDashboardLayout() {
  const userId = useAuthStore((s) => s.user?.id);
  const [layout, setLayout] = useState<PanelConfig[]>(() => load(userId));

  // 사용자 바뀌면(로그아웃→로그인) 새 사용자 키로 다시 로드
  useEffect(() => {
    setLayout(load(userId));
  }, [userId]);

  const update = useCallback(
    (next: PanelConfig[]) => {
      setLayout(next);
      save(userId, next);
    },
    [userId],
  );

  const toggleVisible = useCallback(
    (id: DashboardPanelId) => {
      update(layout.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)));
    },
    [layout, update],
  );

  const move = useCallback(
    (id: DashboardPanelId, direction: 'up' | 'down') => {
      const idx = layout.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= layout.length) return;
      const next = [...layout];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      update(next);
    },
    [layout, update],
  );

  const reset = useCallback(() => {
    update(DEFAULT_LAYOUT);
  }, [update]);

  return { layout, toggleVisible, move, reset };
}
