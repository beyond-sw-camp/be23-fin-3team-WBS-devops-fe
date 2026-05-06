import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Select, Typography, App, Button, Tag, Segmented, InputNumber, Tooltip, Checkbox } from 'antd';
import {
  ThunderboltOutlined, AimOutlined, LinkOutlined,
  WarningFilled, CheckCircleFilled, InboxOutlined, LayoutOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getRackLocationsLazy } from '@/api/layoutEditorV2';
import { getPlacementLocationSuggestions } from '@/api/inbound';
import { useRackLayoutsByWarehouse, useRacks, useZonesByWarehouse } from '@/hooks/useWarehouseQuery';
import { useAssignPlacementLocation, useSplitAssignPlacementLocation } from '@/hooks/useInboundQuery';
import { extractApiErrorMessage, isCapacityExceededError } from '@/utils/apiError';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import { shortLocationCode } from '@/utils/locationCode';
import type { PlacementItem } from '@/types/order';

const { Text } = Typography;

interface LocationOption {
  locationId: string;
  locationCode: string;
  floorNo?: number | null;
  maxCapacity?: number | null;
  currentQty?: number | null;
}

interface Props {
  open: boolean;
  item: PlacementItem | null;
  warehouseId: string | undefined;
  onClose: () => void;
  /** 레이아웃을 새 탭에서 연 뒤 복귀용 (예: 적치 화면 경로). 쿼리 returnTo로 전달됨 */
  returnTo?: string;
  /** 돌아가기 배너에 짧게 표시할 문구(선택) */
  returnToLabel?: string;
}

const BRAND = '#2563eb';
const BRAND_BG = '#eff6ff';
const DEFECT = '#ef4444';
const DEFECT_BG = '#fef2f2';
const MUTED = '#64748b';

function buildLayoutEditorHref(
  warehouseId: string | undefined,
  tab: string,
  opts?: { returnTo?: string; returnToLabel?: string },
): string {
  const p = new URLSearchParams();
  if (warehouseId) p.set('wh', warehouseId);
  p.set('tab', tab);
  if (opts?.returnTo) p.set('returnTo', opts.returnTo);
  if (opts?.returnToLabel) p.set('returnLabel', opts.returnToLabel);
  return `/warehouse/layout-editor?${p.toString()}`;
}

export default function AssignLocationModal({
  open, item, warehouseId, onClose, returnTo, returnToLabel,
}: Props) {
  const { message, modal } = App.useApp();
  const { data: racksByWarehouse = [], isLoading: racksLoadingByWarehouse } = useRacks(warehouseId ? { warehouseId } : undefined);
  const { data: allRacks = [], isLoading: racksLoadingAll } = useRacks();
  const { data: zones = [] } = useZonesByWarehouse(warehouseId ?? '');
  const { data: rackLayouts = [] } = useRackLayoutsByWarehouse(warehouseId ?? '');
  const { data: inventoryByRack } = useInventoryByRack(warehouseId ?? null);
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [mode, setMode] = useState<'suggested' | 'manual'>('manual');
  const [onlyFitting, setOnlyFitting] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const [splitQtys, setSplitQtys] = useState<Record<string, number>>({});
  const [showOverride, setShowOverride] = useState(false);
  const assignMutation = useAssignPlacementLocation();
  const splitMutation = useSplitAssignPlacementLocation();
  const racksLoading = racksLoadingByWarehouse || racksLoadingAll;

  const defectZoneIds = useMemo(
    () => new Set(zones.filter((z) => z.zone_type === 'DEFECT' && z.is_active !== false).map((z) => z.id)),
    [zones],
  );
  // 적치 대상이 될 수 없는 staging 구역(입고/출고 대기장) — 위치 지정 후보에서 제외.
  const stagingZoneIds = useMemo(
    () => new Set(zones.filter((z) => z.zone_type === 'INBOUND' || z.zone_type === 'OUTBOUND').map((z) => z.id)),
    [zones],
  );
  // 비활성 zone — 그 zone 에 속한 랙은 (랙이 활성이라도) 적치 후보에서 제외
  const inactiveZoneIds = useMemo(
    () => new Set(zones.filter((z) => z.is_active === false).map((z) => z.id)),
    [zones],
  );
  const shouldRestrictToDefectRacks = !!item?.is_defect && defectZoneIds.size > 0;

  const racks = useMemo(() => {
    const excludeStaging = <T extends { zone_id: string }>(list: T[]) =>
      list.filter((r) => !stagingZoneIds.has(r.zone_id) && !inactiveZoneIds.has(r.zone_id));
    // 일반 상품은 불량존 제외, 불량 상품은 불량존만 노출 — 카테고리 혼입 방지.
    const filterByDefectPolicy = <T extends { zone_id: string }>(list: T[]) =>
      shouldRestrictToDefectRacks
        ? list.filter((r) => defectZoneIds.has(r.zone_id))
        : list.filter((r) => !defectZoneIds.has(r.zone_id));
    const activeByWarehouse = excludeStaging(racksByWarehouse.filter((r) => r.is_active !== false));
    const filteredByType = filterByDefectPolicy(activeByWarehouse);
    if (filteredByType.length > 0) return filteredByType;

    const layoutRackIds = new Set(rackLayouts.map((rl) => rl.rack_id));
    const activeAll = excludeStaging(allRacks.filter((r) => r.is_active !== false));
    const byWarehouse = activeAll.filter((r) => !warehouseId || r.warehouse_id === warehouseId);
    const byLayout = activeAll.filter((r) => layoutRackIds.has(r.id));
    const fw = filterByDefectPolicy(byWarehouse);
    const fl = filterByDefectPolicy(byLayout);
    const fa = filterByDefectPolicy(activeAll);
    if (fw.length > 0) return fw;
    if (fl.length > 0) return fl;
    return fa;
  }, [racksByWarehouse, allRacks, rackLayouts, warehouseId, shouldRestrictToDefectRacks, defectZoneIds, stagingZoneIds, inactiveZoneIds]);

  useEffect(() => {
    if (open) {
      setSelectedRackId(null);
      setSelectedLocationId(null);
      setMode('manual');
      setSplitMode(false);
      setSplitQtys({});
      setShowOverride(false);
    }
  }, [open, item?.id]);

  const { data: suggestedLocations = [], isLoading: suggestionLoading } = useQuery({
    queryKey: ['placement-location-suggestions', item?.id],
    queryFn: async () => (item?.id ? getPlacementLocationSuggestions(item.id) : []),
    enabled: open && !!item?.id,
    retry: false,
  });

  const hasSuggestions = suggestedLocations.length > 0;

  /**
   * 모달이 열린 후 추천 결과가 도착하면 자동으로 'suggested' 모드 + 첫 추천 선택.
   *
   * 주의: 한번만 실행해야 함. 이전 구현은 deps 에 selectedLocationId 가 있어
   * 사용자가 '직접 선택' 으로 모드 바꾸면(=> selectedLocationId=null) effect 가
   * 재실행돼 즉시 'suggested' 로 되돌리는 버그가 있었음.
   */
  const initialAssignmentDone = useRef(false);
  useEffect(() => {
    if (!open) {
      initialAssignmentDone.current = false;
      return;
    }
    if (initialAssignmentDone.current) return;
    if (!hasSuggestions) return;
    initialAssignmentDone.current = true;
    setMode('suggested');
    setSelectedRackId(suggestedLocations[0].rack_id);
    setSelectedLocationId(suggestedLocations[0].location_id);
  }, [open, hasSuggestions, suggestedLocations]);

  const { data: locations = [], isLoading: locLoading } = useQuery<LocationOption[]>({
    queryKey: ['rack-locations-for-assign', selectedRackId],
    queryFn: async () => {
      if (!selectedRackId) return [];
      const rows = warehouseId ? await getRackLocationsLazy(warehouseId, selectedRackId) : [];
      return rows.map((r) => ({ locationId: r.locationId, locationCode: r.locationCode, currentQty: r.qty ?? 0 }));
    },
    enabled: !!selectedRackId && !!warehouseId,
  });

  // 랙 단위 보관 현황(점유/전체 층수, 동일 SKU 보관 여부)을 미리 계산.
  // 관리자가 드롭다운에서 "어디 둘지" 판단하기 위한 최소 정보 — Lv1 개선.
  const rackInfoMap = useMemo(() => {
    const map = new Map<string, { occupiedCount: number; locationCount: number; hasSameSku: boolean }>();
    for (const r of inventoryByRack?.racks ?? []) {
      map.set(r.rack_id, {
        occupiedCount: r.occupied_count ?? 0,
        locationCount: r.location_count ?? 0,
        hasSameSku: item?.product_id
          ? r.locations.some((l) => l.product_id === item.product_id)
          : false,
      });
    }
    return map;
  }, [inventoryByRack, item?.product_id]);

  // 로케이션별 수용량/사용량 맵 — BE 검증 동일 공식 (defect 제외)
  const locationCapacityMap = useMemo(() => {
    const map = new Map<string, { maxCapacity: number | null; used: number }>();
    for (const r of inventoryByRack?.racks ?? []) {
      for (const loc of r.locations) {
        const used = (loc.available_qty ?? 0) + (loc.reserved_qty ?? 0) + (loc.pending_qty ?? 0);
        map.set(loc.location_id, { maxCapacity: loc.max_capacity ?? null, used });
      }
    }
    return map;
  }, [inventoryByRack]);

  // 선택한 로케이션의 capacity 상태 (item.qty 적치 시 초과 여부 사전 검증)
  const capacityStatus = useMemo(() => {
    if (!selectedLocationId || !item) return null;
    const c = locationCapacityMap.get(selectedLocationId);
    if (!c) return null;
    if (!c.maxCapacity || c.maxCapacity <= 0) {
      return { unlimited: true as const };
    }
    const remaining = c.maxCapacity - c.used;
    return {
      unlimited: false as const,
      maxCapacity: c.maxCapacity,
      used: c.used,
      remaining,
      needed: item.qty,
      willExceed: item.qty > remaining,
    };
  }, [selectedLocationId, item, locationCapacityMap]);

  const rackOptions = useMemo(() => {
    const zoneNameById = new Map(zones.map((z) => [z.id, z.name] as const));
    const enriched = racks
      .filter((r) => !!r.code)
      .map((r) => {
        const info = rackInfoMap.get(r.id);
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          zoneName: zoneNameById.get(r.zone_id) ?? '기타',
          occupiedCount: info?.occupiedCount ?? 0,
          locationCount: info?.locationCount ?? 0,
          hasSameSku: info?.hasSameSku ?? false,
          // 협력사 미지정 = 공통존(공용 랙) — 카테고리 혼입 위험 없음, 미배정 상품 권장.
          isCommon: !r.supplier_id,
          supplierName: r.supplier_name ?? null,
        };
      });

    // 정렬: 동일 SKU 우선 → 공통존 우선 → 빈 자리 많은 순 → 코드 순
    enriched.sort((a, b) => {
      if (a.hasSameSku !== b.hasSameSku) return a.hasSameSku ? -1 : 1;
      if (a.isCommon !== b.isCommon) return a.isCommon ? -1 : 1;
      const aEmpty = a.locationCount - a.occupiedCount;
      const bEmpty = b.locationCount - b.occupiedCount;
      if (aEmpty !== bEmpty) return bEmpty - aEmpty;
      return a.code.localeCompare(b.code);
    });

    // 그룹핑: 동일 SKU(추천) → 공통존 → 그 외 zone 별
    const recommended = enriched.filter((r) => r.hasSameSku);
    const commonZone = enriched.filter((r) => !r.hasSameSku && r.isCommon);
    const rest = enriched.filter((r) => !r.hasSameSku && !r.isCommon);
    const byZone = new Map<string, typeof enriched>();
    for (const r of rest) {
      if (!byZone.has(r.zoneName)) byZone.set(r.zoneName, []);
      byZone.get(r.zoneName)!.push(r);
    }

    const toOption = (r: typeof enriched[number]) => {
      const occ = r.locationCount > 0
        ? `${r.occupiedCount}/${r.locationCount}`
        : '층 없음';
      const searchLabel = `${r.code} ${r.name ?? ''} ${r.zoneName} ${occ}${r.isCommon ? ' 공통' : ` ${r.supplierName ?? ''}`}`;
      return { label: searchLabel, value: r.id, _rack: r };
    };

    const groups: Array<{ label: string; options: ReturnType<typeof toOption>[] }> = [];
    if (recommended.length > 0) {
      groups.push({
        label: `⭐ 같은 상품 보관 중 (${recommended.length})`,
        options: recommended.map(toOption),
      });
    }
    if (commonZone.length > 0) {
      groups.push({
        label: `🟢 공통존 — 협력사 미지정 (${commonZone.length})`,
        options: commonZone.map(toOption),
      });
    }
    for (const [zoneName, list] of byZone) {
      groups.push({ label: zoneName, options: list.map(toOption) });
    }
    return groups;
  }, [racks, zones, rackInfoMap]);

  // 추천 결과를 capacity 기준 필터/라벨 강화. onlyFitting=ON 이면 itemQty 담을 수 있는 항목만 표시
  const itemQty = item?.qty ?? 0;
  const visibleSuggestions = useMemo(() => {
    if (!onlyFitting) return suggestedLocations;
    return suggestedLocations.filter((s) =>
      s.available_capacity == null || s.available_capacity >= itemQty,
    );
  }, [suggestedLocations, onlyFitting, itemQty]);

  // 직접 선택 모드도 inventoryByRack 의 max_capacity 로 라벨 보강 + 필터링
  const enrichedManualLocations = useMemo(() => {
    return locations.map((l) => {
      const cap = locationCapacityMap.get(l.locationId);
      return {
        ...l,
        maxCapacity: cap?.maxCapacity ?? null,
        currentUsed: cap?.used ?? null,
        availableCapacity: cap?.maxCapacity != null && cap.maxCapacity > 0
          ? Math.max(0, cap.maxCapacity - cap.used)
          : null,
      };
    });
  }, [locations, locationCapacityMap]);
  const visibleManualLocations = useMemo(() => {
    if (!onlyFitting) return enrichedManualLocations;
    return enrichedManualLocations.filter((l) =>
      l.availableCapacity == null || l.availableCapacity >= itemQty,
    );
  }, [enrichedManualLocations, onlyFitting, itemQty]);

  const formatSuggestionLabel = (l: typeof suggestedLocations[number]) => {
    const cap = l.max_capacity == null
      ? '무제한'
      : `여유 ${(l.available_capacity ?? 0).toLocaleString()} / 최대 ${l.max_capacity.toLocaleString()}`;
    const insufficient = l.available_capacity != null && l.available_capacity < itemQty;
    const badge = insufficient ? ' ⚠ 수용 부족' : '';
    return `${shortLocationCode(l.location_code)} · ${cap}${badge}${l.current_qty ? ` · 보유 ${l.current_qty}` : ''}`;
  };
  const formatManualLabel = (l: typeof enrichedManualLocations[number]) => {
    const cap = l.maxCapacity == null
      ? '무제한'
      : `여유 ${(l.availableCapacity ?? 0).toLocaleString()} / 최대 ${l.maxCapacity.toLocaleString()}`;
    const insufficient = l.availableCapacity != null && l.availableCapacity < itemQty;
    const badge = insufficient ? ' ⚠ 수용 부족' : '';
    return `${shortLocationCode(l.locationCode)} · ${cap}${badge}${l.currentQty ? ` · 보유 ${l.currentQty}` : ''}`;
  };

  const locationOptions = useMemo(() => {
    if (mode === 'suggested') {
      return visibleSuggestions.map((l) => ({
        label: formatSuggestionLabel(l),
        value: l.location_id,
      }));
    }
    return visibleManualLocations.map((l) => ({
      label: formatManualLabel(l),
      value: l.locationId,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, visibleSuggestions, visibleManualLocations, itemQty]);

  const suggestionByLocationId = useMemo(
    () => new Map(suggestedLocations.map((l) => [l.location_id, l])),
    [suggestedLocations],
  );

  /** 직접 선택 모드에서 랙은 골랐는데 그 랙에 등록된 로케이션이 0개 — 안내 + 레이아웃 편집기 진입 권유 */
  const noLocationsForRack = mode === 'manual' && !locLoading && !!selectedRackId && enrichedManualLocations.length === 0;
  const defectZoneMissing = !!item?.is_defect && !shouldRestrictToDefectRacks;
  const activeNonStagingZoneCount = useMemo(
    () => zones.filter((z) => z.is_active !== false && !stagingZoneIds.has(z.id)).length,
    [zones, stagingZoneIds],
  );
  const zoneMissing = mode === 'manual' && activeNonStagingZoneCount === 0;
  const rackMissing = mode === 'manual' && !racksLoading && rackOptions.length === 0;

  const openLayoutEditorForZones = () => {
    if (!warehouseId) return;
    window.open(
      buildLayoutEditorHref(warehouseId, 'zone', { returnTo, returnToLabel }),
      '_blank',
      'noopener,noreferrer',
    );
  };
  const openLayoutEditorForRacks = () => {
    if (!warehouseId) return;
    window.open(
      buildLayoutEditorHref(warehouseId, 'rack', { returnTo, returnToLabel }),
      '_blank',
      'noopener,noreferrer',
    );
  };


  // 분할 입력 후보 리스트 — suggest-locations API 결과만 사용
  // BE 가 이미 다음을 후보에서 제외함: 다른 상품 점유 / 비활성·잠긴 / 협력사 불일치
  const splitCandidates = useMemo(() => {
    return suggestedLocations.map((s) => ({
      locationId: s.location_id,
      locationCode: s.location_code,
      maxCapacity: s.max_capacity,
      availableCapacity: s.available_capacity,
      currentQty: s.current_qty,
      reason: s.reason,
      isOverride: false as const,
      occupiedByOther: null as null | { productId: string; productName: string | null; productSku: string | null; qty: number; floorNo: number | null },
    }));
  }, [suggestedLocations]);

  // 추천 ID 셋 — override 후보 계산용
  const suggestedLocationIdSet = useMemo(
    () => new Set(suggestedLocations.map((s) => s.location_id)),
    [suggestedLocations],
  );

  // 추천 외 후보 (override 토글 ON 시) — 같은 창고의 모든 로케이션 중 추천에 없는 것
  // 점유된 칸은 입력 차단 (BE 가 어차피 거부하지만 시각적으로 잠금 표시)
  const overrideCandidates = useMemo(() => {
    if (!inventoryByRack) return [];
    type O = {
      locationId: string;
      locationCode: string;
      maxCapacity: number | null;
      availableCapacity: number | null;
      currentQty: number;
      reason: string;
      isOverride: true;
      occupiedByOther: null | { productId: string; productName: string | null; productSku: string | null; qty: number; floorNo: number | null };
    };
    const out: O[] = [];
    for (const r of inventoryByRack.racks) {
      for (const loc of r.locations) {
        if (suggestedLocationIdSet.has(loc.location_id)) continue;
        const used = (loc.available_qty ?? 0) + (loc.reserved_qty ?? 0) + (loc.pending_qty ?? 0);
        const otherProduct = !!loc.product_id && !!item?.product_id && loc.product_id !== item.product_id && used > 0;
        const cap = loc.max_capacity ?? null;
        out.push({
          locationId: loc.location_id,
          locationCode: loc.location_code,
          maxCapacity: cap,
          availableCapacity: cap != null && cap > 0 ? Math.max(0, cap - used) : null,
          currentQty: used,
          reason: '추천 외 위치 (협력사 정책 가이드 미준수 가능)',
          isOverride: true,
          occupiedByOther: otherProduct
            ? {
                productId: loc.product_id ?? '',
                productName: loc.product_name ?? null,
                productSku: loc.product_sku ?? null,
                qty: used,
                floorNo: loc.floor_no ?? null,
              }
            : null,
        });
      }
    }
    return out;
  }, [inventoryByRack, suggestedLocationIdSet, item?.product_id]);

  const splitTotal = useMemo(
    () => Object.values(splitQtys).reduce((s, n) => s + (Number.isFinite(n) && n > 0 ? n : 0), 0),
    [splitQtys],
  );
  const splitNonZeroEntries = useMemo(
    () => Object.entries(splitQtys).filter(([, n]) => Number.isFinite(n) && n > 0),
    [splitQtys],
  );

  const handleAssign = () => {
    if (!item) return;

    // 분할 입력 모드 분기
    if (splitMode) {
      if (splitTotal !== itemQty) {
        message.warning(`분할 합계가 미배정 수량과 일치해야 합니다 (현재 ${splitTotal} / 필요 ${itemQty})`);
        return;
      }
      const assignments = splitNonZeroEntries.map(([locationId, qty]) => ({ locationId, qty }));

      const submit = () => {
        // 한 자리에 통째로 → 단건 API, 두 자리 이상 → 분할 API
        if (assignments.length === 1) {
          assignMutation.mutate(
            { itemId: item.id, locationId: assignments[0].locationId },
            {
              onSuccess: () => { message.success('위치 지정 완료'); onClose(); },
              onError: (err) => {
                const msg = extractApiErrorMessage(err, '위치 지정 실패');
                message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
              },
            },
          );
        } else {
          splitMutation.mutate(
            { itemId: item.id, assignments },
            {
              onSuccess: () => { message.success(`${assignments.length}개 위치로 분할 지정 완료`); onClose(); },
              onError: (err) => {
                const msg = extractApiErrorMessage(err, '분할 위치 지정 실패');
                message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
              },
            },
          );
        }
      };

      // 추천 외 위치(override) 가 포함되면 확인 모달 → 협력사 정책 가이드 미준수 가능 안내
      const overrideUsed = assignments.some((a) => !suggestedLocationIdSet.has(a.locationId));
      if (overrideUsed) {
        modal.confirm({
          title: '추천 외 위치를 사용합니다',
          content: '추천에 포함되지 않은 위치가 있습니다. 협력사 정책 가이드와 맞지 않을 수 있습니다. 그대로 진행할까요?',
          okText: '진행',
          cancelText: '취소',
          okButtonProps: { danger: true },
          onOk: submit,
        });
      } else {
        submit();
      }
      return;
    }

    // 단일 선택 모드 (기존 흐름)
    if (!selectedLocationId) return;
    assignMutation.mutate(
      { itemId: item.id, locationId: selectedLocationId },
      {
        onSuccess: () => { message.success('위치 지정 완료'); onClose(); },
        onError: (err) => {
          const msg = extractApiErrorMessage(err, '위치 지정 실패');
          message.error({ content: msg, duration: isCapacityExceededError(err) ? 6 : 3 });
        },
      },
    );
  };

  if (!item) return null;

  return (
    <Modal
      title="위치 지정"
      centered
      open={open}
      onCancel={onClose}
      onOk={handleAssign}
      okText="위치 저장"
      cancelText="취소"
      okButtonProps={{
        disabled: splitMode
          ? splitTotal !== itemQty || splitNonZeroEntries.length === 0
          : !selectedLocationId || (!!capacityStatus && !capacityStatus.unlimited && capacityStatus.willExceed),
        loading: assignMutation.isPending || splitMutation.isPending,
      }}
      width={560}
      styles={{
        header: { marginBottom: 0, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' },
        body: { padding: '20px 24px 8px', fontSize: 14, lineHeight: 1.55, color: '#0f172a' },
        footer: { borderTop: '1px solid #f1f5f9', padding: '10px 16px' },
      }}
    >
      {/* ── 1. 상품 정보 카드 ── */}
      <div style={{
        padding: '12px 14px',
        background: item.is_defect ? DEFECT_BG : BRAND_BG,
        border: `1px solid ${item.is_defect ? '#fecaca' : '#dbeafe'}`,
        borderRadius: 8,
        marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8,
          background: item.is_defect ? DEFECT : BRAND,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          <InboxOutlined />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a', letterSpacing: '-0.01em' }}>{item.product_name}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 4, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{item.sku}</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
          <Tag color={item.is_defect ? 'red' : 'blue'} style={{ margin: 0 }}>{item.is_defect ? '불량' : '정상'}</Tag>
          <Tag color="orange" style={{ margin: 0, fontWeight: 600 }}>{item.qty}개</Tag>
        </div>
      </div>

      {/* 분할 입력 모드 토글 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {splitMode ? '여러 자리에 나눠 담기 (각 행에 수량 입력)' : '한 자리에 통째로 담기'}
        </Text>
        <Checkbox
          checked={splitMode}
          onChange={(e) => {
            setSplitMode(e.target.checked);
            setSplitQtys({});
            setSelectedLocationId(null);
          }}
          style={{ fontSize: 12 }}
        >
          분할 입력
        </Checkbox>
      </div>

      {/* ── 2. 배정 방식 (추천 있을 때만) ── */}
      {hasSuggestions && (
        <div style={{ marginBottom: 16 }}>
          <Segmented
            block
            value={mode}
            onChange={(v) => { setMode(v as 'suggested' | 'manual'); setSelectedLocationId(null); }}
            options={[
              { label: (<span><ThunderboltOutlined /> 추천 위치</span>), value: 'suggested' },
              { label: (<span><AimOutlined /> 직접 선택</span>), value: 'manual' },
            ]}
          />
        </div>
      )}

      {/* ── 3. 추천 성공 안내 — 한 줄 secondary (배너 대신) ── */}
      {mode === 'suggested' && hasSuggestions && (
        <div style={{ marginBottom: 8, fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircleFilled style={{ color: '#16a34a', fontSize: 13 }} />
          <span>추천 {suggestedLocations.length}건</span>
        </div>
      )}

      {/* ── 3-1. 협력사 매칭 랙 부재 안내 — 공통존(협력사 미지정 랙) 권장
              미배정 적치(처음 위치 지정)일 때만 노출. 단순 위치 변경엔 불필요한 잡음이라 숨김. ── */}
      {!hasSuggestions && !item.is_defect && item.is_unassigned && (
        <div style={{
          padding: '12px 14px',
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 8,
          marginBottom: 12,
          fontSize: 13,
          color: '#1e40af',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <WarningFilled style={{ color: '#2563eb', fontSize: 16, marginTop: 2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.55 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>
              협력사 전용 랙이 없어 추천이 비었습니다
            </div>
            <div style={{ color: '#475569', fontSize: 12 }}>
              다른 협력사의 랙에 적치하면 카테고리가 섞일 수 있습니다. <b style={{ color: '#1e40af' }}>공통존(협력사 미지정 랙)</b>이나 같은 카테고리의 빈 자리를 우선 사용하세요.
            </div>
          </div>
        </div>
      )}

      {/* ── 4. 불량존 부재 안내(한 열로 정렬, 액션은 전체 너비) ── */}
      {defectZoneMissing && mode === 'manual' && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <WarningFilled style={{ color: '#d97706', fontSize: 18, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>불량 구역(DEFECT)이 없습니다</div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                아래 랙은 일반 구역 기준으로만 보입니다. DEFECT에 넣으려면 레이아웃에서 구역 유형·랙을 먼저 구성하세요.
              </p>
            </div>
          </div>
          <Tooltip title={!warehouseId ? '창고 정보를 확인할 수 없어 이동할 수 없습니다.' : undefined}>
            <Button
              type="primary"
              block
              icon={<LayoutOutlined />}
              onClick={openLayoutEditorForZones}
              disabled={!warehouseId}
              style={{ marginTop: 12 }}
            >
              레이아웃에서 불량존 추가
            </Button>
          </Tooltip>
          <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
            새 탭이 열리며 구역(Zone) 화면으로 이동합니다.
          </Text>
        </div>
      )}
      {zoneMissing && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <WarningFilled style={{ color: '#64748b', fontSize: 18, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>선택 가능한 구역이 없습니다</div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                이 창고에 보관용 구역이 아직 없어서 위치를 지정할 수 없습니다. 먼저 구역을 만들어 주세요.
              </p>
            </div>
          </div>
          <Tooltip title={!warehouseId ? '창고 정보를 확인할 수 없어 이동할 수 없습니다.' : undefined}>
            <Button
              block
              icon={<LayoutOutlined />}
              onClick={openLayoutEditorForZones}
              disabled={!warehouseId}
              style={{ marginTop: 12 }}
            >
              레이아웃에서 구역 추가
            </Button>
          </Tooltip>
        </div>
      )}
      {rackMissing && !zoneMissing && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <WarningFilled style={{ color: '#64748b', fontSize: 18, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>선택 가능한 랙이 없습니다</div>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                구역은 있지만 랙이 없어 배정할 수 없습니다. 랙 레이아웃에서 랙을 추가해 주세요.
              </p>
            </div>
          </div>
          <Tooltip title={!warehouseId ? '창고 정보를 확인할 수 없어 이동할 수 없습니다.' : undefined}>
            <Button
              block
              icon={<LayoutOutlined />}
              onClick={openLayoutEditorForRacks}
              disabled={!warehouseId}
              style={{ marginTop: 12 }}
            >
              레이아웃에서 랙 추가
            </Button>
          </Tooltip>
        </div>
      )}

      {/* ── 5-S. 분할 입력 패널 (splitMode = true) ── */}
      {splitMode && (() => {
        const renderRow = (c: typeof splitCandidates[number] | typeof overrideCandidates[number]) => {
          const v = splitQtys[c.locationId];
          const cap = c.availableCapacity;
          const overCap = cap != null && v != null && v > cap;
          const blocked = c.occupiedByOther != null;
          const isOverride = c.isOverride;
          const borderColor = blocked
            ? '#e2e8f0'
            : overCap
              ? '#fecaca'
              : isOverride
                ? '#fde68a'
                : '#e2e8f0';
          const bg = blocked
            ? '#f8fafc'
            : overCap
              ? '#fef2f2'
              : isOverride
                ? '#fffbeb'
                : '#fff';
          return (
            <div
              key={c.locationId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                background: bg,
                opacity: blocked ? 0.85 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Tooltip title={c.locationCode} mouseEnterDelay={0.4}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortLocationCode(c.locationCode)}
                  </div>
                </Tooltip>
                {blocked ? (
                  <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
                    🔒 {c.occupiedByOther!.productName ?? '(상품명 없음)'}
                    {c.occupiedByOther!.productSku ? ` ${c.occupiedByOther!.productSku}` : ''}
                    {' '}({c.occupiedByOther!.qty.toLocaleString()}개) 보관중
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                    {cap == null ? '수용 무제한' : `여유 ${cap.toLocaleString()} / 최대 ${(c.maxCapacity ?? 0).toLocaleString()}`}
                    {c.currentQty > 0 ? ` · 보유 ${c.currentQty.toLocaleString()}` : ''}
                  </div>
                )}
              </div>
              <InputNumber
                min={0}
                value={v}
                placeholder="수량"
                style={{ width: 110 }}
                disabled={blocked}
                onChange={(n) => {
                  setSplitQtys((p) => {
                    const next = { ...p };
                    if (n == null || Number(n) <= 0) delete next[c.locationId];
                    else next[c.locationId] = Number(n);
                    return next;
                  });
                }}
                status={overCap ? 'error' : undefined}
              />
            </div>
          );
        };

        return (
          <div style={{
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '14px',
            background: '#fafafa',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                추천 위치 ({splitCandidates.length}개)
              </div>
              <Checkbox
                checked={showOverride}
                onChange={(e) => { setShowOverride(e.target.checked); }}
                style={{ fontSize: 12 }}
              >
                추천 외 위치도 보기
              </Checkbox>
            </div>

            {/* 추천 후보 */}
            {splitCandidates.length === 0 ? (
              <div style={{ fontSize: 12, color: MUTED, padding: '12px 0', textAlign: 'center' }}>
                추천 위치가 없습니다. {showOverride ? '아래 추천 외 위치를 사용하세요.' : '"추천 외 위치도 보기"를 켜면 다른 후보를 볼 수 있어요.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                {splitCandidates.map(renderRow)}
              </div>
            )}

            {/* 추천 외 후보 */}
            {showOverride && (
              <>
                <div style={{ marginTop: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <WarningFilled style={{ color: '#d97706', fontSize: 14 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
                    추천 외 위치 ({overrideCandidates.length}개) — 협력사 정책 가이드 미준수 가능
                  </span>
                </div>
                {overrideCandidates.length === 0 ? (
                  <div style={{ fontSize: 12, color: MUTED, padding: '12px 0', textAlign: 'center' }}>
                    이 창고에 추천 외 후보가 없습니다.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {overrideCandidates.map(renderRow)}
                  </div>
                )}
              </>
            )}

            {/* 합계 표시 */}
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 6,
              background: splitTotal === itemQty ? '#f0fdf4' : (splitTotal > itemQty ? '#fef2f2' : '#f8fafc'),
              border: `1px solid ${splitTotal === itemQty ? '#bbf7d0' : (splitTotal > itemQty ? '#fecaca' : '#e2e8f0')}`,
              fontSize: 13,
              color: splitTotal === itemQty ? '#166534' : (splitTotal > itemQty ? '#b91c1c' : '#475569'),
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>
                선택한 합계: <b>{splitTotal.toLocaleString()}</b> / {itemQty.toLocaleString()}
              </span>
              <span>
                {splitTotal === itemQty
                  ? '✓ 일치'
                  : splitTotal < itemQty
                    ? `남은: ${(itemQty - splitTotal).toLocaleString()}`
                    : `초과: ${(splitTotal - itemQty).toLocaleString()}`}
              </span>
            </div>
          </div>
        );
      })()}

      {/* ── 5. 메인 선택 영역 (단일 선택 모드) ── */}
      {!splitMode && (
      <div style={{
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '16px 14px',
        background: '#fafafa',
      }}>
        {mode === 'manual' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 8 }}>
              랙
            </label>
            <Select
              placeholder={racksLoading ? '랙 정보를 불러오는 중…' : '랙을 선택하세요'}
              style={{ width: '100%' }}
              loading={racksLoading}
              options={rackOptions}
              value={selectedRackId ?? undefined}
              onChange={(v) => { setSelectedRackId(v); setSelectedLocationId(null); }}
              showSearch
              optionFilterProp="label"
              size="large"
              optionRender={(option) => {
                const r = (option.data as { _rack?: { code: string; name?: string | null; zoneName: string; occupiedCount: number; locationCount: number; hasSameSku: boolean; isCommon: boolean; supplierName: string | null } })._rack;
                if (!r) return option.label;
                const hasCapacity = r.locationCount > 0;
                const empty = r.locationCount - r.occupiedCount;
                const occText = hasCapacity ? `${r.occupiedCount}/${r.locationCount}` : '층 없음';
                const occColor = !hasCapacity
                  ? '#94a3b8'
                  : empty === 0
                    ? '#ef4444'
                    : empty <= r.locationCount * 0.2
                      ? '#f59e0b'
                      : '#16a34a';
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                    {r.hasSameSku && (
                      <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>⭐ 동일 상품</Tag>
                    )}
                    {!r.hasSameSku && r.isCommon && (
                      <Tag color="green" style={{ margin: 0, fontSize: 11 }}>공통</Tag>
                    )}
                    {!r.hasSameSku && !r.isCommon && (
                      <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>{r.supplierName ?? '협력사'}</Tag>
                    )}
                    <Tag style={{ margin: 0, fontSize: 11, background: '#f1f5f9', color: '#475569', border: 'none' }}>
                      {r.zoneName}
                    </Tag>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name || r.code}
                      </div>
                      {r.name && (
                        <div style={{ fontSize: 11, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.code}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: occColor, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {occText}
                    </span>
                  </div>
                );
              }}
            />
            {!racksLoading && rackOptions.length === 0 && (
              <Text style={{ fontSize: 12, color: DEFECT, marginTop: 6, display: 'block' }}>
                {item.is_defect && shouldRestrictToDefectRacks
                  ? '이 창고에 선택 가능한 DEFECT 랙이 없습니다.'
                  : '이 창고에 선택 가능한 랙이 없습니다.'}
              </Text>
            )}
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
              로케이션
            </label>
            {((mode === 'suggested' && hasSuggestions) || (mode === 'manual' && enrichedManualLocations.length > 0)) && (
              <Checkbox
                checked={onlyFitting}
                onChange={(e) => { setOnlyFitting(e.target.checked); setSelectedLocationId(null); }}
                style={{ fontSize: 12 }}
              >
                수용 가능한 위치만 보기 ({itemQty}개)
              </Checkbox>
            )}
          </div>
          <Select
            placeholder={
              mode === 'suggested'
                ? (hasSuggestions
                    ? (visibleSuggestions.length === 0
                        ? '수용 가능한 위치가 없습니다'
                        : '추천 로케이션을 선택하세요')
                    : '추천 결과가 없습니다')
                : selectedRackId
                  ? (enrichedManualLocations.length === 0
                      ? '이 랙에는 등록된 로케이션이 없습니다'
                      : (visibleManualLocations.length === 0
                          ? '수용 가능한 위치가 없습니다'
                          : '빈 로케이션을 선택하세요'))
                  : '먼저 랙을 선택하세요'
            }
            style={{ width: '100%' }}
            disabled={mode === 'suggested' ? !hasSuggestions : !selectedRackId}
            loading={mode === 'suggested' ? suggestionLoading : locLoading}
            options={locationOptions}
            value={selectedLocationId ?? undefined}
            onChange={(value) => {
              setSelectedLocationId(value);
              if (mode === 'suggested') {
                const suggested = suggestionByLocationId.get(value);
                if (suggested) setSelectedRackId(suggested.rack_id);
              }
            }}
            showSearch
            optionFilterProp="label"
            size="large"
          />

          {/* 후보 자리 중 itemQty 담을 곳이 하나도 없으면 자동 안내 (필터 켜고 안 켜고 무관) */}
          {(() => {
            const fitCount = mode === 'manual'
              ? enrichedManualLocations.filter((l) => l.availableCapacity == null || l.availableCapacity >= itemQty).length
              : visibleSuggestions.filter((l) => l.available_capacity == null || l.available_capacity >= itemQty).length;
            const hasCandidates = mode === 'manual'
              ? enrichedManualLocations.length > 0
              : hasSuggestions;
            return hasCandidates && fitCount === 0;
          })() && (() => {
            const pool = mode === 'manual' ? enrichedManualLocations : suggestedLocations;
            const maxAvail = pool.reduce((m, l) => {
              const a = mode === 'manual'
                ? (l as typeof enrichedManualLocations[number]).availableCapacity
                : (l as typeof suggestedLocations[number]).available_capacity;
              return a != null && a > m ? a : m;
            }, 0);
            return (
              <div style={{
                marginTop: 8,
                padding: '10px 12px',
                borderRadius: 6,
                fontSize: 13,
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                lineHeight: 1.5,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <WarningFilled style={{ color: '#d97706', fontSize: 14, marginTop: 3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>
                    {itemQty}개를 한 자리에 담을 수 없습니다
                  </span>
                  <span style={{ color: '#64748b', marginLeft: 4 }}>
                    (최대 {maxAvail}개)
                  </span>
                  {' · '}
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto', fontSize: 13, fontWeight: 600 }}
                    onClick={() => {
                      setSplitMode(true);
                      setSplitQtys({});
                      setSelectedLocationId(null);
                    }}
                  >
                    분할 입력으로 전환
                  </Button>
                </div>
              </div>
            );
          })()}

          {/*
            선택 로케이션 수용량 안내 — willExceed 케이스는 위 노란 박스에 이미 정보가 있어 중복.
            정상 케이스(여유 있음 / 무제한)만 한 줄 secondary 로 간결히 표시.
          */}
          {capacityStatus && !capacityStatus.willExceed && (
            <div style={{ marginTop: 8, fontSize: 12, color: MUTED }}>
              {capacityStatus.unlimited
                ? '이 로케이션은 수용량 미설정 (무제한)'
                : `최대 ${capacityStatus.maxCapacity} · 추가 가능 ${Math.max(0, capacityStatus.remaining)} · 이번 적치 ${capacityStatus.needed}`}
            </div>
          )}
        </div>

        {/* 빈 랙 안내 — 모달 안에서 로케이션 생성 대신 레이아웃 편집기로 안내 */}
        {noLocationsForRack && (
          <div style={{
            marginTop: 12,
            padding: '10px 12px',
            background: '#fffbeb',
            border: '1px dashed #fcd34d',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}>
            <WarningFilled style={{ color: '#d97706', fontSize: 14, marginTop: 3, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#92400e', lineHeight: 1.55 }}>
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>
                이 랙에는 등록된 로케이션이 없습니다
              </div>
              <span style={{ color: '#64748b' }}>
                레이아웃 편집기에서 층(로케이션)을 먼저 추가한 뒤 다시 적치하세요.
              </span>
              {' '}
              <Button
                type="link"
                size="small"
                icon={<LayoutOutlined />}
                onClick={openLayoutEditorForRacks}
                disabled={!warehouseId}
                style={{ padding: 0, height: 'auto', fontSize: 12, fontWeight: 600 }}
              >
                레이아웃 편집기 열기
              </Button>
            </div>
          </div>
        )}

      </div>
      )}

      {/* ── 6. 구역 편집과 구분: 미리보기만(동일 URL 중복 제거) ── */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 8,
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          gap: '2px 6px',
        }}
      >
        <Button
          type="link"
          size="small"
          icon={<LinkOutlined style={{ fontSize: 11 }} />}
          style={{ padding: 0, color: MUTED, fontSize: 11, height: 'auto' }}
          onClick={() => {
            window.open(
              buildLayoutEditorHref(warehouseId, 'preview', { returnTo, returnToLabel }),
              '_blank',
              'noopener,noreferrer',
            );
          }}
        >
          랙·재고 미리보기 (새 탭)
        </Button>
      </div>
    </Modal>
  );
}
