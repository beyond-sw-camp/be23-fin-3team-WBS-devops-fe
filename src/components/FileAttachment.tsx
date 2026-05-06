import { Alert, Button } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

interface Props {
  ref_type: string;
  ref_id: number | string;
  editable?: boolean;
}

export default function FileAttachment({ editable = false }: Props) {

  return (
    <div>
      {editable && (
        <Button icon={<UploadOutlined />} size="small" style={{ marginBottom: 8 }} disabled>
          파일 업로드
        </Button>
      )}
      <Alert
        type="info"
        showIcon
        message="첨부 기능 준비 중"
        description="현재 이 화면에서는 파일 업로드, 다운로드, 삭제를 지원하지 않습니다."
      />
    </div>
  );
}
