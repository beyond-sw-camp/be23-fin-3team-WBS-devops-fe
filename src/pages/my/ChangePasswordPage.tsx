import { Card, Form, Input, Button, Typography, App, Space, Alert } from 'antd';
import { LockOutlined, SaveOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useChangePassword } from '@/hooks/useMeQuery';

const { Title } = Typography;

interface FormValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ChangePasswordPage() {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const mutation = useChangePassword();

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      mutation.mutate(
        { currentPassword: values.currentPassword, newPassword: values.newPassword },
        {
          onSuccess: () => {
            message.success('비밀번호가 변경되었습니다.');
            form.resetFields();
            navigate('/my/profile');
          },
          onError: (err) => {
            const msg = (err as { response?: { data?: { error_message?: string } } })?.response?.data?.error_message
              ?? '비밀번호 변경에 실패했습니다. 현재 비밀번호를 확인하세요.';
            message.error(msg);
          },
        },
      );
    });
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <Title level={4} style={{ marginBottom: 20 }}>
        <LockOutlined /> 비밀번호 변경
      </Title>

      <Alert
        message="안전한 비밀번호를 사용하세요"
        description="6자 이상의 비밀번호를 사용하며, 다른 사이트에서 사용하는 비밀번호와 달라야 합니다."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Form form={form} layout="vertical" autoComplete="off">
          <Form.Item
            name="currentPassword"
            label="현재 비밀번호"
            rules={[{ required: true, message: '현재 비밀번호를 입력하세요' }]}
          >
            <Input.Password placeholder="현재 비밀번호" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="새 비밀번호"
            rules={[
              { required: true, message: '새 비밀번호를 입력하세요' },
              { min: 6, message: '비밀번호는 6자 이상이어야 합니다' },
            ]}
          >
            <Input.Password placeholder="6자 이상" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="새 비밀번호 확인"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '새 비밀번호를 다시 입력하세요' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('비밀번호가 일치하지 않습니다'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="새 비밀번호 재입력" />
          </Form.Item>

          <Space style={{ width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button onClick={() => navigate(-1)}>취소</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSubmit}
              loading={mutation.isPending}
            >
              변경
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
