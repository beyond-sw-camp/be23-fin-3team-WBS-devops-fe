import { useState, useEffect } from 'react';
import { Typography, Table, Button, Input, Space, Tag, Modal, Form, InputNumber, App, Card, Empty, Tooltip } from 'antd';
import { PlusOutlined, StopOutlined, EditOutlined, FolderOutlined, FolderOpenOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { ProductCategory } from '@/api/productCategory';
import {
  useProductCategoryRoots,
  useProductCategoryChildren,
  useCreateProductCategory,
  useUpdateProductCategory,
  useDeactivateProductCategory,
} from '@/hooks/useMasterQuery';
import { extractApiErrorMessage } from '@/utils/apiError';
import { MASTER_CODE_RULES, CODE_HELP } from '@/utils/codeValidation';

const { Title, Text } = Typography;

interface CategoryFormValues {
  name: string;
  code: string;
  sortOrder?: number;
}

type Depth = 0 | 1 | 2;
const DEPTH_LABEL: Record<Depth, string> = { 0: '대분류', 1: '중분류', 2: '소분류' };
const DEPTH_COLOR: Record<Depth, string> = { 0: 'blue', 1: 'green', 2: 'orange' };

export default function ProductCategoryPage() {
  const { data: roots = [], isLoading: loadingRoots } = useProductCategoryRoots();
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [selectedMidId, setSelectedMidId] = useState<string | null>(null);

  const { data: midCategories = [], isLoading: loadingMid } = useProductCategoryChildren(selectedRootId);
  const { data: leafCategories = [], isLoading: loadingLeaf } = useProductCategoryChildren(selectedMidId);

  const createMut = useCreateProductCategory();
  const updateMut = useUpdateProductCategory();
  const deactivateMut = useDeactivateProductCategory();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalParent, setModalParent] = useState<ProductCategory | null>(null); // null = 대분류 생성
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form] = Form.useForm<CategoryFormValues>();
  const { message, modal } = App.useApp();

  // 대분류 변경 시 중분류 선택 초기화
  useEffect(() => {
    setSelectedMidId(null);
  }, [selectedRootId]);

  const openCreateRoot = () => {
    setModalMode('create');
    setModalParent(null);
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: roots.length + 1 });
    setModalOpen(true);
  };

  const openCreateMid = () => {
    const root = roots.find((r) => r.id === selectedRootId);
    if (!root) {
      message.warning('먼저 대분류를 선택하세요.');
      return;
    }
    setModalMode('create');
    setModalParent(root);
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: midCategories.length + 1 });
    setModalOpen(true);
  };

  const openCreateLeaf = () => {
    const mid = midCategories.find((c) => c.id === selectedMidId);
    if (!mid) {
      message.warning('먼저 중분류를 선택하세요.');
      return;
    }
    setModalMode('create');
    setModalParent(mid);
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: leafCategories.length + 1 });
    setModalOpen(true);
  };

  const openEdit = (cat: ProductCategory) => {
    setModalMode('edit');
    setEditing(cat);
    setModalParent(null);
    form.resetFields();
    form.setFieldsValue({ name: cat.name, code: cat.code, sortOrder: cat.sortOrder });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (modalMode === 'edit' && editing) {
        await updateMut.mutateAsync({
          id: editing.id,
          data: { name: values.name.trim(), sortOrder: values.sortOrder ?? null },
        });
        message.success('수정되었습니다');
      } else {
        await createMut.mutateAsync({
          name: values.name.trim(),
          code: values.code.trim(),
          parentId: modalParent?.id ?? null,
          sortOrder: values.sortOrder ?? null,
        });
        const label = modalParent ? (modalParent.depth === 0 ? '중분류' : '소분류') : '대분류';
        message.success(`${label} 추가됨`);
      }
      setModalOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '카테고리 저장 실패'));
    }
  };

  const handleDeactivate = (cat: ProductCategory) => {
    modal.confirm({
      title: `${cat.name} 비활성화?`,
      content: '활성 상태의 하위 카테고리나 상품 그룹이 이 카테고리를 참조하면 비활성화할 수 없습니다.',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deactivateMut.mutateAsync(cat.id);
          message.success('비활성화됨');
          if (selectedRootId === cat.id) setSelectedRootId(null);
          if (selectedMidId === cat.id) setSelectedMidId(null);
        } catch (err) {
          message.error(extractApiErrorMessage(err, '비활성화 실패'));
        }
      },
    });
  };

  const makeColumns = (
    depth: Depth,
    selectedId: string | null,
  ): ColumnsType<ProductCategory> => [
    {
      title: DEPTH_LABEL[depth],
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space>
          {depth < 2 ? (
            selectedId === record.id ? <FolderOpenOutlined style={{ color: '#1677ff' }} /> : <FolderOutlined />
          ) : null}
          <Text strong={selectedId === record.id}>{name}</Text>
        </Space>
      ),
    },
    { title: '코드', dataIndex: 'code', key: 'code', width: 100 },
    { title: '순서', dataIndex: 'sortOrder', key: 'sortOrder', width: 60, align: 'center' },
    {
      title: '',
      key: 'action',
      width: 40,
      align: 'center',
      render: (_: unknown, r: ProductCategory) => (
        <RowActionMenu
          items={[
            { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => openEdit(r) },
            { key: 'deactivate', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => handleDeactivate(r) },
          ]}
        />
      ),
    },
  ];

  const rootColumns = makeColumns(0, selectedRootId);
  const midColumns = makeColumns(1, selectedMidId);
  const leafColumns = makeColumns(2, null);

  const selectedRoot = roots.find((r) => r.id === selectedRootId);
  const selectedMid = midCategories.find((c) => c.id === selectedMidId);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ marginBottom: 4 }}>상품 카테고리 관리</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          대분류 → 중분류 → 소분류 3단계 구조로 상품을 분류합니다. 구역 설정 시 대분류를 선택해 해당 구역의 기본 상품군을 지정할 수 있습니다.
        </Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {/* ─── 대분류 ─── */}
        <Card
          size="small"
          title={<Space><Tag color={DEPTH_COLOR[0]}>{DEPTH_LABEL[0]}</Tag><span>{roots.length}개</span></Space>}
          extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateRoot}>추가</Button>}
          styles={{ body: { padding: 0 } }}
        >
          {roots.length === 0 && !loadingRoots ? (
            <div style={{ padding: 32 }}>
              <Empty description="등록된 대분류가 없습니다">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRoot}>첫 대분류 만들기</Button>
              </Empty>
            </div>
          ) : (
            <Table
              columns={rootColumns}
              dataSource={roots}
              rowKey="id"
              loading={loadingRoots}
              pagination={false}
              size="small"
              onRow={(r) => ({
                onClick: () => setSelectedRootId(r.id),
                style: { cursor: 'pointer', background: selectedRootId === r.id ? '#e6f4ff' : undefined },
              })}
            />
          )}
        </Card>

        {/* ─── 중분류 ─── */}
        <Card
          size="small"
          title={
            <Space>
              <Tag color={DEPTH_COLOR[1]}>{DEPTH_LABEL[1]}</Tag>
              {selectedRoot ? (
                <span>{selectedRoot.name} · {midCategories.length}개</span>
              ) : (
                <Text type="secondary">대분류 선택</Text>
              )}
            </Space>
          }
          extra={
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={openCreateMid}
              disabled={!selectedRootId}
            >
              추가
            </Button>
          }
          styles={{ body: { padding: 0 } }}
        >
          {!selectedRootId ? (
            <div style={{ padding: 32 }}>
              <Empty description="왼쪽에서 대분류를 먼저 선택하세요" />
            </div>
          ) : midCategories.length === 0 && !loadingMid ? (
            <div style={{ padding: 32 }}>
              <Empty description="중분류가 없습니다">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateMid}>중분류 추가</Button>
              </Empty>
            </div>
          ) : (
            <Table
              columns={midColumns}
              dataSource={midCategories}
              rowKey="id"
              loading={loadingMid}
              pagination={false}
              size="small"
              onRow={(r) => ({
                onClick: () => setSelectedMidId(r.id),
                style: { cursor: 'pointer', background: selectedMidId === r.id ? '#f6ffed' : undefined },
              })}
            />
          )}
        </Card>

        {/* ─── 소분류 ─── */}
        <Card
          size="small"
          title={
            <Space>
              <Tag color={DEPTH_COLOR[2]}>{DEPTH_LABEL[2]}</Tag>
              {selectedMid ? (
                <span>{selectedMid.name} · {leafCategories.length}개</span>
              ) : (
                <Text type="secondary">중분류 선택</Text>
              )}
            </Space>
          }
          extra={
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={openCreateLeaf}
              disabled={!selectedMidId}
            >
              추가
            </Button>
          }
          styles={{ body: { padding: 0 } }}
        >
          {!selectedMidId ? (
            <div style={{ padding: 32 }}>
              <Empty description={selectedRootId ? '중분류를 선택하세요' : '대분류부터 선택하세요'} />
            </div>
          ) : leafCategories.length === 0 && !loadingLeaf ? (
            <div style={{ padding: 32 }}>
              <Empty description="소분류가 없습니다">
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateLeaf}>소분류 추가</Button>
              </Empty>
            </div>
          ) : (
            <Table
              columns={leafColumns}
              dataSource={leafCategories}
              rowKey="id"
              loading={loadingLeaf}
              pagination={false}
              size="small"
            />
          )}
        </Card>
      </div>

      <Modal
        title={
          modalMode === 'edit' && editing
            ? `${DEPTH_LABEL[(editing.depth as Depth) ?? 0]} 수정 · ${editing.name}`
            : modalParent == null
              ? '대분류 추가'
              : modalParent.depth === 0
                ? `중분류 추가 · ${modalParent.name} 하위`
                : `소분류 추가 · ${modalParent.name} 하위`
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createMut.isPending || updateMut.isPending}
        okText={modalMode === 'edit' ? '저장' : '추가'}
        cancelText="취소"
        width={420}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
            <Input placeholder="예: 노트북" />
          </Form.Item>
          <Form.Item
            name="code"
            label={
              <Space size={4}>
                <span>코드</span>
                <Tooltip title={modalMode === 'edit' ? '코드는 수정할 수 없습니다' : CODE_HELP.category}>
                  <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
                </Tooltip>
              </Space>
            }
            rules={modalMode === 'edit' ? [] : MASTER_CODE_RULES}
            validateTrigger={['onChange', 'onBlur']}
            getValueFromEvent={(e) => e.target.value.toUpperCase()}
          >
            <Input
              placeholder={
                modalMode === 'edit'
                  ? '코드는 수정할 수 없습니다'
                  : modalParent == null
                    ? '예: ELEC'
                    : modalParent.depth === 0
                      ? `예: DISP (부모: ${modalParent.code})`
                      : `예: MONITOR (부모: ${modalParent.code})`
              }
              disabled={modalMode === 'edit'}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="정렬 순서">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
