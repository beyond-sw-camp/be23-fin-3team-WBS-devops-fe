import { Card, Progress, Typography, Space, Divider } from 'antd';
import { BarChart3 } from 'lucide-react';
import { useDashboardSummary } from '@/hooks/useDashboardQuery';

const { Text } = Typography;

type ProgressRow = { label: string; done: number; inProgress: number; pending: number; accent: string };

function ProgressSection({ row }: { row: ProgressRow }) {
  const total = row.done + row.inProgress + row.pending;
  const pct = total > 0 ? Math.round((row.done / total) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text strong style={{ fontSize: 13 }}>{row.label}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{row.done}/{total} 완료 · {pct}%</Text>
      </div>
      <Progress percent={pct} strokeColor={row.accent} showInfo={false} />
      <Space size={12} style={{ marginTop: 4, fontSize: 11, color: '#64748b' }}>
        <span>완료 <Text strong style={{ color: '#10b981' }}>{row.done}</Text></span>
        <span>·</span>
        <span>진행 <Text strong style={{ color: '#3b82f6' }}>{row.inProgress}</Text></span>
        <span>·</span>
        <span>대기 <Text strong style={{ color: '#f59e0b' }}>{row.pending}</Text></span>
      </Space>
    </div>
  );
}

/**
 * 오늘 처리 현황 — BE summary 의 도메인별 진행/대기/완료 카운트를 그대로 표시.
 *   완료 = 오늘 실제 처리된 건 (BE: today_*_count)
 *   진행 = 현재 작업중 (BE: *_active_count, 날짜 무관)
 *   대기 = 오늘마감+지연 미시작 (BE: *_pending_count)
 */
export default function TodayProgressPanel() {
  const { data: summary } = useDashboardSummary();

  const rows: ProgressRow[] = [
    {
      label: '입고',
      done: summary?.today_placed_count ?? 0,
      inProgress: summary?.inbound_active_count ?? 0,
      pending: summary?.inbound_pending_count ?? 0,
      accent: '#38bdf8',
    },
    {
      label: '출고',
      done: summary?.today_dispatched_count ?? 0,
      inProgress: summary?.outbound_active_count ?? 0,
      pending: summary?.outbound_pending_count ?? 0,
      accent: '#c4b5fd',
    },
    {
      label: '이동',
      done: summary?.today_transferred_count ?? 0,
      inProgress: summary?.transfer_active_count ?? 0,
      pending: summary?.transfer_pending_count ?? 0,
      accent: '#34d399',
    },
    {
      label: '반품',
      done: summary?.today_returned_count ?? 0,
      inProgress: summary?.return_active_count ?? 0,
      pending: summary?.return_pending_count ?? 0,
      accent: '#fb923c',
    },
  ];

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <BarChart3 size={17} color="#1677ff" />
          <span>오늘 처리 현황</span>
        </Space>
      )}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 16, flex: 1 } }}
    >
      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {rows.map((r, i) => (
          <div key={r.label}>
            <ProgressSection row={r} />
            {i < rows.length - 1 && <Divider style={{ margin: '10px 0 0' }} />}
          </div>
        ))}
      </Space>
    </Card>
  );
}
