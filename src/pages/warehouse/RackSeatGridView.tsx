import { useMemo } from 'react';
import { Stage, Layer, Rect, Text, Group } from 'react-konva';
import type { CanvasShape } from '@/hooks/useCanvasEditor';
import type { SlotStatus } from '@/pages/warehouse/rackSeatSlot';
import { getSlotStatus, cellAddressLabel, SLOT_STATUS_FILL } from '@/pages/warehouse/rackSeatSlot';
import { EDITOR_CANVAS_BG } from '@/pages/warehouse/warehouseEditorCanvasShared';

const FILL = SLOT_STATUS_FILL;

export interface RackSeatGridViewProps {
  shape: CanvasShape | null;
  maxStageW?: number;
  maxStageH?: number;
}

/**
 * 랙 내부 행×열 슬롯 격자 (Konva) + 우하단 범례
 */
export default function RackSeatGridView({ shape, maxStageW = 560, maxStageH = 380 }: RackSeatGridViewProps) {
  const code = String(shape?.data?.code ?? shape?.label ?? '');
  const rackId = Number(shape?.data?.rack_id ?? 0);
  const rows = Math.max(1, Math.min(80, Number(shape?.data?.internal_rows) || 4));
  const cols = Math.max(1, Math.min(80, Number(shape?.data?.internal_cols) || 5));
  const slotStates = shape?.data?.slot_states as Record<string, SlotStatus> | undefined;

  const cw = Math.max(12, Math.min(40, Math.floor(maxStageW / cols)));
  const ch = Math.max(12, Math.min(36, Math.floor(maxStageH / rows)));
  const stageW = cw * cols;
  const stageH = ch * rows;
  const fontSize = Math.max(6, Math.min(10, Math.floor(Math.min(cw, ch) * 0.32)));

  const cells = useMemo(() => {
    const out: JSX.Element[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const st = getSlotStatus(slotStates, r, c, rackId);
        const label = cellAddressLabel(code, r, c, cols);
        out.push(
          <Group key={`${r}-${c}`} x={c * cw} y={r * ch}>
            <Rect width={cw} height={ch} fill={FILL[st]} stroke="#e8e8e8" strokeWidth={0.6} />
            {cw >= 18 && ch >= 16 ? (
              <Text
                x={2}
                y={ch / 2 - fontSize / 2}
                width={cw - 4}
                text={label}
                fontSize={fontSize}
                fill="#f5f5f5"
                align="center"
                listening={false}
              />
            ) : null}
          </Group>,
        );
      }
    }
    return out;
  }, [rows, cols, cw, ch, code, rackId, slotStates, fontSize]);

  if (!shape) return null;

  return (
    <div style={{ position: 'relative', background: EDITOR_CANVAS_BG, borderRadius: 4, overflow: 'auto', maxWidth: '100%' }}>
      <Stage width={stageW} height={stageH}>
        <Layer>{cells}</Layer>
      </Stage>
      <div
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          background: 'rgba(0,0,0,0.65)',
          color: '#f0f0f0',
          padding: '8px 10px',
          borderRadius: 4,
          fontSize: 11,
          lineHeight: 1.6,
          pointerEvents: 'none',
        }}
      >
        <LegendRow color={FILL.stocked} label="재고 있음" />
        <LegendRow color={FILL.empty} label="빈 공간" />
        <LegendRow color={FILL.working} label="작업 중" />
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 14, height: 14, background: color, borderRadius: 2, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}
