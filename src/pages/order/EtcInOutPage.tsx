import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Typography, Table, Tag, Modal, Form, Select, Input, App,
  Button, InputNumber, Spin,
} from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { EtcInOutOrder, EtcInOutIoType, EtcInOutStatus, ItemCondition } from '@/types/order';
import {
  useCreateEtcInOut,
  useEtcInOutOrders,
  useEtcInoutInboundRequestPreview,
  useSendEtcInoutInboundRequest,
} from '@/hooks/useOrderQuery';
import { useStompInvalidate } from '@/hooks/useStompInvalidate';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { getDraftOutboundsDigest, cancelOutboundOrder } from '@/api/order';
import type { OutboundOrder, OutboundOrderItem } from '@/types/order';
import type { WorkEventMessage } from '@/types/stomp';
import { getClientIdFromToken } from '@/utils/jwt';
import { useMasterWarehouses, useZonesByWarehouse } from '@/hooks/useWarehouseQuery';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import { useProducts, useStores } from '@/hooks/useMasterQuery';
import { getSuggestedLocations, type SuggestedLocation } from '@/api/inventory';
import type { WarehouseType } from '@/types/warehouse';
import PermissionButton from '@/components/PermissionButton';
import { extractApiErrorMessage, isCapacityExceededError } from '@/utils/apiError';

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

interface EtcInOutItemRow {
  key: number;
  productId: string;
  productName: string;
  sku: string;
  zoneId?: string;
  zoneName?: string;
  rackId?: string;
  rackCode?: string;
  locationId: string;
  locationLabel: string;
  qty: number;
  processedQty: number;
  defectQty: number;
  defectLocationId?: string;
  defectLocationLabel?: string;
  defaultDefectLocationId?: string;
  defaultDefectLocationLabel?: string;
  maxQty: number | null;
  lotNo?: string;
  condition: ItemCondition;
  defectReason?: string;
  note?: string;
  /** 선택된 위치의 가용 수용량 (suggest API 응답). null = 무제한 */
  availableCapacity?: number | null;
  /** suggest API의 전체 응답 — 자동 분할 시 사용 */
  suggestions?: SuggestedLocation[];
}

function isOutboundIoType(ioType: EtcInOutIoType | undefined): boolean {
  return !!ioType && ioType.endsWith('_out');
}

function isDefectZoneLabel(v: string | undefined): boolean {
  const text = (v ?? '').trim().toUpperCase();
  return text.includes('DEFECT') || text.includes('불량');
}

export default function EtcInOutPage() {
  const location = useLocation();
  // /etc-inout/in → 'in', /etc-inout/out → 'out', 그 외 → null (전체)
  const directionFilter: 'in' | 'out' | null =
    location.pathname.endsWith('/in') ? 'in' :
    location.pathname.endsWith('/out') ? 'out' : null;
  const directionLabel =
    directionFilter === 'in' ? '기타 입고' :
    directionFilter === 'out' ? '기타 출고' : '기타 입출고';
  const pageTitle = directionLabel;

  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [itemRows, setItemRows] = useState<EtcInOutItemRow[]>([]);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  // 가용재고 부족 시 띄우는 출고지시서 취소 후보 모달
  const [cancelCandidatesOpen, setCancelCandidatesOpen] = useState(false);
  const [shortageProductIds, setShortageProductIds] = useState<string[]>([]);
  const [selectedCancelOrderIds, setSelectedCancelOrderIds] = useState<string[]>([]);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  /** 한번이라도 부족 모달을 거쳤는지 — 생성 성공 후 메일 모달 자동 오픈 트리거 */
  const [wasShortageEncountered, setWasShortageEncountered] = useState(false);
  /** 부족분 정보 (메일 본문 생성용) */
  const [pendingShortageItems, setPendingShortageItems] = useState<{ productId: string; productName: string; requested: number; available: number; shortage: number }[]>([]);
  /** 실제로 취소한 출고지시서 ID 목록 — 생성 시 cancelledOutboundIds 로 전달, 백엔드가 cancellation_link + 메일 본문 자동 생성 */
  const [cancelledOutboundIds, setCancelledOutboundIds] = useState<string[]>([]);
  /** 생성 성공 직후 SMTP 메일 작성 모달 — 백엔드 preview API로 양식 받아 편집 후 전송 */
  const [mailFormOpen, setMailFormOpen] = useState(false);
  const [mailFormOrderId, setMailFormOrderId] = useState<string | null>(null);
  const [mailForm, setMailForm] = useState<{ recipient: string; senderName: string; subject: string; body: string } | null>(null);
  const sendInboundRequestMutation = useSendEtcInoutInboundRequest();
  const previewQuery = useEtcInoutInboundRequestPreview(mailFormOrderId, mailFormOpen);

  // preview 응답이 오면 폼 초기값 1회만 채움
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

  const closeMailForm = () => {
    setMailFormOpen(false);
    setMailFormOrderId(null);
    setMailForm(null);
    setPendingShortageItems([]);
    resetModalState();
  };

  const handleSendInboundMail = () => {
    if (!mailForm || !mailFormOrderId) return;
    sendInboundRequestMutation.mutate(
      {
        id: mailFormOrderId,
        input: {
          recipient: mailForm.recipient,
          senderName: mailForm.senderName,
          subject: mailForm.subject,
          body: mailForm.body,
          shortageItems: pendingShortageItems,
        },
      },
      {
        onSuccess: (res) => {
          if (res.status === 'sent') {
            message.success('입고 요청 메일이 전송되었습니다.');
          } else {
            message.error(`메일 전송 실패: ${res.errorMessage ?? '알 수 없는 오류'}`);
          }
          setPendingShortageItems([]);
          closeMailForm();
        },
        onError: (err) => message.error(extractApiErrorMessage(err, '메일 전송에 실패했습니다.')),
      },
    );
  };

  const { data: allOrders = [], isLoading } = useEtcInOutOrders();
  // URL의 direction에 따라 입고/출고만 필터 (전체 보기 시엔 그대로)
  const orders = useMemo(() => {
    if (directionFilter === 'in') return allOrders.filter((o) => o.io_type.endsWith('_in'));
    if (directionFilter === 'out') return allOrders.filter((o) => o.io_type.endsWith('_out'));
    return allOrders;
  }, [allOrders, directionFilter]);
  const selectedIoType = Form.useWatch('ioType', form) as EtcInOutIoType | undefined;
  const selectedWarehouseId = Form.useWatch('warehouseId', form) as string | undefined;
  const isOutbound = isOutboundIoType(selectedIoType);
  // 사유에 따라 창고 목록 자동 분기 (폐기 → DISPOSAL, 그 외 → 전체)
  const warehouseType: WarehouseType | undefined =
    (selectedIoType === 'dispose_in' || selectedIoType === 'dispose_out') ? 'DISPOSAL' : undefined;
  // InboundListPage와 동일 — 모달 열릴 때 fetch (캐시 공유)
  const { data: allWarehouses = [] } = useMasterWarehouses(modalOpen);
  const warehouses = useMemo(() => {
    const active = allWarehouses.filter((w) => w.active);
    if (warehouseType) return active.filter((w) => w.warehouse_type === warehouseType);
    return active;
  }, [allWarehouses, warehouseType]);
  const { data: products = [] } = useProducts();
  const { data: stores = [] } = useStores();
  // 출고처가 필요한 사유 (가이드 표 기준)
  const needsStore = selectedIoType === 'sample_out' || selectedIoType === 'etc_out' || selectedIoType === 'dispose_out';
  // 비고가 필수인 사유 (조정 출고만)
  const noteRequired = selectedIoType === 'adjust_out';
  const createMutation = useCreateEtcInOut();
  // STOMP — 목록 갱신만 (상세는 EtcInOutDetailPage에서 처리)
  const queryClient = useQueryClient();
  const clientIdForStomp = getClientIdFromToken();
  // 팀원 패턴: 운영자 본인 work-event 채널
  useStompInvalidate<WorkEventMessage>(
    clientIdForStomp ? `/topic/admin/etc-inout/${clientIdForStomp}` : null,
    () => {
      queryClient.invalidateQueries({ queryKey: ['etc-inout-orders'] });
    },
    { getKey: () => `client-${clientIdForStomp ?? ''}` },
  );
  // 백엔드 공용 admin 토픽 (CREATED/APPROVED/PROCESSED/COMPLETED 브로드캐스트)
  useStompInvalidate('/topic/admin/etc-inout', () => {
    queryClient.invalidateQueries({ queryKey: ['etc-inout-orders'] });
  }, { getKey: () => 'list' });
  const isDisposeOut = selectedIoType === 'dispose_out';
  const isDisposeIn = selectedIoType === 'dispose_in';
  const { data: inventoryByRack } = useInventoryByRack(selectedWarehouseId ?? null);
  const { data: zones = [] } = useZonesByWarehouse(selectedWarehouseId ?? '');

  const locationRows = useMemo(() => {
    if (!inventoryByRack) return [];
    return inventoryByRack.racks.flatMap((rack) => (
      rack.locations.map((loc) => ({
        ...loc,
        rack_id: rack.rack_id,
        rack_code: rack.rack_code,
        rack_name: rack.rack_name,
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
      label: `${loc.location_code}${loc.product_name ? ` / ${loc.product_name} 보관중` : ' / 불량 보관 가능'}`,
      loc,
    })), [defectZoneIds, locationRows]);

  /** 출고용 — 상품 단위로 dedupe (창고 내 가용 합계 표시) */
  const outboundProductOptions = useMemo(() => {
    const byProduct = new Map<string, { name: string; sku: string; total: number }>();
    locationRows.forEach((loc) => {
      if (!loc.product_id) return;
      const qty = isDisposeOut ? loc.defect_qty : loc.available_qty;
      if (qty <= 0) return;
      const existing = byProduct.get(loc.product_id);
      if (existing) existing.total += qty;
      else byProduct.set(loc.product_id, {
        name: loc.product_name ?? '-',
        sku: loc.product_sku ?? '-',
        total: qty,
      });
    });
    return Array.from(byProduct.entries()).map(([id, info]) => ({
      value: id,
      label: `${info.sku} · ${info.name} (총 ${info.total.toLocaleString()}개)`,
      info,
    }));
  }, [isDisposeOut, locationRows]);

  /** 특정 상품의 위치별 가용 옵션 */
  const locationsForProduct = (productId: string) => locationRows
    .filter((loc) => loc.product_id === productId)
    .filter((loc) => (isDisposeOut ? loc.defect_qty : loc.available_qty) > 0)
    .map((loc) => {
      const maxQty = isDisposeOut ? loc.defect_qty : loc.available_qty;
      return {
        value: loc.location_id,
        label: `${loc.location_code} (가용 ${maxQty.toLocaleString()}개)`,
        loc,
        maxQty,
      };
    });

  const inboundLocationOptions = useMemo(() => locationRows
    .map((loc) => ({
      value: loc.location_id,
      label: `${loc.location_code}${loc.product_name ? ` / ${loc.product_name} 보관중` : ' / 빈 위치'}`,
      loc,
    })), [locationRows]);

  /** draft 출고지시서들이 잡고 있는 상품별 합계 + 지시서별 detail — 가용재고에서 차감 + 취소 후보 표시용 */
  const { data: draftDigest } = useQuery({
    queryKey: ['draft-outbounds-digest', selectedWarehouseId],
    queryFn: () => getDraftOutboundsDigest(selectedWarehouseId!),
    enabled: !!selectedWarehouseId,
  });
  const draftDemandByProduct = useMemo(
    () => draftDigest?.demandByProduct ?? new Map<string, number>(),
    [draftDigest],
  );
  const draftOutboundOrders = useMemo<{ order: OutboundOrder; items: OutboundOrderItem[] }[]>(
    () => draftDigest?.orders ?? [],
    [draftDigest],
  );

  /** 상품별 raw 가용재고 (창고 내 모든 위치의 available_qty 합) — by-rack 응답 그대로 */
  const rawAvailableByProduct = useMemo(() => {
    const m = new Map<string, number>();
    locationRows.forEach((loc) => {
      if (!loc.product_id) return;
      const qty = isDisposeOut ? loc.defect_qty : loc.available_qty;
      m.set(loc.product_id, (m.get(loc.product_id) ?? 0) + qty);
    });
    return m;
  }, [isDisposeOut, locationRows]);

  /** 진짜 가용재고 = raw - draft 합계 — 운영자가 보는 "출고 가능한 양" */
  const availableByProduct = useMemo(() => {
    const m = new Map<string, number>();
    rawAvailableByProduct.forEach((raw, productId) => {
      const draft = draftDemandByProduct.get(productId) ?? 0;
      m.set(productId, Math.max(0, raw - draft));
    });
    return m;
  }, [rawAvailableByProduct, draftDemandByProduct]);

  /** 상품(productId)별 창고 내 예약된 재고(reserved_qty + draft 합) — "다른 지시서에 잡혀있는 양" */
  const reservedByProduct = useMemo(() => {
    const m = new Map<string, number>();
    locationRows.forEach((loc) => {
      if (!loc.product_id) return;
      m.set(loc.product_id, (m.get(loc.product_id) ?? 0) + (loc.reserved_qty ?? 0));
    });
    // draft도 합산 — 운영자가 봤을 때 "잡혀있는 양"으로 보이는 것이 자연스러움
    draftDemandByProduct.forEach((draft, productId) => {
      m.set(productId, (m.get(productId) ?? 0) + draft);
    });
    return m;
  }, [locationRows, draftDemandByProduct]);

  /** 같은 상품(productId)을 여러 행에서 출고하려 할 때 합산 수량 — 가용 초과 검출용 */
  const totalQtyByProduct = useMemo(() => {
    const m = new Map<string, number>();
    itemRows.forEach((r) => {
      if (!r.productId) return;
      m.set(r.productId, (m.get(r.productId) ?? 0) + (r.qty || 0));
    });
    return m;
  }, [itemRows]);

  const resetModalState = () => {
    form.resetFields();
    setItemRows([]);
    setCancelledOutboundIds([]);
  };

  const getInboundTotalQty = (row: Pick<EtcInOutItemRow, 'processedQty' | 'defectQty' | 'qty'>) =>
    Math.max(0, (row.processedQty ?? 0) + (row.defectQty ?? 0) || row.qty || 0);

  const addItemRow = () => {
    if (!selectedIoType || !selectedWarehouseId) {
      message.warning('유형과 창고를 먼저 선택하세요.');
      return;
    }
    setItemRows((prev) => [...prev, {
      key: Date.now() + prev.length,
      productId: '',
      productName: '',
      sku: '',
      locationId: '',
      locationLabel: '',
      qty: 1,
      processedQty: 1,
      defectQty: 0,
      maxQty: null,
      condition: 'normal',
    }]);
  };

  const removeItemRow = (key: number) => {
    setItemRows((prev) => prev.filter((r) => r.key !== key));
  };

  const updateItemRow = (key: number, patch: Partial<EtcInOutItemRow>) => {
    setItemRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  /** 출고 — 상품 선택 시 첫 위치 자동 채움 */
  const handleOutboundProductChange = (key: number, productId: string) => {
    const opt = outboundProductOptions.find((o) => o.value === productId);
    if (!opt) return;
    const locs = locationsForProduct(productId);
    const first = locs[0];
    updateItemRow(key, {
      productId,
      productName: opt.info.name,
      sku: opt.info.sku,
      zoneId: first?.loc.zone_id,
      zoneName: first?.loc.zone_name,
      rackId: first?.loc.rack_id,
      rackCode: first?.loc.rack_code,
      locationId: first?.value ?? '',
      locationLabel: first?.loc.location_code ?? '',
      qty: first?.maxQty ?? 1,
      processedQty: first?.maxQty ?? 1,
      defectQty: 0,
      maxQty: first?.maxQty ?? null,
      condition: isDisposeOut ? 'defect' : 'normal',
    });
  };

  /** 출고 — 위치만 변경 (상품 유지) */
  const handleOutboundLocationOnlyChange = (key: number, locationId: string) => {
    const row = itemRows.find((r) => r.key === key);
    if (!row) return;
    const locs = locationsForProduct(row.productId);
    const selected = locs.find((l) => l.value === locationId);
    if (!selected) return;
    updateItemRow(key, {
      locationId,
      locationLabel: selected.loc.location_code,
      zoneId: selected.loc.zone_id,
      zoneName: selected.loc.zone_name,
      rackId: selected.loc.rack_id,
      rackCode: selected.loc.rack_code,
      qty: selected.maxQty,
      maxQty: selected.maxQty,
    });
  };

  /** 출고 — 같은 상품에 위치 행 추가 (그룹 끝에 삽입) */
  const addLocationForProduct = (productId: string) => {
    let lastIdx = -1;
    for (let i = itemRows.length - 1; i >= 0; i--) {
      if (itemRows[i].productId === productId) { lastIdx = i; break; }
    }
    const last = itemRows[lastIdx];
    const newRow: EtcInOutItemRow = {
      key: Date.now() + Math.random(),
      productId,
      productName: last?.productName ?? '',
      sku: last?.sku ?? '',
      locationId: '',
      locationLabel: '',
      qty: 1,
      processedQty: 1,
      defectQty: 0,
      maxQty: null,
      condition: isDisposeOut ? 'defect' : 'normal',
    };
    setItemRows((prev) => [
      ...prev.slice(0, lastIdx + 1),
      newRow,
      ...prev.slice(lastIdx + 1),
    ]);
  };

  /** 출고 — 상품 그룹 메타 (rowSpan 계산) */
  const outboundGroupMeta = useMemo(() => {
    const meta = new Map<number, { isFirst: boolean; spanSize: number }>();
    if (!isOutbound) return meta;
    let i = 0;
    while (i < itemRows.length) {
      const row = itemRows[i];
      if (!row.productId) {
        meta.set(row.key, { isFirst: true, spanSize: 1 });
        i++;
        continue;
      }
      let j = i + 1;
      while (j < itemRows.length && itemRows[j].productId === row.productId) j++;
      meta.set(row.key, { isFirst: true, spanSize: j - i });
      for (let k = i + 1; k < j; k++) {
        meta.set(itemRows[k].key, { isFirst: false, spanSize: 0 });
      }
      i = j;
    }
    return meta;
  }, [isOutbound, itemRows]);

  /** 출고 — 다른 행에서 이미 사용된 (productId, locationId) 조합 — 중복 방지 */
  const usedLocationsByProduct = useMemo(() => {
    const m = new Map<string, Set<string>>();
    itemRows.forEach((r) => {
      if (!r.productId || !r.locationId) return;
      if (!m.has(r.productId)) m.set(r.productId, new Set());
      m.get(r.productId)!.add(r.locationId);
    });
    return m;
  }, [itemRows]);

  /** 모든 입고 케이스에서 suggest-location 호출 (가이드 반영) */
  const fetchSuggestionsForRow = async (key: number, productId: string, qty: number) => {
    if (isOutbound || !selectedWarehouseId || !productId) return;
    const purpose: 'NORMAL' | 'DISPOSAL' = isDisposeIn ? 'DISPOSAL' : 'NORMAL';
    try {
      const suggestions = await getSuggestedLocations(productId, selectedWarehouseId, qty, purpose);
      const first = suggestions[0];
      if (!first) {
        updateItemRow(key, { suggestions: [], availableCapacity: null });
        return;
      }
      const matched = locationRows.find((l) => l.location_id === first.location_id);
      updateItemRow(key, {
        zoneId: matched?.zone_id,
        zoneName: matched?.zone_name ?? matched?.zone_code ?? matched?.zone_id,
        rackId: matched?.rack_id,
        rackCode: matched?.rack_code,
        locationId: first.location_id,
        locationLabel: first.location_code,
        availableCapacity: first.available_capacity,
        suggestions,
      });
      // 입력 수량 > 첫 추천 위치 가용량 → 자동분할/수동선택 모달
      if (first.available_capacity != null && qty > first.available_capacity) {
        showCapacityOverflowModal(key, qty, suggestions);
      }
    } catch {
      /* 추천 실패 시 운영자 수동 입력 fallback */
    }
  };

  const handleInboundProductChange = (key: number, productId: string) => {
    const product = products.find((p) => p.id === productId);
    const row = itemRows.find((r) => r.key === key);
    updateItemRow(key, {
      productId,
      productName: product?.name ?? '-',
      sku: product?.sku ?? '-',
    });
    void fetchSuggestionsForRow(key, productId, row ? Math.max(1, row.processedQty || row.qty || 1) : 1);
  };

  /** 수량 변경 시 — 같은 상품/위치의 가용량 초과 검사 + 필요 시 재추천 */
  const handleInboundProcessedQtyChange = (key: number, newQty: number) => {
    const row = itemRows.find((r) => r.key === key);
    if (!row) return;
    const processedQty = Math.max(0, newQty);
    updateItemRow(key, { processedQty, qty: processedQty + (row.defectQty ?? 0) });
    if (!row.productId) return;
    if (row.availableCapacity != null && processedQty > row.availableCapacity && row.suggestions) {
      showCapacityOverflowModal(key, processedQty, row.suggestions);
    }
  };

  /** 수용량 초과 시 운영자에게 분할/수동선택 안내 */
  const showCapacityOverflowModal = (key: number, qty: number, suggestions: SuggestedLocation[]) => {
    const totalCap = suggestions.reduce((s, x) => s + (x.available_capacity ?? 0), 0);
    const canAutoSplit = suggestions.length > 1 && totalCap >= qty;
    const lines = suggestions
      .filter((s) => (s.available_capacity ?? 0) > 0)
      .map((s, i) => `${i + 1}. ${s.location_code} — 가능: ${s.available_capacity ?? '무제한'}`)
      .join('\n');

    Modal.confirm({
      title: '선택한 위치 수용량 초과',
      width: 520,
      content: (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
          입력 수량: {qty.toLocaleString()}
          {'\n'}추천 위치별 가용량:
          {'\n'}{lines || '(추천 없음)'}
          {'\n\n'}{canAutoSplit
            ? '여러 위치로 자동 분할할 수 있습니다.'
            : '자동 분할 불가 — 수량을 줄이거나 위치를 다시 선택해주세요.'}
        </div>
      ),
      okText: canAutoSplit ? '자동 분할' : '확인',
      cancelText: '직접 선택',
      okButtonProps: { type: 'primary' },
      onOk: () => {
        if (!canAutoSplit) {
          // 자동 분할 불가 — 수량을 0으로 강제 리셋해서 운영자가 다시 입력하게 유도
          updateItemRow(key, { qty: 0 });
          message.warning('수용량 초과 — 수량을 0으로 초기화했습니다. 다시 입력해주세요.');
          return;
        }
        autoSplitRow(key, qty, suggestions);
      },
      onCancel: () => {
        // [직접 선택] 눌러도 자동 분할 불가 케이스면 수량 리셋
        if (!canAutoSplit) {
          updateItemRow(key, { qty: 0 });
          message.warning('수용량 초과 — 수량을 0으로 초기화했습니다. 위치를 다시 선택하거나 수량을 조정해주세요.');
        }
      },
    });
  };

  /** 한 행을 여러 위치로 분할 (greedy: 가용량 큰 순서로 채움) */
  const autoSplitRow = (key: number, totalQty: number, suggestions: SuggestedLocation[]) => {
    const baseRow = itemRows.find((r) => r.key === key);
    if (!baseRow) return;
    const sorted = [...suggestions]
      .filter((s) => (s.available_capacity ?? 0) > 0)
      .sort((a, b) => (b.available_capacity ?? 0) - (a.available_capacity ?? 0));

    let remaining = totalQty;
    const newRows: EtcInOutItemRow[] = [];
    for (const s of sorted) {
      if (remaining <= 0) break;
      const cap = s.available_capacity ?? remaining;
      const take = Math.min(cap, remaining);
      const matched = locationRows.find((l) => l.location_id === s.location_id);
      newRows.push({
        ...baseRow,
        key: Date.now() + newRows.length,
        locationId: s.location_id,
        locationLabel: s.location_code,
        zoneId: matched?.zone_id,
        zoneName: matched?.zone_name ?? matched?.zone_code,
        rackId: matched?.rack_id,
        rackCode: matched?.rack_code,
        qty: take,
        availableCapacity: s.available_capacity,
        suggestions,
      });
      remaining -= take;
    }
    setItemRows((prev) => prev.flatMap((r) => (r.key === key ? newRows : [r])));
    message.success(`${newRows.length}개 위치로 자동 분할되었습니다.`);
  };

  const handleInboundLocationChange = (key: number, locationId: string) => {
    const selected = inboundLocationOptions.find((option) => option.value === locationId);
    updateItemRow(key, {
      locationId,
      locationLabel: selected ? selected.loc.location_code : locationId,
    });
  };

  useEffect(() => {
    if (isOutbound || defectLocationOptions.length === 0) return;
    const first = defectLocationOptions[0];
    const fallbackId = first.value;
    const fallbackLabel = first.loc.location_code;
    setItemRows((prev) => prev.map((row) => {
      if ((row.defectQty ?? 0) < 1) return row;
      if (row.defectLocationId && row.defaultDefectLocationId) return row;
      return {
        ...row,
        defectLocationId: row.defectLocationId || row.defaultDefectLocationId || fallbackId,
        defectLocationLabel: row.defectLocationLabel || row.defaultDefectLocationLabel || fallbackLabel,
        defaultDefectLocationId: row.defaultDefectLocationId || fallbackId,
        defaultDefectLocationLabel: row.defaultDefectLocationLabel || fallbackLabel,
      };
    }));
  }, [defectLocationOptions, isOutbound]);

  const handleCreate = () => {
    form.validateFields().then((values) => {
      if (itemRows.length === 0) {
        message.warning('품목을 하나 이상 추가해주세요.');
        return;
      }
      const invalidRow = itemRows.find((row) =>
        !row.productId
        || !row.locationId
        || (isOutbound ? row.qty < 1 : getInboundTotalQty(row) < 1)
        || (!isOutbound && (row.defectQty ?? 0) > 0 && !row.defectLocationId)
      );
      if (invalidRow) {
        message.warning('모든 품목의 상품/위치/수량을 입력하세요.');
        return;
      }
      // 상품별 합산 가용재고 초과 검사 — 출고 계열에만 적용 (입고는 재고를 추가하므로 검증 불필요)
      if (isOutbound) {
        const shortageIds = new Set<string>();
        const detail: { productId: string; productName: string; requested: number; available: number; shortage: number }[] = [];
        itemRows.forEach((row) => {
          if (!row.productId) return;
          const total = totalQtyByProduct.get(row.productId) ?? 0;
          const available = availableByProduct.get(row.productId) ?? 0;
          if (total > available && !shortageIds.has(row.productId)) {
            shortageIds.add(row.productId);
            const product = products.find((p) => p.id === row.productId);
            detail.push({
              productId: row.productId,
              productName: product?.name ?? row.productName ?? '-',
              requested: total,
              available,
              shortage: total - available,
            });
          }
        });
        if (shortageIds.size > 0) {
          // 부족분 정보만 저장 — 메일 자동 오픈 플래그는 "실제 취소 완료" 시점에 별도로 세팅
          setPendingShortageItems(detail);
          setShortageProductIds([...shortageIds]);
          setSelectedCancelOrderIds([]);
          setCancelCandidatesOpen(true);
          return;
        }
      }
      createMutation.mutate(
        {
          warehouseId: values.warehouseId,
          ioType: values.ioType,
          storeId: values.storeId ?? undefined,
          note: values.note ?? undefined,
          items: itemRows.map((row) => ({
            productId: row.productId,
            locationId: row.locationId,
            qty: isOutbound ? row.qty : getInboundTotalQty(row),
            processedQty: isOutbound ? undefined : row.processedQty,
            defectQty: isOutbound ? undefined : row.defectQty,
            defectLocationId: isOutbound || (row.defectQty ?? 0) < 1 ? null : (row.defectLocationId || null),
            lotNo: row.lotNo || null,
            condition: row.condition,
            // 정상이면 null, 불량이면 입력값 (백엔드 가이드: 누락되면 null 저장)
            defectReason: row.condition === 'defect' ? (row.defectReason || null) : null,
            note: row.note || undefined,
          })),
          // 취소한 출고지시서 — 백엔드가 cancellation_link 자동 저장 + 입고요청 메일 본문 자동 채움
          cancelledOutboundIds: cancelledOutboundIds.length > 0 ? cancelledOutboundIds : undefined,
        },
        {
          onSuccess: (order) => {
            message.success(`${order.order_no} 생성`);
            setModalOpen(false);
            // 부족 모달을 거쳐온 경우 → 백엔드 preview API로 양식 받아 SMTP 발송 모달 오픈
            if (wasShortageEncountered && pendingShortageItems.length > 0) {
              setMailFormOrderId(order.id);
              setMailFormOpen(true);
            } else {
              resetModalState();
            }
            // wasShortageEncountered 플래그는 closeMailForm 또는 일반 케이스에서 리셋
            setWasShortageEncountered(false);
            // 취소 ID 누적 초기화 — 다음 생성 사이클을 위해
            setCancelledOutboundIds([]);
          },
          onError: (err) => {
            const msg = extractApiErrorMessage(err, '기타 입출고 생성에 실패했습니다.');
            message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
          },
        },
      );
    });
  };

  /** 부족난 상품을 잡고 있는 draft 출고지시서만 필터 */
  const shortageCandidates = useMemo(() => {
    if (shortageProductIds.length === 0) return [];
    const set = new Set(shortageProductIds);
    return draftOutboundOrders
      .filter(({ items }) => items.some((it) => it.product_id && set.has(it.product_id)))
      .map(({ order, items }) => {
        // 같은 상품이 여러 행으로 나뉘어 있을 수 있으므로 productId로 합산
        const byProduct = new Map<string, { name: string; qty: number }>();
        items.forEach((it) => {
          if (!it.product_id || !set.has(it.product_id)) return;
          const existing = byProduct.get(it.product_id);
          if (existing) existing.qty += it.ordered_qty;
          else byProduct.set(it.product_id, { name: it.product_name ?? '-', qty: it.ordered_qty });
        });
        const relevantProducts = Array.from(byProduct.values());
        return {
          order,
          relevantQty: relevantProducts.reduce((s, p) => s + p.qty, 0),
          relevantProducts,
        };
      });
  }, [draftOutboundOrders, shortageProductIds]);

  /** 선택한 출고지시서들을 일괄 취소 후 모달 닫기 — 운영자가 다시 [추가] 누르면 통과 */
  const handleConfirmCancelOutbounds = async () => {
    if (selectedCancelOrderIds.length === 0) {
      message.warning('취소할 출고지시서를 선택하세요.');
      return;
    }
    setCancelSubmitting(true);
    try {
      await Promise.all(selectedCancelOrderIds.map((id) => cancelOutboundOrder(id)));
      // 실제로 출고지시서가 취소됐을 때만 → 다음 생성 성공 시 메일 모달 자동 오픈
      setWasShortageEncountered(true);
      // 취소한 출고지시서 ID 누적 — 생성 시 cancelledOutboundIds 로 백엔드에 전달
      setCancelledOutboundIds((prev) => [...prev, ...selectedCancelOrderIds]);
      message.success(`${selectedCancelOrderIds.length}건 취소 완료. 다시 [추가]를 눌러주세요.`);
      setCancelCandidatesOpen(false);
      // 데이터 갱신
      queryClient.invalidateQueries({ queryKey: ['draft-outbounds-digest', selectedWarehouseId] });
      queryClient.invalidateQueries({ queryKey: ['inventory-by-rack'] });
      queryClient.invalidateQueries({ queryKey: ['outbound-orders'] });
    } catch (err) {
      message.error(extractApiErrorMessage(err, '출고지시서 취소에 실패했습니다.'));
    } finally {
      setCancelSubmitting(false);
    }
  };

  const columns: ColumnsType<EtcInOutOrder> = [
    { title: '지시서번호', dataIndex: 'order_no', key: 'order_no', width: 160 },
    {
      title: '유형', dataIndex: 'io_type', key: 'io_type', width: 110,
      render: (v: EtcInOutIoType) => <Tag color={ioTypeConfig[v]?.color}>{ioTypeConfig[v]?.label ?? v}</Tag>,
    },
    {
      title: '방향', dataIndex: 'direction', key: 'direction', width: 80, align: 'center',
      render: (v: string) => v === 'in' ? <Tag color="blue">입고</Tag> : <Tag color="orange">출고</Tag>,
    },
    { title: '창고', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 130 },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 90, align: 'center',
      render: (v: EtcInOutStatus) => <Tag color={statusConfig[v]?.color}>{statusConfig[v]?.label ?? v}</Tag>,
    },
    {
      title: '사유', key: 'reason', width: 130,
      render: (_, r) => ioTypeConfig[r.io_type]?.label ?? r.io_type,
    },
    { title: '생성일', dataIndex: 'created_at', key: 'created_at', width: 110 },
  ];

  /** 출고 — 같은 상품이 이미 그룹에 있으면 product 셀렉터에서 제외 (그룹 외 빈 행에서 중복 선택 방지) */
  const productInUseIds = useMemo(() => {
    const s = new Set<string>();
    itemRows.forEach((r) => { if (r.productId) s.add(r.productId); });
    return s;
  }, [itemRows]);

  const itemColumns: ColumnsType<EtcInOutItemRow> = [
    {
      title: '상품',
      key: 'product',
      width: 260,
      onCell: isOutbound ? (row) => {
        const m = outboundGroupMeta.get(row.key);
        if (!m) return {};
        return { rowSpan: m.isFirst ? m.spanSize : 0 };
      } : undefined,
      render: (_, row) => isOutbound ? (
        !row.productId ? (
          // 빈 행 — 상품 셀렉터 (이미 사용 중인 상품 제외)
          <Select
            placeholder="상품 선택"
            options={outboundProductOptions.filter((o) => !productInUseIds.has(o.value))}
            onChange={(value) => handleOutboundProductChange(row.key, value)}
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
          />
        ) : (
          // 상품 선택됨 — 라벨 + 위치 추가 버튼
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{row.productName}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{row.sku}</div>
            <Button
              size="small"
              type="link"
              icon={<PlusOutlined />}
              onClick={() => addLocationForProduct(row.productId)}
              style={{ padding: 0, height: 'auto' }}
              disabled={
                // 가용 위치가 더 없으면 비활성
                locationsForProduct(row.productId).length <= (usedLocationsByProduct.get(row.productId)?.size ?? 0)
              }
            >
              위치 추가
            </Button>
          </div>
        )
      ) : (
        <Select
          placeholder="상품 선택"
          value={row.productId || undefined}
          options={products.filter((p) => p.is_active !== false).map((p) => ({ label: `${p.sku} · ${p.name}`, value: p.id }))}
          onChange={(value) => handleInboundProductChange(row.key, value)}
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '로케이션',
      key: 'location',
      width: 320,
      render: (_, row) => isOutbound ? (
        !row.productId ? (
          <span style={{ color: '#cbd5e1', fontSize: 12 }}>상품 먼저 선택</span>
        ) : (
          <Select
            placeholder="위치 선택"
            value={row.locationId || undefined}
            options={locationsForProduct(row.productId).filter((opt) => {
              // 같은 그룹 내에서 이미 다른 행이 쓰고 있는 위치는 제외 (현재 행은 유지)
              const used = usedLocationsByProduct.get(row.productId);
              return !used || !used.has(opt.value) || opt.value === row.locationId;
            })}
            onChange={(value) => handleOutboundLocationOnlyChange(row.key, value)}
            showSearch
            optionFilterProp="label"
            style={{ width: '100%' }}
          />
        )
      ) : (
        <Select
          placeholder="로케이션 선택"
          value={row.locationId || undefined}
          options={inboundLocationOptions.map((o) => ({
            value: o.value,
            label: o.loc.location_code,
          }))}
          onChange={(value) => handleInboundLocationChange(row.key, value)}
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '수량',
      key: 'qty',
      width: 180,
      align: 'right',
      render: (_, row) => {
        // 사용자 정의: 총 재고 = 지시서에 잡히지 않은(free) = available_qty,  가용재고 = 지시서에 잡혀있는(reserved) = reserved_qty
        const productFree = row.productId ? (availableByProduct.get(row.productId) ?? 0) : 0;
        const productReserved = row.productId ? (reservedByProduct.get(row.productId) ?? 0) : 0;
        const totalRequested = row.productId ? (totalQtyByProduct.get(row.productId) ?? 0) : 0;
        const shortage = isOutbound && row.productId
          ? Math.max(0, totalRequested - productFree)
          : 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <InputNumber
              min={isOutbound ? 1 : 0}
              max={isOutbound ? (row.maxQty ?? undefined) : undefined}
              value={isOutbound ? row.qty : row.processedQty}
              status={shortage > 0 ? 'error' : undefined}
              addonBefore={isOutbound ? undefined : '정상'}
              onChange={(value) => isOutbound
                ? updateItemRow(row.key, { qty: Number(value ?? 1) })
                : handleInboundProcessedQtyChange(row.key, Number(value ?? 0))}
              style={{ width: '100%' }}
            />
            {!isOutbound && (
              <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>
                총 {getInboundTotalQty(row)}개
              </span>
            )}
            {isOutbound && row.productId && (
              shortage > 0 ? (
                <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, lineHeight: 1.2 }}>
                  총 {productFree} · 가용 {productReserved} · 부족 {shortage}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>
                  총 {productFree} · 가용 {productReserved}
                </span>
              )
            )}
          </div>
        );
      },
    },
    {
      title: '',
      key: 'action',
      width: 48,
      align: 'center',
      render: (_, row) => (
        <Button danger type="text" icon={<DeleteOutlined />} onClick={() => removeItemRow(row.key)} />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>{pageTitle}</Title>
        <PermissionButton resource="ETC_INOUT" action="CREATE" type="primary" icon={<PlusOutlined />} onClick={() => { resetModalState(); setModalOpen(true); }}>{pageTitle}</PermissionButton>
      </div>
      <Table columns={columns} dataSource={orders} rowKey="id" loading={isLoading}
        onRow={(r) => ({
          onClick: () => navigate(`/etc-inout/${r.direction === 'out' ? 'out' : 'in'}/${r.id}`),
          style: { cursor: 'pointer' },
        })} />

      <Modal title={pageTitle} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleCreate} confirmLoading={createMutation.isPending} okText="생성" width={900}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="ioType" label="사유" rules={[{ required: true }]}>
            <Select
              options={Object.entries(ioTypeConfig)
                .filter(([k]) => {
                  if (directionFilter === 'in') return k.endsWith('_in');
                  if (directionFilter === 'out') return k.endsWith('_out');
                  return true;
                })
                .map(([k, v]) => ({ label: v.label, value: k }))}
              onChange={() => setItemRows([])}
            />
          </Form.Item>
          <Form.Item name="warehouseId" label="창고" rules={[{ required: true }]}>
            <Select
              options={warehouses.map((w) => ({ label: `${w.code} — ${w.name}`, value: w.id }))}
              onChange={() => setItemRows([])}
            />
          </Form.Item>
          {needsStore && (
            <Form.Item
              name="storeId"
              label={selectedIoType === 'dispose_out' ? '출고처 (폐기업체)' : '출고처'}
              rules={[{ required: true, message: '출고처를 선택하세요' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="출고처 선택"
                options={stores.filter((s) => s.is_active !== false).map((s) => ({ label: `${s.code} — ${s.name}`, value: s.id }))}
              />
            </Form.Item>
          )}
          <Form.Item
            name="note"
            label="비고"
            rules={noteRequired ? [{ required: true, message: '비고를 입력하세요 (조정 출고는 사유 기록이 필요합니다)' }] : undefined}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 8 }}>
            <Typography.Text strong style={{ fontSize: 13 }}>품목</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {isOutbound ? '출고 유형은 선택한 위치의 재고 수량 안에서만 생성할 수 있습니다.' : '입고 유형은 상품과 입고 위치를 직접 선택합니다.'}
            </Typography.Text>
          </div>
          <Table
            columns={itemColumns}
            dataSource={itemRows}
            rowKey="key"
            pagination={false}
            size="small"
            scroll={{ x: 860 }}
            locale={{
              emptyText: (
                <div style={{ padding: '12px 0' }}>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={addItemRow}
                    disabled={!selectedIoType || !selectedWarehouseId}
                  >
                    품목 추가
                  </Button>
                  <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>품목을 하나 이상 추가해주세요.</div>
                </div>
              ),
            }}
            footer={itemRows.length > 0 ? () => (
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={addItemRow}
                disabled={!selectedIoType || !selectedWarehouseId}
              >
                품목 추가
              </Button>
            ) : undefined}
          />
        </Form>
      </Modal>

      {/* 가용재고 부족 → 잡고 있는 출고지시서(draft + approved) 일괄 취소 모달 */}
      <Modal
        title="취소 가능한 출고지시서"
        open={cancelCandidatesOpen}
        onCancel={() => setCancelCandidatesOpen(false)}
        onOk={handleConfirmCancelOutbounds}
        okText={`선택 취소 (${selectedCancelOrderIds.length}건)`}
        cancelText="닫기"
        confirmLoading={cancelSubmitting}
        okButtonProps={{ danger: true, disabled: selectedCancelOrderIds.length === 0 }}
        width={760}
      >
        {shortageCandidates.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
            취소 가능한 출고지시서가 없습니다.
          </div>
        ) : (
          <>
            {pendingShortageItems.length > 0 && (
              <div style={{
                marginBottom: 12,
                padding: '10px 12px',
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: 6,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#c2410c', marginBottom: 6 }}>
                  부족 품목
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {pendingShortageItems.map((it) => (
                    <div key={it.productId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
                      <span>{it.productName}</span>
                      <span>
                        요청 <strong>{it.requested.toLocaleString()}</strong> · 가용 <strong>{it.available.toLocaleString()}</strong> ·{' '}
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>부족 {it.shortage.toLocaleString()}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
              해당 상품을 잡고 있는 임시/승인 상태 출고지시서입니다. 체크박스로 선택 후 일괄 취소하세요.
              취소 완료 후 [추가]를 다시 눌러주세요.
            </div>
            <Table
              size="small"
              rowKey={(r) => r.order.id}
              dataSource={shortageCandidates}
              pagination={false}
              rowSelection={{
                selectedRowKeys: selectedCancelOrderIds,
                onChange: (keys) => setSelectedCancelOrderIds(keys as string[]),
              }}
              columns={[
                {
                  title: '지시서번호', key: 'orderNo', width: 180,
                  render: (_, r) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.order.order_no}</span>,
                },
                {
                  title: '상태', key: 'status', width: 80, align: 'center',
                  render: (_, r) => r.order.status === 'approved'
                    ? <Tag color="processing">승인</Tag>
                    : <Tag color="default">임시</Tag>,
                },
                {
                  title: '출고예정일', key: 'expectedDate', width: 110,
                  render: (_, r) => r.order.expected_date ?? '-',
                },
                {
                  title: '출고처', key: 'storeName',
                  render: (_, r) => r.order.store_name ?? '-',
                },
                {
                  title: '관련 상품', key: 'products',
                  render: (_, r) => (
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {r.relevantProducts.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span>{p.name}</span>
                          <span style={{ fontWeight: 600, color: '#475569' }}>{p.qty.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  title: '출고 예정 수량', key: 'qty', width: 120, align: 'right',
                  render: (_, r) => <span style={{ fontWeight: 600, color: '#ef4444' }}>{r.relevantQty.toLocaleString()}</span>,
                },
              ]}
            />
          </>
        )}
      </Modal>

      {/* 생성 성공 직후 — OMS 입고 요청 메일 작성 (백엔드 SMTP 자동 발송) */}
      <Modal
        title="입고 요청 메일 작성"
        open={mailFormOpen}
        onCancel={closeMailForm}
        onOk={handleSendInboundMail}
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
    </>
  );
}
