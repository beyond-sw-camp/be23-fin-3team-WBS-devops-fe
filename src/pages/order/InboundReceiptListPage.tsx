import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Table, Space, Tag, Select, DatePicker, Input, Button, Card, message } from 'antd';
import { SearchOutlined, ReloadOutlined, CalendarOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { useReactToPrint } from 'react-to-print';
import {
  getInboundReceipts,
  getInboundReceipt,
  type InboundReceiptListItem,
  type InboundReceiptListParams,
  type InboundReceiptOriginType,
} from '@/api/inbound';
import { useMasterWarehouses } from '@/hooks/useWarehouseQuery';
import { useSearchInboundReceipts } from '@/hooks/useInboundQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import PrintDocument from '@/components/PrintDocument';

const { Title, Text } = Typography;

const ORIGIN_LABEL: Record<string, { label: string; color: string }> = {
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
  const [printingReceipt, setPrintingReceipt] = useState<Awaited<ReturnType<typeof getInboundReceipt>> | null>(null);
  const receiptPrintRef = useRef<HTMLDivElement>(null);

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

  const handleReceiptPrint = useReactToPrint({
    contentRef: receiptPrintRef,
    documentTitle: () => `입고전표_${printingReceipt?.receipt_no ?? 'receipt'}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
    onBeforePrint: () => new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }),
    onPrintError: (_loc, err) => { message.error(err?.message || '입고 전표 인쇄를 시작할 수 없습니다.'); },
  });

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

  const handlePrintReceiptRow = async (row: InboundReceiptListItem) => {
    try {
      const fullReceipt = await getInboundReceipt(row.inbound_order_id);
      setPrintingReceipt(fullReceipt);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!receiptPrintRef.current) {
            message.warning('전표 출력 준비 중입니다. 잠시 후 다시 시도해 주세요.');
            return;
          }
          void handleReceiptPrint();
        });
      });
    } catch {
      message.error('입고 전표 정보를 불러오지 못했습니다.');
    }
  };

  const columns: ColumnsType<InboundReceiptListItem> = [
    { title: '전표번호', dataIndex: 'receipt_no', key: 'receipt_no', width: 170 },
    { title: '입고지시서번호', dataIndex: 'order_no', key: 'order_no', width: 170 },
    {
      title: '출처유형', dataIndex: 'origin_type', key: 'origin_type', width: 90, align: 'center',
      render: (v: InboundReceiptOriginType | null) => {
        if (!v) return <span style={{ color: '#94a3b8' }}>-</span>;
        const cfg = ORIGIN_LABEL[v] ?? { label: v, color: 'default' };
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
    {
      title: '전표출력',
      key: 'print',
      width: 110,
      align: 'center',
      render: (_, row) => (
        <Button
          size="small"
          icon={<PrinterOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            void handlePrintReceiptRow(row);
          }}
        >
          출력
        </Button>
      ),
    },
  ];

  return (
    <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>입고전표 조회</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>입고 확정된 전표 이력을 검색</Text>
        </Space>
      </div>
      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '18px 20px' } }}>
        <Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>검색 기준</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>조회 기간</Text>
              <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="시작일" style={{ width: 130 }} />
              <Text type="secondary">~</Text>
              <DatePicker value={dateTo} onChange={setDateTo} placeholder="종료일" style={{ width: 130 }} />
              <Button size="small" onClick={() => handleQuickRange('thisMonth')}>이번달</Button>
              <Button size="small" onClick={() => handleQuickRange('lastMonth')}>전월</Button>
            </Space>

            <Space size={8} align="center">
              <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>창고</Text>
              <Select
                value={warehouseId ?? ''}
                onChange={(v) => setWarehouseId(v || undefined)}
                options={warehouseOptions}
                style={{ width: 240 }}
                showSearch
                optionFilterProp="label"
              />
            </Space>

            <Space size={8} align="center">
              <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>유형</Text>
              <Select
                value={originType}
                onChange={setOriginType}
                style={{ width: 140 }}
                options={[
                  { label: '전체', value: 'ALL' },
                  { label: '발주', value: 'purchase_order' },
                  { label: '수동', value: 'manual' },
                  { label: '반품', value: 'return' },
                ]}
              />
            </Space>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(320px, 420px)) 1fr',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <Space size={8} align="center">
              <SearchOutlined style={{ color: '#64748b' }} />
              <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>전표번호</Text>
              <Input
                placeholder="전표번호"
                value={receiptNoKw}
                onChange={(e) => setReceiptNoKw(e.target.value)}
                allowClear
                style={{ width: 240 }}
                onPressEnter={handleSearch}
              />
            </Space>

            <Space size={8} align="center">
              <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>지시서번호</Text>
              <Input
                placeholder="입고지시서번호"
                value={orderNoKw}
                onChange={(e) => setOrderNoKw(e.target.value)}
                allowClear
                style={{ width: 240 }}
                onPressEnter={handleSearch}
              />
            </Space>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Space size={8}>
                <ProductFilterTriggerButton
                  {...productFilter}
                  matchedProductCount={productFilter.productIds?.length ?? null}
                />
                <Button icon={<ReloadOutlined />} onClick={handleReset}>초기화</Button>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>조회</Button>
              </Space>
            </div>
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
              filteredLineCount={data?.content?.length ?? 0}
            />
          </div>
        )}
      </Card>

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
      <div className="print-from-dom-source" aria-hidden>
        {printingReceipt && (
          <PrintDocument
            ref={receiptPrintRef}
            title="입고 전표"
            subtitle={`${printingReceipt.vendor_name} → ${printingReceipt.warehouse_name}`}
            orderNo={printingReceipt.receipt_no}
            documentNoLabel="전표 번호"
            qrValue={`inbound-receipt:${printingReceipt.id}`}
            documentOperator={printingReceipt.received_by_name ?? printingReceipt.received_by ?? '-'}
            info={[
              { label: '원 지시서', value: printingReceipt.order_no },
              { label: '입고처', value: printingReceipt.vendor_name },
              { label: '창고', value: printingReceipt.warehouse_name },
              { label: '입고일시', value: printingReceipt.received_at ? dayjs(printingReceipt.received_at).format('YYYY-MM-DD HH:mm') : '-' },
              { label: '검수 담당자', value: printingReceipt.received_by_name ?? printingReceipt.received_by ?? '-' },
              { label: '정상 수량', value: printingReceipt.items.filter((item) => item.item_condition !== 'defect').reduce((sum, item) => sum + item.qty, 0).toLocaleString() },
              { label: '불량 수량', value: printingReceipt.items.filter((item) => item.item_condition === 'defect').reduce((sum, item) => sum + item.qty, 0).toLocaleString() },
            ]}
            columns={[
              { label: 'No', key: 'no', align: 'center', width: 36 },
              { label: 'SKU', key: 'sku', width: 120 },
              { label: '상품명', key: 'product_name' },
              { label: '구분', key: 'condition', align: 'center', width: 70 },
              { label: '수량', key: 'qty', numeric: true, width: 72, bold: true },
              { label: '단가', key: 'unit_price', numeric: true, width: 80 },
              { label: '금액', key: 'amount', numeric: true, width: 90, bold: true },
            ]}
            data={printingReceipt.items.map((item, idx) => ({
              no: idx + 1,
              sku: item.sku ?? '-',
              product_name: item.product_name ?? '-',
              condition: item.item_condition === 'defect' ? '불량' : '정상',
              qty: (item.qty ?? 0).toLocaleString(),
              unit_price: (item.unit_price ?? 0).toLocaleString(),
              amount: ((item.qty ?? 0) * (item.unit_price ?? 0)).toLocaleString(),
            }))}
            footer={{
              left: `총 ${printingReceipt.items.length}개 품목`,
              right: `합계: ${printingReceipt.items.reduce((sum, item) => sum + ((item.qty ?? 0) * (item.unit_price ?? 0)), 0).toLocaleString()}원`,
            }}
            signatureLabels={['검수자', '확인자']}
          />
        )}
      </div>
    </div>
  );
}
