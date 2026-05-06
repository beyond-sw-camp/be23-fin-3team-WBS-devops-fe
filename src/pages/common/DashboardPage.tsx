import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Typography, Card, Col, Row, List, Tag, Empty, Button, Tooltip, Space, Select, Switch } from 'antd';
import {
  InboxOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  CloudDownloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { MapPinned, TriangleAlert, ExternalLink, Settings, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import PendingOrdersPanel from './dashboard/PendingOrdersPanel';
import TodayProgressPanel from './dashboard/TodayProgressPanel';
import WeeklyTrendChart from './dashboard/WeeklyTrendChart';
import TodayIssuesPanel from './dashboard/TodayIssuesPanel';
import DashboardWarehouseMinimap from './dashboard/DashboardWarehouseMinimap';
import { useDashboardSummary, useSafetyStocks } from '@/hooks/useDashboardQuery';
import { useSoShortageCount } from '@/stores/soShortageStore';
import { useLowStockCount } from '@/stores/lowStockStore';
import { useRackUsageSummary, useRackUsageByZone } from '@/hooks/useInventoryQuery';
import { useWarehouses } from '@/hooks/useWarehouseQuery';
import { useDashboardLayout, type DashboardPanelId } from '@/hooks/useDashboardLayout';
import './dashboard/dashboard.css';

const { Title, Text } = Typography;

const STAT_CARD_BODY = { padding: '18px 20px', position: 'relative' as const, overflow: 'hidden' as const, minHeight: 104 };

interface StatAccentCardProps {
  title: string;
  /** 제목 아래 부가 설명 (한 줄) */
  subtitle?: string;
  value: number;
  /** 보조 값 — 있으면 메인값과 함께 인라인 라벨 형태로 표시 */
  secondaryValue?: number;
  /** 메인값 인라인 라벨 (예: "처리") */
  primaryLabel?: string;
  /** 보조값 인라인 라벨 (예: "예정") */
  secondaryLabel?: string;
  suffix?: string;
  accent: string;
  icon: ReactNode;
  onClick?: () => void;
}

function StatAccentCard({
  title, subtitle, value, secondaryValue, primaryLabel, secondaryLabel,
  suffix = '건', accent, icon, onClick,
}: StatAccentCardProps) {
  const isPaired = secondaryValue !== undefined;
  return (
    <Card
      className="dashboard-stat-card"
      hoverable
      onClick={onClick}
      styles={{ body: STAT_CARD_BODY }}
      style={{ cursor: onClick ? 'pointer' : 'default', height: '100%' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, color: accent, flexShrink: 0,
            border: `1px solid ${accent}40`,
            boxShadow: `0 0 20px ${accent}22`,
            background: `linear-gradient(160deg, ${accent}18, transparent)`,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: subtitle ? 2 : 6, fontWeight: 500 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, lineHeight: 1.3 }}>{subtitle}</div>
          )}
          {isPaired ? (
            // 인라인 라벨 형태: "처리 1 · 예정 0"
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: accent, lineHeight: 1.15, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                {primaryLabel && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{primaryLabel}</span>}
                <span style={{ fontSize: 26, fontWeight: 700 }}>{value}</span>
              </span>
              <span style={{ color: '#cbd5e1', fontSize: 18, fontWeight: 400 }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                {secondaryLabel && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{secondaryLabel}</span>}
                <span style={{ fontSize: 22, fontWeight: 600, color: '#475569' }}>{secondaryValue}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>{suffix}</span>
            </div>
          ) : (
            <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1.15 }}>
              {value}
              <span style={{ fontSize: 15, fontWeight: 500, marginLeft: 4, color: '#64748b' }}>{suffix}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

const titleWithIcon = (icon: ReactNode, label: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    {icon}
    {label}
  </span>
);

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: summary } = useDashboardSummary();
  const { data: safety = [] } = useSafetyStocks();
  const { data: warehouses = [] } = useWarehouses();
  const [selectedWhId, setSelectedWhId] = useState<string | undefined>(undefined);
  // 사용자가 선택 안 했으면 첫 창고를 기본 — 선택했으면 그걸 사용
  const dashboardWhId = selectedWhId ?? warehouses[0]?.id;
  const { data: rackUsage } = useRackUsageSummary(dashboardWhId);
  const { data: zoneRackUsages = [] } = useRackUsageByZone(dashboardWhId);
  // 실시간 카운트 — baseline REST seed + WS added/resolved 로 갱신 (양쪽 동일 패턴)
  const soShortageCount = useSoShortageCount();
  const lowStockCount = useLowStockCount();

  // 사용자별 대시보드 레이아웃 (localStorage 저장)
  const { layout, toggleVisible, move, reset } = useDashboardLayout();
  const [editMode, setEditMode] = useState(false);

  // BE는 (product × warehouse) 단위로 반환 → 같은 SKU가 창고별로 중복 표시되는 문제 해결.
  // 대시보드는 SKU 단위 개요만 보여주고 창고별 상세는 /common/low-stock 에서.
  const shortageList = useMemo(() => {
    const bySku = new Map<string, typeof safety[number]>();
    for (const s of safety) {
      if (s.current_qty > s.safety_qty) continue;
      const existing = bySku.get(s.sku);
      if (existing) {
        // 같은 SKU의 다른 창고 row → 가용 합산, 부족 합산
        existing.current_qty += s.current_qty;
        existing.shortage_qty += s.shortage_qty;
      } else {
        bySku.set(s.sku, { ...s });
      }
    }
    return Array.from(bySku.values()).slice(0, 8);
  }, [safety]);
  const occupancyByZoneId = useMemo(() => {
    const o: Record<string, number> = {};
    zoneRackUsages.forEach((z) => { o[z.zone_id] = z.occupancy_rate; });
    return o;
  }, [zoneRackUsages]);

  // ── 패널 노드 정의 — 6개 커스터마이즈 가능 패널 ──
  const minimapNode = (
    <Card
      className="dashboard-glass-card"
      title={titleWithIcon(<MapPinned size={17} color="#1677ff" />, '창고 미니맵')}
      extra={(
        <Space size={4}>
          <Select
            size="small"
            value={dashboardWhId}
            onChange={setSelectedWhId}
            style={{ minWidth: 130 }}
            placeholder="창고 선택"
            options={warehouses
              .filter((w) => w.is_active)
              .map((w) => ({ label: w.name, value: w.id }))}
          />
          <Tooltip title="레이아웃 편집으로 이동">
            <Link to="/warehouse/layout-editor">
              <Button type="text" size="small" icon={<ExternalLink size={16} aria-hidden />} aria-label="레이아웃 편집" />
            </Link>
          </Tooltip>
        </Space>
      )}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 12, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } }}
    >
      {rackUsage != null && (
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 12, color: '#0f172a' }}>
            가동률 <Text style={{ color: '#1677ff' }}>{rackUsage.occupancy_rate}%</Text>
          </Text>
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>
            {rackUsage.used_racks}/{rackUsage.total_racks}랙
          </Text>
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {dashboardWhId ? (
          <DashboardWarehouseMinimap
            warehouseId={dashboardWhId}
            highlightRackCode={null}
            selectedZoneId={null}
            onZoneSelect={() => {}}
            occupancyByZoneId={occupancyByZoneId}
            height={210}
          />
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>창고 정보를 불러오는 중…</Text>
        )}
      </div>
    </Card>
  );

  const lowStockNode = (
    <Card
      className="dashboard-glass-card"
      title={titleWithIcon(<TriangleAlert size={17} color="#ff4d4f" />, '재고 부족 품목')}
      style={{ width: '100%' }}
      styles={{ body: { padding: 12, maxHeight: 320, overflowY: 'auto' } }}
    >
      {shortageList.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="안전재고 미달 없음" />
      ) : (
        <List
          size="small"
          dataSource={shortageList}
          split={false}
          renderItem={(item) => (
            <List.Item style={{ padding: '8px 0', borderBlockEnd: '1px solid #f0f3f7' }}>
              <div style={{ width: '100%' }}>
                <Text style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#0f172a', whiteSpace: 'normal', wordBreak: 'break-word', marginBottom: 6, lineHeight: 1.35 }}>
                  {item.product_name}
                </Text>
                <Space size={6} wrap>
                  <Tag color="red" style={{ margin: 0 }}>{item.sku}</Tag>
                  {item.shortage_qty > 0 ? (
                    <Text type="danger" strong style={{ fontSize: 12 }}>부족 {item.shortage_qty}</Text>
                  ) : (
                    <Text type="warning" strong style={{ fontSize: 12 }}>임박</Text>
                  )}
                </Space>
              </div>
            </List.Item>
          )}
        />
      )}
    </Card>
  );

  const PANELS: Record<DashboardPanelId, { name: string; node: ReactNode }> = {
    pendingOrders: { name: '처리 필요 지시서',  node: <PendingOrdersPanel /> },
    todayProgress: { name: '오늘 처리 현황',     node: <TodayProgressPanel /> },
    minimap:       { name: '창고 미니맵',        node: minimapNode },
    weeklyTrend:   { name: '최근 7일 입·출고 추이', node: <WeeklyTrendChart /> },
    todayIssues:   { name: '오늘의 이슈',        node: <TodayIssuesPanel /> },
    lowStock:      { name: '재고 부족 품목',     node: lowStockNode },
  };

  return (
    <div className="dashboard-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0, color: '#0f172a' }}>대시보드</Title>
        <Space size={8}>
          {editMode && (
            <Button size="small" icon={<RotateCcw size={14} />} onClick={reset}>
              기본값으로
            </Button>
          )}
          <Button
            size="small"
            type={editMode ? 'primary' : 'default'}
            icon={<Settings size={14} />}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '편집 완료' : '레이아웃 편집'}
          </Button>
        </Space>
      </div>

      {/* ── 상단 KPI 카드 — 워크플로우 순(주문/발주 → 지시서 → 입출고 → 재고) ── */}
      <Row gutter={[14, 14]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} flex="1 1 220px" style={{ minWidth: 0 }}>
          <StatAccentCard
            title="신규 주문"
            subtitle="출고지시서 미생성"
            value={summary?.new_sales_order_count ?? 0}
            accent="#34d399"
            icon={<FileTextOutlined />}
            onClick={() => navigate('/order/outbound/new')}
          />
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px" style={{ minWidth: 0 }}>
          <StatAccentCard
            title="신규 발주"
            subtitle="입고지시서 미생성"
            value={summary?.new_purchase_order_count ?? 0}
            accent="#22d3ee"
            icon={<CloudDownloadOutlined />}
            onClick={() => navigate('/order/inbound/new')}
          />
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px" style={{ minWidth: 0 }}>
          <StatAccentCard
            title="미처리 지시서"
            subtitle="전체 미완료 (날짜 무관)"
            value={summary?.integrated_order_count ?? 0}
            accent="#fbbf24"
            icon={<ThunderboltOutlined />}
            onClick={() => navigate('/orders/integrated')}
          />
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px" style={{ minWidth: 0 }}>
          <StatAccentCard
            title="오늘 입·출고"
            subtitle="오늘 예정 건수"
            value={summary?.today_inbound_count ?? 0}
            primaryLabel="입고"
            secondaryValue={summary?.today_outbound_count ?? 0}
            secondaryLabel="출고"
            accent="#38bdf8"
            icon={<InboxOutlined />}
            onClick={() => navigate('/orders/integrated')}
          />
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px" style={{ minWidth: 0 }}>
          <StatAccentCard
            title="재고 부족"
            subtitle="안전재고 미달 — 실시간 감지"
            value={lowStockCount}
            accent="#f87171"
            icon={<WarningOutlined />}
            onClick={() => navigate('/common/low-stock')}
          />
        </Col>
        <Col xs={24} sm={12} flex="1 1 220px" style={{ minWidth: 0 }}>
          <StatAccentCard
            title="출고 불가 수주"
            subtitle="ATP 부족 — 실시간 감지"
            value={soShortageCount}
            accent="#dc2626"
            icon={<StopOutlined />}
            onClick={() => navigate('/order/sales-orders/shortage')}
          />
        </Col>
      </Row>

      {/* ── 커스터마이즈 가능 패널 6개 — layout 순서대로 / 숨김 토글 ── */}
      <Row gutter={[16, 16]} align="stretch">
        {layout.map((p, idx) => {
          if (!editMode && !p.visible) return null;
          const panel = PANELS[p.id];
          return (
            <Col
              key={p.id}
              xs={24}
              md={12}
              xl={8}
              style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}
            >
              {editMode && (
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 16,
                  zIndex: 10,
                  background: '#fffbe6',
                  border: '1px solid #faad14',
                  borderRadius: '8px 8px 0 0',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}>
                  <Space size={6}>
                    <Switch
                      size="small"
                      checked={p.visible}
                      onChange={() => toggleVisible(p.id)}
                    />
                    <Text strong style={{ fontSize: 12 }}>{panel.name}</Text>
                  </Space>
                  <Space size={2}>
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUp size={14} />}
                      disabled={idx === 0}
                      onClick={() => move(p.id, 'up')}
                      aria-label="위로"
                    />
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDown size={14} />}
                      disabled={idx === layout.length - 1}
                      onClick={() => move(p.id, 'down')}
                      aria-label="아래로"
                    />
                  </Space>
                </div>
              )}
              <div style={{
                flex: 1,
                display: 'flex',
                marginTop: editMode ? 36 : 0,
                opacity: editMode && !p.visible ? 0.4 : 1,
                pointerEvents: editMode && !p.visible ? 'none' : 'auto',
                transition: 'opacity 0.2s',
              }}>
                {panel.node}
              </div>
            </Col>
          );
        })}

      </Row>
    </div>
  );
}
