import { useMemo } from 'react';
import { Card, Space, Empty } from 'antd';
import { LineChart as LineChartIcon } from 'lucide-react';
import dayjs from 'dayjs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useDailyPerformances } from '@/hooks/useDashboardQuery';

export default function WeeklyTrendChart() {
  const { data: daily = [] } = useDailyPerformances();

  const chartData = useMemo(() => {
    const today = dayjs();
    const days: { date: string; label: string }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = today.subtract(i, 'day');
      days.push({ date: d.format('YYYY-MM-DD'), label: d.format('MM/DD') });
    }
    // date별 집계
    const byDate = new Map<string, { inbound: number; outbound: number }>();
    daily.forEach((r) => {
      const prev = byDate.get(r.date) ?? { inbound: 0, outbound: 0 };
      prev.inbound += r.inbound_qty ?? 0;
      prev.outbound += r.outbound_qty ?? 0;
      byDate.set(r.date, prev);
    });
    return days.map((d) => ({
      label: d.label,
      입고: byDate.get(d.date)?.inbound ?? 0,
      출고: byDate.get(d.date)?.outbound ?? 0,
    }));
  }, [daily]);

  const hasAny = chartData.some((d) => d.입고 > 0 || d.출고 > 0);

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <LineChartIcon size={17} color="#1677ff" />
          <span>최근 7일 입·출고 추이</span>
        </Space>
      )}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 12, flex: 1, minHeight: 240 } }}
    >
      {!hasAny ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="최근 7일 실적 없음" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" fontSize={11} tick={{ fill: '#64748b' }} />
            <YAxis fontSize={11} tick={{ fill: '#64748b' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="입고" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="출고" stroke="#c4b5fd" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
