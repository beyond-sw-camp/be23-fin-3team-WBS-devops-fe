import { forwardRef, useMemo } from 'react';
import { Group, Rect, Text } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { CanvasShape } from '@/hooks/useCanvasEditor';
import type { EditorMode } from '@/hooks/useCanvasEditor';
import type { SlotStatus } from '@/pages/warehouse/rackSeatSlot';
import { getSlotStatus, SLOT_STATUS_FILL, cellAddressLabel } from '@/pages/warehouse/rackSeatSlot';

export interface RackSeatMapShapeProps {
  s: CanvasShape;
  selected: boolean;
  mode: EditorMode;
  onSelect: (e: KonvaEventObject<MouseEvent>) => void;
  onDblClick: (e: KonvaEventObject<MouseEvent>) => void;
  onDragStart?: (e: KonvaEventObject<DragEvent>) => void;
  onDragMove?: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onTransformEnd: () => void;
}

/**
 * 구역 랙 편집 캔버스용 — 랙을 좌석표(행×열 슬롯) 형태로 표시
 */
const RackSeatMapShape = forwardRef<Konva.Group, RackSeatMapShapeProps>(function RackSeatMapShape(
  { s, selected, mode, onSelect, onDblClick, onDragStart, onDragMove, onDragEnd, onTransformEnd },
  ref,
) {
  const rows = Math.max(1, Math.min(80, Number(s.data?.internal_rows) || 4));
  const cols = Math.max(1, Math.min(80, Number(s.data?.internal_cols) || 5));
  const rackId = Number(s.data?.rack_id ?? 0);
  const code = String(s.data?.code ?? s.label ?? '');
  const slotStates = s.data?.slot_states as Record<string, SlotStatus> | undefined;

  const headerH = Math.max(10, Math.min(22, s.height * 0.15));
  const gridTop = headerH;
  const gridH = Math.max(1, s.height - headerH);
  const cw = s.width / cols;
  const ch = gridH / rows;
  const headerText = code.trim().length > 0
    ? (s.width >= 96 && code.length <= 14
      ? code
      : code.length <= 6
        ? code
        : `${code.slice(0, 4)}…`)
    : '';
  const stroke = selected ? '#e2e8f0' : s.stroke;
  const strokeW = selected ? 2.2 : 1.2;

  const cells = useMemo(() => {
    const out: JSX.Element[] = [];
    const fontSize = Math.max(4, Math.min(8, Math.min(cw, ch) * 0.26));
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const st = getSlotStatus(slotStates, r, c, rackId);
        const fill = SLOT_STATUS_FILL[st];
        const x = c * cw;
        const y = gridTop + r * ch;
        const label = cellAddressLabel(code, r, c, cols);
        out.push(
          <Group key={`${r}-${c}`} x={x} y={y}>
            <Rect width={cw} height={ch} fill={fill} stroke="#c4b8a8" strokeWidth={0.35} />
            {cw >= 12 && ch >= 10 ? (
              <Text
                x={0}
                y={ch / 2 - fontSize / 2}
                width={cw}
                text={label}
                fontSize={fontSize}
                fill="rgba(250,248,245,0.9)"
                align="center"
                listening={false}
              />
            ) : null}
          </Group>,
        );
      }
    }
    return out;
  }, [rows, cols, cw, ch, gridTop, rackId, slotStates, code, s.width, s.height]);

  return (
    <Group
      ref={ref}
      x={s.x}
      y={s.y}
      draggable={mode === 'select'}
      onClick={onSelect}
      onDblClick={onDblClick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      <Rect
        width={s.width}
        height={s.height}
        fill="#262626"
        stroke={stroke}
        strokeWidth={strokeW}
        cornerRadius={2}
        shadowBlur={selected ? 12 : 0}
        shadowColor="rgba(248, 250, 252, 0.4)"
        shadowOpacity={selected ? 1 : 0}
      />
      <Rect x={0} y={0} width={s.width} height={headerH} fill="#4a4a4a" stroke="#6b6b6b" strokeWidth={0.5} />
      <Text
        x={0}
        y={headerH / 2 - Math.min(6, headerH * 0.25)}
        width={s.width}
        text={headerText}
        fontSize={Math.min(12, headerH * 0.52)}
        fontStyle="bold"
        fill="#ececec"
        align="center"
        listening={false}
      />
      {cells}
    </Group>
  );
});

export default RackSeatMapShape;
