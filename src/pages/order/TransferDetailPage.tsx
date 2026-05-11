import { useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Table, Card, Descriptions, Steps, Button, Space, Tag, App, Result, Spin,
  InputNumber, Popover, Row, Col, Tooltip, Dropdown, Drawer,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, SwapOutlined, PlayCircleOutlined, PrinterOutlined, QrcodeOutlined,
  InboxOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined, EnvironmentOutlined,
  DownOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { useReactToPrint } from 'react-to-print';
import type { ColumnsType } from 'antd/es/table';
import type { TransferOrderItem, TransferOrderStatus, TransferItemStatus } from '@/types/order';
import {
  useTransferOrder, useTransferItems, useApproveTransfer, useCompleteTransfer, useProcessTransferItem,
} from '@/hooks/useOrderQuery';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import OrderQrBadge from '@/components/OrderQrBadge';
import PrintDocument from '@/components/PrintDocument';
import PermissionButton from '@/components/PermissionButton';
import InventoryTransactionPanel from '@/components/InventoryTransactionPanel';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { extractApiErrorMessage, isCapacityExceededError } from '@/utils/apiError';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

const { Title } = Typography;

/** 표시용 — 긴 위치 코드(`LC-RK-...-LEH-002-02`)에서 끝 3토큰만 노출 (`LEH-002-02`) */
function locationOnly(raw: string | null | undefined): string {
  if (!raw || raw === '-') return '-';
  const parts = String(raw).split('-').filter(Boolean);
  if (parts.length <= 3) return raw;
  return parts.slice(-3).join('-');
}

const STATUS_CONFIG: Record<TransferOrderStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '초안' },
  approved: { color: 'processing', label: '승인' },
  in_progress: { color: 'warning', label: '이동중' },
  completed: { color: 'success', label: '완료' },
  partial: { color: 'orange', label: '부분완료' },
  cancelled: { color: 'error', label: '취소' },
};

const ITEM_STATUS: Record<TransferItemStatus, { color: string; label: string }> = {
  pending: { color: '#94a3b8', label: '대기' },
  in_progress: { color: '#1677ff', label: '진행중' },
  completed: { color: '#52c41a', label: '완료' },
  shortage: { color: '#f59e0b', label: '부족' },
};
const tableHeaderTitle = (label: string) => (
  <span style={{ color: '#334155', fontWeight: 600, fontSize: 12, letterSpacing: '0.01em' }}>{label}</span>
);
const tableHeaderCellStyle: React.CSSProperties = {
  background: '#f8fafc',
  color: '#334155',
  borderBottom: '2px solid #dbe3ee',
  borderRight: 'none',
};

const stepItems = [
  { title: '초안', description: '이동 지시서 등록' },
  { title: '승인', description: '이동 지시 승인' },
  { title: '이동중', description: '출발지 → 도착지 작업' },
  { title: '완료', description: '이동 마감' },
];
const statusToStep: Record<string, number> = {
  draft: 0, approved: 1, in_progress: 2, completed: 3, partial: 3, cancelled: -1,
};

const statIcon = (color: string) => ({
  width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, color, background: `${color}14`, border: `1px solid ${color}22`,
});

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? '';
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId && orderId ? `/topic/admin/transfer/${clientId}/${orderId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['transfer-order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['transfer-items', orderId] });
      queryClient.invalidateQueries({ queryKey: ['transfer-orders'] });
      showStompToast(message, event);
    },
  );

  const { data: order, isLoading } = useTransferOrder(orderId);
  const { data: items = [], isLoading: itemsLoading } = useTransferItems(orderId);
  const approveMutation = useApproveTransfer();
  const completeMutation = useCompleteTransfer();
  const processMutation = useProcessTransferItem();
  const printRef = useRef<HTMLDivElement>(null);
  const userMap = useUserNameMap();

  // 출발/도착 창고의 랙 데이터로 location_id → location_code 매핑 — BE가 코드를 안 내려주는 fallback
  const { data: fromInv } = useInventoryByRack(order?.from_warehouse_id ?? null);
  const { data: toInv } = useInventoryByRack(order?.to_warehouse_id ?? null);
  const locationCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    fromInv?.racks.forEach((rack) => rack.locations.forEach((loc) => map.set(loc.location_id, loc.location_code)));
    toInv?.racks.forEach((rack) => rack.locations.forEach((loc) => map.set(loc.location_id, loc.location_code)));
    return map;
  }, [fromInv, toInv]);

  // 품목별 처리 입력 상태
  const [processInput, setProcessInput] = useState<Record<string, { goodQty: number; defectQty: number }>>({});
  const [txDrawerOpen, setTxDrawerOpen] = useState(false);

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === 'completed').length;
    const progress = items.filter((i) => i.status === 'in_progress').length;
    const pending = items.filter((i) => i.status === 'pending').length;
    return { total, done, progress, pending };
  }, [items]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: () => `이동지시서_${order?.order_no ?? orderId}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
    onBeforePrint: () => new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }),
    onPrintError: (_loc, err) => { message.error(err?.message || '인쇄를 시작할 수 없습니다.'); },
  });

  if (isLoading || itemsLoading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  if (!order) return <Result status="404" title="지시서를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/order/transfer')}>목록으로</Button>} />;

  const status = order.status;
  const resolveUser = (uid: string | null | undefined) => resolveUserName(userMap, uid);
  const canProcess = status === 'approved' || status === 'in_progress';
  const currentStep = statusToStep[status] ?? 0;
  const tableScrollY = items.length > 6 ? 360 : undefined;

  const handleApprove = () => {
    modal.confirm({ title: '승인하시겠습니까?', onOk: () => approveMutation.mutateAsync(orderId).then(() => message.success('승인 완료')) });
  };

  const handleProcessItem = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    // processInput 에 값이 없으면 테이블에 기본 노출되는 값(지시수량·0)을 사용한다
    const input = processInput[itemId] ?? { goodQty: item?.ordered_qty ?? 0, defectQty: 0 };
    if (input.goodQty === 0 && input.defectQty === 0) {
      message.warning('이동 수량을 입력하세요.');
      return;
    }
    processMutation.mutate(
      { itemId, goodQty: input.goodQty, defectQty: input.defectQty },
      {
        onSuccess: () => { message.success('처리 완료'); setProcessInput((p) => { const n = { ...p }; delete n[itemId]; return n; }); },
        onError: (err) => {
          const msg = extractApiErrorMessage(err, '이동 처리에 실패했습니다.');
          message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
        },
      },
    );
  };

  const handleComplete = () => {
    const pending = items.filter((i) => i.status === 'pending');
    if (pending.length > 0) {
      modal.confirm({
        title: '미처리 품목이 있습니다',
        content: `${pending.length}건의 미처리 품목이 있습니다. 부분완료 처리하시겠습니까?`,
        onOk: () => completeMutation.mutateAsync(orderId)
          .then(() => message.success('이동 마감'))
          .catch((err) => {
            const msg = extractApiErrorMessage(err, '이동 마감에 실패했습니다.');
            message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
            throw err;
          }),
      });
    } else {
      completeMutation.mutate(orderId, {
        onSuccess: () => message.success('이동 완료'),
        onError: (err) => {
          const msg = extractApiErrorMessage(err, '이동 완료에 실패했습니다.');
          message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
        },
      });
    }
  };

  const columns: ColumnsType<TransferOrderItem> = [
    {
      title: tableHeaderTitle('상품'), key: 'product', width: 260,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => (
        <div style={{ lineHeight: 1.5 }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: '#0f172a' }}>{r.product_name}</div>
        </div>
      ),
    },
    {
      title: tableHeaderTitle('로케이션 (출발 → 도착)'), key: 'location', width: 320,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        const fromFull = r.from_location_code ?? locationCodeMap.get(r.from_location_id) ?? '-';
        const toFull = r.to_location_code ?? locationCodeMap.get(r.to_location_id) ?? '-';
        const fromCode = locationOnly(fromFull);
        const toCode = locationOnly(toFull);
        const goLocation = (warehouseId: string | undefined, locationId: string, locationCode: string) => {
          if (!warehouseId || !locationId) return;
          const params = new URLSearchParams({ wh: warehouseId, tab: 'rack-inventory', locationId });
          if (locationCode && locationCode !== '-') params.set('locationCode', locationCode);
          navigate(`/warehouse/monitoring?${params.toString()}`);
        };
        return (
          <Space size={4} wrap={false}>
            <Tooltip title={fromFull}>
              <Tag color="blue" style={{ margin: 0, fontWeight: 600, fontSize: 12 }}>{fromCode}</Tag>
            </Tooltip>
            <Tooltip title="출발 위치 조회">
              <Button size="small" type="text" icon={<EnvironmentOutlined />}
                onClick={() => goLocation(order?.from_warehouse_id, r.from_location_id, fromFull)}
                disabled={!r.from_location_id} style={{ color: '#1677ff' }} />
            </Tooltip>
            <span style={{ color: '#cbd5e1', fontSize: 12 }}>→</span>
            <Tooltip title={toFull}>
              <Tag color="blue" style={{ margin: 0, fontWeight: 600, fontSize: 12 }}>{toCode}</Tag>
            </Tooltip>
            <Tooltip title="도착 위치 조회">
              <Button size="small" type="text" icon={<EnvironmentOutlined />}
                onClick={() => goLocation(order?.to_warehouse_id, r.to_location_id, toFull)}
                disabled={!r.to_location_id} style={{ color: '#1677ff' }} />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: tableHeaderTitle('지시수량'), dataIndex: 'ordered_qty', key: 'ordered_qty', width: 100, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => <span style={{ fontWeight: 500, color: '#334155' }}>{v.toLocaleString()}</span>,
    },
    {
      title: tableHeaderTitle('처리수량'), dataIndex: 'processed_qty', key: 'processed_qty', width: 100, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => <span style={{ fontWeight: 500, color: '#1677ff' }}>{(v ?? 0).toLocaleString()}</span>,
    },
    {
      title: tableHeaderTitle('불량'), dataIndex: 'defect_qty', key: 'defect_qty', width: 70, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => v > 0 ? <span style={{ color: '#ef4444', fontWeight: 500 }}>{v}</span> : <span style={{ color: '#e2e8f0' }}>0</span>,
    },
    {
      title: tableHeaderTitle('상태'), dataIndex: 'status', key: 'status', width: 80, align: 'center',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: TransferItemStatus) => {
        const cfg = ITEM_STATUS[v] ?? { color: '#94a3b8', label: v ?? '-' };
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, color: cfg.color, background: `${cfg.color}12` }}>{cfg.label}</span>;
      },
    },
    ...(canProcess ? [{
      title: tableHeaderTitle('이동 처리'), key: 'process', width: 280,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_: unknown, record: TransferOrderItem) => {
        if (record.status !== 'pending') return <Tag>처리됨</Tag>;
        const input = processInput[record.id] ?? { goodQty: record.ordered_qty, defectQty: 0 };
        return (
          <Space size={4}>
            <InputNumber size="small" min={0} max={record.ordered_qty} value={input.goodQty}
              onChange={(v) => setProcessInput((p) => ({ ...p, [record.id]: { ...input, goodQty: Number(v ?? 0) } }))}
              addonBefore="정상" style={{ width: 110 }} />
            <InputNumber size="small" min={0} max={record.ordered_qty} value={input.defectQty}
              onChange={(v) => setProcessInput((p) => ({ ...p, [record.id]: { ...input, defectQty: Number(v ?? 0) } }))}
              addonBefore="불량" style={{ width: 110 }} />
            <Button size="small" type="primary" icon={<PlayCircleOutlined />}
              onClick={() => handleProcessItem(record.id)} loading={processMutation.isPending}>
              처리
            </Button>
          </Space>
        );
      },
    }] : []),
  ];

  return (
    <>
      <div className="no-print" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18, gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: 8, minWidth: 0 }}>
            <Space size={8} align="center" style={{ minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
              <Tooltip title="목록으로">
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/order/transfer')} />
              </Tooltip>
              <Tooltip title="이동지시서">
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: '#6366f1',
                    fontSize: 13,
                    padding: '3px 7px',
                    borderRadius: 4,
                    background: '#eef2ff',
                    border: '1px solid #c7d2fe',
                    flexShrink: 0,
                  }}
                >
                  <SwapOutlined style={{ fontSize: 13 }} />
                </span>
              </Tooltip>
              <Title level={4} style={{ margin: 0, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.order_no}</Title>
              <Tag color={STATUS_CONFIG[status]?.color} style={{ flexShrink: 0 }}>{STATUS_CONFIG[status]?.label}</Tag>
              <Popover content={<OrderQrBadge value={`transfer:${order.id}`} label={order.order_no} title="이동 지시서" size={160} />} trigger="click" placement="bottomLeft">
                <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b', fontSize: 18, flexShrink: 0 }} />
              </Popover>
            </Space>

            <Space size={6} wrap style={{ flexShrink: 0 }}>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'order',
                      icon: <PrinterOutlined />,
                      label: '이동지시서 출력',
                      onClick: () => {
                        if (!printRef.current) { message.warning('잠시 후 다시 시도해 주세요.'); return; }
                        void handlePrint();
                      },
                    },
                  ],
                }}
              >
                <Button icon={<PrinterOutlined />}>출력 <DownOutlined /></Button>
              </Dropdown>

              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'tx',
                      icon: <HistoryOutlined />,
                      label: '재고 이력',
                      onClick: () => setTxDrawerOpen(true),
                    },
                  ],
                }}
              >
                <Button>더보기 <DownOutlined /></Button>
              </Dropdown>

              {status === 'draft' && (
                <PermissionButton resource="TRANSFER" action="APPROVE" type="primary" icon={<CheckOutlined />} onClick={handleApprove} loading={approveMutation.isPending}>승인</PermissionButton>
              )}
              {canProcess && (
                <PermissionButton resource="TRANSFER" action="UPDATE" type="primary" icon={<SwapOutlined />} onClick={handleComplete} loading={completeMutation.isPending}>이동 마감</PermissionButton>
              )}
            </Space>
          </div>
        </div>

        {/* ── 정보 카드 ── */}
        <Card size="small" style={{ marginBottom: 20, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="출발 창고">{order.from_warehouse_name}</Descriptions.Item>
            <Descriptions.Item label="도착 창고">{order.to_warehouse_name}</Descriptions.Item>
            <Descriptions.Item label="예정일">{order.expected_date ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="비고">{order.note ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="생성자">{resolveUser(order.created_by)}</Descriptions.Item>
            <Descriptions.Item label="승인자">{resolveUser(order.approved_by)}</Descriptions.Item>
            <Descriptions.Item label="승인일시">{order.approved_at ? dayjs(order.approved_at).format('MM-DD HH:mm') : '-'}</Descriptions.Item>
          </Descriptions>
        </Card>

        <div style={{ marginBottom: 24 }}>
          <Steps current={currentStep} items={stepItems} size="small" responsive style={{ marginBottom: 0 }} />
        </div>

        {/* ── 요약 카드 ── */}
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: '총 품목', value: stats.total, color: '#334155', icon: <InboxOutlined /> },
            { title: '처리 완료', value: stats.done, color: '#52c41a', icon: <CheckCircleOutlined /> },
            { title: '진행중', value: stats.progress, color: '#1677ff', icon: <ClockCircleOutlined /> },
            { title: '대기', value: stats.pending, color: stats.pending > 0 ? '#f59e0b' : '#cbd5e1', icon: <WarningOutlined /> },
          ].map((c) => (
            <Col span={6} key={c.title}>
              <Card size="small" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={statIcon(c.color)}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{c.title}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{c.value}</div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* ── 품목 테이블 ── */}
        <div style={{ marginTop: 56, paddingBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>상품 내역</span>
            <div style={{ height: 1, background: '#e2e8f0', flex: 1 }} />
          </div>
          <Table columns={columns} dataSource={items} rowKey="id" size="middle" pagination={false}
            scroll={tableScrollY ? { y: tableScrollY } : undefined}
            rowClassName={(r) => r.status === 'completed' ? 'trow-done' : r.status === 'in_progress' ? 'trow-progress' : ''}
            onRow={() => ({ style: { height: 56 } })} />
        </div>

      </div>

      <Drawer
        title="이동 재고 변동 이력"
        placement="right"
        width={820}
        open={txDrawerOpen}
        onClose={() => setTxDrawerOpen(false)}
        destroyOnHidden
      >
        <InventoryTransactionPanel refId={orderId} refType="transfer_order" title="이동 재고 변동 이력" />
      </Drawer>

      <div className="print-only">
        <PrintDocument
          ref={printRef}
          title="이동 지시서"
          subtitle={`${order.from_warehouse_name} → ${order.to_warehouse_name}`}
          orderNo={order.order_no}
          qrValue={`transfer:${order.id}`}
          documentOperator={resolveUser(order.created_by)}
          info={[
            { label: '출발 창고', value: order.from_warehouse_name },
            { label: '도착 창고', value: order.to_warehouse_name },
            { label: '예정일', value: order.expected_date ?? '-' },
            { label: '상태', value: STATUS_CONFIG[status]?.label ?? status },
            { label: '생성자', value: resolveUser(order.created_by) },
            { label: '승인자', value: resolveUser(order.approved_by) },
            { label: '비고', value: order.note ?? '-' },
          ]}
          columns={[
            { label: 'No', key: 'no', align: 'center', width: 36 },
            { label: '상품', key: 'product_name' },
            { label: '출발 로케이션', key: 'from_location', width: 110 },
            { label: '도착 로케이션', key: 'to_location', width: 110 },
            { label: '지시수량', key: 'ordered_qty', numeric: true, width: 80, bold: true },
            { label: '처리수량', key: 'processed_qty', numeric: true, width: 80 },
          ]}
          data={items.map((i, idx) => ({
            no: idx + 1,
            product_name: i.product_name,
            from_location: i.from_location_code ?? locationCodeMap.get(i.from_location_id) ?? '-',
            to_location: i.to_location_code ?? locationCodeMap.get(i.to_location_id) ?? '-',
            ordered_qty: i.ordered_qty,
            processed_qty: i.processed_qty,
          }))}
          footer={{
            left: `총 ${items.length}개 품목`,
            right: `지시수량 합계: ${items.reduce((a, i) => a + (i.ordered_qty ?? 0), 0).toLocaleString()}`,
          }}
          signatureLabels={['담당자', '승인자']}
        />
      </div>

      <style>{`
        .trow-done td { background: #f0fdf4 !important; }
        .trow-progress td { background: #eff6ff !important; }
        .ant-table-thead > tr > th { background: #f8fafc !important; color: #475569 !important; font-weight: 600 !important; font-size: 12px !important; }
        .print-only { display: none; }
        @media print { .no-print { display: none !important; } .print-only { display: block !important; } }
      `}</style>
    </>
  );
}
