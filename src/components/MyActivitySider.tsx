import { useState } from 'react';
import { List, Tag, Typography, Tooltip, Button, Space } from 'antd';
import {
  ChevronsRight, ChevronsLeft, RefreshCw, Activity, ScrollText,
} from 'lucide-react';
import dayjs from 'dayjs';
import { useAuditLogs } from '@/hooks/useCommonQuery';
import { useAuthStore } from '@/stores/authStore';
import { formatAuditEntity } from '@/utils/auditEntityLabel';

/** "내 활동"에서 BE 단계에서 제외할 액션:
 *  - 조회: 페이지 이동마다 쌓여 노이즈가 큼 (전체 감사 로그 페이지에서 확인)
 *  - 로그인실패: 본인이 자신의 로그인 실패를 다시 볼 의미가 적음
 *  콤마구분 문자열로 BE에 전달 → DB 쿼리 단계에서 제외되어 size=30 안에서도 의미 있는 30개 보장. */
const EXCLUDE_ACTIONS = '조회,로그인실패';

const { Text } = Typography;

interface Props {
  collapsed: boolean;
  onToggle: (next: boolean) => void;
}

const SIDER_WIDTH = 320;

/**
 * 우측 고정 "내 활동" 사이드바.
 *  - 현재 로그인한 사용자의 감사 로그만 표시 (userId 필터)
 *  - 30초마다 자동 갱신 (접힘 시 폴링 중지)
 *  - 토글 버튼은 사이드바 좌측 모서리에 세로 탭으로 부착 — 항상 노출
 */
export default function MyActivitySider({ collapsed, onToggle }: Props) {
  const { user } = useAuthStore();
  const [size] = useState(30);

  const { data, isFetching, refetch, dataUpdatedAt } = useAuditLogs(
    { userId: user?.id, excludeActions: EXCLUDE_ACTIONS, page: 0, size },
    { refetchInterval: collapsed ? false : 30_000, enabled: !!user?.id },
  );

  const logs = data?.content ?? [];

  // 사이드바 좌측 모서리에 부착된 세로 탭 토글
  const toggleTab = (
    <Tooltip title={collapsed ? '내 활동 열기' : '내 활동 접기'} placement="left">
      <button
        className="no-print app-floating-ui"
        type="button"
        onClick={() => onToggle(!collapsed)}
        style={{
          position: 'fixed',
          top: '50%',
          right: collapsed ? 0 : SIDER_WIDTH,
          transform: 'translateY(-50%)',
          zIndex: 1000,
          width: 24,
          height: 60,
          background: '#1677ff',
          color: '#fff',
          border: 'none',
          borderTopLeftRadius: 8,
          borderBottomLeftRadius: 8,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '-2px 0 6px rgba(0,0,0,0.08)',
          transition: 'right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        aria-label={collapsed ? '내 활동 열기' : '내 활동 접기'}
      >
        {collapsed ? <ChevronsLeft size={14} /> : <ChevronsRight size={14} />}
      </button>
    </Tooltip>
  );

  if (collapsed) return toggleTab;

  return (
    <>
      {toggleTab}
      <aside
        className="no-print app-activity-sider"
        style={{
          width: SIDER_WIDTH,
          background: '#ffffff',
          borderInlineStart: '1px solid #e5e7eb',
          boxShadow: '-4px 0 12px rgba(15, 23, 42, 0.04)',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {/* 헤더 — 메인 Layout.Header(64px) 와 동일 높이/border 로 가로줄 맞춤 */}
        <div
          style={{
            height: 64,
            flexShrink: 0,
            padding: '0 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
            background: '#fff',
          }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space size={6} align="center">
              <ScrollText size={16} color="#1677ff" />
              <Text strong style={{ fontSize: 14, color: '#0f172a' }}>내 활동</Text>
            </Space>
            <Tooltip title="지금 새로고침">
              <Button
                type="text"
                size="small"
                icon={<RefreshCw size={13} />}
                loading={isFetching}
                onClick={() => refetch()}
              />
            </Tooltip>
          </Space>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
            <span>{user?.name ?? ''} · {dayjs().format('YYYY-MM-DD')}</span>
            {dataUpdatedAt > 0 && (
              <span>업데이트 {dayjs(dataUpdatedAt).format('HH:mm:ss')}</span>
            )}
          </div>
        </div>

        {/* 로그 목록 영역 — 단독 스크롤 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 16px' }}>
          {logs.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 16px', color: '#94a3b8',
              textAlign: 'center', gap: 8,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: '#f1f5f9', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Activity size={26} color="#cbd5e1" />
              </div>
              <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>아직 활동 없음</Text>
              <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }}>
                작업을 시작하면 여기에<br />실시간으로 기록됩니다.
              </Text>
            </div>
          ) : (
            <List
              size="small"
              dataSource={logs}
              split={false}
              renderItem={(log) => {
                const time = log.created_at?.slice(11, 19) ?? '';
                const date = log.created_at?.slice(0, 10) ?? '';
                const status = log.response_status ?? 0;
                const isError = status >= 400;
                const accent = isError ? '#ef4444' : '#1677ff';
                return (
                  <List.Item
                    style={{
                      padding: '10px 12px',
                      marginBottom: 6,
                      background: '#fff',
                      border: '1px solid #f1f5f9',
                      borderLeft: `3px solid ${accent}`,
                      borderRadius: 6,
                      transition: 'background 0.15s, border-color 0.15s',
                      cursor: 'default',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.borderLeftColor = accent;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff';
                      e.currentTarget.style.borderColor = '#f1f5f9';
                      e.currentTarget.style.borderLeftColor = accent;
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <Space size={6} style={{ marginBottom: 4 }} wrap>
                        <Text style={{ fontSize: 11, fontWeight: 600, color: accent, fontVariantNumeric: 'tabular-nums' }}>
                          {time}
                        </Text>
                        <Tag color={isError ? 'red' : 'blue'} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 6px' }}>
                          {log.action}
                        </Tag>
                      </Space>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a', marginBottom: 3, wordBreak: 'break-word' }}>
                        {formatAuditEntity(log.entity_name)}
                      </div>
                      <Text type="secondary" style={{ fontSize: 10 }}>{date}</Text>
                    </div>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
      </aside>
    </>
  );
}
