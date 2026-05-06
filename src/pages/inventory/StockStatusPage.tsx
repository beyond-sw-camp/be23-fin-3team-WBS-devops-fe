import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography, Table, Card, Row, Col, Statistic, Select, Space, Drawer, Tag, Tooltip,
} from 'antd';
import { CheckCircleOutlined, LockOutlined, WarningOutlined, DatabaseOutlined, HourglassOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { InventoryStock, InventoryTransaction, TransactionType, TransactionDirection } from '@/types/inventory';
import { useInventoryStocks, useInventoryTransactions } from '@/hooks/useInventoryQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';

const { Title } = Typography;

/** 랙 이름이 없으면 rackCode 꼬리 2조각을 축약해서 보여줌 */
function compactRackLabel(rackCode?: string, rackName?: string): string {
  if (rackName) return rackName;
  if (!rackCode) return '-';
  const parts = rackCode.split('-');
  if (parts.length >= 2) return `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
  return rackCode;
}

const txTypeLabel: Record<TransactionType, string> = {
  inbound: '입고', outbound: '출고', transfer: '이동', adjust: '조정', inspect: '검수',
  reserve: '예약', unreserve: '예약해제', dispose: '폐기', returned: '반품',
};
const txTypeColor: Record<TransactionType, string> = {
  inbound: 'blue', outbound: 'orange', transfer: 'purple', adjust: 'red', inspect: 'cyan',
  reserve: 'gold', unreserve: 'lime', dispose: 'magenta', returned: 'geekblue',
};
const dirLabel: Record<TransactionDirection, string> = { in: '입고(+)', out: '출고(-)' };

const txColumns: ColumnsType<InventoryTransaction> = [
  { title: '변동유형', dataIndex: 'type', key: 'type', width: 90, render: (v: TransactionType) => <Tag color={txTypeColor[v]}>{txTypeLabel[v]}</Tag> },
  { title: '방향', dataIndex: 'direction', key: 'direction', width: 80, render: (v: TransactionDirection) => dirLabel[v] },
  { title: '변동수량', dataIndex: 'qty', key: 'qty', width: 90, align: 'right', render: (v: number, r) => <span style={{ color: r.direction === 'in' ? '#1677ff' : '#fa541c' }}>{r.direction === 'in' ? '+' : '-'}{Math.abs(v)}</span> },
  { title: '변동전', dataIndex: 'before_qty', key: 'before_qty', width: 80, align: 'right' },
  { title: '변동후', dataIndex: 'after_qty', key: 'after_qty', width: 80, align: 'right' },
  { title: '참조', dataIndex: 'ref_type', key: 'ref_type', width: 160 },
  { title: '일시', dataIndex: 'created_at', key: 'created_at', width: 160 },
];

export default function StockStatusPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialWarehouseId = searchParams.get('warehouseId') ?? undefined;
  const productIdFilter = searchParams.get('productId') ?? undefined;
  const [whIdFilter, setWhIdFilter] = useState<string | undefined>(initialWarehouseId);
  const [zoneFilter, setZoneFilter] = useState<string | undefined>();
  const [drawerStockId, setDrawerStockId] = useState<string | number>(0);
  const [drawerStock, setDrawerStock] = useState<InventoryStock | null>(null);
  const productFilter = useProductFilterForOrder();

  const { data: allStocks = [], isLoading } = useInventoryStocks({ warehouseId: whIdFilter, zone: zoneFilter });
  const { data: warehouseRows = [] } = useWarehouses();
  const { data: drawerTxs = [] } = useInventoryTransactions(drawerStockId);

  const warehouseOptions = useMemo(
    () => warehouseRows
      .filter((w) => w.is_active !== false)
      .map((w) => ({ label: w.name, value: w.id })),
    [warehouseRows],
  );

  // 모든 수량이 0 인 "유령 행" 은 목록에서 제외.
  // Why: 입고 staging(locationId=null) 으로 수량이 잠깐 쌓였다가 적치 완료 후 0 으로 남는 row 가
  //      목록에 빈 칸 상태로 나타나고, 드로어 열면 과거 이력만 보여서 혼란을 줌.
  //      실제 의미 있는 재고 row 만 노출.
  // URL ?productId 가 지정된 경우(재고 부족 알림에서 진입) 해당 상품으로 정확 필터.
  const productIdsSet = useMemo(
    () => productFilter.productIds ? new Set(productFilter.productIds) : null,
    [productFilter.productIds],
  );

  const visibleStocks = useMemo(() => allStocks.filter((s) => {
    const hasQty = (
      (s.available_qty ?? 0) > 0
      || (s.reserved_qty ?? 0) > 0
      || (s.defective_qty ?? 0) > 0
      || (s.incoming_qty ?? 0) > 0
      || (s.inspecting_qty ?? 0) > 0
      || (s.total_qty ?? 0) > 0
    );
    if (!hasQty) return false;
    if (productIdFilter && String(s.product_id) !== String(productIdFilter)) return false;
    if (productIdsSet && !productIdsSet.has(String(s.product_id))) return false;
    return true;
  }), [allStocks, productIdFilter, productIdsSet]);
  const filteredStocks = useMemo(
    () => (
      productIdFilter
        ? visibleStocks.filter((s) => String(s.product_id) === String(productIdFilter))
        : visibleStocks
    ),
    [visibleStocks, productIdFilter],
  );

  const zones = useMemo(() => [...new Set(filteredStocks.map((s) => s.zone_name))], [filteredStocks]);

  const summary = useMemo(() => filteredStocks.reduce(
    (acc, s) => ({
      incoming: acc.incoming + (s.incoming_qty ?? 0),
      available: acc.available + s.available_qty,
      reserved: acc.reserved + s.reserved_qty,
      defective: acc.defective + s.defective_qty,
      pending: acc.pending + (s.inspecting_qty ?? 0),
      total: acc.total + s.total_qty,
    }),
    { incoming: 0, available: 0, reserved: 0, defective: 0, pending: 0, total: 0 },
  ), [filteredStocks]);

  const columns: ColumnsType<InventoryStock> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 200 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
    {
      title: '구역', key: 'zone', width: 150,
      render: (_, r) => {
        // null-location 이면서 입고예정/검수중 수량이 있으면 "입고 대기장" 으로 표시.
        // BE 가 적치 전 재고를 null-location 행에 쌓아두기 때문에 zone 정보가 없음.
        const isStagingRow = !r.zone_name && !r.zone_code
          && ((r.inspecting_qty ?? 0) > 0 || (r.incoming_qty ?? 0) > 0);
        const label = r.zone_name || r.zone_code || (isStagingRow ? '입고 대기장' : '-');
        const showStagingTag = (r.inspecting_qty ?? 0) > 0;
        if (label === '-') return <span style={{ color: '#cbd5e1' }}>-</span>;
        return (
          <Space size={4}>
            <span style={isStagingRow ? { color: '#475569' } : undefined}>{label}</span>
            {showStagingTag && (
              <Tag color="orange" icon={<HourglassOutlined />} style={{ margin: 0, fontSize: 11 }}>
                적치 대기
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '랙', key: 'rack', width: 150,
      render: (_, r) => {
        const isStagingRow = !r.rack_code
          && ((r.inspecting_qty ?? 0) > 0 || (r.incoming_qty ?? 0) > 0);
        if (isStagingRow) {
          return <Tag style={{ margin: 0, color: '#8c8c8c', borderStyle: 'dashed' }}>대기</Tag>;
        }
        const label = compactRackLabel(r.rack_code, r.rack_name);
        const whId = r.warehouse_id;
        const tooltip = r.rack_code || '랙 미지정';
        return (
          <Tooltip title={tooltip}>
            <Tag
              color="blue"
              onClick={(e) => {
                e.stopPropagation();
                if (!whId) return;
                const params = new URLSearchParams({ wh: whId, tab: 'rack-inventory' });
                if (r.location_id) params.set('locationId', r.location_id);
                if (r.location_code) params.set('locationCode', r.location_code);
                if (r.rack_code) params.set('rackCode', r.rack_code);
                navigate(`/warehouse/monitoring?${params.toString()}`);
              }}
              style={{ cursor: whId ? 'pointer' : 'default', margin: 0 }}
            >
              {label}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '로케이션',
      key: 'location',
      width: 220,
      render: (_, r) => {
        if (!r.location_code) return <span style={{ color: '#cbd5e1' }}>-</span>;
        const whId = r.warehouse_id;
        return (
          <Tag
            color="geekblue"
            onClick={(e) => {
              e.stopPropagation();
              if (!whId) return;
              const params = new URLSearchParams({ wh: whId, tab: 'rack-inventory' });
              if (r.location_id) params.set('locationId', r.location_id);
              if (r.location_code) params.set('locationCode', r.location_code);
              if (r.rack_code) params.set('rackCode', r.rack_code);
              navigate(`/warehouse/monitoring?${params.toString()}`);
            }}
            style={{ margin: 0, cursor: whId ? 'pointer' : 'default', fontFamily: 'ui-monospace, Menlo, monospace' }}
          >
            {r.location_code}
          </Tag>
        );
      },
    },
    {
      title: '층', key: 'floor', width: 70, align: 'center',
      render: (_, r) => r.floor_no != null
        ? <span style={{ fontWeight: 600 }}>{r.floor_no}</span>
        : <span style={{ color: '#cbd5e1' }}>-</span>,
    },
    { title: '입고예정', dataIndex: 'incoming_qty', key: 'incoming_qty', width: 80, align: 'right', render: (v: number) => <span style={{ color: (v ?? 0) > 0 ? '#1677ff' : undefined }}>{(v ?? 0).toLocaleString()}</span> },
    { title: '가용', dataIndex: 'available_qty', key: 'available_qty', width: 70, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '예약', dataIndex: 'reserved_qty', key: 'reserved_qty', width: 70, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#faad14' : undefined }}>{v.toLocaleString()}</span> },
    { title: '불량', dataIndex: 'defective_qty', key: 'defective_qty', width: 70, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#ff4d4f' : undefined }}>{v.toLocaleString()}</span> },
    {
      title: '검수중', dataIndex: 'inspecting_qty', key: 'inspecting_qty', width: 80, align: 'right',
      render: (v: number) => <span style={{ color: (v ?? 0) > 0 ? '#fa8c16' : undefined, fontWeight: (v ?? 0) > 0 ? 600 : undefined }}>{(v ?? 0).toLocaleString()}</span>,
    },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80, align: 'right', render: (v: number) => <strong>{v.toLocaleString()}</strong> },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 16 }}>재고 현황</Title>
      <Row gutter={12} style={{ marginBottom: 20 }}>
        <Col flex={1}><Card size="small"><Statistic title="입고예정" value={summary.incoming} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col flex={1}>
          <Card size="small"><Statistic title="적치 대기" value={summary.pending} prefix={<HourglassOutlined />} valueStyle={{ color: '#fa8c16' }} /></Card>
        </Col>
        <Col flex={1}><Card size="small"><Statistic title="가용재고" value={summary.available} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col flex={1}><Card size="small"><Statistic title="예약재고" value={summary.reserved} prefix={<LockOutlined />} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col flex={1}><Card size="small"><Statistic title="불량재고" value={summary.defective} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col flex={1}><Card size="small"><Statistic title="총재고" value={summary.total} prefix={<DatabaseOutlined />} /></Card></Col>
      </Row>
      <Space style={{ marginBottom: 16 }}>
        <Select placeholder="창고 (전체)" allowClear style={{ width: 180 }} value={whIdFilter}
          onChange={(v) => { setWhIdFilter(v); setZoneFilter(undefined); }}
          options={warehouseOptions} showSearch optionFilterProp="label" />
        <Select placeholder="구역" allowClear style={{ width: 130 }} value={zoneFilter} onChange={setZoneFilter}
          options={zones.map((z) => ({ label: z, value: z }))} />
        <ProductFilterTriggerButton
          {...productFilter}
          matchedProductCount={productFilter.productIds?.length ?? null}
        />
      </Space>

      {productFilter.isFiltering && (
        <div style={{ marginBottom: 12 }}>
          <ProductFilterStatusBar
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
            filteredLineCount={visibleStocks.length}
          />
        </div>
      )}
      <Table columns={columns} dataSource={filteredStocks} rowKey="id" size="middle" loading={isLoading} scroll={{ x: 1100 }}
        rowClassName={(r) => {
          if ((r.inspecting_qty ?? 0) > 0) return 'row-staging';
          if (r.min_stock_qty > 0 && r.available_qty <= r.min_stock_qty) return 'row-shortage';
          return '';
        }}
        onRow={(r) => ({ onClick: () => { setDrawerStock(r); setDrawerStockId(r.id); }, style: { cursor: 'pointer' } })} />
      <Drawer title={drawerStock ? `${drawerStock.sku} — ${drawerStock.product_name}` : ''} open={!!drawerStock} onClose={() => { setDrawerStock(null); setDrawerStockId(0); }} width={680}>
        {drawerTxs.length > 0 ? <Table columns={txColumns} dataSource={drawerTxs} rowKey="id" size="small" pagination={false} /> : <div style={{ textAlign: 'center', color: '#999', padding: 40 }}>트랜잭션 이력이 없습니다.</div>}
      </Drawer>
      <style>{`
        .row-shortage td { background: #fff1f0 !important; }
        .row-staging td { background: #fff7e6 !important; }
      `}</style>
    </>
  );
}
