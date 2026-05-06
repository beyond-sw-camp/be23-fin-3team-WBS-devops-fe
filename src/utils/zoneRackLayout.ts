import type { Rack, RackLayout, ZoneLayout } from '@/types/warehouse';

/**
 * 모니터링·미니맵 등 조회 전용: 마스터에 없거나 비활성(`is_active === false`)인 랙의
 * 레이아웃은 그리지 않는다. (비활성/삭제 후 남은 레이아웃 좀비 방지)
 */
export function filterRackLayoutsForActiveMaster(rackLayouts: RackLayout[], racks: Rack[]): RackLayout[] {
  const activeIds = new Set(racks.filter((r) => r.is_active).map((r) => r.id));
  return rackLayouts.filter((rl) => activeIds.has(rl.rack_id));
}

/** 구역 사각형 안쪽 여백 (랙 배치 기준) — 모든 탭·미니맵·관제에서 동일 */
export const ZONE_INNER_PAD = 16;

/**
 * 구역 내부를 행·열 셀로 나눠 랙을 셀 중앙에 두고, 셀 크기에 맞게 스케일(최대 1).
 * 통로(셀 간 gap)를 넓게 잡아 랙이 사방으로 분산되도록 함.
 */
export function placeRacksDistributedInZoneLocal(
  zl: ZoneLayout | null,
  count: number,
  baseW: number,
  baseH: number,
  gapMin: number,
): { lx: number; ly: number; width: number; height: number }[] {
  const pad = ZONE_INNER_PAD;
  const innerW = Math.max(40, (zl?.width ?? 800) - 2 * pad);
  const innerH = Math.max(40, (zl?.height ?? 600) - 2 * pad);
  if (count <= 0) return [];
  const cols = count > 4 ? 2 : Math.min(4, Math.max(1, count));
  const rows = Math.ceil(count / cols);
  const gap = Math.max(gapMin, 28);
  const cellW = (innerW - gap * (cols - 1)) / cols;
  const cellH = (innerH - gap * (rows - 1)) / rows;
  const s = Math.min(1, (cellW - 8) / baseW, (cellH - 8) / baseH);
  const dw = Math.max(16, Math.round(baseW * s));
  const dh = Math.max(16, Math.round(baseH * s));
  const out: { lx: number; ly: number; width: number; height: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const left = pad + c * (cellW + gap);
    const top = pad + r * (cellH + gap);
    out.push({
      lx: Math.round(left + (cellW - dw) / 2),
      ly: Math.round(top + (cellH - dh) / 2),
      width: dw,
      height: dh,
    });
  }
  return out;
}

/**
 * 창고 캔버스 전체에 랙을 분산 배치한 뒤, 해당 구역 기준 로컬 좌표로 반환.
 * (랙 편집기: 구역 박스 밖 월드에도 둘 수 있음)
 */
export function placeRacksDistributedCanvasWorld(
  zl: ZoneLayout,
  count: number,
  baseW: number,
  baseH: number,
  canvasW: number,
  canvasH: number,
  gapMin: number,
): { lx: number; ly: number; width: number; height: number }[] {
  const pad = Math.max(ZONE_INNER_PAD, 64);
  const innerW = Math.max(40, canvasW - 2 * pad);
  const innerH = Math.max(40, canvasH - 2 * pad);
  if (count <= 0) return [];
  const cols = count > 4 ? 2 : Math.min(4, Math.max(1, count));
  const rows = Math.ceil(count / cols);
  const gap = Math.max(gapMin, 58);
  const cellW = (innerW - gap * (cols - 1)) / cols;
  const cellH = (innerH - gap * (rows - 1)) / rows;
  const s = Math.min(1, (cellW - 8) / baseW, (cellH - 8) / baseH);
  const dw = Math.max(16, Math.round(baseW * s));
  const dh = Math.max(16, Math.round(baseH * s));
  const out: { lx: number; ly: number; width: number; height: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const wx = pad + c * (cellW + gap);
    const wy = pad + r * (cellH + gap);
    const topLeftWx = Math.round(wx + (cellW - dw) / 2);
    const topLeftWy = Math.round(wy + (cellH - dh) / 2);
    out.push({
      lx: topLeftWx - zl.pos_x,
      ly: topLeftWy - zl.pos_y,
      width: dw,
      height: dh,
    });
  }
  return out;
}

/** 랙 편집기(단일 바닥): 스케일 없이 월드 = 구역 원점 + 로컬 */
export function packRacksEditorDirectWorld(
  rackLayouts: RackLayout[],
  zoneLayouts: ZoneLayout[],
  warehouseId: string,
  zoneIdFilter: string | null,
): PackedRackGeometry[] {
  const zlList = zoneLayouts.filter((z) => z.warehouse_id === warehouseId);
  const zoneMap = new Map(zlList.map((zl) => [zl.zone_id, zl]));
  const out: PackedRackGeometry[] = [];
  for (const rl of rackLayouts) {
    if (rl.warehouse_id !== warehouseId) continue;
    if (zoneIdFilter != null && rl.zone_id !== zoneIdFilter) continue;
    const zl = zoneMap.get(rl.zone_id);
    if (!zl) continue;
    out.push({
      key: `${rl.zone_id}-${rl.rack_id}`,
      rl,
      gx: Math.round(zl.pos_x + rl.pos_x),
      gy: Math.round(zl.pos_y + rl.pos_y),
      dw: Math.max(1, Math.round(rl.width)),
      dh: Math.max(1, Math.round(rl.height)),
    });
  }
  return out;
}

/** 구역 내 랙 묶음을 월드 좌표로 배치(스케일 s로 내부에 맞춘 뒤 (inner - bundle)/2 만큼 중앙 정렬) */
export interface PackedRackGeometry {
  key: string;
  rl: RackLayout;
  gx: number;
  gy: number;
  dw: number;
  dh: number;
}

/**
 * 레이아웃/관제/미니맵 공통: 랙 로컬 좌표 묶음의 바운딩박스를 구역 내부에 스케일·중앙 배치.
 * gx, gy, dw, dh는 정수로 반올림.
 */
export function packRacksIntoZonesDisplay(
  rackLayouts: RackLayout[],
  zoneLayouts: ZoneLayout[],
  warehouseId: string,
): PackedRackGeometry[] {
  const pad = ZONE_INNER_PAD;
  const zlList = zoneLayouts.filter((z) => z.warehouse_id === warehouseId);
  const zoneMap = new Map(zlList.map((zl) => [zl.zone_id, zl]));
  const byZone = new Map<string, RackLayout[]>();
  for (const rl of rackLayouts) {
    if (rl.warehouse_id !== warehouseId) continue;
    if (!zoneMap.has(rl.zone_id)) continue;
    const arr = byZone.get(rl.zone_id) ?? [];
    arr.push(rl);
    byZone.set(rl.zone_id, arr);
  }

  const out: PackedRackGeometry[] = [];
  for (const zl of zlList) {
    const racks = byZone.get(zl.zone_id);
    if (!racks?.length) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of racks) {
      minX = Math.min(minX, r.pos_x);
      minY = Math.min(minY, r.pos_y);
      maxX = Math.max(maxX, r.pos_x + r.width);
      maxY = Math.max(maxY, r.pos_y + r.height);
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const innerW = Math.max(20, zl.width - 2 * pad);
    const innerH = Math.max(20, zl.height - 2 * pad);
    const s = Math.min(1, innerW / bw, innerH / bh);
    const packedW = bw * s;
    const packedH = bh * s;
    const offX = pad + (innerW - packedW) / 2;
    const offY = pad + (innerH - packedH) / 2;

    for (const rl of racks) {
      out.push({
        key: `${rl.zone_id}-${rl.rack_id}`,
        rl,
        gx: Math.round(zl.pos_x + offX + (rl.pos_x - minX) * s),
        gy: Math.round(zl.pos_y + offY + (rl.pos_y - minY) * s),
        dw: Math.max(1, Math.round(rl.width * s)),
        dh: Math.max(1, Math.round(rl.height * s)),
      });
    }
  }
  return out;
}

/** 구역별 패킹 스케일·오프셋 (화면 좌표 ↔ 저장 로컬 좌표 변환용) */
export interface ZonePackTransform {
  zl: ZoneLayout;
  minX: number;
  minY: number;
  s: number;
  offX: number;
  offY: number;
}

export function getZonePackTransform(
  zoneId: string,
  rackLayouts: RackLayout[],
  zoneLayouts: ZoneLayout[],
  warehouseId: string,
): ZonePackTransform | null {
  const pad = ZONE_INNER_PAD;
  const zl = zoneLayouts.find((z) => z.zone_id === zoneId && z.warehouse_id === warehouseId);
  if (!zl) return null;
  const racks = rackLayouts.filter((r) => r.zone_id === zoneId && r.warehouse_id === warehouseId);
  if (!racks.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of racks) {
    minX = Math.min(minX, r.pos_x);
    minY = Math.min(minY, r.pos_y);
    maxX = Math.max(maxX, r.pos_x + r.width);
    maxY = Math.max(maxY, r.pos_y + r.height);
  }
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const innerW = Math.max(20, zl.width - 2 * pad);
  const innerH = Math.max(20, zl.height - 2 * pad);
  const s = Math.min(1, innerW / bw, innerH / bh);
  const packedW = bw * s;
  const packedH = bh * s;
  const offX = pad + (innerW - packedW) / 2;
  const offY = pad + (innerH - packedH) / 2;

  return { zl, minX, minY, s, offX, offY };
}

/** 랙 편집기 바닥 모드: 월드↔로컬 1:1 (구역 원점만 오프셋) */
export function getZoneEditorFloorTransform(
  zoneId: string,
  zoneLayouts: ZoneLayout[],
  warehouseId: string,
): ZonePackTransform | null {
  const zl = zoneLayouts.find((z) => z.zone_id === zoneId && z.warehouse_id === warehouseId);
  if (!zl) return null;
  return { zl, minX: 0, minY: 0, s: 1, offX: 0, offY: 0 };
}

/** 월드 좌표 랙 묶음을 창고 캔버스 안으로 이동 */
export function clampWorldRackBatch(
  cells: { wx: number; wy: number }[],
  rackW: number,
  rackH: number,
  canvasW: number,
  canvasH: number,
  pad: number,
): { wx: number; wy: number }[] | null {
  if (!cells.length) return [];
  const minWX = Math.min(...cells.map((c) => c.wx));
  const maxWX = Math.max(...cells.map((c) => c.wx + rackW));
  const minWY = Math.min(...cells.map((c) => c.wy));
  const maxWY = Math.max(...cells.map((c) => c.wy + rackH));
  const spanX = maxWX - minWX;
  const spanY = maxWY - minWY;
  if (spanX > canvasW - 2 * pad || spanY > canvasH - 2 * pad) return null;
  const dx = Math.max(pad, Math.min(minWX, canvasW - pad - spanX)) - minWX;
  const dy = Math.max(pad, Math.min(minWY, canvasH - pad - spanY)) - minWY;
  return cells.map((c) => ({ wx: c.wx + dx, wy: c.wy + dy }));
}

/** 패킹된 캔버스 사각형(gx,gy,dw,dh) → 저장용 로컬 랙 레이아웃 좌표 */
export function packedRectToLocalRack(
  gx: number,
  gy: number,
  dw: number,
  dh: number,
  t: ZonePackTransform,
): { pos_x: number; pos_y: number; width: number; height: number } {
  const { zl, minX, minY, s, offX, offY } = t;
  const pos_x = Math.round((gx - zl.pos_x - offX) / s + minX);
  const pos_y = Math.round((gy - zl.pos_y - offY) / s + minY);
  const width = Math.max(16, Math.round(dw / s));
  const height = Math.max(16, Math.round(dh / s));
  return { pos_x, pos_y, width, height };
}

/**
 * API에 저장된 랙 좌표는 구역(ZoneLayout) 좌상단 기준 상대좌표(로컬)로 통일.
 * 캔버스 월드 좌표 = 구역 원점 + 로컬
 */
export function rackWorldFromLocal(l: RackLayout, zl: ZoneLayout | null): { x: number; y: number } {
  if (!zl) return { x: l.pos_x, y: l.pos_y };
  return { x: zl.pos_x + l.pos_x, y: zl.pos_y + l.pos_y };
}

export function rackLocalFromWorld(worldX: number, worldY: number, zl: ZoneLayout | null): { lx: number; ly: number } {
  if (!zl) return { lx: worldX, ly: worldY };
  return { lx: worldX - zl.pos_x, ly: worldY - zl.pos_y };
}

/**
 * 일괄 생성: 사용자가 입력한 간격을 랙 사이의 실제 간격으로 사용한다.
 * 구역 안에 들어가는지는 clampBatchInsideZone 에서 검증하며, 여기서는 묶음의 상대 배치만 만든다.
 * 반환은 구역 로컬 좌표 (구역 좌상단 기준).
 */
export function computeBatchRackLocalGrid(
  zl: ZoneLayout | null,
  rows: number,
  cols: number,
  w: number,
  h: number,
  minGapFloor: number,
  canvasW: number,
  canvasH: number,
): { lx: number; ly: number }[] {
  // Keep these parameters referenced because this utility is shared by callers
  // that still pass the current canvas/zone context.
  void zl;
  void canvasW;
  void canvasH;

  const gap = Math.max(0, Number(minGapFloor) || 0);

  const out: { lx: number; ly: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      out.push({
        lx: Math.round(c * (w + gap)),
        ly: Math.round(r * (h + gap)),
      });
    }
  }
  return out;
}

/** Matrix 배치: 템플릿 그리드를 클릭 지점을 묶음 좌상단 앵커로 맞춤 */
export function anchorBatchGridToClick(
  templatePositions: { lx: number; ly: number }[],
  clickLocalX: number,
  clickLocalY: number,
): { lx: number; ly: number }[] {
  if (!templatePositions.length) return [];
  const minX = Math.min(...templatePositions.map((p) => p.lx));
  const minY = Math.min(...templatePositions.map((p) => p.ly));
  const dx = clickLocalX - minX;
  const dy = clickLocalY - minY;
  return templatePositions.map((p) => ({ lx: p.lx + dx, ly: p.ly + dy }));
}

/**
 * 일괄 배치 좌표를 구역 내부(pad)로 맞춤. 묶음이 안 들어가면 null.
 */
export function clampBatchInsideZone(
  positions: { lx: number; ly: number }[],
  rackW: number,
  rackH: number,
  zl: ZoneLayout,
): { lx: number; ly: number }[] | null {
  if (!positions.length) return [];
  const pad = ZONE_INNER_PAD;
  const innerR = zl.width - pad;
  const innerB = zl.height - pad;
  const minX0 = Math.min(...positions.map((p) => p.lx));
  const maxX0 = Math.max(...positions.map((p) => p.lx + rackW));
  const minY0 = Math.min(...positions.map((p) => p.ly));
  const maxY0 = Math.max(...positions.map((p) => p.ly + rackH));
  const spanX = maxX0 - minX0;
  const spanY = maxY0 - minY0;
  if (spanX > innerR - pad || spanY > innerB - pad) return null;
  const dx = Math.max(pad, Math.min(minX0, innerR - spanX)) - minX0;
  const dy = Math.max(pad, Math.min(minY0, innerB - spanY)) - minY0;
  return positions.map((p) => ({ lx: p.lx + dx, ly: p.ly + dy }));
}

export function rackRectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** 구역 내 기존 랙 레이아웃과 겹치면 true */
export function batchCollidesExistingLayouts(
  positions: { lx: number; ly: number }[],
  rackW: number,
  rackH: number,
  existing: RackLayout[],
  zoneId: string,
): boolean {
  for (const pos of positions) {
    for (const ex of existing) {
      if (ex.zone_id !== zoneId) continue;
      if (rackRectsOverlap(pos.lx, pos.ly, rackW, rackH, ex.pos_x, ex.pos_y, ex.width, ex.height)) return true;
    }
  }
  return false;
}
