import { QRCodeSVG } from 'qrcode.react';

export interface RackQrLabelProps {
  rackId: string;
  rackCode: string;
  rackName?: string | null;
  zoneCode?: string | null;
  zoneName?: string | null;
  warehouseCode?: string | null;
  warehouseName?: string | null;
  /** 인쇄 라벨의 한 변(mm) — A4 3열 기준 60mm 정도가 적당 */
  sizeMm?: number;
}

export default function RackQrLabel({
  rackId, rackCode, rackName, zoneCode, zoneName, warehouseCode, warehouseName, sizeMm = 60,
}: RackQrLabelProps) {
  const value = `rack:${rackId}`;
  const headerParts = [warehouseCode, zoneCode].filter(Boolean).join(' / ');
  const subParts = [warehouseName, zoneName].filter(Boolean).join(' · ');

  return (
    <div
      className="rack-qr-label"
      style={{
        width: `${sizeMm}mm`,
        height: `${sizeMm}mm`,
        boxSizing: 'border-box',
        padding: '3mm',
        border: '1px solid #000',
        borderRadius: 4,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <div style={{ width: '100%', textAlign: 'center', lineHeight: 1.1 }}>
        {headerParts && (
          <div style={{ fontSize: '2.6mm', color: '#333', fontFamily: 'ui-monospace, Menlo, monospace' }}>
            {headerParts}
          </div>
        )}
        <div style={{ fontSize: '4.6mm', fontWeight: 800, marginTop: '0.5mm', fontFamily: 'ui-monospace, Menlo, monospace' }}>
          {rackCode}
        </div>
        {rackName && (
          <div style={{ fontSize: '2.4mm', color: '#555', marginTop: '0.5mm' }}>{rackName}</div>
        )}
      </div>

      <QRCodeSVG value={value} size={Math.round(sizeMm * 2.4)} />

      <div style={{ width: '100%', textAlign: 'center', fontSize: '2mm', color: '#666', lineHeight: 1.1 }}>
        {subParts || ' '}
      </div>
    </div>
  );
}
