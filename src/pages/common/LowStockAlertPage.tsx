import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Table, Tag, Empty, Spin, Space, Button, Tabs, Card } from 'antd';
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
      <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>재고 부족 품목</Title>
          <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 13 }}>
            각 상품에 설정된 안전재고 기준으로 가용재고가 부족한 품목을 확인하는 화면입니다.
          </Text>
        </div>

        <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '18px 20px' } }}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <div>
              <Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>검색 조건</Text>
              <ProductFilterTriggerButton
                {...productFilter}
                matchedProductCount={productFilter.productIds?.length ?? null}
              />
            </div>
            {productFilter.isFiltering && (
              <ProductFilterStatusBar
                {...productFilter}
                matchedProductCount={productFilter.productIds?.length ?? null}
                filteredLineCount={filteredItems.length}
              />
            )}
          </Space>
        </Card>

        <Card
          size="small"
          styles={{ body: { padding: '0' } }}
          title={(
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text strong>부족 품목 목록</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>총 {sortedItems.length.toLocaleString()}건</Text>
              {items.length > 0 && <Tag color="error" style={{ margin: 0 }}>전체 {items.length.toLocaleString()}건</Tag>}
            </div>
          )}
        >
          {warehouseTabs.length > 1 && (
            <div style={{ padding: '0 16px', borderBottom: '1px solid #f0f0f0' }}>
              <Tabs
                activeKey={selectedWarehouseId}
                onChange={setSelectedWarehouseId}
                size="small"
                style={{ marginBottom: 0 }}
                items={[
                  { key: WAREHOUSE_FILTER_ALL, label: `전체 (${items.length})` },
                  ...warehouseTabs.map((w) => ({
                    key: w.id,
                    label: `${w.name} (${w.count})`,
                  })),
                ]}
              />
            </div>
          )}

          {sortedItems.length === 0 ? (
            <Empty description="재고 부족 품목이 없습니다" style={{ margin: '80px 0' }} />
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
        </Card>
      </div>

      <style>{`
        .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 1px solid #e5e7eb !important;
        }
      `}</style>
    </>
  );
}
