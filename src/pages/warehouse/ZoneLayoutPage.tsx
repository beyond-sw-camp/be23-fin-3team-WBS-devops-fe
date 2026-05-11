import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Form, Input, App, Button, InputNumber, Select, Spin, Collapse, Typography, Divider, Space, Tag, Segmented,
} from 'antd';
import {
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  AppstoreAddOutlined,
  UndoOutlined,
  RedoOutlined,
  DeleteOutlined,
  PlusOutlined,
  ArrowLeftOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Stage, Layer, Rect, Group, Transformer, Text as KonvaText } from 'react-konva';
import { useQueryClient } from '@tanstack/react-query';
import type { Rack, RackLayout, RackStock, ZoneLayout } from '@/types/warehouse';
import {
  useZonesByWarehouse,
  useZoneLayouts,
  useWarehouseCanvas,
  useWarehouseDetail,
  useRacks,
  useRackLayoutsByWarehouse,
  useUpdateRack,
} from '@/hooks/useWarehouseQuery';
import { useContainerSize } from '@/hooks/useContainerSize';
import { useSuppliers } from '@/hooks/useMasterQuery';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import {
  packRacksEditorDirectWorld,
  computeBatchRackLocalGrid,
  getZoneEditorFloorTransform,
  packedRectToLocalRack,
  anchorBatchGridToClick,
  clampBatchInsideZone,
  batchCollidesExistingLayouts,
  placeRacksDistributedInZoneLocal,
  ZONE_INNER_PAD,
  type PackedRackGeometry,
} from '@/utils/zoneRackLayout';
import * as warehouseApi from '@/api/warehouse';
import { DarkRackKonvaView, SLOT_FILL } from '@/pages/warehouse/DarkRackKonvaShared';
import { EditorInfiniteGridScreen } from '@/pages/warehouse/EditorInfiniteGridScreen';
import {
  EDITOR_SNAP_PX,
  EDITOR_CANVAS_BG,
  CAD_MAJOR_WORLD,
  EDITOR_RACK_TAB_FIT_RATIO,
  EDITOR_RACK_TAB_FOOTER_RESERVE_PX,
  EDITOR_CYAN,
  snapToEditorGrid,
  fitWorldBoundsToViewport,
  type WorldContentBounds,
} from '@/pages/warehouse/warehouseEditorCanvasShared';
import { buildLocationCode, formatLocationCodeRangeCompact } from '@/utils/locationCode';
import { rackUtilizationPct } from '@/utils/rackInventoryDisplay';
import { rackIdHasInventory } from '@/utils/inventoryGuard';
const CANVAS_BG = EDITOR_CANVAS_BG;

/** 선택 랙 테두리 — 파란 강조 대신 격자 톤에 맞는 슬레이트 */
const SEL_STROKE = EDITOR_CYAN;

interface DarkRackGroupProps {
  pr: PackedRackGeometry;
  rack: Rack | undefined;
  selected: boolean;
  stock: RackStock | undefined;
  onSelect: () => void;
  onDoubleClick?: () => void;
  /** false면 Space 패닝 등에 포인터가 통과 */
  listening?: boolean;
  draggable?: boolean;
  onDragEnd?: (e: import('konva/lib/Node').KonvaEventObject<DragEvent>) => void;
  onHover?: () => void;
  onLeave?: () => void;
  rackOpacity?: number;
  /** 가동률 히트맵 모드(랙 외곽을 적재율 색으로 칠함) */
  showUtilization?: boolean;
  utilizationPct?: number;
}

function DarkRackGroup({ pr, rack, selected, stock, onSelect, onDoubleClick, listening = true, draggable = false, onDragEnd, onHover, onLeave, rackOpacity = 1, showUtilization = false, utilizationPct = 0 }: DarkRackGroupProps) {
  const code = rack?.code ?? `R${pr.rl.rack_id}`;
  return (
    <DarkRackKonvaView
      x={pr.gx}
      y={pr.gy}
      width={pr.dw}
      height={pr.dh}
      rotation={pr.rl.rotation ?? 0}
      rackLayout={pr.rl}
      rackCode={code}
      vendorName={rack?.supplier_name}
      levelOnly
      levelCount={rack?.level_no ?? undefined}
      stock={stock}
      visualMode={showUtilization ? 'monitoringUtilization' : 'inventorySlots'}
      utilizationPct={utilizationPct}
      selected={selected}
      rackOpacity={rackOpacity}
      listening={listening}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onDblClick={(e) => {
        e.cancelBubble = true;
        onDoubleClick?.();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        onSelect();
      }}
      onMouseEnter={() => onHover?.()}
      onMouseLeave={() => onLeave?.()}
    />
  );
}

export interface ZoneLayoutPageProps {
  fixedWarehouseId?: string;
  fixedZoneId?: string;
  showRackBatchUI?: boolean;
  onBack?: () => void;
  onRackDrillDown?: (rackId: string) => void;
  /** 읽기 전용 — 편집 UI 숨김 */
  readonly?: boolean;
  /** 하이라이트할 rack_id 집합 */
  highlightRackIds?: Set<string>;
  /** 가동률 히트맵 모드 — 각 랙 외곽을 적재율 색으로 칠한다 */
  showUtilization?: boolean;
}

/** 작업 중인 구역(랙 편집기는 항상 단일 구역 집중 뷰) */
export type ZoneCanvasPickerValue = string;

export default function ZoneLayoutPage({
  fixedWarehouseId,
  fixedZoneId,
  showRackBatchUI = true,
  onBack,
  onRackDrillDown,
  readonly = false,
  highlightRackIds,
  showUtilization = false,
}: ZoneLayoutPageProps = {}) {
  const whId = fixedWarehouseId ?? '';
  const { message } = App.useApp();
  const qc = useQueryClient();
  const updateRack = useUpdateRack();

  // 하이라이트 pulse
  const [rackPulse, setRackPulse] = useState(0);
  useEffect(() => {
    if (!highlightRackIds || highlightRackIds.size === 0) return;
    const t = window.setInterval(() => setRackPulse((p) => p + 1), 400);
    return () => window.clearInterval(t);
  }, [highlightRackIds]);

  const { data: canvas, isLoading: cLoad } = useWarehouseCanvas(whId);
  const { data: warehouseDetail } = useWarehouseDetail(whId);
  const { data: suppliers = [] } = useSuppliers();
  const { data: zonesAll = [], isLoading: zLoad } = useZonesByWarehouse(whId);
  const { data: zoneLayouts = [], isLoading: zlLoad } = useZoneLayouts(whId);
  const { data: racksAll = [], isLoading: rLoad } = useRacks({ warehouseId: whId });
  // 디자이너/모니터링은 운영 중인 구역·랙만 — 비활성은 관리 탭에서 다시 활성화
  const zones = useMemo(() => zonesAll.filter((z) => z.is_active !== false), [zonesAll]);
  const racks = useMemo(() => racksAll.filter((r) => r.is_active !== false), [racksAll]);
  const { data: rackLayouts = [], isLoading: rlLoad } = useRackLayoutsByWarehouse(whId);
  // 슬롯 상태 색상과 랙 툴팁을 실 재고 데이터로 채운다.
  const { data: inventoryByRack } = useInventoryByRack(whId || null);

  const { containerRef, size: cSize } = useContainerSize({ useBoundingRectHeight: true });
  const cW = canvas?.canvas_width ?? 1000;
  const cH = canvas?.canvas_height ?? 700;

  const [form] = Form.useForm();
  const rackCountW = Form.useWatch('rackCount', form);
  const levelsW = Form.useWatch('levels', form);
  const namePrefixW = Form.useWatch('namePrefix', form);
  const widthW = Form.useWatch('width', form);
  const heightW = Form.useWatch('height', form);
  const gapW = Form.useWatch('gap', form);

  const [scale, setScale] = useState(0.72);
  const [stagePos, setStagePos] = useState({ x: 48, y: 48 });
  /** null: 아직 로드 전 · number: 편집 대상 구역 */
  const [selectedZoneKey, setSelectedZoneKey] = useState<ZoneCanvasPickerValue | null>(null);
  const [selectedRackKey, setSelectedRackKey] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  type RackPlaceMode = null | { type: 'matrix' } | { type: 'single' };
  const [rackPlaceMode, setRackPlaceMode] = useState<RackPlaceMode>(null);
  /** Ctrl+C/V 클립보드 — 선택한 랙의 크기/회전을 복사해 다음 단일 배치에 prefill */
  const [rackClipboard, setRackClipboard] = useState<{ width: number; height: number } | null>(null);
  /**
   * 회전된 zone 안 작업 시 캔버스가 비스듬해 작업이 어려운 점을 보완 — 기본은 정방향 보기.
   * 사용자가 회전 적용된 모습 확인하고 싶을 때 토글로 끔.
   * 저장 데이터(zone.rotation) 는 변경하지 않고 visual rendering 만 영향.
   */
  const [zoneViewUpright, setZoneViewUpright] = useState(true);
  const [rackCreateMode, setRackCreateMode] = useState<'single' | 'matrix'>(showRackBatchUI ? 'matrix' : 'single');
  // ── 좌측 패널 wizard 상태 — 한 번에 한 단계만 펼침, 다음 버튼으로 진행
  const [wizardStep, setWizardStep] = useState<string>('mode');
  const wizardStepOrder = useMemo<string[]>(
    () => (rackCreateMode === 'matrix'
      ? ['mode', 'common', 'size', 'action']
      : ['mode', 'common', 'action']),
    [rackCreateMode],
  );
  // mode 가 single 로 바뀌면서 'size' 가 사라지면 activeStep 보정
  useEffect(() => {
    if (!wizardStepOrder.includes(wizardStep)) setWizardStep('common');
  }, [wizardStepOrder, wizardStep]);
  const wizardStepFields: Record<string, string[]> = {
    mode: [],
    common: ['namePrefix', 'levels', 'maxCapacity', 'width', 'height'],
    size: ['rackCount', 'gap'],
    action: [],
  };
  const wizardGoNext = async () => {
    const fields = wizardStepFields[wizardStep] ?? [];
    try {
      if (fields.length > 0) await form.validateFields(fields);
      const idx = wizardStepOrder.indexOf(wizardStep);
      if (idx >= 0 && idx < wizardStepOrder.length - 1) {
        setWizardStep(wizardStepOrder[idx + 1]);
      }
    } catch {
      // 검증 실패 — 현재 step 에 머무름 (Form 이 에러 표시)
    }
  };
  const wizardGoPrev = () => {
    const idx = wizardStepOrder.indexOf(wizardStep);
    if (idx > 0) setWizardStep(wizardStepOrder[idx - 1]);
  };
  const wizardStepLabel = (key: string, title: string) => {
    const idx = wizardStepOrder.indexOf(key);
    const num = idx >= 0 ? idx + 1 : '?';
    const isActive = wizardStep === key;
    const isPast = idx >= 0 && idx < wizardStepOrder.indexOf(wizardStep);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: isActive ? '#2563eb' : (isPast ? '#16a34a' : '#e2e8f0'),
          color: isActive || isPast ? '#fff' : '#64748b',
          fontSize: 11,
          fontWeight: 700,
        }}>{isPast ? '✓' : num}</span>
        <span style={{ fontWeight: 600, color: '#1e2a3a' }}>{title}</span>
      </span>
    );
  };
  const [placeGhost, setPlaceGhost] = useState<{ worldX: number; worldY: number } | null>(null);
  /** 선택 랙 규격·위치 편집 (디바운스 저장) */
  const [editRl, setEditRl] = useState<{ pos_x: number; pos_y: number; width: number; height: number } | null>(null);
  const editRlRef = useRef(editRl);
  const saveRlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rackTrRef = useRef<Konva.Transformer>(null);
  const rackEditRectRef = useRef<Konva.Rect>(null);
  const canvasPanRef = useRef<{ sx: number; sy: number; cx: number; cy: number; moved: boolean; btn: number } | null>(null);
  const [canvasPanning, setCanvasPanning] = useState(false);
  const spaceDownRef = useRef(false);
  const [spacePanArm, setSpacePanArm] = useState(false);
  const editorPointerInsideRef = useRef(false);
  const stagePosRef = useRef(stagePos);
  stagePosRef.current = stagePos;
  const rackUndoStack = useRef<RackLayout[][]>([]);
  const rackRedoStack = useRef<RackLayout[][]>([]);
  useEffect(() => {
    editRlRef.current = editRl;
  }, [editRl]);

  const loading = cLoad || zLoad || zlLoad || rLoad || rlLoad;

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const rackById = useMemo(() => {
    const m = new Map<string, Rack>();
    racks.forEach((r) => m.set(r.id, r));
    return m;
  }, [racks]);

  // 실 재고 데이터에서 랙별 요약을 파생한다.
  const stockByRackId = useMemo(() => {
    const m = new Map<string, RackStock>();
    (inventoryByRack?.racks ?? []).forEach((r) => {
      let available = 0;
      let reserved = 0;
      let total = 0;
      const names: string[] = [];
      const skus: string[] = [];
      r.locations.forEach((loc) => {
        available += loc.available_qty;
        reserved += loc.reserved_qty;
        total += loc.total_qty;
        if (loc.product_name) names.push(loc.product_name);
        if (loc.product_sku) skus.push(loc.product_sku);
      });
      const uniqNames = [...new Set(names)];
      const uniqSkus = [...new Set(skus)];
      m.set(r.rack_id, {
        rack_id: r.rack_id,
        rack_code: r.rack_code,
        sku: uniqSkus.length === 0 ? '' : uniqSkus.length === 1 ? uniqSkus[0] : `${uniqSkus.length} SKU`,
        product_name: uniqNames.length === 0
          ? '—'
          : uniqNames.length === 1
            ? uniqNames[0]
            : `${uniqNames[0]} 외 ${uniqNames.length - 1}건`,
        available_qty: available,
        reserved_qty: reserved,
        total_qty: total,
      });
    });
    return m;
  }, [inventoryByRack]);

  const utilizationByRackId = useMemo(() => {
    const m = new Map<string, number>();
    (inventoryByRack?.racks ?? []).forEach((r) => m.set(r.rack_id, rackUtilizationPct(r)));
    return m;
  }, [inventoryByRack]);

  useEffect(() => {
    setSelectedZoneKey(null);
  }, [whId]);

  useEffect(() => {
    if (loading) return;
    // 외부에서 구역을 지정한 경우(드릴다운) 해당 구역을 강제 사용
    if (fixedZoneId != null) {
      setSelectedZoneKey(fixedZoneId);
      return;
    }
    const firstLayout = zoneLayouts.find((zl) => zl.warehouse_id === whId);
    const zid = firstLayout?.zone_id ?? zones.find((z) => z.warehouse_id === whId)?.id;
    if (zid == null) return;
    setSelectedZoneKey((prev) => (prev === null ? zid : prev));
  }, [loading, whId, zoneLayouts, zones, fixedZoneId]);

  const selectedZoneId = fixedZoneId ?? selectedZoneKey;
  const isZoneDetailView = selectedZoneId != null;
  const hasCanvasSelection = selectedZoneId != null;

  const selectedZl = useMemo(
    () => (selectedZoneId != null ? zoneLayouts.find((z) => z.zone_id === selectedZoneId) ?? null : null),
    [zoneLayouts, selectedZoneId],
  );

  /** 매트릭스 고스트: 창고 캔버스 전체를 그리드 영역으로 취급 (0,0,cW,cH) */
  // 실제 구역 크기 그대로 사용 (이전엔 cW×cH 로 확대했으나 비율 왜곡 이슈로 제거)
  const floorVirtualZl = useMemo((): ZoneLayout | null => {
    return selectedZl ?? null;
  }, [selectedZl]);

  const packed = useMemo(
    () => packRacksEditorDirectWorld(rackLayouts, zoneLayouts, whId, null),
    [rackLayouts, zoneLayouts, whId],
  );

  /** 해당 구역 랙 바운딩만으로 맞춤 줌(구역 테두리 없음 · 빈 구역은 캔버스 중앙) */
  const contentBounds = useMemo((): WorldContentBounds => {
    if (selectedZoneId == null || !whId) {
      return { minX: 0, minY: 0, maxX: cW, maxY: cH };
    }
    // 선택된 zone 의 실제 사각형을 bounds 로 사용 → 랙이 없어도 구역 전체가 뷰에 맞춰짐
    const zl = zoneLayouts.find(
      (z) => z.zone_id === selectedZoneId && z.warehouse_id === whId,
    );
    if (!zl) {
      return { minX: 0, minY: 0, maxX: cW, maxY: cH };
    }
    return {
      minX: zl.pos_x,
      minY: zl.pos_y,
      maxX: zl.pos_x + zl.width,
      maxY: zl.pos_y + zl.height,
    };
  }, [selectedZoneId, whId, zoneLayouts, cW, cH]);

  const worldW = cW;
  const worldH = cH;

  useEffect(() => {
    form.setFieldsValue({
      rackCount: 3,
      levels: 4,
      width: 168,
      height: 128,
      gap: 36,
      namePrefix: '랙',
      supplierId: undefined,
      maxCapacity: 200,
      widthMm: undefined,
      depthMm: undefined,
      heightMm: undefined,
      levelGuideJson: undefined,
    });
  }, [form, selectedZoneId]);

  useEffect(() => {
    if (!isZoneDetailView) setRackPlaceMode(null);
  }, [isZoneDetailView]);

  /** 다른 구역으로 이동하거나 창고 전체로 나가면 정방향 보기로 reset */
  useEffect(() => {
    setZoneViewUpright(true);
  }, [selectedZoneId]);

  const isPlacementPointInsideZone = useCallback((worldX: number, worldY: number, zl: RackLayout | ZoneLayout) => {
    const lx = worldX - zl.pos_x;
    const ly = worldY - zl.pos_y;
    return (
      lx >= ZONE_INNER_PAD &&
      ly >= ZONE_INNER_PAD &&
      lx <= zl.width - ZONE_INNER_PAD &&
      ly <= zl.height - ZONE_INNER_PAD
    );
  }, []);

  const ghostPreview = useMemo(() => {
    if (!rackPlaceMode || !isZoneDetailView || !selectedZl || selectedZoneId == null || !placeGhost || !floorVirtualZl) {
      return null;
    }
    const w = Number(widthW) || 128;
    const h = Number(heightW) || 96;
    const g = Number(gapW) ?? 16;
    const { worldX, worldY } = placeGhost;
    const zl = selectedZl;
    const existing = rackLayouts.filter((l) => l.zone_id === selectedZoneId);
    const clickInsideZone = isPlacementPointInsideZone(worldX, worldY, zl);

    if (rackPlaceMode.type === 'single') {
      const rawLocal = [{ lx: worldX - zl.pos_x, ly: worldY - zl.pos_y }];
      const clampedLocal = clampBatchInsideZone(rawLocal, w, h, zl);
      if (!clickInsideZone || !clampedLocal) {
        return {
          kind: 'single' as const,
          worldCells: [{ wx: worldX, wy: worldY }],
          w,
          h,
          valid: false,
        };
      }
      const collides = batchCollidesExistingLayouts(clampedLocal, w, h, existing, selectedZoneId);
      const worldCells = clampedLocal.map((l) => ({ wx: l.lx + zl.pos_x, wy: l.ly + zl.pos_y }));
      return { kind: 'single' as const, worldCells, w, h, valid: !collides };
    }

    const rackCount = Number(rackCountW) || 3;
    const tmpl = computeBatchRackLocalGrid(floorVirtualZl, 1, rackCount, w, h, g, cW, cH);
    const clickLx = worldX - zl.pos_x;
    const clickLy = worldY - zl.pos_y;
    const anchoredLocal = anchorBatchGridToClick(tmpl, clickLx, clickLy);
    const clampedLocal = clampBatchInsideZone(anchoredLocal, w, h, zl);
    if (!clickInsideZone || !clampedLocal) {
      const asWorld = anchoredLocal.map((p) => ({ wx: p.lx + zl.pos_x, wy: p.ly + zl.pos_y }));
      return { kind: 'matrix' as const, worldCells: asWorld, w, h, valid: false };
    }
    const collides = batchCollidesExistingLayouts(clampedLocal, w, h, existing, selectedZoneId);
    const worldCells = clampedLocal.map((l) => ({ wx: l.lx + zl.pos_x, wy: l.ly + zl.pos_y }));
    return { kind: 'matrix' as const, worldCells, w, h, valid: !collides };
  }, [
    rackPlaceMode,
    isZoneDetailView,
    selectedZl,
    selectedZoneId,
    floorVirtualZl,
    placeGhost,
    widthW,
    heightW,
    gapW,
    rackCountW,
    rackLayouts,
    cW,
    cH,
    isPlacementPointInsideZone,
  ]);

  const fitToRackEditorFocus = useCallback(() => {
    if (cSize.width < 100 || cSize.height < 100) return;
    if (selectedZoneId == null) return;
    const stageH = Math.max(120, cSize.height - EDITOR_RACK_TAB_FOOTER_RESERVE_PX);
    const v = fitWorldBoundsToViewport(cSize.width, stageH, contentBounds, {
      maxScale: 12,
      contentRatio: EDITOR_RACK_TAB_FIT_RATIO,
      paddingWorld: 4,
    });
    setScale(v.scale);
    setStagePos({ x: v.ox, y: v.oy });
  }, [cSize.width, cSize.height, selectedZoneId, contentBounds]);

  /** 구역 전환·구역 크기 변경·컨테이너 리사이즈 시에만 현재 구역이 화면 ~90% 채우도록
   *  (랙 이동/리사이즈 시에는 시점 유지 — packed 는 의도적으로 의존성에서 제외) */
  useEffect(() => {
    if (loading || cSize.width < 120) return;
    if (selectedZoneId == null) return;
    fitToRackEditorFocus();
  }, [
    selectedZoneId,
    selectedZl?.zone_id,
    selectedZl?.pos_x,
    selectedZl?.pos_y,
    selectedZl?.width,
    selectedZl?.height,
    loading,
    cSize.width,
    cSize.height,
    fitToRackEditorFocus,
  ]);

  useEffect(() => {
    const endPan = () => {
      if (canvasPanRef.current) setCanvasPanning(false);
      canvasPanRef.current = null;
    };
    window.addEventListener('mouseup', endPan);
    window.addEventListener('blur', endPan);
    return () => {
      window.removeEventListener('mouseup', endPan);
      window.removeEventListener('blur', endPan);
    };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && editorPointerInsideRef.current) {
        e.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setSpacePanArm(true);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDownRef.current = false;
        setSpacePanArm(false);
      }
    };
    window.addEventListener('keydown', down, { capture: true });
    window.addEventListener('keyup', up, { capture: true });
    return () => {
      window.removeEventListener('keydown', down, { capture: true });
      window.removeEventListener('keyup', up, { capture: true });
    };
  }, []);

  const selectedPacked = useMemo(
    () => packed.find((p) => p.key === selectedRackKey) ?? null,
    [packed, selectedRackKey],
  );
  const selectedRack = selectedPacked ? rackById.get(selectedPacked.rl.rack_id) : undefined;
  const [hoveredRackKey, setHoveredRackKey] = useState<string | null>(null);

  useEffect(() => {
    if (selectedPacked) {
      setEditRl({
        pos_x: selectedPacked.rl.pos_x,
        pos_y: selectedPacked.rl.pos_y,
        width: selectedPacked.rl.width,
        height: selectedPacked.rl.height,
      });
    } else {
      setEditRl(null);
    }
  }, [selectedRackKey, selectedPacked?.rl.pos_x, selectedPacked?.rl.pos_y, selectedPacked?.rl.width, selectedPacked?.rl.height]);

  const persistLayoutsForZone = useCallback(
    async (zoneId: string, nextZoneLayouts: RackLayout[]) => {
      await warehouseApi.saveRackLayouts(zoneId, whId, nextZoneLayouts);
      await qc.invalidateQueries({ queryKey: ['rack-layouts-warehouse', whId] });
      await qc.invalidateQueries({ queryKey: ['racks', { warehouseId: whId }] });
    },
    [whId, qc],
  );

  const snapshotRackLayouts = useCallback((): RackLayout[] => {
    const cur = qc.getQueryData<RackLayout[]>(['rack-layouts-warehouse', whId]) ?? rackLayouts;
    return JSON.parse(JSON.stringify(cur)) as RackLayout[];
  }, [whId, qc, rackLayouts]);

  const pushRackUndoSnapshot = useCallback(() => {
    rackUndoStack.current.push(snapshotRackLayouts());
    if (rackUndoStack.current.length > 25) rackUndoStack.current.shift();
    rackRedoStack.current = [];
  }, [snapshotRackLayouts]);

  const handleRackLayoutUndo = useCallback(async () => {
    const prev = rackUndoStack.current.pop();
    if (!prev) {
      message.info('실행 취소할 랙 배치 이력이 없습니다.');
      return;
    }
    rackRedoStack.current.push(snapshotRackLayouts());
    const byZone = new Map<string, RackLayout[]>();
    prev.forEach((l) => {
      const arr = byZone.get(l.zone_id) ?? [];
      arr.push(l);
      byZone.set(l.zone_id, arr);
    });
    try {
      for (const [zid, list] of byZone) {
        await warehouseApi.saveRackLayouts(zid, whId, list);
      }
      await qc.invalidateQueries({ queryKey: ['rack-layouts-warehouse', whId] });
      message.success('랙 배치를 되돌렸습니다.');
    } catch {
      message.error('실행 취소에 실패했습니다.');
    }
  }, [whId, qc, message, snapshotRackLayouts]);

  const handleRackLayoutRedo = useCallback(async () => {
    const next = rackRedoStack.current.pop();
    if (!next) {
      message.info('다시 실행할 변경이 없습니다.');
      return;
    }
    rackUndoStack.current.push(snapshotRackLayouts());
    const byZone = new Map<string, RackLayout[]>();
    next.forEach((l) => {
      const arr = byZone.get(l.zone_id) ?? [];
      arr.push(l);
      byZone.set(l.zone_id, arr);
    });
    try {
      for (const [zid, list] of byZone) {
        await warehouseApi.saveRackLayouts(zid, whId, list);
      }
      await qc.invalidateQueries({ queryKey: ['rack-layouts-warehouse', whId] });
      message.success('다시 적용했습니다.');
    } catch {
      message.error('다시 실행에 실패했습니다.');
    }
  }, [whId, qc, message, snapshotRackLayouts]);

  /**
   * 현재 zone 의 모든 랙을 격자로 자동 정렬 (랙 크기는 평균값으로 통일, rotation 0).
   * 시드 좌표가 깨졌거나 운영 중 겹쳤을 때 한 번에 복구하는 용도.
   */
  const handleAutoArrangeRacks = useCallback(async () => {
    if (selectedZoneId == null) return;
    const zl = zoneLayouts.find((z) => z.zone_id === selectedZoneId && z.warehouse_id === whId);
    if (!zl) {
      message.error('구역 정보를 찾을 수 없습니다.');
      return;
    }
    const zoneList = rackLayouts.filter((l) => l.zone_id === selectedZoneId);
    if (zoneList.length === 0) {
      message.info('정렬할 랙이 없습니다.');
      return;
    }
    // 안정적 순서 — rack_id 사전식 정렬
    const sorted = [...zoneList].sort((a, b) => a.rack_id.localeCompare(b.rack_id));
    const avgW = Math.max(40, Math.round(sorted.reduce((a, l) => a + l.width, 0) / sorted.length));
    const avgH = Math.max(40, Math.round(sorted.reduce((a, l) => a + l.height, 0) / sorted.length));
    const arranged = placeRacksDistributedInZoneLocal(zl, sorted.length, avgW, avgH, 28);

    pushRackUndoSnapshot();
    const updateMap = new Map<string, RackLayout>();
    sorted.forEach((rl, i) => {
      const a = arranged[i];
      updateMap.set(rl.rack_id, {
        ...rl,
        pos_x: a.lx,
        pos_y: a.ly,
        width: a.width,
        height: a.height,
        rotation: 0,
      });
    });
    const nextZoneList = zoneList.map((l) => updateMap.get(l.rack_id) ?? l);
    try {
      await persistLayoutsForZone(selectedZoneId, nextZoneList);
      message.success(`랙 ${sorted.length}개를 격자로 정렬했습니다.`);
    } catch {
      message.error('정렬 저장에 실패했습니다.');
    }
  }, [selectedZoneId, whId, zoneLayouts, rackLayouts, persistLayoutsForZone, pushRackUndoSnapshot, message]);

  const applyPackedRectToSelectedRack = useCallback(async () => {
    if (!isZoneDetailView || selectedZoneId == null || !selectedRack || !selectedPacked) return;
    const node = rackEditRectRef.current;
    if (!node) return;
    const t = getZoneEditorFloorTransform(selectedZoneId, zoneLayouts, whId);
    if (!t) return;
    let nw = Math.max(16, node.width() * node.scaleX());
    let nh = Math.max(16, node.height() * node.scaleY());
    const rotation = Math.round(node.rotation() ?? 0);
    node.scaleX(1);
    node.scaleY(1);
    // selection rect 는 zone(rotated) Group 의 자식 → node.x/y 는 zone-local 좌표.
    // packedRectToLocalRack 는 world 좌표를 받으므로 zone 원점 더해 world 로 변환 후 호출.
    const lx = snapToEditorGrid(node.x());
    const ly = snapToEditorGrid(node.y());
    nw = Math.max(16, snapToEditorGrid(nw));
    nh = Math.max(16, snapToEditorGrid(nh));
    node.x(lx);
    node.y(ly);
    node.width(nw);
    node.height(nh);
    node.rotation(rotation);
    const gx = t.zl.pos_x + lx;
    const gy = t.zl.pos_y + ly;
    const local = packedRectToLocalRack(gx, gy, nw, nh, t);
    const clampedLocal = clampBatchInsideZone([{ lx: local.pos_x, ly: local.pos_y }], local.width, local.height, t.zl);
    if (!clampedLocal) {
      // 원위치 — selection rect 가 zone Group 자식이므로 local 좌표로 복원
      node.x(selectedPacked.gx - t.zl.pos_x);
      node.y(selectedPacked.gy - t.zl.pos_y);
      node.width(selectedPacked.dw);
      node.height(selectedPacked.dh);
      node.rotation(selectedPacked.rl.rotation ?? 0);
      message.warning('랙이 구역 안에 들어가지 않습니다. 크기나 위치를 조정하세요.');
      return;
    }
    const boundedLocal = {
      ...local,
      pos_x: Math.round(clampedLocal[0].lx),
      pos_y: Math.round(clampedLocal[0].ly),
    };
    // 저장 후 selection rect 위치도 clamping 결과로 갱신 — zone-local 좌표
    node.x(boundedLocal.pos_x);
    node.y(boundedLocal.pos_y);
    pushRackUndoSnapshot();
    const zoneList = rackLayouts.filter((l) => l.zone_id === selectedZoneId);
    const next = zoneList.map((l) => (l.rack_id === selectedRack.id ? { ...l, ...boundedLocal, rotation } : l));
    try {
      await persistLayoutsForZone(selectedZoneId, next);
    } catch {
      message.error('랙 위치 저장에 실패했습니다.');
    }
  }, [
    isZoneDetailView,
    selectedZoneId,
    selectedRack,
    selectedPacked,
    rackLayouts,
    zoneLayouts,
    whId,
    pushRackUndoSnapshot,
    persistLayoutsForZone,
    message,
  ]);

  /** 랙 그룹 자체를 드래그했을 때 저장 — selectedPacked 기반 */
  const handleRackDragEnd = useCallback(
    async (e: import('konva/lib/Node').KonvaEventObject<DragEvent>, rackId: string) => {
      if (!isZoneDetailView || selectedZoneId == null) return;
      const rack = rackById.get(rackId);
      if (!rack) return;
      const t = getZoneEditorFloorTransform(selectedZoneId, zoneLayouts, whId);
      if (!t) return;
      const node = e.target;
      // 랙은 zone rotated Group 의 자식 → node.x/y 는 zone 로컬 좌표. world 로 변환 후 스냅.
      const worldX = node.x() + t.zl.pos_x;
      const worldY = node.y() + t.zl.pos_y;
      const gx = snapToEditorGrid(worldX);
      const gy = snapToEditorGrid(worldY);
      const packedRect = packed.find((p) => p.rl.rack_id === rackId);
      const dw = packedRect?.dw ?? 0;
      const dh = packedRect?.dh ?? 0;
      const local = packedRectToLocalRack(gx, gy, dw, dh, t);
      const clampedLocal = clampBatchInsideZone([{ lx: local.pos_x, ly: local.pos_y }], local.width, local.height, t.zl);
      if (!clampedLocal) {
        if (packedRect) {
          // 원위치 — local 좌표로 (rotated parent 안)
          node.x(packedRect.gx - t.zl.pos_x);
          node.y(packedRect.gy - t.zl.pos_y);
        }
        message.warning('랙이 구역 안에 들어가지 않습니다.');
        return;
      }
      const boundedLocal = {
        ...local,
        pos_x: Math.round(clampedLocal[0].lx),
        pos_y: Math.round(clampedLocal[0].ly),
      };
      // rotated parent 안 → local 좌표로 setting (= bounded local 그대로)
      node.x(boundedLocal.pos_x);
      node.y(boundedLocal.pos_y);
      pushRackUndoSnapshot();
      const zoneList = rackLayouts.filter((l) => l.zone_id === selectedZoneId);
      const next = zoneList.map((l) => (l.rack_id === rackId ? { ...l, ...boundedLocal } : l));
      try {
        await persistLayoutsForZone(selectedZoneId, next);
      } catch {
        message.error('랙 위치 저장에 실패했습니다.');
      }
    },
    [
      isZoneDetailView,
      selectedZoneId,
      rackById,
      zoneLayouts,
      whId,
      packed,
      rackLayouts,
      pushRackUndoSnapshot,
      persistLayoutsForZone,
      message,
    ],
  );

  const handleDeleteSelectedRack = useCallback(async () => {
    if (!selectedRack || !isZoneDetailView) return;
    if (rackIdHasInventory(inventoryByRack, selectedRack.id)) {
      message.error(`랙 "${selectedRack.code}"에 재고가 남아있어 삭제할 수 없습니다. 재고를 비운 뒤 다시 시도하세요.`);
      return;
    }
    pushRackUndoSnapshot();
    try {
      await warehouseApi.deleteRack(selectedRack.id);
      const zid = selectedRack.zone_id;
      const next = rackLayouts.filter((l) => l.zone_id === zid && l.rack_id !== selectedRack.id);
      await persistLayoutsForZone(zid, next);
      setSelectedRackKey(null);
      message.success('랙을 삭제했습니다.');
    } catch {
      message.error('랙 삭제에 실패했습니다.');
    }
  }, [selectedRack, isZoneDetailView, inventoryByRack, pushRackUndoSnapshot, rackLayouts, persistLayoutsForZone, message]);

  const scheduleSaveEditedLayout = useCallback(() => {
    if (!selectedRack) return;
    const zid = selectedRack.zone_id;
    const rid = selectedRack.id;
    if (saveRlTimer.current) clearTimeout(saveRlTimer.current);
    saveRlTimer.current = setTimeout(() => {
      const e = editRlRef.current;
      if (!e) return;
      const zl = zoneLayouts.find((z) => z.zone_id === zid);
      if (!zl) return;
      const normalized = {
        pos_x: snapToEditorGrid(e.pos_x),
        pos_y: snapToEditorGrid(e.pos_y),
        width: Math.max(16, snapToEditorGrid(e.width)),
        height: Math.max(16, snapToEditorGrid(e.height)),
      };
      const clampedLocal = clampBatchInsideZone([{ lx: normalized.pos_x, ly: normalized.pos_y }], normalized.width, normalized.height, zl);
      if (!clampedLocal) {
        message.warning('랙이 구역 안에 들어가지 않습니다. 크기나 위치를 조정하세요.');
        return;
      }
      const bounded = {
        ...normalized,
        pos_x: Math.round(clampedLocal[0].lx),
        pos_y: Math.round(clampedLocal[0].ly),
      };
      setEditRl((prev) => (prev ? { ...prev, ...bounded } : prev));
      const all = qc.getQueryData<RackLayout[]>(['rack-layouts-warehouse', whId]) ?? rackLayouts;
      const zoneList = all.filter((l) => l.zone_id === zid);
      const next = zoneList.map((l) =>
        l.rack_id === rid
          ? {
              ...l,
              ...bounded,
            }
          : l,
      );
      void persistLayoutsForZone(zid, next).catch(() => message.error('배치 저장에 실패했습니다.'));
    }, 450);
  }, [selectedRack, whId, rackLayouts, zoneLayouts, qc, persistLayoutsForZone, message]);

  const startMatrixPlacementMode = async () => {
    if (!selectedZoneId) {
      message.warning('편집할 구역을 먼저 선택하세요.');
      return;
    }
    const zl = zoneLayouts.find((z) => z.zone_id === selectedZoneId);
    if (!zl) {
      message.warning('구역(Zone) 탭에서 구역을 먼저 그리고 저장하세요.');
      return;
    }
    try {
      await form.validateFields(['namePrefix', 'rackCount', 'levels', 'maxCapacity', 'width', 'height', 'gap']);
    } catch {
      return;
    }
    setRackPlaceMode({ type: 'matrix' });
    setPlaceGhost({ worldX: cW / 2, worldY: cH / 2 });
    message.info('배치 모드: 고스트가 커서를 따릅니다. 빈 곳을 클릭하면 생성됩니다. ESC로 취소');
  };

  const startSinglePlacementMode = () => {
    if (!selectedZoneId) {
      message.warning('편집할 구역을 먼저 선택하세요.');
      return;
    }
    const zl = zoneLayouts.find((z) => z.zone_id === selectedZoneId);
    if (!zl) {
      message.warning('구역(Zone) 탭에서 구역을 먼저 그리고 저장하세요.');
      return;
    }
    void form.validateFields(['namePrefix', 'levels', 'maxCapacity', 'width', 'height']).catch(() => undefined);
    setRackPlaceMode({ type: 'single' });
    setPlaceGhost({ worldX: cW / 2, worldY: cH / 2 });
    message.info('단일 랙: 빈 곳을 클릭하면 놓습니다. ESC로 취소');
  };

  const nextUniqueRackNameInZone = useCallback(
    (prefix: string, usedNames?: Set<string>) => {
      const p = (prefix || '랙').trim() || '랙';
      const names = new Set(racks.filter((r) => r.zone_id === selectedZoneId).map((r) => r.name));
      usedNames?.forEach((name) => names.add(name));
      for (let n = 1; n < 9999; n += 1) {
        const candidate = `${p} ${String(n).padStart(2, '0')}`;
        if (!names.has(candidate)) return candidate;
      }
      return `${p} ${Date.now()}`;
    },
    [racks, selectedZoneId],
  );

  const commitPlacementAtWorld = useCallback(
    async (worldX: number, worldY: number) => {
      if (!rackPlaceMode || selectedZoneId == null || !selectedZl || !floorVirtualZl) return;
      const zl = selectedZl;
      const w = Number(form.getFieldValue('width')) || 128;
      const h = Number(form.getFieldValue('height')) || 96;
      const g = Number(form.getFieldValue('gap')) ?? 12;
      const namePrefix = (form.getFieldValue('namePrefix') as string) || '랙';
      const supplierId = (form.getFieldValue('supplierId') as string | undefined) || null;
      const supplier = suppliers.find((s) => s.id === supplierId) ?? null;
      const maxCapacity = Number(form.getFieldValue('maxCapacity'));
      const widthMm = form.getFieldValue('widthMm');
      const depthMm = form.getFieldValue('depthMm');
      const heightMm = form.getFieldValue('heightMm');
      const levelGuideJson = form.getFieldValue('levelGuideJson') as string | undefined;
      const existing = rackLayouts.filter((l) => l.zone_id === selectedZoneId);
      const usedRackNames = new Set<string>();
      setBulkSubmitting(true);
      try {
        if (!isPlacementPointInsideZone(worldX, worldY, zl)) {
          message.warning('구역 안쪽을 클릭해야 랙을 생성할 수 있습니다.');
          return;
        }
        if (rackPlaceMode.type === 'single') {
          const rawLocal = [{ lx: worldX - zl.pos_x, ly: worldY - zl.pos_y }];
          const clampedLocal = clampBatchInsideZone(rawLocal, w, h, zl);
          if (!clampedLocal) {
            message.error('이 크기의 랙은 구역 안에 들어가지 않습니다.');
            return;
          }
          if (batchCollidesExistingLayouts(clampedLocal, w, h, existing, selectedZoneId)) {
            message.warning('다른 랙과 겹칩니다. 빈 공간을 클릭하세요.');
            return;
          }
          const rackName = nextUniqueRackNameInZone(namePrefix, usedRackNames);
          usedRackNames.add(rackName);
          pushRackUndoSnapshot();
          const rack = await warehouseApi.createRack({
            zone_id: selectedZoneId,
            warehouse_id: whId,
            code: '',
            name: rackName,
            supplier_id: supplierId,
            supplier_name: supplier?.name ?? null,
            level_no: Number(form.getFieldValue('levels')) || 4,
            level_guide_json: levelGuideJson ?? null,
            max_capacity: maxCapacity,
            width: widthMm != null ? Number(widthMm) : null,
            depth: depthMm != null ? Number(depthMm) : null,
            height: heightMm != null ? Number(heightMm) : null,
          });
          const nextLayouts: RackLayout[] = [
            ...existing,
            {
              rack_id: rack.id,
              zone_id: selectedZoneId,
              warehouse_id: whId,
              pos_x: snapToEditorGrid(clampedLocal[0].lx),
              pos_y: snapToEditorGrid(clampedLocal[0].ly),
              width: Math.max(16, snapToEditorGrid(w)),
              height: Math.max(16, snapToEditorGrid(h)),
              rotation: 0,
              internal_rows: Number(form.getFieldValue('levels')) || 4,
              internal_cols: 1,
            },
          ];
          await persistLayoutsForZone(selectedZoneId, nextLayouts);
          message.success(`랙 ${rack.name} 배치됨`);
          setRackPlaceMode(null);
          return;
        }
        const rackCount = Number(form.getFieldValue('rackCount')) || 3;
        const levels = Number(form.getFieldValue('levels')) || 4;
        const tmpl = computeBatchRackLocalGrid(floorVirtualZl, 1, rackCount, w, h, g, cW, cH);
        // 클릭 지점을 구역 로컬 좌표로 변환한 뒤 템플릿을 해당 지점에 앵커
        const clickLx = worldX - zl.pos_x;
        const clickLy = worldY - zl.pos_y;
        const anchoredLocal = anchorBatchGridToClick(tmpl, clickLx, clickLy);
        const clampedLocal = clampBatchInsideZone(anchoredLocal, w, h, zl);
        if (!clampedLocal) {
          message.error('이 크기의 랙 묶음은 구역 안에 들어가지 않습니다.');
          return;
        }
        if (batchCollidesExistingLayouts(clampedLocal, w, h, existing, selectedZoneId)) {
          message.warning('기존 랙과 겹칩니다. 다른 빈 공간을 클릭하세요.');
          return;
        }
        pushRackUndoSnapshot();
        const nextLayouts: RackLayout[] = [...existing];
        let pi = 0;
        for (let r = 0; r < rackCount; r += 1) {
          const { lx: plx, ly: ply } = clampedLocal[pi];
          pi += 1;
          const rackName = nextUniqueRackNameInZone(namePrefix, usedRackNames);
          usedRackNames.add(rackName);
          const rack = await warehouseApi.createRack({
            zone_id: selectedZoneId,
            warehouse_id: whId,
            code: '',
            name: rackName,
            supplier_id: supplierId,
            supplier_name: supplier?.name ?? null,
            level_no: levels,
            level_guide_json: levelGuideJson ?? null,
            max_capacity: maxCapacity,
            width: widthMm != null ? Number(widthMm) : null,
            depth: depthMm != null ? Number(depthMm) : null,
            height: heightMm != null ? Number(heightMm) : null,
          });
          nextLayouts.push({
            rack_id: rack.id,
            zone_id: selectedZoneId,
            warehouse_id: whId,
            pos_x: snapToEditorGrid(plx),
            pos_y: snapToEditorGrid(ply),
            width: Math.max(16, snapToEditorGrid(w)),
            height: Math.max(16, snapToEditorGrid(h)),
            rotation: 0,
            internal_rows: levels,
            internal_cols: 1,
          });
        }
        await persistLayoutsForZone(selectedZoneId, nextLayouts);
        message.success(`랙 ${clampedLocal.length}개 생성 완료`);
        setRackPlaceMode(null);
      } catch (e) {
        console.error(e);
        message.error('랙 생성에 실패했습니다.');
      } finally {
        setBulkSubmitting(false);
      }
    },
    [
      rackPlaceMode,
      selectedZoneId,
      selectedZl,
      floorVirtualZl,
      rackLayouts,
      zoneById,
      whId,
      cW,
      cH,
      pushRackUndoSnapshot,
      persistLayoutsForZone,
      message,
      nextUniqueRackNameInZone,
      isPlacementPointInsideZone,
    ],
  );

  const recomputedPacked = useMemo(() => {
    const layouts = rackLayouts.map((l) => {
      if (!selectedPacked || !editRl || l.rack_id !== selectedPacked.rl.rack_id) return l;
      return { ...l, ...editRl };
    });
    return packRacksEditorDirectWorld(layouts, zoneLayouts, whId, null);
  }, [rackLayouts, zoneLayouts, whId, selectedPacked, editRl]);

  const displayPacked = editRl && selectedPacked ? recomputedPacked : packed;

  useEffect(() => {
    const tr = rackTrRef.current;
    const node = rackEditRectRef.current;
    if (!tr || !node) return;
    if (!isZoneDetailView || !selectedRackKey) {
      tr.nodes([]);
      return;
    }
    const pr = displayPacked.find((p) => p.key === selectedRackKey);
    if (!pr) {
      tr.nodes([]);
      return;
    }
    // selection rect 는 zone(rotated) Group 의 자식 → world(gx,gy) 가 아닌 zone-local 좌표 사용.
    // 그래야 zone 회전이 selection 에도 자동 반영되고 실제 랙 위치와 정확히 겹침 (잔상 방지).
    const zl = zoneLayouts.find((z) => z.zone_id === pr.rl.zone_id && z.warehouse_id === whId);
    const lx = zl ? pr.gx - zl.pos_x : pr.gx;
    const ly = zl ? pr.gy - zl.pos_y : pr.gy;
    node.x(lx);
    node.y(ly);
    node.width(pr.dw);
    node.height(pr.dh);
    node.rotation(pr.rl.rotation ?? 0);
    node.scaleX(1);
    node.scaleY(1);
    tr.nodes([node]);
    tr.getLayer()?.batchDraw();
  }, [isZoneDetailView, selectedRackKey, displayPacked, zoneLayouts, whId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const inEditable =
        tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable;

      if (e.key === 'Escape' && rackPlaceMode) {
        setRackPlaceMode(null);
        return;
      }

      // Ctrl+C — 선택 랙 크기 복사 (메모리)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        if (inEditable) return;
        if (!isZoneDetailView || !selectedPacked) return;
        e.preventDefault();
        setRackClipboard({ width: selectedPacked.dw, height: selectedPacked.dh });
        message.success(`랙 크기 복사 (${selectedPacked.dw} × ${selectedPacked.dh})`);
        return;
      }

      // Ctrl+V — 복사된 크기로 단일 배치 모드 진입 (사용자가 클릭한 곳에 동일 크기 랙 생성)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
        if (inEditable) return;
        if (!isZoneDetailView || !rackClipboard) return;
        e.preventDefault();
        form.setFieldsValue({ width: rackClipboard.width, height: rackClipboard.height });
        setRackCreateMode('single');
        setRackPlaceMode({ type: 'single' });
        message.info(`복사된 크기 적용 — 빈 곳을 클릭하면 같은 크기로 생성됩니다 (ESC 취소)`);
        return;
      }

      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!isZoneDetailView || !selectedRackKey) return;
      if (inEditable) return;
      e.preventDefault();
      void handleDeleteSelectedRack();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [
    isZoneDetailView,
    selectedRackKey,
    selectedPacked,
    handleDeleteSelectedRack,
    rackPlaceMode,
    rackClipboard,
    form,
    message,
  ]);

  const visiblePacked = useMemo(() => {
    if (selectedZoneId == null) return [];
    return displayPacked.filter((p) => p.rl.zone_id === selectedZoneId);
  }, [displayPacked, selectedZoneId]);

  useEffect(() => {
    if (!selectedRackKey) return;
    const pr = displayPacked.find((p) => p.key === selectedRackKey);
    if (!pr) {
      setSelectedRackKey(null);
      return;
    }
    if (selectedZoneId != null && pr.rl.zone_id !== selectedZoneId) {
      setSelectedRackKey(null);
    }
  }, [selectedZoneId, displayPacked, selectedRackKey]);

  const fitCurrentView = useCallback(() => {
    fitToRackEditorFocus();
  }, [fitToRackEditorFocus]);

  const zIn = () => setScale((s) => Math.min(12, s * 1.12));
  const zOut = () => setScale((s) => Math.max(0.05, s / 1.12));

  const onWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const st = e.target.getStage();
      const p = st?.getPointerPosition();
      if (!p) return;
      const delta = e.evt.deltaY > 0 ? 0.92 : 1.08;
      const ns = Math.max(0.05, Math.min(12, scale * delta));
      const wX = (p.x - stagePos.x) / scale;
      const wY = (p.y - stagePos.y) / scale;
      const nx = p.x - wX * ns;
      const ny = p.y - wY * ns;
      setStagePos({ x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 });
      setScale(ns);
    },
    [scale, stagePos.x, stagePos.y],
  );

  const onCanvasMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const btn = e.evt.button;
      if (btn === 1 || btn === 2 || (btn === 0 && spaceDownRef.current)) {
        canvasPanRef.current = {
          sx: stagePosRef.current.x,
          sy: stagePosRef.current.y,
          cx: e.evt.clientX,
          cy: e.evt.clientY,
          moved: false,
          btn,
        };
        setCanvasPanning(true);
        if (btn === 2) e.evt.preventDefault();
        return;
      }

      const st = e.target.getStage();
      const pos = st?.getPointerPosition();
      if (!pos) return;
      const wx = (pos.x - stagePos.x) / scale;
      const wy = (pos.y - stagePos.y) / scale;
      const hitPacked = [...visiblePacked].reverse().find(
        (p) => wx >= p.gx && wx <= p.gx + p.dw && wy >= p.gy && wy <= p.gy + p.dh,
      );
      if (rackPlaceMode && isZoneDetailView && selectedZl) {
        if (hitPacked) {
          message.warning('빈 공간을 클릭하세요.');
          return;
        }
        void commitPlacementAtWorld(wx, wy);
        return;
      }
      if (btn === 0 && !hitPacked) {
        canvasPanRef.current = {
          sx: stagePosRef.current.x,
          sy: stagePosRef.current.y,
          cx: e.evt.clientX,
          cy: e.evt.clientY,
          moved: false,
          btn: 0,
        };
        setCanvasPanning(true);
      }
    },
    [
      visiblePacked,
      rackPlaceMode,
      isZoneDetailView,
      selectedZl,
      message,
      commitPlacementAtWorld,
      stagePos.x,
      stagePos.y,
      scale,
    ],
  );

  const onCanvasMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (canvasPanRef.current) {
        const p = canvasPanRef.current;
        const dx = e.evt.clientX - p.cx;
        const dy = e.evt.clientY - p.cy;
        if (Math.abs(dx) + Math.abs(dy) > 2) p.moved = true;
        setStagePos({ x: p.sx + dx, y: p.sy + dy });
        return;
      }
      if (!rackPlaceMode) return;
      const st = e.target.getStage();
      const pos = st?.getPointerPosition();
      if (!pos) return;
      setPlaceGhost({
        worldX: (pos.x - stagePos.x) / scale,
        worldY: (pos.y - stagePos.y) / scale,
      });
    },
    [rackPlaceMode, stagePos.x, stagePos.y, scale],
  );

  const onCanvasMouseUp = useCallback(() => {
    const p = canvasPanRef.current;
    if (p && !p.moved && p.btn === 0) {
      setSelectedRackKey(null);
    }
    if (canvasPanRef.current) {
      canvasPanRef.current = null;
      setCanvasPanning(false);
    }
  }, []);

  const selectedRackZoneCode = useMemo(() => {
    if (!selectedPacked) return '';
    const cx = selectedPacked.gx + selectedPacked.dw / 2;
    const cy = selectedPacked.gy + selectedPacked.dh / 2;
    const hit = zoneLayouts.find((zl) => cx >= zl.pos_x && cx <= zl.pos_x + zl.width && cy >= zl.pos_y && cy <= zl.pos_y + zl.height);
    return hit ? (zoneById.get(hit.zone_id)?.code ?? '') : '';
  }, [selectedPacked, zoneLayouts, zoneById]);

  if (!whId) {
    return <div style={{ padding: 16, color: '#5a6478' }}>창고를 선택하세요.</div>;
  }

  if (loading && zones.length === 0 && zoneLayouts.length === 0) {
    return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  }

  const { Title, Text } = Typography;
  const editingZone = selectedZoneId != null ? zoneById.get(selectedZoneId) : undefined;
  const previewRackCode = selectedRack?.code ?? 'RK-AUTO';
  const previewLevels = Math.max(1, Number(levelsW) || 1);
  const previewRowNo = 1;
  const previewZone = editingZone?.code ?? (selectedRackZoneCode || 'A');
  const previewStartCode = buildLocationCode({
    zone: previewZone,
    rack: selectedRack?.code ?? previewRackCode,
    rowNo: previewRowNo,
    levelNo: 1,
  });
  const previewEndCode = buildLocationCode({
    zone: previewZone,
    rack: selectedRack?.code ?? previewRackCode,
    rowNo: previewRowNo,
    levelNo: selectedRack?.level_no ?? previewLevels,
  });
  const previewRangeLabel = formatLocationCodeRangeCompact(previewStartCode, previewEndCode);
  const hoveredPacked = hoveredRackKey ? displayPacked.find((p) => p.key === hoveredRackKey) ?? null : null;
  const hoveredRack = hoveredPacked ? rackById.get(hoveredPacked.rl.rack_id) : undefined;
  const hoveredTooltipPos = (() => {
    if (!hoveredPacked) return null;
    const left = stagePos.x + hoveredPacked.gx * scale;
    const top = stagePos.y + hoveredPacked.gy * scale;
    const w = hoveredPacked.dw * scale;
    return { left: Math.max(8, left + Math.min(w + 8, 26)), top: Math.max(8, top - 40) };
  })();

  return (
    <div
      className="rack-layout-editor-dark warehouse-editor-zone-tab-root"
      style={{
        display: 'flex',
        width: '100%',
        flex: 1,
        minHeight: 0,
        height: '100%',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#f0f3f8',
      }}
    >
      {/* ── 좌측: 랙 설정 / 선택 랙 편집 — readonly 시 숨김 ── */}
      {readonly ? null :
      <aside
        className="rack-layout-editor-dark__aside"
        style={{
          width: 260,
          flexShrink: 0,
          overflowY: 'auto',
          padding: '14px 12px',
          background: '#f1f5f9',
        }}
      >
        {selectedRack ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 10, color: '#8a94a6', letterSpacing: 0.4 }}>선택 랙</div>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace', color: '#1e2a3a' }}>
                  {selectedRackZoneCode || editingZone?.code || 'A'}-{selectedRack.code}
                </div>
              </div>
              <Button size="small" onClick={() => setSelectedRackKey(null)}>닫기</Button>
            </div>

            <Divider style={{ margin: 0 }} />

            <div>
              <div style={{ fontSize: 11, color: '#8a94a6', marginBottom: 4 }}>담당 입고처</div>
              <Select
                size="small"
                style={{ width: '100%' }}
                value={selectedRack.supplier_id ?? undefined}
                placeholder="공용 (미지정)"
                allowClear
                showSearch
                optionFilterProp="label"
                options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
                onChange={(supplierId) => {
                  const s = suppliers.find((x) => x.id === supplierId);
                  updateRack.mutate(
                    { id: selectedRack.id, data: { supplier_id: supplierId ?? null, supplier_name: s?.name ?? null } },
                    {
                      onSuccess: () => message.success('입고처 지정이 저장되었습니다'),
                      onError: (err) => {
                        const detail = (err as { response?: { data?: { error_message?: string; message?: string } } })?.response?.data?.error_message
                          ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                          ?? (err instanceof Error ? err.message : '입고처 변경에 실패했습니다.');
                        message.error({ content: detail, duration: 6 });
                      },
                    },
                  );
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#8a94a6', marginBottom: 4 }}>층수</div>
              <InputNumber
                size="small"
                style={{ width: '100%' }}
                min={1}
                value={selectedRack.level_no ?? 1}
                onChange={(v) => updateRack.mutate({ id: selectedRack.id, data: { level_no: Number(v ?? 1) } })}
              />
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#8a94a6', marginBottom: 4 }}>위치 코드 범위</div>
              <Tag style={{ fontSize: 10 }} title={`${previewStartCode} ~ ${previewEndCode}`}>
                {previewRangeLabel}
              </Tag>
            </div>

            <Divider style={{ margin: 0 }} />

            {editRl && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1e2a3a', marginBottom: 2 }}>캔버스 배치</div>
                <div style={{ fontSize: 10, color: '#8a94a6', marginBottom: 8 }}>
                  드래그·리사이즈로도 변경 가능
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <InputNumber
                    size="small"
                    addonBefore="X"
                    value={editRl.pos_x}
                    onChange={(v) => {
                      const n = Number(v ?? 0);
                      setEditRl((p) => (p ? { ...p, pos_x: n } : p));
                      scheduleSaveEditedLayout();
                    }}
                  />
                  <InputNumber
                    size="small"
                    addonBefore="Y"
                    value={editRl.pos_y}
                    onChange={(v) => {
                      const n = Number(v ?? 0);
                      setEditRl((p) => (p ? { ...p, pos_y: n } : p));
                      scheduleSaveEditedLayout();
                    }}
                  />
                  <InputNumber
                    size="small"
                    addonBefore="W"
                    min={16}
                    value={editRl.width}
                    onChange={(v) => {
                      const n = Number(v ?? 40);
                      setEditRl((p) => (p ? { ...p, width: n } : p));
                      scheduleSaveEditedLayout();
                    }}
                  />
                  <InputNumber
                    size="small"
                    addonBefore="H"
                    min={16}
                    value={editRl.height}
                    onChange={(v) => {
                      const n = Number(v ?? 40);
                      setEditRl((p) => (p ? { ...p, height: n } : p));
                      scheduleSaveEditedLayout();
                    }}
                  />
                </div>
              </div>
            )}

            <Button danger size="small" block icon={<DeleteOutlined />} onClick={() => void handleDeleteSelectedRack()}>
              랙 삭제
            </Button>
          </div>
        ) : (
        <>
        <Title level={5} className="rack-layout-editor-dark__title" style={{ margin: '0 0 14px', fontSize: 11, letterSpacing: 0.2, fontWeight: 600 }}>
          랙 생성
        </Title>
        <Form form={form} layout="vertical" size="small" requiredMark={false}>
          {fixedZoneId == null && (
            <div style={{ marginBottom: 12 }}>
              <Text className="rack-layout-editor-dark__muted" style={{ fontSize: 12 }}>작업 구역</Text>
              <Select<ZoneCanvasPickerValue>
                style={{ width: '100%', marginTop: 6 }}
                placeholder="구역을 선택하세요"
                value={selectedZoneKey ?? undefined}
                onChange={(v) => setSelectedZoneKey(v)}
                options={zones.map((z) => ({ label: `${z.code} — ${z.name}`, value: z.id }))}
              />
            </div>
          )}

          {/* ── Wizard 형태 — 한 번에 한 단계만 펼쳐짐, 다음 버튼으로 진행 ── */}
          <Collapse
            bordered={false}
            accordion
            className="wizard-collapse"
            expandIcon={({ isActive }) => (
              <RightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: 11, color: '#8a94a6' }} />
            )}
            style={{ background: 'transparent' }}
            activeKey={wizardStep}
            onChange={(k) => {
              const next = Array.isArray(k) ? k[0] : k;
              if (next) setWizardStep(next);
            }}
            items={[
              {
                key: 'mode',
                label: wizardStepLabel('mode', '생성 방식'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <Segmented
                      block
                      size="middle"
                      value={rackCreateMode}
                      onChange={(value) => setRackCreateMode(value as 'single' | 'matrix')}
                      options={
                        showRackBatchUI
                          ? [
                              { label: '신규 랙 일괄 생성', value: 'matrix' },
                              { label: '단일 랙 추가', value: 'single' },
                            ]
                          : [{ label: '단일 랙 추가', value: 'single' }]
                      }
                    />
                    <Text className="rack-layout-editor-dark__muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      {rackCreateMode === 'matrix'
                        ? '공통 랙 정보를 먼저 입력한 뒤, 일괄 배치 옵션을 정하고 캔버스의 빈 위치를 클릭해 생성합니다.'
                        : '공통 랙 정보를 먼저 입력한 뒤, 캔버스의 빈 위치를 클릭해 랙 하나를 배치합니다.'}
                    </Text>
                    <Button type="primary" block onClick={wizardGoNext}>
                      다음 →
                    </Button>
                  </Space>
                ),
              },
              {
                key: 'common',
                label: wizardStepLabel('common', '공통 랙 정보'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <Form.Item name="namePrefix" label="자동 이름 접두사" rules={[{ required: true, message: '자동 이름 접두사를 입력하세요.' }]} style={{ marginBottom: 8 }}>
                      <Input placeholder="예: 전자기기 랙" />
                    </Form.Item>
                    <Form.Item name="supplierId" label="담당 입고처" style={{ marginBottom: 8 }}>
                      <Select
                        allowClear
                        placeholder="공용"
                        options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
                        showSearch
                        optionFilterProp="label"
                      />
                    </Form.Item>
                    <Form.Item name="levels" label="층수(Level)" rules={[{ required: true, message: '층수를 입력하세요.' }]} style={{ marginBottom: 8 }}>
                      <InputNumber min={1} max={24} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      name="maxCapacity"
                      label="신규 랙 — 층당 수용량"
                      tooltip="신규 랙의 각 층(로케이션)에 동일하게 적용되는 수용량입니다. 예) 200 입력 + 4층 → 각 층마다 200 (랙 전체 한도 800). 기존 랙은 영향 없음 — 기존 랙 수용량은 랙 클릭 → 랙 레이아웃 화면에서 변경하세요."
                      rules={[
                        { required: true, message: '수용량을 입력하세요.' },
                        { type: 'number', min: 1, message: '수용량은 1 이상이어야 합니다.' },
                      ]}
                      extra="각 층(로케이션)마다 적용. 기존 랙은 랙 레이아웃에서 수정"
                      style={{ marginBottom: 8 }}
                    >
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="width" label="랙 너비(px)" rules={[{ required: true, message: '랙 너비를 입력하세요.' }]} style={{ marginBottom: 8 }}>
                      <InputNumber min={16} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="height" label="랙 높이(px)" rules={[{ required: true, message: '랙 높이를 입력하세요.' }]} style={{ marginBottom: 8 }}>
                      <InputNumber min={16} style={{ width: '100%' }} />
                    </Form.Item>
                    <Divider style={{ margin: '4px 0' }} />
                    <Form.Item name="widthMm" label="가로(mm) — 선택" style={{ marginBottom: 8 }}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="depthMm" label="세로(mm) — 선택" style={{ marginBottom: 8 }}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="heightMm" label="높이(mm) — 선택" style={{ marginBottom: 8 }}>
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="levelGuideJson" label="층별 가이드(JSON, 선택)" style={{ marginBottom: 0 }}>
                      <Input.TextArea rows={3} placeholder='예: ["1층 소형", "2층 중형"]' />
                    </Form.Item>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <Button block onClick={wizardGoPrev}>← 이전</Button>
                      <Button type="primary" block onClick={wizardGoNext}>다음 →</Button>
                    </div>
                  </Space>
                ),
              },
              ...(rackCreateMode === 'matrix'
                ? [{
                key: 'size',
                label: wizardStepLabel('size', '일괄 배치 옵션'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={10}>
                    <Form.Item name="rackCount" label="랙 수량" rules={[{ required: true, message: '랙 수량을 입력하세요.' }]} style={{ marginBottom: 8 }}>
                      <InputNumber min={1} max={24} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="gap" label="간격(px)" rules={[{ required: true, message: '간격을 입력하세요.' }]} style={{ marginBottom: 0 }}>
                      <InputNumber min={4} style={{ width: '100%' }} />
                    </Form.Item>
                    <div style={{
                      borderRadius: 6,
                      padding: '8px 10px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontSize: 12,
                      color: '#475569',
                      lineHeight: 1.5,
                    }}>
                      <div style={{ marginBottom: 2 }}>
                        총 <b style={{ color: '#0f172a' }}>{Math.max(1, Number(rackCountW) || 1)}</b>개 랙이 생성됩니다
                      </div>
                      <div style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 11,
                        color: '#64748b',
                      }}>
                        {(namePrefixW || '랙')} 01 ~ {(namePrefixW || '랙')} {String(Math.max(1, Number(rackCountW) || 1)).padStart(2, '0')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <Button block onClick={wizardGoPrev}>← 이전</Button>
                      <Button type="primary" block onClick={wizardGoNext}>다음 →</Button>
                    </div>
                  </Space>
                ),
              }] : []),
              {
                key: 'action',
                label: wizardStepLabel('action', '생성 실행'),
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size={8}>
                    <Text className="rack-layout-editor-dark__muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      구역 상세에서만 배치 모드가 열립니다. 속성을 모두 입력한 뒤, 생성 버튼을 누르고 캔버스의 빈 공간을 클릭하세요.
                    </Text>
                    {rackCreateMode === 'matrix' && showRackBatchUI ? (
                      <Button
                        type="primary"
                        className="rack-editor-btn-bulk"
                        icon={<AppstoreAddOutlined />}
                        block
                        loading={bulkSubmitting}
                        disabled={!isZoneDetailView || !selectedZl || !!rackPlaceMode}
                        onClick={() => void startMatrixPlacementMode()}
                        style={{ height: 34, borderRadius: 6 }}
                      >
                        신규 랙 일괄 생성
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        className="rack-editor-btn-single"
                        block
                        loading={bulkSubmitting}
                        disabled={!isZoneDetailView || !selectedZl || !!rackPlaceMode}
                        onClick={() => startSinglePlacementMode()}
                        style={{ height: 34, borderRadius: 6 }}
                      >
                        단일 랙 추가
                      </Button>
                    )}
                    {rackPlaceMode && (
                      <Button block danger type="dashed" onClick={() => setRackPlaceMode(null)}>
                        배치 취소 (ESC)
                      </Button>
                    )}
                    <Button block onClick={wizardGoPrev} style={{ marginTop: 4 }}>← 이전</Button>
                  </Space>
                ),
              },
            ]}
          />
        </Form>
        </>
        )}
      </aside>}

      {/* ── 우측: 캔버스 ── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#f0f3f8', position: 'relative' }}>
        <div
          className="rack-layout-editor-dark__toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 4,
            minHeight: 40,
            padding: '0 12px',
            boxSizing: 'border-box',
          }}
        >
          {onBack && (
            <Button
              size="small"
              className="warehouse-editor-control-btn"
              icon={<ArrowLeftOutlined />}
              onClick={onBack}
            >
              창고 전체
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 200 }}>
            <Text style={{ fontSize: 12, fontWeight: 500, color: '#3a4256' }}>
              {warehouseDetail?.name ?? '창고'}
              <span style={{ color: '#b0b8c8', margin: '0 6px' }}>·</span>
              {isZoneDetailView && editingZone ? `${editingZone.code} ${editingZone.name}` : '구역 미선택'}
            </Text>
          </div>
          {isZoneDetailView && (
            <>
              <Button size="small" icon={<UndoOutlined />} onClick={() => void handleRackLayoutUndo()} title="랙 배치 실행 취소" style={{ width: 28, height: 28, padding: 0 }} />
              <Button size="small" icon={<RedoOutlined />} onClick={() => void handleRackLayoutRedo()} title="랙 배치 다시 실행" style={{ width: 28, height: 28, padding: 0 }} />
              <Button
                size="small"
                icon={<AppstoreOutlined />}
                onClick={() => void handleAutoArrangeRacks()}
                title="현재 구역의 랙들을 격자로 자동 정렬 (좌표 깨졌을 때 복구용)"
                style={{ width: 28, height: 28, padding: 0 }}
              />
              {(selectedZl?.rotation ?? 0) !== 0 && (
                <Button
                  size="small"
                  type={zoneViewUpright ? 'primary' : 'default'}
                  onClick={() => setZoneViewUpright((v) => !v)}
                  title={zoneViewUpright
                    ? '정방향 보기 ON — 작업하기 편하도록 회전을 임시로 펼침. 클릭하면 실제 회전 모습으로 전환'
                    : '회전 적용 보기 — 클릭하면 정방향(작업용)으로 복귀'}
                  style={{ height: 28, padding: '0 8px' }}
                >
                  {zoneViewUpright ? '정방향' : '회전'}
                </Button>
              )}
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!selectedRackKey}
                onClick={() => void handleDeleteSelectedRack()}
                title="선택 랙 삭제"
                style={{ width: 28, height: 28, padding: 0 }}
              />
            </>
          )}
          <Button size="small" icon={<ZoomInOutlined />} onClick={zIn} disabled={!hasCanvasSelection} style={{ width: 28, height: 28, padding: 0 }} />
          <Button size="small" icon={<ZoomOutOutlined />} onClick={zOut} disabled={!hasCanvasSelection} style={{ width: 28, height: 28, padding: 0 }} />
          <Button size="small" className="warehouse-editor-control-btn warehouse-editor-control-btn--accent" icon={<ExpandOutlined />} onClick={fitCurrentView} disabled={!hasCanvasSelection}>
            화면에 맞춤
          </Button>
        </div>
        <div
          ref={containerRef}
          className="rack-layout-editor-dark__canvas-shell warehouse-editor-canvas-host"
          onMouseEnter={() => { editorPointerInsideRef.current = true; }}
          onMouseLeave={() => { editorPointerInsideRef.current = false; }}
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            cursor: rackPlaceMode
              ? 'crosshair'
              : canvasPanning
                ? 'grabbing'
                : spacePanArm
                  ? 'grab'
                  : hasCanvasSelection
                    ? 'grab'
                    : undefined,
          }}
        >
          {!hasCanvasSelection ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: CANVAS_BG,
                padding: 24,
              }}
            >
              <Text style={{ fontSize: 15, color: '#5a6478', textAlign: 'center' }}>
                편집할 구역을 선택해주세요
              </Text>
            </div>
          ) : (
            <Stage
              width={cSize.width}
              height={cSize.height}
              onMouseMove={onCanvasMouseMove}
              onMouseLeave={() => { setPlaceGhost(null); setHoveredRackKey(null); }}
              onMouseDown={onCanvasMouseDown}
              onMouseUp={onCanvasMouseUp}
              onWheel={onWheel}
              onContextMenu={(e) => e.evt.preventDefault()}
            >
              <Layer listening={false}>
                <EditorInfiniteGridScreen
                  width={cSize.width}
                  height={cSize.height}
                  panX={stagePos.x}
                  panY={stagePos.y}
                  scale={scale}
                  majorWorld={CAD_MAJOR_WORLD}
                  minorWorld={0}
                  background={EDITOR_CANVAS_BG}
                />
              </Layer>
              <Layer>
                <Group x={stagePos.x} y={stagePos.y} scaleX={scale} scaleY={scale}>
                  <Rect name="world-hit-shell" width={worldW} height={worldH} fill="rgba(0,0,0,0.001)" listening />
                  {/* 구역 경계 + 안의 랙들 — 모두 같은 rotated Group 안에서 zone 회전을 따라가게 */}
                  {isZoneDetailView && selectedZl && (
                    <Group
                      x={selectedZl.pos_x}
                      y={selectedZl.pos_y}
                      rotation={zoneViewUpright ? 0 : (selectedZl.rotation ?? 0)}
                    >
                      <Rect
                        x={0}
                        y={0}
                        width={selectedZl.width}
                        height={selectedZl.height}
                        fill="rgba(232, 241, 251, 0.62)"
                        stroke="rgba(55, 138, 221, 0.72)"
                        strokeWidth={2}
                        dash={[12, 6]}
                        cornerRadius={8}
                        listening={false}
                        shadowColor="rgba(55, 138, 221, 0.18)"
                        shadowBlur={18}
                        shadowOpacity={1}
                      />
                      {editingZone && (
                        <KonvaText
                          text={`${editingZone.code} · ${editingZone.name} (${selectedZl.width} × ${selectedZl.height})`}
                          x={12}
                          y={10}
                          fontSize={14}
                          fontStyle="bold"
                          fill="#5a6478"
                          listening={false}
                        />
                      )}
                      {visiblePacked.map((pr) => {
                        const sel = pr.key === selectedRackKey;
                        const rack = rackById.get(pr.rl.rack_id);
                        const stock = stockByRackId.get(pr.rl.rack_id);
                        // world 좌표(gx,gy) 를 zone 로컬 좌표로 변환 — rotated parent 안에서 위치는 로컬 기준
                        const localPr = { ...pr, gx: pr.gx - selectedZl.pos_x, gy: pr.gy - selectedZl.pos_y };
                        return (
                          <DarkRackGroup
                            key={pr.key}
                            pr={localPr}
                            rack={rack}
                            selected={sel || !!(highlightRackIds?.has(pr.rl.rack_id) && rackPulse % 2 === 0)}
                            stock={stock}
                            listening={!spacePanArm}
                            draggable={!spacePanArm && !readonly}
                            onDragEnd={readonly ? undefined : (e) => void handleRackDragEnd(e, pr.rl.rack_id)}
                            onSelect={() => { if (!readonly) setSelectedRackKey(pr.key); }}
                            onDoubleClick={() => onRackDrillDown?.(pr.rl.rack_id)}
                            onHover={() => setHoveredRackKey(pr.key)}
                            onLeave={() => setHoveredRackKey((prev) => (prev === pr.key ? null : prev))}
                            rackOpacity={highlightRackIds && highlightRackIds.size > 0 && !highlightRackIds.has(pr.rl.rack_id) ? 0.3 : 1}
                            showUtilization={showUtilization}
                            utilizationPct={utilizationByRackId.get(pr.rl.rack_id) ?? 0}
                          />
                        );
                      })}
                      {ghostPreview && (
                        <>
                          {ghostPreview.worldCells.map((cell, i) => (
                            <Rect
                              key={`gh-${i}`}
                              x={cell.wx - selectedZl.pos_x}
                              y={cell.wy - selectedZl.pos_y}
                              width={ghostPreview.w}
                              height={ghostPreview.h}
                              fill={ghostPreview.valid ? 'rgba(239, 159, 39, 0.15)' : 'rgba(239, 68, 68, 0.12)'}
                              stroke={ghostPreview.valid ? 'rgba(239, 159, 39, 0.55)' : 'rgba(239, 68, 68, 0.55)'}
                              strokeWidth={2}
                              cornerRadius={6}
                              listening={false}
                            />
                          ))}
                        </>
                      )}
                      {/* selection rect + Transformer 는 zone Group 안에 둬야 zone 회전을 따라감 (잔상 방지) */}
                      {selectedRackKey && (
                        <>
                          <Rect
                            ref={rackEditRectRef}
                            fill="rgba(0,0,0,0)"
                            stroke={SEL_STROKE}
                            strokeWidth={2}
                            listening={false}
                            onTransformEnd={() => void applyPackedRectToSelectedRack()}
                          />
                          <Transformer
                            ref={rackTrRef}
                            rotateEnabled
                            rotationSnaps={Array.from({ length: 24 }, (_, i) => i * 15)}
                            borderStroke={SEL_STROKE}
                            anchorFill="#EF9F27"
                            anchorStroke={SEL_STROKE}
                            boundBoxFunc={(_oldBox, newBox) => ({
                              ...newBox,
                              x: snapToEditorGrid(newBox.x),
                              y: snapToEditorGrid(newBox.y),
                              width: Math.max(16, snapToEditorGrid(newBox.width)),
                              height: Math.max(16, snapToEditorGrid(newBox.height)),
                            })}
                          />
                        </>
                      )}
                    </Group>
                  )}
                </Group>
              </Layer>
            </Stage>
          )}

          {hoveredRack && hoveredTooltipPos && (() => {
            const hStock = hoveredPacked ? stockByRackId.get(hoveredPacked.rl.rack_id) : undefined;
            return (
              <div
                style={{
                  position: 'absolute',
                  left: hoveredTooltipPos.left,
                  top: hoveredTooltipPos.top,
                  zIndex: 11,
                  background: '#ffffff',
                  border: '1px solid #e0e0e0',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  pointerEvents: 'none',
                  fontSize: 12,
                  color: '#1e2a3a',
                  minWidth: 160,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {hoveredRack.code ? `#${hoveredRack.code.split('-').slice(-2).join('-')}` : '-'}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontFamily: 'ui-monospace, Menlo, monospace' }} title={hoveredRack.code}>
                  {hoveredRack.code}
                </div>
                {readonly && hStock ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#64748b' }}>
                    <span>{hoveredRack.level_no ?? '-'}층 · 가용 <b style={{ color: '#1677ff' }}>{hStock.available_qty.toLocaleString()}</b></span>
                    {hStock.reserved_qty > 0 && <span>예약 <b style={{ color: '#faad14' }}>{hStock.reserved_qty.toLocaleString()}</b></span>}
                    <span>총 <b style={{ color: '#1e2a3a' }}>{hStock.total_qty.toLocaleString()}</b></span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {hoveredRack.supplier_name ? <span>{hoveredRack.supplier_name} · </span> : <span>공통 · </span>}
                    전체 {hoveredRack.level_no ?? '-'}층
                  </div>
                )}
              </div>
            );
          })()}

          <div
            className="rack-layout-editor-dark__footer"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              minHeight: 28,
              maxHeight: 28,
              padding: '4px 10px',
              borderTop: '1px solid #d0d5de',
              background: '#e8ecf2',
              fontSize: 11,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '6px 12px',
              justifyContent: 'space-between',
              pointerEvents: 'none',
            }}
          >
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, color: '#5a6478' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: SLOT_FILL.stock, border: '1px solid #d0d5de' }} />
                재고 있음
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: SLOT_FILL.work, border: '1px solid #d0d5de' }} />
                작업 중
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: SLOT_FILL.empty, border: '1px solid #d0d5de' }} />
                빈 공간
              </span>
              <span style={{ opacity: 0.85 }}>
                {isZoneDetailView ? `· 이 구역 랙 ${visiblePacked.length}개 · 스냅 ${EDITOR_SNAP_PX}px` : ''}
              </span>
            </span>
            <span style={{ color: '#5a6478' }}>{hasCanvasSelection ? `줌 ${Math.round(scale * 100)}%` : ''}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
