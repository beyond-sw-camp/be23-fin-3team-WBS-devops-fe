import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Tabs, Table, Card, Row, Col, Statistic, Tag, Button, Alert } from 'antd';
import {
  ImportOutlined, ExportOutlined, SwapOutlined, WarningOutlined,
  ClockCircleOutlined, AuditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { InboundOrder, OutboundOrder, TransferOrder, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import { useOutboundOrders, useTransferOrders } from '@/hooks/useOrderQuery';
import { useInboundOrders } from '@/hooks/useInboundQuery';

const { Title } = Typography;

// inbound / outbound 의 유효 상태가 다르므로 별도 목록 유지
const FILTER_CONFIG: Record<string, {
  title: string;
  desc: string;
  inboundStatuses: OrderStatus[];
  outboundStatuses: OrderStatus[];
  icon: React.ReactNode;
}> = {
  delayed: {
    title: '지연 지시서',
    desc: '기한이 경과했지만 아직 처리되지 않은 지시서',
    inboundStatuses: ['approved', 'received', 'placing'] as OrderStatus[],
    outboundStatuses: ['approved', 'in_progress', 'partial'] as OrderStatus[],
    icon: <ClockCircleOutlined />,
  },
  draft: {
    title: '승인 대기',
    desc: '승인이 필요한 초안 상태 지시서',
    inboundStatuses: ['draft'] as OrderStatus[],
    outboundStatuses: ['draft'] as OrderStatus[],
    icon: <AuditOutlined />,
  },
};

export default function IncompleteOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('filter'); // 'delayed' | 'draft' | null
  const today = dayjs().format('YYYY-MM-DD');

  const config = filter ? FILTER_CONFIG[filter] : null;
  const inboundStatuses = config?.inboundStatuses ?? (['draft', 'approved', 'received', 'placing'] as OrderStatus[]);
  const outboundStatuses = config?.outboundStatuses ?? (['draft', 'approved', 'in_progress', 'partial'] as OrderStatus[]);
  const combinedStatuses = Array.from(new Set([...inboundStatuses, ...outboundStatuses]));

  const { data: inboundAll = [], isLoading: inLoading } = useInboundOrders({ status: inboundStatuses });
  const { data: outboundAll = [], isLoading: outLoading } = useOutboundOrders({ status: outboundStatuses });
  const { data: transferAllRaw = [], isLoading: trLoading } = useTransferOrders();
  const transferAll = useMemo(
    () => transferAllRaw.filter((t) => combinedStatuses.includes(t.status as OrderStatus)),
    [transferAllRaw, combinedStatuses],
  );

  // delayed 필터: expected_date < 오늘
  const inboundOrders = useMemo(() => {
    if (filter !== 'delayed') return inboundAll;
    return inboundAll.filter((o) => o.expected_date < today);
  }, [inboundAll, filter]);

  const outboundOrders = useMemo(() => {
    if (filter !== 'delayed') return outboundAll;
    return outboundAll.filter((o) => o.expected_date < today);
  }, [outboundAll, filter]);

  const transferOrders = useMemo(() => {
    if (filter !== 'delayed') return transferAll;
    return transferAll.filter((o) => o.created_at < today); // 이동은 created_at 기준
  }, [transferAll, filter]);

  const totalCount = inboundOrders.length + outboundOrders.length + transferOrders.length;
  const pageTitle = config?.title ?? '미완료 지시서';

  const inColumns: ColumnsType<InboundOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 140 },
    { title: '입고처', dataIndex: 'vendor_name', key: 'vendor_name', width: 150 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    { title: '입고예정일', dataIndex: 'expected_date', key: 'expected_date', width: 120, align: 'center',
      render: (v: string) => <span style={{ color: filter === 'delayed' && v < today ? '#ff4d4f' : undefined }}>{v}</span> },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90, align: 'center', render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v].color}>{ORDER_STATUS_CONFIG[v].label}</Tag> },
    { title: '액션', key: 'action', width: 70, render: (_, r) => <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/order/inbound/${r.id}`); }}>상세</Button> },
  ];

  const outColumns: ColumnsType<OutboundOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 140 },
    { title: '출고처', dataIndex: 'store_name', key: 'store_name', width: 150 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    { title: '출고예정일', dataIndex: 'expected_date', key: 'expected_date', width: 120, align: 'center',
      render: (v: string) => <span style={{ color: filter === 'delayed' && v < today ? '#ff4d4f' : undefined }}>{v}</span> },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90, align: 'center', render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v].color}>{ORDER_STATUS_CONFIG[v].label}</Tag> },
    { title: '액션', key: 'action', width: 70, render: (_, r) => <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/order/outbound/${r.id}`); }}>상세</Button> },
  ];

  const trColumns: ColumnsType<TransferOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 140 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    { title: '이동사유', dataIndex: 'reason', key: 'reason' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 90, align: 'center', render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v].color}>{ORDER_STATUS_CONFIG[v].label}</Tag> },
    { title: '액션', key: 'action', width: 70, render: (_, r) => <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/order/transfer/${r.id}`); }}>상세</Button> },
  ];

  return (
    <>
      <Title level={4} style={{ marginBottom: 8 }}>{pageTitle}</Title>
      {config && <Alert message={config.desc} type="info" showIcon style={{ marginBottom: 16 }} />}

      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card><Statistic title="입고" value={inboundOrders.length} suffix="건" prefix={<ImportOutlined />} valueStyle={{ color: '#1677ff' }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="출고" value={outboundOrders.length} suffix="건" prefix={<ExportOutlined />} valueStyle={{ color: '#52c41a' }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="이동" value={transferOrders.length} suffix="건" prefix={<SwapOutlined />} valueStyle={{ color: '#722ed1' }} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="전체 합계" value={totalCount} suffix="건" prefix={<WarningOutlined />} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
      </Row>

      <Tabs items={[
        {
          key: 'inbound',
          label: `입고 (${inboundOrders.length})`,
          children: <Table columns={inColumns} dataSource={inboundOrders} rowKey="id" loading={inLoading}
            onRow={(r) => ({ onClick: () => navigate(`/order/inbound/${r.id}`), style: { cursor: 'pointer' } })} />,
        },
        {
          key: 'outbound',
          label: `출고 (${outboundOrders.length})`,
          children: <Table columns={outColumns} dataSource={outboundOrders} rowKey="id" loading={outLoading}
            onRow={(r) => ({ onClick: () => navigate(`/order/outbound/${r.id}`), style: { cursor: 'pointer' } })} />,
        },
        {
          key: 'transfer',
          label: `이동 (${transferOrders.length})`,
          children: <Table columns={trColumns} dataSource={transferOrders} rowKey="id" loading={trLoading}
            onRow={(r) => ({ onClick: () => navigate(`/order/transfer/${r.id}`), style: { cursor: 'pointer' } })} />,
        },
      ]} />
    </>
  );
}
