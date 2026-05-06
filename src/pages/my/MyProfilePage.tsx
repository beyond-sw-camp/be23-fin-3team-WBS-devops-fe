import { useEffect } from 'react';
import { Card, Form, Input, Button, Typography, Descriptions, Tag, App, Space, Divider } from 'antd';
import { UserOutlined, SaveOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';
import { useUpdateMyInfo } from '@/hooks/useMeQuery';
import type { UpdateMyInfoRequest } from '@/types/user';

const { Title, Text } = Typography;

const ROLE_COLOR: Record<string, string> = {
  DEVELOPER: 'purple', ADMIN: 'gold', MANAGER: 'blue', OPERATOR: 'green',
};

export default function MyProfilePage() {
  const user = useAuthStore((s) => s.user);
  const [form] = Form.useForm<UpdateMyInfoRequest>();
  const { message } = App.useApp();
  const updateMutation = useUpdateMyInfo();

  useEffect(() => {
    if (user) {
      form.setFieldsValue({
        email: user.email ?? '',
        phone: user.phone ?? '',
      });
    }
  }, [user, form]);

  const handleSave = () => {
    form.validateFields().then((values) => {
      updateMutation.mutate(values, {
        onSuccess: () => message.success('내 정보가 수정되었습니다.'),
        onError: () => message.error('수정에 실패했습니다.'),
      });
    });
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 20 }}>
        <UserOutlined /> 내 프로필
      </Title>

      {/* 읽기 전용 정보 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="이름">{user.name}</Descriptions.Item>
          <Descriptions.Item label="아이디">{user.loginId}</Descriptions.Item>
          <Descriptions.Item label="역할">
            {user.isDeveloper
              ? <Tag color="purple">DEVELOPER</Tag>
              : user.roleCode
                ? <Tag color={ROLE_COLOR[user.roleCode] ?? 'default'}>{user.roleName}</Tag>
                : <Tag>없음</Tag>}
          </Descriptions.Item>
        </Descriptions>
        <Text type="secondary" style={{ fontSize: 12 }}>
          이름, 아이디, 역할은 관리자에게 문의해 변경할 수 있습니다.
        </Text>
      </Card>

      {/* 수정 가능 정보 */}
      <Card title="연락처 수정">
        <Form form={form} layout="vertical">
          <Form.Item
            name="email"
            label="이메일"
            rules={[{ type: 'email', message: '올바른 이메일 형식이 아닙니다' }]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="phone" label="전화번호">
            <Input placeholder="010-1234-5678" />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />

          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => form.resetFields()}>취소</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={updateMutation.isPending}
            >
              저장
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
