import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography, Card, Button, Table, App, Result, Space, Tag,
  Descriptions, Divider, Modal, Spin, Input,
} from 'antd';
import {
  PlusOutlined, BankOutlined, CopyOutlined, EyeOutlined, StopOutlined,
  ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import RowActionMenu from '@/components/RowActionMenu';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getClients, getClientDetail, deactivateClient,
  type ClientItem, type ClientDetail,
} from '@/api/developer';
import type { UserListItem } from '@/types/user';
import { useAuth } from '@/hooks/useAuth';

const { Title, Text } = Typography;

const ROLE_TAG: Record<string, string> = {
  ADMIN: 'gold', MANAGER: 'blue', OPERATOR: 'green', DEVELOPER: 'purple',
};

export default function DeveloperClientListPage() {
  const { user, currentRole } = useAuth();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['developer-clients'],
    queryFn: getClients,
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['developer-client-detail', detailId],
    queryFn: () => getClientDetail(detailId!),
    enabled: !!detailId && detailOpen,
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateClient,
    onSuccess: () => {
      message.success('회사가 비활성화되었습니다.');
      qc.invalidateQueries({ queryKey: ['developer-clients'] });
      setDetailOpen(false);
    },
  });

  if (currentRole !== 'DEVELOPER') {
    return <Result status="403" title="접근 권한 없음" subTitle="이 페이지는 DEVELOPER 역할만 접근할 수 있습니다." />;
  }

  const openDetail = (id: string) => { setDetailId(id); setDetailOpen(true); };

  const handleDeactivate = (client: ClientItem | ClientDetail) => {
    modal.confirm({
      title: `"${client.name}" 회사를 비활성화하시겠습니까?`,
      content: '소속된 모든 사용자도 함께 비활성화됩니다.',
      okText: '비활성화',
      okButtonProps: { danger: true },
      onOk: () => deactivateMutation.mutateAsync(client.id),
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('클립보드에 복사됨'));
  };

  const filteredClients = clients.filter((c) => {
    if (!search) return true;
    const k = search.toLowerCase();
    return c.name.toLowerCase().includes(k) || c.bizNo.includes(search);
  });

  const clientColumns: ColumnsType<ClientItem> = [
    { title: '회사명', dataIndex: 'name', key: 'name', width: 200 },
    { title: '사업자번호', dataIndex: 'bizNo', key: 'bizNo', width: 160 },
    {
      title: 'Client ID', dataIndex: 'id', key: 'id', width: 280,
      render: (v: string) => (
        <Space size={4}>
          <Text code style={{ fontSize: 11 }}>{v}</Text>
          <Button type="text" size="small" icon={<CopyOutlined />} onClick={(e) => { e.stopPropagation(); copyToClipboard(v); }} />
        </Space>
      ),
    },
    { title: '생성일', dataIndex: 'createdAt', key: 'createdAt', width: 170 },
    {
      title: '', key: 'action', width: 40, align: 'center',
      render: (_, record) => (
        <RowActionMenu
          items={[
            { key: 'detail', label: '상세', icon: <EyeOutlined />, onClick: () => openDetail(record.id) },
            { key: 'deactivate', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => handleDeactivate(record) },
          ]}
        />
      ),
    },
  ];

  const userColumns: ColumnsType<UserListItem> = [
    { title: '이름', dataIndex: 'name', key: 'name', width: 100 },
    { title: '아이디', dataIndex: 'loginId', key: 'loginId', width: 120 },
    { title: '이메일', dataIndex: 'email', key: 'email', width: 200 },
    {
      title: '역할', key: 'role', width: 130,
      render: (_, u) => u.roleCode
        ? <Tag color={ROLE_TAG[u.roleCode] ?? 'default'}>{u.roleName ?? u.roleCode}</Tag>
        : <Tag>없음</Tag>,
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            <BankOutlined /> 회사 목록
          </Title>
          <Text type="secondary">플랫폼에 등록된 회사와 관리자 계정을 관리합니다.</Text>
        </div>
        <Tag color="purple" style={{ fontSize: 13, padding: '4px 12px' }}>
          {user?.loginId ?? 'developer'} · DEVELOPER
        </Tag>
      </div>

      <Card
        extra={
          <Space>
            <Input
              placeholder="회사명 또는 사업자번호"
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 240 }}
            />
            <Button icon={<ReloadOutlined />} onClick={() => qc.invalidateQueries({ queryKey: ['developer-clients'] })}>
              새로고침
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/developer/clients/new')}>
              회사 등록
            </Button>
          </Space>
        }
        title={`전체 ${filteredClients.length}개 회사`}
      >
        <Table
          columns={clientColumns}
          dataSource={filteredClients}
          rowKey="id"
          loading={isLoading}
          size="middle"
          pagination={{ pageSize: 10 }}
          onRow={(record) => ({ onClick: () => openDetail(record.id), style: { cursor: 'pointer' } })}
        />
      </Card>

      {/* 상세 Modal */}
      <Modal
        title={detail ? `${detail.name} 상세` : '회사 상세'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={
          detail ? (
            <Space>
              <Button danger icon={<StopOutlined />} onClick={() => handleDeactivate(detail)} loading={deactivateMutation.isPending}>
                회사 비활성화
              </Button>
              <Button onClick={() => setDetailOpen(false)}>닫기</Button>
            </Space>
          ) : null
        }
        width={720}
      >
        {detailLoading ? (
          <Spin style={{ display: 'block', margin: '40px auto' }} />
        ) : detail ? (
          <>
            <Descriptions column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="회사명">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="사업자번호">{detail.bizNo}</Descriptions.Item>
              <Descriptions.Item label="Client ID" span={2}>
                <Space size={4}>
                  <Text code style={{ fontSize: 11 }}>{detail.id}</Text>
                  <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(detail.id)} />
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="생성일">{detail.createdAt}</Descriptions.Item>
              <Descriptions.Item label="상태">
                {detail.active
                  ? <Tag color="green">활성</Tag>
                  : <Tag color="default">비활성</Tag>}
              </Descriptions.Item>
            </Descriptions>
            <Divider orientation="left" plain>소속 사용자 ({detail.users.length}명)</Divider>
            <Table
              columns={userColumns}
              dataSource={detail.users}
              rowKey="id"
              size="small"
              pagination={false}
            />
          </>
        ) : null}
      </Modal>
    </>
  );
}
