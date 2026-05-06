import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Table, Tag, Space, Badge, Tabs, Checkbox, App, Button, Tooltip } from 'antd';
import { EnvironmentOutlined, CheckCircleFilled, WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { PlacementItem } from '@/types/order';
import { useAllPlacements, useCompletePlacementItem, useSearchPlacementOrders } from '@/hooks/useInboundQuery';
import { useAuth } from '@/hooks/useAuth';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';

const { Title, Text } = Typography;

type PlacementTab = 'pending' | 'placed' | 'unassigned' | 'all';

export default function PlacementListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab: PlacementTab = searchParams.get('filter') === 'unassigned' ? 'unassigned' : 'all';
  const [activeTab, setActiveTab] = useState<PlacementTab>(initialTab);
  const { message } = App.useApp();

  // URL ?filter= 변화에 반응 (대시보드 알림 → 진입 시) — 외부 시스템(URL) 동기화이므로 effect 사용 정당
  useEffect(() => {
    const f = searchParams.get('filter');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (f === 'unassigned') setActiveTab('unassigned');
  }, [searchParams]);

  // 전체 조회 후 탭별 클라이언트 필터
  const productFilter = useProductFilterForOrder();
  const { data: rawItems = [], isLoading: rawLoading } = useAllPlacements();
  const { data: searchedItems = [], isLoading: searchLoading } = useSearchPlacementOrders(productFilter.productIds);
  const allItems = productFilter.isFiltering ? searchedItems : rawItems;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;
  const completeMutation = useCompletePlacementItem();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('INBOUND', 'UPDATE');

  const pendingItems = useMemo(() => allItems.filter((p) => !p.is_placed), [allItems]);
  const placedItems = useMemo(() => allItems.filter((p) => p.is_placed), [allItems]);
  const unassignedItems = useMemo(() => allItems.filter((p) => p.is_unassigned && !p.is_placed), [allItems]);

  const displayItems = activeTab === 'pending' ? pendingItems
    : activeTab === 'placed' ? placedItems
    : activeTab === 'unassigned' ? unassignedItems
    : allItems;

  const handleComplete = (item: PlacementItem) => {
    completeMutation.mutate(item.id, {
      onSuccess: () => message.success(`${item.sku} · ${item.rack_code} 적치 완료`),
      onError: () => message.error('적치 완료 처리에 실패했습니다.'),
    });
  };

  const goLocationView = (item: PlacementItem) => {
    if (!item.location_id) return;
    if (!item.warehouse_id) {
      message.warning('창고 정보가 없어 위치 조회로 이동할 수 없습니다.');
      return;
    }
    const params = new URLSearchParams({ wh: item.warehouse_id, tab: 'rack-inventory' });
    params.set('locationId', item.location_id);
    if (item.location_code) params.set('locationCode', item.location_code);
    if (item.rack_code && item.rack_code !== '(미정)' && item.rack_code !== '-') {
      params.set('rackCode', item.rack_code);
    }
    navigate(`/warehouse/monitoring?${params.toString()}`);
  };

  const columns: ColumnsType<PlacementItem> = [
    {
      title: '지시서', dataIndex: 'order_no', key: 'order_no', width: 140,
      render: (v: string | undefined, r) => (
        <a onClick={(e) => { e.stopPropagation(); navigate(`/order/inbound/${r.inbound_order_id}/placement`); }}>
          {v || '-'}
        </a>
      ),
    },
    {
      title: '상품', key: 'product', width: 220,
      render: (_, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{r.product_name}</div>
          <Text style={{ fontSize: 11, color: '#94a3b8' }}>{r.sku}</Text>
        </div>
      ),
    },
    {
      title: '수량', dataIndex: 'qty', key: 'qty', width: 70, align: 'right',
      render: (v: number) => <span style={{ fontSize: 15, fontWeight: 700, color: '#1677ff' }}>{v}</span>,
    },
    {
      title: '구역', dataIndex: 'zone_name', key: 'zone_name', width: 90,
      render: (v: string) => <Tag color="gold" style={{ margin: 0, fontWeight: 600 }}>{v}</Tag>,
    },
    {
      title: '위치', dataIndex: 'rack_code', key: 'rack_code', width: 150,
      render: (_: string, r) => r.is_unassigned
        ? <Tag color="red" style={{ margin: 0, fontWeight: 600 }}>위치 미정</Tag>
        : (
          <Space size={6}>
            <Tag color="orange" style={{ margin: 0, fontWeight: 600, fontSize: 12 }}>
              {r.location_code || r.rack_code || '-'}
            </Tag>
            <Tooltip title="재고 위치 조회에서 보기">
              <Button
                size="small"
                type="text"
                icon={<EnvironmentOutlined />}
                onClick={() => goLocationView(r)}
                disabled={!r.location_id}
                style={{ color: '#1677ff' }}
              />
            </Tooltip>
          </Space>
        ),
    },
    {
      title: '적치', key: 'placed', width: 70, align: 'center',
      render: (_, r) =>
        r.is_placed
          ? <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
          : (
            <Checkbox
              checked={false}
              onChange={() => handleComplete(r)}
              disabled={completeMutation.isPending || !canUpdate}
            />
          ),
    },
  ];

  return (
    <>
      <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>적치 지시서</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>검수 완료 후 적치 작업 관리</Text>
        </Space>
        <ProductFilterTriggerButton
          {...productFilter}
          matchedProductCount={productFilter.productIds?.length ?? null}
        />
      </div>

      {productFilter.isFiltering && (
        <div style={{ marginBottom: 12 }}>
          <ProductFilterStatusBar
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
            filteredLineCount={allItems.length}
          />
        </div>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as PlacementTab)}
        items={[
          {
            key: 'all',
            label: <Space size={6}>전체<Badge count={allItems.length} showZero style={{ backgroundColor: activeTab === 'all' ? '#64748b' : '#e2e8f0' }} /></Space>,
          },
          {
            key: 'pending',
            label: <Space size={6}>대기<Badge count={pendingItems.length} showZero style={{ backgroundColor: activeTab === 'pending' ? '#f59e0b' : '#e2e8f0' }} /></Space>,
          },
          {
            key: 'unassigned',
            label: (
              <Space size={6}>
                <WarningOutlined style={{ color: unassignedItems.length > 0 ? '#ef4444' : undefined }} />
                미배정
                <Badge count={unassignedItems.length} showZero style={{ backgroundColor: unassignedItems.length > 0 ? '#ef4444' : '#e2e8f0' }} />
              </Space>
            ),
          },
          {
            key: 'placed',
            label: <Space size={6}>완료<Badge count={placedItems.length} showZero style={{ backgroundColor: activeTab === 'placed' ? '#52c41a' : '#e2e8f0' }} /></Space>,
          },
        ]}
        style={{ marginBottom: 8 }}
      />

      <Table
        columns={columns}
        dataSource={displayItems}
        rowKey="id"
        loading={isLoading}
        size="middle"
        rowClassName={(r) => r.is_placed ? 'placement-row-done' : ''}
      />

      </div>
      <style>{`
        .order-list-tone .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 2px solid #dbe3ee !important;
        }
        .placement-row-done td { background: #f0fdf4 !important; }
        .placement-row-done:hover td { background: #dcfce7 !important; }
      `}</style>
    </>
  );
}
