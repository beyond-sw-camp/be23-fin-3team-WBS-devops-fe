import { Card, Space, Typography, Spin } from 'antd';
import { Repeat2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useReturnRatio } from '@/hooks/useStreamsQuery';
import type { ReturnRatioBucket } from '@/api/streams';

const { Text } = Typography;

const COLOR_NORMAL = '#16a34a';  // 일반 — 초록
const COLOR_RETURN = '#ef4444';  // 반품 — 빨강
const COLOR_EMPTY = '#e5e7eb';   // 데이터 없음 — 연회색

const EMPTY_BUCKET: ReturnRatioBucket = {
  normal: 0,
  return: 0,
  total: 0,
  returnRatio: 0,
};

interface DonutProps {
  title: string;
  bucket: ReturnRatioBucket;
}

function Donut({ title, bucket }: DonutProps) {
  const hasData = bucket.total > 0;
  const data = hasData
    ? [
      { name: '일반', value: bucket.normal },
      { name: '반품', value: bucket.return },
    ]
    : [{ name: '데이터 없음', value: 1 }];
  const ratioPct = Math.round((bucket.returnRatio ?? 0) * 1000) / 10;  // 소수 1자리

  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <Text strong style={{ fontSize: 13, color: '#0f172a' }}>{title}</Text>
      <>
        <div style={{ position: 'relative', height: 140 }}>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                cx="50%" cy="50%"
                innerRadius={32} outerRadius={52}
                paddingAngle={2}
              >
                {hasData ? (
                  <>
                    <Cell fill={COLOR_NORMAL} />
                    <Cell fill={COLOR_RETURN} />
                  </>
                ) : (
                  <Cell fill={COLOR_EMPTY} />
                )}
              </Pie>
              {hasData && <Tooltip />}
              {hasData && <Legend wrapperStyle={{ fontSize: 11 }} />}
            </PieChart>
          </ResponsiveContainer>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <Text strong style={{ fontSize: 18, color: hasData ? COLOR_RETURN : '#94a3b8' }}>
              {ratioPct}%
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              반품 비율
            </Text>
          </div>
        </div>
        <Text type="secondary" style={{ fontSize: 11 }}>
          총 {bucket.total}건
          {!hasData && (
            <>
              <span style={{ margin: '0 6px' }}>·</span>
              오늘 데이터 없음
            </>
          )}
        </Text>
      </>
    </div>
  );
}

/**
 * 오늘 반품 비율 — 입고/출고 각각 도넛으로 표시.
 * 1분 폴링.
 */
export default function ReturnRatioPanel() {
  const { data, isLoading } = useReturnRatio();
  const isFallback = data?.status === 'NOT_READY' || !data;
  const inboundBucket = isFallback ? EMPTY_BUCKET : data.inbound;
  const outboundBucket = isFallback ? EMPTY_BUCKET : data.outbound;

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <Repeat2 size={17} color="#ef4444" />
          <span>오늘 반품 비율</span>
        </Space>
      )}
      style={{ width: '100%' }}
      styles={{ body: { padding: 14 } }}
    >
      {isLoading && !data ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12 }}>
            <Donut title="입고" bucket={inboundBucket} />
            <Donut title="출고" bucket={outboundBucket} />
          </div>
          {isFallback && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {data?.status === 'NOT_READY' ? 'Streams 준비 중…' : '오늘 데이터 없음'}
              </Text>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
