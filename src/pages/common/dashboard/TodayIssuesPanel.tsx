import { useNavigate } from 'react-router-dom';
import { Card, List, Typography, Space, Tag, Button, Empty } from 'antd';
import { AlertTriangle } from 'lucide-react';
import { useDashboardSummary, useSafetyStocks } from '@/hooks/useDashboardQuery';
import { useAllPlacements } from '@/hooks/useInboundQuery';

const { Text } = Typography;

type Severity = 'high' | 'medium' | 'info';
type IssueItem = {
  key: string;
  severity: Severity;
  title: string;
  detail?: string;
  actionLabel: string;
  onAction: () => void;
};

export default function TodayIssuesPanel() {
  const navigate = useNavigate();
  const { data: summary } = useDashboardSummary();
  const { data: safety = [] } = useSafetyStocks();
  const { data: allPlacements = [] } = useAllPlacements();

  const items: IssueItem[] = [];

  // 위치 미정 적치 — 자동 추천 실패분. 관리자가 수동 배정해야 진행 가능
  const unassignedPlacements = allPlacements.filter((p) => p.is_unassigned && !p.is_placed);
  const unassignedCount = unassignedPlacements.length;
  if (unassignedCount > 0) {
    items.push({
      key: 'unassigned-placement',
      severity: 'high',
      title: `위치 미정 적치 ${unassignedCount}건`,
      detail: '작업자 배정 불가 — 관리자 수동 배정 필요',
      actionLabel: '미배정 목록',
      onAction: () => navigate('/order/inbound/placements?filter=unassigned'),
    });
  }

  // 지연 지시서
  if ((summary?.delayed_order_count ?? 0) > 0) {
    items.push({
      key: 'delayed',
      severity: 'high',
      title: `지연 지시서 ${summary!.delayed_order_count}건`,
      detail: '마감 초과 - 즉시 확인 필요',
      actionLabel: '지시서 보기',
      onAction: () => navigate('/orders/integrated?tab=issue'),
    });
  }

  // 재고 부족 — KPI 와 같은 기준(current <= safety), shortage 큰 순으로 가장 심각한 1건 발췌
  const shortageList = [...safety]
    .filter((s) => s.current_qty <= s.safety_qty)
    .sort((a, b) => b.shortage_qty - a.shortage_qty);
  if (shortageList.length > 0) {
    const top = shortageList[0];
    items.push({
      key: 'shortage',
      severity: 'high',
      title: `재고 부족 품번 ${shortageList.length}건`,
      detail: top.shortage_qty > 0
        ? `${top.product_name} - ${top.shortage_qty}개 부족`
        : `${top.product_name} - 안전재고 임박`,
      actionLabel: '긴급 발주',
      onAction: () => navigate('/common/low-stock'),
    });
  }

  // 승인 대기
  if ((summary?.pending_approval_count ?? 0) > 0) {
    items.push({
      key: 'pending-approval',
      severity: 'medium',
      title: `승인 대기 ${summary!.pending_approval_count}건`,
      detail: '출고 지시서 승인 필요',
      actionLabel: '승인 처리',
      onAction: () => navigate('/orders/integrated?tab=pending_approval'),
    });
  }

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <AlertTriangle size={17} color="#ef4444" />
          <span>오늘의 이슈</span>
        </Space>
      )}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 12, flex: 1, overflowY: 'auto' } }}
    >
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="오늘의 이슈 없음" />
      ) : (
        <List
          size="small"
          dataSource={items}
          split={false}
          renderItem={(it) => {
            const color = it.severity === 'high' ? '#ef4444'
              : it.severity === 'medium' ? '#f59e0b'
              : '#94a3b8';
            const tagColor = it.severity === 'high' ? 'red'
              : it.severity === 'medium' ? 'orange'
              : 'default';
            const tagLabel = it.severity === 'high' ? '긴급'
              : it.severity === 'medium' ? '주의'
              : '정보';
            return (
              <List.Item style={{ padding: '10px 6px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ width: '100%' }}>
                  <Space size={6} style={{ marginBottom: 4 }}>
                    <Tag color={tagColor} style={{ margin: 0 }}>{tagLabel}</Tag>
                    <Text strong style={{ fontSize: 13, color }}>{it.title}</Text>
                  </Space>
                  {it.detail && (
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{it.detail}</div>
                  )}
                  <Button size="small" type="link" onClick={it.onAction} style={{ padding: 0 }}>
                    {it.actionLabel} →
                  </Button>
                </div>
              </List.Item>
            );
          }}
        />
      )}
    </Card>
  );
}
