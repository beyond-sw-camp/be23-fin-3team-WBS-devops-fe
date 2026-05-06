import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

export type RowActionItem = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onClick: () => void;
};

interface Props {
  items: RowActionItem[];
}

/**
 * 테이블 행 액션을 ⋮ 드롭다운 메뉴 하나로 압축.
 * 가로 공간을 40px 만 차지하므로 긴 컬럼이 많은 테이블에 적합.
 *
 * 사용 예:
 *   <RowActionMenu
 *     items={[
 *       { key: 'edit', label: '수정', icon: <EditOutlined />, onClick: () => ... },
 *       { key: 'deactivate', label: '비활성화', icon: <StopOutlined />, danger: true, onClick: () => ... },
 *     ]}
 *   />
 */
export default function RowActionMenu({ items }: Props) {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  const menuItems: MenuProps['items'] = [];
  visible.forEach((item, idx) => {
    // 파괴적 액션 앞에 divider 삽입
    if (item.danger && idx > 0 && !visible[idx - 1].danger) {
      menuItems.push({ type: 'divider', key: `div-${idx}` });
    }
    menuItems.push({
      key: item.key,
      label: item.label,
      icon: item.icon,
      danger: item.danger,
      disabled: item.disabled,
    });
  });

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: menuItems,
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation();
          visible.find((i) => i.key === key)?.onClick();
        },
      }}
    >
      <Button
        type="text"
        size="small"
        icon={<MoreOutlined />}
        onClick={(e) => e.stopPropagation()}
      />
    </Dropdown>
  );
}
