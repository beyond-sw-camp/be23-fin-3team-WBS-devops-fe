import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Table, Button, Modal, Form, Input, App, Empty, Tag, Space, Alert } from 'antd';
import { PlusOutlined, RightOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Rule } from 'antd/es/form';
import { useOptionTypes, useCreateOptionType } from '@/hooks/useMasterQuery';
import type { ProductOptionType } from '@/api/productOption';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title, Text } = Typography;

interface FormValues {
  name: string;
  code: string;
}

const OPTION_CODE_RULES: Rule[] = [
  { required: true, message: '코드를 입력하세요' },
  { pattern: /^[A-Z0-9_]+$/, message: '코드는 영문 대문자/숫자/언더스코어만 사용 가능합니다' },
  { min: 2, max: 32, message: '코드는 2~32자여야 합니다' },
];

export default function OptionTypePage() {
  const navigate = useNavigate();
  const { data: types = [], isLoading, error, isError } = useOptionTypes();
  const createMut = useCreateOptionType();
  const { message } = App.useApp();

  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const openCreate = () => {
    form.resetFields();
    setOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await createMut.mutateAsync({
        name: values.name.trim(),
        code: values.code.trim(),
      });
      message.success('옵션 타입이 추가되었습니다');
      setOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '옵션 타입 저장 실패'));
    }
  };

  const columns: ColumnsType<ProductOptionType> = [
    { title: '코드', dataIndex: 'code', key: 'code', width: 160, render: (c: string) => <Tag color="blue">{c}</Tag> },
    { title: '이름', dataIndex: 'name', key: 'name' },
    {
      title: '',
      key: 'action',
      width: 140,
      align: 'right',
      render: (_: unknown, r: ProductOptionType) => (
        <Button
          size="small"
          icon={<RightOutlined />}
          onClick={() => navigate(`/master/option-types/${r.id}/values`)}
        >
          값 관리
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 4 }}>옵션 타입 관리</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            상품 검색·필터에 사용되는 옵션 타입(예: 색상, 길이, 인터페이스)을 관리합니다.
          </Text>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>옵션 타입 추가</Button>
        </Space>
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          message="옵션 타입을 불러오지 못했습니다"
          description={extractApiErrorMessage(error, '서버 응답 오류')}
          style={{ marginBottom: 16 }}
        />
      )}

      {types.length === 0 && !isLoading && !isError ? (
        <Empty description="등록된 옵션 타입이 없습니다" style={{ marginTop: 80 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>첫 옵션 타입 만들기</Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={types}
          rowKey="id"
          loading={isLoading}
          pagination={false}
          size="small"
        />
      )}

      <Modal
        title="옵션 타입 추가"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createMut.isPending}
        okText="추가"
        cancelText="취소"
        width={420}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
            <Input placeholder="예: 색상" />
          </Form.Item>
          <Form.Item
            name="code"
            label="코드"
            rules={OPTION_CODE_RULES}
            getValueFromEvent={(e) => e.target.value.toUpperCase()}
            extra="영문 대문자/숫자/언더스코어만 가능 (예: COLOR, CAPACITY)"
          >
            <Input placeholder="예: COLOR" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
