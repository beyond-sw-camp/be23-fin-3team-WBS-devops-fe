import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography, Table, Tag, Space, Badge, Tabs, Checkbox, App, Button, Tooltip, Card, Input, DatePicker,
} from 'antd';
import {
  EnvironmentOutlined, CheckCircleFilled, WarningOutlined, SearchOutlined, ReloadOutlined, CalendarOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type { PlacementItem } from '@/types/order';
import { useAllPlacements, useCompletePlacementItem, useSearchPlacementOrders, useInboundOrders } from '@/hooks/useInboundQuery';
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
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
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

  // 입고지시서의 expected_date 매핑 — 적치 항목 자체에 날짜가 없어 부모 지시서로부터 가져와 필터
  const { data: inboundOrders = [] } = useInboundOrders();
  const expectedDateMap = useMemo(() => {
    const m = new Map<string, string>();
    inboundOrders.forEach((o) => { if (o.id && o.expected_date) m.set(o.id, o.expected_date); });
    return m;
  }, [inboundOrders]);

  const inDateRange = (ymd: string | null | undefined): boolean => {
    if (!dateFrom && !dateTo) return true;
    if (!ymd) return false;
    const d = dayjs(ymd);
    if (!d.isValid()) return false;
    if (dateFrom && d.isBefore(dateFrom, 'day')) return false;
    if (dateTo && d.isAfter(dateTo, 'day')) return false;
    return true;
  };

  const resetFilters = () => {
    setSearchKeyword('');
    setDateFrom(null);
    setDateTo(null);
  };

  /** 검색어 + 입고예정일 범위 필터 적용 후 탭별 분리 카운트용 */
  const filteredAll = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    return allItems.filter((p) => {
      if (kw) {
        const hits = (p.order_no ?? '').toLowerCase().includes(kw)
          || (p.placement_no ?? '').toLowerCase().includes(kw)
          || (p.sku ?? '').toLowerCase().includes(kw)
          || (p.product_name ?? '').toLowerCase().includes(kw);
        if (!hits) return false;
      }
      const expected = expectedDateMap.get(p.inbound_order_id);
      if (!inDateRange(expected)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems, searchKeyword, dateFrom, dateTo, expectedDateMap]);

  const pendingItems = useMemo(() => filteredAll.filter((p) => !p.is_placed), [filteredAll]);
  const placedItems = useMemo(() => filteredAll.filter((p) => p.is_placed), [filteredAll]);
  const unassignedItems = useMemo(() => filteredAll.filter((p) => p.is_unassigned && !p.is_placed), [filteredAll]);

  const displayItems = activeTab === 'pending' ? pendingItems
    : activeTab === 'placed' ? placedItems
    : activeTab === 'unassigned' ? unassignedItems
    : filteredAll;

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
      title: '입고예정일', key: 'expected_date', width: 120, align: 'center',
      render: (_, r) => {
        const v = expectedDateMap.get(r.inbound_order_id);
        return v ? <span style={{ color: '#475569', fontSize: 12 }}>{v}</span> : <span style={{ color: '#cbd5e1' }}>-</span>;
      },
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space align="center" size={10}>
          <Title level={4} style={{ margin: 0 }}>적치 지시서</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>검수 완료 후 적치 작업 관리</Text>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '18px 20px' } }}>
        <Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>검색 조건</Text>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 24,
            rowGap: 10,
          }}
        >
          <Space size={8} align="center">
            <SearchOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>검색어</Text>
            <Input
              placeholder="지시서번호 / SKU / 상품명"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
          </Space>
          <Space size={8} align="center">
            <CalendarOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>입고예정일</Text>
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="시작" style={{ width: 140 }} />
            <Text type="secondary">~</Text>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder="종료" style={{ width: 140 }} />
          </Space>
          <div style={{ marginLeft: 'auto' }}>
            <Space size={8}>
              <ProductFilterTriggerButton
                {...productFilter}
                matchedProductCount={productFilter.productIds?.length ?? null}
              />
              <Button icon={<ReloadOutlined />} onClick={resetFilters}>초기화</Button>
            </Space>
          </div>
        </div>
        {productFilter.isFiltering && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px dashed #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <ProductFilterStatusBar
              {...productFilter}
              matchedProductCount={productFilter.productIds?.length ?? null}
              filteredLineCount={filteredAll.length}
            />
          </div>
        )}
      </Card>

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as PlacementTab)}
        items={[
          {
            key: 'all',
            label: <Space size={6}>전체<Badge count={filteredAll.length} showZero style={{ backgroundColor: activeTab === 'all' ? '#64748b' : '#e2e8f0' }} /></Space>,
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

      <style>{`
        .placement-row-done td { background: #f0fdf4 !important; }
        .placement-row-done:hover td { background: #dcfce7 !important; }
      `}</style>
    </>
  );
}
