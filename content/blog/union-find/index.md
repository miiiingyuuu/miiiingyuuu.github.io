---
title: "유니온 파인드(Union-Find) 알고리즘"
date: "2024-11-08"
category: ["Algorithm", "Graph"]
description: "두 노드가 같은 집합에 속하는지 판별하는 유니온 파인드 알고리즘의 개념, Union/Find 연산, 경로 압축 최적화, Python 구현을 정리"
---

유니온 파인드(Union-Find)는 **두 노드가 같은 집합에 속하는지 판별하는 그래프 알고리즘**입니다. 합집합 찾기 알고리즘이라고도 부르며, 서로 연결되지 않은 노드들의 집합을 다루기 때문에 **서로소 집합(Disjoint Set)** 이라고도 합니다.

두 가지 핵심 연산으로 이루어집니다.

- **Union**: 두 노드를 같은 집합으로 합치는 연산
- **Find**: 노드의 루트 노드를 찾는 연산

---

## 핵심 아이디어

유니온 파인드는 각 노드의 **부모 노드 번호를 저장하는 배열(parent)**을 사용합니다. 초기에는 모든 노드가 독립적이므로 자기 자신이 부모 노드입니다.

```
초기 상태 (노드 7개)
인덱스: 1  2  3  4  5  6  7
부모:   1  2  3  4  5  6  7
```

두 노드가 같은 집합에 속하는지 확인하려면 각 노드의 **루트 노드가 동일한지** 비교하면 됩니다. 루트 노드는 `parent[i] == i`인 노드입니다.

---

## 동작 예시

### Union 연산

`Union(1, 2)` → 2번 노드의 부모를 1번으로 설정

```
인덱스: 1  2  3  4  5  6  7
부모:   1  1  3  4  5  6  7
```

`Union(4, 5)`, `Union(5, 6)` → 5, 6번의 루트를 4번으로 설정

```
인덱스: 1  2  3  4  5  6  7
부모:   1  1  3  4  4  4  7
```

### Find 연산

**2번 노드의 루트를 찾는 과정**
1. `parent[2]` = 1
2. `parent[1]` = 1 → 인덱스와 값이 같음 → 루트는 **1번**

**6번 노드의 루트를 찾는 과정**
1. `parent[6]` = 4
2. `parent[4]` = 4 → 인덱스와 값이 같음 → 루트는 **4번**

2번의 루트(1)와 6번의 루트(4)가 다르므로 → **두 노드는 연결되어 있지 않음**

이후 `Union(1, 4)`를 수행하면 두 집합이 합쳐져 2번과 6번이 같은 집합이 됩니다.

---

## 트리 치우침 문제와 경로 압축

### 문제 상황

아래처럼 한쪽으로만 노드가 이어지는 경우, Find 연산의 재귀 호출 깊이가 깊어져 탐색 시간이 오래 걸립니다.

```
Union(3, 4) → Union(4, 5) → Union(5, 6) → Union(6, 7)

3 - 4 - 5 - 6 - 7  (선형 구조 → Find가 O(N))
```

### 해결책: 경로 압축 (Path Compression)

Find 연산에서 루트를 찾는 과정에 **경로 압축**을 적용합니다. 재귀적으로 루트를 찾으면서 거쳐가는 모든 노드의 부모를 바로 루트로 갱신합니다.

```python
def find(x):
    if x == parent[x]:
        return x
    parent[x] = find(parent[x])  # 경로 압축: 부모를 루트로 직접 연결
    return parent[x]
```

경로 압축 후 트리 구조가 훨씬 평탄해져, 이후 Find 연산이 거의 O(1)에 가까워집니다.

```
경로 압축 적용 후
인덱스: 1  2  3  4  5  6  7
부모:   1  2  3  3  3  3  3  (4,5,6,7 모두 루트 3을 직접 가리킴)
```

---

## Python 구현

```python
import sys
input = sys.stdin.readline

def find(x):
    # 루트 노드면 반환
    if x == parent[x]:
        return x
    # 경로 압축: 부모를 루트로 직접 갱신
    parent[x] = find(parent[x])
    return parent[x]

def union(x, y):
    x = find(x)
    y = find(y)

    # 이미 같은 집합이면 무시
    if x == y:
        return

    # 더 작은 번호가 부모가 되도록
    if x < y:
        parent[y] = x
    else:
        parent[x] = y

def is_union(x, y):
    # 두 노드의 루트가 같으면 같은 집합
    return find(x) == find(y)


# 사용 예시
n = 7
parent = list(range(n + 1))  # parent[i] = i로 초기화

union(1, 2)
union(4, 5)
union(5, 6)

print(is_union(2, 6))  # False (아직 다른 집합)

union(1, 4)

print(is_union(2, 6))  # True (같은 집합)
```

---

## Union by Rank (랭크 기반 합치기)

경로 압축 외에도 **Union by Rank**를 함께 사용하면 트리의 높이를 최소화할 수 있습니다. 트리의 높이(rank)가 낮은 쪽을 높은 쪽에 붙이는 방식입니다.

```python
def union_by_rank(x, y):
    rx, ry = find(x), find(y)

    if rx == ry:
        return

    # rank가 낮은 트리를 높은 트리 아래에 붙임
    if rank[rx] < rank[ry]:
        parent[rx] = ry
    elif rank[rx] > rank[ry]:
        parent[ry] = rx
    else:
        parent[ry] = rx
        rank[rx] += 1  # 높이가 같을 때만 rank 증가

n = 7
parent = list(range(n + 1))
rank = [0] * (n + 1)
```

---

## 시간 복잡도

| 최적화 방법 | Find 복잡도 | Union 복잡도 |
|------------|------------|-------------|
| 기본 구현 | O(N) | O(N) |
| 경로 압축 | O(log N) | O(log N) |
| 경로 압축 + Union by Rank | **O(α(N)) ≈ O(1)** | **O(α(N)) ≈ O(1)** |

> α(N)은 아커만 함수의 역함수로, 사실상 상수에 가까운 값입니다. 두 최적화를 함께 적용하면 거의 O(1)로 동작합니다.

---

## 활용

유니온 파인드는 단순히 두 노드의 연결 여부를 확인하는 것 외에도 다양한 곳에 활용됩니다.

- **사이클 감지**: 간선을 추가할 때 두 노드의 루트가 같으면 사이클이 형성됨
- **크루스칼 알고리즘(MST)**: 최소 신장 트리를 구할 때 사이클 없이 간선을 선택하는 데 사용
- **네트워크 연결 확인**: 특정 노드들이 같은 네트워크에 속하는지 판별

---

## 관련 문제

- [BOJ 1717 - 집합의 표현](https://www.acmicpc.net/problem/1717) ← 유니온 파인드 대표 문제
- [BOJ 1976 - 여행 가자](https://www.acmicpc.net/problem/1976)
- [BOJ 4195 - 친구 네트워크](https://www.acmicpc.net/problem/4195)
- [프로그래머스 - 섬 연결하기](https://school.programmers.co.kr/learn/courses/30/lessons/42861)

Ref: [[알고리즘] 유니온 파인드 (Union-Find)](https://velog.io/@jxlhe46/%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98-%EC%9C%A0%EB%8B%88%EC%98%A8-%ED%8C%8C%EC%9D%B8%EB%93%9C-Union-Find)