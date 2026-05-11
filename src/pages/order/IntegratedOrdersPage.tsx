import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Table, Tag, Select, Space, Empty, Tabs, Badge } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useIntegratedOrders } from '@/hooks/useDashboardQuery';
import type { PendingOrderItem, PendingOrderType, PendingOrderCategory } from '@/types/dashboard';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import AssignedWorkerCell from '@/components/AssignedWorkerCell';
import { useUserNameMap } from '@/hooks/useUserNameMap';

const { Title, Text } = Typography;

/**
 * Tab 정의 — 카테고리를 업무 단계로 묶어 노출.
 * BE 의 `category` 파라미터로 1:1 매핑되며, `pending` 은 가상 카테고리(미처리 합집합).
 */
type IntegratedTabKey = 'all' | 'pending' | 'today' | 'in_progress' | 'pending_approval' | 'completed' | 'issue';

const TAB_TO_CATEGORY: Record<IntegratedTabKey, 'ALL' | PendingOrderCategory | 'PENDING'> = {
  all:              'ALL',
  pending:          'PENDING',           // 지연 + 오늘 + 진행중 + 승인대기 합 (BE 가상 카테고리)
  today:            'TODAY',
  in_progress:      'IN_PROGRESS',
  pending_approval: 'PENDING_APPROVAL',
  completed:        'COMPLETED',
  issue:            'DELAYED',
};

const TAB_LABELS: Record<IntegratedTabKey, string> = {
  all:              '전체',
  pending:          '미처리',
  today:            '오늘마감',
  in_progress:      '진행중',
  pending_approval: '승인대기',
  completed:        '완료',
  issue:            '지연',
};

const TAB_BADGE_COLOR: Record<IntegratedTabKey, string> = {
  all:              '#64748b',
  pending:          '#f59e0b',
  today:            '#ef4444',
  in_progress:      '#1677ff',
  pending_approval: '#facc15',
  completed:        '#52c41a',
  issue:            '#f97316',
};

const TAB_KEYS: IntegratedTabKey[] = [
  'all', 'pending', 'today', 'in_progress', 'pending_approval', 'completed', 'issue',
];

const TYPE_OPTIONS: { label: string; value: 'ALL' | PendingOrderType }[] = [
  { label: '전체', value: 'ALL' },
  { label: '입고', value: 'INBOUND' },
  { label: '출고', value: 'OUTBOUND' },
  { label: '이동', value: 'TRANSFER' },
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

function isValidTabKey(v: string | null): v is IntegratedTabKey {
  return v != null && (TAB_KEYS as string[]).includes(v);
}

export default function IntegratedOrdersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabFromUrl = searchParams.get('tab');
  const initialTab: IntegratedTabKey = isValidTabKey(tabFromUrl) ? tabFromUrl : 'all';
  const [activeTab, setActiveTab] = useState<IntegratedTabKey>(initialTab);

  // URL ?tab= 외부 변경(KPI 클릭 등) 동기화
  useEffect(() => {
    if (isValidTabKey(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const type = (searchParams.get('type') ?? 'ALL') as 'ALL' | PendingOrderType;
  const page = Number(searchParams.get('page') ?? '0');
  const size = Number(searchParams.get('size') ?? '20');
  const category = TAB_TO_CATEGORY[activeTab];

  const { data, isLoading } = useIntegratedOrders({ type, category, status: 'ALL', page, size });
  const userMap = useUserNameMap();

  // 탭별 카운트 — 표시용 합계만 별도 호출 없이 현재 응답 total 만 표기
  // (정확한 탭별 카운트는 BE 콜이 N번 필요하므로 생략 — 현재 탭 total 만)
  const totalForActiveTab = data?.total_elements ?? 0;

  const updateType = (value: 'ALL' | PendingOrderType) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'ALL') next.delete('type');
    else next.set('type', value);
    next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const handleTabChange = (k: string) => {
    if (!isValidTabKey(k)) return;
    setActiveTab(k);
    const next = new URLSearchParams(searchParams);
    if (k === 'all') next.delete('tab');
    else next.set('tab', k);
    next.delete('page');
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
      title: '배정 작업자', key: 'assigned_to', width: 130,
      render: (_, r) => <AssignedWorkerCell assignedTo={r.assigned_to} userMap={userMap} />,
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
  ], [userMap]);

  return (
    <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>지시서 목록</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>입고·출고·이동 전체 지시서 조회 (완료·취소 포함)</Text>
        </Space>
      </div>

      {/* 필터 row — 유형 select */}
      <Space size={12} style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        <Space size={6}>
          <span style={{ fontSize: 12, color: '#64748b' }}>유형</span>
          <Select
            size="small"
            value={type}
            onChange={updateType}
            options={TYPE_OPTIONS}
            style={{ minWidth: 110 }}
          />
        </Space>
      </Space>

      {/* Tabs — 카테고리 분류 */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={TAB_KEYS.map((key) => ({
          key,
          label: (
            <Space size={8}>
              <span>{TAB_LABELS[key]}</span>
              {key === activeTab && (
                <Badge
                  count={totalForActiveTab}
                  showZero
                  style={{ backgroundColor: TAB_BADGE_COLOR[key], color: '#fff' }}
                  overflowCount={999}
                />
              )}
            </Space>
          ),
        }))}
        style={{ marginBottom: 8 }}
      />

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

      <style>{`
        .order-list-tone .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 2px solid #dbe3ee !important;
        }
      `}</style>
    </div>
  );
}
