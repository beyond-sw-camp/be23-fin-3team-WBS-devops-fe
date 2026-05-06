import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, List, Tag, Typography, Empty, Button, Space } from 'antd';
import { Target } from 'lucide-react';
import dayjs from 'dayjs';
import { useOutboundOrders } from '@/hooks/useOrderQuery';
import { useInboundOrders } from '@/hooks/useInboundQuery';
import type { OutboundOrder, InboundOrder } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';

const { Text } = Typography;

type UnifiedOrder = {
  id: string;
  order_no: string;
  kind: 'inbound' | 'outbound';
  counterparty: string;
  expected_date: string;
  status: string;
  total_items?: number;
  total_qty?: number;
};

function toUnifiedOutbound(o: OutboundOrder): UnifiedOrder {
  return {
    id: o.id,
    order_no: o.order_no,
    kind: 'outbound',
    counterparty: o.store_name,
    expected_date: o.expected_date,
    status: o.status,
    total_items: o.total_items,
    total_qty: o.total_qty,
  };
}

function toUnifiedInbound(o: InboundOrder): UnifiedOrder {
  return {
    id: o.id,
    order_no: o.order_no,
    kind: 'inbound',
    counterparty: o.vendor_name,
    expected_date: o.expected_date,
    status: o.status,
    total_items: o.total_items,
    total_qty: o.total_qty,
  };
}

const OPEN_STATUSES = new Set(['draft', 'approved', 'in_progress', 'received', 'placing', 'partial']);

export default function TodayOrdersPanel() {
  const navigate = useNavigate();
  const { data: outbound = [] } = useOutboundOrders();
  const { data: inbound = [] } = useInboundOrders();

  const items = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD');
    const all: UnifiedOrder[] = [
      ...outbound.map(toUnifiedOutbound),
      ...inbound.map(toUnifiedInbound),
    ];
    // 오늘 마감 예정 + 지연된 것 + 오늘 시작해야 할 것
    return all
      .filter((o) => OPEN_STATUSES.has(o.status) && o.expected_date && o.expected_date <= dayjs(today).add(3, 'day').format('YYYY-MM-DD'))
      .sort((a, b) => a.expected_date.localeCompare(b.expected_date))
      .slice(0, 8);
  }, [outbound, inbound]);

  const goDetail = (o: UnifiedOrder) => {
    navigate(o.kind === 'outbound' ? `/order/outbound/${o.id}` : `/order/inbound/${o.id}`);
  };

  const isOverdue = (d: string) => d < dayjs().format('YYYY-MM-DD');
  const isToday = (d: string) => d === dayjs().format('YYYY-MM-DD');

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <Target size={17} color="#1677ff" />
          <span>오늘 처리할 지시서</span>
        </Space>
      )}
      extra={<Button type="link" size="small" onClick={() => navigate('/order/incomplete')}>전체보기</Button>}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 12, flex: 1, overflowY: 'auto' } }}
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="오늘 처리할 지시서 없음" />
      ) : (
        <List
          size="small"
          dataSource={items}
          split={false}
          renderItem={(o) => {
            const overdue = isOverdue(o.expected_date);
            const today = isToday(o.expected_date);
            const priority = overdue ? 'overdue' : today ? 'urgent' : 'normal';
            const priorityColor = priority === 'overdue' ? '#ef4444' : priority === 'urgent' ? '#f59e0b' : '#64748b';
            const priorityLabel = priority === 'overdue' ? '지연' : priority === 'urgent' ? '긴급' : '일반';
            const statusCfg = ORDER_STATUS_CONFIG[o.status as keyof typeof ORDER_STATUS_CONFIG];
            return (
              <List.Item
                style={{ padding: '10px 8px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                onClick={() => goDetail(o)}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <Tag color={priorityColor === '#ef4444' ? 'red' : priorityColor === '#f59e0b' ? 'orange' : 'default'} style={{ margin: 0 }}>
                      {priorityLabel}
                    </Tag>
                    <Tag color={o.kind === 'outbound' ? 'purple' : 'cyan'} style={{ margin: 0 }}>
                      {o.kind === 'outbound' ? '출고' : '입고'}
                    </Tag>
                    <Text strong style={{ fontSize: 13 }}>{o.order_no}</Text>
                    {statusCfg && <Tag color={statusCfg.color} style={{ margin: 0 }}>{statusCfg.label}</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{o.kind === 'outbound' ? '출고처' : '협력사'}: <Text strong>{o.counterparty}</Text></span>
                    <span style={{ color: overdue ? '#ef4444' : '#475569' }}>예정일: {o.expected_date}</span>
                    {o.total_items != null && <span>품목 {o.total_items}종</span>}
                    {o.total_qty != null && <span>수량 {o.total_qty.toLocaleString()}</span>}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </Card>
  );
}
