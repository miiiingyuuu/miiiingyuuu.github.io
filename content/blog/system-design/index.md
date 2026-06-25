---
title: "[스터디] 시스템 디자인"
date: "2026-06-24"
category: ["Architecture", "Backend"]
description: "커뮤니티 앱의 키워드 알림 기능을 대규모 트래픽에서도 안정적으로 동작하도록 설계하는 방법을 정리. 단순해 보이는 기능이 왜 어려운지, Transaction Outbox로 이벤트 유실을 방지하는 방법, Aho-Corasick 알고리즘으로 키워드 매칭을 최적화하는 방법, 중복 알림 방지를 위한 멱등성 키(Idempotency Key) 설계, DLQ 기반 장애 처리 흐름까지 상세하게 정리"
---

# 시스템 디자인 — 커뮤니티 앱 키워드 알림 시스템 설계

> 참고: [How to design a keyword alarm on a community app (Medium)](https://medium.com/@junghn6768/how-to-design-a-keyword-alarm-on-a-community-app-e5d5f675b12a)

---

## 1. 왜 이 기능이 어려운가?

커뮤니티 앱의 키워드 알림 기능은 얼핏 단순해 보인다.

> "게시글이 올라오면 등록된 키워드와 비교해서 해당 유저에게 알림을 보내면 되지 않나요?"

하지만 대규모 트래픽에서는 다음 문제들이 복합적으로 발생한다.

초당 수천 건의 게시글이 생성될 때, 하나의 인기 키워드가 수십만 명의 유저에게 등록되어 있을 때, 같은 유저의 여러 키워드가 동시에 하나의 게시글에 매칭될 때, 그리고 게시글 저장은 성공했지만 알림 이벤트가 유실되었을 때 — 이 모든 상황을 처리해야 한다.

### 구체적인 예시

3명의 유저가 다음과 같이 키워드를 등록했다고 가정하자.

- 유저 A: `제주도`, `여행`, `숙소`
- 유저 B: `렌트카`, `항공권`
- 유저 C: `캠핑`

새 게시글이 올라온다: *"이번 주말 제주도 여행 계획 중인데, 숙소랑 렌트카는 어디서 예약할까요?"*

이 게시글에는 `제주도`, `여행`, `숙소`, `렌트카` 키워드가 포함되어 있으므로, 유저 A와 유저 B는 알림을 받아야 하고 유저 C는 받으면 안 된다. 그런데 유저 A는 3개의 키워드가 모두 매칭되었지만, 알림은 반드시 **딱 1번**만 받아야 한다.

---

## 2. 요구사항 정의

### 기능 요구사항

1. 유저는 여러 개의 키워드를 등록할 수 있다.
2. 게시글이 생성되면 제목·본문에서 등록된 키워드를 감지한다.
3. 매칭된 키워드를 등록한 유저를 탐색한다.
4. 동일 유저의 여러 키워드가 같은 게시글에 매칭되더라도, 해당 유저에게는 알림이 1건만 발송된다.
5. 모바일 푸시, 이메일, SMS 등 다양한 채널로 알림을 전송할 수 있다.
6. 알림 처리 실패 시 재시도 로직이 동작한다.

### 비기능 요구사항

1. 게시글 생성 API가 키워드 추출이나 알림 전송으로 인해 느려지면 안 된다.
2. 키워드 처리 실패가 게시글 생성 API에 영향을 주면 안 된다.
3. 게시글이 성공적으로 생성된 이후 알림 이벤트가 유실되면 안 된다.
4. 동일 유저·동일 게시글에 대한 중복 알림을 방지해야 한다.
5. Transaction Outbox 패턴으로 at-least-once 이벤트 전달을 보장해야 한다.
6. 멱등성 키(Idempotency Key)로 exactly-once 효과를 보장해야 한다.
7. 재시도 정책과 DLQ 기반 Dead Letter 처리로 실패 이벤트를 관리해야 한다.

### 규모 가정

| 항목 | 수치 |
|---|---|
| 일간 활성 유저 (DAU) | 100만 명 |
| 키워드 알림 등록 유저 | 50만 명 |
| 유저당 평균 키워드 수 | 10개 |
| 총 등록 키워드 수 | 500만 개 |
| 평균 게시글 생성 TPS | 500 req/s |
| 피크 게시글 생성 TPS | 3,000 req/s |
| 인기 키워드 최대 등록 유저 수 | 30만 명 |
| 게시글 생성 API 목표 지연 | P95 300ms 이하 |
| 알림 발송 목표 지연 | 게시글 생성 후 1분 이내 |

---

## 3. 핵심 설계 원칙: 왜 비동기 분리가 필요한가?

게시글 생성 요청에서 알림까지 **동기적으로 처리하면** 아래와 같은 문제가 생긴다.

```
[동기 처리 — 문제 있는 설계]

POST /posts
    │
    ├─ 1. DB에 게시글 저장
    ├─ 2. 500만 개 키워드와 매칭 ← 수백 ms 소요
    ├─ 3. 매칭된 유저 조회 (최대 30만 명)
    └─ 4. 알림 30만 건 발송 ← 절대 불가

결과: API 응답 시간 수 초 이상, 타임아웃, 서버 과부하
```

따라서 게시글 생성과 알림 처리를 **완전히 분리**하는 비동기 이벤트 기반 아키텍처가 필요하다.

---

## 4. 전체 시스템 아키텍처

```
[클라이언트]
     │ POST /posts
     ▼
[Post Server]
     │
     ├─ 1. posts 테이블에 게시글 저장
     └─ 2. outbox 테이블에 이벤트 저장 (같은 트랜잭션)
                │
                ▼
     [Outbox Relay / Scheduler]
                │ 이벤트 발행
                ▼
            [Kafka]
                │ 소비
                ▼
     [Keyword Server]
                │
                ├─ 게시글 메타데이터 조회
                ├─ Aho-Corasick으로 키워드 추출
                ├─ 매칭 유저 조회
                └─ 알림 요청 생성 (idempotency key 포함)
                │
                ▼
     [Alarm Server]
                │
                ├─ Firebase (푸시) / 이메일 / SMS 발송
                ├─ 발송 결과 기록
                │
                └─ 실패 시 → [DLQ] → Slack 알림 → 수동 복구
```

---

## 5. Transaction Outbox 패턴

### 왜 필요한가?

게시글 저장 후 Kafka에 이벤트를 발행하는 과정에서 장애가 발생하면 **이벤트가 유실**될 수 있다.

```
[문제 상황]
1. DB에 게시글 저장 → 성공
2. Kafka에 이벤트 발행 → 실패 (네트워크 오류, Kafka 장애)

결과: 게시글은 저장됐지만 알림은 영영 발송되지 않음
```

**Transaction Outbox 패턴**은 이 문제를 DB 트랜잭션을 활용해 해결한다.

### 동작 원리

```sql
-- 같은 트랜잭션 안에서 처리
BEGIN TRANSACTION;

-- 1. 게시글 저장
INSERT INTO posts (id, title, content, created_at)
VALUES ('post-uuid', '제주도 여행 추천', '...', NOW());

-- 2. 발행할 이벤트를 outbox 테이블에 함께 저장
INSERT INTO outbox (id, event_type, payload, status, created_at)
VALUES (
  'event-uuid',
  'POST_CREATED',
  '{"postId": "post-uuid", "title": "제주도 여행 추천", "content": "..."}',
  'PENDING',
  NOW()
);

COMMIT;
-- 두 작업이 원자적으로 처리됨. 둘 다 성공하거나 둘 다 실패함.
```

### Outbox Relay

별도의 스케줄러(또는 Debezium CDC)가 주기적으로 outbox 테이블을 폴링해 `PENDING` 상태의 이벤트를 Kafka에 발행한다.

```
outbox 테이블
┌──────────┬─────────────┬──────────┬───────────┐
│ id       │ event_type  │ status   │ created_at│
├──────────┼─────────────┼──────────┼───────────┤
│ event-1  │ POST_CREATED│ PENDING  │ 10:00:01  │  ← Relay가 발행 후 PROCESSED로 변경
│ event-2  │ POST_CREATED│ PROCESSED│ 09:59:55  │
│ event-3  │ POST_CREATED│ FAILED   │ 09:58:12  │  ← 재시도 대상
└──────────┴─────────────┴──────────┴───────────┘
```

---

## 6. Aho-Corasick 알고리즘으로 키워드 매칭 최적화

### 단순 방식의 문제

```
[Naive 방식]
등록된 키워드 500만 개 × 게시글 1건 = 500만 번 문자열 검색
초당 500건 게시글 × 500만 번 = 초당 25억 번 검색 → 불가능
```

### Aho-Corasick 알고리즘

Aho-Corasick 알고리즘은 모든 등록 키워드로 Trie 기반 매칭 구조를 사전에 구축해두고, 게시글 본문을 **딱 한 번만 순회**하면서 모든 키워드를 동시에 탐색한다. 등록 키워드가 수백만 개더라도 게시글 길이에 비례한 O(N) 시간으로 매칭이 가능하다.

```
[Aho-Corasick 방식]

1. 사전 처리: 500만 키워드로 Trie 구축 (서버 시작 시 1회, 키워드 추가 시 업데이트)
2. 검색: 게시글 본문을 1번만 순회 → 매칭되는 키워드 전부 탐색

시간복잡도: O(게시글 길이 + 매칭 결과 수)
```

**동작 원리 (간략)**

```
키워드: ["제주도", "제주", "여행"]
         Trie 구축
              root
              │
              제 ─── 여
              │       │
              주      행 ← "여행" 매칭
              │
         ┌───┴───┐
         도      (실패 링크)
         │
      "제주도" 매칭

텍스트: "제주도 여행 계획"
→ 한 번의 순회로 "제주도", "제주", "여행" 모두 탐색
```

---

## 7. 중복 알림 방지: 멱등성 키 (Idempotency Key)

### 문제 상황

Kafka는 at-least-once 전달을 보장한다. 즉, 네트워크 장애나 컨슈머 재시작 시 **같은 이벤트가 두 번 이상 소비될 수 있다.** 그대로 두면 같은 게시글에 대해 유저에게 알림이 중복 발송된다.

### 해결: Idempotency Key

`post_id + user_id + channel` 조합을 고유 키로 사용해, 이미 처리된 알림은 무시한다.

```sql
-- 알림 발송 전 중복 체크
INSERT INTO notification_log (idempotency_key, post_id, user_id, channel, sent_at)
VALUES ('post-uuid:user-A:PUSH', 'post-uuid', 'user-A', 'PUSH', NOW())
ON CONFLICT (idempotency_key) DO NOTHING;
-- 이미 같은 키가 존재하면 INSERT가 무시됨 → 중복 알림 방지
```

```
[중복 처리 흐름]

동일 이벤트가 2번 소비된 경우:

1번째 소비: idempotency_key 없음 → INSERT 성공 → 알림 발송 ✅
2번째 소비: idempotency_key 있음 → INSERT 무시 → 알림 미발송 (중복 방지) ✅
```

---

## 8. 대규모 Fan-out 처리

인기 키워드에 30만 명이 등록된 경우, 한 게시글 하나가 알림 30만 건을 트리거한다. 이를 한 번에 처리하면 시스템에 부하가 집중된다.

### 해결: 배치 분할 + 병렬 처리

```
[Keyword Server]
     │
     ├─ 매칭 유저 30만 명 조회
     │
     └─ 1,000명 단위로 배치 분할 → 300개 메시지로 Kafka에 발행
                                        │
                        ┌───────────────┼───────────────┐
                        ▼               ▼               ▼
                 [Alarm Worker 1] [Alarm Worker 2] [Alarm Worker 3]
                 (1~1,000번 유저)  (1,001~2,000번)  (2,001~3,000번)
                        │               │               │
                    병렬 발송         병렬 발송         병렬 발송
```

---

## 9. DLQ 기반 장애 처리

### Dead Letter Queue (DLQ)

재시도를 반복해도 처리에 실패하는 이벤트는 **DLQ(Dead Letter Queue)** 로 이동시켜 격리한다. 정상 처리 흐름에 영향을 주지 않으면서 실패 이벤트를 별도로 분석·복구할 수 있다.

```
[정상 흐름]
Kafka → Alarm Server → 알림 발송 성공

[실패 흐름]
Kafka → Alarm Server → 실패
              │
              └─ 재시도 (Exponential Backoff: 1s → 2s → 4s → 8s)
                        │
                        └─ 최대 재시도 횟수 초과
                                  │
                                  ▼
                            [DLQ (Dead Letter Queue)]
                                  │
                            Slack 알림 발송 (운영팀)
                                  │
                      수동 분석 → 원인 파악 → 재처리 또는 폐기
```

### Exponential Backoff + Jitter

단순히 일정 간격으로 재시도하면 모든 실패 이벤트가 동시에 재시도되어 서버에 순간적인 부하를 줄 수 있다. **Jitter(랜덤 지연)**를 추가해 재시도 타이밍을 분산시킨다.

```javascript
// Exponential Backoff + Jitter
function getRetryDelay(attempt) {
  const base = 1000; // 1초
  const max = 30000; // 30초 상한
  const exponential = Math.min(base * Math.pow(2, attempt), max);
  const jitter = Math.random() * exponential * 0.3; // 30% 랜덤 지연
  return exponential + jitter;
}

// attempt 0: ~1,000ms
// attempt 1: ~2,000ms
// attempt 2: ~4,000ms
// attempt 3: ~8,000ms
// attempt 4: ~16,000ms → DLQ
```

---

## 10. 컴포넌트 요약 정리

| 컴포넌트 | 역할 | 핵심 기술 |
|---|---|---|
| **Post Server** | 게시글 저장 + Outbox 이벤트 저장 | DB 트랜잭션 |
| **Outbox Relay** | Outbox 이벤트 → Kafka 발행 | Polling / CDC (Debezium) |
| **Kafka** | 이벤트 브로커, 비동기 분리 | at-least-once 전달 |
| **Keyword Server** | 키워드 추출 + 대상 유저 탐색 | Aho-Corasick 알고리즘 |
| **Alarm Server** | 알림 발송 + 중복 방지 + 결과 기록 | Idempotency Key, Firebase |
| **DLQ** | 실패 이벤트 격리 + 재처리 | Dead Letter Queue |

---

## 11. 설계 패턴 비교 요약

| 문제 | 단순 해결책 | 한계 | 채택한 해결책 |
|---|---|---|---|
| 게시글 생성 속도 저하 | 동기 처리 | API 응답 지연, 타임아웃 | **비동기 이벤트 (Kafka)** |
| 알림 이벤트 유실 | Kafka 직접 발행 | 실패 시 유실 | **Transaction Outbox** |
| 키워드 매칭 성능 | 선형 탐색 | O(키워드 수 × 게시글 길이) | **Aho-Corasick O(N)** |
| 중복 알림 | 없음 | 같은 알림 여러 번 발송 | **Idempotency Key** |
| 처리 실패 | 무시 | 알림 영구 유실 | **DLQ + 재시도** |
| Fan-out 부하 | 한 번에 처리 | 서버 과부하 | **배치 분할 + 병렬 처리** |

---

## 12. 금융권 취업과의 연결고리

이 시스템 설계는 금융 도메인의 핵심 문제들과 정확히 맞닿아 있다.

| 시스템 디자인 개념 | 금융 시스템 적용 사례 |
|---|---|
| **Transaction Outbox** | 이체 처리 후 원장 업데이트 이벤트 유실 방지 |
| **Idempotency Key** | 결제 중복 처리 방지 (동일 결제 요청 2번 처리 금지) |
| **비동기 이벤트 분리** | 주문 처리와 리스크 계산 분리, MTS 알림 발송 |
| **DLQ 기반 장애 처리** | 실패한 거래 이벤트 격리 후 수동 검토·복구 |
| **Fan-out 배치 처리** | 공모주 청약 결과 수십만 건 동시 알림 발송 |
| **Aho-Corasick** | 이상 거래 탐지(FDS)에서 패턴 매칭 최적화 |

> 금융권 면접에서 "대용량 트래픽에서 데이터 정합성을 어떻게 보장하나요?"라는 질문을 받을 때, **Transaction Outbox + Idempotency Key** 조합을 설명할 수 있으면 강력한 답변이 된다.

---

## 📎 참고 자료

- [How to design a keyword alarm on a community app (Medium)](https://medium.com/@junghn6768/how-to-design-a-keyword-alarm-on-a-community-app-e5d5f675b12a)
- [Aho-Corasick 알고리즘 위키피디아](https://en.wikipedia.org/wiki/Aho%E2%80%93Corasick_algorithm)
- [Transaction Outbox Pattern (microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html)
- [Arch Bank — 시스템 디자인 문제 풀기](https://archbanks.com/problems/44)