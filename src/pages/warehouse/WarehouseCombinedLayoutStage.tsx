import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Drawer, Typography, Space, Input, Spin, Progress, Modal, InputNumber, Form } from 'antd';
import { Stage, Layer, Rect, Group, Text as KonvaText } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ZoneLayout, Rack, RackLayout, RackStock, ZoneType } from '@/types/warehouse';
import {
  useZonesByWarehouse,
  useZoneLayouts,
  useWarehouseCanvas,
  useRacks,
  useRackLayoutsByWarehouse,
} from '@/hooks/useWarehouseQuery';
import { useContainerSize } from '@/hooks/useContainerSize';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import RackDetailView from './RackDetailView';
import {
  EDITOR_CANVAS_BG,
  EDITOR_ZONE_FILL,
  EDITOR_ZONE_BORDER,
  EDITOR_ZONE_STROKE_PX,
  CAD_MAJOR_WORLD,
  EDITOR_FIT_CONTENT_RATIO,
  fitWorldBoundsToViewport,
  type WorldContentBounds,
} from '@/pages/warehouse/warehouseEditorCanvasShared';
import { EditorInfiniteGridScreen } from '@/pages/warehouse/EditorInfiniteGridScreen';
import {
  DarkRackKonvaView,
  SLOT_FILL,
} from '@/pages/warehouse/DarkRackKonvaShared';
import { filterRackLayoutsForActiveMaster, packRacksIntoZonesDisplay } from '@/utils/zoneRackLayout';

const { Text } = Typography;


type StageMode = 'readonly' | 'monitoring' | 'preview';

export interface WarehouseCombinedLayoutStageProps {
  warehouseId: string;
  mode: StageMode;
}

interface PlacedRack {
  key: string;
  rl: RackLayout;
  gx: number;
  gy: number;
  /** 구역 내 패킹·스케일 적용 후 표시 크기 */
  dw: number;
  dh: number;
  rack: Rack | undefined;
  code: string;
}

function rackUsedAndCapacity(
  rackGroup: NonNullable<ReturnType<typeof useInventoryByRack>['data']>['racks'][number] | undefined,
  fallbackCapacity?: number,
): { usedQty: number; maxCapacity: number } {
  const usedQty = rackGroup?.locations?.reduce((sum, loc) => sum + (loc.total_qty ?? 0), 0) ?? 0;
  const locationCapacity = rackGroup?.locations?.reduce((sum, loc) => {
    const cap = loc.max_capacity ?? 0;
    return cap > 0 ? sum + cap : sum;
  }, 0) ?? 0;
  const maxCapacity = locationCapacity > 0 ? locationCapacity : Math.max(1, fallbackCapacity ?? 200);
  return { usedQty, maxCapacity };
}

function buildPlacedRacks(
  geometries: ReturnType<typeof packRacksIntoZonesDisplay>,
  rackById: Map<string, Rack>,
): PlacedRack[] {
  return geometries.map((g) => {
    const rack = rackById.get(g.rl.rack_id);
    const code = rack?.code ?? '';
    return {
      key: g.key,
      rl: g.rl,
      gx: g.gx,
      gy: g.gy,
      dw: g.dw,
      dh: g.dh,
      rack,
      code,
    };
  });
}

function zoneLayoutRenderKey(zl: ZoneLayout, index: number): string {
  return zl.id || `${zl.zone_id}-${zl.pos_x}-${zl.pos_y}-${zl.width}-${zl.height}-${index}`;
}

function warehouseContentBounds(
  warehouseId: string,
  canvasW: number,
  canvasH: number,
  zoneLayouts: ZoneLayout[],
  racks: PlacedRack[],
): WorldContentBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  };
  for (const zl of zoneLayouts) {
    if (zl.warehouse_id !== warehouseId) continue;
    add(zl.pos_x, zl.pos_y, zl.pos_x + zl.width, zl.pos_y + zl.height);
  }
  for (const pr of racks) {
    add(pr.gx, pr.gy, pr.gx + pr.dw, pr.gy + pr.dh);
  }
  if (!Number.isFinite(minX) || maxX - minX < 4 || maxY - minY < 4) {
    return { minX: 0, minY: 0, maxX: Math.max(400, canvasW), maxY: Math.max(300, canvasH) };
  }
  return { minX, minY, maxX, maxY };
}

type RackTooltipState =
  | {
      kind: 'layout';
      clientX: number;
      clientY: number;
      code: string;
      maxCapacity: number;
      totalQty?: number;
    }
  | {
      kind: 'monitoring';
      clientX: number;
      clientY: number;
      code: string;
      utilizationPct: number;
      usedQty: number;
      maxCapacity: number;
    };

export default function WarehouseCombinedLayoutStage({ warehouseId, mode }: WarehouseCombinedLayoutStageProps) {
  const [view, setView] = useState({ scale: 1, ox: 0, oy: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const canvasPanRef = useRef<{ ox: number; oy: number; cx: number; cy: number; moved: boolean } | null>(null);
  const didCanvasPanMoveRef = useRef(false);
  const [canvasPanning, setCanvasPanning] = useState(false);
  const spaceDownRef = useRef(false);
  const [spacePanArm, setSpacePanArm] = useState(false);
  const editorPointerInsideRef = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rackDetail, setRackDetail] = useState<{ code: string; label: string; rackId: string } | null>(null);
  const [rackTooltip, setRackTooltip] = useState<RackTooltipState | null>(null);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const { data: canvas, isLoading: canvasLoading } = useWarehouseCanvas(warehouseId);
  const { data: zonesAll = [], isLoading: zLoading } = useZonesByWarehouse(warehouseId);
  const { data: zoneLayouts = [], isLoading: zlLoading } = useZoneLayouts(warehouseId);
  const { data: racksAll = [], isLoading: rLoading } = useRacks({ warehouseId });
  const { data: rackLayouts = [], isLoading: rlLoading } = useRackLayoutsByWarehouse(warehouseId);
  // 랙 클릭 시 Drawer 에 층별 재고 상세를 보여주기 위해 monitoring·readonly 에서만 로드.
  // preview 모드는 순수 레이아웃 뷰라 재고 데이터 불필요 → 호출 안 함.
  const { data: inventoryByRack, isLoading: inventoryLoading } = useInventoryByRack(
    mode === 'preview' ? null : warehouseId || null,
  );
  const zones = useMemo(() => zonesAll.filter((z) => z.is_active !== false), [zonesAll]);
  const racks = useMemo(() => racksAll.filter((r) => r.is_active !== false), [racksAll]);
  const activeZoneIds = useMemo(() => new Set(zones.map((z) => z.id)), [zones]);
  const activeZoneLayouts = useMemo(
    () => zoneLayouts.filter((zl) => zl.warehouse_id === warehouseId && activeZoneIds.has(zl.zone_id)),
    [zoneLayouts, warehouseId, activeZoneIds],
  );
  const inventoryByRackIdMap = useMemo(() => {
    const m = new Map<string, NonNullable<typeof inventoryByRack>['racks'][number]>();
    (inventoryByRack?.racks ?? []).forEach((r) => m.set(r.rack_id, r));
    return m;
  }, [inventoryByRack]);
  const { containerRef, size: cSize } = useContainerSize({ useBoundingRectHeight: true });

  const cW = canvas?.canvas_width ?? 1000;
  const cH = canvas?.canvas_height ?? 700;

  /**
   * 슬롯 렌더·툴팁용 요약 재고(RackStock 형태)
   * by-rack 실 API 데이터를 rack_id 기준으로 RackStock 모양에 맞춰 파생한다.
   */
  const stockSummaryByRackId = useMemo(() => {
    const m = new Map<string, RackStock>();
    (inventoryByRack?.racks ?? []).forEach((r) => {
      // 층별 상품을 합산 + 대표 상품명 결정
      let available = 0;
      let reserved = 0;
      let total = 0;
      const productNames: string[] = [];
      const skus: string[] = [];
      r.locations.forEach((loc) => {
        available += loc.available_qty;
        reserved += loc.reserved_qty;
        total += loc.total_qty;
        if (loc.product_name) productNames.push(loc.product_name);
        if (loc.product_sku) skus.push(loc.product_sku);
      });
      const uniqNames = [...new Set(productNames)];
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

  const rackById = useMemo(() => {
    const m = new Map<string, Rack>();
    racks.forEach((r) => m.set(r.id, r));
    return m;
  }, [racks]);

  const rackUtilizationPct = useCallback((pr: PlacedRack) => {
    const group = inventoryByRackIdMap.get(pr.rl.rack_id);
    const { usedQty: used, maxCapacity: cap } = rackUsedAndCapacity(group, pr.rack?.max_capacity);
    return Math.min(100, Math.round((used / cap) * 100));
  }, [inventoryByRackIdMap]);

  const rackLayoutsForDisplay = useMemo(
    () => filterRackLayoutsForActiveMaster(rackLayouts, racks),
    [rackLayouts, racks],
  );

  const rackGeometries = useMemo(
    () => packRacksIntoZonesDisplay(rackLayoutsForDisplay, activeZoneLayouts, warehouseId),
    [rackLayoutsForDisplay, activeZoneLayouts, warehouseId],
  );

  const placedRacks = useMemo(
    () => buildPlacedRacks(rackGeometries, rackById),
    [rackGeometries, rackById],
  );

  const overallWarehouseUtil = useMemo(() => {
    let sumCap = 0;
    let sumUsed = 0;
    for (const pr of placedRacks) {
      const group = inventoryByRackIdMap.get(pr.rl.rack_id);
      const { usedQty: used, maxCapacity: cap } = rackUsedAndCapacity(group, pr.rack?.max_capacity);
      sumCap += cap;
      sumUsed += used;
    }
    return sumCap > 0 ? Math.min(100, Math.round((sumUsed / sumCap) * 100)) : 0;
  }, [placedRacks, inventoryByRackIdMap]);

  /** 캔버스 위 HTML — 랙과 겹치지 않게 상단에만 표시 */
  const zoneLegendItems = useMemo(() => {
    return activeZoneLayouts
      .map((zl, index) => {
        const z = zones.find((zz) => zz.id === zl.zone_id);
        const name = z?.name?.trim() ?? `구역 #${zl.zone_id}`;
        const code = z?.code?.trim();
        return {
          key: zoneLayoutRenderKey(zl, index),
          label: code ? `${name} (${code})` : name,
          zt: (z?.zone_type ?? 'STORAGE') as ZoneType,
        };
      });
  }, [activeZoneLayouts, zones]);

  const pushRackTooltip = useCallback(
    (e: KonvaEventObject<MouseEvent>, pr: PlacedRack, agg: RackStock | undefined) => {
      const stage = e.target.getStage();
      const pos = stage?.getPointerPosition();
      const container = stage?.container();
      if (!pos || !container) return;
      const rect = container.getBoundingClientRect();
      const code = pr.code || `R${pr.rl.rack_id}`;
      const cx = rect.left + pos.x;
      const cy = rect.top + pos.y;
      if (mode === 'readonly') {
        const group = inventoryByRackIdMap.get(pr.rl.rack_id);
        const { maxCapacity } = rackUsedAndCapacity(group, pr.rack?.max_capacity);
        setRackTooltip({
          kind: 'layout',
          clientX: cx,
          clientY: cy,
          code,
          maxCapacity,
          totalQty: agg?.total_qty,
        });
        return;
      }
      const group = inventoryByRackIdMap.get(pr.rl.rack_id);
      const { usedQty: used, maxCapacity: cap } = rackUsedAndCapacity(group, pr.rack?.max_capacity);
      const utilizationPct = Math.min(100, Math.round((used / cap) * 100));
      setRackTooltip({
        kind: 'monitoring',
        clientX: cx,
        clientY: cy,
        code,
        utilizationPct,
        usedQty: used,
        maxCapacity: cap,
      });
    },
    [inventoryByRackIdMap, mode],
  );

  const contentBounds = useMemo(
    () => warehouseContentBounds(warehouseId, cW, cH, activeZoneLayouts, placedRacks),
    [warehouseId, cW, cH, activeZoneLayouts, placedRacks],
  );

  const { worldW, worldH } = useMemo(() => {
    const maxR = Math.max(contentBounds.maxX + 200, cW * 1.1, 640);
    const maxB = Math.max(contentBounds.maxY + 200, cH * 1.1, 480);
    return { worldW: Math.ceil(maxR), worldH: Math.ceil(maxB) };
  }, [contentBounds, cW, cH]);

  useEffect(() => {
    if (canvasLoading || zLoading || zlLoading || rLoading || rlLoading) return;
    if (cSize.width < 80 || cSize.height < 80) return;
    const id = requestAnimationFrame(() => {
      setView(
        fitWorldBoundsToViewport(cSize.width, cSize.height, contentBounds, {
          maxScale: 8,
          contentRatio: EDITOR_FIT_CONTENT_RATIO,
          paddingWorld: 4,
        }),
      );
    });
    return () => cancelAnimationFrame(id);
  }, [
    canvasLoading,
    zLoading,
    zlLoading,
    rLoading,
    rlLoading,
    cSize.width,
    cSize.height,
    contentBounds,
    warehouseId,
    mode,
  ]);

  const onWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const st = e.target.getStage();
    const pos = st?.getPointerPosition();
    if (!pos) return;
    const delta = e.evt.deltaY > 0 ? 0.9 : 1.1;
    setView((v) => {
      const wX = (pos.x - v.ox) / v.scale;
      const wY = (pos.y - v.oy) / v.scale;
      const ns = Math.max(0.05, Math.min(8, v.scale * delta));
      return { scale: ns, ox: pos.x - wX * ns, oy: pos.y - wY * ns };
    });
  }, []);

  useEffect(() => {
    const clear = () => {
      canvasPanRef.current = null;
      setCanvasPanning(false);
    };
    window.addEventListener('mouseup', clear);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('mouseup', clear);
      window.removeEventListener('blur', clear);
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

  const onCanvasMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    const btn = e.evt.button;
    const stage = e.target.getStage();
    const isBlankCanvasTarget = e.target === stage || e.target.name() === 'world-hit-shell';
    if (btn === 1 || btn === 2 || (btn === 0 && (spaceDownRef.current || isBlankCanvasTarget))) {
      const v = viewRef.current;
      didCanvasPanMoveRef.current = false;
      canvasPanRef.current = {
        ox: v.ox,
        oy: v.oy,
        cx: e.evt.clientX,
        cy: e.evt.clientY,
        moved: false,
      };
      setCanvasPanning(true);
      if (btn === 2) e.evt.preventDefault();
    }
  }, []);

  const onCanvasMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (!canvasPanRef.current) return;
    const p = canvasPanRef.current;
    const dx = e.evt.clientX - p.cx;
    const dy = e.evt.clientY - p.cy;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      p.moved = true;
      didCanvasPanMoveRef.current = true;
    }
    setView((prev) => ({ ...prev, ox: p.ox + dx, oy: p.oy + dy }));
  }, []);

  const onCanvasMouseUp = useCallback(() => {
    canvasPanRef.current = null;
    setCanvasPanning(false);
  }, []);

  const [rackDrawerMeta, setRackDrawerMeta] = useState<{
    maxCapacity: number;
    utilizationPct: number;
  } | null>(null);

  // preview mode 전용 — 위치/크기 빠른 편집 모달
  const [previewEditRack, setPreviewEditRack] = useState<{
    rackId: string;
    zoneId: string;
    code: string;
    posX: number;
    posY: number;
    width: number;
    height: number;
    rotation: number;
  } | null>(null);
  const openRackDetail = (pr: PlacedRack) => {
    if (mode === 'preview') {
      setPreviewEditRack({
        rackId: pr.rl.rack_id,
        zoneId: pr.rl.zone_id,
        code: pr.code || `R-${pr.rl.rack_id}`,
        posX: pr.rl.pos_x,
        posY: pr.rl.pos_y,
        width: pr.rl.width,
        height: pr.rl.height,
        rotation: pr.rl.rotation ?? 0,
      });
      return;
    }
    const code = pr.code || `R-${pr.rl.rack_id}`;
    const { maxCapacity: cap } = rackUsedAndCapacity(inventoryByRackIdMap.get(pr.rl.rack_id), pr.rack?.max_capacity);
    const u = rackUtilizationPct(pr);
    setRackDetail({ code, label: pr.rack?.name ?? pr.code ?? `랙 #${pr.rl.rack_id}`, rackId: pr.rl.rack_id });
    setRackDrawerMeta({ maxCapacity: cap, utilizationPct: u });
    setDrawerOpen(true);
  };

  const loading = canvasLoading || zLoading || zlLoading || rLoading || rlLoading;

  return (
    <div
      className="rack-layout-editor-dark warehouse-editor-zone-tab-root"
      style={{ display: 'flex', gap: 0, borderRadius: 12, overflow: 'hidden', background: '#1e1e1e', flex: 1, minHeight: 0, height: '100%', width: '100%' }}
    >
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#f0f3f8' }}>
      {loading ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin />
        </div>
      ) : (
        <div
          className="warehouse-editor-canvas-host rack-layout-editor-dark__canvas-shell"
          style={{
            flex: 1,
            minHeight: 0,
            border: 'none',
            borderRadius: 0,
            background: EDITOR_CANVAS_BG,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
        >
          {(zoneLegendItems.length > 0 || mode === 'monitoring') && (
            <div
              style={{
                flexShrink: 0,
                height: 36,
                padding: '0 12px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px 14px',
                alignItems: 'center',
                background: '#e8ecf2',
                borderBottom: '1px solid #d0d5de',
              }}
            >
              {zoneLegendItems.map((item) => (
                <span
                  key={item.key}
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#3a4256',
                    paddingLeft: 10,
                    borderLeft: `2px solid ${EDITOR_ZONE_BORDER[item.zt]}`,
                  }}
                >
                  {item.label}
                </span>
              ))}
              {mode === 'monitoring' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginLeft: zoneLegendItems.length ? 'auto' : 0,
                    flex: zoneLegendItems.length ? '1 1 200px' : '1 1 auto',
                    justifyContent: zoneLegendItems.length ? 'flex-end' : 'flex-start',
                    minWidth: 200,
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#5a6478', whiteSpace: 'nowrap' }}>전체 적재율</Text>
                  <Progress
                    percent={overallWarehouseUtil}
                    size="small"
                    showInfo={false}
                    strokeColor={{ '0%': '#6b7280', '45%': '#3b82f6', '100%': '#f97316' }}
                    style={{ flex: 1, maxWidth: 140, margin: 0 }}
                  />
                  <Text strong style={{ fontSize: 13, color: '#1e2a3a', minWidth: 40 }}>
                    {overallWarehouseUtil}%
                  </Text>
                </div>
              )}
            </div>
          )}
          {rackTooltip && rackTooltip.kind === 'layout' && (
            <div
              style={{
                position: 'fixed',
                left: Math.min(rackTooltip.clientX + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 220),
                top: rackTooltip.clientY + 14,
                zIndex: 2000,
                minWidth: 200,
                padding: '10px 14px',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid #c8cdd6',
                boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e2a3a' }}>{rackTooltip.code}</div>
              <div style={{ fontSize: 11, color: '#5a6478', marginTop: 6, lineHeight: 1.45 }}>
                슬롯: 연한 그레이=빈칸 · 그린=작업 중 · 블루=재고 있음
              </div>
              <div style={{ fontSize: 15, color: '#EF9F27', marginTop: 8, fontWeight: 700 }}>
                수용(Capa) {rackTooltip.maxCapacity.toLocaleString()}
              </div>
              {rackTooltip.totalQty != null && rackTooltip.totalQty > 0 && (
                <div style={{ fontSize: 12, color: '#5a6478', marginTop: 6 }}>
                  재고 합계 {rackTooltip.totalQty.toLocaleString()} ea
                </div>
              )}
            </div>
          )}
          {rackTooltip && rackTooltip.kind === 'monitoring' && (
            <div
              style={{
                position: 'fixed',
                left: Math.min(rackTooltip.clientX + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 268),
                top: rackTooltip.clientY + 14,
                zIndex: 2000,
                width: 254,
                padding: '12px 14px',
                borderRadius: 10,
                background: '#ffffff',
                border: '1px solid #c8cdd6',
                boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1e2a3a' }}>{rackTooltip.code}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#EF9F27', marginTop: 8 }}>
                적재 {rackTooltip.utilizationPct}%
              </div>
              <div style={{ fontSize: 11, color: '#5a6478', marginTop: 4 }}>
                적재 {rackTooltip.usedQty.toLocaleString()} / Capa {rackTooltip.maxCapacity.toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 9, color: '#8a94a6', flexWrap: 'wrap' }}>
                <span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SLOT_FILL.empty, marginRight: 4, verticalAlign: 'middle' }} />
                  빈칸
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SLOT_FILL.work, marginRight: 4, verticalAlign: 'middle' }} />
                  작업
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: SLOT_FILL.stock, marginRight: 4, verticalAlign: 'middle' }} />
                  적치
                </span>
              </div>
            </div>
          )}
          <div
            ref={containerRef}
            onMouseEnter={() => { editorPointerInsideRef.current = true; }}
            onMouseLeave={() => { editorPointerInsideRef.current = false; }}
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              cursor: canvasPanning ? 'grabbing' : spacePanArm ? 'grab' : 'grab',
            }}
          >
          <Stage
            width={cSize.width}
            height={Math.max(120, cSize.height)}
            onWheel={onWheel}
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseUp={onCanvasMouseUp}
            onContextMenu={(e) => e.evt.preventDefault()}
          >
            <Layer listening={false}>
              <EditorInfiniteGridScreen
                width={cSize.width}
                height={Math.max(120, cSize.height)}
                panX={view.ox}
                panY={view.oy}
                scale={view.scale}
                majorWorld={CAD_MAJOR_WORLD}
                minorWorld={0}
              />
            </Layer>
            <Layer>
              <Group x={view.ox} y={view.oy} scaleX={view.scale} scaleY={view.scale}>
                <Rect
                  name="world-hit-shell"
                  width={worldW}
                  height={worldH}
                  fill="rgba(0,0,0,0.001)"
                  listening
                  onMouseDown={(e) => {
                    if (e.evt.button !== 0 || spaceDownRef.current) return;
                    didCanvasPanMoveRef.current = false;
                    const v = viewRef.current;
                    canvasPanRef.current = {
                      ox: v.ox,
                      oy: v.oy,
                      cx: e.evt.clientX,
                      cy: e.evt.clientY,
                      moved: false,
                    };
                    setCanvasPanning(true);
                  }}
                  onClick={() => {
                    if (didCanvasPanMoveRef.current) return;
                    setRackTooltip(null);
                  }}
                />
                {activeZoneLayouts
                  .map((zl, index) => {
                    const zone = zones.find((z) => z.id === zl.zone_id);
                    const zt: ZoneType = zone?.zone_type ?? 'STORAGE';
                    const categoryMajor = String(zone?.category_major ?? '');
                    const isAppliance = categoryMajor.includes('가전');
                    const code = zone?.code?.trim() ?? '';
                    const title = code ? `${code}` : `Z${zl.zone_id}`;
                    const sub = zone?.name?.trim() ?? '';
                    const isHovered = hoveredZoneId === zl.zone_id;
                    const baseFill = zt === 'STORAGE' ? (isAppliance ? '#ece2fa' : '#dce6f5') : EDITOR_ZONE_FILL[zt];
                    const baseStroke = zt === 'STORAGE' ? (isAppliance ? '#bfa8e6' : '#a8bcd8') : EDITOR_ZONE_BORDER[zt];
                    const titleFill = '#1e2a3a';
                    const subFill = '#7a8a9a';
                    const renderKey = zoneLayoutRenderKey(zl, index);
                    return (
                      <Group key={renderKey} x={zl.pos_x} y={zl.pos_y} rotation={zl.rotation ?? 0}>
                        <Rect
                          x={0}
                          y={0}
                          width={zl.width}
                          height={zl.height}
                          fill={baseFill}
                          stroke={isHovered ? '#EF9F27' : baseStroke}
                          strokeWidth={isHovered ? 2 : EDITOR_ZONE_STROKE_PX}
                          cornerRadius={8}
                          listening
                          onMouseEnter={() => setHoveredZoneId(zl.zone_id)}
                          onMouseLeave={() => setHoveredZoneId((prev) => (prev === zl.zone_id ? null : prev))}
                        />
                        <KonvaText
                          text={title}
                          x={18}
                          y={14}
                          width={Math.max(56, zl.width - 36)}
                          fontSize={20}
                          fontStyle="bold"
                          fontFamily="'IBM Plex Sans', 'Pretendard', ui-sans-serif, system-ui, sans-serif"
                          fill={titleFill}
                          listening
                          onMouseEnter={() => setHoveredZoneId(zl.zone_id)}
                          onMouseLeave={() => setHoveredZoneId((prev) => (prev === zl.zone_id ? null : prev))}
                        />
                        {sub ? (
                          <KonvaText
                            text={sub}
                            x={18}
                            y={36}
                            width={Math.max(56, zl.width - 36)}
                            fontSize={12}
                            fontStyle="normal"
                            fontFamily="'IBM Plex Sans', 'Pretendard', ui-sans-serif, system-ui, sans-serif"
                            fill={subFill}
                            ellipsis
                            listening
                          onMouseEnter={() => setHoveredZoneId(zl.zone_id)}
                          onMouseLeave={() => setHoveredZoneId((prev) => (prev === zl.zone_id ? null : prev))}
                          />
                        ) : null}
                      </Group>
                    );
                  })}
                {placedRacks.map((pr) => {
                  const rot = pr.rl.rotation ?? 0;
                  const code = pr.code || `R${pr.rl.rack_id}`;
                  // preview 는 순수 레이아웃 → 재고 색 적용 안 함
                  const agg = mode === 'preview' ? undefined : stockSummaryByRackId.get(pr.rl.rack_id);
                  // 층만 표시 — 랙의 실제 level_no 를 사용해 그리드 대신 세로 층 나열
                  const levels = Math.max(1, pr.rack?.level_no ?? pr.rl.internal_rows ?? 4);
                  const rackLayoutForLevelView = { ...pr.rl, internal_rows: levels, internal_cols: 1 };
                  return (
                    <Group key={pr.key} x={pr.gx} y={pr.gy} rotation={rot}>
                      <DarkRackKonvaView
                        x={0}
                        y={0}
                        width={pr.dw}
                        height={pr.dh}
                        rackLayout={rackLayoutForLevelView}
                        rackCode={code}
                        vendorName={pr.rack?.supplier_name}
                        levelOnly
                        visualMode={mode === 'monitoring' ? 'monitoringUtilization' : 'inventorySlots'}
                        utilizationPct={mode === 'monitoring' ? rackUtilizationPct(pr) : 0}
                        stock={agg}
                        rackOpacity={1}
                        listening={!spacePanArm}
                        onPointerDown={() => openRackDetail(pr)}
                        onTap={() => openRackDetail(pr)}
                        onMouseEnter={mode === 'preview' ? undefined : (e) => pushRackTooltip(e, pr, agg)}
                        onMouseMove={mode === 'preview' ? undefined : (e) => pushRackTooltip(e, pr, agg)}
                        onMouseLeave={mode === 'preview' ? undefined : () => setRackTooltip(null)}
                      />
                    </Group>
                  );
                })}
              </Group>
            </Layer>
          </Stage>
          </div>
        </div>
      )}
      </div>

      <Drawer
        title={rackDetail ? `랙 ${rackDetail.code}` : '랙 상세'}
        placement="right"
        width={520}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setRackDetail(null);
          setRackDrawerMeta(null);
        }}
        destroyOnHidden
        styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', height: '100%' } }}
      >
        {rackDetail && (
          <MonitoringRackDrawerBody
            rackDetail={rackDetail}
            rackGroup={inventoryByRackIdMap.get(rackDetail.rackId) ?? null}
            utilizationPct={rackDrawerMeta?.utilizationPct ?? 0}
            maxCapacity={rackDrawerMeta?.maxCapacity ?? 0}
            loading={inventoryLoading}
          />
        )}
      </Drawer>

      {/* preview mode 전용 — 랙 위치/크기 빠른 편집 */}
      <Modal
        title={previewEditRack ? `랙 ${previewEditRack.code} · 위치 편집` : '랙 위치 편집'}
        open={!!previewEditRack}
        onCancel={() => setPreviewEditRack(null)}
        okText="확인"
        cancelText="취소"
        onOk={() => setPreviewEditRack(null)}
        width={460}
      >
        {previewEditRack && (
          <Form layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label="랙 코드">
              <Input value={previewEditRack.code} disabled />
            </Form.Item>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item label="X (px)" style={{ flex: 1, marginBottom: 0 }}>
                <InputNumber style={{ width: '100%' }} value={previewEditRack.posX} disabled />
              </Form.Item>
              <Form.Item label="Y (px)" style={{ flex: 1, marginBottom: 0, marginLeft: 8 }}>
                <InputNumber style={{ width: '100%' }} value={previewEditRack.posY} disabled />
              </Form.Item>
              <Form.Item label="W (px)" style={{ flex: 1, marginBottom: 0, marginLeft: 8 }}>
                <InputNumber style={{ width: '100%' }} value={previewEditRack.width} disabled />
              </Form.Item>
              <Form.Item label="H (px)" style={{ flex: 1, marginBottom: 0, marginLeft: 8 }}>
                <InputNumber style={{ width: '100%' }} value={previewEditRack.height} disabled />
              </Form.Item>
            </Space.Compact>
            <div style={{ fontSize: 11, color: '#8a94a6', marginTop: 6, marginBottom: 16 }}>
              위치·크기는 <b>② 랙 배치</b> 탭에서 캔버스로 드래그하여 변경할 수 있습니다.
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
}

interface MonitoringRackDrawerBodyProps {
  rackDetail: { code: string; label: string; rackId: string };
  rackGroup: import('@/api/inventory').RackInventoryGroup | null;
  utilizationPct: number;
  maxCapacity: number;
  loading: boolean;
}

function MonitoringRackDrawerBody({ rackDetail, rackGroup, utilizationPct, maxCapacity, loading }: MonitoringRackDrawerBodyProps) {
  // 로딩 중 — 스피너
  if (loading && !rackGroup) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Text type="secondary" style={{ marginBottom: 12 }}>{rackDetail.label}</Text>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" tip="재고 조회 중..." />
        </div>
      </div>
    );
  }
  // 데이터는 왔지만 이 랙의 로케이션이 없는 경우 (랙만 만들고 Location 생성 안 함)
  if (!rackGroup) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Text type="secondary">{rackDetail.label}</Text>
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff', border: '1px solid #e8eaed', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: '#5a6478' }}>이 랙 적재율</Text>
          <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
            {utilizationPct}% <Text type="secondary" style={{ fontSize: 11 }}>(용량 {maxCapacity.toLocaleString()})</Text>
          </Text>
        </div>
        <div style={{ marginTop: 16, padding: 40, textAlign: 'center', background: '#fafafa', borderRadius: 8 }}>
          <Text type="secondary">
            이 랙에는 아직 로케이션이 없습니다. 층(level_no)을 설정하면 층별 재고가 표시됩니다.
          </Text>
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 10 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{rackDetail.label}</Text>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <RackDetailView rack={rackGroup} hideHeader compact />
      </div>
    </div>
  );
}
