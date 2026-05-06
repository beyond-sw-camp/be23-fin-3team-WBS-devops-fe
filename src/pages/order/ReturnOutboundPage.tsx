import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography, Steps, Table, Button, Space, Input, InputNumber, Tag, App, Card, Alert, Select,
} from 'antd';
import { ArrowLeftOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { InboundOrder, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import { useInboundOrders, useInboundItems, useInboundOrder } from '@/hooks/useInboundQuery';
import { useCreateReturnOutbound } from '@/hooks/useOrderQuery';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title, Text } = Typography;

interface ReturnRow {
  product_id: string;
  sku: string;
  product_name: string;
  received_qty: number;
  return_qty: number;
}

const REASON_OPTIONS = [
  { label: '입고 불량', value: '입고 불량' },
  { label: '잘못 받음', value: '잘못 받음' },
  { label: '사양 불일치', value: '사양 불일치' },
  { label: '기타', value: '기타' },
];

/**
 * 반품 출고 접수 — 우리가 받은 입고를 입고처(공급사)로 다시 돌려보내는 흐름.
 * ReturnInboundPage의 미러링: 출고지시서 → 입고지시서로 매칭 대상만 바뀜.
 *
 * 진입 경로:
 *  - 메뉴: /order/return-outbound (Step 1부터)
 *  - 입고지시서 상세: /order/return-outbound?inboundOrderId={id} (Step 1 자동 선택)
 */
export default function ReturnOutboundPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const initialInboundId = searchParams.get('inboundOrderId');

  const [step, setStep] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialInboundId);
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([]);
  const [reason, setReason] = useState<string>(REASON_OPTIONS[0].value);
  const [returnMethod, setReturnMethod] = useState<'courier' | 'pickup'>('courier');
  const [note, setNote] = useState('');

  const { data: inboundOrders = [], isLoading: ordersLoading } = useInboundOrders();
  const { data: selectedInboundOrder } = useInboundOrder(selectedOrderId ?? '');
  const { data: inboundItems = [] } = useInboundItems(selectedOrderId ?? '');
  const createReturnOutbound = useCreateReturnOutbound();

  // 검수가 끝난 입고지시서만 반품 가능 (received/placing/in_progress/completed/partial)
  const eligibleOrders = useMemo(
    () =>
      inboundOrders.filter((o) =>
        ['received', 'placing', 'in_progress', 'completed', 'partial'].includes(o.status),
      ),
    [inboundOrders],
  );

  const selectedOrder = inboundOrders.find((o) => o.id === selectedOrderId)
    ?? selectedInboundOrder; // 직접 진입 시 목록에 없을 수 있음

  // 입고지시서 선택 시 라인 자동 로드
  useEffect(() => {
    if (!selectedOrderId || inboundItems.length === 0) return;
    setReturnRows(
      inboundItems
        .filter((i) => (i.received_qty ?? 0) > 0)
        .map((i) => ({
          product_id: i.product_id ?? '',
          sku: i.sku ?? '-',
          product_name: i.product_name ?? '-',
          received_qty: i.received_qty ?? 0,
          return_qty: 0,
        })),
    );
  }, [selectedOrderId, inboundItems]);

  // URL ?inboundOrderId= 로 진입했고 데이터 로드 완료면 Step 2 자동 진입
  useEffect(() => {
    if (initialInboundId && returnRows.length > 0 && step === 0) {
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnRows.length]);

  const proceedToQty = () => {
    if (!selectedOrderId || returnRows.length === 0) {
      message.warning('검수된 수량이 있는 입고지시서를 선택하세요.');
      return;
    }
    setStep(1);
  };

  const proceedToInfo = () => {
    const hasQty = returnRows.some((r) => r.return_qty > 0);
    if (!hasQty) {
      message.warning('반품 수량을 1개 이상 입력하세요.');
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedOrder?.id) return;
    if (!selectedOrder.warehouse_id) {
      message.error('원본 입고지시서에 창고 정보가 없습니다.');
      return;
    }
    if (!selectedOrder.supplier_id) {
      message.error('원본 입고지시서에 입고처 정보가 없습니다.');
      return;
    }
    const items = returnRows
      .filter((r) => r.return_qty > 0)
      .map((r) => ({ productId: r.product_id, qty: r.return_qty }));

    try {
      const order = await createReturnOutbound.mutateAsync({
        inboundOrderId: selectedOrder.id,
        warehouseId: selectedOrder.warehouse_id,
        supplierId: selectedOrder.supplier_id,
        reason,
        returnMethod,
        note: note.trim() || undefined,
        items,
      });
      message.success('반품 출고 지시서가 생성되었습니다.');
      navigate(`/order/outbound/${order.id}`);
    } catch (err) {
      message.error(extractApiErrorMessage(err, '반품 출고 생성 실패'));
    }
  };

  const totalReturnQty = returnRows.reduce((s, r) => s + r.return_qty, 0);

  // ── Step 1: 입고지시서 선택 ──
  const orderColumns: ColumnsType<InboundOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 140 },
    { title: '입고처', dataIndex: 'vendor_name', key: 'vendor_name', width: 140 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
    { title: '입고예정일', dataIndex: 'expected_date', key: 'expected_date', width: 110 },
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
      title: '검수수량', dataIndex: 'received_qty', key: 'received_qty', width: 100, align: 'right',
      render: (v) => v.toLocaleString(),
    },
    {
      title: '반품 수량', key: 'return_qty', width: 150, align: 'right',
      render: (_, record, idx) => (
        <InputNumber
          size="small"
          min={0}
          max={record.received_qty}
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
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>뒤로</Button>
        <Title level={4} style={{ margin: 0 }}>반품 출고 접수</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          입고처에 다시 보낼 상품을 선택합니다 (입고불량/오배송 등)
        </Text>
      </div>

      <Steps
        current={step}
        style={{ marginBottom: 24, maxWidth: 720 }}
        items={[
          { title: '입고지시서 선택' },
          { title: '반품 수량 입력' },
          { title: '사유 · 발송 방식' },
        ]}
      />

      {step === 0 && (
        <Card>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              검수가 완료된 입고지시서 중 반품할 건을 선택하세요.
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
              onChange: (_, rows) => setSelectedOrderId(rows[0]?.id ?? null),
            }}
          />
          {selectedOrder && returnRows.length > 0 && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 12 }}
              message={`${selectedOrder.order_no} — ${selectedOrder.vendor_name} (${returnRows.length}개 품목)`}
            />
          )}
          <div style={{ marginTop: 16, textAlign: 'right' }}>
            <Button type="primary" disabled={!selectedOrderId || returnRows.length === 0} onClick={proceedToQty}>
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
              <Text type="secondary">{selectedOrder?.vendor_name}</Text>
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
              다음: 사유 · 발송 방식
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>반품 사유</div>
                <Select
                  style={{ width: 240 }}
                  value={reason}
                  onChange={setReason}
                  options={REASON_OPTIONS}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>발송 방식</div>
                <Select
                  style={{ width: 240 }}
                  value={returnMethod}
                  onChange={setReturnMethod}
                  options={[
                    { label: '택배 발송', value: 'courier' },
                    { label: '입고처 회수', value: 'pickup' },
                  ]}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>비고 (선택)</div>
                <Input.TextArea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 액정 깨짐 5대, 케이블 단선 3개"
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
                <strong>{totalReturnQty}</strong>개를{' '}
                <strong>{selectedOrder?.vendor_name}</strong>에 반품
              </span>
            }
          />

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={() => setStep(1)}>이전</Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={createReturnOutbound.isPending}
              onClick={handleSubmit}
            >
              반품 출고 생성
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
