---
title: "모델 개발 및 최적화"
date: "2026-09-06"
category: ["AI", "Machine Learning", "Model Optimization"]
description: "은행 고객 이탈 예측 실습을 통해 Feature Engineering, 데이터 분할, 모델 비교, Hyperparameter 탐색, Early Stopping, 앙상블과 모델 해석까지 정리"
---

# 모델 개발 및 최적화: 데이터 준비부터 CatBoost 앙상블까지

머신러닝 모델을 처음 만들 때는 어떤 알고리즘을 사용할지가 가장 중요해 보인다. Random Forest를 쓸지, XGBoost를 쓸지, 더 복잡한 모델을 사용하면 점수가 올라갈지를 먼저 고민하게 된다.

하지만 모델 개발 및 최적화 과정을 공부하면서 생각이 달라졌다. 실제 성능을 결정하는 것은 모델 이름 하나가 아니라 문제 정의부터 데이터 분할, Feature Engineering, 평가와 운영까지 이어지는 전체 과정이었다.

> 좋은 모델은 Train 점수가 가장 높은 모델이 아니라, 보지 않은 데이터에서도 일관된 성능을 내고 그 결과를 재현하고 설명할 수 있는 모델이다.

이번 글에서는 은행 고객 이탈 예측 실습을 바탕으로 모델을 개발하고 최적화한 과정을 정리한다. 여러 Baseline 모델을 비교하고 CatBoost를 선택한 이유, Randomized Search와 Early Stopping을 적용한 방법, 두 모델을 앙상블해 최종 결과를 만든 과정까지 하나의 흐름으로 살펴본다.

```text
문제 정의
  ↓
데이터 이해와 품질 확인
  ↓
Feature Engineering
  ↓
Train / Validation / Test 분할
  ↓
Baseline 모델 비교
  ↓
Hyperparameter 최적화
  ↓
최종 모델 선정과 Test 평가
  ↓
모델 해석·저장·모니터링
```

이 글은 크게 다음 흐름으로 이어진다.

1. 모델 개발과 최적화의 전체 과정
2. 은행 고객 이탈 데이터의 준비와 Feature Engineering
3. Baseline 모델 비교와 CatBoost 선정
4. Randomized Search, Early Stopping과 앙상블
5. 최종 성능, 모델 해석과 운영 시 고려사항

---

## 1. 모델 개발은 알고리즘 선택보다 넓은 과정이다

모델 개발은 데이터를 모델의 `fit()` 함수에 넣는 작업만을 의미하지 않는다. 실제로는 비즈니스 문제를 예측 문제로 바꾸는 순간부터 개발이 시작된다.

예를 들어 고객 이탈 예측에서는 다음 질문을 먼저 정해야 한다.

- 한 행은 고객 한 명을 의미하는가?
- 이탈은 어떤 조건에서 `1`이 되는가?
- 모델이 예측하는 시점은 언제인가?
- 예측 시점에 실제로 사용할 수 있는 변수는 무엇인가?
- 이탈 고객을 놓치는 비용과 유지 고객에게 불필요한 조치를 하는 비용 중 어느 쪽이 큰가?

이 질문이 정리되지 않으면 높은 성능을 얻어도 실제로 사용할 수 없는 모델이 될 수 있다.

### 개발 단계와 운영 단계

모델의 Lifecycle은 개발과 운영으로 나눠 볼 수 있다.

```text
[개발]
문제 정의 → 데이터 준비 → Feature Engineering → 학습 → 평가 → 해석

[운영]
모델 저장 → 배포 → 신규 예측 → 모니터링 → 재학습 또는 재모델링
```

개발 당시 좋은 점수가 나왔다는 사실만으로 모델이 계속 좋은 상태를 유지하는 것은 아니다. 고객 특성이나 서비스 정책이 달라지면 입력 데이터와 이탈의 관계도 변할 수 있기 때문이다.

따라서 모델 개발은 한 번의 학습으로 끝나는 작업이 아니라 성능을 지속적으로 확인하고 개선하는 순환 과정이다.

---

## 2. 이번 실습의 문제와 조건

실습 주제는 은행 고객의 이탈 여부를 예측하는 이진 분류 문제였다.

| 항목 | 내용 |
|---|---|
| 분석 단위 | 고객 한 명 |
| Target | `Exited` |
| `Exited=1` | 이탈 고객 |
| `Exited=0` | 유지 고객 |
| 전체 데이터 | 2,100건 |
| 평가 기준 | Validation AUC와 Test AUC |

실습에서는 다음 조건을 지켜야 했다.

- 지정된 `bank_churn_train.csv`를 사용한다.
- Target인 `Exited`는 변환하지 않는다.
- 데이터 로딩과 6:2:2 분할 코드는 그대로 사용한다.
- 행을 삭제하거나 중복 데이터를 제거하지 않는다.
- 그 외 Feature Engineering과 모델링 방법은 자유롭게 선택한다.

### 필수 데이터 분할

```python
from sklearn.model_selection import train_test_split

# Train 60% / 나머지 40%
df_train, temp = train_test_split(
    df,
    test_size=0.4,
    random_state=42
)

# Validation 20% / Test 20%
df_valid, df_test = train_test_split(
    temp,
    test_size=0.5,
    random_state=42
)
```

실제 분할 결과는 다음과 같았다.

| 데이터 | 건수 | 이탈률 |
|---|---:|---:|
| 전체 | 2,100 | 21.33% |
| Train | 1,260 | 21.75% |
| Validation | 420 | 25.24% |
| Test | 420 | 16.19% |

행을 삭제하지 않았기 때문에 다음 관계가 유지된다.

```text
1,260 + 420 + 420 = 2,100
```

Validation과 Test의 이탈률에는 차이가 있었다. 데이터 수가 많지 않은 상태에서 무작위 분할했기 때문에 발생할 수 있는 표본 차이다. 이 차이는 두 데이터의 AUC가 완전히 같지 않은 이유 중 하나가 될 수 있다.

---

## 3. Train, Validation, Test의 역할

세 데이터는 단순히 크기만 다른 것이 아니라 역할이 다르다.

| 데이터 | 역할 |
|---|---|
| Train | 모델 Parameter 학습 |
| Validation | 모델, Hyperparameter, 앙상블 가중치 선택 |
| Test | 모든 선택이 끝난 뒤 최종 일반화 성능 확인 |

이번 실습에서는 다음 원칙을 사용했다.

```text
Train으로 모델 학습
→ Validation으로 후보 비교와 설정 선택
→ 최종 선택이 끝난 뒤 Test를 한 번 평가
```

Test 성능을 반복해서 보며 모델을 수정하면 Test가 사실상 Validation 역할을 하게 된다. 이 상태에서 나온 Test 점수는 더 이상 완전히 새로운 데이터에 대한 성능이라고 보기 어렵다.

### Data Leakage와 Train-Test Contamination

모델 최적화에서 높은 점수보다 먼저 확인해야 하는 것이 데이터 누수다.

대표적인 사례는 다음과 같다.

- 전체 데이터의 평균으로 결측값을 대체한 뒤 분할한다.
- 전체 데이터로 Scaling 기준을 학습한다.
- Target을 이용해 만든 값을 Feature로 사용한다.
- Test 점수를 보면서 Hyperparameter를 반복 조정한다.
- 예측 시점에는 알 수 없는 미래 정보를 입력으로 사용한다.

전처리 기준은 Train에서만 학습하고 Validation과 Test에는 같은 기준을 적용해야 한다.

```text
Train      : fit + transform
Validation : transform
Test       : transform
```

이번 실습에서도 연속형 결측값은 Train의 중앙값으로 대체했다.

---

## 4. Feature Engineering

Feature Engineering은 원본 데이터를 모델이 관계를 더 잘 학습할 수 있는 표현으로 만드는 과정이다.

```text
Feature Creation
새로운 변수를 생성

Feature Transformation
기존 변수의 값이나 표현 방식을 변환

Feature Selection
모델에 사용할 변수를 선택
```

### 4.1 식별성 변수 제외

`CustomerId`와 `Surname`은 모델 입력에서 제외했다.

- `CustomerId`는 고객을 구분하는 식별자다.
- `Surname`은 고유값이 많고 개인을 식별하는 성격이 강하다.

이런 변수는 Train 데이터의 고객을 외우는 데 사용될 수 있지만 새로운 고객의 이탈을 설명하는 일반적인 규칙으로 이어지기 어렵다.

변수 열을 제외하는 것은 데이터 행을 제거하는 것과 다르다. 전체 고객 2,100건은 그대로 유지하면서 예측에 적절한 Feature를 선택한 것이다.

### 4.2 날짜를 가입 기간으로 변환

문자열 날짜 자체보다 고객이 얼마나 오랫동안 계좌를 보유했는지가 더 직접적인 의미를 가진다고 판단했다.

```python
base = pd.to_datetime(x["baseDate"], errors="coerce")
opening = pd.to_datetime(x["accountOpeningDate"], errors="coerce")

x["accountDuration_years"] = (
    base - opening
).dt.days / 365.25
```

가입 기간을 만든 후 원본인 `baseDate`와 `accountOpeningDate`는 제외했다.

### 4.3 파생변수 생성

단순한 원본 값뿐 아니라 고객 특성 사이의 관계를 표현하기 위해 총 12개의 파생변수를 만들었다.

| 파생변수 | 생성 의미 |
|---|---|
| `accountDuration_years` | 계좌 가입 기간 |
| `balanceToSalary` | 연봉 대비 잔액 |
| `productsPerTenureYear` | 가입 기간 대비 상품 수 |
| `isZeroBalance` | 잔액이 0인지 여부 |
| `activeProductCount` | 상품 수 × 활동 회원 여부 |
| `AgeSquared` | 연령의 비선형 효과 |
| `AgeProductInteraction` | 연령과 상품 수의 상호작용 |
| `BalancePerProduct` | 상품 하나당 잔액 |
| `CreditAgeRatio` | 연령 대비 신용점수 |
| `BalanceActiveInteraction` | 잔액과 활동 여부의 상호작용 |
| `HasBalanceAndActive` | 잔액이 있는 활동 고객인지 여부 |
| `AgeGroup` | 연령 구간 |

예를 들어 다음과 같이 생성했다.

```python
x["balanceToSalary"] = (
    x["Balance"]
    / x["EstimatedSalary"].replace(0, np.nan)
)

x["activeProductCount"] = (
    x["NumOfProducts"] * x["IsActiveMember"]
)

x["AgeProductInteraction"] = (
    x["Age"] * x["NumOfProducts"]
)
```

비율 변수를 만들 때 분모가 0이면 무한값이 발생할 수 있다. 따라서 분모의 0을 결측값으로 바꾸고 이후 Train 중앙값으로 대체했다.

### 4.4 결측값 처리

원본 데이터에서는 `Geography`와 `EstimatedSalary`에 결측값이 있었다.

- 범주형 결측값: `Unknown`
- 연속형 결측값과 무한값: Train 중앙값
- 행 삭제: 적용하지 않음

```python
for col in cat_cols:
    x[col] = x[col].fillna("Unknown").astype(str)

for col in num_cols:
    train_median = (
        X_train_fe[col]
        .replace([np.inf, -np.inf], np.nan)
        .median()
    )
    x[col] = (
        x[col]
        .replace([np.inf, -np.inf], np.nan)
        .fillna(train_median)
    )
```

Tree 기반 모델을 사용했기 때문에 StandardScaler나 MinMaxScaler는 적용하지 않았다. Tree는 변수의 절대적인 거리보다 특정 값보다 큰지 작은지를 기준으로 분기하기 때문에 Scaling의 필요성이 상대적으로 낮다.

---

## 5. Baseline 모델을 먼저 비교하는 이유

최적화를 시작하기 전에 단순한 기준 모델을 만드는 것이 중요하다.

Baseline은 다음 질문에 답해 준다.

> 복잡한 Feature와 Hyperparameter 탐색이 실제로 성능을 개선했는가?

이번 실습에서는 네 가지 모델을 같은 Validation 데이터에서 비교했다.

| 모델 | Validation AUC |
|---|---:|
| Decision Tree | 0.78278 |
| Random Forest | 0.84272 |
| Extra Trees | 0.85104 |
| CatBoost Baseline | **0.87117** |

Decision Tree는 규칙을 해석하기 쉽지만 한 개의 Tree만 사용하기 때문에 데이터 변화에 민감할 수 있다.

Random Forest와 Extra Trees는 여러 Tree의 결과를 결합해 단일 Tree보다 안정적인 성능을 보였다. 하지만 이번 데이터에서는 CatBoost가 가장 높은 Validation AUC를 기록했다.

따라서 모든 모델을 같은 수준으로 계속 최적화하기보다 CatBoost를 주요 최적화 대상으로 선택했다.

---

## 6. CatBoost를 선택한 이유

CatBoost는 여러 Decision Tree를 순차적으로 결합하는 Gradient Boosting 계열 모델이다.

이번 데이터에는 다음과 같은 범주형 Feature가 있다.

- `Geography`
- `Gender`
- 파생변수 `AgeGroup`

CatBoost는 범주형 변수를 Native 방식으로 처리할 수 있다. 따라서 모든 범주를 직접 One-Hot Encoding하지 않아도 되고, Target Encoding 과정에서 발생할 수 있는 누수를 줄이도록 설계된 Ordered 방식도 활용한다.

이번 실습에서 CatBoost를 선택한 근거는 다음과 같다.

1. Baseline Validation AUC가 가장 높았다.
2. 범주형 변수를 직접 처리할 수 있었다.
3. 비선형 관계와 Feature 간 상호작용을 학습할 수 있었다.
4. 규제와 Early Stopping으로 과적합을 조절할 수 있었다.

다만 CatBoost가 모든 데이터에서 항상 가장 좋은 모델이라는 뜻은 아니다. 이번 분할과 Feature 구성에서 가장 좋은 출발점을 보여 주었기 때문에 선택한 것이다.

### 설치 환경 확인

CatBoost가 설치되지 않은 Jupyter 환경에서는 다음과 같은 오류가 발생할 수 있다.

```text
ModuleNotFoundError: No module named 'catboost'
```

이때는 현재 Notebook Kernel에 설치되도록 `%pip`를 사용하는 것이 안전하다.

```python
%pip install catboost
```

설치가 끝나면 Kernel을 재시작하고 버전을 확인한다.

```python
import catboost
from catboost import CatBoostClassifier

print(catboost.__version__)
```

---

## 7. Parameter와 Hyperparameter

두 용어는 결정되는 방식이 다르다.

| 구분 | 결정 방식 | 예시 |
|---|---|---|
| Parameter | 학습 과정에서 모델이 데이터로부터 계산 | Tree의 분기 구조, Leaf 값 |
| Hyperparameter | 학습 전에 사용자가 설정 | 깊이, 학습률, Tree 개수 |

CatBoost에서 조정한 주요 Hyperparameter는 다음과 같다.

| Hyperparameter | 의미 |
|---|---|
| `depth` | 각 Tree의 최대 깊이 |
| `learning_rate` | Tree 하나가 이전 예측을 보완하는 정도 |
| `l2_leaf_reg` | Leaf 값에 적용하는 L2 규제 |
| `random_strength` | 분기 선택에 부여하는 무작위성 |
| `bagging_temperature` | 표본 추출의 무작위성 |
| `rsm` | Tree마다 사용할 Feature 비율 |
| `iterations` | 최대 Boosting 반복 횟수 |

`depth`가 크면 복잡한 관계를 표현할 수 있지만 과적합 위험도 커진다. `learning_rate`가 작으면 더 세밀하게 학습할 수 있지만 일반적으로 더 많은 반복이 필요하다.

각 Hyperparameter를 따로 보는 것보다 조합으로 이해하는 것이 중요하다.

---

## 8. Grid, Random, Bayesian Search

Hyperparameter 탐색 방법에는 여러 가지가 있다.

| 방법 | 동작 | 장점 | 한계 |
|---|---|---|---|
| Grid Search | 지정한 모든 조합 탐색 | 이해하기 쉽고 누락이 없음 | 조합 수가 빠르게 증가 |
| Random Search | 일부 조합을 무작위 탐색 | 넓은 공간을 효율적으로 확인 | 좋은 영역을 놓칠 수 있음 |
| Bayesian Search | 이전 결과로 다음 후보 선택 | 유망한 영역을 집중 탐색 | 구현과 탐색 공간 설계가 복잡 |

이번 실습에서는 `ParameterSampler`를 사용해 32개의 조합을 추출하는 Randomized Search를 선택했다.

```python
from sklearn.model_selection import ParameterSampler

search_space = {
    "depth": [4, 5, 6, 7],
    "learning_rate": [0.01, 0.015, 0.02, 0.025, 0.03, 0.04],
    "l2_leaf_reg": [3, 5, 8, 10, 15, 20],
    "random_strength": [0.2, 0.5, 1, 2],
    "bagging_temperature": [0, 0.25, 0.5, 1, 2],
    "rsm": [0.7, 0.8, 0.9, 1.0],
}

sampled_params = list(
    ParameterSampler(
        search_space,
        n_iter=32,
        random_state=42
    )
)
```

`random_state=42`를 지정해 같은 32개 조합이 다시 선택되도록 했다.

Random Search는 모든 조합을 확인하지 않는다. 따라서 32회 탐색으로 찾은 결과가 가능한 모든 조합 중 절대적인 최적값이라고 할 수는 없다. 제한된 시간과 계산 비용 안에서 좋은 후보를 찾은 결과로 해석해야 한다.

---

## 9. Early Stopping으로 과적합 줄이기

최대 학습 반복 횟수는 1,600으로 설정했지만 모든 모델이 1,600번 학습하도록 두지는 않았다.

```python
model.fit(
    X_train_fe,
    Y_train,
    cat_features=cat_cols,
    eval_set=(X_valid_fe, Y_valid),
    use_best_model=True,
    early_stopping_rounds=150,
)
```

Validation AUC가 150회 동안 개선되지 않으면 학습을 중단하고 가장 좋았던 시점의 모델을 사용했다.

```text
Train 성능은 계속 개선
Validation 성능은 더 이상 개선되지 않음
        ↓
과적합이 시작될 가능성
        ↓
Early Stopping
```

Early Stopping은 학습 시간을 줄이는 기능이기도 하지만, 필요 이상으로 Train 데이터에 맞춰지는 것을 줄이는 규제 역할도 한다.

이번 탐색에서 Validation AUC가 가장 높았던 두 단일 모델은 다음과 같았다.

| 모델 | Validation AUC | 주요 설정 |
|---|---:|---|
| Run 24 | **0.87649** | depth 5, learning rate 0.015, L2 20 |
| Run 8 | 0.87577 | depth 4, learning rate 0.04, L2 15 |

두 모델은 서로 다른 깊이와 학습률을 사용했다. 이 차이를 활용해 예측을 결합할 수 있다고 판단했다.

---

## 10. Soft Voting 앙상블

Soft Voting은 각 모델이 출력한 Positive Class 확률을 결합한다.

```text
최종 이탈 확률
= w₁ × 모델 A의 이탈 확률
+ w₂ × 모델 B의 이탈 확률
```

두 모델의 확률을 단순히 결합하는 코드는 다음과 같다.

```python
final_valid_prob = (
    0.5 * model_a.predict_proba(X_valid_fe)[:, 1]
    + 0.5 * model_b.predict_proba(X_valid_fe)[:, 1]
)
```

Validation 상위 8개 모델에서 가능한 두 모델 조합을 만들고, 첫 번째 모델의 가중치를 0.20부터 0.80까지 바꾸어 비교했다.

최종적으로 Run 24와 Run 8을 50:50으로 결합했을 때 Validation AUC가 가장 높았다.

| 구성 | Validation AUC |
|---|---:|
| 최고 단일 모델 | 0.87649 |
| 50:50 Soft Voting | **0.87724** |

향상 폭은 약 0.00075로 크지 않다. 따라서 실제 운영에서는 이 정도의 향상이 모델 두 개를 관리하는 복잡성을 감수할 가치가 있는지도 함께 판단해야 한다.

이번 실습에서는 평가 점수를 최대화하는 것이 목적이었기 때문에 앙상블을 최종 모델로 선택했다. 운영 단순성이 더 중요한 환경이라면 Run 24 단일 모델을 선택하는 것도 합리적이다.

---

## 11. 최종 모델과 평가 결과

최종 모델은 서로 다른 Hyperparameter를 가진 CatBoost 두 개의 Soft Voting 앙상블이다.

### Model A: 가중치 50%

```python
CatBoostClassifier(
    iterations=1600,
    depth=5,
    learning_rate=0.015,
    l2_leaf_reg=20,
    random_strength=1,
    bagging_temperature=0.25,
    rsm=0.8,
    bootstrap_type="Bayesian",
    random_seed=42,
)
```

Early Stopping에서 선택된 최적 반복 위치는 591이었다.

### Model B: 가중치 50%

```python
CatBoostClassifier(
    iterations=1600,
    depth=4,
    learning_rate=0.04,
    l2_leaf_reg=15,
    random_strength=0.2,
    bagging_temperature=0,
    rsm=0.9,
    bootstrap_type="Bayesian",
    random_seed=42,
)
```

Early Stopping에서 선택된 최적 반복 위치는 136이었다.

### 최종 AUC

| 데이터 | AUC |
|---|---:|
| Validation | **0.87724** |
| Test | **0.86660** |
| 평균 | **0.87192** |

AUC는 모델이 실제 이탈 고객에게 유지 고객보다 더 높은 예측 점수를 부여할 가능성을 평가한다.

- 0.5에 가까우면 무작위 분류 수준이다.
- 1에 가까울수록 순위 판별력이 좋다.
- 특정 Threshold 하나가 아니라 여러 Threshold에서의 전반적인 성능을 반영한다.

Validation과 Test AUC의 차이는 약 0.01064였다. Test 성능이 조금 낮았지만 차이가 매우 크지는 않았다.

다만 이 결과는 주어진 `random_state=42`의 고정 분할에 대한 결과다. 다른 데이터나 다른 기간에서도 반드시 같은 성능이 나온다는 뜻은 아니다.

---

## 12. Accuracy가 아니라 AUC를 사용한 이유

전체 데이터의 이탈률은 약 21.33%였다. 이탈하지 않은 고객이 더 많기 때문에 모든 고객을 유지로 예측해도 Accuracy가 높아 보일 수 있다.

```text
모두 유지로 예측
→ Accuracy는 높을 수 있음
→ 이탈 고객 Recall은 0
```

AUC는 예측 확률의 순위를 평가하므로 클래스가 불균형한 상황에서 모델 후보의 판별력을 비교하기에 유용하다.

하지만 AUC만으로 운영 정책이 완성되지는 않는다. 실제 이탈 방지 캠페인을 실행하려면 Threshold를 정하고 Precision, Recall, F1 Score와 비용도 확인해야 한다.

예를 들어 다음 두 상황의 비용이 다를 수 있다.

- 실제 이탈 고객을 놓친 경우: False Negative
- 유지 고객에게 불필요한 혜택을 제공한 경우: False Positive

최종 Threshold는 이러한 업무 비용을 반영해 정해야 한다.

---

## 13. Feature Importance 해석

두 CatBoost 모델의 Feature Importance를 앙상블 가중치로 평균했다.

상위 Feature는 다음과 같았다.

| 순위 | Feature | Importance |
|---:|---|---:|
| 1 | `NumOfProducts` | 21.3883 |
| 2 | `Age` | 13.8230 |
| 3 | `AgeSquared` | 8.9319 |
| 4 | `activeProductCount` | 8.5532 |
| 5 | `AgeProductInteraction` | 7.7355 |
| 6 | `IsActiveMember` | 6.1247 |

결과를 보면 상품 수, 연령, 활동 상태와 이들의 상호작용이 중요한 역할을 했다.

`Age`와 `AgeSquared`가 함께 상위에 있다는 것은 연령과 이탈의 관계가 단순한 직선 관계가 아닐 가능성을 보여 준다. `activeProductCount`는 상품 수만 보는 대신 고객의 활동 여부까지 결합한 파생변수가 실제로 모델에 활용됐다는 점을 보여 준다.

### Feature Importance는 인과관계가 아니다

Feature Importance가 높다는 것은 모델이 예측 과정에서 해당 변수를 많이 사용했다는 뜻이다.

```text
높은 Feature Importance
≠ 고객 이탈의 직접적인 원인
```

연령이 중요하다고 해서 연령이 이탈을 직접 발생시킨다고 결론 내릴 수는 없다. 연령과 함께 변화하는 상품 구성이나 이용 패턴이 실제 원인일 수도 있다.

예측의 방향과 개별 고객의 근거를 더 자세히 보려면 SHAP 같은 방법을 추가로 사용할 수 있다.

---

## 14. 모델을 저장할 때 전처리도 함께 저장해야 한다

학습된 모델만 저장하고 Feature Engineering 코드를 따로 관리하면 신규 데이터에서 다른 결과가 나올 수 있다.

신규 고객을 예측할 때도 다음 과정이 동일해야 한다.

- 날짜를 가입 기간으로 변환
- 같은 파생변수 생성
- 결측값 처리
- 동일한 Feature 선택과 순서
- 범주형 변수 처리
- 두 모델의 같은 앙상블 가중치 적용

```text
신규 데이터
→ 동일한 Feature Engineering
→ Model A 확률
→ Model B 확률
→ 50:50 결합
→ 최종 이탈 Score
```

`bank_churn_new.csv`는 Target이 없는 신규 고객 데이터이므로 학습에 사용하지 않고 최종 예측 대상으로만 사용해야 한다.

예측 결과는 다음과 같은 형태로 만들 수 있다.

```python
new_score = (
    0.5 * model_a.predict_proba(X_new_fe)[:, 1]
    + 0.5 * model_b.predict_proba(X_new_fe)[:, 1]
)

result = pd.DataFrame({
    "CustomerId": df_new["CustomerId"],
    "churn_score": new_score,
})
```

실무에서는 Feature Engineering과 모델을 하나의 Pipeline이나 별도 추론 클래스로 묶어 저장하는 것이 안전하다.

---

## 15. 모델 개발 후에는 Drift를 모니터링해야 한다

모델을 배포한 뒤 데이터가 달라지면 성능이 감소할 수 있다.

| Drift | 의미 | 예시 |
|---|---|---|
| Data Drift | 입력 Feature 분포 변화 | 고객 연령·잔액 분포 변화 |
| Prediction Drift | 예측 점수나 Class 분포 변화 | 고위험 고객 비율 급증 |
| Concept Drift | Feature와 Target 관계 변화 | 같은 행동의 이탈 가능성이 정책 변경 후 달라짐 |

Label이 늦게 수집되는 상황에서는 먼저 Data Drift와 Prediction Drift를 확인할 수 있다. 실제 이탈 결과가 확보되면 AUC, Recall, Precision 같은 성능 지표를 다시 계산한다.

Drift가 발견됐다고 무조건 모델을 새로 만드는 것은 아니다.

```text
Threshold 문제
→ Threshold 조정

최신 데이터 부족
→ 데이터 추가 수집

관계는 비슷하지만 분포 변화
→ 재학습 검토

Feature와 Target 관계 자체 변화
→ Feature·알고리즘·문제 정의 재검토
```

재학습은 같은 구조의 모델을 최신 데이터로 다시 학습하는 것이고, 재모델링은 Feature와 알고리즘 또는 문제 정의까지 다시 설계하는 과정이다.

---

## 16. 이번 실습에서 배운 점

### 16.1 가장 복잡한 모델이 항상 정답은 아니다

모델 이름이나 복잡도만 보고 선택하지 않았다. 같은 데이터와 Validation 기준으로 비교했을 때 CatBoost가 가장 좋은 출발점을 보였기 때문에 선택했다.

### 16.2 Feature Engineering은 도메인 관계를 표현하는 과정이다

단순히 열 개수를 늘리는 것이 아니라 가입 기간, 상품 수, 활동 여부, 잔액과 연봉의 관계를 모델이 학습하기 쉬운 형태로 표현했다.

### 16.3 최적화는 Test 점수를 반복해서 올리는 과정이 아니다

모델과 Hyperparameter는 Validation으로 선택하고 Test는 마지막에 확인해야 한다. Test를 반복해서 보면 최종 점수가 낙관적으로 편향될 수 있다.

### 16.4 탐색 횟수를 늘린다고 성능이 반드시 좋아지지는 않는다

좋은 Hyperparameter가 탐색 공간에 포함돼 있어야 하고, 평가 지표와 Validation 분할도 적절해야 한다. Randomized Search는 제한된 계산량에서 좋은 후보를 찾는 방법이지 전역 최적값을 보장하는 방법은 아니다.

### 16.5 작은 성능 향상에도 비용이 있다

앙상블은 Validation AUC를 개선했지만 향상 폭은 작았다. 실제 운영에서는 모델 두 개의 저장, 배포, 추론 시간과 모니터링 비용까지 함께 비교해야 한다.

### 16.6 재현 가능성이 성능만큼 중요하다

다음 조건을 기록해야 같은 결과를 다시 확인할 수 있다.

- 데이터 파일과 Encoding
- 데이터 분할 코드와 `random_state`
- Feature Engineering 순서
- 결측값 대체 기준
- 사용한 라이브러리 버전
- 모델 Hyperparameter
- Early Stopping 조건
- 앙상블 모델과 가중치

---

## 17. 전체 코드 흐름 정리

전체 과정은 다음 구조로 정리할 수 있다.

```python
# 1. 데이터 로딩
df = pd.read_csv(
    "bank_churn_train.csv",
    encoding="cp949"
)

# 2. 필수 6:2:2 분할
df_train, temp = train_test_split(
    df,
    test_size=0.4,
    random_state=42
)
df_valid, df_test = train_test_split(
    temp,
    test_size=0.5,
    random_state=42
)

# 3. Feature와 Target 분리
X_train = df_train.drop("Exited", axis=1)
Y_train = df_train["Exited"]

# 4. Feature Engineering
X_train_fe = make_features(X_train)
X_valid_fe = make_features(X_valid)
X_test_fe = make_features(X_test)

# 5. Train 기준 결측값 처리
# 6. Baseline 모델 비교
# 7. Validation AUC 기반 Randomized Search
# 8. Validation 기반 앙상블 조합 선택
# 9. Test 최종 평가
# 10. Feature Importance 해석
```

모델 개발에서 중요한 것은 각 코드 조각보다 순서다. 분할 전에 전체 데이터의 정보를 학습하거나, Test를 보며 모델을 선택하면 이후 단계의 점수를 신뢰하기 어려워진다.

---

## 18. 마무리

이번 실습의 최종 결과는 다음과 같다.

```text
최종 모델
CatBoost 2-model Soft Voting Ensemble

Validation AUC : 0.87724
Test AUC       : 0.86660
Average AUC    : 0.87192
```

결과 수치도 중요하지만 더 크게 배운 것은 모델을 선택하는 과정이었다.

```text
조건을 지키며 데이터를 분할하고
→ 누수 없이 Feature를 만들고
→ Baseline을 기준으로 후보를 좁히고
→ Validation으로 Hyperparameter를 선택하고
→ Test로 최종 일반화 성능을 확인하고
→ 모델의 판단 근거와 운영 이후의 변화를 살펴본다.
```

좋은 모델 개발은 한 번의 높은 점수를 찾는 일이 아니다. 같은 과정을 다시 실행할 수 있고, 왜 이 모델을 선택했는지 설명할 수 있으며, 새로운 데이터에서도 성능을 추적할 수 있도록 만드는 일이다.

다음 단계에서는 신규 고객 데이터에 이 모델을 적용하고, 예측 Score를 실제 고객 유지 전략과 연결하는 방법을 더 살펴볼 수 있다.
