import { useMemo } from 'react';
import { Card, Space, Empty, Spin } from 'antd';
import { LineChart as LineChartIcon } from 'lucide-react';
import dayjs from 'dayjs';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useHourlyThroughputAll } from '@/hooks/useStreamsQuery';
import type { HourlyBucket, StreamsModule } from '@/api/streams';

const MODULE_META: { key: StreamsModule; label: string; color: string }[] = [
  { key: 'inbound',  label: '입고', color: '#1677ff' },
  { key: 'outbound', label: '출고', color: '#9254de' },
  { key: 'transfer', label: '이동', color: '#13c2c2' },
  { key: 'etcinout', label: '기타', color: '#fa8c16' },
];

interface ChartRow {
  /** "HH:00" 라벨 */
  label: string;
  /** 정렬용 epoch ms */
  ts: number;
  inbound: number;
  outbound: number;
  transfer: number;
  etcinout: number;
}

/** ISO local datetime ("2026-05-06T03:00") → 'HH:00' 라벨 */
function fmtHourLabel(iso: string): string {
  const d = dayjs(iso);
  return d.isValid() ? d.format('HH:00') : iso.slice(11, 16);
}

/**
 * 시간별 처리량 (지난 24h) — 4모듈 동시 라인차트.
 * 1분 폴링.
 */
export default function HourlyThroughputChart() {
  const queries = useHourlyThroughputAll();
  const isLoading = queries.some((q) => q.isLoading && !q.data);
  const isNotReady = queries.every((q) => q.data?.status === 'NOT_READY');

  const chartData = useMemo<ChartRow[]>(() => {
    // 각 모듈별 buckets 를 hour 키 기준으로 병합
    const byHour = new Map<string, ChartRow>();
    queries.forEach((q, idx) => {
      const moduleKey = MODULE_META[idx].key;
      const buckets: HourlyBucket[] = q.data?.buckets ?? [];
      buckets.forEach((b) => {
        const existing = byHour.get(b.hour) ?? {
          label: fmtHourLabel(b.hour),
          ts: dayjs(b.hour).valueOf(),
          inbound: 0, outbound: 0, transfer: 0, etcinout: 0,
        };
        existing[moduleKey] = b.count ?? 0;
        byHour.set(b.hour, existing);
      });
    });
    return Array.from(byHour.values()).sort((a, b) => a.ts - b.ts);
  }, [queries]);

  const hasAny = chartData.some((d) => d.inbound + d.outbound + d.transfer + d.etcinout > 0);

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <LineChartIcon size={17} color="#1677ff" />
          <span>시간별 처리량 (지난 24h)</span>
        </Space>
      )}
      style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
      styles={{ body: { padding: 12, flex: 1, minHeight: 240 } }}
    >
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
      ) : isNotReady || !hasAny ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={isNotReady ? 'Streams 준비 중…' : '최근 24시간 처리 없음'}
        />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {MODULE_META.map((m) => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                name={m.label}
                stroke={m.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
