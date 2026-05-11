import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Table, Tag, Modal, Form, Select, Input, DatePicker, InputNumber,
  Space, Button, App, Divider, Tabs, Badge, Tooltip,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowRightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { TransferOrder, TransferOrderStatus } from '@/types/order';
import { useTransferOrders, useCreateTransfer, useSearchTransferOrders } from '@/hooks/useOrderQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import { getSuggestedLocations, type RackLocationInventory, type SuggestedLocation } from '@/api/inventory';
import PermissionButton from '@/components/PermissionButton';
import AssignedWorkerCell from '@/components/AssignedWorkerCell';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

const { Title, Text } = Typography;

const STATUS_CONFIG: Record<TransferOrderStatus, { color: string; label: string }> = {
  draft: { color: 'default', label: '초안' },
  approved: { color: 'processing', label: '승인' },
  in_progress: { color: 'warning', label: '이동중' },
  completed: { color: 'success', label: '완료' },
  partial: { color: 'orange', label: '부분완료' },
  cancelled: { color: 'error', label: '취소' },
};

/** 이동 지시서 탭 정의 — 백엔드 상태를 업무 단계로 묶음 */
type TransferTabKey = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'issue';

const TAB_STATUSES: Record<TransferTabKey, TransferOrderStatus[] | null> = {
  all: null,
  scheduled: ['draft', 'approved'],
  in_progress: ['in_progress'],
  completed: ['completed'],
  issue: ['partial', 'cancelled'],
};

const TAB_LABELS: Record<TransferTabKey, string> = {
  all: '전체',
  scheduled: '예정',
  in_progress: '진행중',
  completed: '완료',
  issue: '이슈',
};

const TAB_BADGE_COLOR: Record<TransferTabKey, string> = {
  all: '#64748b',
  scheduled: '#1677ff',
  in_progress: '#f59e0b',
  completed: '#52c41a',
  issue: '#ef4444',
};

interface TransferItemRow {
  key: number;
  productId: string;
  productName: string;
  sku: string;
  fromLocationId: string;
  fromLabel: string;
  toLocationId: string;
  orderedQty: number;
  maxQty: number;
}

export default function TransferListPage() {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId ? `/topic/admin/transfer/${clientId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['transfer-orders'] });
      queryClient.invalidateQueries({ queryKey: ['transfer-order', event.orderId] });
      queryClient.invalidateQueries({ queryKey: ['transfer-items', event.orderId] });
      showStompToast(message, event);
    },
  );

  const [activeTab, setActiveTab] = useState<TransferTabKey>('all');

  const productFilter = useProductFilterForOrder();
  const { data: rawOrders = [], isLoading: rawLoading } = useTransferOrders();
  const { data: searchedOrders = [], isLoading: searchLoading } = useSearchTransferOrders(productFilter.productIds);
  const allOrders = productFilter.isFiltering ? searchedOrders : rawOrders;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;
  const { data: warehouses = [] } = useWarehouses();
  const createMutation = useCreateTransfer();

  // 탭별 건수
  const tabCounts = useMemo(() => {
    const counts: Record<TransferTabKey, number> = {
      all: allOrders.length,
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      issue: 0,
    };
    allOrders.forEach((o) => {
      (Object.keys(TAB_STATUSES) as TransferTabKey[]).forEach((key) => {
        const statuses = TAB_STATUSES[key];
        if (key !== 'all' && statuses?.includes(o.status)) counts[key] += 1;
      });
    });
    return counts;
  }, [allOrders]);

  // 현재 탭에 해당하는 주문만 필터
  const orders = useMemo(() => {
    const statuses = TAB_STATUSES[activeTab];
    if (!statuses) return allOrders;
    return allOrders.filter((o) => statuses.includes(o.status));
  }, [allOrders, activeTab]);

  // 출발 창고 선택 시 재고 조회
  const [fromWarehouseId, setFromWarehouseId] = useState<string | null>(null);
  const [toWarehouseId, setToWarehouseId] = useState<string | null>(null);
  const { data: inventoryByRack } = useInventoryByRack(fromWarehouseId);

  // 재고 있는 로케이션만 추출 — 출발지 선택 옵션
  const occupiedLocations = useMemo(() => {
    if (!inventoryByRack) return [];
    const locs: (RackLocationInventory & { rack_code: string })[] = [];
    inventoryByRack.racks.forEach((rack) => {
      rack.locations.forEach((loc) => {
        if (loc.available_qty > 0 && loc.product_id) {
          locs.push({ ...loc, rack_code: rack.rack_code });
        }
      });
    });
    return locs;
  }, [inventoryByRack]);

  // 출발 창고에 재고 있는 상품 목록 (같은 상품이 여러 위치면 가장 가용량 많은 곳 기준)
  const productsInWarehouse = useMemo(() => {
    const byProduct = new Map<string, { product_id: string; sku: string; name: string; totalQty: number }>();
    occupiedLocations.forEach((loc) => {
      if (!loc.product_id) return;
      const prev = byProduct.get(loc.product_id);
      if (prev) {
        prev.totalQty += loc.available_qty;
      } else {
        byProduct.set(loc.product_id, {
          product_id: loc.product_id,
          sku: loc.product_sku ?? '-',
          name: loc.product_name ?? '-',
          totalQty: loc.available_qty,
        });
      }
    });
    return Array.from(byProduct.values());
  }, [occupiedLocations]);

  // 도착 위치 후보 — 행별로 상품·수량·도착창고 기반 백엔드 추천 (one-SKU-per-location 정책 적용됨)
  const [suggestionsByRow, setSuggestionsByRow] = useState<Record<number, SuggestedLocation[]>>({});

  const refreshSuggestionsForRow = async (rowKey: number, productId: string, qty: number) => {
    if (!productId || !toWarehouseId) {
      setSuggestionsByRow((prev) => { const next = { ...prev }; delete next[rowKey]; return next; });
      return;
    }
    try {
      const sugs = await getSuggestedLocations(productId, toWarehouseId, qty > 0 ? qty : undefined);
      setSuggestionsByRow((prev) => ({ ...prev, [rowKey]: sugs }));
    } catch {
      setSuggestionsByRow((prev) => ({ ...prev, [rowKey]: [] }));
    }
  };

  // 이동 품목 행
  const [itemRows, setItemRows] = useState<TransferItemRow[]>([]);
  let rowKeySeq = 0;

  // 도착 창고 변경 시 — 기존 추천/도착선택 무효화 후 productId 있는 행 재조회
  useEffect(() => {
    setSuggestionsByRow({});
    setItemRows((prev) => prev.map((r) => ({ ...r, toLocationId: '' })));
    if (!toWarehouseId) return;
    itemRows.forEach((r) => {
      if (r.productId) void refreshSuggestionsForRow(r.key, r.productId, r.orderedQty);
    });
    // itemRows 변경에 의한 재호출 방지 — toWarehouseId만 트리거
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toWarehouseId]);

  const addItemRow = () => {
    setItemRows((prev) => [...prev, {
      key: Date.now() + rowKeySeq++,
      productId: '', productName: '', sku: '',
      fromLocationId: '', fromLabel: '', toLocationId: '',
      orderedQty: 0, maxQty: 0,
    }]);
  };

  const removeItemRow = (key: number) => {
    setItemRows((prev) => prev.filter((r) => r.key !== key));
    setSuggestionsByRow((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };

  // 특정 위치의 남은 재고 = 가용량 − 다른 행들이 이미 쓰고 있는 양
  const getLocationRemaining = (locationId: string, excludeRowKey: number | null = null) => {
    const loc = occupiedLocations.find((l) => l.location_id === locationId);
    if (!loc) return 0;
    const used = itemRows
      .filter((r) => r.fromLocationId === locationId && r.key !== excludeRowKey)
      .reduce((s, r) => s + (r.orderedQty || 0), 0);
    return Math.max(0, loc.available_qty - used);
  };

  // 상품 선택 → 그 상품이 들어있는 위치 중 "남은 가용량" 최대인 곳 자동 선택
  const handleProductChange = (key: number, productId: string) => {
    const candidates = occupiedLocations.filter((l) => l.product_id === productId);
    if (candidates.length === 0) return;
    const ranked = candidates
      .map((loc) => ({ loc, remaining: getLocationRemaining(loc.location_id, key) }))
      .filter((x) => x.remaining > 0);
    if (ranked.length === 0) {
      message.warning('해당 상품의 가용 재고가 다른 행에서 모두 사용되었습니다.');
      return;
    }
    const best = ranked.reduce((a, b) => (b.remaining > a.remaining ? b : a));
    setItemRows((prev) => prev.map((r) => r.key !== key ? r : {
      ...r,
      productId,
      productName: best.loc.product_name ?? '-',
      sku: best.loc.product_sku ?? '-',
      fromLocationId: best.loc.location_id,
      fromLabel: `${best.loc.rack_code} · ${best.loc.location_code}`,
      toLocationId: '',
      maxQty: best.remaining,
      orderedQty: best.remaining,
    }));
    void refreshSuggestionsForRow(key, productId, best.remaining);
  };

  const openModal = () => {
    form.resetFields();
    setFromWarehouseId(null);
    setToWarehouseId(null);
    setItemRows([]);
    setSuggestionsByRow({});
    setModalOpen(true);
  };

  const handleCreate = () => {
    form.validateFields().then((values) => {
      if (itemRows.length === 0) {
        message.warning('이동할 품목을 추가하세요.');
        return;
      }
      const invalidRow = itemRows.find((r) => !r.fromLocationId || !r.toLocationId || r.orderedQty <= 0);
      if (invalidRow) {
        message.warning('모든 품목의 출발/도착 위치와 수량을 입력하세요.');
        return;
      }
      // 같은 출발 위치를 여러 행이 쓸 때 가용량 초과 검증
      const usagePerLocation = new Map<string, number>();
      itemRows.forEach((r) => usagePerLocation.set(r.fromLocationId, (usagePerLocation.get(r.fromLocationId) ?? 0) + r.orderedQty));
      for (const [locId, used] of usagePerLocation) {
        const loc = occupiedLocations.find((l) => l.location_id === locId);
        if (loc && used > loc.available_qty) {
          message.warning(`${loc.rack_code} · ${loc.location_code} 가용 재고(${loc.available_qty})를 초과했습니다 (요청 ${used})`);
          return;
        }
      }
      // 같은 도착 위치 중복 사용 차단 (one-SKU-per-location 정책)
      const toLocations = itemRows.map((r) => r.toLocationId);
      if (new Set(toLocations).size !== toLocations.length) {
        message.warning('도착 위치가 중복되었습니다. 빈 위치별로 한 행만 가능합니다.');
        return;
      }
      // 도착지 수용량 초과 검증
      for (const r of itemRows) {
        const sug = (suggestionsByRow[r.key] ?? []).find((s) => s.location_id === r.toLocationId);
        if (sug && sug.available_capacity != null && r.orderedQty > sug.available_capacity) {
          message.warning(`${sug.location_code} 수용량 초과 (남은 ${sug.available_capacity}, 요청 ${r.orderedQty})`);
          return;
        }
      }
      createMutation.mutate(
        {
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          expectedDate: values.expectedDate ? (values.expectedDate as { format: (f: string) => string }).format('YYYY-MM-DD') : undefined,
          note: values.note ?? undefined,
          items: itemRows.map((r) => ({
            productId: r.productId,
            fromLocationId: r.fromLocationId,
            toLocationId: r.toLocationId,
            orderedQty: r.orderedQty,
          })),
        },
        { onSuccess: (order) => { message.success(`${order.order_no} 생성`); setModalOpen(false); navigate(`/order/transfer/${order.id}`); } },
      );
    });
  };

  const columns: ColumnsType<TransferOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 160 },
    { title: '출발 창고', dataIndex: 'from_warehouse_name', key: 'from', width: 130 },
    { title: '도착 창고', dataIndex: 'to_warehouse_name', key: 'to', width: 130 },
    { title: '예정일', dataIndex: 'expected_date', key: 'expected_date', width: 110, render: (v: string | null) => v ?? '-' },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 90, align: 'center',
      render: (v: TransferOrderStatus) => <Tag color={STATUS_CONFIG[v]?.color}>{STATUS_CONFIG[v]?.label ?? v}</Tag>,
    },
    {
      title: '배정 작업자', key: 'assigned_to', width: 130,
      render: (_, r) => <AssignedWorkerCell assignedTo={r.assigned_to} assignedToName={r.assigned_to_name} />,
    },
    { title: '품목', dataIndex: 'total_items', key: 'total_items', width: 60, align: 'center' },
    { title: '수량', dataIndex: 'total_qty', key: 'total_qty', width: 80, align: 'right', render: (v: number) => v?.toLocaleString() ?? '-' },
    { title: '생성일', dataIndex: 'created_at', key: 'created_at', width: 110 },
  ];

  const warehouseOptions = warehouses.filter((w) => w.is_active).map((w) => ({ label: `${w.code} — ${w.name}`, value: w.id }));

  return (
    <>
      <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0 }}>이동 지시서</Title>
        <Space>
          <ProductFilterTriggerButton
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
          />
          <PermissionButton resource="TRANSFER" action="CREATE" type="primary" icon={<PlusOutlined />} onClick={openModal}>지시서 생성</PermissionButton>
        </Space>
      </div>

      {productFilter.isFiltering && (
        <div style={{ marginBottom: 12 }}>
          <ProductFilterStatusBar
            {...productFilter}
            matchedProductCount={productFilter.productIds?.length ?? null}
            filteredLineCount={allOrders.length}
          />
        </div>
      )}

      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as TransferTabKey)}
        items={(Object.keys(TAB_STATUSES) as TransferTabKey[]).map((key) => ({
          key,
          label: (
            <Space size={8}>
              <span>{TAB_LABELS[key]}</span>
              <Badge
                count={tabCounts[key]}
                showZero
                style={{
                  backgroundColor: activeTab === key ? TAB_BADGE_COLOR[key] : '#e2e8f0',
                  color: activeTab === key ? '#fff' : '#64748b',
                }}
                overflowCount={999}
              />
            </Space>
          ),
        }))}
        style={{ marginBottom: 8 }}
      />

      <Table columns={columns} dataSource={orders} rowKey="id" loading={isLoading}
        onRow={(r) => ({ onClick: () => navigate(`/order/transfer/${r.id}`), style: { cursor: 'pointer' } })} />

      <Modal title="이동 지시서 생성" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleCreate}
        confirmLoading={createMutation.isPending} okText="생성" width={760}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="fromWarehouseId" label="출발 창고" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={warehouseOptions} onChange={(v) => { setFromWarehouseId(v); setItemRows([]); }} placeholder="출발 창고" />
            </Form.Item>
            <Form.Item name="toWarehouseId" label="도착 창고" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={warehouseOptions} onChange={(v) => setToWarehouseId(v)} placeholder="도착 창고" />
            </Form.Item>
          </Space>
          <Space size={16} style={{ width: '100%' }}>
            <Form.Item name="expectedDate" label="예정일" style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} disabledDate={(current) => current && current < dayjs().startOf('day')} />
            </Form.Item>
            <Form.Item name="note" label="비고" style={{ flex: 1 }}>
              <Input placeholder="이동 사유" />
            </Form.Item>
          </Space>
        </Form>

        <Divider style={{ margin: '8px 0 16px' }}>이동 품목</Divider>

        {itemRows.map((row) => (
          <div key={row.key} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <Select
              size="small" placeholder="상품 선택" style={{ width: 240 }}
              value={row.productId || undefined}
              onChange={(v) => handleProductChange(row.key, v)}
              showSearch optionFilterProp="label"
              options={productsInWarehouse.map((p) => ({
                label: `${p.sku} — ${p.name} (${p.totalQty})`,
                value: p.product_id,
              }))}
            />
            <Tooltip title={row.fromLabel || ''} placement="top">
              <Tag style={{
                width: 230, margin: 0, padding: '2px 8px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                fontSize: 12, lineHeight: '20px',
              }} color={row.fromLabel ? 'blue' : 'default'}>
                {row.fromLabel || '출발 위치'}
              </Tag>
            </Tooltip>
            <ArrowRightOutlined style={{ color: '#94a3b8', flexShrink: 0 }} />
            <Select
              size="small" placeholder={row.productId ? '도착 위치' : '상품 먼저 선택'} style={{ width: 240 }}
              value={row.toLocationId || undefined}
              onChange={(v) => setItemRows((p) => p.map((r) => r.key !== row.key ? r : { ...r, toLocationId: v }))}
              showSearch optionFilterProp="label"
              disabled={!row.productId || !toWarehouseId}
              notFoundContent={row.productId ? '추천 가능한 위치 없음' : '상품을 먼저 선택하세요'}
              options={(suggestionsByRow[row.key] ?? [])
                .filter((s) => s.location_id !== row.fromLocationId)
                .map((s) => {
                  const cap = s.available_capacity != null ? `남은 ${s.available_capacity}` : '무제한';
                  return {
                    value: s.location_id,
                    label: `${s.location_code} · ${cap}`,
                  };
                })}
            />
            <InputNumber
              size="small" min={1}
              max={(() => {
                const sourceMax = row.fromLocationId ? getLocationRemaining(row.fromLocationId, row.key) : row.maxQty;
                const dest = (suggestionsByRow[row.key] ?? []).find((s) => s.location_id === row.toLocationId);
                if (dest && dest.available_capacity != null) return Math.min(sourceMax, dest.available_capacity);
                return sourceMax;
              })()}
              value={row.orderedQty}
              onChange={(v) => {
                const next = Number(v ?? 0);
                setItemRows((p) => p.map((r) => r.key !== row.key ? r : { ...r, orderedQty: next }));
              }}
              onBlur={() => { if (row.productId) void refreshSuggestionsForRow(row.key, row.productId, row.orderedQty); }}
              style={{ width: 80 }}
            />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeItemRow(row.key)} />
          </div>
        ))}
        <Button type="dashed" block icon={<PlusOutlined />} onClick={addItemRow}
          disabled={!fromWarehouseId || !toWarehouseId}>
          품목 추가
        </Button>
        {!fromWarehouseId && <Text type="secondary" style={{ fontSize: 11 }}>출발 창고를 먼저 선택하세요</Text>}
      </Modal>
      </div>
      <style>{`
        .order-list-tone .ant-table-thead > tr > th {
          background: #f8fafc !important;
          color: #475569 !important;
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 2px solid #dbe3ee !important;
        }
      `}</style>
    </>
  );
}
