import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Typography, Table, Space, Tag, App, Tabs, Badge, Select, Segmented, Progress, Tooltip, Input, DatePicker, Button, Modal, Form, InputNumber, Alert, Card,
} from 'antd';
import { PlusOutlined, EyeOutlined, CheckOutlined, SendOutlined, LineChartOutlined, FileDoneOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import type { OutboundOrder, OrderStatus, ErpSalesOrder, SalesOrderProcessStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import {
  useOutboundOrders,
  useSearchOutboundOrders,
  useApproveOutbound,
  useConfirmOutbound,
  useCreateManualOutbound,
  useErpSalesOrders,
  usePreviewManualOutbound,
} from '@/hooks/useOrderQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import { useStores } from '@/hooks/useMasterQuery';
import { useMasterWarehouses } from '@/hooks/useWarehouseQuery';
import { useQuery } from '@tanstack/react-query';
import { getProductsReal } from '@/api/product';
import { getInventoryStocks } from '@/api/inventory';
import WaveCreateModal from '@/components/WaveCreateModal';
import PermissionButton from '@/components/PermissionButton';
import AssignedWorkerCell from '@/components/AssignedWorkerCell';
import AtpShortageContent from '@/components/AtpShortageContent';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient } from '@tanstack/react-query';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';

const { Title, Text } = Typography;

/** 출고 지시서 탭 정의 — 백엔드 OutboundOrderStatus 를 업무 단계로 묶음 */
type OutboundTabKey = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'issue';

const TAB_STATUSES: Record<OutboundTabKey, OrderStatus[] | null> = {
  all: null,
  scheduled: ['draft', 'approved'],
  in_progress: ['in_progress'],
  completed: ['completed'],
  issue: ['partial', 'cancelled'],
};

const TAB_LABELS: Record<OutboundTabKey, string> = {
  all: '전체',
  scheduled: '예정',
  in_progress: '진행중',
  completed: '완료',
  issue: '이슈',
};

const TAB_BADGE_COLOR: Record<OutboundTabKey, string> = {
  all: '#64748b',
  scheduled: '#1677ff',
  in_progress: '#f59e0b',
  completed: '#52c41a',
  issue: '#ef4444',
};


export default function OutboundListPage() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId ? `/topic/admin/outbound/${clientId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['outbound-orders'] });
      showStompToast(message, event);
    },
  );

  // 반품 출고는 [반품 관리] 메뉴에서 별도로 보므로 일반 목록에선 자동 제외
  const productFilter = useProductFilterForOrder();
  const { data: rawOrders = [], isLoading: rawLoading } = useOutboundOrders({ excludeOriginType: 'return' });
  const { data: searchedOrders = [], isLoading: searchLoading } = useSearchOutboundOrders(
    productFilter.productIds,
    { excludeOriginType: 'return' },
  );
  const orders = productFilter.isFiltering ? searchedOrders : rawOrders;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;
  const { data: erpSales = [] } = useErpSalesOrders();
  const approveMutation = useApproveOutbound();
  const confirmMutation = useConfirmOutbound();
  const createManualOutbound = useCreateManualOutbound();

  // 수동 출고 생성 모달
  const [manualForm] = Form.useForm();
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const { data: storesAll = [], isLoading: storesLoading } = useStores();
  const stores = useMemo(() => storesAll.filter((s) => s.is_active !== false), [storesAll]);
  const { data: manualWarehouses = [], isLoading: manualWhLoading } = useMasterWarehouses(manualModalOpen);
  const { data: manualProducts = [], isLoading: manualProductsLoading } = useQuery({
    queryKey: ['products', 'manual-outbound'],
    queryFn: getProductsReal,
    enabled: manualModalOpen,
  });
  // ── 수동 출고 — 미리보기 (ATP) + 인벤토리 (옵션 필터) ──
  // 인벤토리: 그 창고에 어떤 상품이 있는지 알아내는 용도 (옵션 리스트 좁히기). 표시값 사용 X.
  // preview: storeId + scheduledDate + items 가 모두 준비되면 자동 호출. 표시되는 가용 수치는 모두 projected (ATP).
  const previewManualMutation = usePreviewManualOutbound();
  const previewData = previewManualMutation.data;
  const previewLoading = previewManualMutation.isPending;

  const watchedManualStoreId = Form.useWatch('storeId', manualForm) as string | undefined;
  const watchedManualWarehouseId = Form.useWatch('warehouseId', manualForm) as string | undefined;
  const watchedManualScheduledDate = Form.useWatch('scheduledDate', manualForm) as Dayjs | undefined;
  const watchedManualItems = Form.useWatch('items', manualForm) as Array<{ productId?: string; qty?: number }> | undefined;

  // 창고 인벤토리 — 옵션 필터링 전용 (어떤 상품이 그 창고에 있는지)
  const { data: manualWhStocks = [] } = useQuery({
    queryKey: ['warehouse-inventory', watchedManualWarehouseId],
    queryFn: () => getInventoryStocks({ warehouseId: watchedManualWarehouseId }),
    enabled: manualModalOpen && !!watchedManualWarehouseId,
  });
  // 그 창고에 inventory 행이 존재하는 상품 ID 집합 (가용 0 도 포함 — 점유 중일 수 있음)
  const productIdsInWarehouse = useMemo(() => {
    const set = new Set<string>();
    for (const s of manualWhStocks) {
      if (s.product_id) set.add(s.product_id);
    }
    return set;
  }, [manualWhStocks]);

  // 선택된 창고에서 productId → projected (ATP). 미리보기 응답에서만 가져옴.
  const manualProjectedByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (!watchedManualWarehouseId || !previewData?.store_groups?.[0]) return map;
    for (const req of previewData.store_groups[0].requirements) {
      const wh = req.warehouses.find((w) => w.warehouse_id === watchedManualWarehouseId);
      if (wh) map.set(req.product_id, wh.projected_qty);
    }
    return map;
  }, [previewData, watchedManualWarehouseId]);

  const recommendedManualWhId = previewData?.store_groups?.[0]?.recommended_warehouse_id ?? null;
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);

  // 자동 미리보기 — 모든 조건 충족 시 디바운스(500ms) 후 호출
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!manualModalOpen) return;
    const validItems = (watchedManualItems ?? [])
      .filter((i) => i.productId && i.qty && Number(i.qty) > 0)
      .map((i) => ({ productId: i.productId!, qty: Number(i.qty) }));
    if (!watchedManualStoreId || !watchedManualScheduledDate || validItems.length === 0) return;

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      previewManualMutation.mutate({
        storeId: watchedManualStoreId,
        scheduledDate: watchedManualScheduledDate.format('YYYY-MM-DD'),
        items: validItems,
      });
    }, 500);

    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
    // mutation 인스턴스는 의존성에서 제외 (매 렌더 새 객체)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualModalOpen, watchedManualStoreId, watchedManualScheduledDate, JSON.stringify(watchedManualItems)]);

  const applyRecommendedWarehouse = () => {
    if (!recommendedManualWhId) return;
    manualForm.setFieldsValue({ warehouseId: recommendedManualWhId });
    message.success('추천 창고가 적용되었습니다.');
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = ((): OutboundTabKey => {
    const t = searchParams.get('tab');
    return (['all', 'scheduled', 'in_progress', 'completed', 'issue'] as OutboundTabKey[])
      .includes(t as OutboundTabKey) ? (t as OutboundTabKey) : 'all';
  })();
  const [activeTab, setActiveTab] = useState<OutboundTabKey>(initialTab);
  const initialView = (searchParams.get('view') === 'sales' ? 'sales' : 'orders') as 'orders' | 'sales';
  const [viewMode, setViewMode] = useState<'orders' | 'sales'>(initialView);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [salesStatusFilter, setSalesStatusFilter] = useState<'ALL' | 'NOT_STARTED' | 'PARTIAL' | 'COMPLETED'>('ALL');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | OrderStatus>('ALL');

  const resetFilters = () => {
    setSearchKeyword('');
    setDateFrom(null);
    setDateTo(null);
    setSalesStatusFilter('ALL');
    setOrderStatusFilter('ALL');
  };

  /** YYYY-MM-DD 문자열이 [from, to] 범위에 있는지 (양 끝 포함) */
  const inDateRange = (ymd: string | null | undefined): boolean => {
    if (!dateFrom && !dateTo) return true;
    if (!ymd) return false;
    const d = dayjs(ymd);
    if (!d.isValid()) return false;
    if (dateFrom && d.isBefore(dateFrom, 'day')) return false;
    if (dateTo && d.isAfter(dateTo, 'day')) return false;
    return true;
  };
  const [selectedWaveOrderIds, setSelectedWaveOrderIds] = useState<string[]>([]);
  const [waveModalOpen, setWaveModalOpen] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null);

  // 탭별 건수
  const tabCounts = useMemo(() => {
    const counts: Record<OutboundTabKey, number> = {
      all: orders.length,
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      issue: 0,
    };
    orders.forEach((o) => {
      (Object.keys(TAB_STATUSES) as OutboundTabKey[]).forEach((key) => {
        const statuses = TAB_STATUSES[key];
        if (key !== 'all' && statuses?.includes(o.status)) counts[key] += 1;
      });
    });
    return counts;
  }, [orders]);

  // 현재 탭(상위 그룹) + 상태 Select + 검색어 + 날짜 범위 (출고예정일) 필터
  const filtered = useMemo(() => {
    const statuses = TAB_STATUSES[activeTab];
    const base = statuses ? orders.filter((o) => statuses.includes(o.status)) : orders;
    const kw = searchKeyword.trim().toLowerCase();
    return base.filter((o) => {
      if (kw && !o.order_no.toLowerCase().includes(kw) && !(o.store_name ?? '').toLowerCase().includes(kw)) return false;
      if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;
      if (!inDateRange(o.expected_date)) return false;
      return true;
    });
    // inDateRange 는 dateFrom/dateTo 만 의존하므로 의존성에 명시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, activeTab, orderStatusFilter, searchKeyword, dateFrom, dateTo]);

  const handleApprove = async (id: string) => {
    try {
      await approveMutation.mutateAsync(id);
      message.success('승인 완료');
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
                      warehouseName: orders.find((o) => o.id === id)?.warehouse_name,
                    }
                    : { source: 'atp', warehouseName: orders.find((o) => o.id === id)?.warehouse_name },
                },
              });
            }}
          />
        ),
        width: 520,
      });
    }
  };

  const columns: ColumnsType<OutboundOrder> = [
    {
      title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 160,
      render: (v: string, r) => (
        <Space size={4}>
          <span>{v}</span>
          {r.origin_type === 'return' && <Tag color="volcano" style={{ margin: 0 }}>반품</Tag>}
        </Space>
      ),
    },
    {
      title: '출고처/입고처', dataIndex: 'store_name', key: 'store_name', width: 150,
      render: (v: string, r) => r.destination_type === 'supplier'
        ? <span>↩ {r.supplier_name ?? v}</span>
        : v,
    },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
    { title: '출고예정일', dataIndex: 'expected_date', key: 'expected_date', width: 110, align: 'center' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center', render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v].color}>{ORDER_STATUS_CONFIG[v].label}</Tag> },
    {
      title: '배정 작업자', key: 'assigned_to', width: 130,
      render: (_, r) => <AssignedWorkerCell assignedTo={r.assigned_to} assignedToName={r.assigned_to_name} />,
    },
    { title: '품목수', dataIndex: 'total_items', key: 'total_items', width: 70, align: 'center' },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80, align: 'right', render: (v: number) => v?.toLocaleString() ?? '-' },
    {
      title: '', key: 'action', width: 40, align: 'center',
      render: (_, r) => (
        <RowActionMenu
          items={[
            { key: 'detail', label: '상세', icon: <EyeOutlined />, onClick: () => navigate(`/order/outbound/${r.id}`) },
            { key: 'approve', label: '승인', icon: <CheckOutlined />, disabled: r.status !== 'draft', onClick: () => { void handleApprove(r.id); } },
            { key: 'confirm', label: '출고 확정', icon: <SendOutlined />, disabled: r.status !== 'in_progress', onClick: () => confirmMutation.mutate(r.id) },
          ]}
        />
      ),
    },
  ];

  // 수주서 진행률 뷰 — SO 목록 (정렬: PARTIAL → NOT_STARTED → COMPLETED, 출고예정일 오름차순)
  const PROCESS_STATUS_TAG: Record<SalesOrderProcessStatus, { color: string; label: string }> = {
    NOT_STARTED: { color: 'default', label: '미처리' },
    PARTIAL:     { color: 'orange',  label: '부분 처리' },
    COMPLETED:   { color: 'green',   label: '완료' },
  };
  const PROCESS_ORDER: Record<SalesOrderProcessStatus, number> = { PARTIAL: 0, NOT_STARTED: 1, COMPLETED: 2 };
  const salesOrderRows = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    const filteredRows = erpSales.filter((s) => {
      if (kw && !s.so_no.toLowerCase().includes(kw) && !(s.store_name ?? '').toLowerCase().includes(kw)) return false;
      if (salesStatusFilter !== 'ALL' && s.process_status !== salesStatusFilter) return false;
      if (!inDateRange(s.scheduled_date)) return false;
      return true;
    });
    return [...filteredRows].sort((a, b) => {
      const sa = PROCESS_ORDER[a.process_status] ?? 99;
      const sb = PROCESS_ORDER[b.process_status] ?? 99;
      if (sa !== sb) return sa - sb;
      return (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? '');
    });
    // PROCESS_ORDER 는 상수, inDateRange 는 dateFrom/dateTo 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erpSales, searchKeyword, salesStatusFilter, dateFrom, dateTo]);
  const salesOrderColumns: ColumnsType<ErpSalesOrder> = [
    { title: '수주번호', dataIndex: 'so_no', key: 'so_no', width: 140 },
    { title: '거래처', dataIndex: 'store_name', key: 'store_name', width: 140 },
    { title: '주문일', dataIndex: 'order_date', key: 'order_date', width: 110, align: 'center' },
    { title: '출고예정일', dataIndex: 'scheduled_date', key: 'scheduled_date', width: 110, align: 'center' },
    {
      title: '처리상태', dataIndex: 'process_status', key: 'process_status', width: 100, align: 'center',
      render: (s: SalesOrderProcessStatus) => {
        const t = PROCESS_STATUS_TAG[s];
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '진행률',
      key: 'progress',
      width: 200,
      className: 'sales-so-progress-col',
      onCell: () => ({ style: { verticalAlign: 'middle' } }),
      render: (_, r) => (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 168,
            whiteSpace: 'nowrap',
          }}
        >
          <Progress
            percent={r.dispatch_progress_percent}
            size="small"
            status={r.dispatch_progress_percent === 100 ? 'success' : 'active'}
            style={{ width: 118, minWidth: 88, marginBottom: 0 }}
            showInfo={false}
          />
          <Text style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, lineHeight: 1 }}>
            {r.dispatch_progress_percent}%
          </Text>
        </div>
      ),
    },
    { title: '품목수', dataIndex: 'item_count', key: 'item_count', width: 70, align: 'center' },
    { title: '총수량', dataIndex: 'total_ordered_qty', key: 'total_ordered_qty', width: 80, align: 'right', render: (v: number) => v?.toLocaleString() ?? '-' },
    {
      title: '', key: 'action', width: 80, align: 'center',
      render: (_, r) => (
        <Tooltip title="진행률 페이지로 이동">
          <a onClick={(e) => { e.stopPropagation(); navigate(`/order/sales-orders/${r.id}/progress`); }}>
            <LineChartOutlined /> 진행률
          </a>
        </Tooltip>
      ),
    },
  ];

  // ── 수동 출고 생성 핸들러 ──
  const openManualOutboundModal = () => {
    manualForm.resetFields();
    manualForm.setFieldsValue({
      storeId: undefined,
      warehouseId: undefined,
      scheduledDate: dayjs().add(1, 'day'),
      note: undefined,
      items: [{ productId: undefined, qty: 1, unitPrice: undefined }],
    });
    setManualModalOpen(true);
  };

  const closeManualOutboundModal = () => {
    setManualModalOpen(false);
    manualForm.resetFields();
  };

  const handleCreateManualOutbound = async () => {
    try {
      const values = await manualForm.validateFields();
      createManualOutbound.mutate({
        storeId: values.storeId as string,
        warehouseId: values.warehouseId as string,
        scheduledDate: (values.scheduledDate as Dayjs).format('YYYY-MM-DD'),
        note: (values.note as string)?.trim() || undefined,
        items: (values.items as { productId: string; qty: number; unitPrice?: number }[]).map((item) => ({
          productId: item.productId,
          qty: Number(item.qty),
          unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
        })),
      }, {
        onSuccess: (created) => {
          message.success(`출고지시서 ${created.order_no} 생성 완료`);
          closeManualOutboundModal();
          navigate(`/order/outbound/${created.id}`);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
            ?? '수동 출고지시서 생성에 실패했습니다.';
          message.error(msg);
        },
      });
    } catch {
      // antd validation 에러 — 메시지는 폼이 자체 표시
    }
  };

  // 상품 선택 시 standard_price 자동 채움
  const handleManualOutboundProductChange = (rowName: number, productId: string | undefined) => {
    if (!productId) return;
    const product = manualProducts.find((p) => p.id === productId);
    if (!product) return;
    const items = (manualForm.getFieldValue('items') as Array<Record<string, unknown>> | undefined) ?? [];
    const next = items.map((it) => ({ ...(it ?? {}) }));
    const currentRow = next[rowName] ?? {};
    next[rowName] = {
      ...currentRow,
      productId,
      unitPrice: currentRow.unitPrice ?? product.standard_price ?? undefined,
    };
    manualForm.setFieldsValue({ items: next });
  };

  const storeOptions = useMemo(() => stores.map((s, i) => ({
    key: `store-${s.id}-${i}`,
    label: s.name,
    value: s.id,
  })), [stores]);
  const manualWarehouseOptions = useMemo(() => manualWarehouses.map((w, i) => ({
    key: `manual-wh-${w.id}-${i}`,
    label: `${w.code} — ${w.name}`,
    value: w.id,
  })), [manualWarehouses]);
  const manualProductOptions = useMemo(() => {
    // 창고 미선택: 모든 상품 노출 (옵션엔 가용 표시 안 함)
    if (!watchedManualWarehouseId) {
      return manualProducts.map((p, i) => ({
        key: `manual-product-${p.id}-${i}`,
        label: `${p.sku} · ${p.name}`,
        value: p.id,
      }));
    }
    // 창고 선택됨: 그 창고에 재고 있는 상품만 노출. ATP(projected)는 미리보기 응답이 있을 때만 라벨에 추가.
    return manualProducts
      .filter((p) => productIdsInWarehouse.has(p.id))
      .map((p, i) => {
        const projected = manualProjectedByProduct.get(p.id);
        const stockSuffix = projected !== undefined
          ? ` · 출고 가능 ${projected.toLocaleString()}`
          : '';
        return {
          key: `manual-product-${p.id}-${i}`,
          label: `${p.sku} · ${p.name}${stockSuffix}`,
          value: p.id,
        };
      });
  }, [manualProducts, watchedManualWarehouseId, productIdsInWarehouse, manualProjectedByProduct]);

  const handleWaveSelection = (record: OutboundOrder, checked: boolean) => {
    if (!checked) {
      const next = selectedWaveOrderIds.filter((id) => id !== record.id);
      setSelectedWaveOrderIds(next);
      if (next.length === 0) setSelectedWarehouse(null);
      return;
    }
    const baseWh = selectedWarehouse ?? record.warehouse_name;
    if (record.warehouse_name !== baseWh) {
      message.warning('같은 창고의 출고지시서만 선택할 수 있습니다');
      return;
    }
    const next = [...selectedWaveOrderIds, record.id];
    setSelectedWaveOrderIds(next);
    setSelectedWarehouse(baseWh);
  };

  const waveRowSelection: TableRowSelection<OutboundOrder> = {
    selectedRowKeys: selectedWaveOrderIds,
    onSelect: (record, selected) => handleWaveSelection(record, selected),
    onSelectAll: (selected, selectedRows) => {
      if (!selected) {
        setSelectedWaveOrderIds([]);
        setSelectedWarehouse(null);
        return;
      }
      if (selectedRows.length === 0) return;
      const baseWh = selectedWarehouse ?? selectedRows[0].warehouse_name;
      const invalid = selectedRows.some((row) => row.warehouse_name !== baseWh);
      if (invalid) {
        message.warning('같은 창고의 출고지시서만 선택할 수 있습니다');
      }
      const onlyValid = selectedRows
        .filter((row) => row.warehouse_name === baseWh && row.status === 'approved')
        .map((row) => row.id);
      setSelectedWaveOrderIds(onlyValid);
      setSelectedWarehouse(onlyValid.length > 0 ? baseWh : null);
    },
    getCheckboxProps: (record) => {
      const lockedByWarehouse = !!selectedWarehouse
        && selectedWarehouse !== record.warehouse_name
        && !selectedWaveOrderIds.includes(record.id);
      return {
        disabled: record.status !== 'approved' || lockedByWarehouse,
      };
    },
  };

  const handleWaveSuccess = () => {
    setWaveModalOpen(false);
    setSelectedWaveOrderIds([]);
    setSelectedWarehouse(null);
    navigate('/order/picking');
  };

  return (
    <>
      <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>출고 지시서</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>ERP 수주서 연동 + 워크플로우</Text>
        </Space>
        <Space>
          <PermissionButton resource="OUTBOUND" action="CREATE" type="primary" ghost disabled={selectedWaveOrderIds.length === 0} onClick={() => setWaveModalOpen(true)}>
            웨이브 생성 ({selectedWaveOrderIds.length}건)
          </PermissionButton>
          <PermissionButton resource="OUTBOUND" action="CREATE" icon={<PlusOutlined />} onClick={() => openManualOutboundModal()}>수동 생성</PermissionButton>
          <PermissionButton resource="OUTBOUND" action="CREATE" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/order/outbound/new')}>수주서 연동 생성</PermissionButton>
        </Space>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={viewMode}
          onChange={(v) => {
            const next = v as 'orders' | 'sales';
            setViewMode(next);
            setSearchParams((prev) => {
              const p = new URLSearchParams(prev);
              if (next === 'orders') p.delete('view');
              else p.set('view', 'sales');
              return p;
            }, { replace: true });
          }}
          options={[
            { label: <Space size={6}><FileDoneOutlined />출고지시서 목록</Space>, value: 'orders' },
            { label: <Space size={6}><LineChartOutlined />수주서 진행률</Space>, value: 'sales' },
          ]}
        />
      </div>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '18px 20px' } }}>
        <Text strong style={{ display: 'block', fontSize: 14, marginBottom: 12 }}>검색 조건</Text>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 24,
            rowGap: 10,
          }}
        >
          <Space size={8} align="center">
            <SearchOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>검색어</Text>
            <Input
              placeholder={viewMode === 'orders' ? '지시서번호 또는 거래처명' : '수주번호 또는 거래처명'}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              allowClear
              style={{ width: 240 }}
            />
          </Space>
          <Space size={8} align="center">
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>상태</Text>
            {viewMode === 'orders' ? (
              <Select
                value={orderStatusFilter}
                onChange={(v) => setOrderStatusFilter(v)}
                style={{ width: 140 }}
                options={[
                  { label: '전체 상태', value: 'ALL' },
                  { label: '초안', value: 'draft' },
                  { label: '승인', value: 'approved' },
                  { label: '진행중', value: 'in_progress' },
                  { label: '완료', value: 'completed' },
                  { label: '부분', value: 'partial' },
                  { label: '취소', value: 'cancelled' },
                ]}
              />
            ) : (
              <Select
                value={salesStatusFilter}
                onChange={(v) => setSalesStatusFilter(v)}
                style={{ width: 140 }}
                options={[
                  { label: '전체 상태', value: 'ALL' },
                  { label: '미처리', value: 'NOT_STARTED' },
                  { label: '부분 처리', value: 'PARTIAL' },
                  { label: '완료', value: 'COMPLETED' },
                ]}
              />
            )}
          </Space>
          <Space size={8} align="center">
            <CalendarOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>출고예정일</Text>
            <DatePicker value={dateFrom} onChange={setDateFrom} placeholder="시작" style={{ width: 140 }} />
            <Text type="secondary">~</Text>
            <DatePicker value={dateTo} onChange={setDateTo} placeholder="종료" style={{ width: 140 }} />
          </Space>
          <div style={{ marginLeft: 'auto' }}>
            <Space size={8}>
              <ProductFilterTriggerButton
                {...productFilter}
                matchedProductCount={productFilter.productIds?.length ?? null}
              />
              <Button icon={<ReloadOutlined />} onClick={resetFilters}>초기화</Button>
            </Space>
          </div>
        </div>
        {productFilter.isFiltering && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px dashed #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <ProductFilterStatusBar
              {...productFilter}
              matchedProductCount={productFilter.productIds?.length ?? null}
              filteredLineCount={orders.length}
            />
          </div>
        )}
      </Card>

      {viewMode === 'orders' && (
        <>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => {
              const next = k as OutboundTabKey;
              setActiveTab(next);
              setSearchParams((prev) => {
                const p = new URLSearchParams(prev);
                if (next === 'all') p.delete('tab');
                else p.set('tab', next);
                return p;
              }, { replace: true });
            }}
            items={(Object.keys(TAB_STATUSES) as OutboundTabKey[]).map((key) => ({
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

          <Table
            columns={columns}
            dataSource={filtered}
            rowKey="id"
            loading={isLoading}
            rowSelection={waveRowSelection}
            onRow={(r) => ({
              onClick: (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('button, a, input, label, .ant-checkbox-wrapper, .ant-checkbox')) return;
                navigate(`/order/outbound/${r.id}`);
              },
              style: { cursor: 'pointer' },
            })}
          />
        </>
      )}

      {viewMode === 'sales' && (
        <>
          <Table
            columns={salesOrderColumns}
            dataSource={salesOrderRows}
            rowKey="id"
            scroll={{ x: 1040 }}
            onRow={(r) => ({
              onClick: (e) => {
                const target = e.target as HTMLElement;
                if (target.closest('button, a')) return;
                navigate(`/order/sales-orders/${r.id}/progress`);
              },
              style: { cursor: 'pointer' },
            })}
          />
        </>
      )}

      <WaveCreateModal
        open={waveModalOpen}
        outboundOrderIds={selectedWaveOrderIds}
        onClose={() => setWaveModalOpen(false)}
        onSuccess={handleWaveSuccess}
      />

      <Modal
        title="수동 출고지시서 생성"
        open={manualModalOpen}
        onCancel={closeManualOutboundModal}
        onOk={handleCreateManualOutbound}
        okText="생성"
        confirmLoading={createManualOutbound.isPending}
        width={880}
        destroyOnHidden
      >
        <Form form={manualForm} layout="vertical">
          <Space size={12} style={{ display: 'flex', marginBottom: 8 }} align="start">
            <Form.Item name="storeId" label="거래처" style={{ flex: 1, marginBottom: 0 }} rules={[{ required: true, message: '거래처를 선택하세요.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="거래처 선택"
                loading={storesLoading}
                options={storeOptions}
              />
            </Form.Item>
            <Form.Item name="warehouseId" label="출고 창고" style={{ flex: 1, marginBottom: 0 }} rules={[{ required: true, message: '출고 창고를 선택하세요.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="창고 선택"
                loading={manualWhLoading}
                options={manualWarehouseOptions}
              />
            </Form.Item>
            <Form.Item name="scheduledDate" label="출고예정일" style={{ width: 160, marginBottom: 0 }} rules={[{ required: true, message: '예정일을 선택하세요.' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="note" label="비고" style={{ marginBottom: 12 }}>
            <Input placeholder="비고 (선택)" allowClear />
          </Form.Item>

          {!storesLoading && stores.length === 0 && (
            <Alert type="warning" showIcon message="활성 거래처가 없습니다. 먼저 거래처를 등록해야 수동 생성이 가능합니다." style={{ marginBottom: 12 }} />
          )}
          {!manualProductsLoading && manualProducts.length === 0 && (
            <Alert type="warning" showIcon message="상품이 없습니다. 먼저 상품을 등록하세요." style={{ marginBottom: 12 }} />
          )}

          {/* 미리보기 자동 호출 — 상태 표시 + 추천창고 적용 + 매트릭스 펼침 */}
          {/* 재계산 중에도 직전 결과(previewData)를 그대로 두고 작은 스피너만 토글해 깜빡임 최소화 */}
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 22 }}>
            <Text type="secondary" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {previewData
                ? <>✓ 출고 가능 재고 자동 반영됨 (현재 재고 + 입고예정 − 다른 지시서 점유){previewLoading && <SearchOutlined spin style={{ marginLeft: 4 }} />}</>
                : previewLoading
                  ? <><SearchOutlined spin /> 재고 조회 중…</>
                  : <>출고처 · 예정일 · 품목 입력 시 재고 자동 조회</>}
            </Text>
            {previewData && recommendedManualWhId && watchedManualWarehouseId !== recommendedManualWhId && (
              <Button
                type="primary"
                ghost
                size="small"
                onClick={applyRecommendedWarehouse}
              >
                추천 창고 적용
              </Button>
            )}
            {previewData && (
              <Button
                type="link"
                size="small"
                onClick={() => setPreviewPanelOpen((v) => !v)}
              >
                {previewPanelOpen ? '매트릭스 접기' : '창고별 매트릭스 보기'}
              </Button>
            )}
            {previewData && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {recommendedManualWhId
                  ? `추천 창고: ${previewData.store_groups[0]?.requirements[0]?.warehouses.find((w) => w.warehouse_id === recommendedManualWhId)?.warehouse_name ?? '-'}`
                  : '단일 창고로 모든 품목 충당 불가 — 분할 고려 필요'}
              </Text>
            )}
          </div>

          {previewData && previewPanelOpen && (
            <div style={{ marginBottom: 12, border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, background: '#f8fafc' }}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                창고 × 품목 재고 — 출고 가능 = 현재 재고 + 입고예정 − 다른 지시서 점유
              </Text>
              {previewData.store_groups[0]?.requirements.map((req) => (
                <div key={req.product_id} style={{ marginBottom: 12, background: '#fff', padding: 10, borderRadius: 4 }}>
                  <div style={{ marginBottom: 6 }}>
                    <Text strong>{req.product_name}</Text>
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>{req.sku}</Text>
                    <Tag color="blue" style={{ marginLeft: 8 }}>필요 {req.required_qty}개</Tag>
                  </div>
                  <Table
                    size="small"
                    pagination={false}
                    dataSource={req.warehouses}
                    rowKey="warehouse_id"
                    columns={[
                      { title: '창고', dataIndex: 'warehouse_name', width: 140,
                        render: (v: string, r) => (
                          <Space>
                            {v}
                            {r.warehouse_id === recommendedManualWhId && <Tag color="green">추천</Tag>}
                          </Space>
                        ),
                      },
                      { title: '현재 재고', dataIndex: 'current_available_qty', align: 'right', width: 90 },
                      { title: '입고예정', dataIndex: 'incoming_qty', align: 'right', width: 90 },
                      { title: '다른 지시서 점유', dataIndex: 'draft_reserved_qty', align: 'right', width: 110 },
                      { title: '출고 가능', dataIndex: 'projected_qty', align: 'right', width: 90,
                        render: (v: number) => <strong>{v}</strong> },
                      { title: '상태', dataIndex: 'status', align: 'center', width: 80,
                        render: (s: string) => {
                          const colors: Record<string, string> = { SUFFICIENT: 'green', SHORTAGE: 'orange', NONE: 'default' };
                          const labels: Record<string, string> = { SUFFICIENT: '충분', SHORTAGE: '부족', NONE: '없음' };
                          return <Tag color={colors[s] ?? 'default'}>{labels[s] ?? s}</Tag>;
                        },
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fields.map(({ key, name }, index) => {
                  const row = watchedManualItems?.[name];
                  const productId = row?.productId;
                  const qty = Number(row?.qty ?? 0);
                  // 표시 가용재고: 미리보기 응답의 projected (ATP) 만 사용. 응답 없으면 null.
                  const available = productId && watchedManualWarehouseId && previewData
                    ? (manualProjectedByProduct.get(productId) ?? 0)
                    : null;
                  const isShortage = available !== null && qty > available;
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-start',
                        gap: 8,
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      <Form.Item
                        name={[name, 'productId']}
                        label={index === 0 ? '상품' : ' '}
                        style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%', marginBottom: 0 }}
                        rules={[{ required: true, message: '상품을 선택하세요.' }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder={watchedManualWarehouseId
                            ? 'SKU · 상품명 선택 (출고 가능 재고 표시)'
                            : '창고를 먼저 선택하세요'}
                          loading={manualProductsLoading}
                          options={manualProductOptions}
                          onChange={(pid) => handleManualOutboundProductChange(name, pid)}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[name, 'qty']}
                        label={index === 0 ? '수량' : ' '}
                        style={{ flex: '0 0 104px', width: 104, marginBottom: 0 }}
                        rules={[{ required: true, message: '수량을 입력하세요.' }]}
                        validateStatus={isShortage ? 'error' : undefined}
                        help={isShortage ? `출고 가능 ${available}개 초과` : undefined}
                      >
                        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <div style={{ flex: '1 1 100px', minWidth: 88, maxWidth: 140, marginTop: index === 0 ? 30 : 4, fontSize: 12, lineHeight: 1.4 }}>
                        {available === null && !watchedManualWarehouseId && (
                          <Text type="secondary" style={{ fontSize: 11 }}>창고 선택 시 표시</Text>
                        )}
                        {available === null && watchedManualWarehouseId && (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {previewLoading ? '재고 조회 중…' : '품목·수량 입력 시 재고 표시'}
                          </Text>
                        )}
                        {available !== null && available > 0 && (
                          <span style={{ color: isShortage ? '#ef4444' : '#52c41a', fontWeight: 600 }}>
                            출고 가능 {available.toLocaleString()}
                          </span>
                        )}
                        {available === 0 && (
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>출고 가능 재고 없음</span>
                        )}
                      </div>
                      <Form.Item
                        name={[name, 'unitPrice']}
                        label={index === 0 ? '단가' : ' '}
                        style={{ flex: '0 0 112px', width: 112, marginBottom: 0 }}
                      >
                        <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                      </Form.Item>
                      <div style={{ flexShrink: 0, marginLeft: 'auto', marginTop: index === 0 ? 30 : 4 }}>
                        <Button
                          danger
                          type="text"
                          size="large"
                          icon={<DeleteOutlined style={{ fontSize: 18 }} />}
                          onClick={() => remove(name)}
                          disabled={fields.length === 1}
                          aria-label="품목 삭제"
                          style={{ minWidth: 40, height: 40, paddingInline: 10 }}
                        />
                      </div>
                    </div>
                  );
                })}
                <Button type="dashed" onClick={() => add({ productId: undefined, qty: 1, unitPrice: undefined })} icon={<PlusOutlined />}>
                  품목 추가
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
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
        .order-list-tone .sales-so-progress-col.ant-table-cell {
          overflow: visible !important;
          vertical-align: middle !important;
        }
      `}</style>
    </>
  );
}
