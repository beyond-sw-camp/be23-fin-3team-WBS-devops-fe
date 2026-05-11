import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Typography, Table, Space, Tag, Modal, Alert, App, Select, Tabs, Badge, Button, Form, DatePicker, InputNumber, Input, Segmented, Progress, Card } from 'antd';
import { CloudDownloadOutlined, PlusOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined, FileDoneOutlined, LineChartOutlined, CalendarOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import type { WorkEventMessage } from '@/types/stomp';
import { showStompToast } from '@/lib/stompMessages';
import { getClientIdFromToken } from '@/utils/jwt';
import type { ColumnsType } from 'antd/es/table';
import type { InboundOrder, OrderStatus } from '@/types/order';
import { ORDER_STATUS_CONFIG } from '@/types/order';
import { useCreateManualInbound, useInboundOrders, useSearchInboundOrders } from '@/hooks/useInboundQuery';
import { useProductFilterForOrder } from '@/hooks/useProductFilterForOrder';
import { ProductFilterTriggerButton, ProductFilterStatusBar } from '@/components/ProductSearch';
import { useMasterWarehouses } from '@/hooks/useWarehouseQuery';
import { getSuppliers } from '@/api/supplier';
import { getProductsReal } from '@/api/product';
import {
  getPurchaseOrderList,
  type PurchaseOrderListItem,
  type PurchaseOrderListParams,
  type PurchaseOrderProcessStatus,
} from '@/api/inbound';
import type { Product } from '@/types/product';
import PermissionButton from '@/components/PermissionButton';
import AssignedWorkerCell from '@/components/AssignedWorkerCell';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const LAST_WH_KEY = 'inbound:lastWarehouseId';

interface ManualInboundPrefill {
  source?: 'low-stock' | 'atp';
  productId?: string;
  productName?: string;
  sku?: string;
  warehouseId?: string;
  warehouseName?: string;
  availableQty?: number;
  minStockQty?: number;
  requestedQty?: number;
}

function normalizeText(v?: string | null): string {
  return (v ?? '').toLowerCase().replace(/\s+/g, '').trim();
}

/** 입고 지시서 탭 정의 — 백엔드 상태를 업무 단계로 묶음 */
type InboundTabKey = 'all' | 'scheduled' | 'in_progress' | 'completed' | 'issue';

const TAB_STATUSES: Record<InboundTabKey, OrderStatus[] | null> = {
  all: null,
  scheduled: ['draft', 'approved'],
  in_progress: ['received', 'placing', 'in_progress'],
  completed: ['completed'],
  issue: ['partial', 'cancelled'],
};

const TAB_LABELS: Record<InboundTabKey, string> = {
  all: '전체',
  scheduled: '예정',
  in_progress: '진행중',
  completed: '완료',
  issue: '이슈',
};

const TAB_BADGE_COLOR: Record<InboundTabKey, string> = {
  all: '#64748b',
  scheduled: '#1677ff',
  in_progress: '#f59e0b',
  completed: '#52c41a',
  issue: '#ef4444',
};

export default function InboundListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualForm] = Form.useForm();
  const initialTab = ((): InboundTabKey => {
    const t = searchParams.get('tab');
    return (['all', 'scheduled', 'in_progress', 'completed', 'issue'] as InboundTabKey[])
      .includes(t as InboundTabKey) ? (t as InboundTabKey) : 'all';
  })();
  const initialView = (searchParams.get('view') === 'po' ? 'po' : 'orders') as 'orders' | 'po';
  const [viewMode, setViewMode] = useState<'orders' | 'po'>(initialView);
  const [activeTab, setActiveTab] = useState<InboundTabKey>(initialTab);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | OrderStatus>('ALL');

  // PO 뷰 전용 상태 — 페이지/PO 처리상태 필터
  const [poStatusFilter, setPoStatusFilter] = useState<'ALL' | PurchaseOrderProcessStatus>('ALL');
  const [poPage, setPoPage] = useState(0);
  const PO_PAGE_SIZE = 20;

  const resetFilters = () => {
    setSearchKeyword('');
    setDateFrom(null);
    setDateTo(null);
    setOrderStatusFilter('ALL');
    setPoStatusFilter('ALL');
    setPoPage(0);
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
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [prefillContext, setPrefillContext] = useState<ManualInboundPrefill | null>(null);
  const prefillUnitPriceFilledRef = useRef(false);
  // 수동 모달의 default 창고 — 마지막 선택값 (localStorage). ASN 모달 제거 후에도 유지.
  const [warehouseId, setWarehouseId] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem(LAST_WH_KEY) : null),
  );
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const clientId = getClientIdFromToken();
  useStompInvalidate<WorkEventMessage>(
    clientId ? `/topic/admin/inbound/${clientId}` : null,
    (event) => {
      queryClient.invalidateQueries({ queryKey: ['inbound-orders'] });
      showStompToast(message, event);
    },
  );

  // 전체 주문을 한 번만 가져오고 탭별로 클라이언트 필터링 (카운트 계산 위함)
  // 반품 입고는 [반품 관리] 메뉴에서 별도로 보므로 일반 목록에선 자동 제외
  const productFilter = useProductFilterForOrder();
  const { data: rawOrders = [], isLoading: rawLoading } = useInboundOrders({ excludeOriginType: 'return' });
  const { data: searchedOrders = [], isLoading: searchLoading } = useSearchInboundOrders(
    productFilter.productIds,
    { excludeOriginType: 'return' },
  );
  const allOrders = productFilter.isFiltering ? searchedOrders : rawOrders;
  const isLoading = productFilter.isFiltering ? searchLoading : rawLoading;
  // 창고는 수동 생성 모달 열 때만 조회 — 페이지 진입 지연 방지
  const { data: warehouses = [], isLoading: whLoading } = useMasterWarehouses(manualModalOpen);
  const createManualInbound = useCreateManualInbound();

  // PO 뷰 — 발주서 목록 + 진행률 (Spring Page)
  const poQueryParams: PurchaseOrderListParams = useMemo(() => ({
    status: poStatusFilter,
    poNoKeyword: searchKeyword || undefined,
    dateFrom: dateFrom?.format('YYYY-MM-DD'),
    dateTo: dateTo?.format('YYYY-MM-DD'),
    page: poPage,
    size: PO_PAGE_SIZE,
  }), [poStatusFilter, searchKeyword, dateFrom, dateTo, poPage]);
  const { data: poPageData, isLoading: poLoading } = useQuery({
    queryKey: ['purchase-orders', poQueryParams],
    queryFn: () => getPurchaseOrderList(poQueryParams),
    enabled: viewMode === 'po',
  });
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ['suppliers', 'manual-inbound'],
    queryFn: () => getSuppliers(),
    enabled: manualModalOpen,
  });
  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'manual-inbound'],
    queryFn: getProductsReal,
    enabled: manualModalOpen,
  });

  // 탭별 건수
  const tabCounts = useMemo(() => {
    const counts: Record<InboundTabKey, number> = {
      all: allOrders.length,
      scheduled: 0,
      in_progress: 0,
      completed: 0,
      issue: 0,
    };
    allOrders.forEach((o) => {
      (Object.keys(TAB_STATUSES) as InboundTabKey[]).forEach((key) => {
        const statuses = TAB_STATUSES[key];
        if (key !== 'all' && statuses?.includes(o.status)) counts[key] += 1;
      });
    });
    return counts;
  }, [allOrders]);

  // 현재 탭(상위 그룹) + 상태 Select + 검색어 + 날짜 범위 (입고예정일) 필터
  const orders = useMemo(() => {
    const statuses = TAB_STATUSES[activeTab];
    const base = statuses ? allOrders.filter((o) => statuses.includes(o.status)) : allOrders;
    const kw = searchKeyword.trim().toLowerCase();
    return base.filter((o) => {
      if (kw && !o.order_no.toLowerCase().includes(kw) && !(o.vendor_name ?? '').toLowerCase().includes(kw)) return false;
      if (orderStatusFilter !== 'ALL' && o.status !== orderStatusFilter) return false;
      if (!inDateRange(o.expected_date)) return false;
      return true;
    });
    // inDateRange 는 dateFrom/dateTo 만 의존
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders, activeTab, orderStatusFilter, searchKeyword, dateFrom, dateTo]);

  const inboundWarehouses = useMemo(
    () => warehouses.filter((w) => (w.warehouse_type ?? 'NORMAL') === 'NORMAL'),
    [warehouses],
  );
  const validWarehouseIds = useMemo(() => new Set(inboundWarehouses.map((w) => w.id)), [inboundWarehouses]);
  const warehouseOptions = useMemo(() => inboundWarehouses.map((w, index) => ({
    key: `warehouse-${w.id}-${index}`,
    label: `${w.name}${w.code ? ` (${w.code})` : ''}`,
    value: w.id,
  })), [inboundWarehouses]);
  const selectedManualSupplierId = Form.useWatch('supplierId', manualForm);
  const needManualSupplierForAtp = prefillContext?.source === 'atp' && !selectedManualSupplierId;

  // 상품 옵션 — 항상 전체 (사용자가 상품 먼저 선택)
  const productOptionMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const productOptions = useMemo(() => products.map((product, index) => ({
    key: `product-${product.id}-${index}`,
    label: `${product.sku} · ${product.name}`,
    value: product.id,
  })), [products]);

  // ── 입고처 자동 필터 ──
  // 사용자가 상품을 선택하면 그 상품들의 supplier_id 로 입고처 옵션을 필터한다.
  // - 모두 같은 supplier → 그 supplier 만 노출
  // - 모두 null (자사) → "자사" 한 옵션 (백엔드엔 null 전송)
  // - 섞임 → mixed (옵션 비움 + 안내 + 비활성화)
  const OWN_SUPPLIER_SENTINEL = '__OWN__';
  const watchedItems = Form.useWatch('items', manualForm) as Array<{ productId?: string }> | undefined;
  const selectedProductIds = useMemo(
    () => (watchedItems ?? [])
      .map((it) => it?.productId)
      .filter((id): id is string => !!id),
    [watchedItems],
  );
  const qualifyingSupplier = useMemo(() => {
    const selected = selectedProductIds
      .map((id) => productOptionMap.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (selected.length === 0) return { mode: 'unrestricted' as const };
    const ids = new Set<string | null>(selected.map((p) => p.supplier_id ?? null));
    if (ids.size > 1) return { mode: 'mixed' as const };
    return { mode: 'single' as const, supplierId: [...ids][0] };
  }, [selectedProductIds, productOptionMap]);

  const supplierOptions = useMemo(() => {
    if (qualifyingSupplier.mode === 'mixed') return [];
    if (qualifyingSupplier.mode === 'single') {
      if (qualifyingSupplier.supplierId === null) {
        return [{ key: 'supplier-own', label: '자사', value: OWN_SUPPLIER_SENTINEL }];
      }
      const sup = suppliers.find((s) => s.id === qualifyingSupplier.supplierId);
      return sup ? [{ key: `supplier-${sup.id}`, label: sup.name, value: sup.id }] : [];
    }
    // unrestricted — 상품 미선택. 모든 입고처 + 자사
    return [
      ...suppliers.map((s, i) => ({ key: `supplier-${s.id}-${i}`, label: s.name, value: s.id })),
      { key: 'supplier-own', label: '자사', value: OWN_SUPPLIER_SENTINEL },
    ];
  }, [qualifyingSupplier, suppliers]);

  // 상품 변경 시 입고처 자동 동기화 (단일이면 자동 채움, 호환 안 되면 비움)
  useEffect(() => {
    if (!manualModalOpen) return;
    const current = manualForm.getFieldValue('supplierId') as string | undefined;
    if (qualifyingSupplier.mode === 'mixed') {
      if (current) manualForm.setFieldsValue({ supplierId: undefined });
      return;
    }
    if (qualifyingSupplier.mode === 'single') {
      const expected = qualifyingSupplier.supplierId === null
        ? OWN_SUPPLIER_SENTINEL
        : qualifyingSupplier.supplierId;
      if (current !== expected) manualForm.setFieldsValue({ supplierId: expected });
    }
  }, [qualifyingSupplier, manualForm, manualModalOpen]);

  useEffect(() => {
    if (whLoading) return;
    if (inboundWarehouses.length === 0) {
      setWarehouseId(null);
      return;
    }
    if (warehouseId && validWarehouseIds.has(warehouseId)) return;

    const nextWarehouseId = warehouseOptions[0]?.value ?? null;
    setWarehouseId(nextWarehouseId);
    if (nextWarehouseId) {
      localStorage.setItem(LAST_WH_KEY, nextWarehouseId);
      return;
    }
    localStorage.removeItem(LAST_WH_KEY);
  }, [whLoading, warehouseId, warehouseOptions, inboundWarehouses.length, validWarehouseIds]);

  const openManualModal = (prefill?: ManualInboundPrefill) => {
    setPrefillContext(prefill ?? null);
    prefillUnitPriceFilledRef.current = false;

    let nextWarehouseId: string | undefined;
    if (prefill?.warehouseId && validWarehouseIds.has(prefill.warehouseId)) nextWarehouseId = prefill.warehouseId;
    else if (warehouseId && validWarehouseIds.has(warehouseId)) nextWarehouseId = warehouseId;
    else if (prefill?.warehouseName) {
      const targetWh = normalizeText(prefill.warehouseName);
      const matchedByName = inboundWarehouses.find((w) => normalizeText(w.name) === targetWh || normalizeText(w.code) === targetWh);
      if (matchedByName) nextWarehouseId = matchedByName.id;
    }

    let nextQty = 1;
    let nextProductId: string | undefined;
    if (prefill) {
      if (prefill.source === 'atp') {
        nextQty = Math.max(prefill.requestedQty ?? 1, 1);
      } else {
        const delta = (prefill.minStockQty ?? 0) - (prefill.availableQty ?? 0);
        nextQty = delta > 0 ? delta : Math.max(prefill.minStockQty ?? 1, 1);
      }
      nextProductId = prefill.productId;
    }

    manualForm.setFieldsValue({
      supplierId: undefined,
      warehouseId: nextWarehouseId,
      expectedDate: dayjs(),
      items: [{ productId: nextProductId, qty: nextQty, unitPrice: undefined }],
    });
    setManualModalOpen(true);
  };

  const closeManualModal = () => {
    setManualModalOpen(false);
    setPrefillContext(null);
    prefillUnitPriceFilledRef.current = false;
    manualForm.resetFields();
  };

  // ATP/저재고 프리필로 진입했는데 창고 목록이 늦게 로드된 경우, 창고 재매칭
  useEffect(() => {
    if (!manualModalOpen || !prefillContext) return;
    const currentWarehouseId = manualForm.getFieldValue('warehouseId') as string | undefined;
    if (currentWarehouseId) return;

    let matchedWarehouseId: string | undefined;
    if (prefillContext.warehouseId && validWarehouseIds.has(prefillContext.warehouseId)) {
      matchedWarehouseId = prefillContext.warehouseId;
    } else if (prefillContext.warehouseName && warehouses.length > 0) {
      const targetWh = normalizeText(prefillContext.warehouseName);
      const matchedByName = warehouses.find((w) => normalizeText(w.name) === targetWh || normalizeText(w.code) === targetWh);
      matchedWarehouseId = matchedByName?.id;
    }

    if (matchedWarehouseId) {
      manualForm.setFieldsValue({ warehouseId: matchedWarehouseId });
      localStorage.setItem(LAST_WH_KEY, matchedWarehouseId);
    }
  }, [manualModalOpen, prefillContext, inboundWarehouses, validWarehouseIds, manualForm]);

  // 재고 부족 알림에서 넘어온 경우, 모달 자동 오픈 + 프리필
  const prefillConsumedRef = useRef(false);
  useEffect(() => {
    if (prefillConsumedRef.current) return;
    const state = location.state as { prefillManualInbound?: ManualInboundPrefill } | null;
    if (state?.prefillManualInbound) {
      prefillConsumedRef.current = true;
      openManualModal(state.prefillManualInbound);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 프리필 상품의 단가/기본 입고처는 products 로딩 후 자동 채움
  useEffect(() => {
    if (!prefillContext || prefillUnitPriceFilledRef.current) return;
    if (productsLoading) return;
    const product = prefillContext.productId
      ? productOptionMap.get(prefillContext.productId)
      : (() => {
        const targetName = normalizeText(prefillContext.productName);
        const targetSku = normalizeText(prefillContext.sku);
        return products.find((p) => {
          const name = normalizeText(p.name);
          const sku = normalizeText(p.sku);
          if (targetSku && sku === targetSku) return true;
          if (!targetName) return false;
          return name === targetName || name.includes(targetName) || targetName.includes(name);
        });
      })();
    if (!product) return;
    const items = (manualForm.getFieldValue('items') as Array<Record<string, unknown>> | undefined) ?? [];
    if (!items.length) return;
    prefillUnitPriceFilledRef.current = true;
    const next = items.map((item) => ({ ...(item ?? {}) }));
    next[0] = { ...(next[0] ?? {}), productId: product.id, unitPrice: product.standard_price ?? undefined };
    // supplierId 는 watchedItems → qualifyingSupplier useEffect 가 자동 동기화
    manualForm.setFieldsValue({ items: next });
  }, [prefillContext, productsLoading, productOptionMap, manualForm, products]);

  const handleCreateManualInbound = async () => {
    try {
      const values = await manualForm.validateFields();
      const selectedWarehouseId = values.warehouseId as string;
      localStorage.setItem(LAST_WH_KEY, selectedWarehouseId);
      const submittedSupplierId = values.supplierId === OWN_SUPPLIER_SENTINEL
        ? null
        : (values.supplierId as string);
      createManualInbound.mutate({
        supplierId: submittedSupplierId,
        warehouseId: selectedWarehouseId,
        expectedDate: values.expectedDate.format('YYYY-MM-DD'),
        source: 'manual',
        items: (values.items as { productId: string; qty: number; unitPrice?: number }[]).map((item) => ({
          productId: item.productId,
          qty: Number(item.qty),
          unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
        })),
      }, {
        onSuccess: (order: InboundOrder) => {
          message.success(`입고지시서 ${order.order_no} 생성 완료`);
          closeManualModal();
          navigate(`/order/inbound/${order.id}`);
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
            ?? '수동 입고 지시서 생성에 실패했습니다.';
          message.error(msg);
        },
      });
    } catch {
      // form validation
    }
  };

  const handleManualProductChange = (rowIndex: number, productId: string) => {
    const product = productOptionMap.get(productId) as Product | undefined;
    const currentItems = (manualForm.getFieldValue('items') as Array<Record<string, unknown>> | undefined) ?? [];
    const nextItems = currentItems.map((item) => ({ ...(item ?? {}) }));
    nextItems[rowIndex] = {
      ...(nextItems[rowIndex] ?? {}),
      productId,
      unitPrice: product?.standard_price ?? undefined,
    };
    manualForm.setFieldsValue({ items: nextItems });
  };

  // ── PO 뷰 컬럼 ──
  const PO_PROCESS_TAG: Record<PurchaseOrderProcessStatus, { color: string; label: string }> = {
    NOT_STARTED: { color: 'default', label: '미처리' },
    IN_PROGRESS: { color: 'processing', label: '진행중' },
    COMPLETED:   { color: 'success',    label: '완료' },
  };
  const poColumns: ColumnsType<PurchaseOrderListItem> = [
    { title: '발주번호', dataIndex: 'po_no', key: 'po_no', width: 150 },
    { title: '입고처', dataIndex: 'supplier_name', key: 'supplier_name', width: 130,
      render: (v: string | null) => v ?? '-' },
    { title: '발주일', dataIndex: 'order_date', key: 'order_date', width: 110, align: 'center' },
    { title: '입고예정일', dataIndex: 'scheduled_date', key: 'scheduled_date', width: 110, align: 'center' },
    {
      title: '처리상태', dataIndex: 'process_status', key: 'process_status', width: 90, align: 'center',
      render: (v: PurchaseOrderProcessStatus) => {
        const cfg = PO_PROCESS_TAG[v];
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '진행률', key: 'progress', width: 200,
      render: (_, r) => (
        <Space size={8} style={{ width: '100%' }}>
          <Progress
            percent={r.receive_progress_percent}
            size="small"
            status={r.receive_progress_percent === 100 ? 'success' : 'active'}
            style={{ width: 110 }}
            showInfo={false}
          />
          <Text style={{ fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
            {r.receive_progress_percent}%
          </Text>
        </Space>
      ),
    },
    { title: '품목수', dataIndex: 'item_count', key: 'item_count', width: 70, align: 'center' },
    { title: '총수량', dataIndex: 'total_ordered_qty', key: 'total_ordered_qty', width: 90, align: 'right',
      render: (v: number) => v?.toLocaleString() ?? '-' },
    {
      title: '', key: 'action', width: 110, align: 'center',
      render: (_, r) => (
        r.inbound_order_id ? (
          <a onClick={(e) => { e.stopPropagation(); navigate(`/order/inbound/${r.inbound_order_id}`); }}>
            입고지시서
          </a>
        ) : (
          <a onClick={(e) => { e.stopPropagation(); navigate('/order/inbound/new'); }}>
            지시서 생성
          </a>
        )
      ),
    },
  ];

  const columns: ColumnsType<InboundOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 140 },
    { title: '입고처', dataIndex: 'vendor_name', key: 'vendor_name', width: 130 },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
    { title: '입고예정일', dataIndex: 'expected_date', key: 'expected_date', width: 110, align: 'center' },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center', render: (v: OrderStatus) => <Tag color={ORDER_STATUS_CONFIG[v].color}>{ORDER_STATUS_CONFIG[v].label}</Tag> },
    {
      title: '배정 작업자', key: 'assigned_to', width: 130,
      render: (_, r) => <AssignedWorkerCell assignedTo={r.assigned_to} assignedToName={r.assigned_to_name} />,
    },
    { title: '품목수', dataIndex: 'total_items', key: 'total_items', width: 70, align: 'center', render: (v: number) => v ?? '-' },
    { title: '총수량', dataIndex: 'total_qty', key: 'total_qty', width: 80, align: 'right', render: (v: number) => v?.toLocaleString() ?? '-' },
    {
      title: '출처', dataIndex: 'source', key: 'source', width: 90, align: 'center',
      render: (v: string, record) => {
        if (v === 'return') return <Tag color="volcano">반품{record.return_from ? ` · ${record.return_from}` : ''}</Tag>;
        if (v === 'purchase_order') return <Tag color="blue">발주서</Tag>;
        return <span>{v || '-'}</span>;
      },
    },
  ];

  return (
    <>
      <div className="order-list-tone" style={{ color: '#334155', fontSize: 14, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>입고 지시서</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>발주서 기반 입고 지시서 생성</Text>
        </Space>
        <Space>
          <PermissionButton resource="INBOUND" action="CREATE" icon={<PlusOutlined />} onClick={() => openManualModal()}>
            수동 생성
          </PermissionButton>
          <PermissionButton resource="INBOUND" action="CREATE" icon={<CloudDownloadOutlined />} type="primary" onClick={() => navigate('/order/inbound/new')}>
            발주서로 생성
          </PermissionButton>
        </Space>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={viewMode}
          onChange={(v) => {
            const next = v as 'orders' | 'po';
            setViewMode(next);
            setPoPage(0);
            setSearchParams((prev) => {
              const p = new URLSearchParams(prev);
              if (next === 'orders') p.delete('view');
              else p.set('view', 'po');
              return p;
            }, { replace: true });
          }}
          options={[
            { label: <Space size={6}><FileDoneOutlined />입고지시서 목록</Space>, value: 'orders' },
            { label: <Space size={6}><LineChartOutlined />발주서 목록</Space>, value: 'po' },
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
              placeholder={viewMode === 'orders' ? '지시서번호 또는 입고처명' : '발주번호 또는 입고처명'}
              value={searchKeyword}
              onChange={(e) => { setSearchKeyword(e.target.value); setPoPage(0); }}
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
                  { label: '검수', value: 'received' },
                  { label: '적치중', value: 'placing' },
                  { label: '진행중', value: 'in_progress' },
                  { label: '완료', value: 'completed' },
                  { label: '부분', value: 'partial' },
                  { label: '취소', value: 'cancelled' },
                ]}
              />
            ) : (
              <Select
                value={poStatusFilter}
                onChange={(v) => { setPoStatusFilter(v); setPoPage(0); }}
                style={{ width: 140 }}
                options={[
                  { label: '전체 상태', value: 'ALL' },
                  { label: '미처리', value: 'NOT_STARTED' },
                  { label: '진행중', value: 'IN_PROGRESS' },
                  { label: '완료', value: 'COMPLETED' },
                ]}
              />
            )}
          </Space>
          <Space size={8} align="center">
            <CalendarOutlined style={{ color: '#64748b' }} />
            <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>입고예정일</Text>
            <DatePicker value={dateFrom} onChange={(d) => { setDateFrom(d); setPoPage(0); }} placeholder="시작" style={{ width: 140 }} />
            <Text type="secondary">~</Text>
            <DatePicker value={dateTo} onChange={(d) => { setDateTo(d); setPoPage(0); }} placeholder="종료" style={{ width: 140 }} />
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
              filteredLineCount={allOrders.length}
            />
          </div>
        )}
      </Card>

      {viewMode === 'orders' && (
        <>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => {
              const next = k as InboundTabKey;
              setActiveTab(next);
              setSearchParams((prev) => {
                const p = new URLSearchParams(prev);
                if (next === 'all') p.delete('tab');
                else p.set('tab', next);
                return p;
              }, { replace: true });
            }}
            items={(Object.keys(TAB_STATUSES) as InboundTabKey[]).map((key) => ({
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
            onRow={(r) => ({ onClick: () => navigate(`/order/inbound/${r.id}`), style: { cursor: 'pointer' } })} />
        </>
      )}

      {viewMode === 'po' && (
        <Table
          columns={poColumns}
          dataSource={poPageData?.content ?? []}
          rowKey="id"
          loading={poLoading}
          pagination={{
            current: (poPageData?.number ?? 0) + 1,
            pageSize: PO_PAGE_SIZE,
            total: poPageData?.total_elements ?? 0,
            showSizeChanger: false,
            onChange: (p) => setPoPage(p - 1),
          }}
          onRow={(r) => ({
            onClick: (e) => {
              const target = e.target as HTMLElement;
              if (target.closest('a, button')) return;
              if (r.inbound_order_id) navigate(`/order/inbound/${r.inbound_order_id}`);
              else navigate('/order/inbound/new');
            },
            style: { cursor: 'pointer' },
          })}
        />
      )}

      <Modal
        title="수동 입고 지시서 생성"
        open={manualModalOpen}
        onCancel={closeManualModal}
        onOk={handleCreateManualInbound}
        okText="생성"
        confirmLoading={createManualInbound.isPending}
        width={880}
        destroyOnHidden
      >
        <Form form={manualForm} layout="vertical">
          {prefillContext && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 14 }}
              message={
                <Space size={20} wrap>
                  {prefillContext.source === 'atp' && (
                    <Tag color="red" style={{ margin: 0, fontWeight: 600 }}>긴급 출고 대응</Tag>
                  )}
                  <span>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>부족 품목</Text>
                    <Text strong style={{ fontSize: 13 }}>{prefillContext.sku ?? '-'}</Text>
                    <Text style={{ fontSize: 13, marginLeft: 6 }}>· {prefillContext.productName ?? '-'}</Text>
                  </span>
                  <span>
                    <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>창고</Text>
                    <Text strong style={{ fontSize: 13 }}>{prefillContext.warehouseName ?? '-'}</Text>
                  </span>
                  {prefillContext.source === 'atp' ? (
                    <span>
                      <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>권장 입고 수량</Text>
                      <Text strong style={{ fontSize: 13, color: '#ef4444' }}>{prefillContext.requestedQty ?? 1}</Text>
                    </span>
                  ) : (
                    <span>
                      <Text type="secondary" style={{ fontSize: 12, marginRight: 6 }}>가용 / 안전</Text>
                      <Text strong style={{ fontSize: 13, color: '#ef4444' }}>{prefillContext.availableQty ?? 0}</Text>
                      <Text style={{ fontSize: 13, margin: '0 4px' }}>/</Text>
                      <Text strong style={{ fontSize: 13 }}>{prefillContext.minStockQty ?? 0}</Text>
                    </span>
                  )}
                </Space>
              }
            />
          )}
          {needManualSupplierForAtp && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="입고처 자동 추천에 실패했습니다. 긴급 입고 진행 전 입고처를 수동으로 확인·선택하세요."
            />
          )}
          <Space size={12} style={{ display: 'flex', marginBottom: 8 }} align="start">
            <Form.Item name="supplierId" label="입고처" style={{ flex: 1, marginBottom: 0 }} rules={[{ required: true, message: '입고처를 선택하세요.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={qualifyingSupplier.mode === 'mixed' ? '상품 공급사가 섞여있어 선택 불가' : '상품을 먼저 선택하세요'}
                loading={suppliersLoading}
                options={supplierOptions}
                disabled={qualifyingSupplier.mode === 'mixed' || supplierOptions.length === 0}
              />
            </Form.Item>
            <Form.Item name="warehouseId" label="입고 창고" style={{ flex: 1, marginBottom: 0 }} rules={[{ required: true, message: '입고 창고를 선택하세요.' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="창고 선택"
                loading={whLoading}
                options={warehouseOptions}
              />
            </Form.Item>
            <Form.Item name="expectedDate" label="예정일" style={{ width: 160, marginBottom: 0 }} rules={[{ required: true, message: '예정일을 선택하세요.' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          {!suppliersLoading && suppliers.length === 0 && (
            <Alert type="warning" showIcon message="입고처가 없습니다. 먼저 입고처를 등록해야 수동 생성이 가능합니다." style={{ marginBottom: 12 }} />
          )}
          {!productsLoading && products.length === 0 && (
            <Alert
              type="warning"
              showIcon
              message="상품이 없습니다. 먼저 상품을 등록하세요."
              style={{ marginBottom: 12 }}
            />
          )}
          {qualifyingSupplier.mode === 'mixed' && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="선택한 상품의 공급사가 서로 달라 한 입고지시서로 받을 수 없습니다."
              description="공급사가 같은 상품끼리 분리해 입고지시서를 따로 만들어 주세요."
            />
          )}
          {qualifyingSupplier.mode === 'single' && supplierOptions.length === 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="선택한 상품에 등록된 공급사가 없습니다."
            />
          )}

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fields.map(({ key, name }, index) => (
                  <Space key={key} align="start" style={{ display: 'flex' }}>
                    <Form.Item
                      name={[name, 'productId']}
                      label={index === 0 ? '상품' : ' '}
                      style={{ width: 420, marginBottom: 0 }}
                      rules={[{ required: true, message: '상품을 선택하세요.' }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder="SKU · 상품명 선택"
                        loading={productsLoading}
                        options={productOptions}
                        onChange={(productId) => handleManualProductChange(name, productId)}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'qty']}
                      label={index === 0 ? '수량' : ' '}
                      style={{ width: 120, marginBottom: 0 }}
                      rules={[{ required: true, message: '수량을 입력하세요.' }]}
                    >
                      <InputNumber min={1} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name={[name, 'unitPrice']}
                      label={index === 0 ? '단가' : ' '}
                      style={{ width: 140, marginBottom: 0 }}
                    >
                      <InputNumber min={0} precision={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(name)}
                      disabled={fields.length === 1}
                      style={{ marginTop: 29 }}
                    />
                  </Space>
                ))}
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
      `}</style>
    </>
  );
}
