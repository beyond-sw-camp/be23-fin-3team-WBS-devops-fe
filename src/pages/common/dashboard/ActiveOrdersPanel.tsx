import { Card, Space, Typography, Empty, Tag, Spin } from 'antd';
import { Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useActiveOrders } from '@/hooks/useStreamsQuery';
import type { StreamsModule } from '@/api/streams';

const { Text } = Typography;

interface ModuleConfig {
  key: StreamsModule;
  label: string;
  color: string;
  /** 클릭 시 이동할 라우트 — 기본은 진행중 status 필터 */
  href: string;
}

const MODULES: ModuleConfig[] = [
  { key: 'inbound',   label: '입고', color: '#1677ff', href: '/order/inbound?tab=in_progress' },
  { key: 'outbound',  label: '출고', color: '#9254de', href: '/order/outbound?tab=in_progress' },
  { key: 'transfer',  label: '이동', color: '#13c2c2', href: '/order/transfer?tab=in_progress' },
  { key: 'etcinout',  label: '기타', color: '#fa8c16', href: '/order/etc-inout' },
];

/**
 * 실시간 진행 상황 — Kafka Streams 기반 모듈별 진행중 작업 수.
 * 2초 폴링으로 자동 갱신. status=NOT_READY 시 안내.
 */
export default function ActiveOrdersPanel() {
  const navigate = useNavigate();
  const { data, isLoading } = useActiveOrders();

  const isNotReady = data?.status === 'NOT_READY';
  const total = data?.total ?? 0;

  return (
    <Card
      className="dashboard-glass-card"
      title={(
        <Space size={8}>
          <Activity size={17} color="#16a34a" />
          <span>실시간 진행 상황</span>
          {data && !isNotReady && (
            <Tag color="green" style={{ marginLeft: 4 }}>총 {total}건</Tag>
          )}
        </Space>
      )}
      style={{ width: '100%' }}
      styles={{ body: { padding: 14 } }}
    >
      {isLoading && !data ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : isNotReady ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Streams 준비 중…"
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODULES.map((m) => {
            const count = data?.modules?.[m.key] ?? 0;
            return (
              <div
                key={m.key}
                onClick={() => navigate(m.href)}
                style={{
                  cursor: 'pointer',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${m.color}33`,
                  background: `${m.color}0d`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 10px ${m.color}22`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = '';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '';
                }}
              >
                <Text strong style={{ fontSize: 13, color: '#0f172a' }}>
                  {m.label}
                </Text>
                <Text strong style={{ fontSize: 22, color: m.color, lineHeight: 1 }}>
                  {count}
                </Text>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
