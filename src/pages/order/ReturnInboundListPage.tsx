import { useNavigate } from 'react-router-dom';
import { Typography, Table, Space, Tag, Button, Empty } from 'antd';
import { PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { InboundOrder, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import { useInboundOrders } from '@/hooks/useInboundQuery';

const { Title, Text } = Typography;

/**
 * 반품 입고 목록 — InboundOrder 중 originType='return' 만 표시.
 * 행 클릭 시 일반 InboundDetailPage 로 이동 (반품 컨텍스트는 거기서 표시).
 */
export default function ReturnInboundListPage() {
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = useInboundOrders({ originType: 'return' });

  const columns: ColumnsType<InboundOrder> = [
    {
      title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 160,
      render: (v: string) => (
        <Space size={4}>
          <span>{v}</span>
          <Tag color="volcano" style={{ margin: 0 }}>반품</Tag>
        </Space>
      ),
    },
    {
      title: '원본 출고지시서', dataIndex: 'return_from', key: 'return_from', width: 160,
      render: (v?: string | null) => v || <Text type="secondary">-</Text>,
    },
    { title: '입고처', dataIndex: 'vendor_name', key: 'vendor_name', width: 140 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    { title: '입고예정일', dataIndex: 'expected_date', key: 'expected_date', width: 110, align: 'center' },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v]?.color}>{ORDER_STATUS_CONFIG[v]?.label}</Tag>,
    },
    { title: '품목수', dataIndex: 'total_items', key: 'total_items', width: 70, align: 'center' },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80, align: 'right', render: (v?: number) => v?.toLocaleString() ?? '-' },
  ];

  return (
    <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>반품 입고 목록</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>거래처가 반품한 입고지시서</Text>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate('/order/return-inbound')}
        >
          반품 입고 접수
        </Button>
      </div>

      {orders.length === 0 && !isLoading ? (
        <Empty
          image={<RollbackOutlined style={{ fontSize: 48, color: '#cbd5e1' }} />}
          imageStyle={{ height: 60 }}
          description={
            <div>
              <div style={{ fontSize: 14, color: '#1e2a3a', marginBottom: 4 }}>아직 반품 입고가 없습니다</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>거래처에서 반품이 들어오면 여기에 표시됩니다.</div>
            </div>
          }
          style={{ marginTop: 80 }}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/order/return-inbound')}>
            반품 입고 접수
          </Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={isLoading}
          size="middle"
          onRow={(r) => ({
            onClick: () => navigate(`/order/inbound/${r.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      )}
    </div>
  );
}
