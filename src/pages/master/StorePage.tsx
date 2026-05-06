import { useState, useMemo, useEffect } from 'react';
import {
  Typography, Table, Button, Input, Space, Tag, Modal, Form, App, Tooltip,
} from 'antd';
import { PlusOutlined, SearchOutlined, StopOutlined, PlayCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { Store } from '@/types/store';
import {
  useStores, useCreateStore, useDeactivateStore, useActivateStore,
} from '@/hooks/useMasterQuery';
import { extractApiErrorMessage } from '@/utils/apiError';
import { MASTER_CODE_RULES, CODE_HELP } from '@/utils/codeValidation';
import { suggestCodeFromName } from '@/utils/codeSuggest';

const { Title } = Typography;

interface StoreFormValues {
  name: string;
  code: string;
  business_no?: string;
  ceo_name?: string;
  tel?: string;
  email?: string;
  address?: string;
}

export default function StorePage() {
  const { data: stores = [], isLoading } = useStores();
  const createStore = useCreateStore();
  const deactivateStore = useDeactivateStore();
  const activateStore = useActivateStore();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<StoreFormValues>();
  const { message, modal } = App.useApp();

  // 출고처명 입력 시 코드 자동 갱신
  const watchedName = Form.useWatch('name', form);
  useEffect(() => {
    if (!watchedName) return;
    const suggested = suggestCodeFromName(watchedName);
    if (suggested.length >= 2) form.setFieldValue('code', suggested);
  }, [watchedName, form]);

  const filtered = useMemo(() => {
    if (!search) return stores;
    const kw = search.toLowerCase();
    return stores.filter(
      (s) => s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw),
    );
  }, [stores, search]);

  const openCreate = () => {
    form.resetFields();
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await createStore.mutateAsync({
        name: values.name.trim(),
        code: values.code.trim(),
        business_no: values.business_no?.trim() || undefined,
        ceo_name: values.ceo_name?.trim() || null,
        tel: values.tel?.trim() || undefined,
        email: values.email?.trim() || undefined,
        address: values.address?.trim() || undefined,
      });
      message.success('출고처가 추가되었습니다.');
      setModalOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '출고처 저장 실패'));
    }
  };

  const handleToggle = (record: Store) => {
    const action = record.is_active ? '비활성화' : '활성화';
    modal.confirm({
      title: `${record.name}을(를) ${action}하시겠습니까?`,
      okButtonProps: { danger: record.is_active },
      onOk: async () => {
        try {
          if (record.is_active) await deactivateStore.mutateAsync(record.id);
          else await activateStore.mutateAsync(record.id);
          message.success(`${record.name}이(가) ${action}되었습니다.`);
        } catch (err) {
          message.error(extractApiErrorMessage(err, `${action} 실패`));
        }
      },
    });
  };

  const columns: ColumnsType<Store> = [
    { title: '코드', dataIndex: 'code', key: 'code', width: 120 },
    { title: '출고처명', dataIndex: 'name', key: 'name', width: 180 },
    { title: '대표자', dataIndex: 'ceo_name', key: 'ceo_name', width: 100, render: (v: string | null) => v || '-' },
    { title: '사업자번호', dataIndex: 'business_no', key: 'business_no', width: 140 },
    { title: '연락처', dataIndex: 'tel', key: 'tel', width: 140 },
    { title: '이메일', dataIndex: 'email', key: 'email', width: 200 },
    { title: '주소', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '활성',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      align: 'center',
      render: (v: boolean) => (v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>),
    },
    {
      title: '',
      key: 'action',
      width: 40,
      align: 'center',
      render: (_, record) => (
        <RowActionMenu
          items={[
            record.is_active
              ? { key: 'toggle', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => handleToggle(record) }
              : { key: 'toggle', label: '활성화', icon: <PlayCircleOutlined />, onClick: () => handleToggle(record) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>출고처 관리</Title>
        <Space>
          <Input
            placeholder="출고처명 또는 코드 검색"
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 250 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            출고처 추가
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        loading={isLoading}
      />

      <Modal
        title="출고처 추가"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createStore.isPending}
        okText="추가"
        cancelText="취소"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="출고처명" rules={[{ required: true, message: '출고처명을 입력하세요' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="code"
            label={
              <Space size={4}>
                <span>코드</span>
                <Tooltip title={CODE_HELP.partner}>
                  <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
                </Tooltip>
              </Space>
            }
            rules={MASTER_CODE_RULES}
            validateTrigger={['onChange', 'onBlur']}
            getValueFromEvent={(e) => e.target.value.toUpperCase()}
          >
            <Input placeholder="예: STORE01 또는 TECH" />
          </Form.Item>
          <Form.Item name="ceo_name" label="대표자명">
            <Input />
          </Form.Item>
          <Form.Item
            name="business_no"
            label="사업자번호"
            rules={[
              { pattern: /^\d{3}-\d{2}-\d{5}$/, message: '000-00-00000 형식으로 입력하세요' },
            ]}
          >
            <Input placeholder="000-00-00000" />
          </Form.Item>
          <Form.Item name="tel" label="전화번호">
            <Input placeholder="02-0000-0000" />
          </Form.Item>
          <Form.Item name="email" label="이메일" rules={[{ type: 'email', message: '올바른 이메일 형식이 아닙니다' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="주소">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
