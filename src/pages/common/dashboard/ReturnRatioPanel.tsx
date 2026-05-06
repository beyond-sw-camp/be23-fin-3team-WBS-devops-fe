import { Card, Space, Typography, Empty, Spin } from 'antd';
import { Repeat2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { useReturnRatio } from '@/hooks/useStreamsQuery';
import type { ReturnRatioBucket } from '@/api/streams';

const { Text } = Typography;

const COLOR_NORMAL = '#16a34a';  // 일반 — 초록
const COLOR_RETURN = '#ef4444';  // 반품 — 빨강

interface DonutProps {
  title: string;
  bucket: ReturnRatioBucket;
}

function Donut({ title, bucket }: DonutProps) {
  const data = [
    { name: '일반', value: bucket.normal },
    { name: '반품', value: bucket.return },
  ];
  const ratioPct = Math.round((bucket.returnRatio ?? 0) * 1000) / 10;  // 소수 1자리

  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <Text strong style={{ fontSize: 13, color: '#0f172a' }}>{title}</Text>
      {bucket.total === 0 ? (
        <div style={{ padding: 24 }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="오늘 데이터 없음" />
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                cx="50%" cy="50%"
                innerRadius={32} outerRadius={52}
                paddingAngle={2}
              >
                <Cell fill={COLOR_NORMAL} />
                <Cell fill={COLOR_RETURN} />
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <Text type="secondary" style={{ fontSize: 11 }}>
            반품 비율 <Text strong style={{ color: COLOR_RETURN }}>{ratioPct}%</Text>
            <span style={{ margin: '0 6px' }}>·</span>
            총 {bucket.total}건
          </Text>
        </>
      )}
    </div>
  );
}

/**
 * 오늘 반품 비율 — 입고/출고 각각 도넛으로 표시.
 * 1분 폴링.
 */
export default function ReturnRatioPanel() {
  const { data, isLoading } = useReturnRatio();
  const isNotReady = data?.status === 'NOT_READY';

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
      ) : isNotReady || !data ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={isNotReady ? 'Streams 준비 중…' : '데이터 없음'}
        />
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <Donut title="입고" bucket={data.inbound} />
          <Donut title="출고" bucket={data.outbound} />
        </div>
      )}
    </Card>
  );
}
