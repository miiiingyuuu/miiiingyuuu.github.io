---
title: "Binary Lifting"
date: "2026-07-10"
category: ["Algorithm"]
description: "트리에서 K번째 조상 탐색과 LCA(최소 공통 조상)를 O(log N)으로 해결하는 Binary Lifting 알고리즘 정리. 희소 테이블(Sparse Table) 사전 구축 원리, LCA 응용, 두 노드 간 거리 계산까지 JavaScript 구현 코드와 함께 정리"
---

# Binary Lifting — 트리에서 O(log N)으로 조상 탐색하기

---

## 1. 왜 Binary Lifting이 필요한가?

트리에서 다음 두 가지 문제를 생각해보자.

> 1. **K번째 조상 탐색**: 노드 v의 K번째 위 조상은 누구인가?
> 2. **LCA (Lowest Common Ancestor)**: 두 노드 u, v의 가장 가까운 공통 조상은?

### 단순 방식의 한계

```
[Naive 방식 — K번째 조상 탐색]

K번 반복해서 부모를 타고 올라가면 된다.

ancestor(v, K):
  현재 = v
  K번 반복:
    현재 = parent[현재]
  return 현재

시간복잡도: O(K)
```

노드 수가 N = 100,000이고 K = 99,999라면? 쿼리 1번에 O(N), 쿼리가 Q번이면 **O(NQ) = 최대 100억 번** → 시간 초과

**Binary Lifting**은 이 문제를 **O(log N)** 으로 해결한다.

---

## 2. 핵심 아이디어: 2의 거듭제곱으로 점프

Binary Lifting의 핵심은 다음 발상이다.

> "K번을 한 번씩 올라가는 대신,  
> **2의 거듭제곱 단위**로 미리 뛰어두면 어떨까?"

어떤 양의 정수 K도 2의 거듭제곱의 합으로 표현할 수 있다. (이진 표현)

```
예: K = 13 = 8 + 4 + 1 = 2³ + 2² + 2⁰

→ 13번 한 칸씩 올라가는 대신
  2³(8칸) 점프 → 2²(4칸) 점프 → 2⁰(1칸) 점프
  총 3번의 점프로 처리
```

이를 위해 **희소 테이블(Sparse Table)** 을 사전에 구축한다.

```
dp[v][j] = 노드 v에서 2^j번 위의 조상
```

| dp[v][j] | 의미 |
|---|---|
| dp[v][0] | v의 2⁰ = 1번째 조상 (부모) |
| dp[v][1] | v의 2¹ = 2번째 조상 (조부모) |
| dp[v][2] | v의 2² = 4번째 조상 |
| dp[v][j] | v의 2^j번째 조상 |

### 점화식

```
dp[v][0] = parent[v]              // 직접 부모
dp[v][j] = dp[ dp[v][j-1] ][j-1] // v에서 2^(j-1) 올라간 노드의 2^(j-1) 조상
```

쉽게 말하면, **"2^j번 올라가는 것 = 2^(j-1)번 올라간 다음, 거기서 다시 2^(j-1)번 올라가는 것"**

```
예시:
dp[v][1] = dp[ dp[v][0] ][0]
         = (v의 부모)의 부모
         = v의 2번째 조상  ✅

dp[v][2] = dp[ dp[v][1] ][1]
         = (v의 2번째 조상)의 2번째 조상
         = v의 4번째 조상  ✅
```

---

## 3. 알고리즘 구현 (JavaScript)

### 3-1. 전체 구조

```javascript
class BinaryLifting {
  constructor(n, root = 1) {
    this.n = n;
    this.root = root;
    this.LOG = Math.ceil(Math.log2(n + 1)) + 1; // 필요한 j의 최대값

    // dp[v][j]: 노드 v의 2^j번째 조상 (없으면 0)
    this.dp = Array.from({ length: n + 1 }, () => new Array(this.LOG).fill(0));

    // 각 노드의 깊이
    this.depth = new Array(n + 1).fill(0);

    // 인접 리스트
    this.graph = Array.from({ length: n + 1 }, () => []);
  }

  addEdge(u, v) {
    this.graph[u].push(v);
    this.graph[v].push(u);
  }

  // DFS로 depth와 dp[v][0](부모) 초기화
  build() {
    const stack = [[this.root, 0, 0]]; // [현재 노드, 부모, 깊이]

    while (stack.length > 0) {
      const [v, parent, d] = stack.pop();
      this.depth[v] = d;
      this.dp[v][0] = parent; // 직접 부모 저장

      // j = 1, 2, ... LOG-1 에 대해 dp 구축
      for (let j = 1; j < this.LOG; j++) {
        this.dp[v][j] = this.dp[this.dp[v][j - 1]][j - 1];
      }

      for (const next of this.graph[v]) {
        if (next !== parent) {
          stack.push([next, v, d + 1]);
        }
      }
    }
  }

  // v의 k번째 조상 반환 (없으면 0)
  kthAncestor(v, k) {
    for (let j = 0; j < this.LOG; j++) {
      if ((k >> j) & 1) {       // k의 j번째 비트가 1이면
        v = this.dp[v][j];      // 2^j 칸 점프
        if (v === 0) return 0;  // 루트를 넘어가면 0 반환
      }
    }
    return v;
  }

  // u, v의 LCA 반환
  lca(u, v) {
    // 1단계: 깊이 맞추기 (더 깊은 노드를 얕은 노드 깊이까지 올림)
    if (this.depth[u] < this.depth[v]) [u, v] = [v, u];

    const diff = this.depth[u] - this.depth[v];
    u = this.kthAncestor(u, diff); // u를 diff만큼 올려서 같은 깊이로

    // 2단계: 이미 같은 노드면 그게 LCA
    if (u === v) return u;

    // 3단계: 함께 올라가다가 처음으로 달라지는 지점 직전까지 점프
    for (let j = this.LOG - 1; j >= 0; j--) {
      if (this.dp[u][j] !== this.dp[v][j]) {
        u = this.dp[u][j];
        v = this.dp[v][j];
      }
    }

    // u, v의 부모가 LCA
    return this.dp[u][0];
  }

  // u, v 사이의 거리 반환
  distance(u, v) {
    const l = this.lca(u, v);
    return this.depth[u] + this.depth[v] - 2 * this.depth[l];
  }
}
```

---

## 4. 동작 예시 (단계별 추적)

아래 트리를 예시로 사용한다.

```
         1
       / | \
      2  3  4
     / \    |
    5   6   7
        |
        8
```

### 4-1. 트리 구축 및 깊이 계산

```
depth[1] = 0  (루트)
depth[2] = 1, depth[3] = 1, depth[4] = 1
depth[5] = 2, depth[6] = 2, depth[7] = 2
depth[8] = 3
```

### 4-2. 희소 테이블 (dp) 구축

```
dp[v][0] = 직접 부모

dp[5][0] = 2,  dp[5][1] = dp[dp[5][0]][0] = dp[2][0] = 1  (5의 2번째 조상 = 1)
dp[6][0] = 2,  dp[6][1] = 1
dp[8][0] = 6,  dp[8][1] = dp[6][0] = 2,  dp[8][2] = dp[dp[8][1]][1] = dp[2][1] = dp[1][0] = 0
              (8의 2번째 조상 = 2)         (8의 4번째 조상 = 없음 → 0)
```

### 4-3. K번째 조상 탐색: `kthAncestor(8, 3)`

```
K = 3 = 2¹ + 2⁰ = (이진수 11)

j = 0: (3 >> 0) & 1 = 1 → v = dp[8][0] = 6  (2^0 = 1칸 점프)
j = 1: (3 >> 1) & 1 = 1 → v = dp[6][1] = 1  (2^1 = 2칸 점프)

결과: 노드 8의 3번째 조상 = 노드 1  ✅
```

### 4-4. LCA 탐색: `lca(5, 8)`

```
depth[5] = 2, depth[8] = 3

1단계: 깊이 맞추기
  diff = 3 - 2 = 1
  8을 1칸 올림 → kthAncestor(8, 1) = dp[8][0] = 6
  이제 u = 5 (depth 2), v = 6 (depth 2)

2단계: 5 ≠ 6 이므로 계속 진행

3단계: 함께 올라가기
  j = 1: dp[5][1] = 1, dp[6][1] = 1 → 같으므로 점프 안 함
  j = 0: dp[5][0] = 2, dp[6][0] = 2 → 같으므로 점프 안 함
  (같은 값이 나오기 전까지의 직전 상태가 u = 5, v = 6)

  LCA = dp[5][0] = 2  ✅
```

### 4-5. 두 노드 간 거리: `distance(5, 8)`

```
lca(5, 8) = 2,  depth[2] = 1

distance = depth[5] + depth[8] - 2 * depth[2]
         = 2 + 3 - 2 * 1
         = 3  ✅ (5 → 2 → 6 → 8)
```

---

## 5. 사용 예시 (전체 코드)

```javascript
// 트리 구성
const n = 8;
const bl = new BinaryLifting(n, 1);

// 간선 추가
[[1,2],[1,3],[1,4],[2,5],[2,6],[4,7],[6,8]].forEach(([u,v]) => bl.addEdge(u, v));

// 희소 테이블 구축
bl.build();

// K번째 조상
console.log(bl.kthAncestor(8, 3)); // 1 (8의 3번째 조상)
console.log(bl.kthAncestor(5, 1)); // 2 (5의 1번째 조상)
console.log(bl.kthAncestor(1, 1)); // 0 (루트의 조상은 없음)

// LCA
console.log(bl.lca(5, 8)); // 2
console.log(bl.lca(3, 7)); // 1
console.log(bl.lca(5, 6)); // 2

// 두 노드 간 거리
console.log(bl.distance(5, 8)); // 3
console.log(bl.distance(3, 7)); // 2
```

---

## 6. 시간복잡도 / 공간복잡도

| 연산 | Naive | Binary Lifting |
|---|---|---|
| 전처리 (테이블 구축) | O(1) | **O(N log N)** |
| K번째 조상 탐색 | O(K) | **O(log N)** |
| LCA 탐색 | O(N) | **O(log N)** |
| 두 노드 간 거리 | O(N) | **O(log N)** |
| 공간복잡도 | O(N) | **O(N log N)** |

> 쿼리가 Q번이라면  
> Naive: **O(NQ)** → Binary Lifting: **O((N + Q) log N)**  
> N = Q = 100,000 기준: 100억 번 → **340만 번**

---

## 7. 자주 나오는 문제 유형

### 유형 1: K번째 조상

> "노드 v에서 K번 부모를 타고 올라가면 어떤 노드인가?"

→ `kthAncestor(v, K)` 직접 사용

### 유형 2: LCA

> "두 노드 u, v의 최소 공통 조상을 구하라"

→ `lca(u, v)` 직접 사용

대표 문제: 백준 11438 (LCA 2)

### 유형 3: 두 노드 간 거리

> "두 노드 u, v 사이의 간선 수(또는 가중치 합)를 구하라"

→ `distance(u, v) = depth[u] + depth[v] - 2 * depth[lca(u, v)]`

대표 문제: 백준 1761

### 유형 4: 경로 위의 최대/최솟값

Binary Lifting 테이블에 조상 정보뿐만 아니라 **경로 위의 최대·최솟값**도 함께 저장하는 응용이다.

```javascript
// dp[v][j][0] = v에서 2^j 위 조상
// dp[v][j][1] = v에서 그 조상까지 경로 중 최대 가중치

// 점화식
dp[v][j][0] = dp[dp[v][j-1][0]][j-1][0];
dp[v][j][1] = Math.max(dp[v][j-1][1], dp[dp[v][j-1][0]][j-1][1]);
```

---

## 8. 핵심 포인트 요약

```
Binary Lifting 핵심 3줄 요약

1. 희소 테이블 구축: dp[v][j] = v의 2^j번째 조상 — O(N log N)

2. K번째 조상: K를 이진수로 분해해 해당하는 j만큼 점프 — O(log N)

3. LCA: ① 깊이 맞추기 → ② 함께 점프 → ③ 부모 반환 — O(log N)
```

### 구현 시 자주 하는 실수

```
❌ LOG 값을 작게 잡는 경우
   → Math.ceil(Math.log2(n + 1)) + 1 로 여유 있게 설정

❌ 루트 노드의 조상을 0으로 처리하지 않는 경우
   → dp 배열 초기값을 0으로 fill, 루트의 parent = 0

❌ LCA에서 깊이를 맞출 때 kthAncestor를 안 쓰고 직접 루프를 짜는 경우
   → kthAncestor를 재사용하면 코드가 간결하고 실수를 줄일 수 있음

❌ depth 배열을 BFS/DFS로 먼저 구하고 dp를 따로 구하는 경우
   → build() 안에서 DFS 스택으로 한 번에 처리하면 효율적
```

---

## 📎 관련 문제(참고용)

| 문제 | 플랫폼 | 핵심 개념 |
|---|---|---|
| [11438 LCA 2](https://www.acmicpc.net/problem/11438) | 백준 | Binary Lifting LCA |
| [1761 정점들의 거리](https://www.acmicpc.net/problem/1761) | 백준 | LCA + 두 노드 거리 |
| [17435 합성함수와 쿼리](https://www.acmicpc.net/problem/17435) | 백준 | Binary Lifting 직접 응용 |
| [3584 가장 가까운 공통 조상](https://www.acmicpc.net/problem/3584) | 백준 | LCA 기본 |
| [13511 트리와 쿼리 2](https://www.acmicpc.net/problem/13511) | 백준 | 경로 위 최솟값 |