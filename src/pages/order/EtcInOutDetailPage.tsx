import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Table, Card, Descriptions, Steps, Button, Space, Tag, App, Result, Spin,
  Row, Col, Popover, Modal, InputNumber, Input, Form, Select,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, CloseCircleOutlined, QrcodeOutlined,
  InboxOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import OrderQrBadge from '@/components/OrderQrBadge';
import type { ColumnsType } from 'antd/es/table';
import type { EtcInOutItem, EtcInOutIoType, EtcInOutStatus } from '@/types/order';
import {
  useEtcInOutDetail, useEtcInOutItems,
  useApproveEtcInOut, useCompleteEtcInOut, useCancelEtcInOut,
  useEtcInoutInboundRequestPreview,
  useSendEtcInoutInboundRequest,
} from '@/hooks/useOrderQuery';
import { updateEtcInOutItem, completeEtcInOut, getEtcInoutCancellationCandidates, cancelOutboundsForEtcInout, type CancellationCandidate } from '@/api/order';
import PermissionButton from '@/components/PermissionButton';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import { extractApiErrorMessage } from '@/utils/apiError';
import dayjs from 'dayjs';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import { useZonesByWarehouse } from '@/hooks/useWarehouseQuery';

/** ISO datetime → '2026-05-04 23:26' (분까지) */
const fmtDateTime = (v: string | null | undefined): string => {
  if (!v) return '-';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : v;
};

import type { WorkEventMessage } from '@/types/stomp';
import { getClientIdFromToken } from '@/utils/jwt';
import { showStompToast } from '@/lib/stompMessages';

interface EtcInOutStompEvent {
  module?: string;
  type?: 'CREATED' | 'APPROVED' | 'PROCESSED' | 'COMPLETED';
  orderId?: string;
  orderNo?: string;
}

const { Title } = Typography;

const ioTypeConfig: Record<EtcInOutIoType, { color: string; label: string }> = {
  dispose_out: { color: 'red', label: '폐기 출고' },
  dispose_in: { color: 'red', label: '폐기 입고' },
  sample_in: { color: 'blue', label: '샘플 입고' },
  sample_out: { color: 'cyan', label: '샘플 출고' },
  adjust_in: { color: 'orange', label: '재고 조정 입고' },
  adjust_out: { color: 'orange', label: '재고 조정 출고' },
  etc_in: { color: 'default', label: '기타 입고' },
  etc_out: { color: 'default', label: '기타 출고' },
};

const statusConfig: Record<EtcInOutStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '초안' },
  approved: { color: 'processing', label: '승인됨' },
  completed: { color: 'success', label: '완료' },
  cancelled: { color: 'error', label: '취소' },
};

const itemStatusConfig: Record<string, { color: string; label: string }> = {
  pending: { color: 'default', label: '대기' },
  completed: { color: 'success', label: '처리완료' },
  shortage: { color: 'warning', label: '부족 출고' },
};

const stepItems = [
  { title: '초안', description: '기록 등록' },
  { title: '승인', description: '작업자 자동 배정' },
  { title: '완료', description: '재고 반영' },
];
const statusToStep: Record<EtcInOutStatus, number> = {
  draft: 0,
  approved: 1,
  completed: 2,
  cancelled: -1,
};

const statIcon = (color: string): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 18, color, background: `${color}14`, border: `1px solid ${color}22`,
});

function isDefectZoneLabel(v: string | undefined): boolean {
  const text = (v ?? '').trim().toUpperCase();
  return text.includes('DEFECT') || text.includes('불량');
}

/** 풀 location_code 에서 끝 3개 세그먼트만 추출 (예: LC-RK-ZN-SEL-POWER-014-PCEL-010-01 → PCEL-010-01) */
function shortLocationCode(code: string): string {
  const parts = code.split('-');
  return parts.length >= 3 ? parts.slice(-3).join('-') : code;
}

export default function EtcInOutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? '';
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useEtcInOutDetail(orderId);
  const { data: items = [], isLoading: itemsLoading } = useEtcInOutItems(orderId);
  const { data: inventoryByRack } = useInventoryByRack(order?.warehouse_id ?? null);
  const { data: zones = [] } = useZonesByWarehouse(order?.warehouse_id ?? '');
  const approveMutation = useApproveEtcInOut();
  const completeMutation = useCompleteEtcInOut();
  const cancelMutation = useCancelEtcInOut();
  const sendInboundRequestMutation = useSendEtcInoutInboundRequest();

  /** 가용재고 부족 → 입고 요청 메일 발송 모달 */
  const [stockShortage, setStockShortage] = useState(false);
  const [mailFormOpen, setMailFormOpen] = useState(false);
  const [mailForm, setMailForm] = useState<{ recipient: string; senderName: string; subject: string; body: string } | null>(null);
  const previewQuery = useEtcInoutInboundRequestPreview(orderId, mailFormOpen);
  // 모달 열렸고 미리보기 응답 도착 → 폼 초기값 채움 (1회만)
  useEffect(() => {
    if (previewQuery.data && mailFormOpen && !mailForm) {
      setMailForm({
        recipient: previewQuery.data.recipient,
        senderName: previewQuery.data.senderName,
        subject: previewQuery.data.subject,
        body: previewQuery.data.body,
      });
    }
  }, [previewQuery.data, mailFormOpen, mailForm]);

  /** 가용재고 부족 → 출고지시서 취소 후보 모달 */
  const [cancelCandidatesOpen, setCancelCandidatesOpen] = useState(false);
  const [cancelCandidates, setCancelCandidates] = useState<CancellationCandidate[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [selectedCancelIds, setSelectedCancelIds] = useState<string[]>([]);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const userMap = useUserNameMap();
  const resolveUser = (uid: string | null | undefined) => resolveUserName(userMap, uid);

  /** 직접 완료 모달 — 정상/불량 수량 입력 */
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveRows, setReceiveRows] = useState<{
    item_id: string;
    sku: string;
    product_name: string;
    ordered_qty: number;
    qty: number;
    defective: number;
    defectLocationId?: string;
    defectLocationCode?: string;
    defaultDefectLocationId?: string;
    defaultDefectLocationCode?: string;
  }[]>([]);
  const [completeSubmitting, setCompleteSubmitting] = useState(false);

  // STOMP — 팀원 패턴: 로그인한 운영자 본인의 work-event 채널 (toast 알림용)
  const clientIdForStomp = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientIdForStomp && orderId ? `/topic/admin/etc-inout/${clientIdForStomp}/${orderId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['etc-inout-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['etc-inout-items', orderId] });
      showStompToast(message, event);
    },
    { getKey: () => `${clientIdForStomp ?? ''}-${orderId ?? ''}` },
  );

  // STOMP — 백엔드 공용 admin 토픽 (PROCESSED/COMPLETED 등 작업자 처리 이벤트, 입고/출고 패턴과 동일)
  useStompInvalidate<EtcInOutStompEvent>(
    orderId ? `/topic/admin/etc-inout/${orderId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['etc-inout-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['etc-inout-items', orderId] });
      queryClient.invalidateQueries({ queryKey: ['etc-inout-orders'] });
      const orderNo = event.orderNo ?? '';
      if (event.type === 'PROCESSED') message.info(`${orderNo} 품목 처리`);
      else if (event.type === 'COMPLETED') message.success(`${orderNo} 처리 완료`);
    },
    { getKey: () => orderId ?? 'detail' },
  );

  /** 상태별 품목 통계 */
  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === 'completed').length;
    const shortage = items.filter((i) => i.status === 'shortage').length;
    const pending = items.filter((i) => i.status === 'pending').length;
    return { total, done, shortage, pending };
  }, [items]);

  const locationRows = useMemo(() => {
    if (!inventoryByRack) return [];
    return inventoryByRack.racks.flatMap((rack) => (
      rack.locations.map((loc) => ({
        ...loc,
        rack_id: rack.rack_id,
        rack_code: rack.rack_code,
        zone_id: rack.zone_id,
        zone_code: rack.zone_code,
        zone_name: rack.zone_name,
      }))
    ));
  }, [inventoryByRack]);

  const defectZoneIds = useMemo(
    () => new Set(zones.filter((z) => z.zone_type === 'DEFECT' && z.is_active !== false).map((z) => z.id)),
    [zones],
  );

  const defectLocationOptions = useMemo(() => locationRows
    .filter((loc) => defectZoneIds.has(loc.zone_id) || isDefectZoneLabel(loc.zone_code) || isDefectZoneLabel(loc.zone_name))
    .map((loc) => ({
      value: loc.location_id,
      label: loc.location_code,
    })), [defectZoneIds, locationRows]);

  useEffect(() => {
    if (!receiveOpen || defectLocationOptions.length === 0) return;
    const fallback = defectLocationOptions[0];
    setReceiveRows((prev) => prev.map((row) => (
      row.defective > 0 && !row.defectLocationId
        ? {
          ...row,
          defectLocationId: row.defaultDefectLocationId || fallback.value,
          defectLocationCode: row.defaultDefectLocationCode || fallback.label,
          defaultDefectLocationId: row.defaultDefectLocationId || fallback.value,
          defaultDefectLocationCode: row.defaultDefectLocationCode || fallback.label,
        }
        : row
    )));
  }, [defectLocationOptions, receiveOpen]);

  if (isLoading || itemsLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }
  if (!order) {
    const back = orderId ? `/etc-inout/in` : '/etc-inout/in';
    return (
      <Result
        status="404"
        title="기록을 찾을 수 없습니다"
        extra={<Button onClick={() => navigate(back)}>목록으로</Button>}
      />
    );
  }

  const status = order.status;
  const currentStep = statusToStep[status] ?? 0;
  // 폐기 사유는 어차피 다 폐기품이라 불량 구분 무의미 → 관련 컬럼/입력 숨김
  const isDispose = order.io_type === 'dispose_in' || order.io_type === 'dispose_out';
  const backUrl = order.direction === 'out' ? '/etc-inout/out' : '/etc-inout/in';

  const handleApprove = () => {
    modal.confirm({
      title: '승인하시겠습니까?',
      content: '승인 후에는 품목 수정/삭제가 불가능하며, 모바일 작업자에게 자동 배정됩니다.',
      okText: '승인',
      cancelText: '닫기',
      onOk: () => approveMutation.mutateAsync(orderId)
        .then(() => {
          message.success(`${order.order_no} 승인되었습니다.`);
          setStockShortage(false);
        })
        .catch((err) => {
          // 가용재고 부족(409 STOCK_SHORTAGE) → "입고 요청" 버튼 노출
          const status = (err as { response?: { status?: number } })?.response?.status;
          const code = (err as { response?: { data?: { code?: string; error_code?: string } } })?.response?.data;
          const isShortage = status === 409 || code?.code === 'STOCK_SHORTAGE' || code?.error_code === 'STOCK_SHORTAGE';
          if (isShortage) setStockShortage(true);
          message.error(extractApiErrorMessage(err, '승인 처리에 실패했습니다.'));
        }),
    });
  };

  /** 가용재고 부족 시 OMS팀에 보낼 입고 요청 메일 — 미리보기 폼 모달 오픈 */
  const handleOpenMailForm = () => {
    setMailFormOpen(true);
  };

  const handleCloseMailForm = () => {
    setMailFormOpen(false);
    setMailForm(null);
  };

  /** 폼 내용을 백엔드 SMTP로 전송 (운영자 정보는 JWT 기반으로 백엔드에서 자동 주입) */
  const handleSendMail = () => {
    if (!mailForm) return;
    sendInboundRequestMutation.mutate(
      {
        id: orderId,
        input: {
          recipient: mailForm.recipient,
          senderName: mailForm.senderName,
          subject: mailForm.subject,
          body: mailForm.body,
        },
      },
      {
        onSuccess: (res) => {
          if (res.status === 'sent') {
            message.success('입고 요청 메일이 전송되었습니다.');
          } else {
            message.error(`메일 전송 실패: ${res.errorMessage ?? '알 수 없는 오류'}`);
          }
          handleCloseMailForm();
        },
        onError: (err) => message.error(extractApiErrorMessage(err, '메일 전송에 실패했습니다.')),
      },
    );
  };

  /** 가용재고 부족 → 잡고 있는 출고지시서 취소 후보 조회 후 모달 오픈 */
  const handleOpenCancelCandidates = async () => {
    setCancelLoading(true);
    setCancelCandidatesOpen(true);
    setSelectedCancelIds([]);
    try {
      const list = await getEtcInoutCancellationCandidates(orderId);
      setCancelCandidates(list);
    } catch (err) {
      message.error(extractApiErrorMessage(err, '취소 후보 조회에 실패했습니다.'));
      setCancelCandidatesOpen(false);
    } finally {
      setCancelLoading(false);
    }
  };

  /** 선택한 출고지시서들을 일괄 취소하고 모달 닫기 — 운영자가 다시 [승인] 누르면 통과해야 함 */
  const handleConfirmCancelOutbounds = async () => {
    if (selectedCancelIds.length === 0) {
      message.warning('취소할 출고지시서를 선택하세요.');
      return;
    }
    setCancelSubmitting(true);
    try {
      await cancelOutboundsForEtcInout(orderId, selectedCancelIds);
      message.success(`${selectedCancelIds.length}건 취소 완료. 다시 [승인]을 시도해 주세요.`);
      setCancelCandidatesOpen(false);
      setStockShortage(false);
      // 인벤토리/지시서 목록 갱신
      queryClient.invalidateQueries({ queryKey: ['inventory-by-rack'] });
      queryClient.invalidateQueries({ queryKey: ['outbound-orders'] });
      queryClient.invalidateQueries({ queryKey: ['draft-outbounds'] });
    } catch (err) {
      message.error(extractApiErrorMessage(err, '출고지시서 취소에 실패했습니다.'));
    } finally {
      setCancelSubmitting(false);
    }
  };

  /** 직접 완료 모달 열기 — 입고와 동일한 정상/불량 수량 검수 입력 */
  const openReceive = () => {
    const fallback = defectLocationOptions[0];
    setReceiveRows(items.map((i) => ({
      item_id: i.id,
      sku: '-', // EtcInOutItem에 sku 필드 없음 — product_name만 표기
      product_name: i.product_name || i.product_id,
      ordered_qty: i.qty,
      qty: i.qty - (i.defect_qty ?? 0), // 정상 수량 기본값
      defective: i.defect_qty ?? 0,
      defectLocationId: i.defect_location_id ?? i.default_defect_location_id ?? fallback?.value,
      defectLocationCode: i.defect_location_code ?? i.default_defect_location_code ?? fallback?.label,
      defaultDefectLocationId: i.default_defect_location_id ?? fallback?.value,
      defaultDefectLocationCode: i.default_defect_location_code ?? fallback?.label,
    })));
    setReceiveOpen(true);
  };

  const handleComplete = async () => {
    if (!order) return;
    // 검증
    const invalid = receiveRows.find((r) => r.defective > r.qty + r.defective);
    if (invalid) {
      message.warning(`${invalid.product_name}: 불량 수량은 총 수량을 넘을 수 없습니다.`);
      return;
    }
    const invalidDefectLocation = receiveRows.find((r) => r.defective > 0 && !r.defectLocationId);
    if (invalidDefectLocation) {
      message.warning(`${invalidDefectLocation.product_name}: 불량 로케이션을 선택해주세요.`);
      return;
    }
    setCompleteSubmitting(true);
    try {
      // 1. 각 품목 정상/불량 수량 갱신 (변경된 행만)
      for (const r of receiveRows) {
        const original = items.find((i) => i.id === r.item_id);
        const totalQty = r.qty + r.defective;
        const changed = !original
          || original.qty !== totalQty
          || (original.defect_qty ?? 0) !== r.defective
          || (original.defect_location_id ?? null) !== (r.defective > 0 ? (r.defectLocationId || null) : null);
        if (changed) {
          await updateEtcInOutItem(orderId, r.item_id, {
            qty: totalQty,
            processedQty: r.qty,
            defectQty: r.defective,
            defectLocationId: r.defective > 0 ? (r.defectLocationId || null) : null,
          });
        }
      }
      // 2. 완료 처리
      await completeEtcInOut(orderId);
      message.success(`${order.order_no} 완료 처리되었습니다.`);
      setReceiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ['etc-inout-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['etc-inout-items', orderId] });
      queryClient.invalidateQueries({ queryKey: ['etc-inout-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stocks'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-by-rack'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] });
    } catch (err) {
      message.error(extractApiErrorMessage(err, '완료 처리에 실패했습니다.'));
    } finally {
      setCompleteSubmitting(false);
    }
  };

  const handleCancel = () => {
    modal.confirm({
      title: '취소할까요?',
      content: '취소하면 이 기록은 더 이상 완료 처리할 수 없습니다. 재고는 변동되지 않습니다.',
      okText: '취소 처리',
      cancelText: '닫기',
      okButtonProps: { danger: true },
      onOk: () => cancelMutation.mutateAsync(orderId)
        .then(() => message.success(`${order.order_no} 취소 처리되었습니다.`))
        .catch((err) => message.error(extractApiErrorMessage(err, '취소 처리에 실패했습니다.'))),
    });
  };

  const itemColumns: ColumnsType<EtcInOutItem> = [
    { title: '상품', key: 'product', render: (_, r) => r.product_name || r.product_id },
    {
      title: '위치', key: 'location', width: 200,
      render: (_, r) => {
        const fullCode = r.location_code ?? r.location_id.slice(0, 12);
        const display = r.location_code ? shortLocationCode(r.location_code) : fullCode;
        const params = new URLSearchParams({
          wh: order.warehouse_id,
          tab: 'rack-inventory',
          locationId: r.location_id,
          ...(r.location_code ? { locationCode: r.location_code } : {}),
          ...(r.rack_code ? { rackCode: r.rack_code } : {}),
        });
        return (
          <Space size={4} style={{ whiteSpace: 'nowrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 12 }} title={fullCode}>{display}</span>
            <Button
              type="text"
              size="small"
              icon={<EnvironmentOutlined />}
              title="창고 모니터링에서 이 위치 보기"
              onClick={() => navigate(`/warehouse/monitoring?${params.toString()}`)}
              style={{ color: '#1677ff', flexShrink: 0 }}
            />
          </Space>
        );
      },
    },
    { title: '지시수량', dataIndex: 'qty', key: 'qty', width: 90, align: 'right', render: (v: number) => v.toLocaleString() },
    {
      title: order.direction === 'out' ? '정상출고' : '정상입고',
      dataIndex: 'processed_qty', key: 'processed_qty', width: 90, align: 'right',
      render: (v?: number) => v && v > 0
        ? <span style={{ color: '#1677ff', fontWeight: 600 }}>{v.toLocaleString()}</span>
        : <span style={{ color: '#cbd5e1' }}>0</span>,
    },
    ...(isDispose ? [] : [{
      title: '불량품',
      dataIndex: 'defect_qty' as const, key: 'defect_qty', width: 90, align: 'right' as const,
      render: (v?: number) => v && v > 0
        ? <span style={{ color: '#ef4444', fontWeight: 600 }}>{v.toLocaleString()}</span>
        : <span style={{ color: '#cbd5e1' }}>0</span>,
    }]),
    { title: 'LOT', dataIndex: 'lot_no', key: 'lot_no', width: 110, render: (v: string | null) => v || '-' },
    {
      title: '처리상태', dataIndex: 'status', key: 'status', width: 100, align: 'center',
      render: (v: string) => {
        const cfg = itemStatusConfig[v];
        return <Tag color={cfg?.color}>{cfg?.label ?? v}</Tag>;
      },
    },
  ];

  return (
    <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <Space size={8} align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backUrl)}>목록</Button>
          <Title level={4} style={{ margin: 0, color: '#0f172a' }}>{order.order_no}</Title>
          <Tag color={ioTypeConfig[order.io_type]?.color}>{ioTypeConfig[order.io_type]?.label}</Tag>
          <Tag color={statusConfig[status]?.color}>{statusConfig[status]?.label}</Tag>
          <Popover
            content={<OrderQrBadge value={`etc-inout:${order.id}`} label={order.order_no} title={ioTypeConfig[order.io_type]?.label ?? '기타입출고'} size={160} />}
            trigger="click"
            placement="bottomLeft"
          >
            <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b', fontSize: 18 }} />
          </Popover>
        </Space>
        <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          {status === 'draft' && (
            <PermissionButton
              resource="ETC_INOUT" action="APPROVE"
              type="primary" icon={<CheckOutlined />}
              loading={approveMutation.isPending}
              onClick={handleApprove}
            >
              승인
            </PermissionButton>
          )}
          {status === 'draft' && stockShortage && order.direction === 'out' && (
            <>
              <PermissionButton
                resource="ETC_INOUT" action="UPDATE"
                danger
                icon={<CloseCircleOutlined />}
                onClick={handleOpenCancelCandidates}
              >
                출고지시서 취소하고 진행
              </PermissionButton>
              <PermissionButton
                resource="ETC_INOUT" action="UPDATE"
                icon={<InboxOutlined />}
                onClick={handleOpenMailForm}
              >
                입고 요청
              </PermissionButton>
            </>
          )}
          {(status === 'draft' || status === 'approved') && (
            <PermissionButton
              resource="ETC_INOUT" action="UPDATE"
              type={status === 'approved' ? 'primary' : 'default'}
              icon={<CheckCircleOutlined />}
              loading={completeMutation.isPending || completeSubmitting}
              onClick={openReceive}
            >
              직접 완료
            </PermissionButton>
          )}
          {(status === 'draft' || status === 'approved') && (
            <PermissionButton
              resource="ETC_INOUT" action="DELETE"
              danger icon={<CloseCircleOutlined />}
              loading={cancelMutation.isPending}
              onClick={handleCancel}
            >
              취소
            </PermissionButton>
          )}
        </div>
      </div>

      {/* 정보 카드 */}
      <Card size="small" style={{ marginBottom: 20, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="유형">
            <Tag color={ioTypeConfig[order.io_type]?.color}>{ioTypeConfig[order.io_type]?.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="방향">{order.direction === 'in' ? '입고' : '출고'}</Descriptions.Item>
          <Descriptions.Item label="창고">{order.warehouse_name}</Descriptions.Item>
          {order.store_name && <Descriptions.Item label="출고처">{order.store_name}</Descriptions.Item>}
          {order.note && <Descriptions.Item label="비고" span={4}>{order.note}</Descriptions.Item>}
          <Descriptions.Item label="생성자">{resolveUser(order.created_by)}</Descriptions.Item>
          <Descriptions.Item label="생성일">{order.created_at}</Descriptions.Item>
          {order.assigned_to && <Descriptions.Item label="작업자">{order.assigned_to_name ?? resolveUser(order.assigned_to)}</Descriptions.Item>}
          {order.approved_by && <Descriptions.Item label="승인자">{order.approved_by_name ?? resolveUser(order.approved_by)}</Descriptions.Item>}
          {order.approved_at && <Descriptions.Item label="승인일시">{fmtDateTime(order.approved_at)}</Descriptions.Item>}
          {order.completed_by && <Descriptions.Item label="완료자">{order.completed_by_name ?? resolveUser(order.completed_by)}</Descriptions.Item>}
          {order.completed_at && <Descriptions.Item label="완료일시">{fmtDateTime(order.completed_at)}</Descriptions.Item>}
        </Descriptions>
      </Card>

      {/* Steps 진행도 */}
      <div style={{ marginBottom: 24 }}>
        <Steps current={currentStep} items={stepItems} size="small" responsive />
      </div>

      {/* 요약 카드 — 진행률 N/M, 대기, 부족 출고 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { title: '총 품목', value: stats.total, color: '#334155', icon: <InboxOutlined /> },
          { title: '처리 완료', value: `${stats.done}/${stats.total}`, color: '#52c41a', icon: <CheckCircleOutlined /> },
          { title: '대기', value: stats.pending, color: stats.pending > 0 ? '#f59e0b' : '#cbd5e1', icon: <ClockCircleOutlined /> },
          { title: '부족 출고', value: stats.shortage, color: stats.shortage > 0 ? '#ef4444' : '#cbd5e1', icon: <WarningOutlined /> },
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

      {/* 취소된 출고지시서 (있을 때만) */}
      {order.cancellation_links && order.cancellation_links.length > 0 && (
        <Card title="재고 부족으로 취소된 출고지시서" size="small" style={{ marginBottom: 16 }}>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
            {order.cancellation_links.map((c) => (
              <li key={c.outbound_order_id}>
                <strong>{c.order_no}</strong>
                <span style={{ color: '#94a3b8', marginLeft: 8 }}>취소: {c.cancelled_at}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 품목 테이블 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>품목 내역</span>
          <div style={{ height: 1, background: '#e2e8f0', flex: 1 }} />
        </div>
        <Table
          columns={itemColumns}
          dataSource={items}
          rowKey="id"
          size="middle"
          pagination={false}
        />
      </div>

      {/* 직접 완료 모달 — 정상/불량 수량 입력 (입고 검수와 동일 패턴) */}
      <Modal
        title="직접 완료 처리 (정상·불량 수량 검수)"
        open={receiveOpen}
        onCancel={() => setReceiveOpen(false)}
        onOk={handleComplete}
        confirmLoading={completeSubmitting}
        okText="완료 처리"
        cancelText="닫기"
        width={780}
      >
        <Table
          rowKey="item_id"
          size="small"
          pagination={false}
          dataSource={receiveRows}
          columns={[
            { title: '상품', dataIndex: 'product_name', key: 'product_name' },
            { title: '지시수량', dataIndex: 'ordered_qty', key: 'ordered_qty', width: 90, align: 'right', render: (v: number) => v.toLocaleString() },
            {
              title: '정상수량', key: 'qty', width: 130, align: 'right',
              render: (_, row, rIdx) => (
                <InputNumber
                  min={0} value={row.qty}
                  style={{ width: 110 }} controls={false} prefix="정상"
                  onChange={(v) => setReceiveRows((p) => p.map((r, i) => i === rIdx ? { ...r, qty: Math.max(0, Number(v ?? 0)) } : r))}
                />
              ),
            },
            ...(isDispose ? [] : [{
              title: '불량수량', key: 'defective', width: 130, align: 'right' as const,
              render: (_: unknown, row: typeof receiveRows[number], rIdx: number) => (
                <InputNumber
                  min={0} value={row.defective}
                  style={{ width: 110 }} controls={false} prefix="불량"
                  onChange={(v) => setReceiveRows((p) => p.map((r, i) => i === rIdx ? { ...r, defective: Math.max(0, Number(v ?? 0)) } : r))}
                />
              ),
            }]),
          ]}
        />
        <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
          * 정상수량 + 불량수량 = 처리할 총 수량. 둘 다 0이면 해당 품목은 처리되지 않음.
        </div>
        {!isDispose && receiveRows.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>불량 로케이션</Typography.Text>
            {receiveRows.map((row, index) => (
              <div
                key={`receive-defect-${row.item_id}`}
                style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, background: '#f8fafc' }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 10 }}>
                  {index + 1}. {row.product_name}
                </div>
                {(row.defective ?? 0) > 0 ? (
                  <>
                    <Select
                      placeholder="불량 로케이션 선택"
                      value={row.defectLocationId || undefined}
                      options={defectLocationOptions}
                      onChange={(value: string, option?: { label?: ReactNode } | { label?: ReactNode }[]) => setReceiveRows((prev) => prev.map((r) => (
                        r.item_id === row.item_id
                          ? {
                            ...r,
                            defectLocationId: value,
                            defectLocationCode: !Array.isArray(option) && option?.label != null ? String(option.label) : value,
                          }
                          : r
                      )))}
                      showSearch
                      optionFilterProp="label"
                      status={!row.defectLocationId ? 'error' : undefined}
                    />
                    {row.defaultDefectLocationCode && (
                      <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
                        기본값: {row.defaultDefectLocationCode}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>
                    불량 수량이 1개 이상이면 선택합니다.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* 입고 요청 메일 작성 — 백엔드 SMTP 자동 발송 */}
      <Modal
        title="입고 요청 메일 작성"
        open={mailFormOpen}
        onCancel={handleCloseMailForm}
        onOk={handleSendMail}
        okText="전송"
        cancelText="취소"
        confirmLoading={sendInboundRequestMutation.isPending}
        okButtonProps={{ disabled: !mailForm }}
        width={680}
        destroyOnClose
      >
        {previewQuery.isLoading || !mailForm ? (
          <Spin style={{ display: 'block', margin: '60px auto' }} />
        ) : (
          <Form layout="vertical" size="small">
            <Form.Item label="받는 사람" required>
              <Input
                value={mailForm.recipient}
                onChange={(e) => setMailForm({ ...mailForm, recipient: e.target.value })}
                placeholder="oms-team@company.com"
              />
            </Form.Item>
            <Form.Item label="발신자명">
              <Input
                value={mailForm.senderName}
                onChange={(e) => setMailForm({ ...mailForm, senderName: e.target.value })}
                placeholder="홍길동 (창고관리팀)"
              />
            </Form.Item>
            <Form.Item label="제목" required>
              <Input
                value={mailForm.subject}
                onChange={(e) => setMailForm({ ...mailForm, subject: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="본문 (편집 가능)" required style={{ marginBottom: 0 }}>
              <Input.TextArea
                value={mailForm.body}
                onChange={(e) => setMailForm({ ...mailForm, body: e.target.value })}
                autoSize={{ minRows: 10, maxRows: 18 }}
                style={{ fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}
              />
            </Form.Item>
            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
              * 회사 SMTP 계정으로 자동 전송됩니다. 답장은 로그인된 운영자 메일로 회신됩니다.
            </div>
          </Form>
        )}
      </Modal>

      {/* 출고지시서 취소 후보 모달 */}
      <Modal
        title="잡고 있는 출고지시서 취소"
        open={cancelCandidatesOpen}
        onCancel={() => setCancelCandidatesOpen(false)}
        onOk={handleConfirmCancelOutbounds}
        okText={`선택 취소 (${selectedCancelIds.length}건)`}
        cancelText="닫기"
        confirmLoading={cancelSubmitting}
        okButtonProps={{ danger: true, disabled: selectedCancelIds.length === 0 }}
        width={760}
      >
        {cancelLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : cancelCandidates.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
            취소 가능한 출고지시서가 없습니다.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              체크박스로 선택한 출고지시서를 일괄 취소합니다. 취소 후 다시 [승인]을 눌러주세요.
            </div>
            <Table
              size="small"
              rowKey="outboundOrderId"
              dataSource={cancelCandidates}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedCancelIds,
                onChange: (keys) => setSelectedCancelIds(keys as string[]),
              }}
              columns={[
                {
                  title: '지시서번호', dataIndex: 'orderNo', key: 'orderNo', width: 180,
                  render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
                },
                {
                  title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center',
                  render: (v: 'draft' | 'approved') => (
                    <Tag color={v === 'draft' ? 'default' : 'processing'}>
                      {v === 'draft' ? '임시' : '승인'}
                    </Tag>
                  ),
                },
                { title: '출고예정일', dataIndex: 'scheduledDate', key: 'scheduledDate', width: 110, render: (v: string | null) => v ?? '-' },
                { title: '출고처', dataIndex: 'storeName', key: 'storeName', render: (v: string | null) => v ?? '-' },
                {
                  title: '출고 예정 수량', dataIndex: 'reservedQty', key: 'reservedQty', width: 120, align: 'right',
                  render: (v: number) => <span style={{ fontWeight: 600, color: '#ef4444' }}>{v.toLocaleString()}</span>,
                },
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
}
