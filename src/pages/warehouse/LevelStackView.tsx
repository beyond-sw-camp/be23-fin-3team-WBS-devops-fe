import { useState, useEffect, useMemo } from 'react';
import { Button, Slider, InputNumber, App, Typography, Empty, Spin, Space, Card, Tooltip } from 'antd';
import { SaveOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import { useRacks, useUpdateRack } from '@/hooks/useWarehouseQuery';
import {
  bulkUpdateRackLocationMaxCapacity,
  updateLocationMaxCapacity,
} from '@/api/layoutEditorV2';
import { extractApiErrorMessage } from '@/utils/apiError';
import type { RackLocationInventory } from '@/api/inventory';

const { Text, Title } = Typography;

const PASTEL_PALETTE = [
  { bg: '#fce4ec', border: '#c62828', tagBg: '#ffffff', tagBorder: '#c62828', tagColor: '#c62828' },
  { bg: '#fff8e1', border: '#f9a825', tagBg: '#ffffff', tagBorder: '#f9a825', tagColor: '#f9a825' },
  { bg: '#e3f2fd', border: '#1565c0', tagBg: '#ffffff', tagBorder: '#1565c0', tagColor: '#1565c0' },
  { bg: '#f3e5f5', border: '#7b1fa2', tagBg: '#ffffff', tagBorder: '#7b1fa2', tagColor: '#7b1fa2' },
  { bg: '#e8f5e9', border: '#2e7d32', tagBg: '#ffffff', tagBorder: '#2e7d32', tagColor: '#2e7d32' },
  { bg: '#fff3e0', border: '#e65100', tagBg: '#ffffff', tagBorder: '#e65100', tagColor: '#e65100' },
];

const EMPTY_STYLE = {
  bg: '#f5f5f5',
  border: '#bdbdbd',
  tagBg: '#ffffff',
  tagBorder: '#bdbdbd',
  tagColor: '#757575',
};

function skuPaletteIndex(sku: string): number {
  let h = 0;
  for (let i = 0; i < sku.length; i++) h = (h * 31 + sku.charCodeAt(i)) | 0;
  return Math.abs(h) % PASTEL_PALETTE.length;
}

interface Props {
  warehouseId: string;
  rackId: string;
  readonly?: boolean;
  highlightLocationIds?: Set<string>;
}

export default function LevelStackView({
  warehouseId,
  rackId,
  readonly = false,
  highlightLocationIds,
}: Props) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const { data: byRack, isLoading: invLoading } = useInventoryByRack(warehouseId || null);
  const { data: racks = [], isLoading: racksLoading } = useRacks({ warehouseId });
  const updateRack = useUpdateRack();

  const [locPulse, setLocPulse] = useState(0);
  useEffect(() => {
    if (!highlightLocationIds || highlightLocationIds.size === 0) return;
    const t = window.setInterval(() => setLocPulse((p) => p + 1), 500);
    return () => window.clearInterval(t);
  }, [highlightLocationIds]);

  const rack = useMemo(() => racks.find((r) => r.id === rackId), [racks, rackId]);
  const rackGroup = useMemo(
    () => byRack?.racks.find((r) => r.rack_id === rackId),
    [byRack, rackId],
  );

  const [levelCount, setLevelCount] = useState<number>(rack?.level_no ?? 1);
  useEffect(() => {
    if (rack) setLevelCount(rack.level_no ?? 1);
  }, [rack]);

  const dirty = rack ? levelCount !== (rack.level_no ?? 1) : false;

  const handleSave = async () => {
    if (!rack || !dirty) return;
    try {
      await updateRack.mutateAsync({ id: rack.id, data: { level_no: levelCount } });
      message.success('층수를 저장했습니다.');
    } catch {
      message.error('층수 저장에 실패했습니다.');
    }
  };

  // 일괄 수용량 적용 (랙 전체 location)
  const [bulkMaxCapacity, setBulkMaxCapacity] = useState<number | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const handleBulkApply = () => {
    if (!rackId) return;
    if (bulkMaxCapacity == null || bulkMaxCapacity <= 0) {
      message.warning('수용량은 1 이상이어야 합니다.');
      return;
    }
    modal.confirm({
      title: '랙 전체 층 수용량을 일괄 변경합니다',
      content: `이 랙의 모든 층을 maxCapacity = ${bulkMaxCapacity} 로 일괄 변경합니다. 마스터 데이터가 즉시 반영됩니다.`,
      okText: '변경',
      cancelText: '취소',
      onOk: async () => {
        setBulkSaving(true);
        try {
          const updated = await bulkUpdateRackLocationMaxCapacity(rackId, bulkMaxCapacity);
          await qc.invalidateQueries({ queryKey: ['inventory-by-rack'] });
          message.success(`${updated}개 층의 수용량을 변경했습니다.`);
          setBulkMaxCapacity(null);
        } catch (e) {
          message.error(extractApiErrorMessage(e, '일괄 변경 실패'));
        } finally {
          setBulkSaving(false);
        }
      },
    });
  };

  // 개별 수용량 인라인 편집
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<number | null>(null);
  const [savingPerLocation, setSavingPerLocation] = useState(false);
  const startEdit = (locationId: string, currentMax: number | null) => {
    setEditingLocationId(locationId);
    setEditingValue(currentMax ?? null);
  };
  const cancelEdit = () => {
    setEditingLocationId(null);
    setEditingValue(null);
  };
  const handleSaveEdit = async () => {
    if (!editingLocationId) return;
    if (editingValue == null || editingValue <= 0) {
      message.warning('수용량은 1 이상이어야 합니다.');
      return;
    }
    setSavingPerLocation(true);
    try {
      await updateLocationMaxCapacity(editingLocationId, editingValue);
      await qc.invalidateQueries({ queryKey: ['inventory-by-rack'] });
      message.success('수용량을 변경했습니다.');
      cancelEdit();
    } catch (e) {
      message.error(extractApiErrorMessage(e, '수용량 변경 실패'));
    } finally {
      setSavingPerLocation(false);
    }
  };

  const byFloor = useMemo(() => {
    const m = new Map<number, RackLocationInventory>();
    rackGroup?.locations.forEach((l) => m.set(l.floor_no, l));
    return m;
  }, [rackGroup]);

  const loading = invLoading || racksLoading;

  return (
    <div className="rack-layout-editor-dark" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#f0f3f8' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* ── 좌측: 컨트롤 패널 — readonly 시 숨김 ── */}
        {!readonly &&
        <aside style={{
          width: 280,
          background: '#ffffff',
          borderRight: '1px solid #e0e0e0',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>층수 설정</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Slider
                style={{ flex: 1 }}
                min={1}
                max={24}
                value={levelCount}
                onChange={(v) => setLevelCount(v as number)}
              />
              <InputNumber
                size="small"
                min={1}
                max={24}
                value={levelCount}
                onChange={(v) => setLevelCount(Number(v ?? 1))}
                style={{ width: 60 }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 4 }}>
              {rack && rack.level_no !== levelCount && (
                <span style={{ color: '#f5a623' }}>
                  변경됨 (저장 전: {rack.level_no}층)
                </span>
              )}
            </div>
          </div>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            disabled={!dirty || updateRack.isPending}
            loading={updateRack.isPending}
            onClick={handleSave}
            block
          >
            층수 저장
          </Button>

          {/* ── 수용량 일괄 변경 ── */}
          <div>
            <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              수용량 일괄 변경
            </Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <InputNumber
                size="small"
                min={1}
                value={bulkMaxCapacity ?? undefined}
                onChange={(v) => setBulkMaxCapacity(v == null ? null : Number(v))}
                placeholder="예: 200"
                style={{ flex: 1 }}
              />
              <Button
                size="small"
                type="primary"
                onClick={handleBulkApply}
                loading={bulkSaving}
                disabled={bulkMaxCapacity == null || bulkMaxCapacity <= 0}
              >
                전체 적용
              </Button>
            </div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4, lineHeight: 1.4 }}>
              이 랙의 모든 층 maxCapacity 를 일괄 변경합니다. 현재 보관량이 더 많은 층이 있으면 BE 에서 거부됩니다.
            </Text>
          </div>

          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Text style={{ fontSize: 11, color: '#9e9e9e' }}>핵심 규칙</Text>
              <Text style={{ fontSize: 12 }}>한 층 = 하나의 거대한 로케이션</Text>
              <Text style={{ fontSize: 12 }}>한 층 = 오직 1개 SKU만 적재</Text>
              <Text style={{ fontSize: 12, color: '#94a3b8' }}>층마다 ✏️ 클릭 = 개별 변경</Text>
            </Space>
          </Card>
        </aside>}

        {/* ── 메인: 정면도 ── */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '44px 40px 32px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spin />
            </div>
          ) : !rack ? (
            <Empty description="랙을 찾을 수 없습니다." />
          ) : (
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
              <div style={{ marginBottom: 20 }}>
                <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
                  {rack.code}
                </Title>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  상세 로케이션 (정면도) · 위에서 아래 = 높은 층 → 낮은 층
                </Text>
              </div>
              <RackFrontView
                levelCount={levelCount}
                byFloor={byFloor}
                rackCode={rack.code}
                highlightLocationIds={highlightLocationIds}
                pulse={locPulse}
                editable={!readonly}
                editingLocationId={editingLocationId}
                editingValue={editingValue}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onSaveEdit={handleSaveEdit}
                onChangeValue={setEditingValue}
                saving={savingPerLocation}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CapacityEditProps {
  editable?: boolean;
  editingLocationId?: string | null;
  editingValue?: number | null;
  onStartEdit?: (locationId: string, currentMax: number | null) => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
  onChangeValue?: (v: number | null) => void;
  saving?: boolean;
}

/** 랙 정면도 — 1층이 맨 밑, 위로 갈수록 층 번호 증가 */
function RackFrontView({
  levelCount,
  byFloor,
  rackCode,
  highlightLocationIds,
  pulse,
  editable,
  editingLocationId,
  editingValue,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeValue,
  saving,
}: {
  levelCount: number;
  byFloor: Map<number, RackLocationInventory>;
  rackCode: string;
  highlightLocationIds?: Set<string>;
  pulse?: number;
} & CapacityEditProps) {
  const floors: number[] = [];
  for (let i = levelCount; i >= 1; i--) floors.push(i);

  return (
    <div
      style={{
        border: '2px solid #455a64',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#ffffff',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}
    >
      {/* 랙 상단 캡 */}
      <div style={{
        height: 8,
        background: 'linear-gradient(180deg, #607d8b 0%, #455a64 100%)',
      }} />

      {floors.map((floor, idx) => {
        const loc = byFloor.get(floor) ?? null;
        const isHighlighted = !!(loc && highlightLocationIds?.has(loc.location_id));
        return (
          <LevelBar
            key={floor}
            floor={floor}
            loc={loc}
            rackCode={rackCode}
            isLast={idx === floors.length - 1}
            highlighted={isHighlighted}
            pulse={pulse ?? 0}
            editable={editable}
            editingLocationId={editingLocationId}
            editingValue={editingValue}
            onStartEdit={onStartEdit}
            onCancelEdit={onCancelEdit}
            onSaveEdit={onSaveEdit}
            onChangeValue={onChangeValue}
            saving={saving}
          />
        );
      })}

      {/* 랙 하단 캡 (바닥) */}
      <div style={{
        height: 12,
        background: 'linear-gradient(180deg, #455a64 0%, #263238 100%)',
      }} />
    </div>
  );
}

function LevelBar({
  floor,
  loc,
  rackCode,
  isLast,
  highlighted = false,
  pulse = 0,
  editable,
  editingLocationId,
  editingValue,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeValue,
  saving,
}: {
  floor: number;
  loc: RackLocationInventory | null;
  rackCode: string;
  isLast: boolean;
  highlighted?: boolean;
  pulse?: number;
} & CapacityEditProps) {
  const hasStock = !!loc && loc.total_qty > 0;
  const sku = loc?.product_sku ?? null;

  const style = hasStock && sku
    ? PASTEL_PALETTE[skuPaletteIndex(sku)]
    : EMPTY_STYLE;

  const locationCode = loc?.location_code
    ?? `LC-${rackCode}-${String(floor).padStart(2, '0')}`;
  // 랙 식별자(SELF-069)와 층(08)만 남겨서 표기 — 끝에서 3 segment
  const segments = locationCode.split('-');
  const shortCode = segments.slice(-3).join('-');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: highlighted ? (pulse % 2 === 0 ? '#e6fffb' : '#b5f5ec') : style.bg,
        borderBottom: isLast ? 'none' : '1px dashed #cfd8dc',
        minHeight: 64,
        boxShadow: highlighted ? `inset 0 0 0 ${pulse % 2 === 0 ? 1 : 2}px #13c2c2` : undefined,
        transition: 'background 0.3s, box-shadow 0.3s',
      }}
    >
      {/* 좌측: 층 번호 (크게, 가로 배치) */}
      <div
        style={{
          width: 72,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          background: hasStock ? style.tagBorder : '#eceff1',
          color: hasStock ? '#ffffff' : '#455a64',
          borderRight: `2px solid ${hasStock ? style.border : '#cfd8dc'}`,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
          {floor}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>
          층
        </span>
      </div>

      {/* 가운데: 로케이션 코드 (단축) */}
      <div style={{
        flex: '0 1 auto',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        minWidth: 0,
      }}>
        <span
          title={locationCode}
          style={{
            fontSize: 12,
            color: '#90a4ae',
            fontFamily: 'ui-monospace, Menlo, monospace',
            letterSpacing: 0.2,
            whiteSpace: 'nowrap',
          }}
        >
          {shortCode}
        </span>
      </div>

      {/* 우측: SKU 정보 또는 비어 있음 + 수용량 + 편집 버튼 */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 20px',
        gap: 12,
      }}>
        {hasStock && sku ? (
          <>
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#37474f',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {loc.product_name || sku}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 2,
              padding: '4px 10px',
              borderRadius: 6,
              background: '#ffffff',
              border: `1px solid ${style.tagBorder}`,
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: style.tagColor }}>
                {loc.total_qty.toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: '#78909c' }}>개</span>
            </span>
          </>
        ) : (
          <span style={{
            fontSize: 12,
            color: '#b0bec5',
            fontStyle: 'italic',
          }}>
            비어 있음
          </span>
        )}

        {/* 수용량 표기 + 편집 — loc 가 있어야 변경 가능 */}
        {loc && (
          editable && editingLocationId === loc.location_id ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 6px',
                borderRadius: 6,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                flexShrink: 0,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <InputNumber
                size="small"
                min={1}
                value={editingValue ?? undefined}
                onChange={(v) => onChangeValue?.(v == null ? null : Number(v))}
                onPressEnter={() => onSaveEdit?.()}
                style={{ width: 80 }}
                autoFocus
              />
              <Button
                size="small"
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => onSaveEdit?.()}
                loading={saving}
                disabled={editingValue == null || editingValue <= 0}
              />
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={() => onCancelEdit?.()}
                disabled={saving}
              />
            </div>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                borderRadius: 6,
                background: '#ffffff',
                border: '1px dashed #cbd5e1',
                fontSize: 11,
                color: '#64748b',
                flexShrink: 0,
              }}
            >
              <span>수용</span>
              <b style={{ color: '#0f172a' }}>
                {loc.max_capacity != null && loc.max_capacity > 0
                  ? loc.max_capacity.toLocaleString()
                  : '미설정'}
              </b>
              {editable && (
                <Tooltip title="이 층의 수용량 변경">
                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => onStartEdit?.(loc.location_id, loc.max_capacity ?? null)}
                    style={{ padding: '0 4px', height: 20 }}
                  />
                </Tooltip>
              )}
            </span>
          )
        )}
      </div>
    </div>
  );
}
