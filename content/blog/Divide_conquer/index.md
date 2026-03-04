---
title: "분할정복(Divide and Conquer)"
date: "2025-02-25"
category: "Algorithm"
description: "분할정복의 개념과 대표 알고리즘(병합 정렬, 퀵 정렬, 이진 검색 등)을 정리"
---

분할정복(Divide and Conquer)은 복잡한 문제를 더 작은 하위 문제로 나눠 해결하는 알고리즘 설계 패러다임입니다.

## 기본 단계

분할정복은 세 단계로 이루어집니다.

1. **분할(Divide)**: 원래 문제를 더 작은 하위 문제들로 나눕니다.
2. **정복(Conquer)**: 하위 문제들을 재귀적으로 해결합니다.
3. **병합(Combine)**: 하위 문제들의 해결책을 합쳐 원래 문제의 해결책을 만듭니다.

---

## 1. 병합 정렬 (Merge Sort)

배열을 절반으로 나누고, 각각을 재귀적으로 정렬한 다음 병합하는 방식입니다.

```python
def merge_sort(arr):
    if len(arr) <= 1:
        return arr

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])

    return merge(left, right)

def merge(left, right):
    result = []
    i = j = 0

    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1

    result.extend(left[i:])
    result.extend(right[j:])
    return result
```

| 케이스 | 시간 복잡도 |
|--------|------------|
| 최선   | O(n log n) |
| 평균   | O(n log n) |
| 최악   | O(n log n) |
| 공간   | O(n)       |

---

## 2. 퀵 정렬 (Quick Sort)

피벗을 기준으로 배열을 두 부분으로 분할한 뒤 재귀적으로 정렬합니다.

```python
def quick_sort(arr):
    if len(arr) <= 1:
        return arr

    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]

    return quick_sort(left) + middle + quick_sort(right)
```

| 케이스 | 시간 복잡도 |
|--------|------------|
| 최선   | O(n log n) |
| 평균   | O(n log n) |
| 최악   | O(n²) — 이미 정렬된 배열이거나 모든 요소가 같을 때 |

> 병합 정렬과 달리 추가 메모리가 거의 필요 없어 실무에서 자주 사용됩니다.

---

## 3. 이진 검색 (Binary Search)

정렬된 배열에서 중간 값을 기준으로 탐색 범위를 절반씩 줄여나갑니다.

```python
def binary_search(arr, target):
    left, right = 0, len(arr) - 1

    while left <= right:
        mid = (left + right) // 2

        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1

    return -1
```

- 시간 복잡도: **O(log n)**
- 반드시 **정렬된 배열**에서만 사용 가능합니다.

---

## 4. 스트라센 알고리즘 (Strassen's Algorithm)

기존 행렬 곱셈(O(n³))보다 효율적으로, 8번의 곱셈을 7번으로 줄여 시간을 단축합니다.

- 두 행렬을 각각 4개의 부분 행렬로 분할합니다.
- 7개의 중간 행렬 M₁ ~ M₇을 계산합니다.
- 이를 조합해 결과 행렬을 만듭니다.

- 시간 복잡도: **O(n^log₂7) ≈ O(n^2.81)**

---

## 5. 최대 부분 배열 합 (Maximum Subarray Sum)

배열을 절반으로 나눠 왼쪽, 오른쪽, 그리고 중간을 가로지르는 세 경우의 최댓값을 비교합니다.

```python
def max_crossing_sum(arr, low, mid, high):
    left_sum = float('-inf')
    sum_so_far = 0
    for i in range(mid, low - 1, -1):
        sum_so_far += arr[i]
        left_sum = max(left_sum, sum_so_far)

    right_sum = float('-inf')
    sum_so_far = 0
    for i in range(mid + 1, high + 1):
        sum_so_far += arr[i]
        right_sum = max(right_sum, sum_so_far)

    return left_sum + right_sum

def max_subarray_sum(arr, low, high):
    if low == high:
        return arr[low]

    mid = (low + high) // 2
    left_sum = max_subarray_sum(arr, low, mid)
    right_sum = max_subarray_sum(arr, mid + 1, high)
    cross_sum = max_crossing_sum(arr, low, mid, high)

    return max(left_sum, right_sum, cross_sum)
```

- 시간 복잡도: **O(n log n)**
- 참고로 카데인 알고리즘(Kadane's Algorithm)을 사용하면 O(n)으로도 풀 수 있습니다.

---

## 6. 가장 가까운 점 쌍 (Closest Pair of Points)

점들을 x좌표로 정렬한 뒤 절반으로 나눠 각 구역의 최소 거리를 구하고, 경계에 걸친 경우도 탐색합니다.

1. 점들을 x좌표로 정렬합니다.
2. 점 집합을 절반으로 나눕니다.
3. 왼쪽과 오른쪽 각각에서 가장 가까운 점 쌍을 재귀적으로 찾습니다.
4. 두 부분 경계에 걸쳐 있는 가장 가까운 점 쌍을 탐색합니다.
5. 세 경우 중 최소 거리를 반환합니다.

- 시간 복잡도: **O(n log n)**

---

## 시간 복잡도 비교

| 알고리즘 | 시간 복잡도 |
|----------|------------|
| 병합 정렬 | O(n log n) |
| 퀵 정렬 (평균) | O(n log n) |
| 이진 검색 | O(log n) |
| 스트라센 | O(n^2.81) |
| 최대 부분 배열 합 | O(n log n) |
| 가장 가까운 점 쌍 | O(n log n) |

---

## 분할정복 vs 동적 계획법

두 패러다임 모두 문제를 하위 문제로 나눠 해결하지만, 핵심 차이가 있습니다.

- **분할정복**: 하위 문제들이 **독립적**입니다. 중복 계산이 발생해도 그냥 다시 풀어요.
- **동적 계획법**: 하위 문제들이 **중복**됩니다. 한 번 푼 결과를 저장(메모이제이션)해서 재사용합니다.

> 하위 문제가 겹치는지 여부가 두 방법을 선택하는 핵심 기준입니다.

---

## 마스터 정리 (Master Theorem)

분할정복 알고리즘의 시간 복잡도를 분석할 때 사용하는 공식입니다.

**T(n) = aT(n/b) + f(n)**

- `a`: 하위 문제의 수
- `b`: 분할 비율
- `f(n)`: 분할 및 병합에 드는 비용

Ref: Claude AI