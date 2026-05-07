import { useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Table, Card, Descriptions, Steps, Button, Space, Tag, Modal, Popover,
  InputNumber, App, Result, Spin, Row, Col, Alert, Drawer, Tooltip, Dropdown,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, PrinterOutlined,
  InboxOutlined, WarningOutlined, CheckCircleOutlined,
  ClockCircleOutlined, QrcodeOutlined, ContainerOutlined, HistoryOutlined,
  CameraOutlined, ExclamationCircleOutlined, DownOutlined, CloseCircleOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useReactToPrint } from 'react-to-print';
import type { ColumnsType } from 'antd/es/table';
import { extractApiErrorMessage, isCapacityExceededError } from '@/utils/apiError';
import type { InboundOrderItem, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import {
  useInboundOrder, useInboundItems, useApproveInbound,
  useReceiveInbound, usePlacementOrders, useInboundReceipt, useCancelInbound,
} from '@/hooks/useInboundQuery';
import OrderQrBadge from '@/components/OrderQrBadge';
import PrintDocument from '@/components/PrintDocument';
import PermissionButton from '@/components/PermissionButton';
import InventoryTransactionPanel from '@/components/InventoryTransactionPanel';
import DefectEvidenceLightbox from '@/components/DefectEvidenceLightbox';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import { useDefectEvidenceLists } from '@/hooks/useDefectEvidenceQuery';
import { useAuth } from '@/hooks/useAuth';
import type { DefectEvidence } from '@/types/defectEvidence';
import dayjs from 'dayjs';

import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

const { Title, Text } = Typography;

const stepItems = [
  { title: '발주서 접수', description: '발주서 등록' },
  { title: '승인', description: '입고 지시 승인' },
  { title: '입고 확정', description: '수량·불량·LOT 검수' },
  { title: '적치 중', description: '보관 위치 이동' },
  { title: '적치 완료', description: '확정 재고' },
];
const statusToStep: Record<string, number> = {
  draft: 0, approved: 1, received: 2, in_progress: 2, placing: 3, completed: 4, partial: 4,
};

/* ── 검수 입력 row ── */
interface ReceiveFormRow {
  item_id: string; sku: string; product_name: string; ordered_qty: number;
  qty: number; defective: number;
}

function rowStatus(r: { ordered_qty: number; received_qty: number; defective_qty: number }): 'done' | 'partial' | 'pending' {
  const total = r.received_qty + r.defective_qty;
  if (total >= r.ordered_qty) return 'done';
  if (total > 0) return 'partial';
  return 'pending';
}
const STATUS_CFG: Record<string, { color: string; label: string }> = {
  done: { color: '#52c41a', label: '완료' },
  partial: { color: '#1677ff', label: '검수중' },
  pending: { color: '#94a3b8', label: '검수전' },
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

const statIcon = (color: string) => ({
  width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, color, background: `${color}14`, border: `1px solid ${color}22`,
});

export default function InboundDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId && id ? `/topic/admin/inbound/${clientId}/${id}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['inbound-order', id] });
      queryClient.invalidateQueries({ queryKey: ['inbound-items', id] });
      queryClient.invalidateQueries({ queryKey: ['inbound-receipt', id] });
      queryClient.invalidateQueries({ queryKey: ['inbound-orders'] });
      showStompToast(message, event);
    },
  );

  const { data: order, isLoading: orderLoading } = useInboundOrder(id);
  const { data: items = [], isLoading: itemsLoading } = useInboundItems(id);
  const { data: placementOrders = [] } = usePlacementOrders(id);
  const receiptEnabled = !!order && !['draft', 'approved', 'cancelled'].includes(order.status);
  const { data: receipt } = useInboundReceipt(id, receiptEnabled);
  const approveMutation = useApproveInbound();
  const receiveMutation = useReceiveInbound();
  const cancelMutation = useCancelInbound();

  const handleCancel = () => {
    if (!order) return;
    modal.confirm({
      title: `${order.order_no} 입고지시서를 취소할까요?`,
      content: '취소 후에는 되돌릴 수 없습니다. 초안/승인 상태에서만 취소 가능합니다.',
      okText: '취소 처리',
      cancelText: '닫기',
      okButtonProps: { danger: true },
      onOk: () => cancelMutation.mutateAsync(order.id)
        .then(() => message.success('입고지시서가 취소되었습니다.'))
        .catch((err: unknown) => {
          const msg = (err as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
            ?? '취소 처리에 실패했습니다.';
          message.error(msg);
        }),
    });
  };

  // ── 입고 확정 모달 ──
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveRows, setReceiveRows] = useState<ReceiveFormRow[]>([]);

  const [txDrawerOpen, setTxDrawerOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const receiptPrintRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: () => `입고지시서_${order?.order_no ?? id}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
    onBeforePrint: () => new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }),
    onPrintError: (_loc, err) => { message.error(err?.message || '인쇄를 시작할 수 없습니다.'); },
  });
  const status: OrderStatus = order?.status ?? 'draft';
  const userMap = useUserNameMap();
  const resolveUser = (id: string | null | undefined) => resolveUserName(userMap, id);
  const displayItems = items;
  const totalAmount = displayItems.reduce((s, i) => s + i.ordered_qty * i.unit_price, 0);
  const receiptItems = useMemo(() => receipt?.items ?? [], [receipt]);
  const receiptTotals = useMemo(() => {
    return receiptItems.reduce(
      (acc, item) => {
        const qty = item.qty ?? 0;
        if (item.item_condition === 'defect') acc.defectQty += qty;
        else acc.normalQty += qty;
        acc.amount += qty * (item.unit_price ?? 0);
        return acc;
      },
      { normalQty: 0, defectQty: 0, amount: 0 },
    );
  }, [receiptItems]);

  // 불량 증빙 사진 — receipt 행의 order_item_id를 source로 일괄 fetch
  const orderItemIds = useMemo(
    () => Array.from(new Set(receiptItems.map((it) => it.order_item_id).filter(Boolean))),
    [receiptItems],
  );
  const evidenceQueries = useDefectEvidenceLists('INBOUND_ORDER_ITEM', orderItemIds);
  const evidenceByOrderItemId = useMemo(() => {
    const map = new Map<string, DefectEvidence[]>();
    orderItemIds.forEach((id, idx) => {
      const list = evidenceQueries[idx]?.data ?? [];
      map.set(id, list);
    });
    return map;
    // 가변 길이 spread 는 deps 길이가 매번 바뀌어 React 가 메모이제이션을 신뢰 못 함 → 매 렌더마다 재실행.
    // 고정 길이(2) 단일 문자열 dep 로 변환:
    //   - orderItemIds.join(',') : id 집합 변경 감지
    //   - dataUpdatedAt 은 react-query 가 응답 갱신 때마다 바뀌는 timestamp → 변경 감지에 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    orderItemIds.join(','),
    evidenceQueries.map((q) => q.dataUpdatedAt ?? 0).join(','),
  ]);

  // 사진 라이트박스 상태
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxEvidences, setLightboxEvidences] = useState<DefectEvidence[]>([]);
  const [lightboxTitle, setLightboxTitle] = useState<string>('');

  const { currentRole } = useAuth();
  const canDeleteEvidence =
    currentRole === 'DEVELOPER' || currentRole === 'ADMIN' || currentRole === 'MANAGER';

  const openLightbox = (evidences: DefectEvidence[], title: string) => {
    setLightboxEvidences(evidences);
    setLightboxTitle(title);
    setLightboxOpen(true);
  };

  const currentStep = statusToStep[status] ?? 0;
  const tableScrollY = displayItems.length > 6 ? 360 : undefined;

  // SKU별 적치 중 불량 수량 집계 (is_defect=false 레코드의 defect_qty 합계)
  const placingDefectBySku = useMemo(() => {
    const map = new Map<string, number>();
    placementOrders.flatMap((po) => po.items).forEach((p) => {
      if (!p.is_defect) {
        map.set(p.sku, (map.get(p.sku) ?? 0) + (p.defect_qty ?? 0));
      }
    });
    return map;
  }, [placementOrders]);

  const stats = useMemo(() => {
    const total = displayItems.length;
    const done = displayItems.filter((r) => (r.received_qty + r.defective_qty) >= r.ordered_qty).length;
    const partial = displayItems.filter((r) => {
      const t = r.received_qty + r.defective_qty;
      return t > 0 && t < r.ordered_qty;
    }).length;
    const inspectDefect = displayItems.reduce((s, r) => s + r.defective_qty, 0);
    const placingDefect = [...placingDefectBySku.values()].reduce((s, n) => s + n, 0);
    // 수량 부족: 검수가 종료된 상태(partial/completed)에서만 의미 있음
    const isInspectionDone = status === 'partial' || status === 'completed';
    const shortageItems = isInspectionDone
      ? displayItems.filter((r) => (r.received_qty + r.defective_qty) < r.ordered_qty).length
      : 0;
    const shortageQty = isInspectionDone
      ? displayItems.reduce((s, r) => s + Math.max(0, r.ordered_qty - (r.received_qty + r.defective_qty)), 0)
      : 0;
    return { total, done, pending: total - done - partial, partial, inspectDefect, placingDefect, shortageItems, shortageQty };
  }, [displayItems, placingDefectBySku, status]);

  if (orderLoading || itemsLoading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  if (!order) return <Result status="404" title="지시서를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/order/inbound')}>목록으로</Button>} />;

  // ── 승인 ──
  const handleApprove = () => {
    modal.confirm({ title: '승인하시겠습니까?', onOk: () => approveMutation.mutateAsync(id).then(() => message.success('승인 완료')) });
  };

  // ── 입고 확정 모달 열기 ──
  const openReceive = () => {
    setReceiveRows(displayItems.filter((i) => i.status !== 'completed').map((i) => ({
      item_id: i.id, sku: i.sku, product_name: i.product_name, ordered_qty: i.ordered_qty,
      qty: i.ordered_qty - i.received_qty, defective: 0,
    })));
    setReceiveOpen(true);
  };

  const handleReceive = () => {
    // UI 'qty' = 총 검수 수량, BE 계약은 qty=정상 / defective=불량 이므로 정상분만 추출해서 전송
    const rows = receiveRows.map((r) => ({
      item_id: r.item_id,
      qty: Math.max(0, r.qty - r.defective),
      defective: r.defective,
    }));
    // 음수 방지 & 초과 방지 간단 검증
    const invalid = receiveRows.find((r) => r.defective > r.qty);
    if (invalid) {
      message.warning(`${invalid.sku}: 불량 수량은 검수 수량을 넘을 수 없습니다.`);
      return;
    }
    receiveMutation.mutate(
      { orderId: id, rows },
      {
        onSuccess: () => { message.success('입고 확정 완료'); setReceiveOpen(false); },
        onError: (err) => {
          const msg = extractApiErrorMessage(err, '입고 확정에 실패했습니다.');
          message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
        },
      },
    );
  };

  const columns: ColumnsType<InboundOrderItem> = [
    {
      title: tableHeaderTitle('상품'), key: 'product', width: 280,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => (
        <div style={{ lineHeight: 1.5 }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: '#0f172a' }}>{r.product_name}</div>
          <Text style={{ fontSize: 11, color: '#94a3b8' }}>{r.sku}</Text>
        </div>
      ),
    },
    { title: tableHeaderTitle('지시수량'), dataIndex: 'ordered_qty', key: 'ordered_qty', width: 100, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => <span style={{ fontWeight: 500, color: '#334155' }}>{v.toLocaleString()}</span> },
    { title: tableHeaderTitle('정상수량'), key: 'received_qty', width: 100, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        const normal = (r.received_qty ?? 0) - (placingDefectBySku.get(r.sku) ?? 0);
        return <span style={{ fontWeight: 500, color: '#1677ff' }}>{normal.toLocaleString()}</span>;
      } },
    { title: tableHeaderTitle('불량'), key: 'defective_qty', width: 70, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        const total = r.defective_qty + (placingDefectBySku.get(r.sku) ?? 0);
        return total > 0 ? <span style={{ color: '#ef4444', fontWeight: 500 }}>{total}</span> : <span style={{ color: '#e2e8f0' }}>0</span>;
      } },
    { title: tableHeaderTitle('잔여'), dataIndex: 'remaining_qty', key: 'remaining_qty', width: 70, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => v > 0 ? <span style={{ color: '#f59e0b', fontWeight: 500 }}>{v}</span> : <span style={{ color: '#e2e8f0' }}>0</span> },
    {
      title: tableHeaderTitle('상태'), key: 'st', width: 80, align: 'center',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        const s = rowStatus(r); const cfg = STATUS_CFG[s];
        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, color: cfg.color, background: `${cfg.color}12` }}>{cfg.label}</span>;
      },
    },
  ];

  return (
    <>
      <div className="no-print" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18, gap: 6 }}>
          {/* 헤더 줄: 좌(식별 정보) + 우(액션 버튼) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: 8, minWidth: 0 }}>
            <Space size={8} align="center" style={{ minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
              <Tooltip title="목록으로">
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/order/inbound')} />
              </Tooltip>
              <Tooltip title="입고지시서">
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: '#0891b2',
                    fontSize: 13,
                    padding: '3px 7px',
                    borderRadius: 4,
                    background: '#ecfeff',
                    border: '1px solid #a5f3fc',
                    flexShrink: 0,
                  }}
                >
                  <InboxOutlined style={{ fontSize: 13 }} />
                </span>
              </Tooltip>
              <Title level={4} style={{ margin: 0, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.order_no}</Title>
              <Tag color={ORDER_STATUS_CONFIG[status]?.color} style={{ flexShrink: 0 }}>{ORDER_STATUS_CONFIG[status]?.label}</Tag>
              <Popover content={<OrderQrBadge value={`inbound:${order.id}`} label={order.order_no} title="입고 지시서" size={160} />} trigger="click" placement="bottomLeft">
                <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b', fontSize: 18, flexShrink: 0 }} />
              </Popover>
            </Space>

            <Space size={6} wrap style={{ flexShrink: 0 }}>
              {/* 출력 ▾ — 입고지시서 / 입고 전표 */}
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'order',
                      icon: <PrinterOutlined />,
                      label: '입고지시서 출력',
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

              {/* 더보기 ▾ — 재고 이력 / 반품 출고 */}
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'tx',
                      icon: <HistoryOutlined />,
                      label: '재고 이력',
                      onClick: () => setTxDrawerOpen(true),
                    },
                    ...(['received', 'placing', 'in_progress', 'completed', 'partial'].includes(status)
                      ? [{
                          key: 'return-outbound',
                          icon: <RollbackOutlined />,
                          label: '반품 출고 접수',
                          onClick: () => navigate(`/order/return-outbound?inboundOrderId=${id}`),
                        }]
                      : []),
                  ],
                }}
              >
                <Button>더보기 <DownOutlined /></Button>
              </Dropdown>

              {/* 상태별 메인 액션 (primary) */}
              {status === 'draft' && (
                <PermissionButton resource="INBOUND" action="APPROVE" type="primary" icon={<CheckOutlined />} onClick={handleApprove} loading={approveMutation.isPending}>승인</PermissionButton>
              )}
              {status === 'approved' && (
                <PermissionButton resource="INBOUND" action="UPDATE" type="primary" icon={<ContainerOutlined />} onClick={openReceive}>
                  입고 확정
                </PermissionButton>
              )}
              {(status === 'placing' || status === 'in_progress' || status === 'completed' || status === 'partial') && (
                <Button type="primary" onClick={() => navigate(`/order/inbound/${id}/placement`)}>적치 작업 보기</Button>
              )}
            </Space>
          </div>
        </div>

        {/* ── 반품 입고 표시 ── */}
        {order.source === 'return' && order.origin_id && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message={
              <span>
                반품 입고{order.return_from ? ` — 출고처: ${order.return_from}` : ''}{' · '}
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/order/outbound/${order.origin_id}`)}>
                  원본 출고지시서 보기
                </Button>
              </span>
            }
          />
        )}

        {/* ── 정보 + Steps ── */}
        <Card size="small" style={{ marginBottom: 20, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="입고처">{order.vendor_name}</Descriptions.Item>
            <Descriptions.Item label="창고">{order.warehouse_name}</Descriptions.Item>
            <Descriptions.Item label="입고예정일">{order.expected_date}</Descriptions.Item>
            <Descriptions.Item label="출처">
              {order.source === 'return' ? (
                <Space size={6}>
                  <Tag color="volcano" style={{ margin: 0 }}>반품</Tag>
                  {order.origin_no && <Text strong>{order.origin_no}</Text>}
                </Space>
              ) : order.source === 'purchase_order' ? (
                <Space size={6}>
                  <Tag color="blue" style={{ margin: 0 }}>발주서</Tag>
                  {order.origin_no && <Text strong>{order.origin_no}</Text>}
                </Space>
              ) : order.source === 'manual' ? (
                <Tag>수동 등록</Tag>
              ) : (order.source || '-')}
            </Descriptions.Item>
            <Descriptions.Item label="생성자">{resolveUser(order.created_by)}</Descriptions.Item>
            <Descriptions.Item label="승인자">{resolveUser(order.approved_by)}</Descriptions.Item>
            <Descriptions.Item label="승인일시">{order.approved_at ? dayjs(order.approved_at).format('MM-DD HH:mm') : '-'}</Descriptions.Item>
          </Descriptions>
        </Card>

        <div style={{ marginBottom: 24 }}>
          <Steps
            current={currentStep}
            items={stepItems}
            size="small"
            responsive
            style={{ marginBottom: 0 }}
          />
        </div>

        {/* ── 요약 카드 (진행 상황만) ── */}
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: '총 품목', value: stats.total, color: '#334155', icon: <InboxOutlined /> },
            { title: '검수 완료', value: stats.done, color: '#52c41a', icon: <CheckCircleOutlined /> },
            { title: '검수 중', value: stats.partial, color: stats.partial > 0 ? '#1677ff' : '#cbd5e1', icon: <ClockCircleOutlined /> },
            { title: '미검수', value: stats.pending, color: stats.pending > 0 ? '#f59e0b' : '#cbd5e1', icon: <WarningOutlined /> },
          ].map((c) => (
            <Col flex="1" key={c.title}>
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

        {/* ── 이슈 안내: 적치까지 끝난 최종 단계(partial/completed)에서만 노출 ── */}
        {(status === 'partial' || status === 'completed') && (stats.inspectDefect > 0 || stats.placingDefect > 0 || stats.shortageQty > 0) && (
          <div
            style={{
              marginBottom: 16,
              padding: '10px 14px 10px 12px',
              borderLeft: '4px solid #f59e0b',
              background: '#fffbeb',
              borderRadius: '0 6px 6px 0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <WarningOutlined style={{ color: '#d97706', fontSize: 16, marginTop: 1 }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>부분완료 — 정상 입고가 아닌 품목이 있습니다</span>
            </div>
            <Space size={12} wrap style={{ fontSize: 13, paddingLeft: 24 }}>
              {stats.inspectDefect > 0 && (
                <span><Text type="secondary">검수 불량</Text> <Text strong style={{ color: '#ef4444' }}>{stats.inspectDefect.toLocaleString()}개</Text></span>
              )}
              {stats.placingDefect > 0 && (
                <span><Text type="secondary">적치중 불량</Text> <Text strong style={{ color: '#ef4444' }}>{stats.placingDefect.toLocaleString()}개</Text></span>
              )}
              {stats.shortageQty > 0 && (
                <span><Text type="secondary">수량 부족</Text> <Text strong style={{ color: '#f59e0b' }}>{stats.shortageItems}품목 · {stats.shortageQty.toLocaleString()}개</Text></span>
              )}
            </Space>
          </div>
        )}

        {/* ── 품목 테이블 (위·아래 여백으로 상단 요약과 구분, 하단 스크롤 여유) ── */}
        <div style={{ marginTop: 56, paddingBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>상품 내역</span>
            <div style={{ height: 1, background: '#e2e8f0', flex: 1 }} />
          </div>
          <Table columns={columns} dataSource={displayItems} rowKey="id" size="middle" pagination={false}
            scroll={tableScrollY ? { y: tableScrollY } : undefined}
            rowClassName={(r) => { if (r.remaining_qty > 0) return 'irow-shortage'; const s = rowStatus(r); return s === 'done' ? 'irow-done' : s === 'partial' ? 'irow-partial' : ''; }}
            onRow={() => ({ style: { height: 56 } })} />
        </div>

        {/* ── 검수 결과 (입고 전표 행 + 불량 증빙 사진) ── */}
        {receipt && receiptItems.length > 0 && (
          <div style={{ marginTop: 8, paddingBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>
                검수 결과 — {receipt.receipt_no}
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                입고지시서 {order.order_no}
                {order.source === 'purchase_order' && order.origin_no && (
                  <> · 발주서 {order.origin_no}</>
                )}
                {order.source === 'return' && order.origin_no && (
                  <> · 원본 출고지시서 {order.origin_no}</>
                )}
              </span>
              <div style={{ height: 1, background: '#e2e8f0', flex: 1 }} />
            </div>
            <Table
              size="middle"
              pagination={false}
              dataSource={receiptItems}
              rowKey="id"
              columns={[
                {
                  title: tableHeaderTitle('No'), key: 'no', width: 50, align: 'center',
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (_, __, idx) => idx + 1,
                },
                {
                  title: tableHeaderTitle('상품'), key: 'product', width: 280,
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (_, r) => (
                    <div style={{ lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color: '#0f172a' }}>{r.product_name}</div>
                      <Text style={{ fontSize: 11, color: '#94a3b8' }}>{r.sku}</Text>
                    </div>
                  ),
                },
                {
                  title: tableHeaderTitle('LOT'), dataIndex: 'lot_no', key: 'lot_no', width: 100,
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (v: string | null | undefined) => v ? <Text style={{ fontFamily: 'monospace' }}>{v}</Text> : <Text type="secondary">-</Text>,
                },
                {
                  title: tableHeaderTitle('구분'), dataIndex: 'item_condition', key: 'item_condition', width: 80, align: 'center',
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (v: string) => v === 'defect'
                    ? <Tag color="red" style={{ marginInlineEnd: 0 }}>불량</Tag>
                    : <Tag color="green" style={{ marginInlineEnd: 0 }}>정상</Tag>,
                },
                {
                  title: tableHeaderTitle('수량'), dataIndex: 'qty', key: 'qty', width: 80, align: 'right',
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (v: number) => <span style={{ fontWeight: 500 }}>{v?.toLocaleString() ?? 0}</span>,
                },
                {
                  title: tableHeaderTitle('단가'), dataIndex: 'unit_price', key: 'unit_price', width: 90, align: 'right',
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (v: number) => <span>{v?.toLocaleString() ?? 0}</span>,
                },
                {
                  title: tableHeaderTitle('금액'), key: 'amount', width: 110, align: 'right',
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (_, r) => <span style={{ fontWeight: 500 }}>{((r.qty ?? 0) * (r.unit_price ?? 0)).toLocaleString()}</span>,
                },
                {
                  title: tableHeaderTitle('사진'), key: 'evidence', width: 130, align: 'center',
                  onHeaderCell: () => ({ style: tableHeaderCellStyle }),
                  render: (_, r) => {
                    // 사진은 불량 행에만 노출. 정상 행은 항상 "-".
                    if (r.item_condition !== 'defect') {
                      return <Text type="secondary">-</Text>;
                    }
                    const evidences = evidenceByOrderItemId.get(r.order_item_id) ?? [];
                    if (evidences.length === 0) {
                      return (
                        <Tooltip title="불량 행에 사진이 등록되지 않았습니다.">
                          <span style={{ color: '#ef4444', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <ExclamationCircleOutlined /> 사진 없음
                          </span>
                        </Tooltip>
                      );
                    }
                    return (
                      <Button
                        type="link"
                        size="small"
                        icon={<CameraOutlined />}
                        onClick={() => openLightbox(evidences, `${receipt.receipt_no} · ${r.product_name}`)}
                      >
                        {evidences.length}장
                      </Button>
                    );
                  },
                },
              ]}
            />
          </div>
        )}

        {/* ── Danger Zone — 입고지시서 취소 ── */}
        {(status === 'draft' || status === 'approved') && (
          <Card
            size="small"
            style={{ marginTop: 32, border: '1px solid #fecaca', background: '#fef2f2' }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#b91c1c', marginBottom: 4 }}>입고지시서 취소</div>
                <div style={{ fontSize: 12, color: '#7f1d1d' }}>
                  취소하면 되돌릴 수 없습니다. 초안/승인 상태에서만 가능합니다.
                </div>
              </div>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={handleCancel}
                loading={cancelMutation.isPending}
              >
                입고지시서 취소
              </Button>
            </div>
          </Card>
        )}

        <DefectEvidenceLightbox
          open={lightboxOpen}
          evidences={lightboxEvidences}
          title={lightboxTitle}
          canDelete={canDeleteEvidence}
          onClose={() => setLightboxOpen(false)}
        />

        {/* ── 입고 확정 Modal (수량/불량/LOT만) ── */}
        <Modal title="입고 확정 (수량 검수)" open={receiveOpen} onCancel={() => setReceiveOpen(false)}
          onOk={handleReceive} confirmLoading={receiveMutation.isPending}
          okText="입고 확정" width={700}>
          {receiveRows.map((row, rIdx) => {
            const normal = Math.max(0, row.qty - row.defective);
            return (
              <Card key={rIdx} size="small" style={{ marginBottom: 10, borderLeft: '3px solid #1677ff' }}
                title={<Space><span style={{ fontWeight: 600 }}>{row.sku}</span><Text type="secondary">— {row.product_name} (지시: {row.ordered_qty})</Text></Space>}>
                <Space wrap>
                  <InputNumber min={0} max={row.ordered_qty} value={row.qty} style={{ width: 120 }} controls={false} addonBefore="검수"
                    onChange={(v) => setReceiveRows((p) => p.map((r, i) => i === rIdx ? { ...r, qty: Math.max(0, Number(v ?? 0)) } : r))} />
                  <InputNumber min={0} max={row.qty} value={row.defective} style={{ width: 120 }} controls={false} addonBefore="불량"
                    onChange={(v) => setReceiveRows((p) => p.map((r, i) => i === rIdx ? { ...r, defective: Math.min(Math.max(0, Number(v ?? 0)), r.qty) } : r))} />
                </Space>
                <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                  총 검수 <b>{row.qty}</b> = 정상 <b style={{ color: '#10b981' }}>{normal}</b> + 불량 <b style={{ color: '#ef4444' }}>{row.defective}</b>
                </div>
              </Card>
            );
          })}
        </Modal>

      </div>

      <Drawer
        title="입고 재고 변동 이력"
        placement="right"
        width={820}
        open={txDrawerOpen}
        onClose={() => setTxDrawerOpen(false)}
        destroyOnHidden
      >
        <InventoryTransactionPanel refId={id} refType="inbound_order" title="입고 재고 변동 이력" />
      </Drawer>

      {/* ── 인쇄용 ── */}
      <div className="print-from-dom-source" aria-hidden>
        <PrintDocument
          ref={printRef} title="입고 지시서"
          subtitle={`${order.vendor_name} → ${order.warehouse_name}`}
          orderNo={order.order_no} qrValue={`inbound:${order.id}`} documentOperator={resolveUser(order.created_by)}
          info={[
            { label: '입고처', value: order.vendor_name }, { label: '창고', value: order.warehouse_name },
            { label: '입고예정일', value: order.expected_date }, { label: '상태', value: ORDER_STATUS_CONFIG[status]?.label ?? status },
            { label: '출처', value: order.source === 'return' ? '반품' : order.source === 'purchase_order' ? '발주서' : order.source === 'manual' ? '수동 등록' : (order.source || '-') },
            ...(order.source === 'purchase_order' && order.origin_no
              ? [{ label: '발주서 번호', value: order.origin_no }]
              : []),
            ...(order.source === 'return' && order.origin_no
              ? [{ label: '원본 출고지시서', value: order.origin_no }]
              : []),
            { label: '생성자', value: resolveUser(order.created_by) },
            { label: '승인자', value: resolveUser(order.approved_by) },
          ]}
          columns={[
            { label: 'No', key: 'no', align: 'center', width: 36 }, { label: 'SKU', key: 'sku', width: 120 },
            { label: '상품명', key: 'product_name' }, { label: '수량', key: 'ordered_qty', numeric: true, width: 70, bold: true },
            { label: '단가', key: 'unit_price', numeric: true, width: 80 }, { label: '금액', key: 'amount', numeric: true, width: 90, bold: true },
          ]}
          data={displayItems.map((item, idx) => ({
            no: idx + 1, sku: item.sku, product_name: item.product_name,
            ordered_qty: item.ordered_qty.toLocaleString(), unit_price: item.unit_price.toLocaleString(),
            amount: (item.ordered_qty * item.unit_price).toLocaleString(),
          }))}
          footer={{ left: `총 ${displayItems.length}개 품목`, right: `합계: ${totalAmount.toLocaleString()}원` }}
          signatureLabels={['담당자', '승인자']}
        />
        {receipt && (
          <PrintDocument
            ref={receiptPrintRef}
            title="입고 전표"
            subtitle={`${receipt.vendor_name} → ${receipt.warehouse_name}`}
            orderNo={receipt.receipt_no}
            documentNoLabel="전표 번호"
            qrValue={`inbound-receipt:${receipt.id}`}
            documentOperator={receipt.received_by_name || resolveUser(receipt.received_by)}
            info={[
              { label: '원 지시서', value: receipt.order_no },
              ...(order.source === 'purchase_order' && order.origin_no
                ? [{ label: '발주서 번호', value: order.origin_no }]
                : []),
              ...(order.source === 'return' && order.origin_no
                ? [{ label: '원본 출고지시서', value: order.origin_no }]
                : []),
              { label: '입고처', value: receipt.vendor_name },
              { label: '창고', value: receipt.warehouse_name },
              { label: '입고일시', value: receipt.received_at ? dayjs(receipt.received_at).format('YYYY-MM-DD HH:mm') : '-' },
              { label: '검수 담당자', value: receipt.received_by_name || resolveUser(receipt.received_by) },
              { label: '정상 수량', value: receiptTotals.normalQty.toLocaleString() },
              { label: '불량 수량', value: receiptTotals.defectQty.toLocaleString() },
            ]}
            columns={[
              { label: 'No', key: 'no', align: 'center', width: 36 },
              { label: 'SKU', key: 'sku', width: 120 },
              { label: '상품명', key: 'product_name' },
              { label: '구분', key: 'condition', align: 'center', width: 70 },
              { label: 'LOT', key: 'lot_no', width: 90 },
              { label: '수량', key: 'qty', numeric: true, width: 70, bold: true },
              { label: '단가', key: 'unit_price', numeric: true, width: 80 },
              { label: '금액', key: 'amount', numeric: true, width: 90, bold: true },
            ]}
            data={receiptItems.map((item, idx) => ({
              no: idx + 1,
              sku: item.sku,
              product_name: item.product_name,
              condition: item.item_condition === 'defect' ? '불량' : '정상',
              lot_no: item.lot_no || '-',
              qty: item.qty.toLocaleString(),
              unit_price: item.unit_price.toLocaleString(),
              amount: (item.qty * item.unit_price).toLocaleString(),
            }))}
            footer={{
              left: `정상 ${receiptTotals.normalQty.toLocaleString()}개 · 불량 ${receiptTotals.defectQty.toLocaleString()}개`,
              right: `검수 기준 금액: ${receiptTotals.amount.toLocaleString()}원`,
            }}
            signatureLabels={['검수 담당자', '창고 담당자']}
          />
        )}
      </div>

      <style>{`
        .irow-done td { background: #f0fdf4 !important; }
        .irow-partial td { background: #eff6ff !important; }
        .irow-shortage td { background: #fffbeb !important; }
        .ant-table-thead > tr > th { background: #f8fafc !important; color: #475569 !important; font-weight: 600 !important; font-size: 12px !important; }
      `}</style>
    </>
  );
}
