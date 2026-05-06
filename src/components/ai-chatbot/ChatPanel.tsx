import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Space, Typography, Empty, Tooltip } from 'antd';
import { CloseOutlined, ClearOutlined, RobotOutlined, DownOutlined } from '@ant-design/icons';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { useChatSession } from './useChatSession';

const { Text } = Typography;

interface Props {
  onClose: () => void;
}

export default function ChatPanel({ onClose }: Props) {
  const { messages, pending, send, cancel, clear } = useChatSession();

  const bodyRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  // 사용자가 위로 스크롤 중이면 새 토큰 도착해도 자동 하강 막음
  const [autoScroll, setAutoScroll] = useState(true);
  const [position, setPosition] = useState(() => ({
    left: Math.max(16, window.innerWidth - 420 - 24),
    top: Math.max(16, window.innerHeight - 600 - 92),
  }));

  const scrollToBottom = useCallback((smooth = false) => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // 스크롤 위치 감지 → 하단 근처면 autoScroll 켜짐, 위로 올렸으면 꺼짐
  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(nearBottom);
  };

  // 새 메시지·토큰 추가 시 (autoScroll 켜진 경우만) 자동 하강
  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages, autoScroll, scrollToBottom]);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => clampPosition(prev.left, prev.top));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPosition(clampPosition(event.clientX - drag.offsetX, event.clientY - drag.offsetY));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const intro = '입고·출고·재고·피킹 메뉴를 찾지 않고 자연어로 업무 현황을 조회합니다.';

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: 420,
        maxWidth: 'calc(100vw - 32px)',
        height: 600,
        maxHeight: 'calc(100vh - 120px)',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 1000,
      }}
    >
      {/* 헤더 */}
      <div
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #1677ff 0%, #69b1ff 100%)',
          color: '#fff',
          cursor: 'move',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <Space size="small">
          <RobotOutlined style={{ fontSize: 18 }} />
          <Text strong style={{ color: '#fff' }}>
            AI 어시스턴트
          </Text>
        </Space>
        <Space size={4}>
          <Tooltip title="대화 비우기">
            <Button
              type="text"
              size="small"
              icon={<ClearOutlined style={{ color: '#fff' }} />}
              onClick={clear}
              disabled={messages.length === 0}
            />
          </Tooltip>
          <Tooltip title="닫기">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined style={{ color: '#fff' }} />}
              onClick={onClose}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 본문 */}
      <div
        ref={bodyRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          background: '#fafafa',
          position: 'relative',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ padding: '20px 4px' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    WMS 업무를 자연어로 물어보세요
                  </Text>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>
                    {intro}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: '#8c8c8c', lineHeight: 1.6 }}>
                    예: 오늘 내가 해야 할 작업, 미처리 지시서, 입고 예정, 상품 재고 위치
                  </div>
                </div>
              }
            />
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
      </div>

      {/* 스크롤 위로 올렸을 때 "최신으로" 버튼. 입력창 바로 위에 플로팅. */}
      {!autoScroll && messages.length > 0 && (
        <div style={{ position: 'relative' }}>
          <Button
            size="small"
            shape="round"
            icon={<DownOutlined />}
            onClick={() => {
              setAutoScroll(true);
              scrollToBottom(true);
            }}
            style={{
              position: 'absolute',
              right: 16,
              bottom: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              background: '#fff',
              zIndex: 2,
            }}
          >
            최신 메시지
          </Button>
        </div>
      )}

      {/* 입력 */}
      <ChatInput pending={pending} onSend={send} onCancel={cancel} />
    </div>
  );
}

function clampPosition(left: number, top: number) {
  const panelWidth = Math.min(420, window.innerWidth - 32);
  const panelHeight = Math.min(600, window.innerHeight - 120);
  return {
    left: Math.min(Math.max(16, left), Math.max(16, window.innerWidth - panelWidth - 16)),
    top: Math.min(Math.max(16, top), Math.max(16, window.innerHeight - panelHeight - 16)),
  };
}
