import { useEffect, useRef, useState } from 'react';
import { Input, Button, Space } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { SendOutlined, StopOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface Props {
  pending: boolean;
  onSend: (text: string) => void;
  onCancel: () => void;
}

export default function ChatInput({ pending, onSend, onCancel }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextAreaRef>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!pending) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [pending]);

  const submit = () => {
    if (!text.trim() || pending) return;
    onSend(text);
    setText('');
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div style={{ padding: 10, borderTop: '1px solid #f0f0f0' }}>
      <Space.Compact style={{ width: '100%' }}>
        <TextArea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 내가 오늘 해야 할 피킹 작업 뭐야?"
          autoSize={{ minRows: 1, maxRows: 4 }}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={pending}
        />
        {pending ? (
          <Button danger icon={<StopOutlined />} onClick={onCancel}>
            중지
          </Button>
        ) : (
          <Button type="primary" icon={<SendOutlined />} onClick={submit}>
            전송
          </Button>
        )}
      </Space.Compact>
    </div>
  );
}
