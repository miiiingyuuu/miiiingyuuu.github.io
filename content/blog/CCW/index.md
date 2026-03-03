---
title: "CCW(Counter Clock Wise)"
date: "2025-07-26"
category: "Algorithm"
description: "세 점의 방향을 판별하는 CCW 기하 알고리즘의 개념과 외적을 이용한 구현 방법을 정리"
---

CCW(Counter Clock Wise)는 2차원 평면 위의 세 점 A, B, C가 있을 때, 세 점을 이은 방향이 **시계 방향**인지 **반시계 방향**인지, 혹은 **일직선**인지를 판별하는 기하 알고리즘입니다.

## 판별 결과

외적의 결과값에 따라 세 가지로 나뉩니다.

| 결과값 | 방향 |
|--------|------|
| 양수 (+) | 반시계 방향 (CCW) |
| 0 | 일직선 (Collinear) |
| 음수 (-) | 시계 방향 (CW) |

---

## 외적(Cross Product)이란?

CCW를 이해하려면 먼저 외적의 개념이 필요합니다.

외적은 3차원 공간의 두 벡터에 대한 연산으로, 다음과 같은 특징이 있습니다.

- 기호로는 `×`를 사용합니다.
- 두 벡터를 외적하면 **두 벡터에 수직인 새로운 벡터**가 나옵니다. (내적은 스칼라값)
- **교환 법칙이 성립하지 않습니다.** `a × b ≠ b × a` (방향이 반대)
- 두 벡터의 외적의 크기는 두 벡터가 만드는 **평행사변형의 넓이**입니다.

### 오른손 법칙

두 벡터 외적의 방향은 오른손 법칙으로 알 수 있습니다. 오른손으로 첫 번째 벡터에서 두 번째 벡터 방향으로 감아쥐었을 때 엄지가 가리키는 방향이 외적 벡터의 방향이 됩니다.

예를 들어 `u × v`이면 u에서 v 방향으로 손을 감을 때 엄지가 위를 향하고, `v × u`이면 반대로 아래를 향하게 됩니다.

---

## CCW 계산 방법

세 점 A(x₁, y₁), B(x₂, y₂), C(x₃, y₃)가 있을 때, 벡터 AB와 AC를 만들어 외적을 계산합니다.

2차원이므로 z값을 0으로 놓고 외적을 계산하면 z 성분만 남습니다.

```
CCW = (x₂ - x₁)(y₃ - y₁) - (x₃ - x₁)(y₂ - y₁)
```

이 값의 부호로 방향을 판별합니다.

---

## 구현 (C++)

```cpp
#include <iostream>

struct Point {
    int x;
    int y;
};

int CCW(int x1, int y1, int x2, int y2, int x3, int y3) {
    return (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
}

int main() {
    Point P1, P2, P3;

    std::cin >> P1.x >> P1.y;
    std::cin >> P2.x >> P2.y;
    std::cin >> P3.x >> P3.y;

    int result = CCW(P1.x, P1.y, P2.x, P2.y, P3.x, P3.y);

    if (result == 0) {
        std::cout << "직선: " << result << "\n";
    } else if (result > 0) {
        std::cout << "반시계 방향: " << result << "\n";
    } else {
        std::cout << "시계 방향: " << result << "\n";
    }
}
```

## 구현 (Python)

```python
def ccw(x1, y1, x2, y2, x3, y3):
    result = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
    if result > 0:
        return 1   # 반시계 방향
    elif result < 0:
        return -1  # 시계 방향
    else:
        return 0   # 일직선
```

---

## 활용

CCW는 단순히 방향 판별에 그치지 않고, 다양한 기하 문제의 기반이 됩니다.

- **선분 교차 판별**: 두 선분이 서로 교차하는지 확인할 때 CCW를 활용합니다.
- **볼록 껍질(Convex Hull)**: 점 집합의 볼록 껍질을 구하는 Graham Scan 알고리즘에 사용됩니다.
- **다각형 내부 판별**: 점이 다각형 내부에 있는지 확인할 때 활용됩니다.
- **넓이 계산**: 세 점이 이루는 삼각형의 넓이를 `|CCW| / 2`로 구할 수 있습니다.

---

## 주의 사항

좌표값이 클 경우 `int` 범위를 초과할 수 있습니다. 예를 들어 좌표가 최대 10⁶이라면 외적 계산 결과가 10¹²까지 커질 수 있으므로, **`long long`을 사용**하는 것이 안전합니다.

```cpp
long long CCW(long long x1, long long y1, long long x2, long long y2, long long x3, long long y3) {
    return (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
}
```

Ref: [[알고리즘] CCW(Counter Clock Wise)](https://snowfleur.tistory.com/98)