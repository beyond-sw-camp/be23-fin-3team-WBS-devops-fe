import { useState, useMemo, useEffect } from 'react';
import {
  Typography, Table, Button, Input, Space, Tag, Modal, Form, Select, App, Empty, Tooltip, Collapse,
} from 'antd';
import { PlusOutlined, StopOutlined, EditOutlined, AppstoreAddOutlined, ThunderboltOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ProductGroup } from '@/api/productGroup';
import { suggestProductGroup } from '@/api/productGroup';
import type { ProductCategory } from '@/api/productCategory';
import {
  useProductGroups,
  useCreateProductGroup,
  useUpdateProductGroup,
  useDeactivateProductGroup,
  useProductCategoryRoots,
  useProductCategoryChildren,
} from '@/hooks/useMasterQuery';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title, Text } = Typography;

interface GroupFormValues {
  name: string;
  code: string;
  rootCategoryId?: string;
  midCategoryId?: string;
  leafCategoryId?: string;
  brand?: string;
  description?: string;
}

export default function ProductGroupPage() {
  const navigate = useNavigate();
  const { data: groups = [], isLoading } = useProductGroups();
  const { data: rootCategories = [] } = useProductCategoryRoots();
  const createMut = useCreateProductGroup();
  const updateMut = useUpdateProductGroup();
  const deactivateMut = useDeactivateProductGroup();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editing, setEditing] = useState<ProductGroup | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [form] = Form.useForm<GroupFormValues>();
  const { message, modal } = App.useApp();

  // 계층 선택용 watch
  const selectedRoot = Form.useWatch('rootCategoryId', form) ?? null;
  const selectedMid = Form.useWatch('midCategoryId', form) ?? null;
  const selectedLeaf = Form.useWatch('leafCategoryId', form) ?? null;
  const { data: midCategories = [] } = useProductCategoryChildren(selectedRoot);
  const { data: leafCategories = [] } = useProductCategoryChildren(selectedMid);

  // 가장 깊은 레벨의 카테고리 UUID — 자동제안/기존그룹 조회 기준
  const deepestCategoryId = selectedLeaf || selectedMid || selectedRoot || null;

  // 카테고리별 자동제안 (코드 + 기존 그룹) 조회
  const { data: suggestion, isFetching: suggestLoading } = useQuery({
    queryKey: ['product-group-suggest', deepestCategoryId],
    queryFn: () => suggestProductGroup(deepestCategoryId!),
    enabled: !!deepestCategoryId && modalOpen && modalMode === 'create',
  });

  // 카테고리 변경 시 자동제안 코드 자동 채움 (생성 모드 + 사용자가 비워둔 상태일 때만)
  useEffect(() => {
    if (modalMode !== 'create' || !suggestion) return;
    const currentCode = form.getFieldValue('code');
    if (!currentCode) {
      form.setFieldsValue({ code: suggestion.suggested_code });
    }
  }, [suggestion, modalMode, form]);

  const openCreate = () => {
    setModalMode('create');
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (g: ProductGroup) => {
    setModalMode('edit');
    setEditing(g);
    form.resetFields();
    // 수정 시에는 카테고리 이동을 선택적으로 할 수 있게 대분류만 자동 선택해둠
    // (백엔드는 가장 깊은 레벨 UUID 를 기대함)
    form.setFieldsValue({
      name: g.name,
      code: g.code,
      brand: g.brand ?? undefined,
      description: g.description ?? undefined,
      // 현재 카테고리 UUID 는 알지만 어느 레벨(대/중/소)인지 몰라 자동 매칭 어려움.
      // 사용자가 원하면 모달 안에서 다시 선택. 안 건드리면 기존값 유지.
    });
    setModalOpen(true);
  };

  const pickDeepestCategoryId = (v: GroupFormValues): string | null => {
    // 선택된 가장 깊은 레벨의 UUID 를 categoryId 로 저장
    return v.leafCategoryId || v.midCategoryId || v.rootCategoryId || null;
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (modalMode === 'edit' && editing) {
        const newCategoryId = pickDeepestCategoryId(values);
        await updateMut.mutateAsync({
          id: editing.id,
          data: {
            name: values.name.trim(),
            brand: values.brand?.trim() || null,
            description: values.description?.trim() || null,
            // 사용자가 카테고리를 새로 선택한 경우에만 이동
            categoryId: newCategoryId ?? undefined,
          },
        });
        message.success('수정되었습니다');
      } else {
        const categoryId = pickDeepestCategoryId(values);
        await createMut.mutateAsync({
          name: values.name.trim(),
          code: values.code.trim(),
          categoryId,
          brand: values.brand?.trim() || null,
          description: values.description?.trim() || null,
        });
        message.success('상품 그룹이 추가되었습니다');
      }
      setModalOpen(false);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      message.error(extractApiErrorMessage(err, '그룹 저장 실패'));
    }
  };

  const handleDeactivate = (g: ProductGroup) => {
    modal.confirm({
      title: `${g.name} 비활성화?`,
      content: '활성 상품이 이 그룹에 속해 있으면 비활성화할 수 없습니다.',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deactivateMut.mutateAsync(g.id);
          message.success('비활성화됨');
        } catch (err) {
          message.error(extractApiErrorMessage(err, '비활성화 실패'));
        }
      },
    });
  };

  const stats = useMemo(() => {
    const byCategory = new Map<string, number>();
    groups.forEach((g) => {
      const key = g.category_name ?? '미지정';
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    });
    return [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  }, [groups]);

  const filteredGroups = useMemo(() => {
    if (categoryFilter === 'ALL') return groups;
    return groups.filter((g) => (g.category_name ?? '미지정') === categoryFilter);
  }, [groups, categoryFilter]);

  const columns: ColumnsType<ProductGroup> = [
    {
      title: '그룹명',
      dataIndex: 'name',
      key: 'name',
      width: 340,
      render: (v: string, r: ProductGroup) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <Tag
            style={{
              margin: 0,
              flexShrink: 0,
              color: '#4b5563',
              background: '#f3f4f6',
              border: 'none',
            }}
          >
            {r.category_name ?? '미지정'}
          </Tag>
          <Text strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</Text>
        </div>
      ),
    },
    {
      title: '코드',
      dataIndex: 'code',
      key: 'code',
      width: 170,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    {
      title: '브랜드',
      dataIndex: 'brand',
      key: 'brand',
      width: 130,
      render: (v: string | null) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : <Text type="secondary">—</Text>,
    },
    { title: '설명', dataIndex: 'description', key: 'description', ellipsis: true, width: 300 },
    {
      title: '활성',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 70,
      align: 'center',
      render: (v: boolean) => v ? <Tag color="green">활성</Tag> : <Tag>비활성</Tag>,
    },
    {
      title: '',
      key: 'action',
      width: 40,
      align: 'center',
      render: (_, r) => (
        <RowActionMenu
          items={[
            { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => openEdit(r), hidden: !r.is_active },
            { key: 'deactivate', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => handleDeactivate(r), hidden: !r.is_active },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>상품 그룹 관리</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            상품 그룹은 하나의 카테고리에 속하며, 개별 상품들을 묶는 단위입니다.
          </Text>
        </div>
        <Space>
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: 180 }}
            options={[
              { label: '모든 카테고리', value: 'ALL' },
              ...stats.map(([cat]) => ({ label: cat, value: cat })),
            ]}
            dropdownStyle={{ borderRadius: 8 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={rootCategories.length === 0}>
            그룹 추가
          </Button>
        </Space>
      </div>

      {rootCategories.length === 0 ? (
        <Empty
          description={
            <div>
              <div style={{ marginBottom: 8, fontSize: 14 }}>먼저 카테고리가 필요합니다</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                상품 그룹은 카테고리에 속하므로, 카테고리 관리에서 대분류를 먼저 생성해주세요.
              </div>
            </div>
          }
        >
          <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => navigate('/master/product-categories')}>
            카테고리 관리로 이동
          </Button>
        </Empty>
      ) : filteredGroups.length === 0 && !isLoading ? (
        <Empty description="등록된 상품 그룹이 없습니다">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>첫 그룹 만들기</Button>
        </Empty>
      ) : (
        <Table columns={columns} dataSource={filteredGroups} rowKey="id" loading={isLoading} scroll={{ x: 1100 }} />
      )}

      <Modal
        title={modalMode === 'edit' && editing ? `상품 그룹 수정 · ${editing.name}` : '상품 그룹 추가'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={createMut.isPending || updateMut.isPending}
        okText={modalMode === 'edit' ? '저장' : '추가'}
        cancelText="취소"
        width={520}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label={
              <Space size={4}>
                <span>그룹명</span>
                <Tooltip title="입고처 카탈로그의 제품 시리즈명 또는 상품 라인업 이름을 입력하세요">
                  <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
                </Tooltip>
              </Space>
            }
            rules={[{ required: true }]}
          >
            <Input placeholder="예: FHD 모니터 시리즈, USB 허브 시리즈" />
          </Form.Item>
          <Form.Item
            name="code"
            label={
              <Space size={4}>
                <span>코드</span>
                <Tooltip title="그룹을 구분할 수 있는 영문/숫자 식별자. 공백 없이, 대문자+언더스코어 권장">
                  <QuestionCircleOutlined style={{ color: '#94a3b8' }} />
                </Tooltip>
              </Space>
            }
            rules={
              modalMode === 'edit'
                ? []
                : [
                    { required: true },
                    { pattern: /^[A-Z0-9_-]+$/, message: '영문 대문자, 숫자, -, _ 만 허용' },
                  ]
            }
            tooltip={modalMode === 'edit' ? '코드는 수정할 수 없습니다' : undefined}
          >
            <Input
              placeholder="예: USB_HUB, FHD_MONITOR_SERIES"
              disabled={modalMode === 'edit'}
              addonAfter={
                modalMode === 'create' ? (
                  <Tooltip title={!deepestCategoryId ? '카테고리를 먼저 선택하세요' : '카테고리 기준으로 자동 제안'}>
                    <Button
                      type="text"
                      size="small"
                      icon={<ThunderboltOutlined />}
                      disabled={!deepestCategoryId}
                      loading={suggestLoading}
                      onClick={() => {
                        if (suggestion?.suggested_code) {
                          form.setFieldsValue({ code: suggestion.suggested_code });
                        }
                      }}
                    >
                      자동 제안
                    </Button>
                  </Tooltip>
                ) : undefined
              }
            />
          </Form.Item>
          <Form.Item label={modalMode === 'edit' ? '카테고리 변경 (선택)' : '카테고리 (선택)'} style={{ marginBottom: 0 }}>
            <Space.Compact block>
              <Form.Item name="rootCategoryId" noStyle>
                <Select
                  style={{ flex: 1 }}
                  placeholder="대분류"
                  allowClear
                  onChange={() => {
                    form.setFieldValue('midCategoryId', undefined);
                    form.setFieldValue('leafCategoryId', undefined);
                  }}
                  options={rootCategories.map((c: ProductCategory) => ({ label: c.name, value: c.id }))}
                />
              </Form.Item>
              <Form.Item name="midCategoryId" noStyle>
                <Select
                  style={{ flex: 1 }}
                  placeholder="중분류"
                  allowClear
                  disabled={!selectedRoot || midCategories.length === 0}
                  onChange={() => form.setFieldValue('leafCategoryId', undefined)}
                  options={midCategories.map((c) => ({ label: c.name, value: c.id }))}
                />
              </Form.Item>
              <Form.Item name="leafCategoryId" noStyle>
                <Select
                  style={{ flex: 1 }}
                  placeholder="소분류"
                  allowClear
                  disabled={!selectedMid || leafCategories.length === 0}
                  options={leafCategories.map((c) => ({ label: c.name, value: c.id }))}
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>
          <div style={{ fontSize: 11, color: '#8a94a6', marginBottom: 10 }}>
            {modalMode === 'edit'
              ? `현재 연결: ${editing?.category_name ?? '미지정'}. 변경하려면 새로 선택하세요.`
              : '대→중→소 순서대로 선택. 가장 깊은 레벨이 그룹의 카테고리로 저장됩니다.'}
          </div>
          {modalMode === 'create' && deepestCategoryId && (
            suggestion && suggestion.existing_groups.length > 0 ? (
              <Collapse
                size="small"
                ghost
                style={{ marginBottom: 14, background: '#f8fafc', borderRadius: 6 }}
                items={[{
                  key: 'existing',
                  label: <span style={{ fontSize: 12 }}>이 카테고리의 기존 그룹 ({suggestion.existing_groups.length}) — 네이밍 참고</span>,
                  children: (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#475569' }}>
                      {suggestion.existing_groups.map((g) => (
                        <li key={g.code}>
                          {g.name} <span style={{ color: '#94a3b8' }}>({g.code})</span>
                        </li>
                      ))}
                    </ul>
                  ),
                }]}
              />
            ) : (
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>
                이 카테고리에 등록된 그룹이 없습니다.
              </div>
            )
          )}
          <Form.Item name="brand" label="브랜드">
            <Input />
          </Form.Item>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
