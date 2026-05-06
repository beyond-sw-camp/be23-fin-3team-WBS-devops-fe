import { Button, Space, Tooltip, Divider } from 'antd';
import {
  EditOutlined,
  SelectOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  UndoOutlined,
  SaveOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { EditorMode } from '@/hooks/useCanvasEditor';

interface Props {
  mode: EditorMode;
  onModeChange: (m: EditorMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onUndo: () => void;
  onSave: () => void | Promise<void>;
  onDelete?: () => void;
  hasSelection?: boolean;
  savePending?: boolean;
}

export default function CanvasToolbar({
  mode, onModeChange, onZoomIn, onZoomOut, onZoomFit, onUndo, onSave, onDelete, hasSelection, savePending,
}: Props) {
  return (
    <Space style={{ marginBottom: 12 }}>
      <Tooltip title="선택 모드">
        <Button
          type={mode === 'select' ? 'primary' : 'default'}
          icon={<SelectOutlined />}
          onClick={() => onModeChange('select')}
        />
      </Tooltip>
      <Tooltip title="그리기 모드">
        <Button
          type={mode === 'draw' ? 'primary' : 'default'}
          icon={<EditOutlined />}
          onClick={() => onModeChange('draw')}
        />
      </Tooltip>
      <Divider type="vertical" />
      <Tooltip title="줌인">
        <Button icon={<ZoomInOutlined />} onClick={onZoomIn} />
      </Tooltip>
      <Tooltip title="줌아웃">
        <Button icon={<ZoomOutOutlined />} onClick={onZoomOut} />
      </Tooltip>
      <Tooltip title="전체 보기">
        <Button icon={<ExpandOutlined />} onClick={onZoomFit} />
      </Tooltip>
      <Divider type="vertical" />
      <Tooltip title="실행 취소 (Ctrl+Z)">
        <Button icon={<UndoOutlined />} onClick={onUndo} />
      </Tooltip>
      {onDelete && (
        <Tooltip title="삭제 (Delete)">
          <Button icon={<DeleteOutlined />} danger disabled={!hasSelection} onClick={onDelete} />
        </Tooltip>
      )}
      <Divider type="vertical" />
      <Button type="primary" icon={<SaveOutlined />} loading={savePending} onClick={() => void onSave()}>
        저장
      </Button>
    </Space>
  );
}
