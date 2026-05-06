import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Table, Space, Tag, Select, DatePicker, Input, Button } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import {
  getInboundReceipts,
  type InboundReceiptListItem,
  type InboundReceiptListParams,
  type InboundReceiptOriginType,
} from '@/api/inbound';
import { useMasterWarehouses } from '@/hooks/useWarehouseQuery';
import { useSearchInboundReceipts } from '@/hooks/useInboundQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';

const { Title, Text } = Typography;

const ORIGIN_LABEL: Record<InboundReceiptOriginType, { label: string; color: string }> = {
  purchase_order: { label: '발주', color: 'blue' },
  manual: { label: '수동', color: 'default' },
  return: { label: '반품', color: 'volcano' },
};

const PAGE_SIZE = 20;

export default function InboundReceiptListPage() {
  const navigate = useNavigate();

  // 필터 (입력) — 조회 버튼 누르면 applied 로 옮김
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | undefined>(undefined);
  const [originType, setOriginType] = useState<InboundReceiptOriginType | 'ALL'>('ALL');
  const [receiptNoKw, setReceiptNoKw] = useState('');
  const [orderNoKw, setOrderNoKw] = useState('');

  const [appliedFilter, setAppliedFilter] = useState<InboundReceiptListParams>({});
  const [page, setPage] = useState(0);

  const { data: warehouses = [] } = useMasterWarehouses();
  const warehouseOptions = useMemo(() => [
    { label: '전체 창고', value: '' },
    ...warehouses.filter((w) => w.active !== false).map((w) => ({
      label: `${w.code} — ${w.name}`,
      value: w.id,
    })),
  ], [warehouses]);

  const queryParams: InboundReceiptListParams = useMemo(() => ({
    ...appliedFilter,
    page,
    size: PAGE_SIZE,
  }), [appliedFilter, page]);

  const productFilter = useProductFilterForOrder();
  const { data: rawData, isLoading: rawLoading } = useQuery({
    queryKey: ['inbound-receipts', queryParams],
    queryFn: () => getInboundReceipts(queryParams),
    enabled: !productFilter.isFiltering,
  });
  const { data: searchedData, isLoading: searchLoading } = useSearchInboundReceipts(
    queryParams,
    productFilter.productIds,
  );
  const data = productFilter.isFiltering ? searchedData : rawData;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;

  const handleSearch = () => {
    setPage(0);
    setAppliedFilter({
      dateFrom: dateFrom?.format('YYYY-MM-DD'),
      dateTo: dateTo?.format('YYYY-MM-DD'),
      warehouseId: warehouseId || undefined,
      originType: originType === 'ALL' ? undefined : originType,
      receiptNoKeyword: receiptNoKw.trim() || undefined,
      orderNoKeyword: orderNoKw.trim() || undefined,
    });
  };

  const handleReset = () => {
    setDateFrom(null);
    setDateTo(null);
    setWarehouseId(undefined);
    setOriginType('ALL');
    setReceiptNoKw('');
    setOrderNoKw('');
    setAppliedFilter({});
    setPage(0);
  };

  const handleQuickRange = (kind: 'thisMonth' | 'lastMonth') => {
    const now = dayjs();
    if (kind === 'thisMonth') {
      setDateFrom(now.startOf('month'));
      setDateTo(now.endOf('month'));
    } else {
      const lm = now.subtract(1, 'month');
      setDateFrom(lm.startOf('month'));
      setDateTo(lm.endOf('month'));
    }
  };

  const columns: ColumnsType<InboundReceiptListItem> = [
    { title: '전표번호', dataIndex: 'receipt_no', key: 'receipt_no', width: 170 },
    { title: '입고지시서번호', dataIndex: 'order_no', key: 'order_no', width: 170 },
    {
      title: '출처유형', dataIndex: 'origin_type', key: 'origin_type', width: 90, align: 'center',
      render: (v: InboundReceiptOriginType | null) => {
        if (!v) return <span style={{ color: '#94a3b8' }}>-</span>;
        const cfg = ORIGIN_LABEL[v];
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '출처번호', dataIndex: 'origin_no', key: 'origin_no', width: 150,
      render: (v: string | null) => v ?? <span style={{ color: '#94a3b8' }}>-</span>,
    },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130,
      render: (v: string | null) => v ?? '-' },
    {
      title: '협력사', dataIndex: 'supplier_name', key: 'supplier_name', width: 140,
      render: (v: string | null) => v ?? <span style={{ color: '#94a3b8' }}>-</span>,
    },
    {
      title: '입고담당자', dataIndex: 'received_by_name', key: 'received_by_name', width: 110,
      render: (v: string | null) => v ?? '-',
    },
    {
      title: '입고일시', dataIndex: 'received_at', key: 'received_at', width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
  ];

  return (
    <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>입고전표 조회</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>입고 확정된 전표 이력을 검색</Text>
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
            filteredLineCount={data?.content?.length ?? 0}
          />
        </div>
      )}

      {/* 필터 영역 */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 14,
          marginBottom: 14,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
        }}
      >
        <FilterField label="기간">
          <Space size={4} wrap>
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="시작일" style={{ width: 130 }} />
            <Text type="secondary">~</Text>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder="종료일" style={{ width: 130 }} />
            <Button size="small" onClick={() => handleQuickRange('thisMonth')}>이번달</Button>
            <Button size="small" onClick={() => handleQuickRange('lastMonth')}>전월</Button>
          </Space>
        </FilterField>

        <FilterField label="창고">
          <Select
            value={warehouseId ?? ''}
            onChange={(v) => setWarehouseId(v || undefined)}
            options={warehouseOptions}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="label"
          />
        </FilterField>

        <FilterField label="유형">
          <Select
            value={originType}
            onChange={setOriginType}
            style={{ width: 120 }}
            options={[
              { label: '전체', value: 'ALL' },
              { label: '발주', value: 'purchase_order' },
              { label: '수동', value: 'manual' },
              { label: '반품', value: 'return' },
            ]}
          />
        </FilterField>

        <FilterField label="전표번호">
          <Input
            placeholder="전표번호"
            value={receiptNoKw}
            onChange={(e) => setReceiptNoKw(e.target.value)}
            allowClear
            style={{ width: 180 }}
            onPressEnter={handleSearch}
          />
        </FilterField>

        <FilterField label="지시서번호">
          <Input
            placeholder="입고지시서번호"
            value={orderNoKw}
            onChange={(e) => setOrderNoKw(e.target.value)}
            allowClear
            style={{ width: 180 }}
            onPressEnter={handleSearch}
          />
        </FilterField>

        <Space style={{ marginLeft: 'auto' }}>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>초기화</Button>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>조회</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data?.content ?? []}
        rowKey="id"
        loading={isLoading}
        pagination={{
          current: (data?.number ?? 0) + 1,
          pageSize: PAGE_SIZE,
          total: data?.total_elements ?? 0,
          showSizeChanger: false,
          onChange: (p) => setPage(p - 1),
        }}
        onRow={(r) => ({
          onClick: () => navigate(`/order/inbound/${r.inbound_order_id}`),
          style: { cursor: 'pointer' },
        })}
      />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>{label}</Text>
      {children}
    </div>
  );
}
