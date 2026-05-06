import { useMemo } from 'react';
import { Typography, Card, Progress, Tag, Empty, Popover, Button } from 'antd';
import { AppstoreOutlined, QrcodeOutlined, PrinterOutlined } from '@ant-design/icons';
import type { RackInventoryGroup, RackLocationInventory } from '@/api/inventory';
import { useInventoryTransactions } from '@/hooks/useInventoryQuery';
import OrderQrBadge from '@/components/OrderQrBadge';
import { displayOccupiedCount } from '@/utils/rackInventoryDisplay';

const TX_TYPE_LABEL: Record<string, string> = {
  inbound: '입고', outbound: '출고', reserve: '예약', unreserve: '예약해제',
  transfer: '이동', adjust: '조정', dispose: '폐기', returned: '반품', inspect: '검수',
};

const { Text } = Typography;

interface Props {
  rack: RackInventoryGroup;
  /** true 면 헤더(랙코드/구역) 숨김 — Drawer 등에서 제목을 상위에서 처리할 때 */
  hideHeader?: boolean;
  /** 컴팩트 모드 — Drawer 등 좁은 공간에서 폰트·패딩 축소 */
  compact?: boolean;
  highlightLocationId?: string;
  /** locationId 가 BE 간 불일치일 때(불량존 등) location_code 로 강조 */
  highlightLocationCode?: string;
  /** 협력사명 — 헤더에 협력사 태그로 노출. undefined 면 미표시 */
  supplierName?: string;
  /** 공통존(협력사 미지정) 랙 여부 — true 면 초록 태그, false 면 파란 태그 */
  isCommonRack?: boolean;
}

/**
 * 랙 하나의 상세를 층 리스트 형태로 표시.
 * 랙별 재고 탭과 모니터링 Drawer 양쪽에서 재사용한다.
 */
export default function RackDetailView({
  rack, hideHeader = false, compact = false, highlightLocationId, highlightLocationCode,
  supplierName, isCommonRack,
}: Props) {
  // 큰 층수부터 — 실제 창고에서 위를 올려다보는 관점
  const sortedLocations = useMemo(
    () => [...rack.locations].sort((a, b) => b.floor_no - a.floor_no),
    [rack.locations],
  );
  const occCount = displayOccupiedCount(rack);
  const occPct = rack.location_count > 0
    ? Math.round((occCount / rack.location_count) * 100)
    : 0;

  const hId = (highlightLocationId ?? '').trim();
  const hCode = (highlightLocationCode ?? '').trim();
  const isRowHighlighted = (loc: RackLocationInventory) => {
    if (hId && (loc.location_id ?? '').toLowerCase() === hId.toLowerCase()) return true;
    if (hCode) {
      const c = (loc.location_code ?? '').trim();
      if (c && (c === hCode || c.endsWith(hCode) || hCode.endsWith(c))) return true;
    }
    return false;
  };

  // 집계 — 가용 외 수량도 함께 표시
  const totals = useMemo(() => {
    let available = 0, reserved = 0, pending = 0, defect = 0, total = 0, capacity = 0;
    rack.locations.forEach((loc) => {
      available += loc.available_qty;
      reserved += loc.reserved_qty;
      pending += loc.pending_qty;
      defect += loc.defect_qty;
      total += loc.total_qty;
      if (loc.max_capacity != null && loc.max_capacity > 0) capacity += loc.max_capacity;
    });
    return { available, reserved, pending, defect, total, capacity };
  }, [rack.locations]);
  const fillPct = totals.capacity > 0
    ? Math.min(100, Math.round((totals.total / totals.capacity) * 100))
    : (rack.location_count > 0 ? Math.round((rack.occupied_count / rack.location_count) * 100) : 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {!hideHeader && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <AppstoreOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            {supplierName && (
              <Tag color={isCommonRack ? 'green' : 'geekblue'} style={{ margin: 0, fontWeight: 600 }}>
                {supplierName}
              </Tag>
            )}
            <Text strong style={{ fontSize: 18 }}>
              {rack.rack_name || (rack.rack_code ?? '').split('-').slice(-2).join('-') || '-'}
            </Text>
            <Popover
              content={
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <OrderQrBadge value={`rack:${rack.rack_id}`} label={rack.rack_code} title="랙 QR" size={120} />
                  <Button
                    size="small"
                    icon={<PrinterOutlined />}
                    onClick={() => window.open(
                      `/warehouse/rack-labels?zone=${rack.zone_id}&ids=${rack.rack_id}&autoPrint=1`,
                      '_blank',
                    )}
                  >
                    라벨 인쇄
                  </Button>
                </div>
              }
              trigger="click"
            >
              <QrcodeOutlined style={{ fontSize: 16, color: '#64748b', cursor: 'pointer' }} />
            </Popover>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Tag color="blue" style={{ margin: 0 }}>{rack.zone_code}</Tag>
            <span>{rack.zone_name}</span>
            <span style={{ color: '#cbd5e1' }}>·</span>
            <Text type="secondary" style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }} title={rack.rack_code}>
              {rack.rack_code}
            </Text>
          </div>
        </div>
      )}

      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: compact ? 6 : 10, marginBottom: compact ? 10 : 14 }}>
        <Card size="small" styles={{ body: { padding: compact ? 8 : 12 } }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>층수</div>
          <div style={{ fontSize: compact ? 16 : 20, fontWeight: 700 }}>{rack.location_count}</div>
        </Card>
        <Card size="small" styles={{ body: { padding: compact ? 8 : 12 } }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>점유 층</div>
          <div style={{ fontSize: compact ? 16 : 20, fontWeight: 700 }}>
            {occCount}
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>
              ({occPct}%)
            </Text>
          </div>
        </Card>
        <Card size="small" styles={{ body: { padding: compact ? 8 : 12 } }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>적재율</div>
          <div style={{ fontSize: compact ? 16 : 20, fontWeight: 700 }}>
            {fillPct}
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>
              %
            </Text>
          </div>
          <Progress size="small" percent={fillPct} showInfo={false} />
          <div style={{ marginTop: 4, fontSize: 11, color: '#8a94a6' }}>
            {totals.total.toLocaleString()} / {totals.capacity > 0 ? totals.capacity.toLocaleString() : '미설정'}
          </div>
        </Card>
        <Card size="small" styles={{ body: { padding: compact ? 8 : 12 } }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>가용 재고</div>
          <div style={{ fontSize: compact ? 16 : 20, fontWeight: 700 }}>
            {totals.available.toLocaleString()}
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 4 }}>개</Text>
          </div>
        </Card>
      </div>

      {/* 수량 상세 태그 (예약/검수중/불량은 0 초과만) */}
      {(totals.reserved > 0 || totals.pending > 0 || totals.defect > 0 || totals.total !== totals.available) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, fontSize: 11 }}>
          <Tag color="blue">전체 {totals.total.toLocaleString()}</Tag>
          {totals.reserved > 0 && <Tag color="orange">예약 {totals.reserved.toLocaleString()}</Tag>}
          {totals.pending > 0 && <Tag color="green">검수중 {totals.pending.toLocaleString()}</Tag>}
          {totals.defect > 0 && <Tag color="red">불량 {totals.defect.toLocaleString()}</Tag>}
        </div>
      )}

      {/* 층 리스트 */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
        {sortedLocations.length === 0 ? (
          <Empty description="이 랙에는 로케이션이 없습니다" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedLocations.map((loc) => (
              <LocationRow
                key={loc.location_id}
                loc={loc}
                compact={compact}
                highlighted={isRowHighlighted(loc)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LocationRow({ loc, compact, highlighted }: { loc: RackLocationInventory; compact: boolean; highlighted: boolean }) {
  const hasStock = loc.total_qty > 0;
  const borderColor = highlighted ? '#1677ff' : hasStock ? '#91caff' : '#e8eaed';
  const bg = highlighted ? '#e6f4ff' : hasStock ? '#f0f9ff' : '#ffffff';

  // 최근 트랜잭션 1건 (재고가 있는 로케이션만)
  const { data: txList = [] } = useInventoryTransactions(hasStock ? loc.inventory_id : null);
  const recentTx = txList.length > 0 ? txList[txList.length - 1] : null;

  return (
    <div style={{ borderRadius: 6, border: `1px solid ${borderColor}`, background: bg, overflow: 'hidden', boxShadow: highlighted ? '0 0 0 2px rgba(22,119,255,0.12)' : undefined }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '44px 1fr' : '56px 130px 1fr auto',
          gap: compact ? 8 : 12,
          alignItems: 'center',
          padding: compact ? '8px 10px' : '12px 14px',
        }}
      >
        {/* 층수 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#8a94a6' }}>층</div>
          <div style={{ fontSize: compact ? 16 : 20, fontWeight: 700, color: '#1e2a3a' }}>
            {String(loc.floor_no).padStart(2, '0')}
          </div>
        </div>

        {!compact && (
          <div title={loc.location_code ?? ''}>
            <div style={{ fontSize: 10, color: '#8a94a6' }}>로케이션</div>
            <div style={{ fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', color: '#1e2a3a' }}>
              {(loc.location_code ?? '').split('-').slice(-3).join('-') || '-'}
            </div>
          </div>
        )}

        {/* 상품 정보 + (compact 일 때) 수량 */}
        <div style={{ minWidth: 0 }}>
          {compact && (
            <div style={{ fontSize: 10, color: '#8a94a6', fontFamily: 'ui-monospace, Menlo, monospace', marginBottom: 2 }} title={loc.location_code ?? ''}>
              {(loc.location_code ?? '').split('-').slice(-3).join('-') || '-'}
            </div>
          )}
          {hasStock ? (
            <>
              <Text strong style={{ fontSize: compact ? 12 : 13, display: 'block', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {loc.product_name || '(상품명 없음)'}
              </Text>
              {loc.product_sku && (
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {loc.product_sku}
                </Text>
              )}
              {compact && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 10 }}>
                  <QtyInline label="가용" value={loc.available_qty} color="#1677ff" />
                  {loc.reserved_qty > 0 && <QtyInline label="예약" value={loc.reserved_qty} color="#faad14" />}
                  {loc.pending_qty > 0 && <QtyInline label="검수" value={loc.pending_qty} color="#52c41a" />}
                  {loc.defect_qty > 0 && <QtyInline label="불량" value={loc.defect_qty} color="#ff4d4f" />}
                </div>
              )}
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: compact ? 12 : 13 }}>빈 자리</Text>
          )}
        </div>

        {/* 비-compact 모드 오른쪽 수량 통계 */}
        {!compact && (
          hasStock ? (
            <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
              <QtyStat label="가용" value={loc.available_qty} color="#1677ff" />
              <QtyStat label="전체" value={loc.total_qty} color="#1e2a3a" />
              <CapacityStat value={loc.max_capacity} />
              {loc.reserved_qty > 0 && <QtyStat label="예약" value={loc.reserved_qty} color="#faad14" />}
              {loc.pending_qty > 0 && <QtyStat label="검수중" value={loc.pending_qty} color="#52c41a" />}
              {loc.defect_qty > 0 && <QtyStat label="불량" value={loc.defect_qty} color="#ff4d4f" />}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, fontSize: 11, minWidth: 100 }}>
              <CapacityStat value={loc.max_capacity} />
            </div>
          )
        )}
      </div>

      {/* 최근 변동 */}
      {recentTx && !compact && (
        <div style={{ padding: '4px 14px 8px', fontSize: 11, color: '#6b7280', borderTop: '1px dashed #e8eaed' }}>
          최근: <Tag color="purple" style={{ fontSize: 10, margin: 0 }}>{TX_TYPE_LABEL[recentTx.type] ?? recentTx.type}</Tag>
          {' '}{recentTx.direction === 'in' ? '+' : '-'}{recentTx.qty.toLocaleString()}개
          {' '}({recentTx.before_qty.toLocaleString()} → {recentTx.after_qty.toLocaleString()})
          {' · '}{recentTx.created_at?.slice(0, 10) ?? ''}
        </div>
      )}
    </div>
  );
}

function QtyStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 46 }}>
      <div style={{ fontSize: 10, color: '#8a94a6' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color }}>{value.toLocaleString()}</div>
    </div>
  );
}

function CapacityStat({ value }: { value: number | null }) {
  const display = value != null && value > 0 ? value.toLocaleString() : '미설정';
  return (
    <div style={{ textAlign: 'right', minWidth: 46 }}>
      <div style={{ fontSize: 10, color: '#8a94a6' }}>수용</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>{display}</div>
    </div>
  );
}

function QtyInline({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span>
      <span style={{ color: '#8a94a6' }}>{label} </span>
      <span style={{ color, fontWeight: 600 }}>{value.toLocaleString()}</span>
    </span>
  );
}
