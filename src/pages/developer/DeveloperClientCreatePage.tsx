import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Card, Form, Input, Button, App, Result, Space,
  Descriptions, Divider, Alert,
} from 'antd';
import {
  ArrowLeftOutlined, BankOutlined, UserAddOutlined, CheckCircleFilled,
  SaveOutlined, CopyOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCompany, type CreateCompanyRequest } from '@/api/developer';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

export default function DeveloperClientCreatePage() {
  const { currentRole } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form] = Form.useForm<CreateCompanyRequest>();
  const [result, setResult] = useState<{
    clientId: string;
    name: string;
    loginId: string;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: createCompany,
    onSuccess: (clientId, variables) => {
      setResult({
        clientId,
        name: variables.name,
        loginId: variables.masterLoginId,
      });
      message.success(`회사 "${variables.name}"이 생성되었습니다.`);
      qc.invalidateQueries({ queryKey: ['developer-clients'] });
    },
    onError: (err) => {
      const msg = (err as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
        ?? '회사 생성에 실패했습니다.';
      message.error(msg);
    },
  });

  if (currentRole !== 'DEVELOPER') {
    return <Result status="403" title="접근 권한 없음" subTitle="이 페이지는 DEVELOPER 역할만 접근할 수 있습니다." />;
  }

  const handleSubmit = () => {
    form.validateFields().then((values) => mutation.mutate(values));
  };

  const handleCreateAnother = () => {
    setResult(null);
    form.resetFields();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('클립보드에 복사됨'));
  };

  // 생성 성공 후 결과 화면
  if (result) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/developer/clients')}
          style={{ marginBottom: 16 }}
        >
          회사 목록으로
        </Button>

        <Card>
          <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
            <CheckCircleFilled style={{ fontSize: 64, color: '#52c41a' }} />
            <Title level={3} style={{ marginTop: 16, marginBottom: 4 }}>
              회사 등록 완료
            </Title>
            <Text type="secondary">
              회사와 관리자 계정이 동시에 생성되었습니다.
            </Text>
          </div>

          <Descriptions
            bordered
            column={1}
            size="middle"
            style={{ marginTop: 24 }}
          >
            <Descriptions.Item label="회사명">{result.name}</Descriptions.Item>
            <Descriptions.Item label="관리자 로그인 ID">
              <Text strong style={{ fontSize: 15 }}>{result.loginId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Client ID">
              <Space size={4}>
                <Text code>{result.clientId}</Text>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(result.clientId)}
                />
              </Space>
            </Descriptions.Item>
          </Descriptions>

          <Alert
            style={{ marginTop: 16 }}
            type="info"
            showIcon
            message="관리자 계정 전달"
            description="등록한 관리자에게 로그인 ID와 비밀번호를 전달하세요. 비밀번호는 이 화면 이후 다시 볼 수 없습니다."
          />

          <div style={{ marginTop: 20, textAlign: 'right' }}>
            <Space>
              <Button onClick={handleCreateAnother}>또 다른 회사 등록</Button>
              <Button type="primary" onClick={() => navigate('/developer/clients')}>
                회사 목록 보기
              </Button>
            </Space>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/developer/clients')}
        style={{ marginBottom: 16 }}
      >
        회사 목록으로
      </Button>

      <Title level={4} style={{ marginBottom: 4 }}>회사 등록</Title>
      <Text type="secondary">
        새 회사를 등록하고 해당 회사의 관리자(ADMIN) 계정을 동시에 생성합니다.
      </Text>

      <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
        {/* 회사 정보 */}
        <Card
          title={<Space><BankOutlined /> 회사 정보</Space>}
          size="small"
          style={{ marginBottom: 16 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="name"
              label="회사명"
              rules={[{ required: true, message: '회사명을 입력하세요' }]}
            >
              <Input placeholder="(주) WBS" />
            </Form.Item>
            <Form.Item
              name="bizNo"
              label="사업자등록번호"
              rules={[{ required: true, message: '사업자등록번호를 입력하세요' }]}
            >
              <Input placeholder="123-45-67890" />
            </Form.Item>
          </div>
        </Card>

        {/* 관리자 정보 */}
        <Card
          title={<Space><UserAddOutlined /> 관리자(ADMIN) 계정</Space>}
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Alert
            type="info"
            showIcon
            message="이 계정은 회사의 최초 관리자로 생성되며, 이후 회사 내 사용자와 역할을 관리할 수 있습니다."
            style={{ marginBottom: 16 }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="masterName"
              label="관리자 이름"
              rules={[{ required: true, message: '이름을 입력하세요' }]}
            >
              <Input placeholder="홍길동" />
            </Form.Item>
            <Form.Item
              name="masterLoginId"
              label="로그인 ID"
              rules={[{ required: true, message: '로그인 ID를 입력하세요' }]}
            >
              <Input placeholder="admin1" />
            </Form.Item>
            <Form.Item name="masterEmail" label="이메일 (선택)">
              <Input placeholder="admin@company.com" />
            </Form.Item>
            <Form.Item
              name="masterPassword"
              label="초기 비밀번호"
              rules={[
                { required: true, message: '비밀번호를 입력하세요' },
                { min: 6, message: '비밀번호는 6자 이상이어야 합니다' },
              ]}
            >
              <Input.Password placeholder="6자 이상" />
            </Form.Item>
          </div>
        </Card>

        <Divider />

        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={() => navigate('/developer/clients')}>취소</Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
            loading={mutation.isPending}
            size="large"
          >
            회사 + 관리자 등록
          </Button>
        </Space>
      </Form>
    </div>
  );
}
