import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { RobotOutlined, MessageOutlined } from '@ant-design/icons';
import ChatPanel from './ChatPanel';
import { useAuth } from '@/hooks/useAuth';

export default function FloatingChatbot() {
  const [open, setOpen] = useState(false);
  const { currentRole } = useAuth();

  if (currentRole !== 'ADMIN' && currentRole !== 'DEVELOPER') {
    return null;
  }

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}

      <Tooltip title="AI 어시스턴트" placement="left">
        <Button
          className="no-print app-floating-ui app-chatbot-toggle"
          type="primary"
          shape="circle"
          size="large"
          icon={open ? <MessageOutlined style={{ fontSize: 22 }} /> : <RobotOutlined style={{ fontSize: 22 }} />}
          onClick={() => setOpen((v) => !v)}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            width: 56,
            height: 56,
            boxShadow: '0 4px 16px rgba(22,119,255,0.4)',
            background: 'linear-gradient(135deg, #1677ff 0%, #69b1ff 100%)',
            border: 'none',
            zIndex: 1001,
          }}
        />
      </Tooltip>
    </>
  );
}
