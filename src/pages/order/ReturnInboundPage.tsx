import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Steps, Table, Button, Space, Select, Input, InputNumber, Tag, App, Card, Alert,
} from 'antd';
import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { OutboundOrder, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import { useOutboundOrders, useOutboundItems } from '@/hooks/useOrderQuery';
import { useCreateFromReturn } from '@/hooks/useInboundQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';

const { Title, Text } = Typography;

interface ReturnRow {
  product_id: string;
  sku: string;
  product_name: string;
  ordered_qty: number;
  return_qty: number;
}

export default function ReturnInboundPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();

  const [step, setStep] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const { data: outboundOrders = [], isLoading: ordersLoading } = useOutboundOrders();
  const { data: outboundItems = [] } = useOutboundItems(selectedOrderId ?? '');
  const { data: warehouses = [] } = useWarehouses();
  const createReturn = useCreateFromReturn();

  // completed/partial 상태인 출고 지시서만 반품 가능
  const eligibleOrders = useMemo(
    () => outboundOrders.filter((o) => o.status === 'completed' || o.status === 'partial'),
    [outboundOrders],
  );

  const selectedOrder = eligibleOrders.find((o) => o.id === selectedOrderId);

  // Step 1 → Step 2: 출고 지시서 선택 후 품목 로드
  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
  };

  const proceedToQty = () => {
    if (!selectedOrderId || outboundItems.length === 0) return;
    setReturnRows(
      outboundItems
        .filter((i) => i.picked_qty > 0)
        .map((i) => ({
          product_id: i.product_id ?? '',
          sku: i.sku,
          product_name: i.product_name,
          ordered_qty: i.picked_qty,
          return_qty: 0,
        })),
    );
    setStep(1);
  };

  // Step 2 → Step 3
  const proceedToInfo = () => {
    const hasQty = returnRows.some((r) => r.return_qty > 0);
    if (!hasQty) {
      message.warning('반품 수량을 1개 이상 입력하세요.');
      return;
    }
    setStep(2);
  };

  // Step 3 → Submit
  const handleSubmit = async () => {
    if (!selectedOrderId || !warehouseId) {
      message.warning('창고를 선택하세요.');
      return;
    }
    const items = returnRows
      .filter((r) => r.return_qty > 0)
      .map((r) => ({ productId: r.product_id, qty: r.return_qty }));

    try {
      const order = await createReturn.mutateAsync({
        outboundOrderId: selectedOrderId,
        warehouseId,
        reason: reason.trim() || undefined,
        items,
      });
      message.success('반품 입고 지시서가 생성되었습니다.');
      navigate(`/order/inbound/${order.id}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : '반품 접수 실패';
      message.error(detail);
    }
  };

  const totalReturnQty = returnRows.reduce((s, r) => s + r.return_qty, 0);

  // ── Step 1: 출고 지시서 선택 ──
  const orderColumns: ColumnsType<OutboundOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 140 },
    { title: '출고처', dataIndex: 'store_name', key: 'store_name', width: 140 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
    { title: '출고일', dataIndex: 'expected_date', key: 'expected_date', width: 110 },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center',
      render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v]?.color}>{ORDER_STATUS_CONFIG[v]?.label}</Tag>,
    },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80, align: 'right', render: (v) => v?.toLocaleString() ?? '-' },
  ];

  // ── Step 2: 반품 수량 입력 ──
  const qtyColumns: ColumnsType<ReturnRow> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    {
      title: '출고 수량', dataIndex: 'ordered_qty', key: 'ordered_qty', width: 100, align: 'right',
      render: (v) => v.toLocaleString(),
    },
    {
      title: '반품 수량', key: 'return_qty', width: 150, align: 'right',
      render: (_, record, idx) => (
        <InputNumber
          size="small"
          min={0}
          max={record.ordered_qty}
          value={record.return_qty}
          onChange={(v) => {
            setReturnRows((prev) =>
              prev.map((r, i) => (i === idx ? { ...r, return_qty: Number(v ?? 0) } : r)),
            );
          }}
          style={{ width: 110 }}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/order/inbound')}>입고 목록</Button>
        <Title level={4} style={{ margin: 0 }}>반품 입고 접수</Title>
      </div>

      <Steps
        current={step}
        style={{ marginBottom: 24, maxWidth: 720 }}
        items={[
          { title: '출고 지시서 선택' },
          { title: '반품 수량 입력' },
          { title: '창고 · 사유 입력' },
        ]}
      />

      {step === 0 && (
        <Card>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              완료/부분완료 상태인 출고 지시서 중 반품할 건을 선택하세요.
            </Text>
          </div>
          <Table
            columns={orderColumns}
            dataSource={eligibleOrders}
            rowKey="id"
            loading={ordersLoading}
            size="small"
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selectedOrderId ? [selectedOrderId] : [],
              onChange: (_, rows) => handleSelectOrder(rows[0]?.id ?? ''),
            }}
          />
          {selectedOrder && outboundItems.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={`${selectedOrder.order_no} — ${selectedOrder.store_name} (${outboundItems.length}개 품목)`}
            />
          )}
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" disabled={!selectedOrderId || outboundItems.length === 0} onClick={proceedToQty}>
              다음: 반품 수량 입력
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div style={{ marginBottom: 12 }}>
            <Space>
              <Tag color="blue">{selectedOrder?.order_no}</Tag>
              <Text type="secondary">{selectedOrder?.store_name}</Text>
            </Space>
          </div>
          <Table columns={qtyColumns} dataSource={returnRows} rowKey="sku" size="small" pagination={false} />
          <div style={{ marginTop: 12, fontSize: 13, color: '#1e2a3a' }}>
            반품 합계: <strong>{totalReturnQty}</strong>개
            {totalReturnQty === 0 && <Text type="danger" style={{ marginLeft: 8 }}>수량을 입력하세요</Text>}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(0)}>이전</Button>
            <Button type="primary" disabled={totalReturnQty === 0} onClick={proceedToInfo}>
              다음: 창고 · 사유
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>입고 창고</div>
                <Select
                  style={{ width: '100%', maxWidth: 400 }}
                  placeholder="반품 입고할 창고 선택"
                  value={warehouseId ?? undefined}
                  onChange={setWarehouseId}
                  options={warehouses.filter((w) => w.is_active).map((w) => ({
                    label: `${w.code} — ${w.name}`,
                    value: w.id,
                  }))}
                  showSearch
                  optionFilterProp="label"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>반품 사유 (선택)</div>
                <Input.TextArea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 고객 반품 — 상품 불량"
                  style={{ maxWidth: 500 }}
                />
              </div>
            </Space>
          </div>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <span>
                <strong>{selectedOrder?.order_no}</strong>에서{' '}
                <strong>{returnRows.filter((r) => r.return_qty > 0).length}</strong>개 품목{' '}
                <strong>{totalReturnQty}</strong>개 반품
              </span>
            }
          />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(1)}>이전</Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={createReturn.isPending}
              disabled={!warehouseId}
              onClick={handleSubmit}
            >
              반품 접수
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
