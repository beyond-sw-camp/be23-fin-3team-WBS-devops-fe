import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Table, Tag, Empty, Spin, Space, Button, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { LowStockItem } from '@/types/statistics';
import { useLowStockItems } from '@/hooks/useStatisticsQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';

const { Title, Text } = Typography;

type SeverityFilter = 'all' | 'critical' | 'warning' | 'caution';

function severityOf(item: LowStockItem): SeverityFilter {
  if (item.available_qty === 0) return 'critical';
  if (item.available_qty <= item.min_stock_qty * 0.5) return 'warning';
  return 'caution';
}

const WAREHOUSE_FILTER_ALL = '__ALL__';

export default function LowStockAlertPage() {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useLowStockItems();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(WAREHOUSE_FILTER_ALL);
  const productFilter = useProductFilterForOrder();

  // 창고별 카운트 (탭 라벨에 표시) — 가나다순으로 정렬
  const warehouseTabs = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    items.forEach((it) => {
      const cur = counts.get(it.warehouse_id);
      if (cur) cur.count += 1;
      else counts.set(it.warehouse_id, { id: it.warehouse_id, name: it.warehouse_name, count: 1 });
    });
    return Array.from(counts.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // 탭 필터 + 상품 멀티필터(productIds) 적용
  const productIdsSet = useMemo(
    () => productFilter.productIds ? new Set(productFilter.productIds) : null,
    [productFilter.productIds],
  );
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (selectedWarehouseId !== WAREHOUSE_FILTER_ALL && it.warehouse_id !== selectedWarehouseId) return false;
      if (productIdsSet && !productIdsSet.has(String(it.product_id))) return false;
      return true;
    });
  }, [items, selectedWarehouseId, productIdsSet]);

  const sortedItems = useMemo(() => {
    const rank = (r: LowStockItem) => {
      const sev = severityOf(r);
      if (sev === 'critical') return 0;
      if (sev === 'warning') return 1;
      return 2;
    };
    return [...filteredItems].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (a.available_qty ?? 0) - (b.available_qty ?? 0);
    });
  }, [filteredItems]);

  const goStockStatus = (item: LowStockItem) => {
    // 재고현황 페이지는 BE 응답에 진짜 SKU 가 없어 productId 슬라이스를 sku 로 표시함.
    // 그래서 search=SKU 로 보내면 매칭이 안 됨 → productId/warehouseId 만 넘겨서 정확 매칭.
    const params = new URLSearchParams();
    params.set('warehouseId', item.warehouse_id);
    params.set('productId', item.product_id);
    navigate(`/inventory/stocks?${params.toString()}`);
  };

  const columns: ColumnsType<LowStockItem> = [
  { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 220 },
  { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
  { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 150 },
  {
    title: '가용재고', dataIndex: 'available_qty', key: 'available_qty', width: 100, align: 'right',
    render: (v: number) => (
      <span style={{ fontWeight: 700, color: v === 0 ? '#ff4d4f' : '#fa8c16' }}>
        {(v ?? 0).toLocaleString()}
      </span>
    ),
  },
  {
    title: '안전재고', dataIndex: 'min_stock_qty', key: 'min_stock_qty', width: 100, align: 'right',
    render: (v: number) => (v ?? 0).toLocaleString(),
  },
  {
    title: '상태', key: 'status', width: 100, align: 'center',
    render: (_, r) => {
      if (r.available_qty === 0) return <Tag color="red">재고없음</Tag>;
      if (r.available_qty <= r.min_stock_qty * 0.5) return <Tag color="orange">부족</Tag>;
      return <Tag color="gold">주의</Tag>;
    },
  },
  {
    title: '조치', key: 'action', width: 170, align: 'center',
    render: (_, r) => (
      <Space size={4}>
        <Button
          size="small"
          type="link"
          onClick={(e) => {
            e.stopPropagation();
            navigate('/order/inbound', {
              state: {
                prefillManualInbound: {
                  productId: r.product_id,
                  productName: r.product_name,
                  sku: r.sku,
                  warehouseId: r.warehouse_id,
                  warehouseName: r.warehouse_name,
                  availableQty: r.available_qty,
                  minStockQty: r.min_stock_qty,
                },
              },
            });
          }}
        >
          입고 생성
        </Button>
        <Button
          size="small"
          type="link"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/master/products?search=${encodeURIComponent(r.sku)}`);
          }}
        >
          안전재고 수정
        </Button>
      </Space>
    ),
  },
];

  if (isLoading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;

  return (
    <>
      <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Title level={4} style={{ margin: 0 }}>재고 부족 품목</Title>
          {items.length > 0 && <Tag color="red">{items.length}건</Tag>}
        </div>

        <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
          각 상품에 설정된 안전재고(minStockQty) 기준으로 가용재고가 부족한 품목을 표시합니다.
        </Text>

        <div style={{ marginBottom: 10 }}>
          <ProductFilterTriggerButton
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
          />
        </div>
        {productFilter.isFiltering && (
          <div style={{ marginBottom: 10 }}>
            <ProductFilterStatusBar
              {...productFilter}
              matchedProductCount={productFilter.productIds?.length ?? null}
              filteredLineCount={filteredItems.length}
            />
          </div>
        )}

        {warehouseTabs.length > 1 && (
          <Tabs
            activeKey={selectedWarehouseId}
            onChange={setSelectedWarehouseId}
            size="small"
            style={{ marginBottom: 4 }}
            items={[
              { key: WAREHOUSE_FILTER_ALL, label: `전체 (${items.length})` },
              ...warehouseTabs.map((w) => ({
                key: w.id,
                label: `${w.name} (${w.count})`,
              })),
            ]}
          />
        )}

        {sortedItems.length === 0 ? (
          <Empty description="재고 부족 품목이 없습니다" style={{ marginTop: 80 }} />
        ) : (
          <Table
            columns={columns}
            dataSource={sortedItems}
            rowKey={(r) => `${r.product_id}-${r.warehouse_id}`}
            size="middle"
            pagination={{ pageSize: 20 }}
            onRow={(record) => ({
              onClick: () => goStockStatus(record),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>

      <style>{`
        .order-list-tone .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 2px solid #dbe3ee !important;
        }
      `}</style>
    </>
  );
}
