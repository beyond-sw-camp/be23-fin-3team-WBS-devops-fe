import { useMemo, useState, useEffect, useRef } from 'react';
import { Stage, Layer, Group, Rect } from 'react-konva';
import { Spin } from 'antd';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { Rack, ZoneLayout } from '@/types/warehouse';
import {
  useZonesByWarehouse,
  useZoneLayouts,
  useWarehouseCanvas,
  useRacks,
  useRackLayoutsByWarehouse,
} from '@/hooks/useWarehouseQuery';
import { filterRackLayoutsForActiveMaster, packRacksIntoZonesDisplay } from '@/utils/zoneRackLayout';
const ZONE_BORDER: Record<string, string> = { STORAGE: '#52c41a', INBOUND: '#3b82f6', OUTBOUND: '#fa8c16', DEFECT: '#ef4444' };
const ZONE_FILL: Record<string, string> = {
  STORAGE: 'rgba(82, 196, 26, 0.12)',
  INBOUND: 'rgba(59, 130, 246, 0.1)',
  OUTBOUND: 'rgba(250, 140, 22, 0.1)',
  DEFECT: 'rgba(239, 68, 68, 0.1)',
};
const PAD = 6;
const ACCENT = '#3b82f6';
const ACCENT_SOFT = '#93c5fd';

interface Packed {
  key: string;
  zone_id: string;
  rack_code: string;
  gx: number;
  gy: number;
  dw: number;
  dh: number;
}

function zoneLayoutRenderKey(zl: ZoneLayout, index: number): string {
  return zl.id || `${zl.zone_id}-${zl.pos_x}-${zl.pos_y}-${zl.width}-${zl.height}-${index}`;
}

/**
 * 회전 적용된 사각형의 axis-aligned 바운딩 박스 — worldExtent 계산용.
 * 편집기와 동일: 회전 축은 좌상단(pos_x, pos_y).
 */
function rotatedZoneBounds(zl: ZoneLayout): { minX: number; minY: number; maxX: number; maxY: number } {
  const deg = zl.rotation ?? 0;
  if (!deg) {
    return { minX: zl.pos_x, minY: zl.pos_y, maxX: zl.pos_x + zl.width, maxY: zl.pos_y + zl.height };
  }
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: 0, y: 0 },
    { x: zl.width, y: 0 },
    { x: zl.width, y: zl.height },
    { x: 0, y: zl.height },
  ].map((p) => ({
    x: zl.pos_x + p.x * cos - p.y * sin,
    y: zl.pos_y + p.x * sin + p.y * cos,
  }));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function worldExtent(
  warehouseId: string,
  canvasW: number,
  canvasH: number,
  zoneLayouts: ZoneLayout[],
  racks: Packed[],
): { minX: number; minY: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxR = -Infinity;
  let maxB = -Infinity;
  const edge = 12;
  const push = (x1: number, y1: number, x2: number, y2: number) => {
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxR = Math.max(maxR, x2);
    maxB = Math.max(maxB, y2);
  };
  // 회전된 구역도 영역에 포함되도록 회전 후의 axis-aligned 바운딩 박스 사용
  for (const zl of zoneLayouts) {
    if (zl.warehouse_id !== warehouseId) continue;
    const b = rotatedZoneBounds(zl);
    push(b.minX, b.minY, b.maxX, b.maxY);
  }
  for (const pr of racks) {
    push(pr.gx, pr.gy, pr.gx + pr.dw, pr.gy + pr.dh);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxR) || !Number.isFinite(maxB)) {
    return { minX: 0, minY: 0, w: Math.max(1, canvasW), h: Math.max(1, canvasH) };
  }
  return {
    minX: Math.max(0, minX - edge),
    minY: Math.max(0, minY - edge),
    w: Math.max(1, maxR - minX + edge * 2),
    h: Math.max(1, maxB - minY + edge * 2),
  };
}

/** 가동률 0~100 → 붉은 히트 오버레이 불투명도 */
function heatAlpha(occupancy: number | undefined): number {
  if (occupancy == null || Number.isNaN(occupancy)) return 0;
  const t = Math.max(0, Math.min(100, occupancy));
  return (t / 100) ** 1.2 * 0.36;
}

export interface DashboardWarehouseMinimapProps {
  warehouseId?: string;
  highlightRackCode: string | null;
  /** 구역 클릭 시 (동일 구역 재클릭은 부모에서 토글) */
  onZoneSelect?: (zoneId: string) => void;
  selectedZoneId?: string | null;
  /** zone_id → 가동률(0~100) */
  occupancyByZoneId?: Record<string, number>;
  width?: number;
  height?: number;
}

export default function DashboardWarehouseMinimap({
  warehouseId = 'm-wh-1',
  highlightRackCode,
  onZoneSelect,
  selectedZoneId = null,
  occupancyByZoneId = {},
  width,
  height,
}: DashboardWarehouseMinimapProps) {
  const [pulse, setPulse] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const [autoWidth, setAutoWidth] = useState(248);
  const [autoHeight, setAutoHeight] = useState(164);
  const [hoverTip, setHoverTip] = useState<{ x: number; y: number; zoneId: string } | null>(null);
  const { data: canvas, isLoading: cLoad } = useWarehouseCanvas(warehouseId);
  const { data: zones = [], isLoading: zLoad } = useZonesByWarehouse(warehouseId);
  const { data: zoneLayouts = [], isLoading: zlLoad } = useZoneLayouts(warehouseId);
  const { data: racks = [], isLoading: rLoad } = useRacks({ warehouseId });
  const { data: rackLayouts = [], isLoading: rlLoad } = useRackLayoutsByWarehouse(warehouseId);

  const cW = canvas?.canvas_width ?? 1000;
  const cH = canvas?.canvas_height ?? 700;

  const rackById = useMemo(() => {
    const m = new Map<string, Rack>();
    racks.forEach((r) => m.set(r.id, r));
    return m;
  }, [racks]);

  const packed = useMemo<Packed[]>(() => {
    const layouts = filterRackLayoutsForActiveMaster(rackLayouts, racks);
    const geo = packRacksIntoZonesDisplay(layouts, zoneLayouts, warehouseId);
    return geo.map((g) => {
      const rack = rackById.get(g.rl.rack_id);
      return {
        key: g.key,
        zone_id: g.rl.zone_id,
        rack_code: rack?.code ?? '',
        gx: g.gx,
        gy: g.gy,
        dw: g.dw,
        dh: g.dh,
      };
    });
  }, [rackLayouts, zoneLayouts, warehouseId, rackById, racks]);

  // 회전된 zone 안에 랙이 들어가도록 zone 별로 그룹핑 — zone Group(rotation 적용) 자식으로 렌더
  const packedByZone = useMemo(() => {
    const m = new Map<string, Packed[]>();
    for (const p of packed) {
      const arr = m.get(p.zone_id) ?? [];
      arr.push(p);
      m.set(p.zone_id, arr);
    }
    return m;
  }, [packed]);

  const rackCountByZoneId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const rl of rackLayouts) {
      const rack = rackById.get(rl.rack_id);
      if (!rack?.zone_id) continue;
      counts.set(rack.zone_id, (counts.get(rack.zone_id) ?? 0) + 1);
    }
    return counts;
  }, [rackLayouts, rackById]);

  const { minX: worldMinX, minY: worldMinY, w: worldW, h: worldH } = useMemo(
    () => worldExtent(warehouseId, cW, cH, zoneLayouts, packed),
    [warehouseId, cW, cH, zoneLayouts, packed],
  );

  const stageWidth = width ?? autoWidth;
  // 명시적 height prop 이 있으면 그것 사용 / 부모 박스 높이가 관측되면 그것 사용 / 없으면 가로 기준 0.66 비율
  const stageHeight = height ?? (autoHeight > 0 ? autoHeight : Math.round(stageWidth * 0.66));

  const view = useMemo(() => {
    const iw = stageWidth - 2 * PAD;
    const ih = stageHeight - 2 * PAD;
    if (worldW < 1 || worldH < 1) return { sx: 1, sy: 1, ox: PAD, oy: PAD };
    // 비율 유지 + 약간 확대(기본 대비 6%)로 "너무 작지도 크지도 않게" 조정
    const fit = Math.max(0.02, Math.min(iw / worldW, ih / worldH));
    const scale = fit * 1.06;
    const ox = PAD + (iw - worldW * scale) / 2;
    const oy = PAD + (ih - worldH * scale) / 2;
    return { sx: scale, sy: scale, ox, oy };
  }, [stageWidth, stageHeight, worldW, worldH]);

  useEffect(() => {
    if (width) return;
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.max(220, Math.floor(el.clientWidth - 2));
      setAutoWidth((prev) => (prev === next ? prev : next));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  // 명시 height 가 없으면 Stage 박스가 가능한 영역을 모두 채우도록 관찰
  useEffect(() => {
    if (height) return;
    const el = stageBoxRef.current;
    if (!el) return;
    const update = () => {
      const next = Math.max(140, Math.floor(el.clientHeight));
      setAutoHeight((prev) => (prev === next ? prev : next));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  useEffect(() => {
    if (!highlightRackCode) return;
    const t = window.setInterval(() => setPulse((p) => p + 1), 160);
    return () => window.clearInterval(t);
  }, [highlightRackCode]);

  const zoneHit = (zoneId: string) => (e: KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    onZoneSelect?.(zoneId);
  };
  const zoneHoverMove = (zoneId: string) => (e: KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const p = stage.getPointerPosition();
    if (!p) return;
    setHoverTip({ x: p.x + 10, y: p.y + 10, zoneId });
  };
  const zoneHoverLeave = () => setHoverTip(null);

  const loading = cLoad || zLoad || zlLoad || rLoad || rlLoad;

  const zlFiltered = useMemo(
    () => zoneLayouts.filter((zl) => zl.warehouse_id === warehouseId),
    [zoneLayouts, warehouseId],
  );

  if (loading) {
    return (
      <div
        className="dashboard-minimap-wrap"
        style={{
          width: stageWidth,
          height: stageHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="small" />
      </div>
    );
  }

  const pulsePhase = pulse % 2;
  const pulseStroke = pulsePhase === 0 ? ACCENT : ACCENT_SOFT;

  return (
    <div ref={wrapRef} className="dashboard-minimap-wrap">
      <div ref={stageBoxRef} className="dashboard-minimap-stage-box">
      <Stage width={stageWidth} height={stageHeight}>
        <Layer>
          <Group
            x={view.ox - worldMinX * view.sx}
            y={view.oy - worldMinY * view.sy}
            scaleX={view.sx}
            scaleY={view.sy}
          >
            <Rect x={worldMinX} y={worldMinY} width={worldW} height={worldH} fill="#f8fafc" listening={false} />
            {zlFiltered.map((zl, index) => {
              const zone = zones.find((z) => z.id === zl.zone_id);
              const zt = zone?.zone_type ?? 'STORAGE';
              const occ = occupancyByZoneId[zl.zone_id];
              const ha = heatAlpha(occ);
              const sel = selectedZoneId === zl.zone_id;
              const renderKey = zoneLayoutRenderKey(zl, index);
              const racksInZone = packedByZone.get(zl.zone_id) ?? [];
              // 편집기와 동일: Group 을 (pos_x, pos_y) 에 두고 Group 자체에 rotation — 좌상단 기준 회전
              // 랙도 같은 Group 안에 두어 zone 회전을 따라가도록 (gx, gy 는 world 좌표 → zone 로컬 좌표로 변환)
              return (
                <Group
                  key={`zvis-${renderKey}`}
                  x={zl.pos_x}
                  y={zl.pos_y}
                  rotation={zl.rotation ?? 0}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={zl.width}
                    height={zl.height}
                    fill={ZONE_FILL[zt] ?? ZONE_FILL.STORAGE}
                    stroke={sel ? '#60a5fa' : ZONE_BORDER[zt] ?? ZONE_BORDER.STORAGE}
                    strokeWidth={sel ? 1.6 : 1.05}
                    dash={sel ? [4, 4] : [8, 5]}
                    cornerRadius={3}
                    listening={false}
                  />
                  {ha > 0 ? (
                    <Rect
                      x={0}
                      y={0}
                      width={zl.width}
                      height={zl.height}
                      fill={`rgba(248, 113, 113, ${ha})`}
                      cornerRadius={3}
                      listening={false}
                    />
                  ) : null}
                  {racksInZone.map((pr) => {
                    const localX = pr.gx - zl.pos_x;
                    const localY = pr.gy - zl.pos_y;
                    const hi = Boolean(highlightRackCode && pr.rack_code === highlightRackCode);
                    return (
                      <Group key={pr.key} listening={false}>
                        {hi ? (
                          <Rect
                            x={localX - 1}
                            y={localY - 1}
                            width={pr.dw + 2}
                            height={pr.dh + 2}
                            fill="rgba(59,130,246,0.10)"
                            stroke={pulseStroke}
                            strokeWidth={2.8 + (pulse % 3) * 0.6}
                            cornerRadius={2}
                            shadowColor={pulseStroke}
                            shadowBlur={8 + (pulse % 3) * 2}
                            shadowOpacity={0.45}
                            listening={false}
                          />
                        ) : null}
                        <Rect
                          x={localX}
                          y={localY}
                          width={pr.dw}
                          height={pr.dh}
                          fill={hi ? '#dbeafe' : '#e5e7eb'}
                          stroke={hi ? pulseStroke : '#94a3b8'}
                          strokeWidth={hi ? 1.4 : 0.8}
                          cornerRadius={1}
                          listening={false}
                        />
                      </Group>
                    );
                  })}
                </Group>
              );
            })}
            {/* zone 에 속하지 않는 떠도는 랙(있다면)은 world 좌표 그대로 그림 */}
            {packed.filter((p) => !packedByZone.has(p.zone_id) || zlFiltered.every((z) => z.zone_id !== p.zone_id)).map((pr) => {
              const hi = Boolean(highlightRackCode && pr.rack_code === highlightRackCode);
              return (
                <Group key={pr.key} listening={false}>
                  {hi ? (
                    <Rect
                      x={pr.gx - 1}
                      y={pr.gy - 1}
                      width={pr.dw + 2}
                      height={pr.dh + 2}
                      fill="rgba(59,130,246,0.10)"
                      stroke={pulseStroke}
                      strokeWidth={2.8 + (pulse % 3) * 0.6}
                      cornerRadius={2}
                      shadowColor={pulseStroke}
                      shadowBlur={8 + (pulse % 3) * 2}
                      shadowOpacity={0.45}
                      listening={false}
                    />
                  ) : null}
                  <Rect
                    x={pr.gx}
                    y={pr.gy}
                    width={pr.dw}
                    height={pr.dh}
                    fill={hi ? '#dbeafe' : '#e5e7eb'}
                    stroke={hi ? pulseStroke : '#94a3b8'}
                    strokeWidth={hi ? 1.4 : 0.8}
                    cornerRadius={1}
                    listening={false}
                  />
                </Group>
              );
            })}
            {onZoneSelect
              ? zlFiltered.map((zl, index) => (
                  <Group
                    key={`zhit-${zoneLayoutRenderKey(zl, index)}`}
                    x={zl.pos_x}
                    y={zl.pos_y}
                    rotation={zl.rotation ?? 0}
                  >
                    <Rect
                      x={0}
                      y={0}
                      width={zl.width}
                      height={zl.height}
                      fill="rgba(59,130,246,0.04)"
                      strokeEnabled={false}
                      onClick={zoneHit(zl.zone_id)}
                      onTap={zoneHit(zl.zone_id)}
                      onMouseMove={zoneHoverMove(zl.zone_id)}
                      onMouseLeave={zoneHoverLeave}
                    />
                  </Group>
                ))
              : null}
          </Group>
        </Layer>
      </Stage>
      </div>
      <div className="dashboard-minimap-legend">
        <span><i style={{ background: '#52c41a' }} />보관</span>
        <span><i style={{ background: '#3b82f6' }} />입고</span>
        <span><i style={{ background: '#fa8c16' }} />출고</span>
      </div>
      {hoverTip && (
        <div
          className="dashboard-minimap-tooltip"
          style={{ left: hoverTip.x, top: hoverTip.y }}
        >
          {(() => {
            const zone = zones.find((z) => z.id === hoverTip.zoneId);
            const occ = occupancyByZoneId[hoverTip.zoneId];
            const totalRacks = rackCountByZoneId.get(hoverTip.zoneId) ?? 0;
            const usedRacks = totalRacks > 0 && occ != null ? Math.round((occ / 100) * totalRacks) : 0;
            return (
              <>
                <strong>{zone?.name ?? '구역'}</strong>
                <span>가동률 {occ != null ? `${occ}%` : '-'}</span>
                <span>사용 랙 {usedRacks}/{totalRacks}</span>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
