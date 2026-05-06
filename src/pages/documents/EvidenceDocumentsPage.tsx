import { Card, Empty, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;

interface EvidenceRow {
  id: string;
  attachmentType: string;
  targetNo: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
}

const columns: ColumnsType<EvidenceRow> = [
  { title: '증빙 유형', dataIndex: 'attachmentType', width: 140 },
  { title: '업무 번호', dataIndex: 'targetNo', width: 180 },
  { title: '파일명', dataIndex: 'fileName' },
  { title: '등록자', dataIndex: 'uploadedBy', width: 140 },
  { title: '등록일시', dataIndex: 'uploadedAt', width: 180 },
];

export default function EvidenceDocumentsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Space direction="vertical" size={2}>
        <Title level={4} style={{ margin: 0 }}>작업 증빙</Title>
        <Text type="secondary">검수·불량·실사 사진 첨부</Text>
      </Space>

      <Card size="small">
        <Space wrap>
          <Select
            allowClear
            placeholder="증빙 유형"
            style={{ width: 180 }}
            options={[
              { value: 'INSPECTION', label: '검수' },
              { value: 'DEFECT', label: '불량' },
              { value: 'STOCK_COUNT', label: '실사' },
              { value: 'RETURN', label: '반품' },
            ]}
          />
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={[]}
          pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 증빙이 없습니다" /> }}
        />
      </Card>
    </div>
  );
}
