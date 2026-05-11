import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Typography, Table, Card, Descriptions, Button, Space, Checkbox, App, Result, Spin,
  Row, Col, Tag, Popover, Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined, PrinterOutlined, CheckOutlined,
  InboxOutlined, CheckCircleOutlined, WarningOutlined, QrcodeOutlined,
  EnvironmentOutlined, CloseCircleOutlined, EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { PlacementItem, PlacementOrder } from '@/types/order';
import { PLACEMENT_ORDER_STATUS_CONFIG } from '@/types/order';
import {
  useInboundOrder, usePlacementOrders,
  useCompletePlacementItem, useCompletePlacementOrder,
} from '@/hooks/useInboundQuery';
import OrderQrBadge from '@/components/OrderQrBadge';
import PrintDocument from '@/components/PrintDocument';
import PermissionButton from '@/components/PermissionButton';
import AssignLocationModal from '@/components/AssignLocationModal';
import { useAuth } from '@/hooks/useAuth';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { extractApiErrorMessage, isCapacityExceededError } from '@/utils/apiError';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

const { Title, Text } = Typography;

const statIcon = (color: string) => ({
  width: 32, height: 32, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 16, color, background: `${color}14`, border: `1px solid ${color}22`,
});
const tableHeaderTitle = (label: string) => (
  <span style={{ color: '#334155', fontWeight: 600, fontSize: 12, letterSpacing: '0.01em' }}>{label}</span>
);
const tableHeaderCellStyle: React.CSSProperties = {
  background: '#f8fafc',
  color: '#334155',
  borderBottom: '2px solid #dbe3ee',
  borderRight: 'none',
};

export default function InboundPlacementPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const placementReturnTo = useMemo(
    () => `${location.pathname}${location.search || ''}`,
    [location.pathname, location.search],
  );

  /** 레이아웃 편집기(메뉴로만 열었을 때)에서도 "돌아가기"에 쓸 수 있도록 */
  const RETURN_TO_KEY = 'wbs:layout:returnTo';
  const RETURN_LABEL_KEY = 'wbs:layout:returnLabel';
  useEffect(() => {
    try {
      sessionStorage.setItem(RETURN_TO_KEY, placementReturnTo);
      sessionStorage.setItem(RETURN_LABEL_KEY, '적치 지시');
    } catch {
      /* no-op */
    }
  }, [placementReturnTo]);
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  // 적치 진행은 입고지시서 detail 채널 (회사+orderId 별 분리) 로 push — 필터 불필요
  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId && id ? `/topic/admin/inbound/${clientId}/${id}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['placement-orders', id] });
      queryClient.invalidateQueries({ queryKey: ['all-placements'] });
      queryClient.invalidateQueries({ queryKey: ['inbound-order', id] });
      queryClient.invalidateQueries({ queryKey: ['inbound-items', id] });
      showStompToast(message, event);
    },
  );

  const { data: order, isLoading: orderLoading } = useInboundOrder(id);
  const { data: placementOrders = [], isLoading: poLoading } = usePlacementOrders(id);
  const completeItemMutation = useCompletePlacementItem();
  const completeOrderMutation = useCompletePlacementOrder();
  const printRef = useRef<HTMLDivElement>(null);
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('INBOUND', 'UPDATE');
  const userMap = useUserNameMap();
  const resolveUser = (id: string | null | undefined) => resolveUserName(userMap, id);

  // 미배정 위치 지정 모달
  const [assignTarget, setAssignTarget] = useState<PlacementItem | null>(null);

  // 모든 PlacementOrder의 items를 평탄화
  const allItems = useMemo(() => placementOrders.flatMap((po) => po.items), [placementOrders]);
  const unassignedCount = useMemo(() => allItems.filter((p) => p.is_unassigned).length, [allItems]);
  const stats = useMemo(() => {
    const total = allItems.length;
    const done = allItems.filter((p) => p.is_placed).length;
    const inspectDefect = allItems.filter((p) => p.is_defect).reduce((s, p) => s + p.qty, 0);
    const placingDefect = allItems.filter((p) => !p.is_defect).reduce((s, p) => s + (p.defect_qty ?? 0), 0);
    return { total, done, pending: total - done, inspectDefect, placingDefect };
  }, [allItems]);

  if (orderLoading || poLoading) return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  if (!order) return <Result status="404" title="지시서를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/order/inbound')}>목록으로</Button>} />;

  const handleCompleteItem = (item: PlacementItem) => {
    completeItemMutation.mutate(item.id, {
      onSuccess: () => message.success(`${item.location_code || item.rack_code} 적치 완료`),
      onError: (err) => {
        const msg = extractApiErrorMessage(err, '적치 완료에 실패했습니다.');
        message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
      },
    });
  };

  const handleCompleteOrder = (po: PlacementOrder) => {
    // 미적치 품목(미배정 또는 미완료) 사전 체크 — BE 가 거부할 케이스를 미리 안내.
    const unplaced = po.items.filter((it) => !it.is_placed);
    const unassigned = unplaced.filter((it) => !it.location_id);
    if (unassigned.length > 0) {
      modal.warning({
        title: '전체 완료할 수 없습니다',
        content: `위치가 지정되지 않은 품목이 ${unassigned.length}건 있습니다. 먼저 위치를 지정해 주세요.`,
      });
      return;
    }
    if (unplaced.length > 0) {
      modal.warning({
        title: '전체 완료할 수 없습니다',
        content: `아직 적치되지 않은 품목이 ${unplaced.length}건 있습니다. 각 품목을 개별 완료한 뒤 다시 시도해 주세요.`,
      });
      return;
    }

    modal.confirm({
      title: `적치 지시서 ${po.placement_no} 전체 완료 처리하시겠습니까?`,
      content: '모든 품목이 적치되었음을 확정합니다.',
      onOk: () => completeOrderMutation.mutateAsync(po.id)
        .then(() => message.success('적치 지시서 전체 완료'))
        .catch((err) => {
          const msg = extractApiErrorMessage(err, '전체 완료 처리에 실패했습니다.');
          message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
          throw err; // 모달이 닫히지 않도록 재throw
        }),
    });
  };

  const goLocationView = (item: PlacementItem) => {
    if (!item.location_id) return;
    if (!order.warehouse_id) {
      message.warning('창고 정보가 없어 위치 조회로 이동할 수 없습니다.');
      return;
    }
    const params = new URLSearchParams({ wh: order.warehouse_id, tab: 'rack-inventory' });
    params.set('locationId', item.location_id);
    if (item.location_code) params.set('locationCode', item.location_code);
    if (item.rack_code && item.rack_code !== '(미정)' && item.rack_code !== '-') {
      params.set('rackCode', item.rack_code);
    }
    navigate(`/warehouse/monitoring?${params.toString()}`);
  };

  const columns: ColumnsType<PlacementItem> = [
    {
      title: tableHeaderTitle('순서'), dataIndex: 'seq', key: 'seq', width: 50, align: 'center',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: number) => <span style={{ fontWeight: 600, color: '#334155' }}>{v}</span>,
    },
    {
      title: tableHeaderTitle('상품'), key: 'product', width: 240,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => (
        <div style={{ lineHeight: 1.5 }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: '#0f172a' }}>
            {r.product_name}
            {r.is_defect && <Tag color="red" style={{ marginLeft: 6, fontSize: 10 }}>불량</Tag>}
          </div>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{r.sku}</span>
        </div>
      ),
    },
    {
      title: tableHeaderTitle('정상수량'), key: 'normal_qty', width: 80, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        const normal = r.is_defect ? 0 : (r.qty - (r.defect_qty ?? 0));
        return <span style={{ fontSize: 15, fontWeight: 600, color: normal > 0 ? '#1677ff' : '#e2e8f0' }}>{normal}</span>;
      },
    },
    {
      title: tableHeaderTitle('불량'), key: 'defect_qty', width: 70, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        const defect = r.is_defect ? r.qty : 0;
        return <span style={{ fontSize: 15, fontWeight: 600, color: defect > 0 ? '#ef4444' : '#e2e8f0' }}>{defect}</span>;
      },
    },
    {
      title: tableHeaderTitle('로케이션'), dataIndex: 'location_code', key: 'location_code', width: 260,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_: string, r) => r.is_unassigned
        ? (
          <div style={{ lineHeight: 1.4 }}>
            <Tag color="red" style={{ margin: 0, fontWeight: 600 }}>위치 미정</Tag>
            <div style={{ marginTop: 4, fontSize: 11, color: '#8c2f39' }}>
              {r.unassigned_reason || '자동 추천 위치를 찾지 못했습니다.'}
            </div>
          </div>
        )
        : (
          <Space size={6}>
            <Tag
              color="orange"
              style={{ margin: 0, fontWeight: 600, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}
              title={r.location_code || r.rack_code || ''}
            >
              {(() => {
                const full = r.location_code || r.rack_code || '';
                if (!full) return '-';
                // 마지막 3토큰만 노출(예: SELF-089-01) — 풀 코드는 hover로
                return full.split('-').slice(-3).join('-') || full;
              })()}
            </Tag>
            <Tooltip title="재고 위치 조회에서 보기">
              <Button
                size="small"
                type="text"
                icon={<EnvironmentOutlined />}
                onClick={() => goLocationView(r)}
                disabled={!r.location_id}
                style={{ color: '#1677ff' }}
              />
            </Tooltip>
            {/* 적치 완료 전이면 위치 재지정 가능 — race condition 으로 추천 위치가 점유당했을 때 대응 */}
            {!r.is_placed && (
              <Tooltip title="다른 위치로 재지정">
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => setAssignTarget(r)}
                  disabled={!canUpdate}
                  style={{ color: '#7c3aed' }}
                />
              </Tooltip>
            )}
          </Space>
        ),
    },
    {
      title: tableHeaderTitle('적치'), key: 'placed', width: 110, align: 'center',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        if (r.is_placed) return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
        if (r.is_unassigned) {
          return (
            <Button
              size="small" type="primary" icon={<EnvironmentOutlined />}
              disabled={!canUpdate}
              onClick={() => setAssignTarget(r)}
            >
              위치 지정
            </Button>
          );
        }
        return <Checkbox checked={false} disabled={completeItemMutation.isPending || !canUpdate} onChange={() => handleCompleteItem(r)} />;
      },
    },
  ];

  return (
    <>
      <div className="no-print" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
        {/* ── 헤더 ── */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18, gap: 10 }}>
          <Space size={8} align="center">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/order/inbound/${id}`)}>지시서</Button>
            <Title level={4} style={{ margin: 0, color: '#0f172a' }}>적치 지시서 — {order.order_no}</Title>
            {placementOrders[0] && (
              <Popover content={<OrderQrBadge value={`placement:${placementOrders[0].id}`} label={placementOrders[0].placement_no} title="적치 지시서" size={160} />} trigger="click">
                <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b', fontSize: 18 }} />
              </Popover>
            )}
          </Space>
          <div style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>출력</Button>
          </div>
        </div>

        {/* ── 정보 ── */}
        <Card size="small" style={{ marginBottom: 20, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="입고 지시서">{order.order_no}</Descriptions.Item>
            <Descriptions.Item label="입고처">{order.vendor_name}</Descriptions.Item>
            <Descriptions.Item label="창고">{order.warehouse_name}</Descriptions.Item>
            <Descriptions.Item label="상태"><Tag color={order.status === 'completed' ? 'success' : 'orange'}>{order.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="생성자">{resolveUser(order.created_by)}</Descriptions.Item>
          </Descriptions>
        </Card>

        {/* ── 미배정 경고 ── */}
        {unassignedCount > 0 && (
          <div style={{ marginBottom: 12, padding: '12px 16px', background: '#fff1f0', border: '1px solid #ffccc7', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <WarningOutlined style={{ color: '#ef4444', fontSize: 18 }} />
            <Text strong style={{ color: '#b91c1c' }}>
              자동 추천으로 배정하지 못한 품목이 {unassignedCount}건 있습니다.
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              각 품목의 사유를 확인한 뒤 "위치 지정" 버튼으로 수동 배정하세요.
            </Text>
          </div>
        )}

        {/* ── 요약 ── */}
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { title: '총 품목', value: stats.total, color: '#334155', icon: <InboxOutlined /> },
            { title: '적치 완료', value: stats.done, color: '#52c41a', icon: <CheckCircleOutlined /> },
            { title: '미적치', value: stats.pending, color: stats.pending > 0 ? '#f59e0b' : '#cbd5e1', icon: <WarningOutlined /> },
            { title: '검수 불량', value: stats.inspectDefect, color: stats.inspectDefect > 0 ? '#ef4444' : '#cbd5e1', icon: <CloseCircleOutlined /> },
            { title: '적치중 불량', value: stats.placingDefect, color: stats.placingDefect > 0 ? '#ef4444' : '#cbd5e1', icon: <CloseCircleOutlined /> },
          ].map((c) => (
            <Col flex="1" key={c.title}>
              <Card size="small" style={{ border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={statIcon(c.color)}>{c.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.title}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{c.value}</div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {/* ── 적치 지시서별 섹션 ── */}
        <div style={{ marginTop: 56, paddingBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>상품 내역</span>
            <div style={{ height: 1, background: '#e2e8f0', flex: 1 }} />
          </div>
        {placementOrders.map((po) => {
          const poCfg = PLACEMENT_ORDER_STATUS_CONFIG[po.status];
          return (
            <Card
              key={po.id}
              size="small"
              title={
                <Space>
                  <span style={{ fontWeight: 600 }}>{po.placement_no}</span>
                  <Popover content={<OrderQrBadge value={`placement:${po.id}`} label={po.placement_no} title="적치 지시서" size={160} />} trigger="click">
                    <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b' }} />
                  </Popover>
                  <Tag color={poCfg?.color}>{poCfg?.label}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {po.placed_items}/{po.total_items} 완료
                  </Text>
                </Space>
              }
              extra={
                po.status !== 'completed' && (
                  <PermissionButton resource="INBOUND" action="UPDATE" type="primary" size="small" icon={<CheckOutlined />}
                    onClick={() => handleCompleteOrder(po)}
                    loading={completeOrderMutation.isPending}>
                    전체 완료
                  </PermissionButton>
                )
              }
              style={{ marginBottom: 16 }}
            >
              <Table
                columns={columns}
                dataSource={[...po.items].sort((a, b) => {
                  // 같은 productId 끼리 묶고, 같은 제품 내에서는 정상→불량 순서
                  const pa = a.product_id ?? a.sku;
                  const pb = b.product_id ?? b.sku;
                  if (pa !== pb) return String(pa).localeCompare(String(pb));
                  return Number(a.is_defect) - Number(b.is_defect);
                })}
                rowKey="id"
                size="middle"
                pagination={false}
                scroll={po.items.length > 6 ? { y: 360 } : undefined}
                rowClassName={(r) => r.is_placed ? 'placement-done' : r.is_defect ? 'placement-defect' : ''}
                onRow={() => ({ style: { height: 56 } })}
              />
            </Card>
          );
        })}
        </div>

        {placementOrders.length === 0 && (
          <Result icon={<InboxOutlined style={{ color: '#cbd5e1' }} />} title="적치 지시서가 아직 없습니다" />
        )}
      </div>

      {/* ── 미배정 위치 지정 모달 ── */}
      <AssignLocationModal
        open={!!assignTarget}
        item={assignTarget}
        warehouseId={order.warehouse_id}
        onClose={() => setAssignTarget(null)}
        returnTo={placementReturnTo}
        returnToLabel="적치 지시"
      />

      {/* ── 인쇄용 ── */}
      <div className="print-only">
        <PrintDocument
          ref={printRef} title="적치 지시서"
          subtitle={`${order.vendor_name} · ${order.warehouse_name}`}
          orderNo={placementOrders[0]?.placement_no ?? order.order_no}
          qrValue={placementOrders[0] ? `placement:${placementOrders[0].id}` : `inbound:${order.id}`}
          documentOperator={order.created_by}
          info={[
            { label: '지시번호', value: order.order_no }, { label: '입고처', value: order.vendor_name },
            { label: '창고', value: order.warehouse_name }, { label: '상태', value: order.status },
          ]}
          columns={[
            { label: '순서', key: 'seq', align: 'center', width: 44 }, { label: '상품명', key: 'product_name' },
            { label: 'SKU', key: 'sku', width: 100 }, { label: '수량', key: 'qty', numeric: true, width: 56, bold: true },
            { label: '로케이션', key: 'location_code', align: 'center', width: 160 },
            { label: '확인', key: 'chk', align: 'center', width: 40 },
          ]}
          data={allItems.map((p) => ({
            seq: p.seq, product_name: p.product_name, sku: p.sku, qty: String(p.qty),
            location_code: p.location_code || p.rack_code || '-', chk: '☐',
          }))}
          footer={{ left: `총 ${stats.total}개 품목 · ${allItems.reduce((s, p) => s + p.qty, 0)}개`, right: '' }}
        />
      </div>

      <style>{`
        .placement-done td { background: #f0fdf4 !important; }
        .placement-defect td { background: #fef2f2 !important; }
        .ant-table-thead > tr > th { background: #f8fafc !important; color: #475569 !important; font-weight: 600 !important; font-size: 12px !important; }
        .print-only { display: none; }
        @media print { .no-print { display: none !important; } .print-only { display: block !important; } }
      `}</style>
    </>
  );
}
