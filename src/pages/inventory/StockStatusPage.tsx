import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography, Table, Card, Select, Space, Drawer, Tag, Tooltip,
  DatePicker,
} from 'antd';
import {
  CheckCircleOutlined, LockOutlined, WarningOutlined, DatabaseOutlined,
  HourglassOutlined, EnvironmentOutlined, CalendarOutlined,
} from '@ant-design/icons';
import { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type { InventoryStock, InventoryTransaction, TransactionType, TransactionDirection } from '@/types/inventory';
import { useInventoryStocks, useInventoryStocksByDate, useInventoryTransactions } from '@/hooks/useInventoryQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import { useProducts, useSuppliers, useProductGroups, useProductCategoryRoots } from '@/hooks/useMasterQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import { shortLocationCode } from '@/utils/locationCode';

const { Title, Text } = Typography;

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

/** 상세 위치 단위 (현재 기본 모드) — 위치/랙별 row */
type ViewMode = 'detail' | 'product' | 'group' | 'category' | 'brand' | 'supplier';

interface AggregatedRow {
  key: string;
  label: string;
  sub?: string;
  available: number;
  reserved: number;
  defective: number;
  inspecting: number;
  incoming: number;
  total: number;
  rowCount: number;
}

export default function StockStatusPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialWarehouseId = searchParams.get('warehouseId') ?? undefined;
  const productIdFilter = searchParams.get('productId') ?? undefined;
  const [whIdFilter, setWhIdFilter] = useState<string | undefined>(initialWarehouseId);
  const [zoneFilter, setZoneFilter] = useState<string | undefined>();
  const [viewMode] = useState<ViewMode>('detail');
  /** 조회일자 — null 이면 "현재" 모드, Dayjs 면 그 날 시점 역산 모드 */
  const [asOfDate, setAsOfDate] = useState<Dayjs | null>(null);
  const [drawerStockId, setDrawerStockId] = useState<string | number>(0);
  const [drawerStock, setDrawerStock] = useState<InventoryStock | null>(null);
  const productFilter = useProductFilterForOrder();

  const isAsOfMode = !!asOfDate;
  const asOfDateStr = asOfDate ? asOfDate.format('YYYY-MM-DD') : null;

  // 현재 모드와 조회일자 모드의 hook 둘 다 선언하되 enabled 로 한쪽만 동작.
  const { data: liveStocks = [], isLoading: liveLoading } = useInventoryStocks({
    warehouseId: whIdFilter,
    zone: zoneFilter,
  });
  const { data: dateStocks = [], isLoading: dateLoading } = useInventoryStocksByDate({
    date: isAsOfMode ? asOfDateStr : null,
    warehouseId: whIdFilter,
    zone: zoneFilter,
  });
  const allStocks = isAsOfMode ? dateStocks : liveStocks;
  const isLoading = isAsOfMode ? dateLoading : liveLoading;
  const { data: warehouseRows = [] } = useWarehouses();
  const { data: drawerTxs = [] } = useInventoryTransactions(drawerStockId);

  // 그룹화에 필요한 마스터 정보. 항상 호출하되 모드에 따라 사용 여부만 달라짐.
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: productGroups = [] } = useProductGroups(null);
  const { data: categoryRoots = [] } = useProductCategoryRoots();

  /** productId → 그룹/카테고리/공급처/브랜드 매핑 (그룹화/표시용) */
  const productMeta = useMemo(() => {
    const supplierMap = new Map<string, { name: string; code: string }>();
    suppliers.forEach((s) => supplierMap.set(s.id, { name: s.name, code: s.code }));
    const groupMap = new Map<string, { groupName: string; brand: string | null; categoryName: string | null }>();
    productGroups.forEach((g) => groupMap.set(g.id, {
      groupName: g.name,
      brand: g.brand,
      categoryName: g.category_name,
    }));
    const categoryRootMap = new Map<string, string>();
    categoryRoots.forEach((c) => categoryRootMap.set(c.id, c.name));

    const meta = new Map<string, {
      groupName: string;
      categoryName: string;
      brand: string;
      supplierName: string;
      supplierLabel: string;
    }>();
    products.forEach((p) => {
      const groupInfo = p.product_group_id ? groupMap.get(p.product_group_id) : undefined;
      const supplierInfo = p.supplier_id ? supplierMap.get(p.supplier_id) : undefined;
      const supplierName = supplierInfo?.name ?? '-';
      const supplierLabel = p.owner_type === 'OWN'
        ? '자사'
        : supplierInfo
          ? `${supplierInfo.name}${supplierInfo.code ? ` (${supplierInfo.code})` : ''}`
          : '협력사 미지정';
      meta.set(p.id, {
        groupName: groupInfo?.groupName ?? p.product_group_name ?? '-',
        categoryName: groupInfo?.categoryName ?? p.category ?? '-',
        brand: groupInfo?.brand ?? '-',
        supplierName,
        supplierLabel,
      });
    });
    return meta;
  }, [products, suppliers, productGroups, categoryRoots]);

  const warehouseOptions = useMemo(
    () => warehouseRows
      .filter((w) => w.is_active !== false)
      .map((w) => ({ label: w.name, value: w.id })),
    [warehouseRows],
  );

  // 모든 수량이 0 인 "유령 행" 은 목록에서 제외.
  // Why: 입고 staging(locationId=null) 으로 수량이 잠깐 쌓였다가 적치 완료 후 0 으로 남는 row 가
  //      목록에 빈 칸 상태로 나타나고, 드로어 열면 과거 이력만 보여서 혼란을 줌.
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
      available: acc.available + s.available_qty,
      reserved: acc.reserved + s.reserved_qty,
      defective: acc.defective + s.defective_qty,
      total: acc.total + s.total_qty,
    }),
    { available: 0, reserved: 0, defective: 0, total: 0 },
  ), [filteredStocks]);

  /** viewMode=detail 이외에는 행을 그룹화해서 합계 row 로 보여줌 */
  const aggregatedRows: AggregatedRow[] = useMemo(() => {
    if (viewMode === 'detail') return [];
    const map = new Map<string, AggregatedRow>();
    for (const s of filteredStocks) {
      const meta = s.product_id ? productMeta.get(s.product_id) : undefined;
      let key: string;
      let label: string;
      let sub: string | undefined;
      switch (viewMode) {
        case 'product':
          key = `${s.product_id}`;
          label = s.product_name || '-';
          sub = s.sku;
          break;
        case 'group':
          key = `g:${meta?.groupName ?? '-'}`;
          label = meta?.groupName ?? '-';
          break;
        case 'category':
          key = `c:${meta?.categoryName ?? '-'}`;
          label = meta?.categoryName ?? '-';
          break;
        case 'brand':
          key = `b:${meta?.brand ?? '-'}`;
          label = meta?.brand ?? '-';
          break;
        case 'supplier':
          key = `s:${meta?.supplierName ?? '-'}`;
          label = meta?.supplierName ?? '-';
          break;
        default:
          continue;
      }
      const cur = map.get(key) ?? {
        key, label, sub,
        available: 0, reserved: 0, defective: 0, inspecting: 0, incoming: 0, total: 0, rowCount: 0,
      };
      cur.available += s.available_qty ?? 0;
      cur.reserved += s.reserved_qty ?? 0;
      cur.defective += s.defective_qty ?? 0;
      cur.inspecting += s.inspecting_qty ?? 0;
      cur.incoming += s.incoming_qty ?? 0;
      cur.total += s.total_qty ?? 0;
      cur.rowCount += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [filteredStocks, viewMode, productMeta]);

  const detailColumns: ColumnsType<InventoryStock> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 200, ellipsis: true },
    {
      title: '협력사', key: 'supplier', width: 180,
      render: (_, r) => {
        const meta = r.product_id ? productMeta.get(r.product_id) : undefined;
        return meta?.supplierLabel ?? '미매핑';
      },
    },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 110 },
    {
      title: '구역', key: 'zone', width: 130,
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
      title: '위치', key: 'location', width: 200,
      render: (_, r) => {
        const isStagingRow = !r.rack_code
          && ((r.inspecting_qty ?? 0) > 0 || (r.incoming_qty ?? 0) > 0);
        if (isStagingRow) {
          return <Tag style={{ margin: 0, color: '#8c8c8c', borderStyle: 'dashed' }}>대기</Tag>;
        }
        if (!r.location_code && !r.rack_code) {
          return <span style={{ color: '#cbd5e1' }}>-</span>;
        }
        const whId = r.warehouse_id;
        const goLocation = (e: React.MouseEvent) => {
          e.stopPropagation();
          if (!whId) return;
          const params = new URLSearchParams({ wh: whId, tab: 'rack-inventory' });
          if (r.location_id) params.set('locationId', r.location_id);
          if (r.location_code) params.set('locationCode', r.location_code);
          if (r.rack_code) params.set('rackCode', r.rack_code);
          navigate(`/warehouse/monitoring?${params.toString()}`);
        };
        // 위치코드가 있으면 축약 형식 (예: SELF-099 · 1층) 우선, 없으면 랙 코드 축약 보조 표시.
        const shortLoc = r.location_code ? shortLocationCode(r.location_code) : compactRackLabel(r.rack_code, r.rack_name);
        return (
          <Tooltip title={r.location_code || r.rack_code || '위치 미지정'}>
            <Tag
              color="geekblue"
              icon={<EnvironmentOutlined />}
              onClick={goLocation}
              style={{ margin: 0, cursor: whId ? 'pointer' : 'default' }}
            >
              {shortLoc}
            </Tag>
          </Tooltip>
        );
      },
    },
    { title: '입고예정', dataIndex: 'incoming_qty', key: 'incoming_qty', width: 80, align: 'right', render: (v: number) => <span style={{ color: (v ?? 0) > 0 ? '#1677ff' : undefined }}>{(v ?? 0).toLocaleString()}</span> },
    { title: '가용', dataIndex: 'available_qty', key: 'available_qty', width: 80, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '예약', dataIndex: 'reserved_qty', key: 'reserved_qty', width: 80, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#faad14' : undefined }}>{v.toLocaleString()}</span> },
    { title: '불량', dataIndex: 'defective_qty', key: 'defective_qty', width: 80, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#ff4d4f' : undefined }}>{v.toLocaleString()}</span> },
    {
      title: '검수중', dataIndex: 'inspecting_qty', key: 'inspecting_qty', width: 80, align: 'right',
      render: (v: number) => <span style={{ color: (v ?? 0) > 0 ? '#fa8c16' : undefined, fontWeight: (v ?? 0) > 0 ? 600 : undefined }}>{(v ?? 0).toLocaleString()}</span>,
    },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 90, align: 'right', render: (v: number) => <strong>{v.toLocaleString()}</strong> },
  ];

  const aggregatedColumns: ColumnsType<AggregatedRow> = [
    {
      title: viewMode === 'product' ? '상품' : viewMode === 'group' ? '상품그룹' : viewMode === 'category' ? '대분류' : viewMode === 'brand' ? '브랜드' : '공급처',
      dataIndex: 'label', key: 'label',
      render: (label: string, r) => (
        <Space size={6} direction="vertical" style={{ lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{label}</span>
          {r.sub && <Text type="secondary" style={{ fontSize: 12 }}>{r.sub}</Text>}
        </Space>
      ),
    },
    { title: '행 수', dataIndex: 'rowCount', key: 'rowCount', width: 90, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '입고예정', dataIndex: 'incoming', key: 'incoming', width: 90, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#1677ff' : undefined }}>{v.toLocaleString()}</span> },
    { title: '가용', dataIndex: 'available', key: 'available', width: 90, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '예약', dataIndex: 'reserved', key: 'reserved', width: 90, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#faad14' : undefined }}>{v.toLocaleString()}</span> },
    { title: '불량', dataIndex: 'defective', key: 'defective', width: 90, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#ff4d4f' : undefined }}>{v.toLocaleString()}</span> },
    { title: '검수중', dataIndex: 'inspecting', key: 'inspecting', width: 90, align: 'right', render: (v: number) => <span style={{ color: v > 0 ? '#fa8c16' : undefined }}>{v.toLocaleString()}</span> },
    { title: '총수량', dataIndex: 'total', key: 'total', width: 100, align: 'right', render: (v: number) => <strong>{v.toLocaleString()}</strong> },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>재고 현황</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          상품 검색과 조회 조건을 기준으로 재고를 확인하는 조회 화면입니다.
        </Text>
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
            <CalendarOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>조회일자</Text>
            <DatePicker
              value={asOfDate}
              onChange={(d) => setAsOfDate(d)}
              placeholder="현재"
              allowClear
              disabledDate={(d) => d.isAfter(new Date(), 'day')}
              style={{ width: 180 }}
            />
          </Space>
          <Space size={8} align="center">
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>창고</Text>
            <Select placeholder="전체" allowClear style={{ width: 200 }} value={whIdFilter}
              onChange={(v) => { setWhIdFilter(v); setZoneFilter(undefined); }}
              options={warehouseOptions} showSearch optionFilterProp="label" />
          </Space>
          <Space size={8} align="center">
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>구역</Text>
            <Select placeholder="전체" allowClear style={{ width: 180 }} value={zoneFilter} onChange={setZoneFilter}
              options={zones.map((z) => ({ label: z, value: z }))} />
          </Space>
          <div style={{ marginLeft: 'auto' }}>
            <ProductFilterTriggerButton
              {...productFilter}
              matchedProductCount={productFilter.productIds?.length ?? null}
            />
          </div>
        </div>
        {(isAsOfMode || productFilter.isFiltering) && (
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
            {isAsOfMode && (
              <Tag color="processing" style={{ margin: 0 }}>
                {asOfDateStr} 시점 재고
              </Tag>
            )}
            {productFilter.isFiltering && (
              <ProductFilterStatusBar
                {...productFilter}
                matchedProductCount={productFilter.productIds?.length ?? null}
                filteredLineCount={visibleStocks.length}
              />
            )}
          </div>
        )}
      </Card>

      <Card
        size="small"
        styles={{ body: { padding: '8px 0 0' } }}
        title={(
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Space size={12} wrap>
              <Text strong>재고 목록</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {viewMode === 'detail' ? `총 ${filteredStocks.length.toLocaleString()}건` : `총 ${aggregatedRows.length.toLocaleString()}건`}
              </Text>
            </Space>
            <Space size={[8, 8]} wrap>
              <Tag icon={<DatabaseOutlined />} style={{ margin: 0 }}>총재고 {summary.total.toLocaleString()}</Tag>
              <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>가용 {summary.available.toLocaleString()}</Tag>
              <Tag color="warning" icon={<LockOutlined />} style={{ margin: 0 }}>예약 {summary.reserved.toLocaleString()}</Tag>
              <Tag color="error" icon={<WarningOutlined />} style={{ margin: 0 }}>불량 {summary.defective.toLocaleString()}</Tag>
            </Space>
          </div>
        )}
      >
        {viewMode === 'detail' ? (
          <Table
            columns={detailColumns}
            dataSource={filteredStocks}
            rowKey="id"
            size="middle"
            loading={isLoading}
            scroll={{ x: 1100 }}
            rowClassName={(r) => {
              if ((r.inspecting_qty ?? 0) > 0) return 'row-staging';
              if (r.min_stock_qty > 0 && r.available_qty <= r.min_stock_qty) return 'row-shortage';
              return '';
            }}
            onRow={(r) => ({
              onClick: () => {
                // 조회일자 모드에서는 트랜잭션 드로어 비활성 (현재 재고 행 id 기준 이력은 시점 의미가 다름).
                if (isAsOfMode) return;
                setDrawerStock(r);
                setDrawerStockId(r.id);
              },
              style: { cursor: isAsOfMode ? 'default' : 'pointer' },
            })}
          />
        ) : (
          <Table
            columns={aggregatedColumns}
            dataSource={aggregatedRows}
            rowKey="key"
            size="middle"
            loading={isLoading}
          />
        )}
      </Card>

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
