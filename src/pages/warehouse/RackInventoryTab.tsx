import { useState, useMemo, useEffect, useRef, Component, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input, Empty, Spin, Tag, Typography, Progress, Collapse, Result, Button as AntButton } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useInventoryByRack } from '@/hooks/useInventoryQuery';
import { useRacks, useZonesByWarehouse } from '@/hooks/useWarehouseQuery';
import { useSuppliers } from '@/hooks/useMasterQuery';
import type { RackInventoryGroup } from '@/api/inventory';
import RackDetailView from './RackDetailView';
import { displayOccupiedCount, zoneRackLocationTotals } from '@/utils/rackInventoryDisplay';
import { findRackGroupForMonitorDeepLink } from '@/utils/rackInventoryDeepLink';

const { Text } = Typography;

/**
 * 랙 상세 렌더 도중 예외가 나도 페이지 전체가 튕기지 않도록 감싸는 경계.
 * 다른 랙 클릭 시 이전 상세에서 던진 에러를 자동으로 리셋한다.
 */
class RackDetailBoundary extends Component<
  { rackKey: string | null; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { rackKey: string | null }) {
    if (prev.rackKey !== this.props.rackKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[RackDetailBoundary] 랙 상세 렌더 실패', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Result
          status="warning"
          title="랙 상세를 표시하지 못했습니다"
          subTitle={this.state.error.message}
          extra={(
            <AntButton onClick={() => this.setState({ error: null })}>다시 시도</AntButton>
          )}
        />
      );
    }
    return this.props.children;
  }
}

interface Props {
  warehouseId: string;
}

/**
 * 창고의 랙별 재고 조회 탭.
 * 왼쪽: 구역 그룹 + 랙 리스트 (검색 가능)
 * 오른쪽: 선택된 랙의 층별 로케이션 + 재고 상세
 */
export default function RackInventoryTab({ warehouseId }: Props) {
  const [searchParams] = useSearchParams();
  const targetLocationId = searchParams.get('locationId');
  const targetLocationCode = searchParams.get('locationCode');
  const targetRackCode = searchParams.get('rackCode');
  const { data, isLoading } = useInventoryByRack(warehouseId);
  const { data: zones = [] } = useZonesByWarehouse(warehouseId);
  // 비활성 랙 차단용 — inventoryByRack 응답에는 is_active 가 없어 master-service 의 useRacks 와 교차 필터한다.
  const { data: rackList = [] } = useRacks({ warehouseId });
  const { data: suppliers = [] } = useSuppliers();
  // rack_id → 협력사 표시 정보 매핑. supplier_id 가 null 이면 "공통".
  const rackSupplierMap = useMemo(() => {
    const supById = new Map(suppliers.map((s) => [s.id, s.name] as const));
    const m = new Map<string, { supplierId: string | null; supplierName: string }>();
    rackList.forEach((r) => {
      const sid = r.supplier_id ?? null;
      m.set(r.id, {
        supplierId: sid,
        supplierName: sid ? (supById.get(sid) ?? '협력사') : '공통',
      });
    });
    return m;
  }, [rackList, suppliers]);
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // URL targetLocationId 기반 자동 선택은 첫 진입 시 1회만.
  // 이후 사용자 클릭을 강제로 되돌리지 않도록 ref 로 처리 여부를 기억.
  const initialAutoSelectDone = useRef(false);

  // 제외 대상 zone — 입고/출고 staging + 비활성 zone
  const excludedZoneIds = useMemo(
    () => new Set(
      zones
        .filter((z) => z.zone_type === 'INBOUND' || z.zone_type === 'OUTBOUND' || z.is_active === false)
        .map((z) => z.id),
    ),
    [zones],
  );
  const activeRackIds = useMemo(
    () => new Set(rackList.filter((r) => r.is_active !== false).map((r) => r.id)),
    [rackList],
  );
  const racks = useMemo(
    () => (data?.racks ?? []).filter(
      (r) => !excludedZoneIds.has(r.zone_id) && activeRackIds.has(r.rack_id),
    ),
    [data, excludedZoneIds, activeRackIds],
  );

  const deepLinkRackId = useMemo(() => {
    const rackMatch = findRackGroupForMonitorDeepLink(racks, {
      locationId: targetLocationId,
      locationCode: targetLocationCode,
      rackCode: targetRackCode,
    });
    return rackMatch?.rack_id ?? null;
  }, [racks, targetLocationId, targetLocationCode, targetRackCode]);

  // URL 기반 자동 선택 — 딥링크는 "첫 진입 시 1회만" 적용. 이후 사용자 클릭이 항상 우선.
  // 이전 구현은 딥링크가 있는 한 매 effect 마다 selectedRackId 를 되돌려서
  // 사용자가 다른 랙을 클릭해도 즉시 원래 랙으로 튕겨나가는 버그가 있었음.
  useEffect(() => {
    if (racks.length === 0) return;
    if (initialAutoSelectDone.current) return;

    if (deepLinkRackId) {
      setSelectedRackId(deepLinkRackId);
      initialAutoSelectDone.current = true;
      return;
    }
    if (!selectedRackId || !racks.find((r) => r.rack_id === selectedRackId)) {
      setSelectedRackId(racks[0].rack_id);
      initialAutoSelectDone.current = true;
    }
  }, [racks, selectedRackId, deepLinkRackId]);

  // 검색 필터 — 협력사명도 포함
  const filteredRacks = useMemo(() => {
    if (!search.trim()) return racks;
    const kw = search.trim().toLowerCase();
    return racks.filter((r) => {
      const sup = rackSupplierMap.get(r.rack_id);
      return r.rack_code.toLowerCase().includes(kw) ||
        (r.rack_name?.toLowerCase().includes(kw) ?? false) ||
        r.zone_code.toLowerCase().includes(kw) ||
        r.zone_name.toLowerCase().includes(kw) ||
        (sup?.supplierName.toLowerCase().includes(kw) ?? false) ||
        r.locations.some(
          (loc) =>
            (loc.product_name?.toLowerCase().includes(kw) ?? false) ||
            (loc.product_sku?.toLowerCase().includes(kw) ?? false),
        );
    });
  }, [racks, search, rackSupplierMap]);

  // 구역별 그룹핑 (왼쪽 nav 표시용)
  const groupedByZone = useMemo(() => {
    const map = new Map<string, { zoneId: string; zoneCode: string; zoneName: string; racks: RackInventoryGroup[] }>();
    filteredRacks.forEach((r) => {
      if (!map.has(r.zone_id)) {
        map.set(r.zone_id, { zoneId: r.zone_id, zoneCode: r.zone_code, zoneName: r.zone_name, racks: [] });
      }
      map.get(r.zone_id)!.racks.push(r);
    });
    return [...map.values()];
  }, [filteredRacks]);

  const selectedRack = useMemo(
    () => racks.find((r) => r.rack_id === selectedRackId) ?? null,
    [racks, selectedRackId],
  );

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />;
  }

  if (racks.length === 0) {
    return (
      <Empty
        description="이 창고에는 아직 랙·로케이션이 없습니다. 구역·랙을 먼저 배치해주세요."
        style={{ marginTop: 80 }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, gap: 12, padding: '8px 12px' }}>
      {/* ── 왼쪽: 랙 리스트 ── */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          background: '#fafbfc',
          border: '1px solid #e8eaed',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 10, borderBottom: '1px solid #e8eaed' }}>
          <Input
            size="small"
            placeholder="랙·구역·상품 검색"
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {groupedByZone.length === 0 ? (
            <Empty description="결과 없음" style={{ marginTop: 40 }} />
          ) : (
            <Collapse
              ghost
              defaultActiveKey={groupedByZone.map((g) => g.zoneId)}
              items={groupedByZone.map((group) => {
                const ztot = zoneRackLocationTotals(group.racks);
                return {
                  key: group.zoneId,
                  label: (
                    <div>
                      <Tag color="blue" style={{ marginRight: 4, fontSize: 10 }}>{group.zoneCode}</Tag>
                      <Text strong style={{ fontSize: 12 }}>{group.zoneName}</Text>
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
                        랙 {group.racks.length}
                        {ztot.cap > 0 && (
                          <span> · 층 점유 {ztot.occ}/{ztot.cap}</span>
                        )}
                      </Text>
                    </div>
                  ),
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {group.racks.map((rack) => {
                        const isSelected = rack.rack_id === selectedRackId;
                        const occ = displayOccupiedCount(rack);
                        const fillPct = rack.location_count > 0
                          ? Math.round((occ / rack.location_count) * 100)
                          : 0;
                        const sup = rackSupplierMap.get(rack.rack_id);
                        const isCommon = !sup?.supplierId;
                        // 긴 코드 줄임 — 마지막 의미 토큰만 표시 (예: SELF-089)
                        const shortId = (rack.rack_code ?? '').split('-').slice(-2).join('-') || rack.rack_code || '';
                        return (
                          <button
                            key={rack.rack_id}
                            type="button"
                            onClick={() => setSelectedRackId(rack.rack_id)}
                            style={{
                              textAlign: 'left',
                              padding: '8px 10px',
                              background: isSelected ? '#e6f4ff' : '#ffffff',
                              border: `1px solid ${isSelected ? '#91caff' : '#e8eaed'}`,
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                            title={rack.rack_code}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              <Tag color={isCommon ? 'green' : 'geekblue'} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 6px' }}>
                                {sup?.supplierName ?? '공통'}
                              </Tag>
                              <Text strong style={{ fontSize: 12 }}>
                                {rack.rack_name || shortId}
                              </Text>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text type="secondary" style={{ fontSize: 10, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                                #{shortId}
                              </Text>
                              <Text type="secondary" style={{ fontSize: 10 }}>
                                {occ}/{rack.location_count}
                              </Text>
                            </div>
                            <Progress percent={fillPct} size="small" showInfo={false} />
                          </button>
                        );
                      })}
                    </div>
                  ),
                };
              })}
            />
          )}
        </div>
      </div>

      {/* ── 오른쪽: 선택된 랙의 상세 — 층이 많아도 내부에서 세로 스크롤 가능하도록 minHeight:0 강제 ── */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedRack ? (
          <RackDetailBoundary rackKey={selectedRack.rack_id}>
            <RackDetailView
              rack={selectedRack}
              supplierName={rackSupplierMap.get(selectedRack.rack_id)?.supplierName}
              isCommonRack={!rackSupplierMap.get(selectedRack.rack_id)?.supplierId}
              highlightLocationId={targetLocationId ?? undefined}
              highlightLocationCode={targetLocationCode ?? undefined}
            />
          </RackDetailBoundary>
        ) : (
          <Empty description="왼쪽에서 랙을 선택하세요" style={{ marginTop: 80 }} />
        )}
      </div>
    </div>
  );
}
