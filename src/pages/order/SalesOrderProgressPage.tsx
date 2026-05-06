import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Typography, Card, Tag, Progress, Table, Space, Button, Spin, Empty, Result, Alert,
} from 'antd';
import {
  ArrowLeftOutlined, PlusOutlined, CloseCircleOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useSalesOrderProgress } from '@/hooks/useOrderQuery';
import type {
  SalesOrderProgressItem, SalesOrderProgressLinkedOutbound, OrderStatus,
} from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';

const { Title, Text } = Typography;

/** OutboundDetailPage 와 동일한 헤더 톤 유지 — 보라 대신 청록 계열 (수주서 진행률) */
const HEADER_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  color: '#0891b2',
  fontWeight: 600,
  fontSize: 13,
  padding: '3px 10px',
  borderRadius: 4,
  background: '#ecfeff',
  border: '1px solid #a5f3fc',
};

const PROGRESS_STATUS_TAG: Record<string, { color: string; label: string }> = {
  NOT_STARTED: { color: 'default', label: '미처리' },
  PARTIAL:     { color: 'orange',  label: '부분 처리' },
  COMPLETED:   { color: 'green',   label: '완료' },
};

export default function SalesOrderProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: progress, isLoading, isError, error, refetch } = useSalesOrderProgress(id);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin tip="진행률 조회 중..." />
      </div>
    );
  }
  if (isError || !progress) {
    return (
      <Result
        status="error"
        title="진행률 조회 실패"
        subTitle={(error as Error)?.message ?? '잠시 후 다시 시도해주세요.'}
        extra={<Button onClick={() => refetch()}>다시 시도</Button>}
      />
    );
  }

  const activeOutbounds = progress.linked_outbounds.filter((o) => !o.cancelled);
  const cancelledOutbounds = progress.linked_outbounds.filter((o) => o.cancelled);
  const hasRemaining = progress.items.some((i) => i.remaining_to_dispatch > 0);
  const statusTag = PROGRESS_STATUS_TAG[progress.status] ?? { color: 'default', label: progress.status };

  const handleCreateMore = () => {
    navigate('/order/outbound/new', {
      state: { prefillSalesOrderIds: [progress.id] },
    });
  };

  const itemColumns: ColumnsType<SalesOrderProgressItem> = [
    {
      title: '품목', key: 'product',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.product_name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.sku}</Text>
        </Space>
      ),
    },
    { title: '주문량', dataIndex: 'ordered_qty', key: 'ordered', align: 'right', width: 100 },
    { title: '처리량', dataIndex: 'dispatched_qty', key: 'dispatched', align: 'right', width: 100 },
    {
      title: '남은량', key: 'remaining', align: 'right', width: 100,
      render: (_, r) => (
        <Text type={r.remaining_to_dispatch > 0 ? 'warning' : undefined} strong={r.remaining_to_dispatch > 0}>
          {r.remaining_to_dispatch}
        </Text>
      ),
    },
    {
      title: '진행률', key: 'progress', width: 220,
      render: (_, r) => (
        <Space size={8}>
          <Progress
            percent={r.dispatch_progress_percent}
            size="small"
            status={r.dispatch_progress_percent === 100 ? 'success' : 'active'}
            style={{ width: 130 }}
            showInfo={false}
          />
          <Text style={{ fontSize: 12, fontWeight: 600, minWidth: 38, textAlign: 'right' }}>
            {r.dispatch_progress_percent}%
          </Text>
        </Space>
      ),
    },
  ];

  const activeOutboundColumns: ColumnsType<SalesOrderProgressLinkedOutbound> = [
    {
      title: '지시서 번호', dataIndex: 'outbound_order_no', key: 'no', width: 160,
      render: (v: string, r) => <Link to={`/order/outbound/${r.outbound_order_id}`}>{v}</Link>,
    },
    { title: '창고', dataIndex: 'warehouse_name', key: 'wh', width: 140 },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 100, align: 'center',
      render: (s: string) => {
        const cfg = ORDER_STATUS_CONFIG[s as OrderStatus];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{s}</Tag>;
      },
    },
    { title: '예정일', dataIndex: 'scheduled_date', key: 'date', width: 110, align: 'center' },
    {
      title: '품목/수량', key: 'items',
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {r.items.map((i) => `${i.product_name} ${i.qty}개`).join(', ')}
        </Text>
      ),
    },
  ];

  return (
    <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      {/* ── 헤더 — OutboundDetailPage 와 동일한 패턴 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18, gap: 10 }}>
        <Space size={8} align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/order/outbound')}>목록</Button>
          <span style={HEADER_BADGE_STYLE}>
            <FileTextOutlined style={{ fontSize: 13 }} />
            수주서 진행률
          </span>
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
            {progress.sales_order_number}
          </Title>
          <Tag color={statusTag.color}>{statusTag.label}</Tag>
        </Space>
      </div>

      {/* ── 메타 정보 + 전체 진행률 ── */}
      <Card style={{ marginBottom: 16 }} styles={{ body: { padding: 18 } }}>
        <Space size={20} style={{ marginBottom: 14 }} wrap>
          <Text type="secondary">거래처: <Text strong>{progress.store_name}</Text></Text>
          <Text type="secondary">주문일: <Text strong>{progress.order_date}</Text></Text>
          <Text type="secondary">출고예정: <Text strong>{progress.scheduled_date}</Text></Text>
        </Space>
        <Progress
          percent={progress.dispatch_progress_percent}
          status={progress.dispatch_progress_percent === 100 ? 'success' : 'active'}
        />
        <Text style={{ display: 'block', marginTop: 4 }}>
          <Text strong style={{ fontSize: 16 }}>{progress.dispatch_progress_percent}%</Text>
          {' — 처리 '}
          <Text strong>{progress.total_dispatched_qty.toLocaleString()}</Text>
          {' / 주문 '}
          <Text strong>{progress.total_ordered_qty.toLocaleString()}</Text>
          개
        </Text>
      </Card>

      {/* ── 품목별 진행률 ── */}
      <Card title="품목별 진행률" style={{ marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
        <Table
          columns={itemColumns}
          dataSource={progress.items}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      {/* ── 활성 출고지시서 + 추가 생성 ── */}
      <Card
        title={`활성 출고지시서 (${activeOutbounds.length}건)`}
        extra={(
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!hasRemaining}
            onClick={handleCreateMore}
          >
            추가 출고지시서 생성
          </Button>
        )}
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: activeOutbounds.length === 0 ? 24 : 0 } }}
      >
        {activeOutbounds.length === 0 ? (
          <Empty description="연결된 출고지시서 없음" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            columns={activeOutboundColumns}
            dataSource={activeOutbounds}
            rowKey="outbound_order_id"
            pagination={false}
            size="small"
          />
        )}
        {hasRemaining && (
          <Alert
            type="info"
            showIcon
            style={{ margin: activeOutbounds.length === 0 ? '12px 0 0' : 12 }}
            message="잔여 수량으로 새 출고지시서를 만들 수 있습니다."
            description="버튼 클릭 시 미리보기 단계로 바로 이동하며, 남은 수량을 단일/분할 창고에 자동 분배합니다."
          />
        )}
      </Card>

      {/* ── 취소된 지시서 — 회색 표시 ── */}
      {cancelledOutbounds.length > 0 && (
        <Card title={`취소된 지시서 (${cancelledOutbounds.length}건)`} style={{ marginBottom: 16 }}>
          {cancelledOutbounds.map((o) => (
            <div
              key={o.outbound_order_id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <CloseCircleOutlined style={{ color: '#dc2626' }} />
              <Link
                to={`/order/outbound/${o.outbound_order_id}`}
                style={{ color: '#94a3b8', textDecoration: 'line-through' }}
              >
                {o.outbound_order_no}
              </Link>
              <Text type="secondary">{o.warehouse_name}</Text>
              <Text type="secondary">{o.items.map((i) => `${i.product_name} ${i.qty}개`).join(', ')}</Text>
              {o.cancelled_at && (
                <Text type="secondary" style={{ marginLeft: 'auto' }}>
                  취소일 {o.cancelled_at.slice(0, 10)}
                </Text>
              )}
            </div>
          ))}
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="취소된 지시서의 수량은 처리량에서 제외됩니다."
          />
        </Card>
      )}
    </div>
  );
}
