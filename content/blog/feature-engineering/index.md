---
title: "Feature Engineering"
date: "2026-08-01"
category: ["Python", "DataAnalysis"]
description: "Feature Engineering의 핵심 개념과 실전 접근법 정리. 통계 테크닉이 아닌 도메인 가설에서 출발해 변수를 설계하는 방법, 고장 유형(TWF·HDF·PWF·OSF)별 물리적 상황을 변수로 표현하는 과정, 파생변수 효과 검증, 변수 선별 기준까지 산업용 예측 정비(Predictive Maintenance) 사례를 중심으로 정리"
---

# Feature Engineering — 도메인 가설 기반 변수 설계와 예측 정비 분석

---

## 0. Feature Engineering이란?

> 원본 데이터를 모델이 이해하고 처리할 수 있도록  
> **유의미한 변수를 선별·변환·생성**하는 과정

Feature Engineering은 크게 두 가지 접근 방식으로 나뉜다.

| 접근 방식 | 설명 | 한계 |
|---|---|---|
| **통계·테크닉 기반** | 상관계수, PCA, 중요도 등으로 자동 선별 | "왜 이 변수인가"를 설명하기 어려움 |
| **도메인 가설 기반** | 현상의 물리적 원인을 먼저 추론하고 변수로 표현 | 설계자의 도메인 이해가 필요 |

**왜 도메인 기반 접근이 중요한가?**

```
상관계수가 높다고 해서 원인이 되지는 않는다.
도메인을 모르면 모델이 맞아도 현업을 설득하지 못한다.
가설 → 변수 → 검증의 반복이 Feature Engineering의 실체다.
```

---

## 1. Feature Engineering 전체 흐름

```
① 문제 이해
   └─ 어떤 현상을 예측/분류할 것인가?
   └─ 이 현상이 왜 발생하는지 도메인 지식 수집

② 데이터 탐색 (원본 변수)
   └─ 변수 분포 확인
   └─ 타겟(Target)과 각 변수의 관계 탐색
   └─ 단일 변수로 타겟이 얼마나 구분되는가?

③ 가설 수립 ← 핵심 단계
   └─ "어떤 상태일 때 이 현상이 발생하는가?"
   └─ 변수·수식보다 "상황"을 먼저 언어로 표현

④ 가설을 변수로 변환
   └─ 차이가 핵심  → 빼기 (A - B)
   └─ 함께 커질 때 의미 → 곱하기 (A × B)
   └─ 무엇에 대한 무엇 → 나누기 (A / B)

⑤ 파생변수 검증
   └─ 새 변수가 원본보다 타겟을 더 잘 구분하는가?
   └─ 도메인 관점에서 해석 가능한가?

⑥ 변수 정리
   └─ 잘 통한 가설 / 통하지 않은 가설 모두 기록
   └─ "왜 통하지 않았는가"도 중요한 발견
```

---

## 2. 예측 정비 (Predictive Maintenance) 개요

### 2-1. 문제 정의

산업용 가공 기계(Milling Machine)의 운전 기록을 분석해 두 가지를 예측한다.

1. **이번 가공에서 기계가 고장날까, 정상일까?** (이진 분류)
2. **고장이라면 어떤 유형의 고장인가?** (다중 분류)

### 2-2. 밀링 머신의 물리적 동작

밀링 머신은 가공 중 다음 4가지 상태가 동시에 발생한다.

```
회전한다  → 공구가 빠르게 회전 (rpm)
힘이 든다 → 단단한 금속을 깎는 비트는 힘 (Torque, Nm)
열이 난다 → 마찰로 인한 발열 (Air Temp, Process Temp)
닳는다    → 사용할수록 무뎌지는 공구 (Tool Wear, min)
```

### 2-3. 주요 변수 설명

| 변수 | 단위 | 도메인 해석 |
|---|---|---|
| **Type** | L/M/H | 제품 등급 (Low/Medium/High) |
| **Air Temperature** | K (켈빈) | 작업장 주변 공기 온도 |
| **Process Temperature** | K (켈빈) | 실제 가공 부위 온도 (마찰열로 항상 공기 온도보다 높음) |
| **Rotational Speed** | rpm | 공구의 분당 회전수 |
| **Torque** | Nm | 금속을 깎을 때의 비트는 힘 |
| **Tool Wear** | min | 해당 공구의 누적 사용 시간 |
| **Machine Failure** | 0/1 | 타겟: 정상(0), 고장(1) |

### 2-4. 고장 유형 5가지

| 고장 유형 | 약어 | 발생 상황 |
|---|---|---|
| **공구 마모 고장** | TWF | 공구를 오래 사용해 무뎌져 제 역할을 못하게 됨 |
| **방열 고장** | HDF | 가공 중 발생한 열이 제때 식지 못해 과열로 기계가 멈춤 |
| **전력 고장** | PWF | 가공 출력이 정상 범위를 벗어남 (너무 약하거나 너무 강함) |
| **과부하 고장** | OSF | 닳은 공구에 과도한 힘이 더해져 한계를 초과 |
| **무작위 고장** | RNF | 뚜렷한 원인 없이 우연히 발생 |

---

## 3. 변수 선별 기준

Feature Engineering의 첫 번째 단계는 어떤 변수를 **쓸지/버릴지** 판단하는 것이다.

```
판단 기준 2가지

✅ 사용: 고장에 영향을 줄 수 있는 기계의 상태 또는 조건을 나타내는 변수
         → Air Temp, Process Temp, Rotational Speed, Torque, Tool Wear, Type

❌ 제외: 고장의 결과를 담고 있는 변수 (정보 누수 / Data Leakage 위험)
         → 고장 유형 컬럼들 (TWF, HDF, PWF, OSF, RNF)
            이 컬럼들은 고장이 났을 때 기록되므로,
            이를 입력 변수로 쓰면 "답을 보고 푸는" 것과 같음
```

```python
import pandas as pd

df = pd.read_csv("ai4i2020.csv")

# 고장 결과 컬럼 제외 (Data Leakage 방지)
drop_cols = ["UDI", "Product ID", "TWF", "HDF", "PWF", "OSF", "RNF"]
feature_cols = [c for c in df.columns if c not in drop_cols + ["Machine failure"]]

X = df[feature_cols]
y = df["Machine failure"]

print(f"사용 변수: {feature_cols}")
print(f"샘플 수: {len(df)}, 고장 비율: {y.mean():.2%}")
```

---

## 4. 원본 변수 탐색

### 4-1. 단일 변수 탐색

타겟(고장/정상)별로 각 변수의 분포를 비교한다.

```python
import matplotlib.pyplot as plt
import seaborn as sns

numeric_features = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]"
]

fig, axes = plt.subplots(2, 3, figsize=(15, 8))
axes = axes.flatten()

for i, col in enumerate(numeric_features):
    for label, color in [(0, "steelblue"), (1, "tomato")]:
        subset = df[df["Machine failure"] == label][col]
        axes[i].hist(subset, bins=40, alpha=0.5, color=color,
                     label="정상" if label == 0 else "고장",
                     density=True)
    axes[i].set_title(col)
    axes[i].legend()

plt.suptitle("변수별 고장/정상 분포 비교", fontsize=14)
plt.tight_layout()
plt.savefig("single_var_dist.png", dpi=150)
plt.show()
```

**탐색 시 확인할 질문:**

```
- 고장과 정상에서 값의 분포가 다른가?
- 어느 쪽이 더 높거나 낮은가?
- 두 그룹이 눈으로 잘 구분되는가, 아니면 겹쳐있는가?
```

### 4-2. 두 변수 조합 탐색

단일 변수보다 두 변수를 함께 볼 때 고장이 더 잘 구분될 수 있다.

```python
from itertools import combinations

# 수치형 변수 두 개씩 조합 스캐터 플롯
pairs = list(combinations(numeric_features, 2))

fig, axes = plt.subplots(4, 5, figsize=(20, 16))
axes = axes.flatten()

for i, (x_col, y_col) in enumerate(pairs[:20]):
    for label, color, alpha in [(0, "steelblue", 0.3), (1, "tomato", 0.7)]:
        mask = df["Machine failure"] == label
        axes[i].scatter(
            df[mask][x_col], df[mask][y_col],
            c=color, alpha=alpha, s=5,
            label="정상" if label == 0 else "고장"
        )
    axes[i].set_xlabel(x_col.split("[")[0].strip(), fontsize=7)
    axes[i].set_ylabel(y_col.split("[")[0].strip(), fontsize=7)
    axes[i].tick_params(labelsize=6)

plt.suptitle("변수 조합별 고장/정상 분포", fontsize=14)
plt.tight_layout()
plt.savefig("pair_scatter.png", dpi=150)
plt.show()
```

---

## 5. 도메인 가설 수립 → 파생변수 생성

### 5-1. 가설 수립 원칙

```
❌ 잘못된 순서: 데이터 → 통계 확인 → 변수 선택
✅ 올바른 순서: 도메인 이해 → 물리적 상황 추론 → 가설 → 변수로 표현 → 데이터 검증
```

> "이 기계는 어떤 상태일 때 고장나는가?"를  
> 먼저 **언어로** 표현한 뒤, 그것을 **수식으로** 바꾼다.

### 5-2. 고장 유형별 가설과 파생변수

#### TWF (공구 마모 고장)

```
물리적 상황:
  공구가 누적 사용 시간이 길어질수록 날이 무뎌진다.
  무뎌진 공구로 계속 가공하면 결국 공구가 제 역할을 못하게 되어 고장 발생.

핵심 상태: 공구의 마모 누적 정도
후보 변수: Tool Wear (공구 사용 시간이 길수록 위험)

가설 → 파생변수:
  특정 마모 임계값을 넘으면 고장 위험 급증
```

```python
# TWF 관련 탐색
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

# 고장/정상별 Tool Wear 분포
for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["Machine failure"] == label]["Tool wear [min]"]
    axes[0].hist(subset, bins=40, alpha=0.5, color=color,
                 label="정상" if label == 0 else "고장", density=True)
axes[0].set_title("Tool Wear 분포 (고장/정상)")
axes[0].set_xlabel("Tool Wear [min]")
axes[0].legend()

# TWF 고장만 따로
for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["TWF"] == label]["Tool wear [min]"]
    axes[1].hist(subset, bins=40, alpha=0.5, color=color,
                 label="정상" if label == 0 else "TWF 고장", density=True)
axes[1].set_title("Tool Wear 분포 (TWF 고장 한정)")
axes[1].set_xlabel("Tool Wear [min]")
axes[1].legend()

plt.tight_layout()
plt.savefig("twf_analysis.png", dpi=150)
plt.show()
```

---

#### HDF (방열 고장)

```
물리적 상황:
  가공 중 마찰로 열이 발생한다.
  이 열이 주변 공기로 충분히 방출되지 않으면 과열로 기계가 멈춘다.
  열 방출이 잘 되려면 "공정 온도"와 "공기 온도"의 차이가 충분히 커야 한다.
  회전 속도가 느리면 냉각 효과도 줄어든다.

핵심 상태: 열이 얼마나 잘 빠져나가는가
후보 변수:
  - Process Temp (가공 부위 온도)
  - Air Temp (주변 공기 온도)
  - Rotational Speed (회전이 느릴수록 냉각 저하)

가설 → 파생변수:
  온도차 = Process Temp - Air Temp
  → 차이가 작으면 열 방출이 부족한 상황
```

```python
# 파생변수 생성: 온도 차이
df["temp_diff"] = df["Process temperature [K]"] - df["Air temperature [K]"]

# 고장 유형별 온도 차이 분포 비교
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

# 전체 고장/정상
for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["Machine failure"] == label]["temp_diff"]
    axes[0].hist(subset, bins=40, alpha=0.5, color=color,
                 label="정상" if label == 0 else "고장", density=True)
axes[0].set_title("온도 차이 분포 (고장/정상 전체)")
axes[0].set_xlabel("Process Temp - Air Temp [K]")
axes[0].legend()

# HDF 고장만
for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["HDF"] == label]["temp_diff"]
    axes[1].hist(subset, bins=40, alpha=0.5, color=color,
                 label="정상" if label == 0 else "HDF 고장", density=True)
axes[1].set_title("온도 차이 분포 (HDF 고장 한정)")
axes[1].set_xlabel("Process Temp - Air Temp [K]")
axes[1].legend()

plt.tight_layout()
plt.savefig("hdf_analysis.png", dpi=150)
plt.show()
```

---

#### PWF (전력 고장)

```
물리적 상황:
  가공에 사용되는 동력(출력)이 정상 범위를 벗어날 때 발생.
  출력이 너무 낮으면 금속을 제대로 깎지 못하고,
  너무 높으면 기계에 무리가 생긴다.

  출력 = 힘(토크) × 속도 (회전수)
  → 두 값이 함께 결정하는 값이므로 둘 중 하나만 보면 놓칠 수 있음

핵심 상태: 가공 출력이 정상 범위 안에 있는가
후보 변수:
  - Torque
  - Rotational Speed

가설 → 파생변수:
  power = Torque × (Rotational Speed × 2π / 60)  [단위: Watt]
  → 물리 공식 기반 실제 출력값
```

```python
import numpy as np

# 파생변수 생성: 실제 동력 (물리 공식)
# Power [W] = Torque [Nm] × Angular Velocity [rad/s]
# Angular Velocity = RPM × 2π / 60
df["power_W"] = (
    df["Torque [Nm]"] *
    (df["Rotational speed [rpm]"] * 2 * np.pi / 60)
)

# 분포 비교
fig, axes = plt.subplots(1, 2, figsize=(12, 4))

for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["Machine failure"] == label]["power_W"]
    axes[0].hist(subset, bins=50, alpha=0.5, color=color,
                 label="정상" if label == 0 else "고장", density=True)
axes[0].set_title("동력(power) 분포 (고장/정상 전체)")
axes[0].set_xlabel("Power [W]")
axes[0].legend()

for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["PWF"] == label]["power_W"]
    axes[1].hist(subset, bins=50, alpha=0.5, color=color,
                 label="정상" if label == 0 else "PWF 고장", density=True)
axes[1].set_title("동력(power) 분포 (PWF 고장 한정)")
axes[1].set_xlabel("Power [W]")
axes[1].legend()

plt.tight_layout()
plt.savefig("pwf_analysis.png", dpi=150)
plt.show()
```

---

#### OSF (과부하 고장)

```
물리적 상황:
  이미 많이 닳아 무뎌진 공구에 강한 힘(토크)이 더해지면
  기계가 감당할 수 있는 한계를 넘어 고장이 발생한다.
  "닳음"과 "힘"이 단독으로 클 때보다
  둘이 동시에 클 때 더 위험하다.

핵심 상태: 공구에 걸리는 누적 부담
후보 변수:
  - Tool Wear (얼마나 닳았는가)
  - Torque (얼마나 센 힘인가)
  - Type (제품 등급별 허용 한계 다름)

가설 → 파생변수:
  strain = Tool Wear × Torque
  → 두 값이 함께 커질 때 과부하 위험이 커진다는 가설
```

```python
# 파생변수 생성: 과부하 지표 (마모 × 토크)
df["strain"] = df["Tool wear [min]"] * df["Torque [Nm]"]

fig, axes = plt.subplots(1, 2, figsize=(12, 4))

for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["Machine failure"] == label]["strain"]
    axes[0].hist(subset, bins=50, alpha=0.5, color=color,
                 label="정상" if label == 0 else "고장", density=True)
axes[0].set_title("Strain 분포 (고장/정상 전체)")
axes[0].set_xlabel("Tool Wear × Torque")
axes[0].legend()

for label, color in [(0, "steelblue"), (1, "tomato")]:
    subset = df[df["OSF"] == label]["strain"]
    axes[1].hist(subset, bins=50, alpha=0.5, color=color,
                 label="정상" if label == 0 else "OSF 고장", density=True)
axes[1].set_title("Strain 분포 (OSF 고장 한정)")
axes[1].set_xlabel("Tool Wear × Torque")
axes[1].legend()

plt.tight_layout()
plt.savefig("osf_analysis.png", dpi=150)
plt.show()
```

---

### 5-3. 파생변수 전체 정리

```python
# 지금까지 만든 파생변수 요약
derived_features = {
    "temp_diff": "Process Temp - Air Temp (열 방출 여유도, HDF 관련)",
    "power_W":   "Torque × Angular Velocity (실제 동력, PWF 관련)",
    "strain":    "Tool Wear × Torque (누적 부담, OSF 관련)",
}

for feat, desc in derived_features.items():
    print(f"{feat:15s}: {desc}")

# 파생변수 포함 데이터셋 확인
all_features = numeric_features + list(derived_features.keys()) + ["Type"]
print(df[all_features].describe())
```

---

## 6. 파생변수 효과 검증

### 6-1. 원본 변수 vs 파생변수 구분력 비교

파생변수가 원본 변수보다 고장을 **더 또렷하게 구분**하는지 확인한다.

```python
from scipy.stats import mannwhitneyu

# 고장/정상 그룹 간 분포 차이를 Mann-Whitney U 검정으로 수치화
compare_vars = {
    "Tool Wear (원본)": "Tool wear [min]",
    "Torque (원본)":    "Torque [Nm]",
    "Strain (파생)":    "strain",
    "Temp Diff (파생)": "temp_diff",
    "Power (파생)":     "power_W",
}

results = []
for name, col in compare_vars.items():
    normal  = df[df["Machine failure"] == 0][col].dropna()
    failure = df[df["Machine failure"] == 1][col].dropna()
    stat, p = mannwhitneyu(normal, failure, alternative="two-sided")
    results.append({"변수": name, "U통계량": stat, "p-value": p})

result_df = pd.DataFrame(results).sort_values("p-value")
print(result_df.to_string(index=False))
# p-value가 작을수록 두 그룹의 분포 차이가 통계적으로 유의미
```

### 6-2. 시각적 효과 비교

```python
fig, axes = plt.subplots(2, 3, figsize=(15, 8))

plot_vars = [
    ("Tool wear [min]",  "Tool Wear (원본)"),
    ("Torque [Nm]",      "Torque (원본)"),
    ("strain",           "Strain = Wear × Torque (파생)"),
    ("temp_diff",        "Temp Diff (파생)"),
    ("power_W",          "Power [W] (파생)"),
]

for ax, (col, title) in zip(axes.flatten(), plot_vars):
    for label, color in [(0, "steelblue"), (1, "tomato")]:
        subset = df[df["Machine failure"] == label][col]
        ax.hist(subset, bins=40, alpha=0.5, color=color,
                label="정상" if label == 0 else "고장", density=True)
    ax.set_title(title)
    ax.legend(fontsize=8)

axes.flatten()[-1].set_visible(False)
plt.suptitle("원본 변수 vs 파생변수: 고장 구분력 비교", fontsize=14)
plt.tight_layout()
plt.savefig("feature_comparison.png", dpi=150)
plt.show()
```

---

## 7. 가설 정리 프레임워크

실습 후 아래 표 형태로 모든 가설과 결과를 정리한다.

```
잘 통하지 않은 가설도 기록하는 것이 중요하다.
"이 발상이 안 통했다"는 사실 자체가 다음 방향을 결정하기 때문이다.
```

| 고장 유형 | 가설 (물리적 상황) | 파생변수 | 효과 | 미부합 시 이유 |
|---|---|---|---|---|
| **TWF** | 마모가 임계값을 넘으면 고장 | Tool Wear 직접 사용 | ✅ / ❌ | |
| **HDF** | 온도차가 작으면 열 방출 부족 | Process Temp - Air Temp | ✅ / ❌ | |
| **PWF** | 출력이 정상 범위를 벗어남 | Torque × RPM (동력) | ✅ / ❌ | |
| **OSF** | 마모+토크가 함께 클 때 과부하 | Tool Wear × Torque | ✅ / ❌ | |

**미부합 시 확인할 4가지 관점:**

```
1. 도메인 추론에서 빠뜨린 변수가 있는가?
2. 가설은 맞는데 변수로 표현하는 방법이 부족했는가?
3. 해당 유형의 표본이 너무 적어 신호가 묻혔는가?
4. 다른 고장 유형과 겹쳐 발생한 복합 원인이 있는가?
```

---

## 8. Feature Engineering 핵심 원칙 요약

```
1. 가설이 먼저, 데이터가 나중
   → 데이터를 열기 전에 "어떤 상황이 문제인가"를 먼저 언어로 정리한다.

2. 수치 하나로 단정 짓지 않는다
   → 상관계수 0.7이 기준이 아니다.
   → "무엇 대비 얼마나 다른가"로 해석한다.

3. 파생변수는 해석 가능해야 한다
   → 모델 성능이 올라도 현업에 설명 못하면 의미 없다.
   → "왜 이 변수가 고장을 나타내는가"를 설명할 수 있어야 한다.

4. 실패한 가설도 자산이다
   → 어떤 가설이 왜 통하지 않았는지 기록한다.
   → 이것이 다음 Feature Engineering의 출발점이 된다.

5. Feature Engineering은 반복이다
   → 가설 → 변수 → 검증 → 업데이트
   → 실제 현업에서는 이 과정이 1~2달 소요된다.
```

---

## 9. 전체 코드 통합

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import mannwhitneyu

# ─────────────────────────────────────
# 1. 데이터 로드 및 변수 선별
# ─────────────────────────────────────
df = pd.read_csv("ai4i2020.csv")

drop_cols = ["UDI", "Product ID", "TWF", "HDF", "PWF", "OSF", "RNF"]
feature_cols = [c for c in df.columns
                if c not in drop_cols + ["Machine failure"]]

# ─────────────────────────────────────
# 2. 파생변수 생성
# ─────────────────────────────────────
# HDF: 열 방출 여유도
df["temp_diff"] = (
    df["Process temperature [K]"] - df["Air temperature [K]"]
)

# PWF: 실제 동력
df["power_W"] = (
    df["Torque [Nm]"] *
    (df["Rotational speed [rpm]"] * 2 * np.pi / 60)
)

# OSF: 누적 부담
df["strain"] = df["Tool wear [min]"] * df["Torque [Nm]"]

all_features = feature_cols + ["temp_diff", "power_W", "strain"]

# ─────────────────────────────────────
# 3. 변수별 고장 구분력 평가
# ─────────────────────────────────────
results = []
for col in all_features:
    if df[col].dtype in ["float64", "int64"]:
        grp0 = df[df["Machine failure"] == 0][col].dropna()
        grp1 = df[df["Machine failure"] == 1][col].dropna()
        stat, p = mannwhitneyu(grp0, grp1, alternative="two-sided")
        results.append({"변수": col, "p-value": round(p, 6)})

result_df = (pd.DataFrame(results)
               .sort_values("p-value")
               .reset_index(drop=True))
print("=== 고장 구분력 순위 (p-value 낮을수록 구분력 높음) ===")
print(result_df.to_string(index=False))
```

---

## 📎 참고 자료

- [AI4I 2020 Predictive Maintenance Dataset (UCI)](https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset)
- [Feature Engineering for Machine Learning (O'Reilly)](https://www.oreilly.com/library/view/feature-engineering-for/9781491953235/)
- [scikit-learn Feature Selection 가이드](https://scikit-learn.org/stable/modules/feature_selection.html)