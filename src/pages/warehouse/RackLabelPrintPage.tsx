import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Typography, Card, Select, Button, Checkbox, Space, Empty, Spin,
  Segmented, Divider, Tag, message,
} from 'antd';
import { PrinterOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useReactToPrint } from 'react-to-print';
import { useMasterWarehouses, useZonesByWarehouse, useRacks } from '@/hooks/useWarehouseQuery';
import { getWarehouses } from '@/api/warehouse';
import { useQuery } from '@tanstack/react-query';
import RackQrLabel from '@/components/RackQrLabel';
import type { Rack, Zone } from '@/types/warehouse';

const { Title, Text } = Typography;

/** 인쇄 시트 크기 옵션 — 한 페이지에 들어갈 라벨 개수와 1장 크기를 함께 정함 */
const SHEET_PRESETS: Record<string, { cols: number; sizeMm: number; label: string }> = {
  small: { cols: 4, sizeMm: 45, label: '작게 (4×N, 45mm)' },
  medium: { cols: 3, sizeMm: 60, label: '보통 (3×N, 60mm)' },
  large: { cols: 2, sizeMm: 90, label: '크게 (2×N, 90mm)' },
};

export default function RackLabelPrintPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialWh = searchParams.get('wh') ?? '';
  const initialZone = searchParams.get('zone') ?? '';
  const initialIds = (searchParams.get('ids') ?? '').split(',').filter(Boolean);
  const autoPrint = searchParams.get('autoPrint') === '1';

  const [warehouseId, setWarehouseId] = useState<string>(initialWh);
  const [zoneId, setZoneId] = useState<string>(initialZone);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [sheetSize, setSheetSize] = useState<keyof typeof SHEET_PRESETS>('medium');

  // 창고/존/랙 데이터 — 라벨에 코드/이름을 같이 박기 위해 모두 필요
  const { data: masterWarehouses = [] } = useMasterWarehouses();
  // 라벨에 표시할 창고 코드/이름은 master-service에 없을 수 있어 warehouse-service도 같이 사용
  const { data: warehousesFull = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => getWarehouses() });
  const { data: zones = [] } = useZonesByWarehouse(warehouseId);
  const rackParams = useMemo(
    () => (zoneId ? { zoneId } : warehouseId ? { warehouseId } : undefined),
    [warehouseId, zoneId],
  );
  const { data: racks = [], isLoading: racksLoading } = useRacks(rackParams);

  // 창고 메타 — code/name lookup
  const warehouseMeta = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    warehousesFull.forEach((w) => m.set(w.id, { code: w.code, name: w.name }));
    masterWarehouses.forEach((w) => { if (!m.has(w.id)) m.set(w.id, { code: w.code, name: w.name }); });
    return m;
  }, [warehousesFull, masterWarehouses]);
  const zoneMeta = useMemo(() => {
    const m = new Map<string, Zone>();
    zones.forEach((z) => m.set(z.id, z));
    return m;
  }, [zones]);

  // URL 동기화 — 새로고침/공유 시 동일 상태 복원
  useEffect(() => {
    const next = new URLSearchParams();
    if (warehouseId) next.set('wh', warehouseId);
    if (zoneId) next.set('zone', zoneId);
    if (selectedIds.length > 0) next.set('ids', selectedIds.join(','));
    setSearchParams(next, { replace: true });
  }, [warehouseId, zoneId, selectedIds, setSearchParams]);

  // 선택 후보 — 현재 필터(창고/존)에 해당하는 랙
  const filteredRacks = useMemo(() => racks.filter((r) => r.is_active !== false), [racks]);

  const filteredIdSet = useMemo(() => new Set(filteredRacks.map((r) => r.id)), [filteredRacks]);
  const selectedAll = filteredRacks.length > 0 && filteredRacks.every((r) => selectedIds.includes(r.id));
  const someSelected = filteredRacks.some((r) => selectedIds.includes(r.id));

  const toggleSelectAll = () => {
    if (selectedAll) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredRacks.map((r) => r.id)])));
    }
  };
  const toggleOne = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // 미리보기/인쇄 대상 — 선택 ID 순서를 유지하되, 데이터는 현재 로드된 racks에서 찾음
  const rackById = useMemo(() => {
    const m = new Map<string, Rack>();
    racks.forEach((r) => m.set(r.id, r));
    return m;
  }, [racks]);
  const labelsToPrint = useMemo(
    () => selectedIds.map((id) => rackById.get(id)).filter((r): r is Rack => !!r),
    [selectedIds, rackById],
  );

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `랙 라벨 (${labelsToPrint.length}장)`,
  });
  const triggerPrint = () => {
    if (labelsToPrint.length === 0) {
      message.warning('인쇄할 라벨을 먼저 선택해 주세요.');
      return;
    }
    if (!printRef.current) {
      message.warning('잠시 후 다시 시도해 주세요.');
      return;
    }
    void handlePrint();
  };

  // 외부에서 ids로 진입한 경우, 데이터가 로드되면 자동 인쇄
  const autoPrintFiredRef = useRef(false);
  useEffect(() => {
    if (!autoPrint) return;
    if (autoPrintFiredRef.current) return;
    if (labelsToPrint.length === 0) return;
    autoPrintFiredRef.current = true;
    setTimeout(() => triggerPrint(), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrint, labelsToPrint.length]);

  const preset = SHEET_PRESETS[sheetSize];

  return (
    <div style={{ padding: 16 }}>
      {/* 인쇄 시 숨길 헤더/툴바 */}
      <div className="no-print" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>뒤로</Button>
        <Title level={4} style={{ margin: 0 }}>랙 QR 라벨 인쇄</Title>
        <Text type="secondary">현장 부착용 — 모바일 앱이 이 QR을 스캔합니다</Text>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>라벨 크기</Text>
          <Segmented
            value={sheetSize}
            onChange={(v) => setSheetSize(v as keyof typeof SHEET_PRESETS)}
            options={Object.entries(SHEET_PRESETS).map(([k, v]) => ({ label: v.label, value: k }))}
          />
          <Button type="primary" icon={<PrinterOutlined />} onClick={triggerPrint} disabled={labelsToPrint.length === 0}>
            인쇄 ({labelsToPrint.length}장)
          </Button>
        </div>
      </div>

      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        {/* 좌측 — 선택 패널 */}
        <Card size="small" title="대상 랙 선택">
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>창고</Text>
              <Select
                value={warehouseId || undefined}
                onChange={(v) => { setWarehouseId(v); setZoneId(''); }}
                placeholder="창고 선택"
                style={{ width: '100%', marginTop: 4 }}
                options={masterWarehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
                showSearch
                optionFilterProp="label"
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>존 (선택)</Text>
              <Select
                value={zoneId || undefined}
                onChange={(v) => setZoneId(v ?? '')}
                placeholder="전체 존"
                style={{ width: '100%', marginTop: 4 }}
                allowClear
                disabled={!warehouseId}
                options={zones.map((z) => ({ value: z.id, label: `${z.code} — ${z.name}` }))}
                showSearch
                optionFilterProp="label"
              />
            </div>

            <Divider style={{ margin: '6px 0' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Checkbox
                checked={selectedAll}
                indeterminate={!selectedAll && someSelected}
                onChange={toggleSelectAll}
                disabled={filteredRacks.length === 0}
              >
                현재 목록 전체 선택
              </Checkbox>
              <Tag>{selectedIds.length} / {filteredRacks.length}</Tag>
            </div>

            <div style={{ maxHeight: 480, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 4, padding: 6 }}>
              {racksLoading ? (
                <div style={{ padding: 20, textAlign: 'center' }}><Spin /></div>
              ) : filteredRacks.length === 0 ? (
                <Empty description="랙이 없습니다" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                filteredRacks.map((r) => {
                  const z = zoneMeta.get(r.zone_id);
                  return (
                    <div key={r.id} style={{ padding: '4px 6px' }}>
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleOne(r.id)}
                      >
                        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 600 }}>
                          {r.code}
                        </span>
                        {r.name && <span style={{ color: '#666', marginLeft: 6, fontSize: 12 }}>{r.name}</span>}
                        {z && <Tag color="blue" style={{ marginLeft: 6 }}>{z.code}</Tag>}
                      </Checkbox>
                    </div>
                  );
                })
              )}
            </div>

            {selectedIds.length > 0 && (
              <Button onClick={() => setSelectedIds([])} block>선택 초기화</Button>
            )}
          </Space>
        </Card>

        {/* 우측 — 미리보기 (이 영역만 인쇄됨) */}
        <Card size="small" title={`미리보기 — ${labelsToPrint.length}장`}>
          {labelsToPrint.length === 0 ? (
            <Empty description="좌측에서 인쇄할 랙을 선택하세요" />
          ) : (
            <div ref={printRef}>
              <LabelSheet
                labels={labelsToPrint}
                cols={preset.cols}
                sizeMm={preset.sizeMm}
                warehouseMeta={warehouseMeta}
                zoneMeta={zoneMeta}
              />
            </div>
          )}
        </Card>
      </div>

      {/* 인쇄 전용 영역 — 화면 미리보기와 동일한 ref를 쓰므로 별도 노드는 불필요 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 8mm; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}

interface LabelSheetProps {
  labels: Rack[];
  cols: number;
  sizeMm: number;
  warehouseMeta: Map<string, { code: string; name: string }>;
  zoneMeta: Map<string, Zone>;
}

function LabelSheet({ labels, cols, sizeMm, warehouseMeta, zoneMeta }: LabelSheetProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, ${sizeMm}mm)`,
        gap: '4mm',
        padding: '2mm',
        background: '#fff',
      }}
    >
      {labels.map((r) => {
        const wh = warehouseMeta.get(r.warehouse_id);
        const z = zoneMeta.get(r.zone_id);
        return (
          <RackQrLabel
            key={r.id}
            rackId={r.id}
            rackCode={r.code}
            rackName={r.name}
            zoneCode={z?.code}
            zoneName={z?.name}
            warehouseCode={wh?.code}
            warehouseName={wh?.name}
            sizeMm={sizeMm}
          />
        );
      })}
    </div>
  );
}
