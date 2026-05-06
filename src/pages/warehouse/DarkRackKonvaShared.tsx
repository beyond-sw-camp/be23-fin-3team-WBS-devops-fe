import { useMemo } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { Group, Rect, Text as KonvaText } from 'react-konva';
import type { RackLayout, RackStock, ZoneType } from '@/types/warehouse';

export type RackCanvasVisualMode = 'inventorySlots' | 'layoutZone' | 'monitoringUtilization';

/** 구역 타입별 보조 톤(존 배경 등) — 랙 본체는 랙 편집기와 동일한 중립 톤 고정 */
export function zoneLayoutPalette(
  zoneType: ZoneType,
  _zoneName: string,
  _zoneCode: string,
): { shell: string; inner: string; slotA: string; slotB: string } {
  switch (zoneType) {
    case 'STORAGE':
      return { shell: '#dce6f5', inner: '#dce6f5', slotA: '#a8bcd8', slotB: '#a8bcd8' };
    case 'INBOUND':
      return { shell: '#dcf5e4', inner: '#dcf5e4', slotA: '#7cb489', slotB: '#7cb489' };
    case 'OUTBOUND':
      return { shell: '#fef3e0', inner: '#fef3e0', slotA: '#d4aa60', slotB: '#d4aa60' };
    case 'DEFECT':
      return { shell: '#fdeaea', inner: '#fdeaea', slotA: '#e57373', slotB: '#e57373' };
    default:
      return { shell: '#dce6f5', inner: '#dce6f5', slotA: '#a8bcd8', slotB: '#a8bcd8' };
  }
}

/** 모니터링: 적재율 구간별 색 (0~30% 회색, 31~80% 파랑, 81~100% 주황) */
export function monitoringUtilPalette(utilizationPct: number): {
  shell: string;
  inner: string;
  slotA: string;
  slotB: string;
} {
  const p = Math.max(0, Math.min(100, utilizationPct));
  if (p <= 30) return { shell: '#f0f2f5', inner: '#f0f2f5', slotA: '#d0d5de', slotB: '#d0d5de' };
  if (p <= 80) return { shell: '#e8f1fb', inner: '#e8f1fb', slotA: '#378ADD', slotB: '#378ADD' };
  return { shell: '#fef3e0', inner: '#fef3e0', slotA: '#EF9F27', slotB: '#EF9F27' };
}

export type SlotVisual = 'empty' | 'stock' | 'work';

/** 비어 있음 · 작업 중 · 적재 — 모던 라이트 매트릭스(랙 편집기·범례 공통) */
export const SLOT_FILL: Record<SlotVisual, string> = {
  empty: '#f0f2f5',
  // 적재/작업 셀은 흰 shell 위에서 한눈에 보이도록 한 단계 진하게
  stock: '#fbd896',
  work: '#bcd9f5',
};

const SEL_STROKE = '#EF9F27';

function slotLabelFill(cell: SlotVisual): string {
  if (cell === 'stock') return '#854F0B';
  if (cell === 'work') return '#0C447C';
  return '#8a94a6';
}

/** 동일 랙코드 행을 하나의 요약 재고로 합산 (조회·모니터링 실시간 바인딩) */
export function aggregateStocksForRackCode(stocks: RackStock[], rackCode: string): RackStock | undefined {
  const rows = stocks.filter((s) => s.rack_code === rackCode);
  if (!rows.length) return undefined;
  const total_qty = rows.reduce((a, s) => a + s.total_qty, 0);
  const reserved_qty = rows.reduce((a, s) => a + s.reserved_qty, 0);
  const available_qty = rows.reduce((a, s) => a + s.available_qty, 0);
  const primary = rows[0];
  const names = [...new Set(rows.map((r) => r.product_name).filter(Boolean))];
  const product_name =
    names.length === 0 ? '—' : names.length <= 2 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} 외 ${names.length - 2}건`;
  return {
    rack_code: rackCode,
    rack_id: primary.rack_id,
    sku: rows.length > 1 ? `${rows.length} SKU` : primary.sku,
    product_name,
    available_qty,
    reserved_qty,
    total_qty,
  };
}

export function parseSlotMatrix(rl: RackLayout, rackId: string, stock: RackStock | undefined): SlotVisual[][] {
  const rows = Math.max(1, rl.internal_rows ?? 4);
  const cols = Math.max(1, rl.internal_cols ?? 5);
  const matrix: SlotVisual[][] = [];
  if (rl.slot_states_json) {
    try {
      const o = JSON.parse(rl.slot_states_json) as Record<string, string>;
      for (let r = 0; r < rows; r++) {
        const row: SlotVisual[] = [];
        for (let c = 0; c < cols; c++) {
          const raw = (o[`${r}-${c}`] ?? o[`${r}_${c}`] ?? '').toLowerCase();
          if (raw === 'stock' || raw === 'occupied' || raw === 'o') row.push('stock');
          else if (raw === 'work' || raw === 'active' || raw === 'w') row.push('work');
          else row.push('empty');
        }
        matrix.push(row);
      }
      return matrix;
    } catch {
      /* fall through */
    }
  }
  for (let r = 0; r < rows; r++) {
    const row: SlotVisual[] = [];
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!stock || stock.total_qty <= 0) {
        row.push('empty');
        continue;
      }
      // rackId 문자열을 해시로 변환 (시각용 의사 난수)
      let rackHash = 0;
      for (let k = 0; k < rackId.length; k++) rackHash = (rackHash * 31 + rackId.charCodeAt(k)) | 0;
      const h = (((rackHash * 131 + i * 97) % 1000) + 1000) % 1000 / 1000;
      const pStock = Math.min(0.72, 0.22 + stock.total_qty / 450);
      const pWork =
        stock.reserved_qty > 0
          ? Math.min(0.22, (stock.reserved_qty / Math.max(1, stock.total_qty)) * 0.35)
          : 0.06;
      if (h < pStock) row.push('stock');
      else if (h < pStock + pWork) row.push('work');
      else row.push('empty');
    }
    matrix.push(row);
  }
  return matrix;
}

export interface DarkRackKonvaViewProps {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  rackLayout: RackLayout;
  rackCode: string;
  vendorName?: string | null;
  /** @deprecated 랙 레이블에서 행 번호를 사용하지 않음 — 호환용 prop */
  rowNo?: number;
  /** @deprecated 층별 상품군 가이드 표시 제거됨 — 호환용 prop */
  levelGuides?: string[];
  levelOnly?: boolean;
  /** 권위 있는 층 수(rack.level_no). levelOnly 모드에서 rackLayout.internal_rows 보다 우선. */
  levelCount?: number;
  stock?: RackStock | undefined;
  /** 레거시: 모든 모드에서 슬롯은 재고·슬롯 상태 기반(SLOT_FILL)으로 통일 */
  visualMode?: RackCanvasVisualMode;
  zoneType?: ZoneType;
  zoneName?: string;
  zoneCode?: string;
  /** monitoringUtilization 일 때 0~100 */
  utilizationPct?: number;
  selected?: boolean;
  /** 0~1, 검색 디밍 등 */
  rackOpacity?: number;
  listening?: boolean;
  draggable?: boolean;
  onDragEnd?: (e: KonvaEventObject<DragEvent>) => void;
  onPointerDown?: (e: KonvaEventObject<MouseEvent>) => void;
  onPointerUp?: (e: KonvaEventObject<MouseEvent>) => void;
  onClick?: (e: KonvaEventObject<MouseEvent>) => void;
  onDblClick?: (e: KonvaEventObject<MouseEvent>) => void;
  onTap?: (e: KonvaEventObject<TouchEvent>) => void;
  onMouseEnter?: (e: KonvaEventObject<MouseEvent>) => void;
  onMouseMove?: (e: KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: KonvaEventObject<MouseEvent>) => void;
}

/** 플랫 2D 카드 스킨: 1px 테두리·솔리드 슬롯·하단 랙 코드 */
export function DarkRackKonvaView({
  x,
  y,
  width: W,
  height: H,
  rotation = 0,
  rackLayout,
  rackCode,
  vendorName,
  rowNo: _rowNo,
  levelGuides: _levelGuides,
  levelOnly = false,
  levelCount,
  stock,
  visualMode = 'inventorySlots',
  zoneType: _zoneType = 'STORAGE',
  zoneName: _zoneName = '',
  zoneCode: _zoneCode = '',
  utilizationPct = 0,
  selected = false,
  rackOpacity = 1,
  listening = true,
  draggable = false,
  onDragEnd,
  onPointerDown,
  onPointerUp,
  onClick,
  onDblClick,
  onTap,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
}: DarkRackKonvaViewProps) {
  const matrix = useMemo(() => {
    if (!levelOnly) return parseSlotMatrix(rackLayout, rackLayout.rack_id, stock);
    // levelCount(rack.level_no) 이 있으면 그것을 권위값으로 사용 — 백엔드 RackLayoutItem 은 internal_rows 를 저장하지 않음
    const levels = Math.max(1, levelCount ?? rackLayout.internal_rows ?? 4);
    return parseSlotMatrix({ ...rackLayout, internal_rows: levels, internal_cols: 1 }, rackLayout.rack_id, stock);
  }, [levelOnly, levelCount, rackLayout, stock]);
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 1;

  const pad = Math.max(3, Math.min(6, W * 0.04));
  const titleBand = levelOnly ? Math.max(18, Math.min(28, H * 0.16)) : 0;
  const labelBand = Math.max(14, Math.min(26, H * 0.22));
  const bodyTop = pad + titleBand + (levelOnly ? 1 : 0);
  const bodyH = Math.max(8, H - pad * 2 - labelBand - titleBand - (levelOnly ? 1 : 0));
  const innerW = W - pad * 2;
  const innerH = bodyH;
  const gap = 1;
  const slotW = cols > 0 ? Math.max(1, (innerW - gap * (cols - 1)) / cols) : Math.max(1, innerW);
  const slotH = rows > 0 ? Math.max(1, (innerH - gap * (rows - 1)) / rows) : Math.max(1, innerH);
  const codeFont = Math.max(10, Math.min(16, labelBand * 0.52));
  const cellLabelFs = Math.max(10, Math.min(15, Math.min(slotW, slotH) * 0.42));
  const showCellLabel = slotW >= 18 && slotH >= 14;
  // 코드는 마지막 2 토큰만 짧게(예: SELF-089). 풀 코드는 캔버스 외부 툴팁에서 노출됨.
  const codeShort = (() => {
    const parts = (rackCode ?? '').split('-');
    const tail = parts.slice(-2).join('-');
    return tail ? `#${tail}` : rackCode;
  })();
  const code = codeShort.length > 18 ? `${codeShort.slice(0, 16)}…` : codeShort;
  const vendorTitle = vendorName ? `${vendorName} 전용 랙` : '입고처 전용 랙';
  const vendor = String(vendorName ?? '').toLowerCase();
  const isTechVendor = vendor.includes('tech');
  const isLogixVendor = vendor.includes('logix');
  const vendorHeaderFill = isLogixVendor ? '#EF9F27' : isTechVendor ? '#378ADD' : '#888780';
  const vendorHeaderTextFill = isLogixVendor ? '#1a1000' : '#FFFFFF';
  const shellStroke = selected ? SEL_STROKE : '#c8cdd6';
  const shellStrokeW = selected ? 4 : 1;
  const shellShadowColor = selected ? 'rgba(239, 159, 39, 0.65)' : 'rgba(0, 0, 0, 0.08)';
  const shellShadowBlur = selected ? 22 : 14;
  const utilFill = visualMode === 'monitoringUtilization'
    ? monitoringUtilPalette(utilizationPct).shell
    : '#FFFFFF';

  return (
    <Group
      x={x}
      y={y}
      rotation={rotation}
      opacity={rackOpacity}
      listening={listening}
      draggable={draggable}
      onDragEnd={onDragEnd}
      name="warehouse-rack"
      onMouseDown={onPointerDown}
      onMouseUp={onPointerUp}
      onClick={onClick}
      onDblClick={onDblClick}
      onTap={onTap}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <Rect
        width={W}
        height={H}
        fill={utilFill}
        cornerRadius={8}
        stroke={shellStroke}
        strokeWidth={shellStrokeW}
        shadowColor={shellShadowColor}
        shadowBlur={shellShadowBlur}
        shadowOffset={{ x: 0, y: selected ? 0 : 4 }}
        shadowOpacity={1}
      />
      {levelOnly && (
        <>
          <Rect
            x={pad}
            y={pad}
            width={innerW}
            height={titleBand}
            fill={vendorHeaderFill}
            stroke="#c8cdd6"
            strokeWidth={1}
            cornerRadius={6}
            listening={false}
          />
          <KonvaText
            text={vendorTitle}
            x={pad + 4}
            y={pad + 1}
            width={innerW - 8}
            height={titleBand - 2}
            align="center"
            verticalAlign="middle"
            fontSize={Math.max(10, Math.min(14, titleBand * 0.56))}
            fontStyle="bold"
            fill={vendorHeaderTextFill}
            listening={false}
          />
        </>
      )}
      {matrix.map((row, r) =>
        row.map((cell, c) => {
          const sx = pad + c * (slotW + gap);
          const sy = bodyTop + r * (slotH + gap);
          const floorNo = rows - r; // 위가 최상층, 아래가 1층
          const railW = levelOnly ? Math.max(18, Math.min(26, slotW * 0.24)) : 0;
          const contentX = sx + railW;
          const contentW = Math.max(1, slotW - railW);
          const railFill =
            cell === 'stock' ? '#EF9F27' : cell === 'work' ? '#378ADD' : '#cfd8dc';
          const railTextFill = cell === 'empty' ? '#37474f' : '#ffffff';
          const railFs = Math.max(9, Math.min(13, Math.min(railW, slotH) * 0.55));
          return (
            <Group key={`${r}-${c}`} listening={false}>
              {/* 슬롯 본체 */}
              <Rect
                x={contentX}
                y={sy}
                width={contentW}
                height={slotH}
                fill={SLOT_FILL[cell]}
                stroke={cell === 'stock' ? '#EF9F27' : cell === 'work' ? '#378ADD' : '#d0d5de'}
                strokeWidth={1}
                cornerRadius={levelOnly ? [0, 2, 2, 0] : 2}
                listening={false}
              />
              {/* 좌측 층 번호 레일 — levelOnly 일 때만 */}
              {levelOnly && (
                <>
                  <Rect
                    x={sx}
                    y={sy}
                    width={railW}
                    height={slotH}
                    fill={railFill}
                    cornerRadius={[2, 0, 0, 2]}
                    listening={false}
                  />
                  <KonvaText
                    text={String(floorNo)}
                    x={sx}
                    y={sy}
                    width={railW}
                    height={slotH}
                    align="center"
                    verticalAlign="middle"
                    fontSize={railFs}
                    fontStyle="bold"
                    fill={railTextFill}
                    listening={false}
                  />
                </>
              )}
              {/* 비-levelOnly: 기존 슬롯 라벨(R-C) 유지 */}
              {!levelOnly && showCellLabel && (
                <KonvaText
                  text={`${r + 1}-${c + 1}`}
                  x={sx}
                  y={sy}
                  width={slotW}
                  height={slotH}
                  align="center"
                  verticalAlign="middle"
                  fontSize={cellLabelFs}
                  fontStyle="bold"
                  fill={slotLabelFill(cell)}
                  listening={false}
                />
              )}
            </Group>
          );
        }),
      )}
      <KonvaText
        text={code}
        x={0}
        y={H - labelBand}
        width={W}
        height={labelBand}
        align="center"
        verticalAlign="middle"
        fontSize={codeFont}
        fontStyle="bold"
        fill="#1e2a3a"
        listening={false}
      />
    </Group>
  );
}
