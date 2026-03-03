---
title: "세그먼트 트리 (Segment Tree)"
date: "2026-01-29"
category: ["Algorithm", "Tree"]
description: "구간 값을 효율적으로 저장하고 탐색하는 세그먼트 트리의 개념 정리"
---

세그먼트 트리(Segment Tree)는 특정 구간(Segment)에 대한 구간 값을 트리 구조에 미리 저장해두는 자료구조입니다. 이진 트리를 기반으로 하며, 구간 합·구간 곱·구간 최솟값 등 다양한 구간 쿼리를 효율적으로 처리할 수 있습니다.

---

## 왜 세그먼트 트리를 사용하는가?

아래와 같은 배열이 있다고 가정해봅시다.

```python
nums = [3, 2, 8, 4, 7, 5, 6]
```

특정 구간 `nums[start:end]`의 합을 n번 구해야 한다면, 매번 순회할 경우 총 `(end - start) * n`번의 연산이 필요합니다. 배열이 길고 쿼리가 많을수록 비효율적입니다.

세그먼트 트리는 구간 합을 미리 계산해 트리에 저장해두고, 필요할 때 **O(log n)** 만에 꺼내 쓰는 방식으로 이 문제를 해결합니다.

| 방법 | 구간 합 탐색 | 값 업데이트 |
|------|-------------|------------|
| 단순 순회 | O(n) | O(1) |
| 누적 합 배열 | O(1) | O(n) |
| 세그먼트 트리 | O(log n) | O(log n) |

---

## 트리 구조

세그먼트 트리는 이진 트리로, 리프 노드에는 배열의 각 원소가, 내부 노드에는 두 자식 노드의 합(또는 곱 등)이 저장됩니다.

```
nums = [3, 2, 8, 4, 7, 5, 6]

              35
           /      \
         17        18
        /  \      /  \
       5   12    12    6
      / \  / \  / \
     3   2 8  4 7  5
```

1차원 배열로 구현할 경우 루트 노드의 인덱스를 1로 설정하고, 노드 i의 왼쪽 자식은 `i*2`, 오른쪽 자식은 `i*2+1`이 됩니다.

트리 배열의 크기는 다음과 같이 구합니다:

```python
from math import ceil, log

n = len(nums)
tree = [0] * (2 ** (ceil(log(n, 2)) + 1))
```

---

## 1. 트리 생성 (Top-Down)

재귀를 이용해 루트 노드부터 아래로 내려가며 트리를 구성합니다.

```python
def segment(left, right, i=1):
    # 리프 노드에 도달하면 배열 값 저장
    if left == right:
        tree[i] = nums[left]
        return tree[i]

    mid = (left + right) // 2
    # 왼쪽, 오른쪽 자식 노드의 합을 현재 노드에 저장
    tree[i] = segment(left, mid, i*2) + segment(mid+1, right, i*2+1)
    return tree[i]

segment(0, n-1)
```

---

## 2. 구간 합 탐색

찾고자 하는 구간 `[left, right]`에 대해 재귀적으로 탐색합니다.

```python
def search(start, end, left, right, i=1):
    # 탐색 범위가 구간을 완전히 벗어난 경우
    if end < left or start > right:
        return 0

    # 탐색 범위가 구간에 완전히 포함된 경우
    if left <= start and end <= right:
        return tree[i]

    # 구간을 절반으로 나눠 재귀 탐색
    mid = (start + end) // 2
    return search(start, mid, left, right, i*2) + search(mid+1, end, left, right, i*2+1)
```

예시: `nums[2:5]` = `[8, 4, 7]`의 합을 구할 때, 8+4+7을 일일이 더하는 대신 트리에 저장된 12(=8+4)와 7만 찾아 더해 19를 반환합니다.

```python
print(search(0, n-1, 2, 4))  # 19
```

---

## 3. 값 업데이트

배열의 특정 인덱스 값이 바뀌면 해당 값과 연관된 트리 노드들을 모두 갱신해야 합니다. 변경된 값과 기존 값의 **차이(diff)** 를 루트부터 아래로 전파하는 방식을 사용합니다.

```python
def update(start, end, idx, diff, i=1):
    # 업데이트 인덱스가 구간을 벗어나면 종료
    if start > idx or idx > end:
        return

    tree[i] += diff

    if start != end:
        mid = (start + end) // 2
        update(start, mid, idx, diff, i*2)
        update(mid+1, end, idx, diff, i*2+1)
```

예시: `nums[3]`을 4에서 1로 변경할 경우:

```python
update(0, n-1, 3, 1 - nums[3])  # diff = 1 - 4 = -3
nums[3] = 1
```

---

## 4. 구간 곱 세그먼트 트리

구간 곱의 경우 업데이트 시 `변경값 / 기존값`을 곱하는 방식은 기존 값이 0일 때 ZeroDivision 오류가 발생합니다. 이를 해결하려면 리프 노드의 위치를 미리 저장해두고, **Bottom-Up 방식**으로 업데이트하는 것이 더 직관적입니다.

```python
location = [0] * n

def segment_mul(left, right, i=1):
    if left == right:
        tree[i] = nums[left]
        location[left] = i  # 리프 노드 위치 저장
        return tree[i]
    mid = (left + right) // 2
    tree[i] = segment_mul(left, mid, i*2) * segment_mul(mid+1, right, i*2+1)
    return tree[i]
```

업데이트 시 리프 노드에서 루트 방향으로 올라가며 갱신합니다:

```python
# nums[3]을 1로 변경
idx = location[3]
tree[idx] = 1
nums[3] = 1

while idx > 1:
    idx //= 2
    tree[idx] = tree[idx*2] * tree[idx*2 + 1]
```

---

## 전체 코드 (구간 합)

```python
from math import ceil, log

nums = [3, 2, 8, 4, 7, 5, 6]
n = len(nums)
tree = [0] * (2 ** (ceil(log(n, 2)) + 1))

def segment(left, right, i=1):
    if left == right:
        tree[i] = nums[left]
        return tree[i]
    mid = (left + right) // 2
    tree[i] = segment(left, mid, i*2) + segment(mid+1, right, i*2+1)
    return tree[i]

def search(start, end, left, right, i=1):
    if end < left or start > right:
        return 0
    if left <= start and end <= right:
        return tree[i]
    mid = (start + end) // 2
    return search(start, mid, left, right, i*2) + search(mid+1, end, left, right, i*2+1)

def update(start, end, idx, diff, i=1):
    if start > idx or idx > end:
        return
    tree[i] += diff
    if start != end:
        mid = (start + end) // 2
        update(start, mid, idx, diff, i*2)
        update(mid+1, end, idx, diff, i*2+1)

segment(0, n-1)
print(search(0, n-1, 2, 4))   # 19
update(0, n-1, 3, 1 - nums[3])
nums[3] = 1
print(search(0, n-1, 0, 6))   # 32
```

---

## 시간 복잡도 정리

| 연산 | 시간 복잡도 |
|------|------------|
| 트리 생성 | O(n) |
| 구간 탐색 | O(log n) |
| 값 업데이트 | O(log n) |

---

## 관련 문제

- [BOJ 2042 - 구간 합 구하기](https://www.acmicpc.net/problem/2042)
- [BOJ 11505 - 구간 곱 구하기](https://www.acmicpc.net/problem/11505)

Ref: [[Python] 세그먼트 트리 (Segment Tree)](https://velog.io/@ashooozzz/Python-%EC%84%B8%EA%B7%B8%EB%A8%BC%ED%8A%B8-%ED%8A%B8%EB%A6%AC-Segment-Tree)