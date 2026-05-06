import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Tag, Typography, Space, Empty, Tabs, Button } from 'antd';
import { Target } from 'lucide-react';
import { usePendingOrders } from '@/hooks/useDashboardQuery';
import type { PendingOrderItem, PendingOrderCategory } from '@/types/dashboard';
import { ORDER_STATUS_CONFIG } from '@/types/order';

const { Text } = Typography;

type TabKey = 'ALL' | 'DELAYED' | 'TODAY' | 'IN_PROGRESS' | 'PENDING_APPROVAL';

const TYPE_BADGE: Record<PendingOrderItem['type'], { label: string; color: string }> = {
  INBOUND: { label: '입고', color: 'cyan' },
  OUTBOUND: { label: '출고', color: 'purple' },
  TRANSFER: { label: '이동', color: 'geekblue' },
};

const CATEGORY_STYLE: Partial<Record<PendingOrderCategory, { bg: string; border: string; tag: string; label: string }>> = {
  DELAYED:           { bg: '#FAEEDA', border: '#BA7517', tag: 'orange', label: '지연' },
  TODAY:             { bg: '#FCEBEB', border: '#A32D2D', tag: 'red',    label: '오늘마감' },
  IN_PROGRESS:       { bg: '#E6F4FF', border: '#1677FF', tag: 'blue',   label: '진행중' },
  PENDING_APPROVAL:  { bg: '#FFFBE6', border: '#D48806', tag: 'gold',   label: '승인대기' },
};

/** 카드 우측에 표시될 마감 정보 — 카테고리는 좌측 컬러 바로 표현되므로 prefix 중복 제거 */
function deadlineText(item: PendingOrderItem): string {
  if (item.category === 'DELAYED') return `${item.delay_days}일 지연 · 마감 ${item.scheduled_date}`;
  if (item.category === 'TODAY')   return '오늘 마감';
  return `마감 ${item.scheduled_date}`;
}

function detailPath(item: PendingOrderItem): string {
  switch (item.type) {
    case 'INBOUND':  return `/order/inbound/${item.order_id}`;
    case 'OUTBOUND': return `/order/outbound/${item.order_id}`;
    case 'TRANSFER': return `/order/transfer/${item.order_id}`;
  }
}

export default function PendingOrdersPanel() {
  const navigate = useNavigate();
  // 패널 안에서 스크롤로 더 보기 — limit 50 (전체보기는 통합 페이지로)
  const { data, isLoading } = usePendingOrders(50);
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (activeTab === 'ALL') return items;
    return items.filter((it) => it.category === activeTab);
  }, [data, activeTab]);

  const summary = data?.summary ?? { total: 0, delayed: 0, today: 0, upcoming: 0, in_progress: 0, pending_approval: 0 };

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <Target size={17} color="#1677ff" />
          <span>처리 필요 지시서</span>
        </Space>
      )}
      extra={(
        <Button type="link" size="small" onClick={() => navigate('/orders/integrated?tab=pending')}>
          전체 보기 ›
        </Button>
      )}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 12, flex: 1, overflowY: 'auto' } }}
      loading={isLoading}
    >
      <Tabs
        size="small"
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
        style={{ marginBottom: 8 }}
        items={[
          { key: 'ALL',              label: `전체 ${summary.total}` },
          { key: 'DELAYED',          label: `지연 ${summary.delayed}` },
          { key: 'TODAY',            label: `오늘마감 ${summary.today}` },
          { key: 'IN_PROGRESS',      label: `진행중 ${summary.in_progress}` },
          { key: 'PENDING_APPROVAL', label: `승인대기 ${summary.pending_approval}` },
        ]}
      />

      {filtered.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="처리할 지시서가 없습니다" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
          {filtered.map((it) => {
            const cat = CATEGORY_STYLE[it.category] ?? { bg: '#F8F7F2', border: '#888780', tag: 'default', label: it.category };
            const typeBadge = TYPE_BADGE[it.type];
            const statusCfg = ORDER_STATUS_CONFIG[it.status as keyof typeof ORDER_STATUS_CONFIG];
            return (
              <div
                key={`${it.type}-${it.order_id}`}
                onClick={() => navigate(detailPath(it))}
                style={{
                  cursor: 'pointer',
                  background: cat.bg,
                  borderLeft: `3px solid ${cat.border}`,
                  borderRadius: 6,
                  padding: '10px 12px',
                  transition: 'transform 0.1s',
                }}
              >
                {/* 1행: 타입 배지 + 지시서번호 (메인 식별자) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Tag color={typeBadge.color} style={{ margin: 0, fontWeight: 600 }}>{typeBadge.label}</Tag>
                  <Text strong style={{ fontSize: 14, color: '#0f172a', whiteSpace: 'nowrap' }}>{it.order_no}</Text>
                </div>
                {/* 2행: 거래처 (좌) + 마감 (우) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 13, fontWeight: 500, color: '#334155', wordBreak: 'break-word' }}>
                    {it.partner_name}
                  </Text>
                  <Text style={{ fontSize: 11, color: cat.border, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {deadlineText(it)}
                  </Text>
                </div>
                {/* 3행: 보조 정보 한 줄 — 상태 / 품목 / 수량 */}
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {statusCfg?.label ?? ''}{statusCfg ? ' · ' : ''}품목 {it.item_count}종 · 수량 {it.total_qty.toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
