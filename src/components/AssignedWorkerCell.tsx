import { Space, Tag, Typography } from 'antd';
import { UserSwitchOutlined } from '@ant-design/icons';
import { resolveUserName } from '@/hooks/useUserNameMap';

const { Text } = Typography;

interface AssignedWorkerCellProps {
  assignedTo?: string | null;
  assignedToName?: string | null;
  userMap?: Map<string, string>;
}

export default function AssignedWorkerCell({ assignedTo, assignedToName, userMap }: AssignedWorkerCellProps) {
  const name = assignedToName || (userMap ? resolveUserName(userMap, assignedTo) : null);

  if (!assignedTo) {
    return <Tag color="default" style={{ margin: 0 }}>미배정</Tag>;
  }

  return (
    <Space size={6}>
      <UserSwitchOutlined style={{ color: '#1677ff' }} />
      <Text style={{ fontSize: 13 }}>{name || `${assignedTo.slice(0, 8)}…`}</Text>
    </Space>
  );
}
