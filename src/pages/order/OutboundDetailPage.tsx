import { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Table, Card, Descriptions, Steps, Button, Space, Tag, App, Result, Spin,
  Popover, Row, Col, Drawer, Dropdown, Tooltip, Alert,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, UnorderedListOutlined, PrinterOutlined,
  QrcodeOutlined, SendOutlined, CloseCircleOutlined, HistoryOutlined,
  InboxOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
  FileTextOutlined, LineChartOutlined, DownOutlined,
} from '@ant-design/icons';
import { useReactToPrint } from 'react-to-print';
import type { ColumnsType } from 'antd/es/table';
import type { OutboundOrderItem, OrderStatus, PickingList } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import {
  useOutboundOrder,
  useOutboundItems,
  useApproveOutbound,
  useCancelOutbound,
  useConfirmOutbound,
  useForceReleaseResidual,
  useOutboundDispatch,
} from '@/hooks/useOrderQuery';
import { useInstructionDocuments } from '@/hooks/useInstructionDocumentQuery';
import type { InstructionDocumentPage } from '@/types/instructionDocument';
import OrderQrBadge from '@/components/OrderQrBadge';
import PrintDocument from '@/components/PrintDocument';
import WaveCreateModal from '@/components/WaveCreateModal';
import PermissionButton from '@/components/PermissionButton';
import AtpShortageContent from '@/components/AtpShortageContent';
import InventoryTransactionPanel from '@/components/InventoryTransactionPanel';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';


const { Title, Text } = Typography;

/**
 * 출고 지시서 상태 전이 (백엔드 OutboundService 기준)
 *   draft → approved(재고 예약) → in_progress(피킹) → completed/partial(출고 확정·재고 차감)
 * "출고 확정" 은 별도 상태가 아니라 in_progress → completed 로의 즉시 전이이므로 완료 단계에 흡수.
 */
const stepItems = [
  { title: '초안', description: '주문 등록' },
  { title: '승인', description: '재고 예약' },
  { title: '피킹', description: '웨이브 · 피킹작업' },
  { title: '완료', description: '출고 확정 · 재고 차감' },
];
const statusToStep: Record<string, number> = {
  draft: 0, approved: 1, in_progress: 2, completed: 3, partial: 3, cancelled: -1,
};

/** 품목 상태 표시 */
const ITEM_STATUS_CFG: Record<string, { color: string; label: string }> = {
  pending:   { color: '#94a3b8', label: '대기' },
  picking:   { color: '#1677ff', label: '피킹중' },
  completed: { color: '#52c41a', label: '완료' },
  shortage:  { color: '#f59e0b', label: '부족' },
  draft:     { color: '#94a3b8', label: '대기' },
  approved:  { color: '#1677ff', label: '대기' },
  in_progress:{ color: '#1677ff', label: '피킹중' },
  partial:   { color: '#f59e0b', label: '부족' },
  cancelled: { color: '#ef4444', label: '취소' },
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

export default function OutboundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? '';
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId && orderId ? `/topic/admin/outbound/${clientId}/${orderId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['outbound-order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['outbound-items', orderId] });
      queryClient.invalidateQueries({ queryKey: ['outbound-dispatch', orderId] });
      queryClient.invalidateQueries({ queryKey: ['outbound-orders'] });
      showStompToast(message, event);
    },
  );

  const { data: order, isLoading: orderLoading } = useOutboundOrder(orderId);
  const { data: items = [], isLoading: itemsLoading } = useOutboundItems(orderId);
  const approveMutation = useApproveOutbound();
  const cancelMutation = useCancelOutbound();
  const confirmMutation = useConfirmOutbound();
  const forceReleaseMutation = useForceReleaseResidual();
  // 출고 전표는 출고확정 이후(completed/partial)에만 존재
  const dispatchEnabled = !!order && (order.status === 'completed' || order.status === 'partial');
  const { data: dispatch } = useOutboundDispatch(orderId, dispatchEnabled);

  // 지시서 PDF 문서함 — draft/cancelled 외 상태부터 발행본이 존재할 수 있음
  const docFetchEnabled = !!order && order.status !== 'draft' && order.status !== 'cancelled';
  const { data: docPage } = useInstructionDocuments(
    { docType: 'OUTBOUND_ORDER', sourceId: orderId, page: 0, size: 5 },
    {
      enabled: docFetchEnabled,
      // 승인 직후 발행 대기 시점만 짧게 폴링: GENERATING이거나 빈 응답이면 5초마다, 아니면 중단
      refetchInterval: (query) => {
        const list = (query.state.data as InstructionDocumentPage | undefined)?.content;
        if (list === undefined) return 5_000;
        if (list.length === 0) return 5_000;
        return list.some((d) => d.status === 'GENERATING') ? 5_000 : false;
      },
    },
  );
  const latestDoc = docPage?.content?.[0];
  const [waveOpen, setWaveOpen] = useState(false);
  const [txDrawerOpen, setTxDrawerOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);
  const dispatchPrintRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: () => `출고지시서_${order?.order_no ?? id}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
    onBeforePrint: () => new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }),
    onPrintError: (_loc, err) => { message.error(err?.message || '인쇄를 시작할 수 없습니다.'); },
  });
  const handleDispatchPrint = useReactToPrint({
    contentRef: dispatchPrintRef,
    documentTitle: () => `출고전표_${dispatch?.dispatch_no ?? order?.order_no ?? id}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 14mm 12mm 18mm 12mm; }
      @media print {
        body { margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
    onBeforePrint: () => new Promise<void>((resolve) => { requestAnimationFrame(() => requestAnimationFrame(() => resolve())); }),
    onPrintError: (_loc, err) => { message.error(err?.message || '출고 전표 인쇄를 시작할 수 없습니다.'); },
  });

  const status: OrderStatus = order?.status ?? 'draft';
  const currentStep = statusToStep[status] ?? 0;
  const tableScrollY = items.length > 6 ? 360 : undefined;
  const userMap = useUserNameMap();
  const resolveUser = (id: string | null | undefined) => resolveUserName(userMap, id);

  const totalAmount = useMemo(
    () => items.reduce((sum, i) => sum + i.ordered_qty * i.unit_price, 0),
    [items],
  );

  /** 품목 상태별 집계 (총 품목 / 완료 / 피킹중 / 대기) */
  const stats = useMemo(() => {
    const total = items.length;
    let done = 0;
    let picking = 0;
    let pending = 0;
    items.forEach((i) => {
      const s = String(i.status);
      if (s === 'completed') done += 1;
      else if (s === 'picking' || s === 'in_progress') picking += 1;
      else pending += 1;
    });
    return { total, done, picking, pending };
  }, [items]);

  if (orderLoading || itemsLoading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  if (!order) return <Result status="404" title="지시서를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/order/outbound')}>목록으로</Button>} />;

  /** 승인 */
  const handleApprove = () => {
    modal.confirm({
      title: '승인하시겠습니까?',
      content: '재고가 예약되며 승인 후에는 수정할 수 없습니다.',
      onOk: async () => {
        try {
          await approveMutation.mutateAsync(orderId);
          message.success('승인되었습니다. PDF가 발행 중입니다 (1~3초)');
        } catch (e) {
          const detail = (e as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
            ?? (e instanceof Error ? e.message : '승인 처리 실패');
          let errModal: { destroy: () => void } | null = null;
          errModal = modal.error({
            title: '승인 실패',
            content: (
              <AtpShortageContent
                message={detail}
                onGoLowStock={() => {
                  errModal?.destroy();
                  navigate('/common/low-stock');
                }}
                onGoInbound={(prefill) => {
                  errModal?.destroy();
                  navigate('/order/inbound', {
                    state: {
                      prefillManualInbound: prefill
                        ? {
                          source: 'atp',
                          productName: prefill.productName,
                          requestedQty: prefill.requestedQty,
                          warehouseName: order.warehouse_name,
                        }
                        : { source: 'atp', warehouseName: order.warehouse_name },
                    },
                  });
                }}
              />
            ),
            width: 520,
          });
        }
      },
    });
  };

  /** 취소 */
  const handleCancel = () => {
    modal.confirm({
      title: '출고 지시서를 취소하시겠습니까?',
      content: '예약된 재고는 다시 가용재고로 복원됩니다.',
      okType: 'danger',
      onOk: () => cancelMutation.mutate(orderId),
    });
  };

  /** 출고 확정 (dispatches) */
  const handleConfirm = () => {
    modal.confirm({
      title: '출고 확정하시겠습니까?',
      content: '출고 전표가 생성되며 예약재고가 최종 차감됩니다.',
      onOk: () => confirmMutation.mutate(orderId, {
        onSuccess: () => message.success('출고 확정 완료'),
        onError: (e) => {
          const detail = e instanceof Error ? e.message : '출고 확정 실패';
          modal.error({ title: '출고 확정 실패', content: detail });
        },
      }),
    });
  };

  /** 잔여 출고 처리 — 좀비 reserve 정리 */
  const handleForceRelease = () => {
    modal.confirm({
      title: '잔여 출고 처리하시겠습니까?',
      content: (
        <div style={{ lineHeight: 1.6 }}>
          <p style={{ marginBottom: 8 }}>
            출고확정 후에도 시스템에 남아있는 <b>예약재고</b>를 강제로 출고 처리합니다.
          </p>
          <p style={{ color: '#cf1322', marginBottom: 0 }}>
            ⚠ <b>실제 창고에서 재고가 이미 빠진 상태인지 반드시 확인</b>한 후 진행하세요. <br/>
            이 작업은 되돌릴 수 없습니다.
          </p>
        </div>
      ),
      okType: 'danger',
      okText: '잔여 출고 처리',
      onOk: () => forceReleaseMutation.mutate(orderId, {
        onSuccess: (data) => {
          message.success(`잔여 출고 처리 완료 (위치 ${data.residualLocations}건)`);
        },
        onError: (e) => {
          const detail = e instanceof Error ? e.message : '잔여 출고 처리 실패';
          modal.error({ title: '잔여 출고 처리 실패', content: detail });
        },
      }),
    });
  };

  const handleWaveSuccess = (picking: PickingList) => {
    setWaveOpen(false);
    message.success(`피킹 리스트 ${picking.picking_no} 생성 완료`);
    navigate(`/order/picking/${picking.id}`, {
      state: { returnOutboundId: orderId },
    });
  };

  const columns: ColumnsType<OutboundOrderItem> = [
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
      title: tableHeaderTitle('지시수량'), dataIndex: 'ordered_qty', key: 'ordered_qty', width: 100, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => <span style={{ fontWeight: 500, color: '#334155' }}>{v.toLocaleString()}</span>,
    },
    {
      title: tableHeaderTitle('피킹수량'), dataIndex: 'picked_qty', key: 'picked_qty', width: 100, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => <span style={{ fontWeight: 500, color: '#1677ff' }}>{(v ?? 0).toLocaleString()}</span>,
    },
    {
      title: tableHeaderTitle('단가'), dataIndex: 'unit_price', key: 'unit_price', width: 110, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: tableHeaderTitle('상태'), dataIndex: 'status', key: 'status', width: 90, align: 'center',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: string) => {
        const cfg = ITEM_STATUS_CFG[v] ?? { color: '#94a3b8', label: v };
        return (
          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, color: cfg.color, background: `${cfg.color}12` }}>
            {cfg.label}
          </span>
        );
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
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/order/outbound')} />
              </Tooltip>
              <Tooltip title="출고지시서">
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: '#7c3aed',
                    fontSize: 13,
                    padding: '3px 7px',
                    borderRadius: 4,
                    background: '#f5f3ff',
                    border: '1px solid #ddd6fe',
                    flexShrink: 0,
                  }}
                >
                  <SendOutlined style={{ fontSize: 13 }} />
                </span>
              </Tooltip>
              <Title level={4} style={{ margin: 0, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.order_no}</Title>
              <Tag color={ORDER_STATUS_CONFIG[status]?.color} style={{ flexShrink: 0 }}>{ORDER_STATUS_CONFIG[status]?.label}</Tag>
              <Popover content={<OrderQrBadge value={`outbound:${order.id}`} label={order.order_no} title="출고 지시서" size={160} />} trigger="click" placement="bottomLeft">
                <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b', fontSize: 18, flexShrink: 0 }} />
              </Popover>
            </Space>

            <Space size={6} wrap style={{ flexShrink: 0 }}>
              {/* 원본 수주서 진행률 — 1건이면 직접 / 2건+이면 Dropdown */}
              {order.source_sales_order_ids && order.source_sales_order_ids.length === 1 && (
                <Button
                  icon={<LineChartOutlined />}
                  onClick={() => navigate(`/order/sales-orders/${order.source_sales_order_ids![0]}/progress`)}
                >
                  원본 수주서 진행률
                </Button>
              )}
              {order.source_sales_order_ids && order.source_sales_order_ids.length > 1 && (
                <Dropdown
                  menu={{
                    items: order.source_sales_order_ids.map((soId, i) => ({
                      key: soId,
                      label: `수주서 #${i + 1} 진행률`,
                      onClick: () => navigate(`/order/sales-orders/${soId}/progress`),
                    })),
                  }}
                >
                  <Button icon={<LineChartOutlined />}>
                    원본 수주서 {order.source_sales_order_ids.length}건 <DownOutlined />
                  </Button>
                </Dropdown>
              )}

              {/* 출력 ▾ — 출고지시서 / 출고 전표 */}
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'order',
                      icon: <PrinterOutlined />,
                      label: '출고지시서 출력',
                      onClick: () => {
                        if (!printRef.current) { message.warning('잠시 후 다시 시도해 주세요.'); return; }
                        void handlePrint();
                      },
                    },
                    {
                      key: 'dispatch',
                      icon: <PrinterOutlined />,
                      label: '출고 전표 출력',
                      disabled: !dispatchEnabled,
                      onClick: () => {
                        if (!dispatch || !dispatchPrintRef.current) {
                          message.warning('출고 전표가 아직 조회되지 않았습니다. 잠시 후 다시 시도해 주세요.');
                          return;
                        }
                        void handleDispatchPrint();
                      },
                    },
                  ],
                }}
              >
                <Button icon={<PrinterOutlined />}>출력 <DownOutlined /></Button>
              </Dropdown>

              {/* 더보기 ▾ — 문서함 / 재고 이력 */}
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'docs',
                      icon: <FileTextOutlined />,
                      label: '문서함',
                      disabled: !docFetchEnabled,
                      onClick: () => navigate(`/instruction-documents?docType=OUTBOUND_ORDER&sourceId=${orderId}`),
                    },
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

              {/* 상태별 메인 액션 (primary) */}
              {status === 'draft' && (
                <PermissionButton resource="OUTBOUND" action="APPROVE" type="primary" icon={<CheckOutlined />} onClick={handleApprove} loading={approveMutation.isPending}>
                  승인
                </PermissionButton>
              )}
              {status === 'approved' && (
                <PermissionButton resource="OUTBOUND" action="CREATE" type="primary" icon={<UnorderedListOutlined />} onClick={() => setWaveOpen(true)}>
                  피킹 리스트 생성
                </PermissionButton>
              )}
              {status === 'in_progress' && (
                <PermissionButton resource="OUTBOUND" action="CREATE" type="primary" icon={<SendOutlined />} onClick={handleConfirm} loading={confirmMutation.isPending}>
                  출고 확정
                </PermissionButton>
              )}
              {(status === 'in_progress' || status === 'completed' || status === 'partial') && (
                <Button
                  type="primary"
                  onClick={() => {
                    const firstId = order.picking_list_ids?.[0];
                    if (firstId) {
                      navigate(`/order/picking/${firstId}`, {
                        state: { returnOutboundId: orderId },
                      });
                    }
                    else navigate('/order/picking');
                  }}
                  disabled={!order.picking_list_ids || order.picking_list_ids.length === 0}
                >
                  피킹 작업 보기
                </Button>
              )}
            </Space>
          </div>

        </div>
        {/* ── 정보 ── */}
        {order.origin_type === 'return' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <Space size={8} wrap>
                <Tag color="volcano" style={{ margin: 0 }}>반품 출고</Tag>
                {order.return_from_order_no && order.origin_id && (
                  <span>
                    원본 입고지시서:{' '}
                    <a onClick={() => navigate(`/order/inbound/${order.origin_id}`)}>
                      {order.return_from_order_no}
                    </a>
                  </span>
                )}
                {order.supplier_name && <span>· 반품 대상: <strong>{order.supplier_name}</strong></span>}
                {order.return_reason && <span>· 사유: {order.return_reason}</span>}
              </Space>
            }
          />
        )}
        <Card size="small" style={{ marginBottom: 20, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Descriptions column={4} size="small">
            <Descriptions.Item label={order.destination_type === 'supplier' ? '입고처(반품)' : '출고처'}>
              {order.destination_type === 'supplier' ? (order.supplier_name || '-') : (order.store_name || '-')}
            </Descriptions.Item>
            <Descriptions.Item label="창고">{order.warehouse_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="출고예정일">{order.expected_date || '-'}</Descriptions.Item>
            <Descriptions.Item label="출처">
              {order.origin_type === 'return' || order.source === 'return'
                ? <Tag color="volcano">반품</Tag>
                : order.source === 'purchase_order'
                  ? <Tag color="blue">발주서</Tag>
                  : order.source === 'manual'
                    ? <Tag>수동 등록</Tag>
                    : (order.source || '-')}
            </Descriptions.Item>
            <Descriptions.Item label="생성자">{order.created_by_name || resolveUser(order.created_by)}</Descriptions.Item>
            <Descriptions.Item label="승인자">{order.approved_by_name || (order.approved_by ? resolveUser(order.approved_by) : '-')}</Descriptions.Item>
            <Descriptions.Item label="승인일시">{order.approved_at ? dayjs(order.approved_at).format('MM-DD HH:mm') : '-'}</Descriptions.Item>
            {docFetchEnabled && (
              <Descriptions.Item label="발행본" span={4}>
                {latestDoc?.status === 'READY' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#52c41a' }}>
                    <CheckCircleOutlined /> 최신본 v{latestDoc.version}
                  </span>
                )}
                {latestDoc?.status === 'GENERATING' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Spin size="small" /> 발행 중...
                  </span>
                )}
                {latestDoc?.status === 'FAILED' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#ef4444' }}>
                    <CloseCircleOutlined /> 발행 실패
                  </span>
                )}
                {!latestDoc && docPage && docPage.content.length === 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Spin size="small" /> 발행 중...
                  </span>
                )}
                {!latestDoc && (!docPage || docPage.content.length > 0) && '-'}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {/* ── Steps ── */}
        <div style={{ marginBottom: 24 }}>
          <Steps current={currentStep} items={stepItems} size="small" responsive style={{ marginBottom: 0 }} />
        </div>

        {/* ── 요약 카드 ── */}
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: '총 품목', value: stats.total, color: '#334155', icon: <InboxOutlined /> },
            { title: '피킹 완료', value: stats.done, color: '#52c41a', icon: <CheckCircleOutlined /> },
            { title: '피킹 중', value: stats.picking, color: '#1677ff', icon: <ClockCircleOutlined /> },
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
          <Table
            columns={columns}
            dataSource={items}
            rowKey="id"
            size="middle"
            pagination={false}
            scroll={tableScrollY ? { y: tableScrollY } : undefined}
            onRow={() => ({ style: { height: 56 } })}
          />
        </div>

        {/* ── Danger Zone — 출고지시서 취소 ── */}
        {(status === 'draft' || status === 'approved') && (
          <Card
            size="small"
            style={{ marginTop: 32, border: '1px solid #fecaca', background: '#fef2f2' }}
            styles={{ body: { padding: 16 } }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#b91c1c', marginBottom: 4 }}>출고지시서 취소</div>
                <div style={{ fontSize: 12, color: '#7f1d1d' }}>
                  취소하면 되돌릴 수 없습니다. 초안/승인 상태에서만 가능하며, 분배된 SO 잔여 수량이 원복됩니다.
                </div>
              </div>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                onClick={handleCancel}
                loading={cancelMutation.isPending}
              >
                출고지시서 취소
              </Button>
            </div>
          </Card>
        )}
        {(status === 'completed' || status === 'partial') && (
          <div
            style={{
              marginTop: 24,
              padding: '14px 16px',
              borderLeft: '4px solid #ef4444',
              background: '#fef2f2',
              borderRadius: '0 6px 6px 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <Space size={8} align="center">
              <WarningOutlined style={{ color: '#dc2626', fontSize: 16 }} />
              <Text strong style={{ color: '#0f172a', fontSize: 13 }}>
                잔여 예약재고가 남아있다면 정리하세요
              </Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
              출고확정 후에도 시스템에 좀비처럼 남아있는 예약재고를 강제로 출고 처리합니다. 실제 창고에서 재고가 빠진 상태인지 반드시 확인하세요.
            </Text>
            <Space>
              <PermissionButton
                resource="OUTBOUND"
                action="UPDATE"
                danger
                size="small"
                onClick={handleForceRelease}
                loading={forceReleaseMutation.isPending}
              >
                잔여 출고 처리
              </PermissionButton>
            </Space>
          </div>
        )}

        <WaveCreateModal
          open={waveOpen}
          outboundOrderIds={[orderId]}
          onClose={() => setWaveOpen(false)}
          onSuccess={handleWaveSuccess}
        />
      </div>

      {/* ── 인쇄용 ── */}
      <div className="print-only">
        <PrintDocument
          ref={printRef}
          title="출고 지시서"
          subtitle={order.store_name}
          orderNo={order.order_no}
          qrValue={`outbound:${order.id}`}
          documentOperator={resolveUser(order.created_by)}
          info={[
            { label: '출고처', value: order.store_name },
            { label: '창고', value: order.warehouse_name },
            { label: '출고예정일', value: order.expected_date },
            { label: '상태', value: ORDER_STATUS_CONFIG[status]?.label ?? status },
            { label: '출처', value: order.source === 'return' ? '반품' : order.source === 'purchase_order' ? '발주서' : order.source === 'manual' ? '수동 등록' : (order.source || '-') },
            { label: '생성자', value: order.created_by_name || resolveUser(order.created_by) },
            { label: '승인자', value: order.approved_by_name || (order.approved_by ? resolveUser(order.approved_by) : '-') },
          ]}
          columns={[
            { label: 'No', key: 'no', align: 'center', width: 40 },
            { label: 'SKU', key: 'sku', width: 110 },
            { label: '상품명', key: 'product_name' },
            { label: '지시수량', key: 'ordered_qty', numeric: true, width: 72, bold: true },
            { label: '단가', key: 'unit_price', numeric: true, width: 76 },
            { label: '금액', key: 'amount', numeric: true, width: 84, bold: true },
            { label: '비고', key: 'note', width: 40 },
          ]}
          data={items.map((item, idx) => ({
            no: idx + 1,
            sku: item.sku,
            product_name: item.product_name,
            ordered_qty: item.ordered_qty.toLocaleString(),
            unit_price: item.unit_price.toLocaleString(),
            amount: (item.ordered_qty * item.unit_price).toLocaleString(),
            note: '',
          }))}
          footer={{ left: `총 ${items.length}개 품목`, right: `합계: ${totalAmount.toLocaleString()}원` }}
        />
        {dispatch && (
          <PrintDocument
            ref={dispatchPrintRef}
            title="출고 전표"
            subtitle={`${dispatch.warehouse_name} → ${dispatch.store_name}`}
            orderNo={dispatch.dispatch_no}
            documentNoLabel="전표 번호"
            qrValue={`outbound-dispatch:${dispatch.id}`}
            documentOperator={dispatch.dispatched_by_name || resolveUser(dispatch.dispatched_by)}
            info={[
              { label: '지시서 번호', value: dispatch.order_no },
              { label: '출고처', value: dispatch.store_name },
              { label: '창고', value: dispatch.warehouse_name },
              { label: '출고일시', value: dispatch.dispatched_at ? dayjs(dispatch.dispatched_at).format('YYYY-MM-DD HH:mm') : '-' },
              { label: '출고 담당자', value: dispatch.dispatched_by_name || resolveUser(dispatch.dispatched_by) },
              { label: '총 수량', value: dispatch.items.reduce((s, it) => s + (it.qty ?? 0), 0).toLocaleString() },
            ]}
            columns={[
              { label: 'No', key: 'no', align: 'center', width: 36 },
              { label: 'SKU', key: 'sku', width: 120 },
              { label: '상품명', key: 'product_name' },
              { label: 'LOT', key: 'lot_no', width: 90 },
              { label: '수량', key: 'qty', numeric: true, width: 70, bold: true },
              { label: '단가', key: 'unit_price', numeric: true, width: 80 },
              { label: '금액', key: 'amount', numeric: true, width: 90, bold: true },
            ]}
            data={dispatch.items.map((item, idx) => ({
              no: idx + 1,
              sku: item.sku || '-',
              product_name: item.product_name,
              lot_no: item.lot_no || '-',
              qty: (item.qty ?? 0).toLocaleString(),
              unit_price: (item.unit_price ?? 0).toLocaleString(),
              amount: ((item.qty ?? 0) * (item.unit_price ?? 0)).toLocaleString(),
            }))}
            footer={{
              left: `총 ${dispatch.items.length}개 품목 · 수량 ${dispatch.items.reduce((s, it) => s + (it.qty ?? 0), 0).toLocaleString()}`,
              right: `합계: ${dispatch.items.reduce((s, it) => s + (it.qty ?? 0) * (it.unit_price ?? 0), 0).toLocaleString()}원`,
            }}
            signatureLabels={['출고 담당자', '인수자']}
          />
        )}
      </div>

      <Drawer
        title="출고 재고 변동 이력"
        placement="right"
        width={820}
        open={txDrawerOpen}
        onClose={() => setTxDrawerOpen(false)}
        destroyOnHidden
      >
        <InventoryTransactionPanel refId={orderId} refType="outbound_order" title="출고 재고 변동 이력" />
      </Drawer>

      <style>{`.print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }`}</style>
    </>
  );
}
