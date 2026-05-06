import { useEffect, useMemo, useState } from 'react';
import {
  Card, List, Button, Input, Form, Modal, Tag, Typography, Space, Checkbox, App,
  Result, Empty, Spin, Divider, Popconfirm,
} from 'antd';
import {
  PlusOutlined, SaveOutlined, DeleteOutlined, LockOutlined, EditOutlined, CloseOutlined,
} from '@ant-design/icons';
import { useRoles, usePermissions, useCreateRole, useUpdateRole, useDeleteRole } from '@/hooks/useRoleQuery';
import { useAuth } from '@/hooks/useAuth';
import type { Role, Permission, CreateRoleRequest } from '@/types/role';
import './permissionManagementPage.css';

const { Title, Text } = Typography;

const ROLE_COLOR: Record<string, string> = {
  ADMIN: 'gold', MANAGER: 'blue', OPERATOR: 'green', DEVELOPER: 'purple',
};

/** 권한을 리소스별로 그룹화 */
function groupPermissions(permissions: Permission[]): Record<string, Permission[]> {
  return permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.resource] ||= []).push(p);
    return acc;
  }, {});
}

export default function PermissionManagementPage() {
  const { currentRole } = useAuth();
  const { message, modal } = App.useApp();

  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: permissions = [], isLoading: permsLoading } = usePermissions();
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole();
  const deleteMutation = useDeleteRole();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPermIds, setEditPermIds] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateRoleRequest>();

  const permsByResource = useMemo(() => groupPermissions(permissions), [permissions]);

  // 첫 로드 시 첫 번째 역할 자동 선택
  useEffect(() => {
    if (!selectedRoleId && roles.length > 0) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  const selectedRole: Role | undefined = roles.find((r) => r.id === selectedRoleId);

  // 선택된 역할 변경 시 편집 상태 초기화
  useEffect(() => {
    if (selectedRole) {
      setEditing(false);
      setEditName(selectedRole.name);
      setEditDesc(selectedRole.description ?? '');
      setEditPermIds(new Set(selectedRole.permissions.map((p) => p.id)));
    }
  }, [selectedRole?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 권한 체크
  if (currentRole !== 'DEVELOPER' && currentRole !== 'ADMIN') {
    return <Result status="403" title="접근 권한 없음" subTitle="이 페이지는 ADMIN 이상만 접근할 수 있습니다." />;
  }

  const togglePermId = (id: string, checked: boolean) => {
    setEditPermIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllInResource = (resourcePerms: Permission[], checked: boolean) => {
    setEditPermIds((prev) => {
      const next = new Set(prev);
      resourcePerms.forEach((p) => {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      });
      return next;
    });
  };

  const handleSaveEdit = () => {
    if (!selectedRole) return;
    updateMutation.mutate(
      {
        id: selectedRole.id,
        data: {
          name: editName,
          description: editDesc,
          permissionIds: Array.from(editPermIds),
        },
      },
      {
        onSuccess: () => {
          message.success('역할이 수정되었습니다.');
          setEditing(false);
        },
        onError: () => message.error('수정에 실패했습니다.'),
      },
    );
  };

  const handleDelete = (role: Role) => {
    modal.confirm({
      title: `"${role.name}" 역할을 삭제하시겠습니까?`,
      content: '이 역할을 사용 중인 사용자가 있으면 삭제되지 않을 수 있습니다.',
      okText: '삭제',
      okButtonProps: { danger: true },
      onOk: () => deleteMutation.mutateAsync(role.id).then(() => {
        message.success('역할이 삭제되었습니다.');
        setSelectedRoleId(null);
      }).catch(() => message.error('삭제에 실패했습니다.')),
    });
  };

  const handleCreate = () => {
    createForm.validateFields().then((values) => {
      createMutation.mutate(
        { ...values, permissionIds: values.permissionIds ?? [] },
        {
          onSuccess: () => {
            message.success('역할이 생성되었습니다.');
            setCreateOpen(false);
            createForm.resetFields();
          },
          onError: () => message.error('생성에 실패했습니다.'),
        },
      );
    });
  };

  const isSystem = selectedRole?.system ?? false;
  const canEdit = !isSystem;
  const canDelete = !isSystem;

  if (rolesLoading || permsLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  return (
    <div className="permission-management-page">
      <div className="permission-management-page__shell">
        <div className="permission-management-page__header">
          <div className="permission-management-page__intro">
            <Title level={4} className="permission-management-page__title" style={{ margin: 0 }}>
              역할 관리
            </Title>
            <p className="permission-management-page__subtitle" style={{ margin: '6px 0 0' }}>
              역할을 생성하고 권한을 부여합니다. 시스템 역할(ADMIN · MANAGER · OPERATOR)은 수정할 수 없습니다.
            </p>
          </div>
          <div className="permission-management-page__controls">
            <Tag className="permission-management-page__role-badge">내 역할: {currentRole}</Tag>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              역할 추가
            </Button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, minHeight: 500 }}>
          {/* ── 좌측: 역할 목록 ── */}
          <Card
            size="small"
            title={`역할 (${roles.length})`}
            styles={{ body: { padding: 0, maxHeight: 560, overflowY: 'auto' } }}
          >
            <List
              dataSource={roles}
              renderItem={(role) => {
                const isSelected = role.id === selectedRoleId;
                return (
                  <List.Item
                    onClick={() => setSelectedRoleId(role.id)}
                    style={{
                      cursor: 'pointer',
                      padding: '12px 16px',
                      background: isSelected ? '#eff6ff' : 'transparent',
                      borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tag color={ROLE_COLOR[role.code] ?? 'default'} style={{ margin: 0 }}>
                          {role.code}
                        </Tag>
                        {role.system && <LockOutlined style={{ fontSize: 11, color: '#94a3b8' }} />}
                      </div>
                      <div style={{ marginTop: 4, fontWeight: 600, fontSize: 14 }}>{role.name}</div>
                      {role.description && (
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{role.description}</div>
                      )}
                    </div>
                  </List.Item>
                );
              }}
            />
          </Card>

          {/* ── 우측: 역할 상세/편집 ── */}
          <Card size="small">
            {!selectedRole ? (
              <Empty description="역할을 선택하세요" style={{ margin: '100px 0' }} />
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    {editing ? (
                      <Form layout="vertical" size="small">
                        <Form.Item label="역할 이름" style={{ marginBottom: 8 }}>
                          <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </Form.Item>
                        <Form.Item label="설명" style={{ marginBottom: 0 }}>
                          <Input.TextArea rows={2} value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                        </Form.Item>
                      </Form>
                    ) : (
                      <>
                        <Space size={8}>
                          <Title level={5} style={{ margin: 0 }}>{selectedRole.name}</Title>
                          <Tag color={ROLE_COLOR[selectedRole.code] ?? 'default'}>{selectedRole.code}</Tag>
                          {selectedRole.system && <Tag icon={<LockOutlined />} color="default">시스템</Tag>}
                        </Space>
                        {selectedRole.description && (
                          <div style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>{selectedRole.description}</div>
                        )}
                      </>
                    )}
                  </div>
                  <Space>
                    {editing ? (
                      <>
                        <Button size="small" icon={<CloseOutlined />} onClick={() => setEditing(false)}>취소</Button>
                        <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSaveEdit} loading={updateMutation.isPending}>
                          저장
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="small" icon={<EditOutlined />} disabled={!canEdit} onClick={() => setEditing(true)}>
                          수정
                        </Button>
                        <Popconfirm
                          title="정말 삭제하시겠습니까?"
                          onConfirm={() => handleDelete(selectedRole)}
                          disabled={!canDelete}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} disabled={!canDelete}>
                            삭제
                          </Button>
                        </Popconfirm>
                      </>
                    )}
                  </Space>
                </div>

                <Divider style={{ margin: '12px 0' }} />

                <div style={{ marginBottom: 8 }}>
                  <Text strong>권한</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    {editing ? `${editPermIds.size}개 선택` : `${selectedRole.permissions.length}개 허용`}
                  </Text>
                </div>

                {Object.keys(permsByResource).length === 0 ? (
                  <Empty description="권한 데이터가 없습니다" />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    {Object.entries(permsByResource).map(([resource, rps]) => {
                      const allChecked = rps.every((p) => editPermIds.has(p.id));
                      const someChecked = rps.some((p) => editPermIds.has(p.id));
                      return (
                        <Card
                          key={resource}
                          size="small"
                          title={
                            editing ? (
                              <Checkbox
                                checked={allChecked}
                                indeterminate={!allChecked && someChecked}
                                onChange={(e) => toggleAllInResource(rps, e.target.checked)}
                              >
                                <span style={{ fontWeight: 600 }}>{resource}</span>
                              </Checkbox>
                            ) : (
                              <span style={{ fontWeight: 600 }}>{resource}</span>
                            )
                          }
                          styles={{ body: { padding: '8px 12px' } }}
                        >
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            {rps.map((p) => {
                              const checked = editing
                                ? editPermIds.has(p.id)
                                : selectedRole.permissions.some((sp) => sp.id === p.id);
                              return editing ? (
                                <Checkbox
                                  key={p.id}
                                  checked={checked}
                                  onChange={(e) => togglePermId(p.id, e.target.checked)}
                                >
                                  <span style={{ fontSize: 13 }}>
                                    <Tag style={{ margin: 0, marginRight: 4 }}>{p.action}</Tag>
                                    {p.description}
                                  </span>
                                </Checkbox>
                              ) : (
                                <div key={p.id} style={{ fontSize: 13, opacity: checked ? 1 : 0.35 }}>
                                  <Tag color={checked ? 'blue' : 'default'} style={{ margin: 0, marginRight: 4 }}>
                                    {p.action}
                                  </Tag>
                                  {p.description}
                                </div>
                              );
                            })}
                          </Space>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      </div>

      {/* ── 역할 생성 Modal ── */}
      <Modal
        title="역할 추가"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={createMutation.isPending}
        okText="생성"
        cancelText="취소"
        width={640}
        destroyOnHidden
        afterOpenChange={(open) => { if (open) createForm.resetFields(); }}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="역할 이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
              <Input placeholder="예: 입고 담당자" />
            </Form.Item>
            <Form.Item
              name="code"
              label="역할 코드"
              tooltip={{
                title: (
                  <div style={{ lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>역할 코드 규칙</div>
                    <div>• 첫 글자는 영문 대문자</div>
                    <div>• 영문 대문자 · 숫자 · 언더스코어(_)만 허용</div>
                    <div>• 공백·소문자·특수문자 사용 불가</div>
                    <div style={{ marginTop: 6, opacity: 0.85 }}>
                      예) INBOUND_STAFF, OUTBOUND_MANAGER, WAREHOUSE_ADMIN
                    </div>
                  </div>
                ),
              }}
              rules={[
                { required: true, message: '코드를 입력하세요' },
                { pattern: /^[A-Z][A-Z0-9_]*$/, message: '영문 대문자, 숫자, 언더스코어만 허용' },
              ]}
            >
              <Input placeholder="예: INBOUND_STAFF" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="설명">
            <Input.TextArea rows={2} placeholder="역할에 대한 간단한 설명" />
          </Form.Item>
          <Form.Item
            name="permissionIds"
            label="권한"
            rules={[{ required: true, message: '하나 이상의 권한을 선택하세요' }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {Object.entries(permsByResource).map(([resource, rps]) => (
                  <Card key={resource} size="small" title={resource} styles={{ body: { padding: '8px 12px' } }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      {rps.map((p) => (
                        <Checkbox key={p.id} value={p.id}>
                          <Tag style={{ margin: 0, marginRight: 4 }}>{p.action}</Tag>
                          <span style={{ fontSize: 13 }}>{p.description}</span>
                        </Checkbox>
                      ))}
                    </Space>
                  </Card>
                ))}
              </div>
            </Checkbox.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
