import { useMemo, useState } from 'react';
import {
  Typography, Table, Button, Input, Space, Tag, Modal, Form, Select, App,
  Drawer, Descriptions, Spin, Divider,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, EditOutlined, StopOutlined, EyeOutlined, UserOutlined,
} from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import type { UserListItem } from '@/types/user';
import { useUsers, useUser, useCreateUser, useUpdateUser, useDeleteUser } from '@/hooks/useSettingsQuery';
import { useRoles } from '@/hooks/useRoleQuery';
import { extractApiErrorMessage } from '@/utils/apiError';

const { Title } = Typography;

const ROLE_TAG_COLOR: Record<string, string> = {
  ADMIN: 'gold',
  MANAGER: 'blue',
  OPERATOR: 'green',
  DEVELOPER: 'purple',
};

interface CreateFormValues {
  name: string;
  loginId: string;
  email?: string;
  phone?: string;
  password: string;
  roleId: string;
}

interface EditFormValues {
  name: string;
  email?: string;
  phone?: string;
  roleId: string;
}

export default function UserManagementPage() {
  const { data: users = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const [search, setSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [createForm] = Form.useForm<CreateFormValues>();
  const [editForm] = Form.useForm<EditFormValues>();
  const { message, modal } = App.useApp();

  // ── 상세 Drawer ──
  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detailUser, isLoading: detailLoading } = useUser(detailId);
  const openDetail = (id: string) => setDetailId(id);
  const closeDetail = () => setDetailId(null);

  const roleOptions = useMemo(
    () => roles.map((r) => ({
      label: `${r.name} (${r.code})`,
      value: r.id,
    })),
    [roles],
  );

  const filteredUsers = useMemo(() => {
    if (!search) return users;
    const keyword = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(keyword) ||
        u.loginId.toLowerCase().includes(keyword) ||
        u.email?.toLowerCase().includes(keyword),
    );
  }, [users, search]);

  const openCreateModal = () => {
    setCreateModalOpen(true);
  };

  const openEditModal = (user: UserListItem) => {
    setEditingUser(user);
    setEditModalOpen(true);
  };

  const handleCreate = () => {
    createForm.validateFields().then((values) => {
      createUser.mutate(values, {
        onSuccess: () => {
          message.success('사용자가 추가되었습니다.');
          setCreateModalOpen(false);
        },
        onError: (err) => {
          message.error(extractApiErrorMessage(err, '사용자 추가에 실패했습니다.'));
        },
      });
    });
  };

  const handleEdit = () => {
    if (!editingUser) return;
    editForm.validateFields().then((values) => {
      updateUser.mutate(
        { id: editingUser.id, data: values },
        {
          onSuccess: () => {
            message.success('사용자 정보가 수정되었습니다.');
            setEditModalOpen(false);
          },
          onError: (err) => {
            message.error(extractApiErrorMessage(err, '사용자 수정에 실패했습니다.'));
          },
        },
      );
    });
  };

  const handleDeactivate = (user: UserListItem) => {
    modal.confirm({
      title: `${user.name}님을 비활성화하시겠습니까?`,
      onOk: () => {
        deleteUser.mutate(user.id, {
          onSuccess: () => {
            message.success(`${user.name}님이 비활성화되었습니다.`);
          },
        });
      },
    });
  };

  const columns: ColumnsType<UserListItem> = [
    { title: '이름', dataIndex: 'name', key: 'name', width: 100 },
    { title: '아이디', dataIndex: 'loginId', key: 'loginId', width: 130 },
    { title: '이메일', dataIndex: 'email', key: 'email', width: 200 },
    {
      title: '역할',
      key: 'role',
      width: 150,
      render: (_, r) =>
        r.roleCode
          ? <Tag color={ROLE_TAG_COLOR[r.roleCode] ?? 'default'}>{r.roleName ?? r.roleCode}</Tag>
          : <Tag>없음</Tag>,
    },
    {
      title: '',
      key: 'action',
      width: 40,
      align: 'center',
      render: (_, record) => (
        <RowActionMenu
          items={[
            { key: 'detail', label: '상세', icon: <EyeOutlined />, onClick: () => openDetail(record.id) },
            { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => openEditModal(record) },
            { key: 'deactivate', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => handleDeactivate(record) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>사용자 관리</Title>
        <Space>
          <Input
            placeholder="이름, 아이디 또는 이메일 검색"
            prefix={<SearchOutlined />}
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            사용자 추가
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={filteredUsers}
        rowKey="id"
        loading={isLoading}
        onRow={(record) => ({
          onClick: () => openDetail(record.id),
          style: { cursor: 'pointer' },
        })}
      />

      {/* 생성 Modal */}
      <Modal
        title="사용자 추가"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreate}
        confirmLoading={createUser.isPending}
        okText="추가"
        cancelText="취소"
        destroyOnHidden
        afterOpenChange={(open) => { if (open) createForm.resetFields(); }}
        width={520}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
              <Input placeholder="홍길동" />
            </Form.Item>
            <Form.Item name="loginId" label="아이디" rules={[{ required: true, message: '아이디를 입력하세요' }]}>
              <Input placeholder="user1" />
            </Form.Item>
            <Form.Item name="phone" label="전화번호">
              <Input placeholder="010-1234-5678" />
            </Form.Item>
          </div>
          <Form.Item name="email" label="이메일">
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="비밀번호"
            rules={[
              { required: true, message: '비밀번호를 입력하세요' },
              { min: 6, message: '비밀번호는 6자 이상이어야 합니다' },
            ]}
          >
            <Input.Password placeholder="6자 이상" />
          </Form.Item>
          <Form.Item name="roleId" label="역할" rules={[{ required: true, message: '역할을 선택하세요' }]}>
            <Select placeholder="역할 선택" options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 수정 Modal */}
      <Modal
        title="사용자 수정"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleEdit}
        confirmLoading={updateUser.isPending}
        okText="수정"
        cancelText="취소"
        destroyOnHidden
        afterOpenChange={(open) => {
          if (open && editingUser) {
            editForm.setFieldsValue({
              name: editingUser.name,
              email: editingUser.email ?? '',
              roleId: editingUser.roleId ?? '',
            });
          }
        }}
        width={520}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
              <Input placeholder="홍길동" />
            </Form.Item>
            <Form.Item name="email" label="이메일">
              <Input placeholder="user@example.com" />
            </Form.Item>
            <Form.Item name="phone" label="전화번호">
              <Input placeholder="010-1234-5678" />
            </Form.Item>
          </div>
          <Form.Item name="roleId" label="역할" rules={[{ required: true, message: '역할을 선택하세요' }]}>
            <Select placeholder="역할 선택" options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 사용자 상세 Drawer */}
      <Drawer
        title={
          <Space>
            <UserOutlined />
            <span>사용자 상세</span>
          </Space>
        }
        open={!!detailId}
        onClose={closeDetail}
        width={480}
        extra={
          detailUser && (
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  const listItem = filteredUsers.find((u) => u.id === detailUser.id);
                  if (listItem) {
                    closeDetail();
                    openEditModal(listItem);
                  }
                }}
              >
                수정
              </Button>
            </Space>
          )
        }
      >
        {detailLoading ? (
          <Spin style={{ display: 'block', margin: '80px auto' }} />
        ) : detailUser ? (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="이름">{detailUser.name}</Descriptions.Item>
              <Descriptions.Item label="아이디">{detailUser.loginId}</Descriptions.Item>
              <Descriptions.Item label="이메일">{detailUser.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="전화번호">{detailUser.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="역할">
                {detailUser.roleCode
                  ? (
                    <Tag color={ROLE_TAG_COLOR[detailUser.roleCode] ?? 'default'}>
                      {detailUser.roleName ?? detailUser.roleCode}
                    </Tag>
                  )
                  : <Tag>없음</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="상태">
                {detailUser.active ? (
                  <Tag color="green">활성</Tag>
                ) : (
                  <Tag color="default">비활성</Tag>
                )}
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              User ID: <code>{detailUser.id}</code>
            </div>
          </>
        ) : null}
      </Drawer>
    </>
  );
}
