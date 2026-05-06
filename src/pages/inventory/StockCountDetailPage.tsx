import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography, Table, Descriptions, Button, Space, InputNumber, Input, Tag, App, Card, Result,
} from 'antd';
import { ArrowLeftOutlined, CheckOutlined, PlayCircleOutlined } from '@ant-design/icons';
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

  if (isLoading) return <Table loading />;
  if (!detail) return <Result status="404" title="지시서를 찾을 수 없습니다" extra={<Button onClick={() => navigate('/inventory/stock-count')}>목록으로</Button>} />;

  const { order } = detail;
  const status = order.status;
  const isEditable = status === 'in_progress';

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
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '로케이션', dataIndex: 'location_code', key: 'location_code', width: 220,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748b' }}>{v || '-'}</span> },
    { title: '시스템수량', dataIndex: 'system_qty', key: 'system_qty', width: 100, align: 'right' },
    {
      title: '실사수량', key: 'count_qty', width: 180, align: 'right',
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
      title: '차이', key: 'diff_qty', width: 80, align: 'right',
      render: (_, r) => {
        const diff = r.diff_qty;
        if (diff == null) return '-';
        if (diff === 0) return '0';
        return <strong style={{ color: diff > 0 ? '#1677ff' : '#ff4d4f' }}>{diff > 0 ? '+' : ''}{diff}</strong>;
      },
    },
    {
      title: '비고', key: 'note', width: 160,
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
      title: '상태', dataIndex: 'status', key: 'status', width: 90, align: 'center',
      render: (v: StockCountItemStatus) => <Tag color={itemStatusConfig[v]?.color}>{itemStatusConfig[v]?.label ?? v}</Tag>,
    },
    {
      title: '작업자', dataIndex: 'counted_by', key: 'counted_by', width: 100,
      render: (v: string | null) => resolveUser(v),
    },
  ];

  const diffCount = enrichedItems.filter((i) => i.diff_qty !== null && i.diff_qty !== 0).length;
  const countedCount = enrichedItems.filter((i) => i.status !== 'pending').length;

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/inventory/stock-count')}>목록</Button>
        <Title level={4} style={{ margin: 0 }}>{order.order_no}</Title>
        <Tag color={statusConfig[status]?.color}>{statusConfig[status]?.label ?? status}</Tag>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="창고">{warehouseName}</Descriptions.Item>
          <Descriptions.Item label="생성자">{resolveUser(order.created_by)}</Descriptions.Item>
          <Descriptions.Item label="생성일">{order.created_at}</Descriptions.Item>
          <Descriptions.Item label="진행률">{countedCount}/{enrichedItems.length}건 입력</Descriptions.Item>
          <Descriptions.Item label="차이 품목">{diffCount}건</Descriptions.Item>
        </Descriptions>
      </Card>

      <Table
        columns={columns}
        dataSource={enrichedItems}
        rowKey="id"
        size="middle"
        pagination={false}
        loading={isLoading}
        rowClassName={(r) => (r.diff_qty !== null && r.diff_qty !== 0 ? 'row-diff' : '')}
      />

      <Space style={{ marginTop: 16 }}>
        {status === 'draft' && (
          <PermissionButton resource="STOCK_COUNT" action="UPDATE" type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} loading={startMutation.isPending}>실사 시작</PermissionButton>
        )}
        {isEditable && (
          <PermissionButton resource="STOCK_COUNT" action="APPROVE" type="primary" icon={<CheckOutlined />} onClick={handleComplete} loading={completeMutation.isPending}>실사 완료</PermissionButton>
        )}
      </Space>

      <style>{`
        .row-diff td { background: #fff7e6 !important; }
      `}</style>
    </>
  );
}
