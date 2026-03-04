---
title: "다익스트라(Dijkstra) 알고리즘"
date: "2024-05-05"
category: ["Algorithm", "Graph"]
description: "그래프에서 최단 경로를 구하는 다익스트라 알고리즘의 개념, 동작 원리, 순차 탐색과 우선순위 큐를 이용한 두 가지 구현 방법을 정리"
---

다익스트라(Dijkstra) 알고리즘은 그래프에서 **하나의 출발 노드로부터 다른 모든 노드까지의 최단 경로**를 구하는 알고리즘입니다. 매번 방문하지 않은 노드 중 최단 거리인 노드를 선택해 탐색을 반복하는 방식으로 동작합니다.

> 최소 비용을 구하는 그래프 알고리즘으로는 다익스트라 외에도 **벨만-포드**, **플로이드-워샬** 알고리즘이 있습니다.

---

## 동작 단계

1. 출발 노드와 도착 노드를 설정합니다.
2. **최단 거리 테이블**을 무한대(inf)로 초기화하고, 출발 노드의 거리는 0으로 설정합니다.
3. 방문하지 않은 노드 중 거리값이 가장 작은 노드를 선택하고 방문 처리합니다.
4. 해당 노드를 거쳐 인접 노드로 가는 비용을 계산해 최단 거리 테이블을 업데이트합니다.
5. 3~4 과정을 모든 노드를 방문할 때까지 반복합니다.

---

## 동작 예시

아래 그래프에서 노드 1 → 노드 6까지의 최단 경로를 구해봅니다.

```
노드: 1, 2, 3, 4, 5, 6
간선: 1-2(2), 1-4(1), 2-3(3), 2-4(2), 4-5(1), 5-6(2), 3-6(5)
```

| 단계 | 선택 노드 | 1 | 2 | 3 | 4 | 5 | 6 |
|------|----------|---|---|---|---|---|---|
| 초기 | - | 0 | ∞ | ∞ | ∞ | ∞ | ∞ |
| 1 | 1 | 0 | 2 | ∞ | 1 | ∞ | ∞ |
| 2 | 4 | 0 | 2 | ∞ | 1 | 2 | ∞ |
| 3 | 2 | 0 | 2 | 5 | 1 | 2 | ∞ |
| 4 | 5 | 0 | 2 | 5 | 1 | 2 | 4 |
| 5 | 6 | 0 | 2 | 5 | 1 | 2 | 4 |

최종 결과: 1 → 4 → 5 → 6, 최단 거리 **4**

---

## 핵심 특징

- 한 번 방문한 노드의 최단 거리는 이후에 더 작은 값으로 갱신되지 않습니다.
- **간선의 가중치가 반드시 양수여야 합니다.** 음수 가중치가 있으면 이미 방문한 노드가 더 짧은 경로로 갱신될 수 있어 알고리즘이 올바르게 동작하지 않습니다.
- 음수 가중치가 존재하는 경우에는 **벨만-포드 알고리즘**을 사용해야 합니다.

---

## 구현 방법 1: 순차 탐색

방문하지 않은 노드 중 거리값이 가장 작은 노드를 앞에서부터 순차적으로 탐색해 찾습니다.

- **시간 복잡도**: O(N²) — 노드 수가 N일 때 각 노드마다 N번 순차 탐색

### C++ 구현

```cpp
#include <vector>
#include <climits>
using namespace std;

const int INF = INT_MAX;
int N;  // 노드 개수
int dist[101];
bool visited[101];
int map[101][101];

// 방문하지 않은 노드 중 거리값이 가장 작은 노드 반환
int findSmallestNode() {
    int min_dist = INF;
    int min_idx = -1;
    for (int i = 1; i <= N; i++) {
        if (visited[i]) continue;
        if (dist[i] < min_dist) {
            min_dist = dist[i];
            min_idx = i;
        }
    }
    return min_idx;
}

void dijkstra(int start) {
    // 시작 노드와 인접한 정점에 대해 거리 초기화
    for (int i = 1; i <= N; i++)
        dist[i] = map[start][i];

    dist[start] = 0;
    visited[start] = true;

    for (int i = 0; i < N - 1; i++) {
        int new_node = findSmallestNode();
        visited[new_node] = true;

        for (int j = 1; j <= N; j++) {
            if (visited[j]) continue;
            if (dist[j] > dist[new_node] + map[new_node][j])
                dist[j] = dist[new_node] + map[new_node][j];
        }
    }
}
```

### Python 구현

```python
import sys
INF = sys.maxsize

def dijkstra_sequential(start, n, graph):
    dist = [INF] * (n + 1)
    visited = [False] * (n + 1)
    dist[start] = 0

    for _ in range(n):
        # 방문하지 않은 노드 중 거리값이 가장 작은 노드 선택
        cur = -1
        for i in range(1, n + 1):
            if not visited[i] and (cur == -1 or dist[i] < dist[cur]):
                cur = i

        visited[cur] = True

        for nxt, weight in graph[cur]:
            if dist[cur] + weight < dist[nxt]:
                dist[nxt] = dist[cur] + weight

    return dist

# 사용 예시
n = 6  # 노드 수
graph = [[] for _ in range(n + 1)]
graph[1].extend([(2, 2), (4, 1)])
graph[2].extend([(3, 3), (4, 2)])
graph[4].extend([(5, 1)])
graph[5].extend([(6, 2)])
graph[3].extend([(6, 5)])

dist = dijkstra_sequential(1, n, graph)
print(dist[6])  # 4
```

---

## 구현 방법 2: 우선순위 큐 (개선된 방법)

최소 힙(Min Heap) 기반의 우선순위 큐를 활용해 매번 거리값이 가장 작은 노드를 O(log N)에 꺼냅니다. 순차 탐색 방식보다 훨씬 빠릅니다.

- **시간 복잡도**: O(E log V) — 간선 수 E, 노드 수 V
- 방문 여부 배열 없이도 동작합니다. 꺼낸 노드의 거리가 현재 저장된 거리보다 크면 그냥 무시하면 됩니다.
- 우선순위 큐에는 `(거리, 노드)` 형태로 삽입합니다.

### C++ 구현

```cpp
#include <vector>
#include <queue>
#include <iostream>
using namespace std;

#define INF 99999999

vector<int> dijkstra(int start, int N, vector<pair<int, int>> graph[]) {
    vector<int> dist(N + 1, INF);
    // C++ priority_queue는 최대 힙이므로 거리에 음수를 붙여 최소 힙처럼 사용
    priority_queue<pair<int, int>> pq;

    dist[start] = 0;
    pq.push({0, start});

    while (!pq.empty()) {
        int cur_dist = -pq.top().first;
        int cur_node = pq.top().second;
        pq.pop();

        // 이미 처리된 노드라면 무시
        if (cur_dist > dist[cur_node]) continue;

        for (auto [nxt_node, weight] : graph[cur_node]) {
            int nxt_dist = cur_dist + weight;
            if (nxt_dist < dist[nxt_node]) {
                dist[nxt_node] = nxt_dist;
                pq.push({-nxt_dist, nxt_node});
            }
        }
    }

    return dist;
}
```

### Python 구현

```python
import heapq
import sys
INF = sys.maxsize

def dijkstra(start, n, graph):
    dist = [INF] * (n + 1)
    dist[start] = 0

    # 최소 힙: (거리, 노드)
    heap = [(0, start)]

    while heap:
        cur_dist, cur_node = heapq.heappop(heap)

        # 이미 더 짧은 경로로 처리된 노드라면 무시
        if cur_dist > dist[cur_node]:
            continue

        for nxt_node, weight in graph[cur_node]:
            nxt_dist = cur_dist + weight
            if nxt_dist < dist[nxt_node]:
                dist[nxt_node] = nxt_dist
                heapq.heappush(heap, (nxt_dist, nxt_node))

    return dist

# 사용 예시
n = 6
graph = [[] for _ in range(n + 1)]
graph[1].extend([(2, 2), (4, 1)])
graph[2].extend([(3, 3), (4, 2)])
graph[4].extend([(5, 1)])
graph[5].extend([(6, 2)])
graph[3].extend([(6, 5)])

dist = dijkstra(1, n, graph)
print(dist[6])  # 4
```

---

## 두 구현 방법 비교

| 구분 | 순차 탐색 | 우선순위 큐 |
|------|----------|------------|
| 시간 복잡도 | O(N²) | O(E log V) |
| 적합한 상황 | 노드 수가 적을 때 | 노드/간선 수가 많을 때 |
| 방문 배열 | 필요 | 불필요 |
| 구현 난이도 | 쉬움 | 보통 |

노드 수가 적은 경우(N ≤ 1,000)에는 순차 탐색도 충분하지만, 일반적으로는 **우선순위 큐 방식**을 사용하는 것이 좋습니다.

---

## 다익스트라 vs 다른 최단 경로 알고리즘

| 알고리즘 | 음수 가중치 | 시간 복잡도 | 특징 |
|----------|-----------|------------|------|
| 다익스트라 | ❌ | O(E log V) | 단일 출발점 최단 경로 |
| 벨만-포드 | ✅ | O(VE) | 음수 사이클 감지 가능 |
| 플로이드-워샬 | ✅ | O(V³) | 모든 쌍 최단 경로 |

---

## 관련 문제

- [BOJ 1753 - 최단경로](https://www.acmicpc.net/problem/1753)
- [BOJ 1916 - 최소비용 구하기](https://www.acmicpc.net/problem/1916)
- [BOJ 1238 - 파티](https://www.acmicpc.net/problem/1238)
- [프로그래머스 - 네트워크](https://school.programmers.co.kr/learn/courses/30/lessons/43162)

Ref: [[알고리즘] 다익스트라(Dijkstra) 알고리즘](https://velog.io/@717lumos/%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98-%EB%8B%A4%EC%9D%B5%EC%8A%A4%ED%8A%B8%EB%9D%BCDijkstra-%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98)