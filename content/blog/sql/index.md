---
title: "SQL 코딩테스트 대비"
date: "2025-09-25"
category: ["Database"]
description: "CASE WHEN, LEAST/GREATEST, IFNULL/COALESCE, DATE 함수, 윈도우 함수, 서브쿼리, 정규표현식 등 SQL 코딩테스트에서 자주 등장하지만 헷갈리는 특수 문법을 예제 중심으로 정리"
---

SELECT, WHERE, JOIN 같은 기본 문법은 알고 있는데, 막상 코딩테스트에서 `CASE WHEN`이나 `DATEDIFF`, `RANK()` 같은 문법을 마주치면 기억이 안 나서 막히는 경우가 많습니다. 이 글에서는 **기본 문법은 알지만 코딩테스트에서 자주 막히는 특수 문법**만 골라서 정리합니다.

---

## 1. CASE WHEN — 조건별 값 분기

프로그래밍의 `if-else`와 같습니다. 조건에 따라 다른 값을 출력하거나, 조건부 집계에 사용합니다.

### 기본 형태

```sql
-- 형태 1: 값 비교 (동등 비교)
SELECT
    name,
    CASE grade
        WHEN 'A' THEN '우수'
        WHEN 'B' THEN '보통'
        WHEN 'C' THEN '미흡'
        ELSE '해당없음'
    END AS grade_name
FROM students;

-- 형태 2: 조건식 (범위, 복합 조건 가능)
SELECT
    name,
    score,
    CASE
        WHEN score >= 90 THEN 'A'
        WHEN score >= 80 THEN 'B'
        WHEN score >= 70 THEN 'C'
        ELSE 'F'
    END AS grade
FROM students;
```

### 조건부 집계 — 코딩테스트 단골

```sql
-- 성별별 인원수를 하나의 행으로 피벗
SELECT
    COUNT(CASE WHEN gender = 'M' THEN 1 END) AS male_count,
    COUNT(CASE WHEN gender = 'F' THEN 1 END) AS female_count,
    SUM(CASE WHEN gender = 'M' THEN salary ELSE 0 END) AS male_salary_sum
FROM employees;

-- 동물 종류별 입양 건수
SELECT
    animal_type,
    COUNT(CASE WHEN outcome_type = 'Adoption' THEN 1 END) AS adoption,
    COUNT(CASE WHEN outcome_type = 'Return'   THEN 1 END) AS return_cnt
FROM animal_outs
GROUP BY animal_type;
```

### ORDER BY에서 사용

```sql
-- 특정 값을 맨 앞으로 정렬
SELECT name, animal_type
FROM animals
ORDER BY
    CASE WHEN animal_type = 'Dog' THEN 0 ELSE 1 END,
    name;
```

---

## 2. IFNULL / NULLIF / COALESCE — NULL 처리

NULL을 다루는 세 함수입니다. 코딩테스트에서 NULL 처리를 빠뜨리면 결과가 달라지므로 항상 주의해야 합니다.

### IFNULL — NULL이면 다른 값으로

```sql
-- 기본 형태: IFNULL(값, NULL일_때_대체값)
SELECT
    name,
    IFNULL(nickname, '이름없음') AS nickname,
    IFNULL(phone, 'N/A') AS phone
FROM users;

-- 집계 함수와 함께
SELECT
    animal_id,
    IFNULL(name, 'No name') AS name
FROM animals
ORDER BY animal_id;
```

### NULLIF — 두 값이 같으면 NULL 반환

```sql
-- NULLIF(a, b): a = b이면 NULL, 다르면 a 반환
-- 주로 0으로 나누기 방지에 사용
SELECT
    total_sales / NULLIF(visit_count, 0) AS avg_sales_per_visit
FROM stores;
-- visit_count가 0이면 NULL 반환 (0으로 나누기 에러 방지)
```

### COALESCE — 여러 값 중 첫 번째 non-NULL

```sql
-- COALESCE(값1, 값2, 값3, ...): 왼쪽부터 처음으로 NULL이 아닌 값 반환
SELECT
    name,
    COALESCE(mobile, phone, email, '연락처없음') AS contact
FROM users;
-- mobile이 NULL이면 phone, phone도 NULL이면 email, 모두 NULL이면 '연락처없음'
```

---

## 3. LEAST / GREATEST — 여러 값 중 최소/최대

Python의 `min()` / `max()`와 같지만 **같은 행의 여러 컬럼** 사이에서 사용합니다.

```sql
-- LEAST(값1, 값2, ...): 가장 작은 값 반환
-- GREATEST(값1, 값2, ...): 가장 큰 값 반환

SELECT
    name,
    math, english, science,
    LEAST(math, english, science)    AS min_score,
    GREATEST(math, english, science) AS max_score
FROM scores;

-- 날짜에도 사용 가능
SELECT
    LEAST(start_date, end_date)    AS earlier_date,
    GREATEST(start_date, end_date) AS later_date
FROM projects;

-- NULL 주의: 하나라도 NULL이면 결과도 NULL
-- → IFNULL과 함께 사용
SELECT LEAST(IFNULL(a, 999), IFNULL(b, 999)) AS min_val FROM t;
```

---

## 4. 날짜/시간 함수

날짜 연산은 코딩테스트에서 매우 자주 등장합니다.

### 현재 날짜/시간

```sql
NOW()           -- 현재 날짜 + 시간  (2024-07-25 14:30:00)
CURDATE()       -- 현재 날짜만       (2024-07-25)
CURTIME()       -- 현재 시간만       (14:30:00)
SYSDATE()       -- 실행 시점 날짜+시간 (NOW()와 미세한 차이)
```

### 날짜 차이 계산

```sql
-- DATEDIFF(날짜1, 날짜2): 날짜1 - 날짜2 (일 수 차이)
SELECT
    DATEDIFF('2024-12-31', '2024-01-01') AS days;  -- 365

-- 대여 기간 계산 (코딩테스트 단골)
SELECT
    car_id,
    DATEDIFF(end_date, start_date) + 1 AS rental_days
FROM car_rental_history;

-- TIMESTAMPDIFF(단위, 시작, 끝)
SELECT TIMESTAMPDIFF(MONTH, '2024-01-15', '2024-07-25') AS months;  -- 6
SELECT TIMESTAMPDIFF(YEAR,  '2000-05-01', '2024-07-25') AS years;   -- 24
SELECT TIMESTAMPDIFF(HOUR,  '2024-07-25 09:00', '2024-07-25 14:30') AS hours; -- 5
```

### 날짜 더하기/빼기

```sql
-- DATE_ADD(날짜, INTERVAL n 단위)
-- DATE_SUB(날짜, INTERVAL n 단위)
SELECT
    DATE_ADD('2024-07-25', INTERVAL 30 DAY)   AS after_30days,   -- 2024-08-24
    DATE_ADD('2024-07-25', INTERVAL 3 MONTH)  AS after_3months,  -- 2024-10-25
    DATE_SUB('2024-07-25', INTERVAL 1 YEAR)   AS last_year;      -- 2023-07-25

-- 가입일로부터 1년이 지난 사용자
SELECT name, join_date
FROM users
WHERE join_date <= DATE_SUB(CURDATE(), INTERVAL 1 YEAR);
```

### 날짜 형식 변환

```sql
-- DATE_FORMAT(날짜, 형식)
SELECT
    DATE_FORMAT(NOW(), '%Y-%m-%d')          -- 2024-07-25
    DATE_FORMAT(NOW(), '%Y년 %m월 %d일')    -- 2024년 07월 25일
    DATE_FORMAT(NOW(), '%Y%m')              -- 202407

-- 자주 쓰는 형식 코드
-- %Y: 4자리 연도    %y: 2자리 연도
-- %m: 2자리 월      %d: 2자리 일
-- %H: 24시간 시     %i: 분       %s: 초
-- %M: 월 이름(July) %W: 요일(Thursday)
```

### 날짜 구성 요소 추출

```sql
SELECT
    YEAR('2024-07-25')   AS year,    -- 2024
    MONTH('2024-07-25')  AS month,   -- 7
    DAY('2024-07-25')    AS day,     -- 25
    HOUR('14:30:00')     AS hour,    -- 14
    MINUTE('14:30:00')   AS minute,  -- 30
    DAYOFWEEK('2024-07-25') AS dow;  -- 5 (1=일요일, 2=월요일 ... 7=토요일)

-- 월별 집계 (코딩테스트 단골)
SELECT
    DATE_FORMAT(rental_date, '%Y-%m') AS month,
    COUNT(*) AS rental_count
FROM rentals
GROUP BY DATE_FORMAT(rental_date, '%Y-%m')
ORDER BY month;
```

---

## 5. 문자열 함수

### 자르기 / 추출

```sql
-- SUBSTRING(문자열, 시작위치, 길이)  — 1부터 시작
SELECT SUBSTRING('Hello World', 1, 5);  -- 'Hello'
SELECT SUBSTRING('Hello World', 7);     -- 'World' (끝까지)

-- LEFT(문자열, n): 왼쪽에서 n글자
-- RIGHT(문자열, n): 오른쪽에서 n글자
SELECT LEFT('Hello', 3);   -- 'Hel'
SELECT RIGHT('Hello', 3);  -- 'llo'

-- 전화번호 뒷 4자리 마스킹
SELECT
    name,
    CONCAT(LEFT(phone, LENGTH(phone)-4), '****') AS masked_phone
FROM users;
```

### 길이

```sql
LENGTH('Hello')    -- 5 (바이트 수 — 한글은 3바이트)
CHAR_LENGTH('안녕') -- 2 (글자 수)
```

### 합치기 / 나누기

```sql
-- CONCAT(문자열1, 문자열2, ...)
SELECT CONCAT(first_name, ' ', last_name) AS full_name FROM users;

-- CONCAT_WS(구분자, 값1, 값2, ...): NULL 자동 무시
SELECT CONCAT_WS(', ', city, state, country) AS address FROM locations;
-- city가 NULL이면 자동으로 건너뜀

-- GROUP_CONCAT: 여러 행의 값을 하나로 합치기
SELECT
    user_id,
    GROUP_CONCAT(tag ORDER BY tag SEPARATOR ', ') AS tags
FROM user_tags
GROUP BY user_id;
-- user_id=1: 'backend, java, spring'
```

### 변환

```sql
UPPER('hello')     -- 'HELLO'
LOWER('HELLO')     -- 'hello'
TRIM('  hello  ')  -- 'hello'    (앞뒤 공백 제거)
LTRIM('  hello')   -- 'hello'    (왼쪽 공백)
RTRIM('hello  ')   -- 'hello'    (오른쪽 공백)
REPLACE('Hello World', 'World', 'SQL')  -- 'Hello SQL'

-- LPAD / RPAD: 특정 길이가 될 때까지 문자 채우기
LPAD('7', 3, '0')   -- '007'  (왼쪽에 0 채움)
RPAD('7', 3, '0')   -- '700'  (오른쪽에 0 채움)
```

---

## 6. 숫자 함수

```sql
-- 반올림 / 버림 / 올림
ROUND(3.567, 2)    -- 3.57   (소수 2째 자리 반올림)
ROUND(3.567, 0)    -- 4      (정수로 반올림)
ROUND(345, -2)     -- 300    (백의 자리 반올림)

TRUNCATE(3.567, 2) -- 3.56   (소수 2째 자리에서 버림)
FLOOR(3.9)         -- 3      (내림)
CEIL(3.1)          -- 4      (올림)

-- 절댓값 / 나머지
ABS(-5)            -- 5
MOD(10, 3)         -- 1      (10 % 3)
10 % 3             -- 1      (같음)

-- 제곱 / 제곱근
POWER(2, 10)       -- 1024
SQRT(16)           -- 4.0
```

---

## 7. 윈도우 함수 (Window Functions)

GROUP BY 없이 각 행의 값을 유지하면서 집계/순위를 계산할 수 있는 함수입니다. 프로그래머스 고난이도 문제에서 자주 등장합니다.

### 기본 형태

```sql
함수명() OVER (
    PARTITION BY 그룹컬럼    -- (선택) 그룹 기준
    ORDER BY 정렬컬럼        -- (선택) 정렬 기준
)
```

### 순위 함수

```sql
SELECT
    name,
    salary,
    RANK()       OVER (ORDER BY salary DESC) AS rank_,
    DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rank_,
    ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num
FROM employees;

-- RANK()       : 동점자에게 같은 순위, 다음 순위는 건너뜀 (1,1,3)
-- DENSE_RANK() : 동점자에게 같은 순위, 다음 순위는 이어짐 (1,1,2)
-- ROW_NUMBER() : 동점 무관, 항상 고유한 순번 (1,2,3)

-- 부서별 연봉 순위
SELECT
    name,
    dept,
    salary,
    RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS dept_rank
FROM employees;
```

### LAG / LEAD — 이전/다음 행 참조

```sql
-- LAG(컬럼, n): n번째 이전 행의 값
-- LEAD(컬럼, n): n번째 다음 행의 값
SELECT
    date,
    sales,
    LAG(sales, 1) OVER (ORDER BY date)  AS prev_sales,
    LEAD(sales, 1) OVER (ORDER BY date) AS next_sales,
    sales - LAG(sales, 1) OVER (ORDER BY date) AS sales_diff
FROM daily_sales;
-- 전일 대비 매출 변화 계산
```

### SUM / AVG 누적 집계

```sql
-- 누적 합계
SELECT
    date,
    sales,
    SUM(sales) OVER (ORDER BY date) AS cumulative_sales
FROM daily_sales;

-- 그룹 내 누적 합계
SELECT
    dept,
    name,
    salary,
    SUM(salary) OVER (PARTITION BY dept ORDER BY salary) AS cumulative_salary
FROM employees;

-- 이동 평균 (최근 3일)
SELECT
    date,
    sales,
    AVG(sales) OVER (
        ORDER BY date
        ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
    ) AS moving_avg_3d
FROM daily_sales;
```

### FIRST_VALUE / LAST_VALUE / NTH_VALUE

```sql
-- 그룹 내 첫 번째 / 마지막 값
SELECT
    dept,
    name,
    salary,
    FIRST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary DESC) AS top_earner,
    LAST_VALUE(name)  OVER (PARTITION BY dept ORDER BY salary DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS lowest_earner
FROM employees;
```

---

## 8. 서브쿼리 패턴

### 스칼라 서브쿼리 — SELECT 절에서

```sql
-- 각 직원의 부서 평균 연봉을 함께 조회
SELECT
    e.name,
    e.salary,
    (SELECT AVG(salary) FROM employees WHERE dept = e.dept) AS dept_avg,
    e.salary - (SELECT AVG(salary) FROM employees WHERE dept = e.dept) AS diff
FROM employees e;
```

### 인라인 뷰 — FROM 절에서

```sql
-- 부서별 최고 연봉자 조회
SELECT e.name, e.dept, e.salary
FROM employees e
JOIN (
    SELECT dept, MAX(salary) AS max_sal
    FROM employees
    GROUP BY dept
) AS dept_max ON e.dept = dept_max.dept AND e.salary = dept_max.max_sal;
```

### WHERE 절 서브쿼리

```sql
-- 평균 이상 연봉자
SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees);

-- IN: 목록 안에 있는 경우
SELECT name FROM students
WHERE id IN (SELECT student_id FROM honor_roll);

-- EXISTS: 존재 여부만 확인 (IN보다 빠른 경우 많음)
SELECT name FROM students s
WHERE EXISTS (
    SELECT 1 FROM honor_roll h WHERE h.student_id = s.id
);

-- NOT EXISTS
SELECT name FROM students s
WHERE NOT EXISTS (
    SELECT 1 FROM absence a WHERE a.student_id = s.id
);
```

---

## 9. WITH (CTE — Common Table Expression)

복잡한 서브쿼리를 이름을 붙여 재사용할 수 있습니다. 가독성이 크게 올라갑니다.

```sql
-- 기본 형태
WITH cte_name AS (
    SELECT ...
    FROM ...
)
SELECT * FROM cte_name;

-- 여러 CTE
WITH
rental_summary AS (
    SELECT car_id, COUNT(*) AS rental_count
    FROM car_rental_history
    GROUP BY car_id
),
long_rentals AS (
    SELECT car_id, rental_count
    FROM rental_summary
    WHERE rental_count >= 5
)
SELECT c.car_type, lr.car_id, lr.rental_count
FROM long_rentals lr
JOIN cars c ON lr.car_id = c.car_id
ORDER BY lr.rental_count DESC;
```

### 재귀 CTE — 계층 구조 탐색

```sql
-- 조직도 계층 구조 (상위 → 하위 탐색)
WITH RECURSIVE org_tree AS (
    -- 기저 케이스: 최상위 직원
    SELECT id, name, manager_id, 1 AS depth
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- 재귀: 하위 직원 찾기
    SELECT e.id, e.name, e.manager_id, ot.depth + 1
    FROM employees e
    JOIN org_tree ot ON e.manager_id = ot.id
)
SELECT * FROM org_tree ORDER BY depth, name;
```

---

## 10. HAVING vs WHERE

```sql
-- WHERE: 집계 전 행 필터링 (개별 행 조건)
-- HAVING: 집계 후 그룹 필터링 (GROUP BY 결과 조건)

-- ❌ 집계 함수는 WHERE에 못 씀
SELECT dept, AVG(salary)
FROM employees
WHERE AVG(salary) > 5000  -- 에러!
GROUP BY dept;

-- ✅ 집계 함수 조건은 HAVING
SELECT dept, AVG(salary) AS avg_sal
FROM employees
GROUP BY dept
HAVING AVG(salary) > 5000;

-- WHERE와 HAVING 함께 사용
SELECT dept, COUNT(*) AS cnt, AVG(salary) AS avg_sal
FROM employees
WHERE hire_date >= '2020-01-01'   -- 먼저 2020년 이후 입사자만 필터
GROUP BY dept
HAVING COUNT(*) >= 3;              -- 그 중 3명 이상인 부서만
```

---

## 11. LIKE와 정규표현식

### LIKE — 패턴 매칭

```sql
-- %: 0개 이상의 임의 문자
-- _: 정확히 1개의 임의 문자

WHERE name LIKE '김%'     -- '김'으로 시작
WHERE name LIKE '%수'     -- '수'로 끝남
WHERE name LIKE '%길동%'  -- '길동' 포함
WHERE phone LIKE '010-____-____'  -- 010-xxxx-xxxx 형식
WHERE name NOT LIKE '%테스트%'    -- '테스트' 미포함
```

### REGEXP — 정규표현식

```sql
-- MySQL 정규표현식
WHERE email REGEXP '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

-- 자주 쓰는 패턴
WHERE name REGEXP '^[가-힣]+'      -- 한글로만 구성
WHERE phone REGEXP '^010-[0-9]{4}' -- 010으로 시작하는 번호
WHERE code REGEXP '[0-9]{3}'       -- 숫자 3자리 포함
```

---

## 12. JOIN 심화

### SELF JOIN — 같은 테이블끼리

```sql
-- 각 직원과 그 상사의 이름 조회
SELECT
    e.name AS employee,
    m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;
```

### 다중 조건 JOIN

```sql
SELECT *
FROM orders o
JOIN products p ON o.product_id = p.id AND o.order_date >= p.launch_date
```

### CROSS JOIN — 모든 조합

```sql
-- 모든 사이즈 × 모든 색상 조합 생성
SELECT s.size_name, c.color_name
FROM sizes s
CROSS JOIN colors c;
```

---

## 13. 집합 연산자

```sql
-- UNION: 합집합 (중복 제거)
SELECT name FROM employees
UNION
SELECT name FROM contractors;

-- UNION ALL: 합집합 (중복 포함, 더 빠름)
SELECT name FROM employees
UNION ALL
SELECT name FROM contractors;

-- INTERSECT: 교집합 (MySQL 지원 안 함 → IN으로 대체)
SELECT name FROM employees
WHERE name IN (SELECT name FROM contractors);

-- EXCEPT / MINUS: 차집합 (MySQL 지원 안 함 → NOT IN 또는 LEFT JOIN으로 대체)
SELECT name FROM employees
WHERE name NOT IN (SELECT name FROM contractors);

-- LEFT JOIN으로 차집합
SELECT e.name
FROM employees e
LEFT JOIN contractors c ON e.name = c.name
WHERE c.name IS NULL;
```

---

## 14. 조건부 집계 패턴 — 코딩테스트 단골

```sql
-- 1. 특정 조건의 비율 계산
SELECT
    dept,
    COUNT(*) AS total,
    SUM(CASE WHEN gender = 'F' THEN 1 ELSE 0 END) AS female_cnt,
    ROUND(SUM(CASE WHEN gender = 'F' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS female_pct
FROM employees
GROUP BY dept;

-- 2. 특정 조건 충족 여부로 레이블링
SELECT
    user_id,
    COUNT(*) AS order_count,
    CASE WHEN COUNT(*) >= 10 THEN 'VIP' ELSE 'NORMAL' END AS user_type
FROM orders
GROUP BY user_id;

-- 3. 조건부 MAX/MIN
SELECT
    dept,
    MAX(CASE WHEN gender = 'M' THEN salary END) AS max_male_salary,
    MAX(CASE WHEN gender = 'F' THEN salary END) AS max_female_salary
FROM employees
GROUP BY dept;
```

---

## 15. 자주 나오는 실수 & 주의사항

**1. GROUP BY에 없는 컬럼을 SELECT에 사용**

```sql
-- ❌ dept로 묶었는데 name은 어떤 값인지 불확실
SELECT dept, name, AVG(salary)
FROM employees
GROUP BY dept;

-- ✅ 집계 함수로 감싸거나 GROUP BY에 포함
SELECT dept, MAX(name), AVG(salary)
FROM employees
GROUP BY dept;
```

**2. NULL과의 비교는 `=`가 아닌 `IS NULL`**

```sql
-- ❌ NULL = NULL → false (비교 불가)
WHERE column = NULL

-- ✅
WHERE column IS NULL
WHERE column IS NOT NULL
```

**3. HAVING과 WHERE 혼동**

```sql
-- ❌ 집계 함수를 WHERE에 사용
WHERE COUNT(*) > 5

-- ✅ HAVING 사용
HAVING COUNT(*) > 5
```

**4. DISTINCT 위치**

```sql
-- ✅ 올바른 사용
SELECT DISTINCT dept FROM employees;
SELECT COUNT(DISTINCT dept) FROM employees;

-- ❌ 이렇게는 안 됨
SELECT DISTINCT(dept), name FROM employees;  -- DISTINCT는 뒤에 오는 모든 컬럼에 적용
```

**5. DATE 비교 시 형식 주의**

```sql
-- 날짜 컬럼이 DATETIME인데 DATE로 비교하면 시간 00:00:00 기준
WHERE created_at = '2024-07-25'  -- 2024-07-25 00:00:00 만 해당

-- ✅ 범위로 비교 또는 DATE() 함수 사용
WHERE DATE(created_at) = '2024-07-25'
WHERE created_at >= '2024-07-25' AND created_at < '2024-07-26'
```

---

## 빠른 참고 — 함수 치트시트

```
NULL 처리
  IFNULL(a, b)           a가 NULL이면 b
  NULLIF(a, b)           a=b이면 NULL
  COALESCE(a,b,c,...)    첫 번째 non-NULL

비교
  LEAST(a, b, c)         같은 행의 여러 컬럼 중 최솟값
  GREATEST(a, b, c)      같은 행의 여러 컬럼 중 최댓값
  BETWEEN a AND b        a 이상 b 이하

날짜
  DATEDIFF(d1, d2)       날짜 차이 (일)
  DATE_ADD(d, INTERVAL n UNIT)  날짜 더하기
  DATE_FORMAT(d, fmt)    날짜 포맷 변환
  YEAR/MONTH/DAY(d)      연/월/일 추출
  TIMESTAMPDIFF(U,d1,d2) 날짜 차이 (단위 지정)

문자열
  CONCAT(a, b)           문자열 이어붙이기
  CONCAT_WS(sep, a, b)   구분자로 이어붙이기
  SUBSTRING(s, pos, len) 부분 문자열
  LEFT/RIGHT(s, n)       왼쪽/오른쪽 n글자
  LENGTH(s)              바이트 수
  CHAR_LENGTH(s)         글자 수
  REPLACE(s, from, to)   치환
  LPAD/RPAD(s, n, pad)   패딩
  GROUP_CONCAT(col)      여러 행 값을 하나로 합치기

숫자
  ROUND(n, d)            반올림
  TRUNCATE(n, d)         버림
  FLOOR(n)               내림
  CEIL(n)                올림
  ABS(n)                 절댓값
  MOD(n, m)              나머지

윈도우 함수
  RANK()                 순위 (동점 시 건너뜀)
  DENSE_RANK()           순위 (동점 시 이어짐)
  ROW_NUMBER()           고유 순번
  LAG(col, n)            n번째 이전 행 값
  LEAD(col, n)           n번째 다음 행 값
  SUM() OVER (...)       누적 합계
```

---

## 참고 자료

- [프로그래머스 SQL 고득점 Kit](https://school.programmers.co.kr/learn/challenges?tab=sql_practice_kit)
- [MySQL 공식 문서 — 함수 레퍼런스](https://dev.mysql.com/doc/refman/8.0/en/functions.html)
- [LeetCode Database 문제](https://leetcode.com/problemset/database/)
