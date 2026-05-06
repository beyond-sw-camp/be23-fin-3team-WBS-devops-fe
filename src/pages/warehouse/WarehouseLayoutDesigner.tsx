import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Breadcrumb, Alert, Button, Space } from 'antd';
import { AppstoreAddOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import LayoutEditTab from './tabs/LayoutEditTab';
import ZoneLayoutPage from './ZoneLayoutPage';
import LevelStackView from './LevelStackView';
import { useZonesByWarehouse } from '@/hooks/useWarehouseQuery';

/**
 * 레거시 탭 키 — 외부(URL ?sub=...) 호환용. 새 드릴다운 구조에서는
 * 'zone'  → Level 1 (구역 뷰)
 * 'rack'  → Level 2 (랙 배치 뷰, fixedZoneId 필요)
 * 'preview' → Level 1 로 폴백 (전체 보기 탭 제거)
 */
const DESIGNER_TAB_KEYS = ['zone', 'rack', 'preview'] as const;
export type DesignerTabKey = (typeof DESIGNER_TAB_KEYS)[number];

export function isDesignerTabKey(v: string): v is DesignerTabKey {
  return (DESIGNER_TAB_KEYS as readonly string[]).includes(v);
}

type DrillLevel =
  | { level: 1 }
  | { level: 2; zoneId: string }
  | { level: 3; zoneId: string; rackId: string };

interface Props {
  warehouseId: string;
  /** controlled — 부모가 URL 동기화를 원하면 전달 (레거시 호환) */
  activeTab?: DesignerTabKey;
  onTabChange?: (tab: DesignerTabKey) => void;
  /** true면 편집 비활성 — 조회 전용 모드 (모니터링에서 사용) */
  readonly?: boolean;
  /** 검색 하이라이트용 — zone/rack/location ID 목록 */
  highlightZoneIds?: Set<string>;
  highlightRackIds?: Set<string>;
  highlightLocationIds?: Set<string>;
  /** 가동률 히트맵 모드 — L2(랙 배치)에서 각 랙 외곽을 적재율 색으로 칠한다 */
  showUtilization?: boolean;
}

/**
 * 창고 레이아웃 편집기 — 3단계 drill-down
 * L1 구역 뷰 → (zone 더블클릭) → L2 랙 배치 뷰 → (랙 선택 후 "층 상세 보기") → L3 층 스택 뷰
 */
export default function WarehouseLayoutDesigner({
  warehouseId, activeTab: controlled, onTabChange,
  readonly = false, highlightZoneIds, highlightRackIds, highlightLocationIds,
  showUtilization = false,
}: Props) {
  const [drill, setDrill] = useState<DrillLevel>({ level: 1 });
  const { data: zonesAll = [] } = useZonesByWarehouse(warehouseId);
  // 디자이너/모니터링은 운영 중인 구역만 — 비활성은 구역 관리 탭에서 다시 활성화
  const zones = useMemo(() => zonesAll.filter((z) => z.is_active !== false), [zonesAll]);
  const hasZones = zones.length > 0;

  // 자체 notifyTab 이 controlled 에 반영되어 effect 재실행될 때 drill 을 덮어쓰지 않도록 가드
  const lastSelfNotifiedRef = useRef<DesignerTabKey | null>(null);
  // 레거시 activeTab 외부 변경 동기화 — 'zone'/'preview' → L1, 'rack' → 첫 구역 L2
  useEffect(() => {
    if (!controlled) return;
    if (lastSelfNotifiedRef.current === controlled) {
      // 우리가 보낸 변경이 한 바퀴 돌아온 것 — drill 유지
      lastSelfNotifiedRef.current = null;
      return;
    }
    if (controlled === 'rack') {
      const firstZone = zones[0];
      if (firstZone) setDrill({ level: 2, zoneId: firstZone.id });
      else setDrill({ level: 1 });
    } else {
      setDrill({ level: 1 });
    }
  }, [controlled, zones]);

  const notifyTab = useCallback(
    (lvl: DrillLevel) => {
      if (!onTabChange) return;
      const key: DesignerTabKey = lvl.level === 1 ? 'zone' : 'rack';
      lastSelfNotifiedRef.current = key;
      onTabChange(key);
    },
    [onTabChange],
  );

  const drillToZone = useCallback(
    (zoneId: string) => {
      const next: DrillLevel = { level: 2, zoneId };
      setDrill(next);
      notifyTab(next);
    },
    [notifyTab],
  );

  const drillToRack = useCallback(
    (rackId: string) => {
      setDrill((prev) => {
        if (prev.level !== 2) return prev;
        return { level: 3, zoneId: prev.zoneId, rackId };
      });
    },
    [],
  );

  const backToL1 = useCallback(() => {
    const next: DrillLevel = { level: 1 };
    setDrill(next);
    notifyTab(next);
  }, [notifyTab]);

  const backToL2 = useCallback(() => {
    setDrill((prev) => {
      if (prev.level !== 3) return prev;
      return { level: 2, zoneId: prev.zoneId };
    });
  }, []);

  const activeZoneId = drill.level === 1 ? null : drill.zoneId;
  const currentZone = activeZoneId ? zones.find((z) => z.id === activeZoneId) : undefined;

  const breadcrumbItems = [
    {
      title: drill.level === 1 ? <span>구역 뷰</span> : (
        <a onClick={(e) => { e.preventDefault(); backToL1(); }} href="#">구역 뷰</a>
      ),
    },
    ...(drill.level !== 1
      ? [{
          title: drill.level === 2 ? (
            <span>{currentZone ? `${currentZone.code} · ${currentZone.name}` : '랙 배치'}</span>
          ) : (
            <a onClick={(e) => { e.preventDefault(); backToL2(); }} href="#">
              {currentZone ? `${currentZone.code} · ${currentZone.name}` : '랙 배치'}
            </a>
          ),
        }]
      : []),
    ...(drill.level === 3
      ? [{ title: <span>층 상세</span> }]
      : []),
  ];

  return (
    <div
      className="warehouse-layout-editor-tabs"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      <div className="warehouse-editor-breadcrumb-bar">
        <Breadcrumb items={breadcrumbItems} />
        <Space size={6} className="warehouse-editor-breadcrumb-actions">
          {drill.level === 2 && (
            <Button
              size="small"
              className="warehouse-editor-control-btn"
              icon={<ArrowLeftOutlined />}
              onClick={backToL1}
            >
              창고 전체
            </Button>
          )}
          {drill.level === 3 && (
            <>
              <Button
                size="small"
                className="warehouse-editor-control-btn"
                icon={<ArrowLeftOutlined />}
                onClick={backToL2}
              >
                랙 배치로
              </Button>
              {!readonly && (
                <>
                  <Button
                    size="small"
                    className="warehouse-editor-control-btn"
                    icon={<AppstoreAddOutlined />}
                    onClick={backToL1}
                  >
                    구역 추가
                  </Button>
                </>
              )}
            </>
          )}
        </Space>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {drill.level === 1 && (
          <div className="warehouse-layout-editor-tab-panel-inner" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {!hasZones && !readonly && (
              <Alert
                type="info"
                showIcon
                banner
                closable
                style={{ fontSize: 12, padding: '4px 12px' }}
                message="첫 구역을 그려보세요 — 왼쪽 툴바의 사각형 버튼으로 구역 생성 후, 더블클릭하면 랙 배치 뷰로 진입합니다."
              />
            )}
            <LayoutEditTab warehouseId={warehouseId} onZoneDrillDown={drillToZone} readonly={readonly} highlightZoneIds={highlightZoneIds} />
          </div>
        )}

        {drill.level === 2 && (
          <div className="warehouse-layout-editor-tab-panel-inner" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ZoneLayoutPage
              key={`${warehouseId}-${drill.zoneId}`}
              fixedWarehouseId={warehouseId}
              fixedZoneId={drill.zoneId}
              onRackDrillDown={drillToRack}
              readonly={readonly}
              highlightRackIds={highlightRackIds}
              showUtilization={showUtilization}
            />
          </div>
        )}

        {drill.level === 3 && (
          <div className="warehouse-layout-editor-tab-panel-inner" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <LevelStackView
              warehouseId={warehouseId}
              rackId={drill.rackId}
              readonly={readonly}
              highlightLocationIds={highlightLocationIds}
            />
          </div>
        )}
      </div>
    </div>
  );
}
