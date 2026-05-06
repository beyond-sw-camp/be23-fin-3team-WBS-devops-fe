import { useState } from 'react';
import { Alert, Button, Card, Input, Space, Table, Tag, Typography } from 'antd';
import { RobotOutlined, SendOutlined } from '@ant-design/icons';

import type { WorkQueryResponse } from '@/api/ai';
import { useWorkQuery } from '@/hooks/useAiQuery';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

const EXAMPLES = [
  '내가 오늘 해야 할 피킹 작업 뭐야?',
  '오늘 처리해야 할 지시서 있어?',
  '오늘 입고 예정 알려줘',
  '오늘 미처리 출고 작업 알려줘',
  '삼성 모니터 재고 어디 있어?',
];

export default function AiAssistantPage() {
  const [message, setMessage] = useState('');
  const mutation = useWorkQuery();
  const data: WorkQueryResponse | undefined = mutation.data;

  const submit = (text = message) => {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    setMessage(trimmed);
    mutation.mutate({ message: trimmed });
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <RobotOutlined /> AI 어시스턴트
      </Title>
      <Paragraph type="secondary">
        입고·출고·재고·피킹 메뉴를 직접 이동하지 않고 자연어 질문으로 업무 현황을 조회합니다.
      </Paragraph>

      <Card title="WMS 자연어 업무 조회">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            {EXAMPLES.map((example) => (
              <Tag
                key={example}
                style={{ cursor: 'pointer', padding: '4px 10px' }}
                onClick={() => submit(example)}
              >
                {example}
              </Tag>
            ))}
          </Space>
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="예: 내가 오늘 해야 할 피킹 작업 뭐야?"
              autoSize={{ minRows: 1, maxRows: 4 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={() => submit()}
              loading={mutation.isPending}
            >
              질문
            </Button>
          </Space.Compact>
        </Space>
      </Card>

      {mutation.isError && (
        <Alert
          type="error"
          showIcon
          message="조회 실패"
          description={String((mutation.error as { message?: string })?.message ?? mutation.error)}
          style={{ marginTop: 16 }}
        />
      )}

      {data && (
        <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
          <Card title="답변" extra={<Tag color="blue">{data.intent}</Tag>}>
            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
              {data.answer}
            </Paragraph>
          </Card>
          <Card title={`조회 결과 (${data.rows.length}건)`}>
            {data.rows.length === 0 ? (
              <Text type="secondary">조건에 맞는 데이터가 없습니다.</Text>
            ) : (
              <Table
                size="small"
                dataSource={data.rows.map((row, index) => ({ ...row, _k: index }))}
                rowKey="_k"
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={Object.keys(data.rows[0]).map((key) => ({
                  title: key,
                  dataIndex: key,
                  key,
                  render: (value) => value == null ? '-' : String(value),
                }))}
              />
            )}
          </Card>
        </Space>
      )}
    </div>
  );
}
