import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Popover, Empty, Tag, Spin, Typography, Divider } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useAuditLogs } from '@/hooks/useCommonQuery';
import {
  ALERT_ACTIONS,
  ACTION_CONFIG,
  toAlertRow,
  fmtDateTime,
  type AlertRow,
} from '@/pages/common/NotificationPage';

const { Text } = Typography;
const PREVIEW_SIZE = 5;
const REFETCH_INTERVAL_MS = 30_000;

interface Props {
  count: number;
}

export default function NotificationBellPopover({ count }: Props) {
  const navigate = useNavigate();

  const { data, isLoading } = useAuditLogs(
    { includeActions: ALERT_ACTIONS.join(','), page: 0, size: PREVIEW_SIZE },
    { refetchInterval: REFETCH_INTERVAL_MS },
  );

  const rows: AlertRow[] = useMemo(() => {
    return (data?.content ?? [])
      .map(toAlertRow)
      .filter((r): r is AlertRow => r !== null);
  }, [data]);

  const handleItemClick = (row: AlertRow) => {
    if (row.nav_path) navigate(row.nav_path);
    else navigate('/common/notifications');
  };

  const content = (
    <div style={{ width: 360 }}>
      <div style={{ padding: '12px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong style={{ fontSize: 14 }}>알림</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {isLoading ? '불러오는 중…' : `최근 ${rows.length}건`}
        </Text>
      </div>
      <Divider style={{ margin: 0 }} />

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : rows.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="새 알림 없음"
          style={{ padding: 16 }}
        />
      ) : (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {rows.map((row) => (
            <div
              key={row.id}
              onClick={() => handleItemClick(row)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #f1f5f9',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = '';
              }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <Tag color={ACTION_CONFIG[row.action]?.color} style={{ marginRight: 0 }}>
                  {ACTION_CONFIG[row.action]?.label ?? row.action}
                </Tag>
                <Text style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(row.created_at)}</Text>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginBottom: 2, wordBreak: 'break-all' }}>
                {row.title}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>
                {row.content}
              </div>
            </div>
          ))}
        </div>
      )}

      <Divider style={{ margin: 0 }} />
      <div
        onClick={() => navigate('/common/notifications')}
        style={{
          textAlign: 'center',
          padding: '10px 16px',
          color: '#1677ff',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        전체 보기 →
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      styles={{ body: { padding: 0 } }}
    >
      <Badge count={count} size="small" overflowCount={99}>
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      </Badge>
    </Popover>
  );
}
