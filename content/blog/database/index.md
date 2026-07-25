---
title: "DB 개요 & 데이터 모델링"
date: "2026-07-24"
category: ["Database", "Architecture"]
description: "DB 개요와 데이터 모델링 3일 학습 내용 정리. 파서·옵티마이저 내부 동작, ERD 설계, 자기참조·배타적 관계, 정규화, JOIN·서브쿼리·CTE, 집계·윈도우 함수, 트랜잭션 격리 수준 4단계·MVCC·데드락, B+Tree 인덱스, EXPLAIN 실행계획 해석, SARGable·N+1·키셋 페이지네이션 쿼리 리라이팅까지 코드 예시와 함께 정리"
---

# DB 개요 & 데이터 모델링 — 파서·옵티마이저부터 쿼리 리라이팅까지

---

## 1. 파서(Parser)와 옵티마이저(Optimizer)

SQL 쿼리를 입력하면 DB 엔진 내부에서는 다음 단계를 거쳐 실행된다.

```
[SQL 문자열 입력]
        │
   ① Lexer (어휘 분석)
        │  토큰 분리: SELECT, *, FROM, users, WHERE, age, >, 18
        ▼
   ② Parser (구문 분석)
        │  토큰 → Parse Tree (AST) 생성, 문법 오류 감지
        ▼
   ③ Semantic Analyzer (의미 분석)
        │  테이블·컬럼 존재 여부, 권한 확인
        ▼
   ④ Query Rewriter
        │  VIEW 전개, 서브쿼리 변환, 규칙 기반 변환
        ▼
   ⑤ Optimizer (최적화)
        │  통계 정보 기반 실행 계획 생성 (비용 추정)
        │  여러 후보 실행 계획 중 최저 비용 선택
        ▼
   ⑥ Executor (실행)
        │  선택된 실행 계획대로 데이터 접근
        ▼
   [결과 반환]
```

### 옵티마이저의 비용 추정

옵티마이저는 **통계 정보(Statistics)** 를 바탕으로 각 실행 계획의 비용을 추정한다.

| 통계 정보      | 설명                                   |
| -------------- | -------------------------------------- |
| `pg_statistic` | 컬럼별 값 분포, 카디널리티, 히스토그램 |
| `n_distinct`   | 유니크 값의 수                         |
| `correlation`  | 물리 저장 순서와 논리 순서의 상관관계  |

```sql
-- 통계 정보 수동 갱신 (PostgreSQL)
ANALYZE users;

-- 테이블별 통계 확인
SELECT tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE tablename = 'users';
```

### 옵티마이저 힌트 (MySQL)

```sql
-- 특정 인덱스 강제 사용
SELECT /*+ INDEX(orders idx_created_at) */ *
FROM orders
WHERE created_at > '2026-01-01';

-- 풀 테이블 스캔 강제
SELECT /*+ FULL(users) */ * FROM users WHERE age > 18;
```

---

## 2. 데이터 모델링 & ERD

### 2-1. 데이터 모델링 3단계

```
개념적 모델링 (Conceptual)
  → 비즈니스 요구사항을 엔티티·관계로 추상화
  → 결과물: 개념 ERD

논리적 모델링 (Logical)
  → 특정 DBMS에 독립적인 정규화된 스키마 설계
  → 결과물: 테이블·컬럼·PK·FK 정의

물리적 모델링 (Physical)
  → 실제 DBMS에 맞는 DDL 작성, 인덱스·파티션 설계
  → 결과물: CREATE TABLE 스크립트
```

### 2-2. ERD 핵심 표기법 (IE 표기법)

```
엔티티 (Entity)      : 직사각형 □
속성 (Attribute)     : 타원형 또는 컬럼 목록
관계 (Relationship)  : 선 + 카디널리티 기호

카디널리티 표기
  ─────|─────    1 (정확히 1)
  ─────<─────    N (다수)
  ─────|○────    0 또는 1 (선택)
  ─────<○────    0 또는 N (선택)
```

### 2-3. ERD 예시: 금융 거래 시스템

```
┌──────────────┐          ┌──────────────┐
│   customers  │          │   accounts   │
├──────────────┤          ├──────────────┤
│ PK customer_id│─────────│ PK account_id│
│    name      │  1 : N   │ FK customer_id│
│    email     │          │    balance   │
│    created_at│          │    type      │
└──────────────┘          └──────┬───────┘
                                 │ 1
                                 │
                                 │ N
                          ┌──────▼───────┐
                          │ transactions │
                          ├──────────────┤
                          │ PK tx_id     │
                          │ FK account_id │
                          │    amount    │
                          │    type      │
                          │    created_at│
                          └──────────────┘
```

```sql
-- DDL 예시
CREATE TABLE customers (
    customer_id BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE accounts (
    account_id  BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(customer_id),
    balance     NUMERIC(15, 2) NOT NULL DEFAULT 0,
    type        VARCHAR(20) NOT NULL CHECK (type IN ('CHECKING', 'SAVINGS'))
);

CREATE TABLE transactions (
    tx_id       BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(account_id),
    amount      NUMERIC(15, 2) NOT NULL,
    type        VARCHAR(10) NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. 특수 관계: 자기참조와 배타적 관계

### 3-1. 자기참조 (Self-Referencing)

같은 테이블의 행이 자기 자신의 다른 행을 참조하는 구조다. 계층적 데이터(조직도, 카테고리, 댓글 트리)에서 자주 사용된다.

```sql
-- 조직도: 직원이 자신의 상급자를 참조
CREATE TABLE employees (
    employee_id BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    manager_id  BIGINT REFERENCES employees(employee_id)  -- 자기참조
);

-- 데이터 예시
-- employee_id | name    | manager_id
--      1      | CEO     |  NULL      ← 최상위 (manager 없음)
--      2      | CTO     |  1
--      3      | CFO     |  1
--      4      | Dev Lead|  2

-- 계층 조회 (재귀 CTE 활용)
WITH RECURSIVE org_tree AS (
    -- 앵커: 루트 노드 (CEO)
    SELECT employee_id, name, manager_id, 0 AS depth
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- 재귀: 하위 직원 탐색
    SELECT e.employee_id, e.name, e.manager_id, ot.depth + 1
    FROM employees e
    JOIN org_tree ot ON e.manager_id = ot.employee_id
)
SELECT LPAD('  ', depth * 2, ' ') || name AS org_chart, depth
FROM org_tree
ORDER BY depth, employee_id;
```

### 3-2. 배타적 관계 (Exclusive Arc / Exclusive Relationship)

하나의 엔티티가 여러 엔티티 중 **반드시 하나하고만** 관계를 가지는 구조다.

```
예: 결제 수단은 신용카드, 계좌이체, 포인트 중 하나여야 한다.

payments
├── card_id (NULL 가능)     → credit_cards 참조
├── account_id (NULL 가능)  → bank_accounts 참조
└── point_id (NULL 가능)    → point_wallets 참조

제약: card_id, account_id, point_id 중 정확히 하나만 NOT NULL
```

```sql
CREATE TABLE payments (
    payment_id  BIGSERIAL PRIMARY KEY,
    amount      NUMERIC(15, 2) NOT NULL,
    card_id     BIGINT REFERENCES credit_cards(card_id),
    account_id  BIGINT REFERENCES bank_accounts(account_id),
    point_id    BIGINT REFERENCES point_wallets(point_id),

    -- 배타적 관계 강제: 정확히 하나만 NOT NULL
    CONSTRAINT chk_exclusive_payment CHECK (
        (card_id IS NOT NULL)::INT +
        (account_id IS NOT NULL)::INT +
        (point_id IS NOT NULL)::INT = 1
    )
);
```

---

## 4. 정규화 (Normalization)

데이터 중복과 이상현상(삽입·수정·삭제 이상)을 제거하기 위해 테이블을 분해하는 과정이다.

### 정규형 단계별 요약

| 정규형   | 조건                                | 제거하는 문제                  |
| -------- | ----------------------------------- | ------------------------------ |
| **1NF**  | 모든 속성이 원자값 (반복 그룹 제거) | 배열·중첩 값                   |
| **2NF**  | 1NF + 부분 함수 종속 제거           | 복합 PK의 일부에만 종속된 속성 |
| **3NF**  | 2NF + 이행 함수 종속 제거           | PK → A → B 형태의 간접 종속    |
| **BCNF** | 3NF + 모든 결정자가 후보키          | 후보키가 아닌 결정자 제거      |

### 단계별 예시

```
[비정규형]
주문번호 | 고객명 | 상품코드들          | 담당자 | 담당자부서
  1001   | 홍길동 | [P001, P002, P003] | 김철수 | 영업팀

[1NF 적용: 반복 그룹 제거]
주문번호 | 고객명 | 상품코드 | 담당자 | 담당자부서
  1001   | 홍길동 |  P001   | 김철수 | 영업팀
  1001   | 홍길동 |  P002   | 김철수 | 영업팀
  1001   | 홍길동 |  P003   | 김철수 | 영업팀

[2NF 적용: 부분 함수 종속 제거]
→ PK = (주문번호, 상품코드)
→ 고객명, 담당자, 담당자부서는 주문번호에만 종속 (부분 종속)
→ 분리:
  주문(주문번호, 고객명, 담당자, 담당자부서)
  주문상품(주문번호, 상품코드)

[3NF 적용: 이행 함수 종속 제거]
→ 주문번호 → 담당자 → 담당자부서 (이행 종속)
→ 분리:
  주문(주문번호, 고객명, 담당자코드)
  담당자(담당자코드, 담당자명, 담당자부서)
  주문상품(주문번호, 상품코드)
```

---

## 5. JOIN과 서브쿼리

### 5-1. JOIN 종류

```sql
-- INNER JOIN: 양쪽 모두 일치하는 행만
SELECT c.name, a.balance
FROM customers c
INNER JOIN accounts a ON c.customer_id = a.customer_id;

-- LEFT JOIN: 왼쪽 전체 + 오른쪽 일치 (불일치는 NULL)
SELECT c.name, a.balance
FROM customers c
LEFT JOIN accounts a ON c.customer_id = a.customer_id;
-- 계좌가 없는 고객도 조회됨 (balance = NULL)

-- FULL OUTER JOIN: 양쪽 전체 (불일치는 NULL)
SELECT c.name, a.balance
FROM customers c
FULL OUTER JOIN accounts a ON c.customer_id = a.customer_id;

-- CROSS JOIN: 카테시안 곱 (조건 없음)
SELECT c.name, p.product_name
FROM customers c
CROSS JOIN products p;
-- 고객 수 × 상품 수 행 생성

-- SELF JOIN: 같은 테이블끼리 조인 (자기참조 활용)
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.employee_id;
```

### 5-2. 서브쿼리 종류

```sql
-- ① 스칼라 서브쿼리: SELECT 절에서 단일 값 반환
SELECT
    a.account_id,
    a.balance,
    (SELECT AVG(balance) FROM accounts) AS avg_balance,  -- 스칼라
    a.balance - (SELECT AVG(balance) FROM accounts) AS diff_from_avg
FROM accounts a;

-- ② 인라인 뷰: FROM 절의 서브쿼리
SELECT dept, avg_sal
FROM (
    SELECT department AS dept, AVG(salary) AS avg_sal
    FROM employees
    GROUP BY department
) AS dept_stats
WHERE avg_sal > 5000;

-- ③ 중첩 서브쿼리: WHERE 절
-- 잔액이 평균 이상인 계좌 조회
SELECT account_id, balance
FROM accounts
WHERE balance > (SELECT AVG(balance) FROM accounts);

-- ④ EXISTS vs IN 비교
-- EXISTS: 존재 여부만 확인, 조기 종료 → 대용량에 유리
SELECT c.customer_id, c.name
FROM customers c
WHERE EXISTS (
    SELECT 1 FROM accounts a WHERE a.customer_id = c.customer_id
);

-- IN: 전체 결과셋을 메모리에 올림 → 소규모에 적합
SELECT customer_id, name
FROM customers
WHERE customer_id IN (SELECT customer_id FROM accounts);
```

---

## 6. CTE (Common Table Expression)

CTE는 쿼리 내에서 이름을 가진 임시 결과셋을 정의한다. 복잡한 쿼리를 단계적으로 분해해 가독성을 높인다.

```sql
-- 기본 CTE: WITH 절
WITH
high_balance AS (
    SELECT account_id, customer_id, balance
    FROM accounts
    WHERE balance > 1000000
),
customer_info AS (
    SELECT c.customer_id, c.name, c.email
    FROM customers c
    JOIN high_balance hb ON c.customer_id = hb.customer_id
)
SELECT ci.name, ci.email, hb.balance
FROM customer_info ci
JOIN high_balance hb ON ci.customer_id = hb.customer_id
ORDER BY hb.balance DESC;
```

### 재귀 CTE

```sql
-- 1부터 10까지 수열 생성
WITH RECURSIVE numbers AS (
    SELECT 1 AS n          -- 앵커 멤버

    UNION ALL

    SELECT n + 1           -- 재귀 멤버
    FROM numbers
    WHERE n < 10           -- 종료 조건 (반드시 필요)
)
SELECT n FROM numbers;

-- 계층 데이터 탐색 (조직도)
WITH RECURSIVE subordinates AS (
    SELECT employee_id, name, manager_id, 0 AS depth
    FROM employees
    WHERE employee_id = 2  -- CTO부터 시작

    UNION ALL

    SELECT e.employee_id, e.name, e.manager_id, s.depth + 1
    FROM employees e
    JOIN subordinates s ON e.manager_id = s.employee_id
)
SELECT LPAD('  ', depth * 2, ' ') || name AS hierarchy
FROM subordinates;
```

---

## 7. 집계 함수와 윈도우 함수

### 7-1. 집계 함수

```sql
SELECT
    sector,
    COUNT(*)                    AS total_count,
    COUNT(DISTINCT customer_id) AS unique_customers,
    SUM(amount)                 AS total_amount,
    AVG(amount)                 AS avg_amount,
    MIN(amount)                 AS min_amount,
    MAX(amount)                 AS max_amount,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) AS median_amount
FROM transactions
GROUP BY sector
HAVING SUM(amount) > 1000000   -- 집계 후 필터 (WHERE는 집계 전 필터)
ORDER BY total_amount DESC;
```

### 7-2. 윈도우 함수

집계와 달리 행을 그룹화하지 않고 **각 행을 유지하면서** 집계 결과를 함께 보여준다.

```sql
SELECT
    account_id,
    created_at,
    amount,

    -- 누적 합계
    SUM(amount) OVER (
        PARTITION BY account_id
        ORDER BY created_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_total,

    -- 이동 평균 (최근 3건)
    AVG(amount) OVER (
        PARTITION BY account_id
        ORDER BY created_at
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS moving_avg_3,

    -- 순위
    RANK()       OVER (PARTITION BY account_id ORDER BY amount DESC) AS rnk,
    DENSE_RANK() OVER (PARTITION BY account_id ORDER BY amount DESC) AS dense_rnk,
    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY created_at) AS row_num,

    -- 이전/다음 행 값
    LAG(amount, 1, 0)  OVER (PARTITION BY account_id ORDER BY created_at) AS prev_amount,
    LEAD(amount, 1, 0) OVER (PARTITION BY account_id ORDER BY created_at) AS next_amount,

    -- 전체 대비 비율
    ROUND(
        amount / SUM(amount) OVER (PARTITION BY account_id) * 100,
        2
    ) AS pct_of_total

FROM transactions;
```

### 7-3. RANK vs DENSE_RANK vs ROW_NUMBER

| 함수           | 동점 처리                        | 예시 (점수: 90, 90, 80) |
| -------------- | -------------------------------- | ----------------------- |
| `ROW_NUMBER()` | 동점도 다른 번호                 | 1, 2, 3                 |
| `RANK()`       | 동점 같은 번호, 다음 번호 건너뜀 | 1, 1, 3                 |
| `DENSE_RANK()` | 동점 같은 번호, 다음 번호 연속   | 1, 1, 2                 |

---

## 8. 트랜잭션

### 8-1. ACID

| 속성                     | 설명                                              |
| ------------------------ | ------------------------------------------------- |
| **Atomicity** (원자성)   | 트랜잭션 내 모든 작업이 전부 성공하거나 전부 실패 |
| **Consistency** (일관성) | 트랜잭션 전후 DB 무결성 제약 조건 유지            |
| **Isolation** (격리성)   | 동시 트랜잭션이 서로 간섭하지 않음                |
| **Durability** (지속성)  | 커밋된 트랜잭션은 장애 후에도 유지                |

### 8-2. 동시성 이상현상

| 이상현상                | 설명                                                           | 예시                                                                       |
| ----------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Dirty Read**          | 커밋 안 된 데이터를 다른 트랜잭션이 읽음                       | T1이 잔액 수정 중(미커밋), T2가 수정된 잔액 읽음                           |
| **Non-Repeatable Read** | 같은 쿼리를 두 번 실행했더니 결과가 다름                       | T1이 잔액 조회 → T2가 잔액 수정·커밋 → T1이 다시 조회하면 다른 값          |
| **Phantom Read**        | 같은 범위 쿼리를 두 번 실행했더니 행 수가 다름                 | T1이 잔액 > 0 조회 → T2가 새 계좌 삽입·커밋 → T1이 다시 조회하면 행 추가됨 |
| **Lost Update**         | 두 트랜잭션이 같은 행을 동시에 수정해 하나의 수정이 덮어씌워짐 | T1, T2가 동시에 잔액 +1000 → 둘 중 하나의 수정이 유실                      |

### 8-3. 격리 수준 4단계

| 격리 수준            | Dirty Read | Non-Repeatable Read | Phantom Read        | 성능 |
| -------------------- | ---------- | ------------------- | ------------------- | ---- |
| **READ UNCOMMITTED** | 발생       | 발생                | 발생                | 최고 |
| **READ COMMITTED**   | 방지       | 발생                | 발생                | 높음 |
| **REPEATABLE READ**  | 방지       | 방지                | 발생 (MySQL은 방지) | 중간 |
| **SERIALIZABLE**     | 방지       | 방지                | 방지                | 최저 |

```sql
-- 격리 수준 설정 (PostgreSQL)
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- ... 쿼리 실행
COMMIT;

-- 세션 기본값 변경
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

### 8-4. MVCC (Multi-Version Concurrency Control)

MVCC는 데이터의 **여러 버전을 동시에 유지**해 읽기와 쓰기가 서로를 블로킹하지 않도록 하는 메커니즘이다.

```
[MVCC 동작 원리 — PostgreSQL]

각 행에 숨겨진 시스템 컬럼:
  xmin: 이 버전을 생성한 트랜잭션 ID
  xmax: 이 버전을 삭제(또는 수정)한 트랜잭션 ID

UPDATE accounts SET balance = 2000 WHERE account_id = 1;
  → 기존 행(balance=1000)의 xmax에 현재 txid 기록 (논리적 삭제)
  → 새 행(balance=2000)을 xmin=현재 txid로 삽입

동시 SELECT 트랜잭션은 스냅샷 기준으로 자신이 볼 수 있는 버전을 선택
  → LOCK 없이 읽기 가능 (Read는 Write를 블로킹하지 않음)
```

### 8-5. LOCK

```sql
-- 행 단위 잠금
SELECT * FROM accounts
WHERE account_id = 1
FOR UPDATE;               -- 쓰기 잠금 (다른 트랜잭션의 읽기/쓰기 모두 블로킹)

SELECT * FROM accounts
WHERE account_id = 1
FOR SHARE;                -- 읽기 잠금 (다른 트랜잭션의 쓰기만 블로킹)

-- SKIP LOCKED: 잠긴 행 건너뜀 (큐 처리에 유용)
SELECT * FROM job_queue
WHERE status = 'PENDING'
LIMIT 10
FOR UPDATE SKIP LOCKED;
```

### 8-6. 데드락 (Deadlock)

```
[데드락 발생 시나리오]

T1: accounts(id=1) 잠금 → accounts(id=2) 잠금 시도 (대기)
T2: accounts(id=2) 잠금 → accounts(id=1) 잠금 시도 (대기)

T1은 T2를 기다리고, T2는 T1을 기다림 → 무한 대기

[DB의 자동 감지 & 해결]
DB가 대기 그래프에서 사이클을 감지하면
비용이 적은 트랜잭션을 희생(ROLLBACK)해 데드락 해소

[예방 전략]
1. 항상 같은 순서로 리소스를 접근
   (id=1 먼저, id=2 나중 — 모든 트랜잭션 동일하게)
2. 트랜잭션을 짧게 유지
3. SELECT FOR UPDATE 범위 최소화
```

### 8-7. 동시성 제어 전략

```
낙관적 락 (Optimistic Lock)
  → 충돌이 드물다는 가정
  → 버전 컬럼(version)으로 충돌 감지, 충돌 시 재시도

비관적 락 (Pessimistic Lock)
  → 충돌이 빈번하다는 가정
  → SELECT FOR UPDATE로 선점, 다른 트랜잭션 블로킹

금융 시스템 예시:
  계좌 이체 → 비관적 락 (이중 출금 절대 불가)
  게시글 좋아요 → 낙관적 락 (가끔 충돌해도 재시도 가능)
```

---

## 9. 인덱스 & B-Tree / B+Tree

### 9-1. B-Tree vs B+Tree

| 항목             | B-Tree                  | B+Tree                           |
| ---------------- | ----------------------- | -------------------------------- |
| 데이터 저장 위치 | 모든 노드 (내부 + 리프) | 리프 노드에만                    |
| 리프 노드 연결   | 없음                    | 연결 리스트로 연결               |
| 범위 검색        | 트리 전체 탐색 필요     | 리프 리스트 순회로 효율적        |
| 포인터 수        | 적음                    | 많음 (내부 노드에 데이터 없어서) |
| 실제 사용        | 일부 파일시스템         | **RDBMS 인덱스 (사실상 표준)**   |

```
[B+Tree 구조]

       [30 | 60]          ← 내부 노드 (키만 있음, 데이터 없음)
      /     |     \
  [10|20] [40|50] [70|80] ← 리프 노드 (실제 데이터 포인터)
     ↔        ↔       ↔   ← 리프 노드들이 연결 리스트로 연결
                              → 범위 검색 시 순차 탐색 가능
```

### 9-2. 클러스터형 인덱스 vs 비클러스터형 인덱스

| 항목            | 클러스터형 (Clustered)          | 비클러스터형 (Non-Clustered) |
| --------------- | ------------------------------- | ---------------------------- |
| 물리 저장 순서  | 인덱스 순서 = 데이터 저장 순서  | 별도 인덱스 구조             |
| 테이블당 개수   | **1개만 가능**                  | 여러 개 가능                 |
| 범위 검색 속도  | 매우 빠름                       | 상대적으로 느림              |
| 삽입/수정 비용  | 높음 (물리 재배치 발생)         | 낮음                         |
| PostgreSQL 구현 | `CLUSTER` 명령 (재구성 후 고정) | 일반 `CREATE INDEX`          |
| MySQL InnoDB    | PK가 클러스터형 인덱스          | Secondary Index              |

```sql
-- PostgreSQL: 클러스터형 인덱스 설정
CREATE INDEX idx_accounts_balance ON accounts(balance);
CLUSTER accounts USING idx_accounts_balance;
-- 이후 INSERT는 물리 순서 보장 안 됨 → 주기적으로 CLUSTER 재실행 필요

-- 비클러스터형 인덱스 생성
CREATE INDEX idx_tx_created_at  ON transactions(created_at);
CREATE INDEX idx_tx_account     ON transactions(account_id);

-- 복합 인덱스 (선두 컬럼 원칙: account_id로만 검색해도 사용 가능)
CREATE INDEX idx_tx_account_date ON transactions(account_id, created_at);

-- 커버링 인덱스: SELECT 컬럼까지 인덱스에 포함 → 테이블 접근 불필요
CREATE INDEX idx_tx_covering ON transactions(account_id, created_at)
    INCLUDE (amount, type);
```

---

## 10. 실행계획 진단: EXPLAIN & EXPLAIN ANALYZE

### 10-1. 기본 사용법

```sql
-- 실행 계획만 확인 (쿼리 미실행)
EXPLAIN
SELECT * FROM transactions WHERE account_id = 1;

-- 실제 실행 후 실측값 포함
EXPLAIN ANALYZE
SELECT * FROM transactions WHERE account_id = 1;

-- 버퍼(캐시) 사용 현황 포함
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT t.*, a.balance
FROM transactions t
JOIN accounts a ON t.account_id = a.account_id
WHERE t.created_at > NOW() - INTERVAL '7 days';
```

### 10-2. 실행 계획 트리 읽는 법

```
-- EXPLAIN 출력 예시
Gather  (cost=1000.00..5000.00 rows=1000 width=64)
                                 ↑           ↑
                              예상 행 수   행당 바이트
        (actual time=10.5..150.2 rows=980 loops=1)
                                  ↑
                               실제 행 수

  → Hash Join  (cost=500.00..3000.00 rows=1000 width=64)
              Hash Cond: (t.account_id = a.account_id)
       → Seq Scan on transactions t
           Filter: (created_at > (now() - '7 days'::interval))
           Rows Removed by Filter: 9020
       → Hash
           → Index Scan using accounts_pkey on accounts a
```

**트리 읽는 순서: 가장 안쪽(들여쓰기 깊은 곳)부터 위로**

### 10-3. 비용 모델 해석

```
cost=시작비용..총비용

시작비용: 첫 번째 행을 반환하기까지의 비용
총비용:   마지막 행을 반환하기까지의 총비용

단위: 디스크 페이지 읽기 1회 = 1.0 (기준값)
seq_page_cost    = 1.0  (순차 읽기)
random_page_cost = 4.0  (랜덤 읽기, SSD면 1.1~1.5로 낮춤)
cpu_tuple_cost   = 0.01 (행 처리)
cpu_operator_cost= 0.0025 (연산자 처리)
```

```sql
-- SSD 환경 최적화 설정
SET random_page_cost = 1.1;
SET effective_cache_size = '4GB';  -- OS 파일 캐시 크기 힌트
```

### 10-4. 스캔 방식 비교

| 스캔 종류             | 동작                             | 사용 시점                         |
| --------------------- | -------------------------------- | --------------------------------- |
| **Seq Scan**          | 테이블 전체 순차 읽기            | 선택률 높을 때 (전체의 20%+ 반환) |
| **Index Scan**        | 인덱스 → 힙(테이블) 랜덤 접근    | 선택률 낮을 때 (소수 행 반환)     |
| **Index-Only Scan**   | 인덱스만 읽음 (테이블 접근 없음) | 커버링 인덱스일 때                |
| **Bitmap Index Scan** | 인덱스로 비트맵 생성 → 힙 접근   | 중간 선택률, OR 조건              |

### 10-5. BUFFERS 해석

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM transactions WHERE account_id = 1;

-- 출력 예시
Buffers: shared hit=5 read=120
--              ↑          ↑
--         캐시 히트    디스크에서 읽음

-- shared hit이 많을수록 좋음 (메모리에서 처리)
-- read가 많으면 → 캐시 미스 → 성능 저하 신호
```

---

## 11. 쿼리 리라이팅

### 11-1. SARGable (Search ARGument ABLE)

인덱스를 효과적으로 사용할 수 있는 형태의 조건식을 **SARGable**이라고 한다.  
컬럼에 함수나 연산을 적용하면 인덱스를 탈 수 없게 된다.

```sql
-- ❌ Non-SARGable: 컬럼에 함수 적용 → 인덱스 무효화 (Seq Scan 발생)
WHERE YEAR(created_at) = 2026
WHERE UPPER(email) = 'USER@EXAMPLE.COM'
WHERE amount + 100 > 5000
WHERE SUBSTR(account_no, 1, 3) = '110'

-- ✅ SARGable: 컬럼을 그대로, 상수를 가공
WHERE created_at >= '2026-01-01' AND created_at < '2027-01-01'
WHERE email = LOWER('USER@EXAMPLE.COM')
WHERE amount > 4900
WHERE account_no LIKE '110%'

-- ❌ OR 조건도 인덱스 무효화 가능 → UNION으로 분리
WHERE status = 'ACTIVE' OR status = 'PENDING'

-- ✅ IN으로 대체 또는 UNION ALL
WHERE status IN ('ACTIVE', 'PENDING')
```

### 11-2. N+1 문제

ORM에서 연관 데이터를 조회할 때 발생하는 대표적인 성능 문제다.

```
[N+1 문제 발생 시나리오]
1. 계좌 목록 조회: SELECT * FROM accounts  → 쿼리 1번
2. 각 계좌의 고객 조회:
   SELECT * FROM customers WHERE customer_id = 1  → 쿼리 N번
   SELECT * FROM customers WHERE customer_id = 2
   ...
총 쿼리 수: 1 + N

[해결 1: JOIN으로 한 번에 조회]
SELECT a.*, c.name, c.email
FROM accounts a
JOIN customers c ON a.customer_id = c.customer_id;

[해결 2: IN 절로 배치 조회]
-- 1. 계좌 목록 조회
SELECT * FROM accounts;
-- 2. 고객 ID 목록으로 한 번에 조회
SELECT * FROM customers
WHERE customer_id IN (1, 2, 3, ...);
```

### 11-3. 페이지네이션: OFFSET vs 키셋(Keyset)

```sql
-- ❌ OFFSET 방식: 페이지가 깊어질수록 느려짐
-- 100만 번째 페이지: 100만 건을 읽고 버림
SELECT * FROM transactions
ORDER BY created_at DESC
LIMIT 20 OFFSET 1000000;  -- 1,000,000건 스캔 후 20건 반환

-- ✅ 키셋(Cursor) 페이지네이션: 항상 O(log N)
-- 이전 페이지의 마지막 행 값을 커서로 사용
SELECT * FROM transactions
WHERE created_at < '2026-06-01 12:00:00'  -- 마지막으로 본 값
   OR (created_at = '2026-06-01 12:00:00' AND tx_id < 99999)
ORDER BY created_at DESC, tx_id DESC
LIMIT 20;
```

| 방식             | 장점                                     | 단점                                     |
| ---------------- | ---------------------------------------- | ---------------------------------------- |
| **OFFSET**       | 구현 간단, 임의 페이지 이동 가능         | 깊은 페이지에서 O(N) 성능 저하           |
| **키셋(Cursor)** | 항상 O(log N), 데이터 삽입/삭제에 안정적 | 임의 페이지 이동 불가, 복합 키 처리 복잡 |

> 금융 거래 내역 조회처럼 **대용량 + 무한 스크롤** 구조에는 키셋 페이지네이션이 필수다.

### 11-4. 파티셔닝

대용량 테이블을 논리적으로 분할해 쿼리 성능과 관리 효율을 높이는 기법이다.

```sql
-- 범위 파티셔닝: 날짜 기준 월별 분할
CREATE TABLE transactions (
    tx_id      BIGSERIAL,
    account_id BIGINT,
    amount     NUMERIC(15, 2),
    created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

-- 파티션 테이블 생성
CREATE TABLE transactions_2026_01
    PARTITION OF transactions
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE transactions_2026_02
    PARTITION OF transactions
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 파티션 프루닝: WHERE 조건이 파티션 키와 일치하면
-- 해당 파티션만 스캔 (나머지 파티션은 읽지 않음)
SELECT * FROM transactions
WHERE created_at BETWEEN '2026-01-01' AND '2026-01-31';
-- → transactions_2026_01 파티션만 스캔
```

```
파티셔닝 전략 선택 기준

범위 파티셔닝 (RANGE)  : 날짜·ID 범위 기반 검색이 많을 때
해시 파티셔닝 (HASH)   : 균등 분산이 목적일 때 (특정 컬럼 쏠림 방지)
목록 파티셔닝 (LIST)   : 지역·상태 등 카테고리 기반 분리할 때
```

---

## 12. 핵심 요약

| 주제                | 핵심 포인트                                                |
| ------------------- | ---------------------------------------------------------- |
| **파서·옵티마이저** | SQL → 토큰 → AST → 실행계획 선택, 통계 정보가 핵심         |
| **정규화**          | 1NF(원자값) → 2NF(부분 종속 제거) → 3NF(이행 종속 제거)    |
| **트랜잭션 격리**   | READ COMMITTED가 실무 기본값, MVCC로 읽기-쓰기 블로킹 방지 |
| **인덱스**          | B+Tree, 클러스터형은 테이블당 1개, 선두 컬럼 원칙          |
| **EXPLAIN**         | 안쪽 노드부터 읽기, cost·actual time·Buffers 비교          |
| **쿼리 최적화**     | SARGable 조건 유지, N+1 JOIN으로 해결, 깊은 페이지는 키셋  |

---

## 📎 참고 자료

- [PostgreSQL 공식 문서 — Query Planning](https://www.postgresql.org/docs/current/query-plan-statistics.html)
- [PostgreSQL 공식 문서 — EXPLAIN](https://www.postgresql.org/docs/current/sql-explain.html)
- [Use The Index Luke](https://use-the-index-luke.com/) — 인덱스 완벽 가이드
- [PostgreSQL MVCC 공식 문서](https://www.postgresql.org/docs/current/mvcc.html)
