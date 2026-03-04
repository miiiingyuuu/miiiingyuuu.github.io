---
title: "다이나믹 프로그래밍 (Dynamic Programming)"
date: "2024-01-04"
categories: ["Algorithm"]
description: "DP의 개념, 적용 조건, Bottom-Up과 Top-Down 방식 정리"
---

다이나믹 프로그래밍(Dynamic Programming, DP)은 복잡한 문제를 더 작은 하위 문제로 나누어 해결하는 **알고리즘 설계 기법**입니다. 핵심은 한 번 계산한 결과를 저장해두고 재사용함으로써 중복 계산을 줄이는 것입니다.

> **알고리즘 설계 기법**이란 문제 해결을 위한 전략이나 접근 방식을 의미합니다. 분할 정복, DP, 탐욕 알고리즘, 백트래킹 등이 대표적인 예입니다.

---

## DP vs 단순 재귀

얼핏 비슷해 보이지만 둘은 접근 방향과 중복 처리 방식에서 차이가 있습니다.

| 구분 | 단순 재귀 | DP |
|------|----------|----|
| 접근 방향 | 하향식 (Top-Down) | 주로 상향식 (Bottom-Up) |
| 중복 계산 | 그대로 반복 | 메모이제이션으로 방지 |
| 속도 | 느릴 수 있음 | 빠름 |

---

## DP 적용 조건

DP를 사용하려면 아래 두 조건을 모두 만족해야 합니다.

### 1. 중복되는 부분 문제 (Overlapping Subproblems)

동일한 작은 문제가 반복해서 등장해야 합니다. DP는 이 반복되는 계산 결과를 저장해두고 재활용합니다.

### 2. 최적 부분 구조 (Optimal Substructure)

부분 문제의 최적 결과가 전체 문제의 최적 결과를 만들어낼 수 있어야 합니다.

예를 들어 A → B까지의 최단 경로를 구할 때, 중간 노드 X를 지난다면 A→X 구간과 X→B 구간이 각각 최단 경로여야만 전체 A→X→B도 최단 경로가 됩니다.

---

## DP 풀이 방법

### 핵심 두 가지

1. **메모이제이션 배열 만들기** — 결과를 저장할 배열(dp)을 선언하고, 계산할 때마다 값을 저장합니다.
2. **점화식 세우기** — 변수 간의 관계식을 정의합니다. 예: 피보나치 수열의 `f(n) = f(n-1) + f(n-2)`

### Bottom-Up (Tabulation) — 반복문 사용

작은 부분 문제부터 차례대로 해결하며 전체 답을 구합니다. 직관적이고 스택 오버플로우 위험이 없습니다.

### Top-Down (Memoization) — 재귀 사용

큰 문제를 재귀로 쪼개 내려가면서, 이미 계산한 값은 저장해두고 재사용합니다. 구현이 간결하지만 재귀 호출 오버헤드가 발생할 수 있습니다.

---

## 대표 문제

### 1. 피보나치 수열 — Top-Down 방식

재귀 + 메모이제이션을 사용해 중복 계산을 방지합니다.

```python
def fibonacci(n, memo={}):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n

    # 결과를 저장해두고 재사용
    memo[n] = fibonacci(n - 1, memo) + fibonacci(n - 2, memo)
    return memo[n]

print(fibonacci(10))  # 55
```

Bottom-Up 방식으로도 구현할 수 있습니다:

```python
def fibonacci_bottom_up(n):
    if n <= 1:
        return n

    dp = [0] * (n + 1)
    dp[1] = 1

    for i in range(2, n + 1):
        dp[i] = dp[i - 1] + dp[i - 2]

    return dp[n]

print(fibonacci_bottom_up(10))  # 55
```

---

### 2. 배낭 문제 (Knapsack Problem) — Bottom-Up 방식

주어진 가방 용량 내에서 최대 가치의 물건을 담는 문제입니다.

```python
def knapsack(weights, values, capacity):
    n = len(weights)

    # dp[i][j] = i번째 물건까지 고려했을 때 용량 j에서의 최대 가치
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]

    for i in range(1, n + 1):
        for j in range(1, capacity + 1):
            if weights[i - 1] > j:
                # 현재 물건을 넣을 수 없는 경우
                dp[i][j] = dp[i - 1][j]
            else:
                # 현재 물건을 넣는 경우 vs 넣지 않는 경우 중 최대값
                dp[i][j] = max(dp[i - 1][j], dp[i - 1][j - weights[i - 1]] + values[i - 1])

    return dp[n][capacity]

weights = [2, 3, 4, 5]
values = [3, 4, 5, 6]
capacity = 7

print(knapsack(weights, values, capacity))  # 9
```

---

### 3. 최장 증가 부분 수열 (LIS) — Bottom-Up 방식

주어진 수열에서 순서를 유지하면서 가장 긴 증가하는 부분 수열의 길이를 구합니다.

```python
def lis(nums):
    n = len(nums)

    # dp[i] = nums[i]를 마지막 원소로 하는 LIS의 길이
    dp = [1] * n

    for i in range(1, n):
        for j in range(i):
            if nums[i] > nums[j]:
                dp[i] = max(dp[i], dp[j] + 1)

    return max(dp)

nums = [10, 9, 2, 5, 3, 7, 101, 18]
print(lis(nums))  # 4  →  [2, 5, 7, 101] 또는 [2, 3, 7, 101]
```

---

### 4. 최단 경로 문제 — Bottom-Up 방식

그래프에서 시작 노드부터 모든 노드까지의 최단 거리를 구합니다. (다익스트라 기반)

```python
import heapq

def shortest_path(graph, start):
    n = len(graph)
    dp = [float('inf')] * n
    dp[start] = 0

    heap = [(0, start)]  # (거리, 노드)

    while heap:
        dist, node = heapq.heappop(heap)

        if dist > dp[node]:
            continue

        for next_node, weight in enumerate(graph[node]):
            if weight != 0 and dp[node] + weight < dp[next_node]:
                dp[next_node] = dp[node] + weight
                heapq.heappush(heap, (dp[next_node], next_node))

    return dp

graph = [
    [0, 4, 2, 0],
    [4, 0, 1, 5],
    [2, 1, 0, 8],
    [0, 5, 8, 0]
]

result = shortest_path(graph, 0)
print(result[3])  # 8  →  0→2→1→3 경로 (2+1+5)
```

---

### 5. 문자열 편집 거리 (Edit Distance) — Bottom-Up 방식

두 문자열 간의 최소 편집 횟수(삽입, 삭제, 대체)를 구합니다.

```python
def edit_distance(str1, str2):
    m, n = len(str1), len(str2)

    # dp[i][j] = str1의 앞 i글자와 str2의 앞 j글자 사이의 최소 편집 거리
    dp = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        dp[i][0] = i  # str2가 빈 문자열이면 전부 삭제
    for j in range(n + 1):
        dp[0][j] = j  # str1이 빈 문자열이면 전부 삽입

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if str1[i - 1] == str2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],      # 삭제
                    dp[i][j - 1],      # 삽입
                    dp[i - 1][j - 1]   # 대체
                )

    return dp[m][n]

print(edit_distance("kitten", "sitting"))  # 3
```

---

## Bottom-Up vs Top-Down 비교

| 구분 | Bottom-Up | Top-Down |
|------|-----------|----------|
| 구현 방식 | 반복문 | 재귀 + 메모이제이션 |
| 속도 | 빠름 | 재귀 오버헤드 있음 |
| 스택 오버플로우 | 없음 | 깊이 깊으면 위험 |
| 불필요한 계산 | 모든 부분 문제 계산 | 필요한 것만 계산 |
| 직관성 | 높음 | 점화식이 명확할 때 더 간결 |

---

## DP 장단점

**장점**
- 중복 계산을 제거해 시간 복잡도를 크게 줄일 수 있습니다.
- 최적 부분 구조를 보장하는 문제에서 항상 최적해를 구할 수 있습니다.

**단점**
- 중간 결과를 저장하기 위해 추가 메모리가 필요합니다.
- 점화식을 세우는 것이 어렵고, 문제에 따라 접근 방식이 크게 달라집니다.

Ref: [동적계획법(Dynamic Programming)](https://velog.io/@boyeon_jeong/%EB%8F%99%EC%A0%81%EA%B3%84%ED%9A%8D%EB%B2%95Dynamic-Programming)
