# 수주서 → 출고지시서 생성 플로우

## 한 줄 요약

ERP 수주서를 받아서 → 창고별 재고 확인 → 분할 또는 단일로 출고지시서 생성 → 수주서 진행률 자동 추적

---

## 전체 흐름도

```
┌─────────────────────────────────────────────┐
│ 1. ERP 수주서 선택 화면                      │
│    - 출고예정일별 그룹                       │
│    - 같은 날짜만 다중 선택 가능              │
│    - 처리 완료 토글로 숨김                   │
└──────────────────┬──────────────────────────┘
                   │ [선택 완료] 클릭
                   ▼
┌─────────────────────────────────────────────┐
│ 2. 미리보기 화면                             │
│    - 출고처별 자동 분리 (탭/섹션)            │
│    - 창고 × 품목 가용재고 매트릭스           │
│    - 추천 창고 자동 산정                     │
└────────┬────────────────────────┬───────────┘
         │                        │
     단일 가능                단일 불가
         │                        │
         ▼                        ▼
┌──────────────────┐    ┌────────────────────┐
│ 3-A. 단일 창고   │    │ 3-B. 분할 출고     │
│      선택 후 생성│    │      모달 자동 노출│
└────────┬─────────┘    └─────────┬──────────┘
         │                        │
         └──────────┬─────────────┘
                    ▼
┌─────────────────────────────────────────────┐
│ 4. 출고지시서 생성                           │
│    - 창고당 OB 1장 생성                      │
│    - 링크 테이블에 N:M 관계 기록             │
│    - SO 라인 allocatedQty 누적               │
└──────────────────┬──────────────────────────┘
                   ▼
┌─────────────────────────────────────────────┐
│ 5. 후속 업무 (기존 흐름)                     │
│    승인 → 피킹 → 출고 확정                   │
│    출고 확정 시 SO 진행률 자동 갱신          │
└─────────────────────────────────────────────┘
```

---

## 단계별 상세

### 1단계 — 수주서 선택

**화면 예시:**

```
정렬: [출고예정일 ▼] · 처리완료 숨기기 [ON]
─────────────────────────────────────────────
📅 2026-04-30 (D-1) 🔴 마감 임박
  ☑ SO-002  롯데하이마트  콜라 100, 사이다 50  [미처리]
  ☑ SO-003  롯데하이마트  콜라 200 외 1건      [부분 50%]
  ☐ SO-007  이마트       환타 30              [미처리]

📅 2026-05-04 (D-5)
  ░ SO-014  롯데하이마트  콜라 200            [미처리] ← 비활성
─────────────────────────────────────────────
              [선택 항목으로 출고지시서 생성]
```

**API:** `GET /outbound/erp-sales-orders`

**응답에 포함:**

- `processStatus`: NOT_STARTED / PARTIAL / COMPLETED → 우측 배지
- `dispatchProgressPercent`: "부분 50%" 같은 진행률
- `itemPreview` + `itemCount`: "콜라 100, 사이다 50" 또는 "외 1건"
- `scheduledDate`: 출고예정일 (FE에서 그룹핑)

**핵심 UX 제약:**

- 같은 출고예정일만 다중 선택 가능
- 첫 체크 시 다른 날짜 그룹은 비활성화
- 다른 날짜 클릭 시 → 교체 확인 모달

---

### 2단계 — 창고별 재고 미리보기

**호출 시점:** 1단계에서 [생성] 버튼 누른 직후

**API:** `POST /outbound/preview`

```json
{
  "salesOrderIds": ["SO-002", "SO-003"]
}
```

**검증:**

- 모든 SO가 같은 클라이언트
- 모든 SO가 같은 출고예정일 (다르면 400 에러)

**응답 구조:**

```
shipDate: 2026-04-30
storeGroups: [
  {
    storeName: "롯데하이마트",
    salesOrderIds: [SO-002, SO-003],
    requirements: [
      {
        productName: "콜라 500ml",
        requiredQty: 300,  // SO-002의 100 + SO-003의 200
        warehouses: [
          { 대전창고: 가용 500, 입고예정 0, 다른draft 0, projected 500, SUFFICIENT },
          { 서울창고: 가용 200, 입고예정 100, 다른draft 0, projected 300, SUFFICIENT },
          ...
        ]
      }
    ],
    recommendedWarehouseId: "대전"  // null이면 분할 필요
  }
]
```

**핵심 계산:**

```
projectedQty = currentAvailableQty + incomingQty - draftReservedQty

상태:
  ≥ requiredQty       → SUFFICIENT (충분)
  > 0 and < required  → SHORTAGE (부족)
  = 0                 → NONE (없음)

추천 창고: 모든 품목이 SUFFICIENT인 창고 중 가용량 큰 순
            없으면 null → FE가 분할 모달 자동 노출
```

---

### 3-A단계 — 단일 창고로 가능한 경우

화면에서 추천 창고 강조 → 사용자가 선택 → [생성] 클릭

**API:** `POST /outbound/from-sales-orders`

```json
{
  "salesOrderIds": ["SO-002", "SO-003"],
  "warehouseAllocations": [
    {
      "warehouseId": "대전",
      "productAllocations": [
        { "productId": "콜라",   "qty": 300 },
        { "productId": "사이다", "qty": 50 }
      ]
    }
  ]
}
```

→ OB 1장 생성 (대전창고)

---

### 3-B단계 — 분할 출고가 필요한 경우

**자동 추천 받기:**

`POST /outbound/preview/split-recommendation`

```json
{
  "salesOrderIds": ["SO-002", "SO-003"],
  "storeId": "롯데"
}
```

**알고리즘:** 품목별로 projectedQty 큰 창고부터 그리디로 채움

**응답:**

```json
{
  "recommendations": [
    { "warehouseId": "대전", "qty": 200 },
    { "warehouseId": "서울", "qty": 100 }
  ],
  "unallocatedQty": 0,
  "shortages": []
}
```

**분할 모달 화면:**

```
한 창고로 모든 수량을 출고할 수 없습니다

콜라 300개:
  ☑ 대전 창고: [200] 개
  ☑ 서울 창고: [100] 개
  합계: 300 / 300 ✓

→ 출고지시서 2장이 생성됩니다
[수동 조정] [취소] [확인 생성]
```

사용자가 [확인] → 같은 API로 분할 분배 정보 전송 → OB 2장 생성

---

### 4단계 — 출고지시서 생성 내부 동작

```
@Transactional
createFromSalesOrders():

① 검증
   - 같은 클라이언트
   - 같은 출고처 (한 호출에 한 store)
   - 같은 출고예정일
   - 분배 합 ≤ SO 라인 잔여(qty - allocatedQty)

② 각 warehouseAllocation 별로 OB 1장 생성
   - orderNo 자동 채번 (OB-YYYYMMDD-NNNNN)
   - status = draft
   - origin_id = 첫 SO id (대표용)
   - 전체 N:M 관계는 링크 테이블로

③ OB 라인 생성 (productAllocations 만큼)

④ SO 라인에 그리디 분배 (잔여 큰 라인부터)
   - 링크 행 생성: "이 OB에 SO_X 라인에서 N개"
   - SO 라인의 allocatedQty += take 누적

⑤ 응답: { outboundOrderIds: [...] }
```

**다중 출고처 케이스:** FE가 출고처별로 분리해서 호출 (한 호출엔 한 출고처만)

---

### 5단계 — 후속 업무 (기존 흐름 + 자동 동기화)

```
draft (생성)
   ↓ [승인]
approved → 재고 reserve (Kafka)
   ↓ [피킹]
in_progress → 위치별 피킹
   ↓ [출고 확정]
completed/partial → 재고 release
                  → SO 라인 dispatchedQty 자동 분배
```

**SO 자동 동기화:**

**출고 확정 시 (`onOutboundDispatched`):**

- OB의 dispatchedQty를 같은 product의 링크들에 비율 분배
- 각 SO 라인 dispatchedQty 누적 → 진행률 페이지 갱신

**취소 시 (`onOutboundCancelled`):**

- SO 라인 allocatedQty 차감 (원복)
- 링크 soft delete (이력 보존)

---

## 데이터 변화 예시 (전체 시나리오)

### 시작

```
SO-002 콜라: 주문 100, allocatedQty 0, dispatchedQty 0
SO-003 콜라: 주문 200, allocatedQty 0, dispatchedQty 0
```

### OB 생성 (분할: 대전 200, 서울 100)

```
링크 테이블:
  Link1: OB-대전 ← SO-002 콜라에서 100개
  Link2: OB-대전 ← SO-003 콜라에서 100개
  Link3: OB-서울 ← SO-003 콜라에서 100개

SO 상태:
  SO-002 콜라: allocatedQty 100/100 (완료)
  SO-003 콜라: allocatedQty 200/200 (완료)
```

### OB-대전 출고 확정 (200개 다 출고)

```
SO-002 콜라 dispatchedQty += 100  (100 × 200/200)
SO-003 콜라 dispatchedQty += 100  (100 × 200/200)
```

### OB-서울 취소

```
Link3 soft delete (cancelled_at 채움)
SO-003 콜라 allocatedQty: 200 → 100 (원복)
SO-003: 잔여 100 다시 추가 OB 생성 가능
```

→ 진행률 페이지에 "SO-003 부분 처리, 100/200 출고됨, 잔여 100"

---

## 주요 검증 규칙

| # | 규칙 |
| --- | --- |
| 1 | 선택 시: 같은 출고예정일만 |
| 2 | 생성 시: 같은 출고처만 (한 호출당) |
| 3 | 분배 합 ≤ SO 잔여 (qty - allocatedQty) |
| 4 | 분배 음수 불가 (Math.max(0, ...) 가드) |
| 5 | 취소된 OB의 링크는 자동 soft delete |

---

## 핵심 용어 정리

| 용어 | 의미 |
| --- | --- |
| SO (수주서) | ERP에서 받은 주문서 |
| SO 라인 | 수주서 안의 품목 1줄 |
| OB (출고지시서) | 우리가 만든 출고 문서 |
| 링크 (OutboundSalesOrderLinks) | OB ↔ SO 라인 N:M 연결 기록 |
| allocatedQty | SO 라인이 OB로 보낸 양 (분배 누적) |
| dispatchedQty | SO 라인이 실제 출고된 양 (진행률) |
| projectedQty | 출고예정일 시점 가용재고 예측치 |

---

## 백엔드 완료 항목 요약

| Step | 작업 |
| --- | --- |
| 1 | N:M 데이터 모델 (링크 테이블 + 컬럼 + 인덱스 4개) |
| 2 | 미리보기 API (`POST /outbound/preview`) |
| 3 | 분할 추천 + 출고 생성 API |
| 4 | dispatch/cancel 시 SO 동기화 + dispatchedQty 버그 픽스 |
| 5 | 진행률 조회 API |
| 6 | 수주서 목록 보강 (필터·진행률·품목요약) |
