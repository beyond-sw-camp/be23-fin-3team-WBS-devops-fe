import { useEffect, useMemo, useState } from 'react';
import {
  Typography, Table, Button, Input, Space, Tag, Modal, Form, App, Tooltip, Select, Switch, Divider,
} from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, StopOutlined, PlayCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { Supplier } from '@/api/supplier';
import {
  useAllSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeactivateSupplier,
  useActivateSupplier,
} from '@/hooks/useMasterQuery';
import { extractApiErrorMessage } from '@/utils/apiError';
import { MASTER_CODE_RULES, CODE_HELP } from '@/utils/codeValidation';
import { suggestCodeFromName } from '@/utils/codeSuggest';

const { Title } = Typography;

interface SupplierFormValues {
  name: string;
  code: string;
  bizNo: string;
  ceoName: string;
  tel: string;
  email?: string;
  address?: string;
  esgGrade?: string;
  ecoCertified?: boolean;
  esgMemo?: string;
}

const esgGradeColor: Record<string, string> = {
  A: 'green',
  B: 'blue',
  C: 'orange',
  D: 'red',
};

export default function SupplierPage() {
  const { data: suppliers = [], isLoading } = useAllSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deactivateSupplier = useDeactivateSupplier();
  const activateSupplier = useActivateSupplier();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form] = Form.useForm<SupplierFormValues>();
  const { message, modal } = App.useApp();

  // 코드 미리보기용 — 랙 코드 포맷: RK-{구역코드}-{입고처코드}-{시퀀스}
  const watchedCode = Form.useWatch('code', form);
  const codeForPreview = (watchedCode ?? '').trim() || '???';
  const isDuplicateCode = !editing && watchedCode
    ? suppliers.some((s) => s.code === watchedCode.trim())
    : false;

  // 입고처명 입력 시 코드 자동 갱신 (수정 모드 제외)
  const watchedName = Form.useWatch('name', form);
  useEffect(() => {
    if (editing || !watchedName) return;
    const suggested = suggestCodeFromName(watchedName);
    if (suggested.length >= 2) form.setFieldValue('code', suggested);
  }, [watchedName, editing, form]);

  const filtered = useMemo(() => {
    if (!search) return suppliers;
    const kw = search.toLowerCase();
    return suppliers.filter(
      (s) => s.name.toLowerCase().includes(kw) || s.code.toLowerCase().includes(kw),
    );
  }, [suppliers, search]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (record: Supplier) => {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      bizNo: record.bizNo ?? '',
      ceoName: record.ceoName ?? '',
      tel: record.tel ?? '',
      email: record.email ?? '',
      address: record.address ?? '',
      esgGrade: record.esgGrade ?? undefined,
      ecoCertified: record.ecoCertified,
      esgMemo: record.esgMemo ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await updateSupplier.mutateAsync({
          id: editing.id,
          data: {
            name: values.name.trim(),
            bizNo: values.bizNo?.trim() || null,
            ceoName: values.ceoName?.trim() || null,
            tel: values.tel?.trim() || null,
            email: values.email?.trim() || null,
            address: values.address?.trim() || null,
            esgGrade: values.esgGrade ?? null,
            ecoCertified: values.ecoCertified ?? false,
            esgMemo: values.esgMemo?.trim() || null,
          },
        });
        message.success('입고처가 수정되었습니다.');
      } else {
        await createSupplier.mutateAsync({
          name: values.name.trim(),
          code: values.code.trim(),
          bizNo: values.bizNo?.trim() || null,
          ceoName: values.ceoName?.trim() || null,
          tel: values.tel?.trim() || null,
          email: values.email?.trim() || null,
          address: values.address?.trim() || null,
          esgGrade: values.esgGrade ?? null,
          ecoCertified: values.ecoCertified ?? false,
          esgMemo: values.esgMemo?.trim() || null,
        });
        message.success('입고처가 추가되었습니다.');
      }
      setModalOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '입고처 저장 실패'));
    }
  };

  const handleToggle = (record: Supplier) => {
    const action = record.isActive ? '비활성화' : '활성화';
    modal.confirm({
      title: `${record.name}을(를) ${action}하시겠습니까?`,
      okButtonProps: { danger: record.isActive },
      onOk: async () => {
        try {
          if (record.isActive) await deactivateSupplier.mutateAsync(record.id);
          else await activateSupplier.mutateAsync(record.id);
          message.success(`${record.name}이(가) ${action}되었습니다.`);
        } catch (err) {
          message.error(extractApiErrorMessage(err, `${action} 실패`));
        }
      },
    });
  };

  const columns: ColumnsType<Supplier> = [
    { title: '코드', dataIndex: 'code', key: 'code', width: 100 },
    { title: '입고처명', dataIndex: 'name', key: 'name', width: 170 },
    { title: '사업자번호', dataIndex: 'bizNo', key: 'bizNo', width: 140, render: (v: string | null) => v || '-' },
    { title: '연락처', dataIndex: 'tel', key: 'tel', width: 140, render: (v: string | null) => v || '-' },
    { title: '이메일', dataIndex: 'email', key: 'email', width: 200, render: (v: string | null) => v || '-' },
    {
      title: 'ESG 참고',
      key: 'esg',
      width: 220,
      render: (_, record) => (
        <Space size={4} wrap>
          {record.esgGrade ? <Tag color={esgGradeColor[record.esgGrade] ?? 'default'}>등급 {record.esgGrade}</Tag> : <Tag>미평가</Tag>}
          {record.ecoCertified ? <Tag color="green">친환경 인증</Tag> : <Tag>인증 없음</Tag>}
        </Space>
      ),
    },
    {
      title: 'ESG 메모',
      dataIndex: 'esgMemo',
      key: 'esgMemo',
      width: 260,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '활성화',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 90,
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
            { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => openEdit(record) },
            record.isActive
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
        <Title level={4} style={{ margin: 0 }}>입고처 관리</Title>
        <Space>
          <Input
            placeholder="입고처명 또는 코드 검색"
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 250 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            입고처 추가
          </Button>
        </Space>
      </div>

      <Table columns={columns} dataSource={filtered} rowKey="id" loading={isLoading} scroll={{ x: 1180 }} />

      <Modal
        title={editing ? '입고처 수정' : '입고처 추가'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createSupplier.isPending || updateSupplier.isPending}
        okText={editing ? '수정' : '추가'}
        cancelText="취소"
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="입고처명" rules={[{ required: true, message: '입고처명을 입력하세요' }]}>
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
            rules={
              editing
                ? []
                : [
                    ...MASTER_CODE_RULES,
                    {
                      validator: (_, value) => {
                        if (!value) return Promise.resolve();
                        const v = String(value).trim();
                        if (suppliers.some((x) => x.code === v)) {
                          return Promise.reject(new Error('이미 사용 중인 코드입니다'));
                        }
                        return Promise.resolve();
                      },
                    },
                  ]
            }
            validateTrigger={['onChange', 'onBlur']}
            getValueFromEvent={(e) => e.target.value.toUpperCase()}
            extra={
              !editing ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: isDuplicateCode ? '#dc2626' : '#6b7280',
                  }}
                >
                  랙 코드 예시 →{' '}
                  <code style={{ fontSize: 12, color: '#0f172a' }}>
                    RK-...-
                    <span style={{ color: isDuplicateCode ? '#dc2626' : '#4A6CF7', fontWeight: 700 }}>
                      {codeForPreview}
                    </span>
                    -001
                  </code>
                </div>
              ) : null
            }
          >
            <Input placeholder="예: LGX (짧고 의미있는 영문 약어)" disabled={!!editing} />
          </Form.Item>
          <Form.Item
            name="bizNo"
            label="사업자번호"
            rules={[
              { required: true, message: '사업자번호를 입력하세요' },
              { pattern: /^\d{3}-\d{2}-\d{5}$/, message: '000-00-00000 형식으로 입력하세요' },
            ]}
          >
            <Input placeholder="000-00-00000" />
          </Form.Item>
          <Form.Item name="ceoName" label="대표자명" rules={[{ required: true, message: '대표자명을 입력하세요' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="tel" label="전화번호" rules={[{ required: true, message: '전화번호를 입력하세요' }]}>
            <Input placeholder="02-0000-0000" />
          </Form.Item>
          <Form.Item name="email" label="이메일" rules={[{ type: 'email', message: '올바른 이메일 형식이 아닙니다' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="address" label="주소">
            <Input />
          </Form.Item>
          <Divider orientation="left">ESG 참고 지표</Divider>
          <Space style={{ width: '100%' }} align="start">
            <Form.Item name="esgGrade" label="ESG 등급" style={{ flex: 1 }}>
              <Select
                allowClear
                placeholder="미평가"
                options={['A', 'B', 'C', 'D'].map((grade) => ({ label: grade, value: grade }))}
              />
            </Form.Item>
            <Form.Item name="ecoCertified" label="친환경 인증" valuePropName="checked" initialValue={false} style={{ width: 120 }}>
              <Switch checkedChildren="보유" unCheckedChildren="없음" />
            </Form.Item>
          </Space>
          <Form.Item name="esgMemo" label="ESG 참고 메모">
            <Input.TextArea rows={3} placeholder="관리자가 입고 지시 검토 시 참고할 내용을 입력하세요" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
