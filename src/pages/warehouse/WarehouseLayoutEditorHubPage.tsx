import { useEffect, useMemo, useLayoutEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfigProvider, Typography, Select, Spin, Alert } from 'antd';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import WarehouseLayoutDesigner, { isDesignerTabKey, type DesignerTabKey } from './WarehouseLayoutDesigner';
import '@/pages/warehouse/warehouseLayoutEditor.css';

const { Title, Text } = Typography;

/** 이전 URL 쿼리 호환 */
const LEGACY_TAB_MAP: Record<string, DesignerTabKey> = {
  floorplan: 'zone',
  racks: 'rack',
  monitor: 'preview',
  monitoring: 'preview',
  inventory: 'preview',
  layout: 'preview',
};

function normalizeTabParam(raw: string | null): DesignerTabKey {
  if (!raw) return 'zone';
  if (isDesignerTabKey(raw)) return raw;
  return LEGACY_TAB_MAP[raw] ?? 'zone';
}

export default function WarehouseLayoutEditorHubPage() {
  const hubInnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.add('warehouse-layout-editor-no-doc-scroll');
    return () => document.documentElement.classList.remove('warehouse-layout-editor-no-doc-scroll');
  }, []);

  const syncHubPinnedHeight = useCallback(() => {
    const el = hubInnerRef.current;
    if (!el || typeof window === 'undefined') return;
    const top = el.getBoundingClientRect().top;
    const bottomReserve = 10;
    const h = Math.max(320, Math.floor(window.innerHeight - top - bottomReserve));
    el.style.setProperty('--warehouse-editor-hub-pinned-height', `${h}px`);
  }, []);

  useLayoutEffect(() => {
    syncHubPinnedHeight();
    window.addEventListener('resize', syncHubPinnedHeight);
    return () => window.removeEventListener('resize', syncHubPinnedHeight);
  }, [syncHubPinnedHeight]);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tabParam = normalizeTabParam(rawTab);
  const whFromUrl = searchParams.get('wh') ?? '';

  const { data: warehousesAll = [], isLoading } = useWarehouses();
  // 레이아웃 편집은 운영 중인 창고만 — 비활성은 창고 목록에서 다시 활성화 후 진입
  const warehouses = useMemo(
    () => warehousesAll.filter((w) => w.is_active !== false),
    [warehousesAll],
  );

  const defaultWhId = warehouses[0]?.id ?? '';
  const resolvedWhId = whFromUrl || defaultWhId;
  const activeTab = tabParam;

  useEffect(() => {
    if (isLoading || warehouses.length === 0) return;
    const canonicalTab = normalizeTabParam(rawTab);
    const wh = whFromUrl || defaultWhId;
    const tabMismatch = rawTab !== canonicalTab;
    const whMismatch = !whFromUrl && !!defaultWhId;
    if (!wh) return;
    if (tabMismatch || whMismatch) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams();
          n.set('tab', canonicalTab);
          n.set('wh', wh);
          const r = prev.get('returnTo');
          if (r) n.set('returnTo', r);
          const l = prev.get('returnLabel');
          if (l) n.set('returnLabel', l);
          return n;
        },
        { replace: true },
      );
    }
  }, [isLoading, warehouses.length, rawTab, whFromUrl, defaultWhId, setSearchParams]);

  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ label: `${w.code} — ${w.name}`, value: w.id })),
    [warehouses],
  );

  const onTabChange = (key: string) => {
    const k = normalizeTabParam(key);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', k);
      p.set('wh', resolvedWhId || defaultWhId);
      return p;
    });
  };

  const onWarehouseChange = (id: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', activeTab);
      p.set('wh', id);
      return p;
    });
  };

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  }

  if (warehouses.length === 0) {
    return <Alert type="warning" showIcon message="등록된 창고가 없습니다. 창고 목록에서 먼저 창고를 추가하세요." />;
  }

  const wh = resolvedWhId || defaultWhId;

  return (
    <div className="warehouse-layout-editor-hub-root">
      <ConfigProvider
        theme={{
          token: {
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorBgLayout: '#f0f3f8',
            colorBorder: '#c8cdd6',
            colorText: '#1e2a3a',
            colorTextSecondary: '#5a6478',
            colorTextDescription: '#8a94a6',
            colorPrimary: '#EF9F27',
            borderRadius: 6,
          },
          components: {
            Select: {
              colorBgContainer: '#ffffff',
              colorBorder: '#c8cdd6',
              optionSelectedBg: '#fef3e0',
              optionActiveBg: '#f5f7fa',
            },
            Input: {
              colorBgContainer: '#ffffff',
              colorBorder: '#c8cdd6',
              activeBorderColor: 'rgba(239,159,39,0.5)',
            },
            Button: {
              defaultBorderColor: '#c8cdd6',
              defaultColor: '#5a6478',
            },
            Tabs: {
              itemColor: '#8a94a6',
              itemSelectedColor: '#854F0B',
              inkBarColor: '#EF9F27',
            },
          },
        }}
      >
      <div
        ref={hubInnerRef}
        className="warehouse-layout-editor-hub-dark warehouse-layout-editor-hub-inner warehouse-layout-editor-hub-height-lock"
      >
        <div className="warehouse-editor-command-bar">
          <div className="warehouse-editor-command-title">
            <Text className="warehouse-editor-command-kicker">Warehouse Blueprint</Text>
            <Title level={5} style={{ margin: 0 }}>레이아웃 편집기</Title>
          </div>
          <Text className="warehouse-editor-command-label">창고 선택</Text>
          <Select
            className="warehouse-layout-editor-warehouse-select"
            style={{ width: 260 }}
            size="small"
            value={wh}
            options={warehouseOptions}
            onChange={onWarehouseChange}
            classNames={{ popup: { root: 'rack-editor-select-dropdown' } }}
          />
          <div className="warehouse-editor-command-spacer" />
          <Text className="warehouse-editor-command-help">구역을 더블클릭하면 랙 배치로 진입합니다.</Text>
        </div>

        <WarehouseLayoutDesigner
          key={wh}
          warehouseId={wh}
          activeTab={activeTab}
          onTabChange={(k) => onTabChange(k)}
        />
      </div>
      </ConfigProvider>
    </div>
  );
}
