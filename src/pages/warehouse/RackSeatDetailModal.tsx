import { Modal } from 'antd';
import type { CanvasShape } from '@/hooks/useCanvasEditor';
import RackSeatGridView from '@/pages/warehouse/RackSeatGridView';

export type { SlotStatus } from '@/pages/warehouse/rackSeatSlot';
export { slotKey, getSlotStatus } from '@/pages/warehouse/rackSeatSlot';

export interface RackSeatDetailModalProps {
  open: boolean;
  onClose: () => void;
  shape: CanvasShape | null;
}

export default function RackSeatDetailModal({ open, onClose, shape }: RackSeatDetailModalProps) {
  const code = String(shape?.data?.code ?? shape?.label ?? '');
  const cols = Math.max(1, Math.min(80, Number(shape?.data?.internal_cols) || 5));
  const cw = Math.max(12, Math.min(40, Math.floor(560 / cols)));
  const stageW = cw * cols;

  return (
    <Modal
      title={code ? `[${code}] 랙 내부 배치` : '랙 내부 배치'}
      open={open}
      onCancel={onClose}
      footer={null}
      width={Math.min(640, stageW + 48)}
      destroyOnHidden
    >
      <RackSeatGridView shape={shape} maxStageW={560} maxStageH={380} />
      <p style={{ marginTop: 8, marginBottom: 0, color: '#8c8c8c', fontSize: 12 }}>
        행·열은 우측 속성에서 조정할 수 있습니다. 슬롯 상태는 저장 시 함께 보관됩니다(목업).
      </p>
    </Modal>
  );
}
