import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Table, Tag, Modal, Form, Select, Input, App, Space,
} from 'antd';
import { PlusOutlined, EyeOutlined, CloseOutlined, PlayCircleOutlined } from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { StockCountOrder, StockCountStatus } from '@/types/inventory';
import { useStockCountOrders, useCreateStockCount, useStartStockCount, useCancelStockCount, useSearchStockCounts } from '@/hooks/useInventoryQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import PermissionButton from '@/components/PermissionButton';
import { useAuth } from '@/hooks/useAuth';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

interface StockCountStompEvent {
  module?: string;
  type?: 'CREATED' | 'STARTED' | 'COUNTED' | 'COMPLETED' | 'CANCELLED';
  orderId?: string;
  orderNo?: string;
}

const { Title } = Typography;

const statusConfig: Record<StockCountStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '초안' },
  in_progress: { color: 'processing', label: '진행중' },
  completed: { color: 'success', label: '완료' },
  cancelled: { color: 'error', label: '취소' },
};

export default function StockAuditPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { hasPermission } = useAuth();
  const canStart = hasPermission('STOCK_COUNT', 'UPDATE');
  const canCancel = hasPermission('STOCK_COUNT', 'DELETE');

  const queryClient = useQueryClient();
  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId ? `/topic/admin/stock-count/${clientId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['stock-count-orders'] });
      showStompToast(message, event);
    },
  );

  const productFilter = useProductFilterForOrder();
  const { data: rawOrders = [], isLoading: rawLoading } = useStockCountOrders();
  const { data: searchedOrders = [], isLoading: searchLoading } = useSearchStockCounts(productFilter.productIds);
  const orders = productFilter.isFiltering ? searchedOrders : rawOrders;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;
  const { data: warehouses = [] } = useWarehouses();
  const createMutation = useCreateStockCount();
  const startMutation = useStartStockCount();
  const cancelMutation = useCancelStockCount();

  // STOMP — 백엔드 공용 admin 토픽 (목록 갱신, 상세는 StockCountDetailPage에서 처리)
  useStompInvalidate<StockCountStompEvent>('/topic/admin/stock-count', () => {
    queryClient.invalidateQueries({ queryKey: ['stock-count-orders'] });
  }, { getKey: () => 'list' });

  // 창고 UUID → 이름 매핑
  const warehouseMap = useMemo(() => {
    const m = new Map<string, string>();
    warehouses.forEach((w) => m.set(w.id, `${w.code} — ${w.name}`));
    return m;
  }, [warehouses]);

  // 주문에 창고명 조인
  const enrichedOrders = useMemo(
    () => orders.map((o) => ({ ...o, warehouse_name: warehouseMap.get(o.warehouse_id) ?? o.warehouse_id })),
    [orders, warehouseMap],
  );

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // 모달에서 선택된 창고에 따라 inventory 조회 (productId → locationId 매핑용)
  const selectedWarehouseId = Form.useWatch('warehouseId', form) as string | undefined;
  const { data: inventoryByRack } = useInventoryByRack(selectedWarehouseId ?? null);

  /** 창고 내 모든 위치를 (productId → locationId 배열)로 매핑 — 같은 상품이 여러 위치에 있으면 모두 포함 */
  const locationsByProduct = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!inventoryByRack) return m;
    inventoryByRack.racks.forEach((rack) => {
      rack.locations.forEach((loc) => {
        if (!loc.product_id) return;
        const arr = m.get(loc.product_id) ?? [];
        arr.push(loc.location_id);
        m.set(loc.product_id, arr);
      });
    });
    return m;
  }, [inventoryByRack]);

  /** 선택된 창고에 실제로 재고가 있는 상품 목록 — 실사 대상 후보 */
  const productsInWarehouse = useMemo(() => {
    if (!inventoryByRack) return [] as { id: string; sku: string; name: string; totalQty: number }[];
    const byProduct = new Map<string, { id: string; sku: string; name: string; totalQty: number }>();
    inventoryByRack.racks.forEach((rack) => {
      rack.locations.forEach((loc) => {
        if (!loc.product_id) return;
        const prev = byProduct.get(loc.product_id);
        const qty = (loc.available_qty ?? 0) + (loc.reserved_qty ?? 0) + (loc.pending_qty ?? 0) + (loc.defect_qty ?? 0);
        if (prev) prev.totalQty += qty;
        else byProduct.set(loc.product_id, {
          id: loc.product_id,
          sku: loc.product_sku ?? '-',
          name: loc.product_name ?? '-',
          totalQty: qty,
        });
      });
    });
    return Array.from(byProduct.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [inventoryByRack]);

  const handleCreate = () => {
    form.validateFields().then((values) => {
      if (selectedProductIds.length === 0) {
        message.warning('실사할 상품을 선택하세요.');
        return;
      }
      // 백엔드 정책: 프론트가 productId + locationId 채워서 보내야 함.
      // 같은 상품이 여러 위치에 있으면 각 위치마다 별도 item으로 전송.
      const items: { productId: string; locationId: string }[] = [];
      const missing: string[] = [];
      selectedProductIds.forEach((pid) => {
        const locs = locationsByProduct.get(pid) ?? [];
        if (locs.length === 0) {
          // 이 창고에 그 상품 재고 없음 → 실사 대상 아님
          const product = productsInWarehouse.find((p) => p.id === pid);
          missing.push(product?.name ?? pid);
        } else {
          locs.forEach((locationId) => items.push({ productId: pid, locationId }));
        }
      });
      if (missing.length > 0) {
        message.warning(`선택한 창고에 다음 상품의 재고가 없습니다: ${missing.join(', ')}`);
        return;
      }
      createMutation.mutate(
        {
          warehouseId: values.warehouseId,
          note: values.note ?? '',
          items,
        },
        {
          onSuccess: (newId) => {
            message.success('실사 지시서 생성');
            setModalOpen(false);
            setSelectedProductIds([]);
            navigate(`/inventory/stock-count/${newId}`);
          },
        },
      );
    });
  };

  const handleStart = (order: StockCountOrder) => {
    modal.confirm({
      title: `${order.order_no} 실사를 시작하시겠습니까?`,
      onOk: () => startMutation.mutateAsync(order.id).then(() => message.success('실사 시작')),
    });
  };

  const handleCancel = (order: StockCountOrder) => {
    modal.confirm({
      title: `${order.order_no} 취소하시겠습니까?`,
      okType: 'danger',
      onOk: () => cancelMutation.mutateAsync(order.id).then(() => message.success('취소 완료')),
    });
  };

  const columns: ColumnsType<StockCountOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 180 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 280, ellipsis: true, render: (v) => <span title={v} style={{ whiteSpace: 'nowrap' }}>{v}</span> },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 100, align: 'center',
      render: (v: StockCountStatus) => <Tag color={statusConfig[v]?.color}>{statusConfig[v]?.label ?? v}</Tag>,
    },
    { title: '비고', dataIndex: 'note', key: 'note', ellipsis: true },
    { title: '생성일', dataIndex: 'created_at', key: 'created_at', width: 110 },
    {
      title: '', key: 'action', width: 40, align: 'center',
      render: (_, record) => (
        <RowActionMenu
          items={[
            { key: 'detail', label: '상세', icon: <EyeOutlined />, onClick: () => navigate(`/inventory/stock-count/${record.id}`) },
            { key: 'start', label: '시작', icon: <PlayCircleOutlined />, hidden: record.status !== 'draft' || !canStart, onClick: () => handleStart(record) },
            { key: 'cancel', label: '취소', icon: <CloseOutlined />, danger: true, hidden: record.status !== 'draft' || !canCancel, onClick: () => handleCancel(record) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>재고 실사</Title>
        <Space>
          <ProductFilterTriggerButton
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
          />
          <PermissionButton resource="STOCK_COUNT" action="CREATE" type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setSelectedProductIds([]); setModalOpen(true); }}>실사 지시서 생성</PermissionButton>
        </Space>
      </div>
      {productFilter.isFiltering && (
        <div style={{ marginBottom: 12 }}>
          <ProductFilterStatusBar
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
            filteredLineCount={orders.length}
          />
        </div>
      )}
      <Table columns={columns} dataSource={enrichedOrders} rowKey="id" loading={isLoading}
        onRow={(r) => ({ onClick: () => navigate(`/inventory/stock-count/${r.id}`), style: { cursor: 'pointer' } })} />
      <Modal title="실사 지시서 생성" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleCreate}
        confirmLoading={createMutation.isPending} okText="생성" cancelText="취소" width={560}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="warehouseId" label="창고" rules={[{ required: true, message: '창고를 선택하세요' }]}>
            <Select
              placeholder="창고 선택"
              onChange={() => setSelectedProductIds([])}
              options={warehouses.filter((w) => w.is_active).map((w) => ({ label: `${w.code} — ${w.name}`, value: w.id }))}
            />
          </Form.Item>
          <Form.Item label="실사 대상 상품" required>
            <Space direction="vertical" style={{ width: '100%' }} size={6}>
              <Select
                mode="multiple"
                placeholder={selectedWarehouseId ? '실사할 상품 선택 (창고 내 재고 있는 상품만 표시)' : '창고를 먼저 선택하세요'}
                disabled={!selectedWarehouseId}
                value={selectedProductIds}
                onChange={(ids: string[]) => setSelectedProductIds(ids)}
                options={productsInWarehouse.map((p) => ({
                  value: p.id,
                  label: `${p.sku} · ${p.name} (${p.totalQty.toLocaleString()}개)`,
                }))}
                showSearch
                optionFilterProp="label"
                allowClear
                maxTagCount="responsive"
                style={{ width: '100%' }}
                notFoundContent={selectedWarehouseId ? '이 창고에 재고가 있는 상품이 없습니다' : '창고를 먼저 선택하세요'}
              />
              <Tag color={selectedProductIds.length > 0 ? 'blue' : 'default'}>
                선택 {selectedProductIds.length}개
              </Tag>
            </Space>
          </Form.Item>
          <Form.Item name="note" label="비고"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
