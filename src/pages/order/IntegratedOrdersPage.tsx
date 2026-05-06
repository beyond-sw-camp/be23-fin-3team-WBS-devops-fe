import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Table, Tag, Select, Space, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useIntegratedOrders } from '@/hooks/useDashboardQuery';
import type { PendingOrderItem, PendingOrderType, PendingOrderCategory } from '@/types/dashboard';
import { ORDER_STATUS_CONFIG } from '@/types/order';

const { Title, Text } = Typography;

const TYPE_OPTIONS: { label: string; value: 'ALL' | PendingOrderType }[] = [
  { label: '전체', value: 'ALL' },
  { label: '입고', value: 'INBOUND' },
  { label: '출고', value: 'OUTBOUND' },
  { label: '이동', value: 'TRANSFER' },
];

const CATEGORY_OPTIONS: { label: string; value: 'ALL' | PendingOrderCategory }[] = [
  { label: '전체', value: 'ALL' },
  { label: '지연', value: 'DELAYED' },
  { label: '오늘마감', value: 'TODAY' },
  { label: '진행중', value: 'IN_PROGRESS' },
  { label: '승인대기', value: 'PENDING_APPROVAL' },
  { label: '미래 예정', value: 'UPCOMING' },
  { label: '완료', value: 'COMPLETED' },
  { label: '취소', value: 'CANCELLED' },
];

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: '전체', value: 'ALL' },
  { label: '초안', value: 'draft' },
  { label: '승인', value: 'approved' },
  { label: '진행중', value: 'in_progress' },
  { label: '검수중', value: 'received' },
  { label: '적치중', value: 'placing' },
  { label: '완료', value: 'completed' },
  { label: '부분완료', value: 'partial' },
  { label: '취소', value: 'cancelled' },
];

const TYPE_BADGE: Record<PendingOrderItem['type'], { label: string; color: string }> = {
  INBOUND:  { label: '입고', color: 'cyan' },
  OUTBOUND: { label: '출고', color: 'purple' },
  TRANSFER: { label: '이동', color: 'geekblue' },
};

const CATEGORY_TAG: Record<PendingOrderCategory, { label: string; color: string }> = {
  DELAYED:          { label: '지연',     color: 'orange' },
  TODAY:            { label: '오늘마감', color: 'red' },
  IN_PROGRESS:      { label: '진행중',   color: 'blue' },
  PENDING_APPROVAL: { label: '승인대기', color: 'gold' },
  UPCOMING:         { label: '예정',     color: 'default' },
  COMPLETED:        { label: '완료',     color: 'green' },
  CANCELLED:        { label: '취소',     color: 'default' },
};

function detailPath(item: PendingOrderItem): string {
  switch (item.type) {
    case 'INBOUND':  return `/order/inbound/${item.order_id}`;
    case 'OUTBOUND': return `/order/outbound/${item.order_id}`;
    case 'TRANSFER': return `/order/transfer/${item.order_id}`;
  }
}

export default function IntegratedOrdersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const type = (searchParams.get('type') ?? 'ALL') as 'ALL' | PendingOrderType;
  const category = (searchParams.get('category') ?? 'ALL') as 'ALL' | PendingOrderCategory;
  const status = searchParams.get('status') ?? 'ALL';
  const page = Number(searchParams.get('page') ?? '0');
  const size = Number(searchParams.get('size') ?? '20');

  const { data, isLoading } = useIntegratedOrders({ type, category, status, page, size });

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'ALL' || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page'); // 필터 바뀌면 페이지 초기화
    setSearchParams(next, { replace: true });
  };

  const columns = useMemo<ColumnsType<PendingOrderItem>>(() => [
    {
      title: '유형', dataIndex: 'type', key: 'type', width: 80, align: 'center',
      render: (v: PendingOrderItem['type']) => {
        const b = TYPE_BADGE[v];
        return <Tag color={b.color} style={{ margin: 0 }}>{b.label}</Tag>;
      },
    },
    { title: '지시서 번호', dataIndex: 'order_no', key: 'order_no', width: 180,
      render: (v: string) => <span style={{ color: '#0f172a', fontWeight: 500 }}>{v}</span> },
    { title: '거래처/창고', dataIndex: 'partner_name', key: 'partner_name', width: 180 },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 110, align: 'center',
      render: (v: string) => {
        const cfg = ORDER_STATUS_CONFIG[v as keyof typeof ORDER_STATUS_CONFIG];
        return cfg ? <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag> : <Tag>{v}</Tag>;
      },
    },
    {
      title: '카테고리', dataIndex: 'category', key: 'category', width: 100, align: 'center',
      render: (v: PendingOrderCategory) => {
        const t = CATEGORY_TAG[v];
        return <Tag color={t.color} style={{ margin: 0 }}>{t.label}</Tag>;
      },
    },
    {
      title: '마감일', key: 'deadline', width: 150,
      render: (_, r) => (
        <span>
          {r.scheduled_date}
          {r.category === 'DELAYED' && r.delay_days > 0 && (
            <Tag color="orange" style={{ marginLeft: 6 }}>{r.delay_days}일 지연</Tag>
          )}
        </span>
      ),
    },
    {
      title: '품목/수량', key: 'qty', width: 140, align: 'right',
      render: (_, r) => `품목 ${r.item_count}개 · ${r.total_qty.toLocaleString()}`,
    },
    { title: '등록일', dataIndex: 'created_at', key: 'created_at', width: 130,
      render: (v: string) => v?.slice(0, 10) ?? '-' },
  ], []);

  return (
    <>
      <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <Space>
            <Title level={4} style={{ margin: 0 }}>지시서 목록</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>입고·출고·이동 전체 지시서 조회 (완료·취소 포함)</Text>
          </Space>
        </div>

        <div>
          <Space size={12} style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <Space size={6}>
              <span style={{ fontSize: 12, color: '#64748b' }}>유형</span>
              <Select size="small" value={type} onChange={(v) => updateParam('type', v)}
                      options={TYPE_OPTIONS} style={{ minWidth: 100 }} />
            </Space>
            <Space size={6}>
              <span style={{ fontSize: 12, color: '#64748b' }}>카테고리</span>
              <Select size="small" value={category} onChange={(v) => updateParam('category', v)}
                      options={CATEGORY_OPTIONS} style={{ minWidth: 110 }} />
            </Space>
            <Space size={6}>
              <span style={{ fontSize: 12, color: '#64748b' }}>상태</span>
              <Select size="small" value={status} onChange={(v) => updateParam('status', v)}
                      options={STATUS_OPTIONS} style={{ minWidth: 100 }} />
            </Space>
          </Space>

          <div style={{ marginTop: 14 }}>
            {data && data.empty ? (
              <Empty description="조건에 해당하는 지시서가 없습니다" style={{ marginTop: 80 }} />
            ) : (
              <Table
                columns={columns}
                dataSource={data?.content ?? []}
                rowKey={(r) => `${r.type}-${r.order_id}`}
                loading={isLoading}
                size="middle"
                onRow={(record) => ({
                  onClick: () => navigate(detailPath(record)),
                  style: { cursor: 'pointer', height: 52 },
                })}
                pagination={{
                  current: (data?.number ?? 0) + 1,
                  total: data?.total_elements ?? 0,
                  pageSize: size,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50'],
                  onChange: (p, ps) => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(p - 1));
                    if (ps !== size) next.set('size', String(ps));
                    setSearchParams(next, { replace: true });
                  },
                }}
              />
            )}
          </div>
        </div>
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
