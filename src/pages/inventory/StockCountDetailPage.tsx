import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Table, Descriptions, Steps, Button, Space, InputNumber, Input, Tag, App, Card, Result, Popover, Tooltip, Row, Col,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, PlayCircleOutlined, QrcodeOutlined, EnvironmentOutlined,
  AuditOutlined, InboxOutlined, CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import OrderQrBadge from '@/components/OrderQrBadge';
import type { ColumnsType } from 'antd/es/table';
import type { StockCountItem, StockCountStatus, StockCountItemStatus } from '@/types/inventory';
import {
  useStockCountDetail,
  useStartStockCount, useCountStockCountItem, useCompleteStockCount,
  useInventoryByRack,
} from '@/hooks/useInventoryQuery';
import { useProducts } from '@/hooks/useMasterQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import PermissionButton from '@/components/PermissionButton';
import { useUserNameMap, resolveUserName } from '@/hooks/useUserNameMap';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';
import { extractApiErrorMessage, isCapacityExceededError } from '@/utils/apiError';

interface StockCountStompEvent {
  module?: string;
  type?: 'CREATED' | 'STARTED' | 'COUNTED' | 'COMPLETED' | 'CANCELLED';
  orderId?: string;
  orderNo?: string;
  userId?: string;
  occurredAt?: string;
}

const { Title } = Typography;

const statusConfig: Record<StockCountStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '초안' },
  in_progress: { color: 'processing', label: '진행중' },
  completed: { color: 'success', label: '완료' },
  cancelled: { color: 'error', label: '취소' },
};

const stepItems = [
  { title: '초안', description: '실사 지시서 등록' },
  { title: '진행중', description: '품목 수량 입력' },
  { title: '완료', description: '재고 자동 조정' },
];
const statusToStep: Record<string, number> = {
  draft: 0, in_progress: 1, completed: 2, cancelled: -1,
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

/** 풀 location_code 에서 끝 3개 세그먼트만 추출 (예: LC-RK-ZN-SEL-POWER-014-PCEL-010-01 → PCEL-010-01) */
function shortLocationCode(code: string): string {
  const parts = code.split('-');
  return parts.length >= 3 ? parts.slice(-3).join('-') : code;
}

const itemStatusConfig: Record<StockCountItemStatus, { color: string; label: string }> = {
  pending: { color: 'default', label: '대기' },
  counted: { color: 'processing', label: '입력완료' },
  adjusted: { color: 'success', label: '조정됨' },
};

export default function StockCountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? '';
  const navigate = useNavigate();
  const { message, modal } = App.useApp();

  const queryClient = useQueryClient();
  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId && orderId ? `/topic/admin/stock-count/${clientId}/${orderId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['stock-count-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['stock-count-orders'] });
      showStompToast(message, event);
    },
  );

  const { data: detail, isLoading } = useStockCountDetail(orderId);
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const startMutation = useStartStockCount();
  const userMap = useUserNameMap();
  const resolveUser = (id: string | null | undefined) => resolveUserName(userMap, id);
  const countItemMutation = useCountStockCountItem();
  const completeMutation = useCompleteStockCount();

  // STOMP — 백엔드 공용 admin 토픽 (작업자 처리 이벤트, 입고/출고/기타입출고 패턴과 동일)
  useStompInvalidate<StockCountStompEvent>(
    orderId ? `/topic/admin/stock-count/${orderId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['stock-count-detail', orderId] });
      queryClient.invalidateQueries({ queryKey: ['stock-count-orders'] });
      const orderNo = event.orderNo ?? '';
      if (event.type === 'COUNTED') message.info(`${orderNo} 품목 입력`);
      else if (event.type === 'STARTED') message.info(`${orderNo} 실사 시작`);
      else if (event.type === 'COMPLETED') {
        message.success(`${orderNo} 실사 완료`);
        // 완료 시 재고도 갱신 (자동 조정 반영)
        queryClient.invalidateQueries({ queryKey: ['inventory-by-rack'] });
        queryClient.invalidateQueries({ queryKey: ['inventory-stocks'] });
      }
      else if (event.type === 'CANCELLED') message.warning(`${orderNo} 실사 취소`);
    },
    { getKey: () => orderId },
  );

  // UUID → 이름 매핑
  const productMap = useMemo(() => {
    const m = new Map<string, { name: string; sku: string }>();
    products.forEach((p) => m.set(p.id, { name: p.name, sku: p.sku }));
    return m;
  }, [products]);

  // 해당 창고의 inventory 조회 → locationId → location_code 매핑 (실사 품목 표시용)
  const { data: inventoryByRack } = useInventoryByRack(detail?.order.warehouse_id ?? null);
  const locationCodeMap = useMemo(() => {
    const m = new Map<string, string>();
    inventoryByRack?.racks.forEach((rack) => {
      rack.locations.forEach((loc) => {
        m.set(loc.location_id, loc.location_code);
      });
    });
    return m;
  }, [inventoryByRack]);

  const warehouseName = useMemo(
    () => warehouses.find((w) => w.id === detail?.order.warehouse_id)?.name ?? '-',
    [warehouses, detail],
  );

  // 품목에 상품명/SKU + 로케이션 코드 조인
  const enrichedItems = useMemo(() => {
    if (!detail) return [];
    return detail.items.map((item) => {
      const prod = productMap.get(item.product_id);
      const locationCode = locationCodeMap.get(item.location_id) ?? item.location_code ?? '';
      return {
        ...item,
        product_name: prod?.name ?? item.product_id,
        sku: prod?.sku ?? '-',
        location_code: locationCode,
      };
    });
  }, [detail, productMap, locationCodeMap]);

  // 로컬 수량 입력 상태
  const [localCount, setLocalCount] = useState<Record<string, { qty: number | null; note: string }>>({});

  const stats = useMemo(() => {
    const total = enrichedItems.length;
    const counted = enrichedItems.filter((i) => i.status !== 'pending').length;
    const pending = enrichedItems.filter((i) => i.status === 'pending').length;
    const diff = enrichedItems.filter((i) => i.diff_qty !== null && i.diff_qty !== 0).length;
    return { total, counted, pending, diff };
  }, [enrichedItems]);

  if (isLoading) return <Table loading />;
  if (!detail) return <Result status="404" title="지시서를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/inventory/stock-count')}>목록으로</Button>} />;

  const { order } = detail;
  const status = order.status;
  const isEditable = status === 'in_progress';
  const currentStep = statusToStep[status] ?? 0;

  const handleCountChange = (itemId: string, qty: number | null) => {
    setLocalCount((prev) => ({ ...prev, [itemId]: { qty, note: prev[itemId]?.note ?? '' } }));
  };

  const handleNoteChange = (itemId: string, note: string) => {
    setLocalCount((prev) => ({ ...prev, [itemId]: { qty: prev[itemId]?.qty ?? null, note } }));
  };

  const handleSaveItem = (itemId: string) => {
    const local = localCount[itemId];
    if (local?.qty == null) return;
    countItemMutation.mutate(
      { orderId, itemId, countQty: local.qty, note: local.note || undefined },
      {
        onSuccess: () => { message.success('수량 저장'); setLocalCount((p) => { const n = { ...p }; delete n[itemId]; return n; }); },
        onError: (err) => {
          const msg = extractApiErrorMessage(err, '수량 저장에 실패했습니다.');
          message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
        },
      },
    );
  };

  const handleStart = () => {
    modal.confirm({
      title: '실사를 시작하시겠습니까?',
      onOk: () => startMutation.mutateAsync(orderId).then(() => message.success('실사 시작')),
    });
  };

  const handleComplete = () => {
    const pending = enrichedItems.filter((i) => i.status === 'pending');
    if (pending.length > 0) {
      message.warning(`아직 입력되지 않은 품목이 ${pending.length}건 있습니다.`);
      return;
    }
    const adjustments = enrichedItems.filter((i) => i.diff_qty !== null && i.diff_qty !== 0);
    modal.confirm({
      title: '실사 완료',
      content: `차이 ${adjustments.length}건에 대해 자동 재고 조정이 실행됩니다.`,
      onOk: () => completeMutation.mutateAsync(orderId)
        .then(() => message.success('실사 완료'))
        .catch((err) => {
          const msg = extractApiErrorMessage(err, '실사 완료에 실패했습니다.');
          message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
          throw err;
        }),
    });
  };

  const columns: ColumnsType<StockCountItem> = [
    { title: tableHeaderTitle('SKU'), dataIndex: 'sku', key: 'sku', width: 130,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: tableHeaderTitle('상품명'), dataIndex: 'product_name', key: 'product_name', width: 200, ellipsis: true,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: string) => <span title={v}>{v}</span> },
    { title: tableHeaderTitle('로케이션'), dataIndex: 'location_code', key: 'location_code', width: 180,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: string, record) => {
        if (!v && !record.location_id) return '-';
        const display = v ? shortLocationCode(v) : '-';
        const params = new URLSearchParams({
          wh: detail?.order.warehouse_id ?? '',
          tab: 'rack-inventory',
          locationId: record.location_id,
          ...(v ? { locationCode: v } : {}),
        });
        return (
          <Space size={4} wrap={false}>
            <Tooltip title={v || '-'}>
              <Tag color="blue" style={{ margin: 0, fontWeight: 600, fontSize: 12 }}>{display}</Tag>
            </Tooltip>
            <Tooltip title="위치 조회">
              <Button
                type="text"
                size="small"
                icon={<EnvironmentOutlined />}
                onClick={() => navigate(`/warehouse/monitoring?${params.toString()}`)}
                disabled={!record.location_id}
                style={{ color: '#1677ff', flexShrink: 0 }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    { title: tableHeaderTitle('시스템수량'), dataIndex: 'system_qty', key: 'system_qty', width: 100, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }) },
    {
      title: tableHeaderTitle('실사수량'), key: 'count_qty', width: 180, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, record) => {
        if (!isEditable) return record.count_qty ?? '-';
        if (record.status !== 'pending') return record.count_qty ?? '-';
        const local = localCount[record.id];
        return (
          <Space size={4}>
            <InputNumber
              size="small" min={0}
              value={local?.qty !== undefined ? local.qty : record.count_qty}
              onChange={(v) => handleCountChange(record.id, v)}
              onPressEnter={() => handleSaveItem(record.id)}
              style={{ width: 80 }}
            />
            <Button size="small" type="link" onClick={() => handleSaveItem(record.id)}
              disabled={local?.qty == null} loading={countItemMutation.isPending}>
              저장
            </Button>
          </Space>
        );
      },
    },
    {
      title: tableHeaderTitle('차이'), key: 'diff_qty', width: 80, align: 'right',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, r) => {
        const diff = r.diff_qty;
        if (diff == null) return '-';
        if (diff === 0) return '0';
        return <strong style={{ color: diff > 0 ? '#1677ff' : '#ff4d4f' }}>{diff > 0 ? '+' : ''}{diff}</strong>;
      },
    },
    {
      title: tableHeaderTitle('비고'), key: 'note', width: 160,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (_, record) => {
        if (!isEditable || record.status !== 'pending') return record.note ?? '-';
        return (
          <Input size="small" placeholder="비고"
            value={localCount[record.id]?.note ?? record.note ?? ''}
            onChange={(e) => handleNoteChange(record.id, e.target.value)}
          />
        );
      },
    },
    {
      title: tableHeaderTitle('상태'), dataIndex: 'status', key: 'status', width: 90, align: 'center',
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: StockCountItemStatus) => {
        const cfg = itemStatusConfig[v] ?? { color: 'default', label: v ?? '-' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: tableHeaderTitle('작업자'), dataIndex: 'counted_by', key: 'counted_by', width: 100,
      onHeaderCell: () => ({ style: tableHeaderCellStyle }),
      render: (v: string | null) => resolveUser(v),
    },
  ];

  return (
    <div style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 18, gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', gap: 8, minWidth: 0 }}>
          <Space size={8} align="center" style={{ minWidth: 0, flexShrink: 1, overflow: 'hidden' }}>
            <Tooltip title="목록으로">
              <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inventory/stock-count')} />
            </Tooltip>
            <Tooltip title="재고실사">
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: '#0d9488',
                  fontSize: 13,
                  padding: '3px 7px',
                  borderRadius: 4,
                  background: '#f0fdfa',
                  border: '1px solid #99f6e4',
                  flexShrink: 0,
                }}
              >
                <AuditOutlined style={{ fontSize: 13 }} />
              </span>
            </Tooltip>
            <Title level={4} style={{ margin: 0, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.order_no}</Title>
            <Tag color={statusConfig[status]?.color} style={{ flexShrink: 0 }}>{statusConfig[status]?.label ?? status}</Tag>
            <Popover
              content={<OrderQrBadge value={`stock-count:${order.id}`} label={order.order_no} title="재고 실사" size={160} />}
              trigger="click"
              placement="bottomLeft"
            >
              <Button type="text" size="small" icon={<QrcodeOutlined />} style={{ color: '#64748b', fontSize: 18, flexShrink: 0 }} />
            </Popover>
          </Space>

          <Space size={6} wrap style={{ flexShrink: 0 }}>
            {status === 'draft' && (
              <PermissionButton resource="STOCK_COUNT" action="UPDATE" type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} loading={startMutation.isPending}>실사 시작</PermissionButton>
            )}
            {isEditable && (
              <PermissionButton resource="STOCK_COUNT" action="APPROVE" type="primary" icon={<CheckOutlined />} onClick={handleComplete} loading={completeMutation.isPending}>실사 완료</PermissionButton>
            )}
          </Space>
        </div>
      </div>

      {/* ── 정보 카드 ── */}
      <Card size="small" style={{ marginBottom: 20, border: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="창고">{warehouseName}</Descriptions.Item>
          <Descriptions.Item label="생성자">{resolveUser(order.created_by)}</Descriptions.Item>
          <Descriptions.Item label="생성일">{order.created_at}</Descriptions.Item>
          <Descriptions.Item label="진행률">{stats.counted}/{stats.total}건 입력</Descriptions.Item>
        </Descriptions>
      </Card>

      <div style={{ marginBottom: 24 }}>
        <Steps current={currentStep} items={stepItems} size="small" responsive style={{ marginBottom: 0 }} />
      </div>

      {/* ── 요약 카드 ── */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { title: '총 품목', value: stats.total, color: '#334155', icon: <InboxOutlined /> },
          { title: '입력 완료', value: stats.counted, color: '#52c41a', icon: <CheckCircleOutlined /> },
          { title: '대기', value: stats.pending, color: stats.pending > 0 ? '#f59e0b' : '#cbd5e1', icon: <ClockCircleOutlined /> },
          { title: '차이 품목', value: stats.diff, color: stats.diff > 0 ? '#ef4444' : '#cbd5e1', icon: <WarningOutlined /> },
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

      {/* ── 품목 테이블 ── */}
      <div style={{ marginTop: 56, paddingBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>실사 품목</span>
          <div style={{ height: 1, background: '#e2e8f0', flex: 1 }} />
        </div>
        <Table
          columns={columns}
          dataSource={enrichedItems}
          rowKey="id"
          size="middle"
          pagination={false}
          loading={isLoading}
          scroll={{ x: 1180 }}
          rowClassName={(r) => {
            if (r.diff_qty !== null && r.diff_qty !== 0) return 'row-diff';
            if (r.status !== 'pending') return 'row-done';
            return '';
          }}
        />
      </div>

      <style>{`
        .row-diff td { background: #fff7e6 !important; }
        .row-done td { background: #f0fdf4 !important; }
        .ant-table-thead > tr > th { background: #f8fafc !important; color: #475569 !important; font-weight: 600 !important; font-size: 12px !important; }
      `}</style>
    </div>
  );
}
