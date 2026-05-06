import { forwardRef, Fragment, type CSSProperties } from 'react';
import OrderQrBadge from './OrderQrBadge';

/** 지시서 인쇄 통일: 10pt 본문, 요약·품목 테이블 스타일, 하단 우측 서명 */
const PT = '10pt';
const RECEIPT_PT = '8pt';
const BORDER = '#d8d8d8';
const HEADER_CELL_BG = '#f2f2f2';
const MAIN_TH_BG = '#f2f2f2';
const ROW_MIN_H = 28;

export interface PrintColumn {
  label: string;
  key: string;
  align?: 'left' | 'center' | 'right';
  /** 수량·단가 등 숫자 열 → 우측 정렬 */
  numeric?: boolean;
  width?: number;
  bold?: boolean;
}

export interface PrintDocumentProps {
  title: string;
  subtitle?: string;
  orderNo: string;
  /** QR 하단 문서번호 라벨 — 지시서가 아닌 전표/리스트 출력에서 덮어쓴다 */
  documentNoLabel?: string;
  /** QR에 박을 값 (UUID). 생략하면 orderNo를 사용 */
  qrValue?: string;
  /** 회사 표기 (기본 (주) WBS — We Build Systems) */
  companyBrand?: string;
  /** 문서 하단(영수증 스타일) 발행일시 — 미입력 시 출력 시점 기준 */
  issuedAt?: string;
  /** 하단 소형 문구(예: 담당자 이름) */
  documentOperator?: string;
  info: { label: string; value: string }[];
  columns: PrintColumn[];
  data: Record<string, unknown>[];
  footer?: { left: string; right?: string };
  signatureLabels?: string[];
}

const page: CSSProperties = {
  fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
  color: '#000',
  padding: 0,
  paddingBottom: 20,
  fontSize: PT,
  lineHeight: 1.35,
};

const PrintDocument = forwardRef<HTMLDivElement, PrintDocumentProps>(
  (
    {
      title,
      subtitle,
      orderNo,
      documentNoLabel = '지시서 번호',
      qrValue,
      companyBrand = '(주) WBS',
      issuedAt,
      documentOperator,
      info,
      columns,
      data,
      footer,
      signatureLabels = ['담당자', '승인자'],
    },
    ref,
  ) => {
    const issuedAtStr = issuedAt ?? new Date().toLocaleString('ko-KR');
    const docNo = orderNo?.trim() || '—';
    const qrPayload = qrValue?.trim() || orderNo?.trim() || '-';

    const cellAlign = (c: PrintColumn): 'left' | 'center' | 'right' => {
      if (c.align) return c.align;
      if (c.numeric) return 'right';
      return 'left';
    };

    const infoTable: CSSProperties = {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      marginBottom: 14,
      fontSize: PT,
    };
    const infoLabel: CSSProperties = {
      border: `1px solid ${BORDER}`,
      padding: '4px 10px',
      background: HEADER_CELL_BG,
      fontWeight: 500,
      color: '#9ca3af',
      width: 88,
      minHeight: ROW_MIN_H,
      verticalAlign: 'middle',
    };
    const infoValue: CSSProperties = {
      border: `1px solid ${BORDER}`,
      padding: '4px 10px',
      minHeight: ROW_MIN_H,
      verticalAlign: 'middle',
      wordBreak: 'break-word',
      background: '#fff',
      color: '#000',
      fontWeight: 700,
    };

    const dataTable: CSSProperties = {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
      fontSize: PT,
      marginBottom: 12,
    };
    const dataTh: CSSProperties = {
      border: `1px solid ${BORDER}`,
      padding: '5px 8px',
      background: MAIN_TH_BG,
      fontWeight: 700,
      textAlign: 'center',
      color: '#222',
      minHeight: ROW_MIN_H,
      verticalAlign: 'middle',
    };
    const dataTd: CSSProperties = {
      border: `1px solid ${BORDER}`,
      padding: '4px 8px',
      minHeight: ROW_MIN_H,
      verticalAlign: 'middle',
      wordBreak: 'break-word',
    };

    return (
      <div ref={ref} className="print-doc print-area print-ds-root" style={page}>
        {/* 상단은 semantic <header> 사용 금지: 전역 print.css가 header { display:none } 이라 인쇄 시 제목·QR이 사라짐 */}
        <div
          className="print-ds-header"
          style={{
            borderBottom: `1px solid ${BORDER}`,
            paddingBottom: 16,
            marginBottom: 14,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 20,
            }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div
                  className="print-ds-logo"
                  style={{
                    width: 64,
                    height: 64,
                    border: `1px solid ${BORDER}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '10pt',
                    fontWeight: 800,
                    color: '#111',
                    flexShrink: 0,
                    background: '#f2f2f2',
                    letterSpacing: -0.3,
                    lineHeight: 1.15,
                    textAlign: 'center',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  WBS
                </div>
                <div>
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontSize: '10pt',
                      color: '#444',
                      fontWeight: 600,
                    }}
                  >
                    {companyBrand}
                  </p>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '24pt',
                      fontWeight: 800,
                      letterSpacing: -0.45,
                      lineHeight: 1.2,
                      color: '#000',
                      WebkitPrintColorAdjust: 'exact',
                      printColorAdjust: 'exact',
                    }}
                  >
                    {title}
                  </h1>
                  {subtitle ? (
                    <p style={{ margin: '8px 0 0', fontSize: PT, color: '#555' }}>{subtitle}</p>
                  ) : null}
                </div>
              </div>
            </div>
            <div
              className="print-ds-qr-block"
              style={{
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                minWidth: 80,
                maxWidth: 220,
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              <OrderQrBadge value={qrPayload} variant="canvas" compact />
              <div
                style={{
                  fontSize: '9pt',
                  fontWeight: 700,
                  color: '#111',
                  textAlign: 'center',
                  lineHeight: 1.25,
                  maxWidth: 200,
                  wordBreak: 'break-all',
                }}
              >
                {documentNoLabel}: {docNo}
              </div>
            </div>
          </div>
        </div>

        {/* ── 요약 테이블 ── */}
        <table style={infoTable}>
          <tbody>
            {Array.from({ length: Math.ceil(info.length / 2) }, (_, row) => (
              <tr key={row}>
                {[0, 1].map((col) => {
                  const item = info[row * 2 + col];
                  return (
                    <Fragment key={col}>
                      {item ? (
                        <>
                          <td style={infoLabel}>{item.label}</td>
                          <td style={infoValue}>{item.value}</td>
                        </>
                      ) : (
                        <>
                          <td style={infoLabel} />
                          <td style={infoValue} />
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── 품목 테이블 ── */}
        <table style={dataTable}>
          <colgroup>
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={{ ...dataTh, textAlign: 'center' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    style={{
                      ...dataTd,
                      textAlign: cellAlign(c),
                      fontWeight: c.bold ? 700 : 400,
                    }}
                  >
                    {String(row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {footer ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: PT,
              color: '#444',
              borderTop: `1px solid ${BORDER}`,
              paddingTop: 8,
              marginBottom: 8,
            }}
          >
            <span>{footer.left}</span>
            {footer.right ? <span style={{ fontWeight: 700 }}>{footer.right}</span> : null}
          </div>
        ) : null}

        {/* ── 서명: 하단 우측 정렬 ── */}
        <div
          style={{
            marginTop: footer ? 20 : 28,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 40,
            fontSize: PT,
            color: '#222',
            marginBottom: 10,
          }}
        >
          {signatureLabels.map((label) => (
            <div key={label} style={{ textAlign: 'center', minWidth: 120 }}>
              <div
                style={{
                  borderBottom: '1px solid #000',
                  width: 120,
                  margin: '0 auto 6px',
                  minHeight: 36,
                }}
              />
              <div>{label}</div>
            </div>
          ))}
        </div>

        {/* 영수증 스타일: 발행일시·담당자 — 문서 최하단 우측 */}
        <div
          className="print-ds-issued-at"
          style={{
            marginTop: 8,
            paddingTop: 6,
            paddingBottom: 6,
            textAlign: 'right',
            fontSize: RECEIPT_PT,
            lineHeight: 1.4,
            color: '#6b7280',
            borderTop: `1px solid ${BORDER}`,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <div>발행일시: {issuedAtStr}</div>
          {documentOperator ? (
            <div style={{ marginTop: 2 }}>담당자: {documentOperator}</div>
          ) : null}
        </div>
      </div>
    );
  },
);

PrintDocument.displayName = 'PrintDocument';
export default PrintDocument;
