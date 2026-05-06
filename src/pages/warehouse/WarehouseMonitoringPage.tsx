import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Select, Typography, Spin, Alert, Tag, Tabs, Switch, Button } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import { useProductLocations } from '@/hooks/useInventoryQuery';
import type { Product } from '@/types/product';
import { ProductSearchModal } from '@/components/ProductSearch';
import WarehouseLayoutDesigner from './WarehouseLayoutDesigner';
import WarehouseCombinedLayoutStage from './WarehouseCombinedLayoutStage';
import RackInventoryTab from './RackInventoryTab';
import CapacityAnalysisPage from '@/pages/statistics/CapacityAnalysisPage';
import './warehouseLayoutEditor.css';

const { Title, Text } = Typography;

export default function WarehouseMonitoringPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const whFromUrl = searchParams.get('wh') ?? '';
  const tabFromUrl = searchParams.get('tab') ?? 'location';

  const { data: warehousesAll = [], isLoading } = useWarehouses();
  // 모니터링은 운영 중인 창고만 — 비활성은 창고 목록에서 다시 활성화 후 진입
  const warehouses = useMemo(
    () => warehousesAll.filter((w) => w.is_active !== false),
    [warehousesAll],
  );

  const defaultWhId = warehouses[0]?.id ?? '';
  const resolvedWhId = whFromUrl || defaultWhId;

  useEffect(() => {
    if (isLoading || warehouses.length === 0) return;
    if (!whFromUrl && defaultWhId) {
      // 기본 창고만 보정. locationId·locationCode 등 딥링크는 유지 (적치/목록 → 재고 위치)
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('wh', defaultWhId);
          if (!p.get('tab')) p.set('tab', tabFromUrl);
          return p;
        },
        { replace: true },
      );
    }
  }, [isLoading, warehouses.length, whFromUrl, defaultWhId, tabFromUrl, setSearchParams]);

  const warehouseOptions = useMemo(
    () => warehouses.map((w) => ({ label: `${w.code} — ${w.name}`, value: w.id })),
    [warehouses],
  );

  const onWarehouseChange = (id: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('wh', id);
      p.set('tab', tabFromUrl);
      return p;
    });
    setSelectedProduct(null);
  };

  // ── 상품 선택 (멀티필터 모달 → 1건 선택) ──
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // ── 가동률 모드(탭 1 토글) ──
  const [utilizationMode, setUtilizationMode] = useState(false);

  const { data: productLocations = [] } = useProductLocations(
    selectedProduct?.id ?? null,
    resolvedWhId || undefined,
  );

  const highlightZoneIds = useMemo(() => new Set(productLocations.map((l) => l.zone_id)), [productLocations]);
  const highlightRackIds = useMemo(() => new Set(productLocations.map((l) => l.rack_id)), [productLocations]);
  const highlightLocationIds = useMemo(() => new Set(productLocations.map((l) => l.location_id)), [productLocations]);

  const handleSelectProducts = (products: Product[]) => {
    if (products.length > 0) setSelectedProduct(products[0]);
  };

  const clearSearch = () => setSelectedProduct(null);

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  if (warehouses.length === 0) return <Alert type="warning" showIcon message="등록된 창고가 없습니다" />;

  return (
    <div className="warehouse-layout-editor-hub-root">
      <div className="warehouse-layout-editor-hub-dark warehouse-layout-editor-hub-inner warehouse-layout-editor-hub-height-lock">
        {/* 상단: 제목 + 창고 선택 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexShrink: 0 }}>
          <Title level={5} style={{ margin: 0, color: '#1e2a3a', fontSize: 15, fontWeight: 600 }}>
            창고 모니터링
          </Title>
          <Select
            className="warehouse-layout-editor-warehouse-select"
            style={{ width: 220 }}
            size="small"
            value={resolvedWhId || undefined}
            options={warehouseOptions}
            onChange={onWarehouseChange}
            classNames={{ popup: { root: 'rack-editor-select-dropdown' } }}
          />
        </div>

        <Tabs
          className="warehouse-layout-editor-tabs"
          style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
          activeKey={
            tabFromUrl === 'rack-inventory'
              || tabFromUrl === 'utilization'
              || tabFromUrl === 'capacity'
              ? tabFromUrl
              : 'location'
          }
          onChange={(k) => {
            setSearchParams((prev) => {
              const p = new URLSearchParams(prev);
              p.set('wh', resolvedWhId);
              p.set('tab', k);
              return p;
            });
          }}
          tabBarGutter={20}
          destroyOnHidden
          items={[
            {
              key: 'location',
              label: '재고 위치 조회',
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  {/* 검색 바 */}
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      icon={<SearchOutlined />}
                      type={selectedProduct ? 'primary' : 'default'}
                      ghost={!!selectedProduct}
                      onClick={() => setSearchOpen(true)}
                    >
                      {selectedProduct ? '상품 변경' : '상품 검색'}
                    </Button>
                    {selectedProduct && (
                      <Tag color="blue" closable onClose={clearSearch} style={{ fontSize: 12 }}>
                        {selectedProduct.sku} — {selectedProduct.name}
                        {productLocations.length > 0 && <span style={{ marginLeft: 4, fontWeight: 700 }}>{productLocations.length}곳</span>}
                      </Tag>
                    )}
                    {selectedProduct && productLocations.length > 0 && (
                      <Text style={{ fontSize: 11, color: '#64748b' }}>
                        검색된 상품이 있는 구역으로 이동했습니다. 점멸하는 랙을 선택하면 상세를 볼 수 있습니다.
                      </Text>
                    )}
                    {selectedProduct && productLocations.length === 0 && (
                      <Text style={{ fontSize: 11, color: '#f59e0b' }}>
                        이 창고에 해당 상품의 적치 재고가 없습니다.
                      </Text>
                    )}
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 12, color: '#64748b' }}>가동률 색칠</Text>
                      <Switch size="small" checked={utilizationMode} onChange={setUtilizationMode} />
                    </div>
                  </div>

                  {/* readonly drill-down — display:flex 로 자식 Designer 의 flex chain 활성화 (정면도 스크롤 보장) */}
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <WarehouseLayoutDesigner
                      key={resolvedWhId}
                      warehouseId={resolvedWhId}
                      readonly
                      highlightZoneIds={selectedProduct ? highlightZoneIds : undefined}
                      highlightRackIds={selectedProduct ? highlightRackIds : undefined}
                      highlightLocationIds={selectedProduct ? highlightLocationIds : undefined}
                      showUtilization={utilizationMode}
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'utilization',
              label: '가동률 히트맵',
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div style={{ padding: '8px 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #e5e7eb', background: '#fff', flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>
                      창고 전체 구역의 랙 가동률을 한눈에 표시합니다.
                    </Text>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#475569' }}>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#f0f2f5', border: '1px solid #d0d5de', verticalAlign: 'middle', marginRight: 4 }} />여유 (0–30%)</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#e8f1fb', border: '1px solid #378ADD', verticalAlign: 'middle', marginRight: 4 }} />적정 (31–80%)</span>
                      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#fef3e0', border: '1px solid #EF9F27', verticalAlign: 'middle', marginRight: 4 }} />포화 (81–100%)</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                    <WarehouseCombinedLayoutStage
                      key={`util-${resolvedWhId}`}
                      warehouseId={resolvedWhId}
                      mode="monitoring"
                    />
                  </div>
                </div>
              ),
            },
            {
              key: 'rack-inventory',
              label: '랙별 재고',
              children: (
                <div className="warehouse-layout-editor-tab-panel-inner">
                  <RackInventoryTab key={resolvedWhId} warehouseId={resolvedWhId} />
                </div>
              ),
            },
            {
              key: 'capacity',
              label: '수용량 분석',
              children: (
                <div className="warehouse-layout-editor-tab-panel-inner" style={{ overflow: 'auto', padding: 12 }}>
                  <CapacityAnalysisPage />
                </div>
              ),
            },
          ]}
        />
      </div>

      <ProductSearchModal
        open={searchOpen}
        onCancel={() => setSearchOpen(false)}
        multiple={false}
        onSelect={handleSelectProducts}
        title="재고 위치를 볼 상품 선택"
      />
    </div>
  );
}
