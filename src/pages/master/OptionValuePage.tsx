import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Typography, Table, Button, Modal, Form, Input, InputNumber, App, Empty, Tag, Space, Skeleton } from 'antd';
import { PlusOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Rule } from 'antd/es/form';
import { useOptionTypes, useOptionValues, useCreateOptionValue } from '@/hooks/useMasterQuery';
import type { ProductOptionValue } from '@/api/productOption';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title, Text } = Typography;

interface FormValues {
  value: string;
  code: string;
  sortOrder: number;
}

const OPTION_CODE_RULES: Rule[] = [
  { required: true, message: '코드를 입력하세요' },
  { pattern: /^[A-Z0-9_]+$/, message: '코드는 영문 대문자/숫자/언더스코어만 사용 가능합니다' },
  { min: 1, max: 32, message: '코드는 1~32자여야 합니다' },
];

export default function OptionValuePage() {
  const { typeId = '' } = useParams<{ typeId: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();

  const { data: types = [], isLoading: loadingTypes } = useOptionTypes();
  const { data: values = [], isLoading: loadingValues } = useOptionValues(typeId);
  const createMut = useCreateOptionValue();

  const optionType = useMemo(() => types.find((t) => t.id === typeId), [types, typeId]);

  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ sortOrder: values.length + 1 });
    setOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields();
      await createMut.mutateAsync({
        optionTypeId: typeId,
        value: v.value.trim(),
        code: v.code.trim(),
        sortOrder: v.sortOrder,
      });
      message.success('옵션 값이 추가되었습니다');
      setOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '옵션 값 저장 실패'));
    }
  };

  const columns: ColumnsType<ProductOptionValue> = [
    { title: '순서', dataIndex: 'sortOrder', key: 'sortOrder', width: 80, align: 'center' },
    { title: '코드', dataIndex: 'code', key: 'code', width: 160, render: (c: string) => <Tag color="cyan">{c}</Tag> },
    { title: '값', dataIndex: 'value', key: 'value' },
  ];

  if (loadingTypes) return <Skeleton active />;

  if (!optionType) {
    return (
      <Empty description="옵션 타입을 찾을 수 없습니다" style={{ marginTop: 80 }}>
        <Button onClick={() => navigate('/master/option-types')}>옵션 타입 목록으로</Button>
      </Empty>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <Space size={8} style={{ marginBottom: 4 }}>
            <Button type="link" size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate('/master/option-types')} style={{ padding: 0 }}>
              옵션 타입 목록
            </Button>
          </Space>
          <Title level={4} style={{ marginBottom: 4 }}>
            <Tag color="blue" style={{ marginRight: 8 }}>{optionType.code}</Tag>
            {optionType.name} · 옵션 값
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            상품 검색·필터에 노출되는 선택 가능한 값들을 관리합니다.
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>값 추가</Button>
      </div>

      {values.length === 0 && !loadingValues ? (
        <Empty description="등록된 옵션 값이 없습니다" style={{ marginTop: 80 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>첫 옵션 값 만들기</Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={values}
          rowKey="id"
          loading={loadingValues}
          pagination={false}
          size="small"
        />
      )}

      <Modal
        title={`옵션 값 추가 · ${optionType.name}`}
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
          <Form.Item name="value" label="값" rules={[{ required: true, message: '값을 입력하세요' }]}>
            <Input placeholder="예: 블랙" />
          </Form.Item>
          <Form.Item
            name="code"
            label="코드"
            rules={OPTION_CODE_RULES}
            getValueFromEvent={(e) => e.target.value.toUpperCase()}
            extra="영문 대문자/숫자/언더스코어만 가능 (예: BLACK, USB_C)"
          >
            <Input placeholder="예: BLACK" />
          </Form.Item>
          <Form.Item name="sortOrder" label="정렬 순서" rules={[{ required: true, message: '정렬 순서를 입력하세요' }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
