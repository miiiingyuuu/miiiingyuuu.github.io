---
title: "모델 개발 및 최적화 이해하기"
date: "2026-09-06"
category: ["AI", "Machine Learning", "Model Optimization"]
description: "모델 개발과 최적화가 담당하는 역할을 데이터 설계, Feature Engineering, 검증, Hyperparameter 탐색, 해석과 운영 관점에서 정리"
---

# 모델 개발 및 최적화 이해하기: 성능과 일반화, 운영을 연결하는 과정

머신러닝의 기본 원리를 학습한 다음에는 자연스럽게 “어떤 모델이 가장 좋은가?”라는 질문으로 넘어간다. 하지만 모델 개발 및 최적화의 목적은 단순히 가장 높은 점수를 찾는 것이 아니다.

모델 개발은 현실의 문제를 데이터와 예측 문제로 정의하고, 학습 가능한 형태로 구현해 새로운 데이터에 적용할 수 있게 만드는 과정이다. 모델 최적화는 이 과정에서 발생하는 여러 선택을 검증 데이터와 평가 기준에 따라 조정하는 작업이다.

> 모델 개발은 예측 시스템을 설계하는 과정이고, 모델 최적화는 그 시스템의 일반화 성능과 효율을 개선하는 과정이다.

따라서 모델의 성능만큼 다음 요소가 중요하다.

- 입력 데이터가 실제 예측 시점에 사용 가능한가?
- 평가 결과가 데이터 누수 없이 측정됐는가?
- 모델을 선택한 기준을 설명할 수 있는가?
- 같은 코드로 결과를 재현할 수 있는가?
- 배포 이후 데이터 변화와 성능 저하를 확인할 수 있는가?

이번 글에서는 모델 개발과 최적화가 어떤 역할을 담당하며, Feature Engineering, 데이터 분할, Hyperparameter 탐색, Early Stopping, Ensemble, 모델 해석과 Drift 모니터링이 각각 어떤 문제를 해결하는지 기술적인 관점에서 정리한다.

```text
현실의 문제
  ↓ 문제 정의
예측 가능한 데이터 문제
  ↓ 데이터·Feature 설계
학습 가능한 표현
  ↓ 모델 학습·검증
일반화 가능한 모델
  ↓ 저장·배포·모니터링
운영 가능한 예측 시스템
```

---

## 1. 모델 개발은 무엇을 만드는 과정인가

모델 개발의 결과물은 학습된 알고리즘 하나가 아니다. 데이터 입력부터 예측 결과가 만들어지는 전체 구조가 결과물이다.

```text
Raw Data
→ 데이터 검증
→ 전처리
→ Feature Engineering
→ 학습된 모델
→ 예측 확률
→ Threshold 또는 업무 규칙
→ 최종 의사결정
```

예를 들어 고객 이탈 예측 모델은 고객에게 `0` 또는 `1`을 부여하는 데서 끝나지 않는다. 고객별 이탈 확률을 계산하고, 어느 점수 이상을 관리 대상으로 정할지 결정하며, 실제 유지 활동으로 연결할 수 있어야 한다.

모델 개발은 크게 다음 역할을 수행한다.

| 역할 | 핵심 질문 |
| --- | --- |
| 문제 정의 | 무엇을 언제 예측할 것인가? |
| 데이터 설계 | 예측 시점에 사용할 수 있는 정보인가? |
| 표현 설계 | 모델이 관계를 학습하기 좋은 형태인가? |
| 모델링 | 데이터의 패턴을 어떤 구조로 학습할 것인가? |
| 평가 | 새로운 데이터에서도 성능을 유지하는가? |
| 해석 | 어떤 정보가 예측에 영향을 주었는가? |
| 운영 | 같은 전처리와 예측 과정을 반복할 수 있는가? |

이 중 하나라도 잘못 설계되면 높은 Test 점수만으로 모델의 품질을 보장할 수 없다.

---

## 2. 모델 최적화의 의미

모델 최적화는 모델의 Parameter를 직접 계산하는 작업과 다르다.

| 구분 | 결정 방식 | 예시 |
| --- | --- | --- |
| Parameter | 학습 과정에서 데이터로부터 계산 | 선형모델의 Weight, Tree의 분기와 Leaf 값 |
| Hyperparameter | 학습 전에 설정 | Tree 깊이, 학습률, Tree 개수 |

하나의 Hyperparameter 조합이 주어지면 모델은 Train 데이터에서 Parameter를 학습한다. 모델 최적화는 여러 설정을 비교해 일반화 성능이 좋은 Hyperparameter와 모델 구조를 선택한다.

```text
Hyperparameter 설정
  ↓
Train에서 Parameter 학습
  ↓
Validation에서 성능 평가
  ↓
다음 설정 선택
```

최적화가 해결하려는 문제는 크게 세 가지다.

1. Underfitting을 줄여 필요한 패턴을 충분히 학습한다.
2. Overfitting을 줄여 새로운 데이터에 대한 성능을 유지한다.
3. 계산 시간, 메모리, 예측 지연과 같은 운영 비용을 조절한다.

따라서 최적의 모델은 가장 복잡한 모델이 아니라 성능과 복잡도 사이의 균형이 좋은 모델이다.

---

## 3. 문제 정의가 모델의 방향을 결정한다

같은 데이터도 Target과 예측 시점에 따라 다른 문제가 된다.

고객 이탈 문제라면 다음 항목을 먼저 정의해야 한다.

- 분석 단위: 고객, 계좌, 거래 중 무엇인가?
- Target: 어떤 조건을 이탈로 볼 것인가?
- 관찰 기간: Feature를 계산할 기간은 어디까지인가?
- 예측 기간: 언제까지 발생할 이탈을 예측하는가?
- 활용 방식: 상담, 쿠폰, 위험 관리 중 어디에 사용하는가?

예측 시점이 명확해야 사용할 수 있는 Feature도 결정된다.

```text
관찰 종료 시점 T
├─ T 이전에 확인 가능한 정보 → Feature 사용 가능
└─ T 이후에 발생한 정보       → 미래 정보이므로 사용 불가
```

모델이 학습 중에는 좋은 성능을 내지만 운영 환경에서 사용할 수 없는 가장 흔한 이유 중 하나가 예측 시점 설계의 오류다.

---

## 4. 데이터 분할은 일반화 성능을 측정하는 장치다

모델이 이미 본 데이터를 잘 맞히는 것은 충분하지 않다. 모델 개발의 목적은 보지 않은 데이터에서도 패턴을 적용하는 것이다.

| 데이터 | 역할 |
| --- | --- |
| Train | 모델 Parameter 학습 |
| Validation | 모델과 Hyperparameter 선택 |
| Test | 모든 선택이 끝난 뒤 최종 평가 |

```text
Train      → 학습
Validation → 선택과 조정
Test       → 최종 일반화 성능 확인
```

Test를 반복해서 확인하며 모델을 수정하면 Test가 Validation으로 사용된 것과 같아진다. 그 결과 Test 성능이 실제보다 낙관적으로 보일 수 있다.

### Hold-out Validation과 Cross Validation

Hold-out 방식은 데이터를 한 번 분할한다. 실행이 빠르고 이해하기 쉽지만 어떤 표본이 Validation에 포함됐는지에 따라 결과가 달라질 수 있다.

K-Fold Cross Validation은 Train을 K개 Fold로 나누어 각 Fold를 한 번씩 검증에 사용한다.

```text
Fold 1: Validation | Train | Train | Train
Fold 2: Train | Validation | Train | Train
Fold 3: Train | Train | Validation | Train
Fold 4: Train | Train | Train | Validation
```

분류 문제에서는 `StratifiedKFold`를 사용해 각 Fold의 클래스 비율을 비슷하게 유지할 수 있다.

Cross Validation은 분할에 따른 우연을 줄이는 데 도움이 되지만 계산 비용이 K배 가까이 증가한다. 데이터 크기와 모델 학습 시간을 고려해 선택해야 한다.

---

## 5. Data Leakage는 성능을 실제보다 좋게 만든다

Data Leakage는 학습이나 모델 선택 과정에 예측 시점에 사용할 수 없는 정보가 포함되는 문제다.

### Target Leakage

Target 자체 또는 Target을 직접적으로 반영한 변수가 입력에 포함되는 경우다.

```text
Exited를 이용해 만든 고객 상태
→ Feature에 포함
→ 모델이 정답을 간접적으로 확인
```

### Train-Test Contamination

Validation이나 Test의 통계 정보가 Train 전처리에 들어가는 경우다.

```python
# 잘못된 순서
X_scaled = scaler.fit_transform(X_all)
X_train, X_test = train_test_split(X_scaled)
```

올바른 순서는 Train에서만 전처리 기준을 학습하는 것이다.

```python
scaler.fit(X_train)

X_train_scaled = scaler.transform(X_train)
X_valid_scaled = scaler.transform(X_valid)
X_test_scaled = scaler.transform(X_test)
```

결측값 대체, Scaling, Encoding, Feature Selection과 Sampling도 같은 원칙을 따른다.

```text
Train      : fit + transform
Validation : transform
Test       : transform
```

데이터 누수는 코드 오류를 발생시키지 않는다. 오히려 성능이 비정상적으로 좋아 보여 발견하기 어렵다는 점이 더 위험하다.

---

## 6. Feature Engineering은 데이터의 표현을 설계한다

모델은 현실의 의미를 직접 이해하지 않는다. 입력된 숫자와 범주 사이의 통계적 관계를 학습한다. Feature Engineering은 현실의 관계를 모델이 학습하기 좋은 표현으로 변환하는 과정이다.

### Feature Creation

기존 변수의 관계를 새로운 변수로 표현한다.

```python
df["baseDate"] = pd.to_datetime(df["baseDate"], errors="coerce")
df["accountOpeningDate"] = pd.to_datetime(
    df["accountOpeningDate"],
    errors="coerce"
)

df["accountDuration_years"] = (
    df["baseDate"] - df["accountOpeningDate"]
).dt.days / 365.25

df["balanceToSalary"] = (
    df["Balance"] / df["EstimatedSalary"]
)

df["activeProductCount"] = (
    df["NumOfProducts"] * df["IsActiveMember"]
)
```

원본 변수만으로도 Tree 모델은 상호작용을 학습할 수 있다. 하지만 의미 있는 비율이나 상태를 명시적으로 만들면 제한된 데이터에서 관계를 더 쉽게 찾을 수 있다.

### Feature Transformation

변수의 값이나 표현 방식을 바꾼다.

- 결측값 대체
- 로그 변환
- Standardization과 Normalization
- 범주형 Encoding
- 날짜를 기간·요일·월 등으로 변환

모델 종류에 따라 필요한 변환이 다르다.

| 모델 | Scaling 필요성 | 범주형 처리 |
| --- | --- | --- |
| Logistic Regression | 일반적으로 중요 | Encoding 필요 |
| KNN·K-Means | 매우 중요 | 수치 표현 필요 |
| Decision Tree·Random Forest | 상대적으로 낮음 | 구현에 따라 Encoding 필요 |
| CatBoost | 상대적으로 낮음 | Native Categorical 지원 |
| Neural Network | 일반적으로 중요 | 수치 표현 필요 |

### Feature Selection

예측에 사용할 변수를 선택한다.

- 식별자처럼 일반화가 어려운 변수 제외
- 미래 정보나 Target Leakage 변수 제외
- 상수 또는 정보량이 매우 낮은 변수 제외
- 상관관계와 다중공선성 검토
- Feature Importance나 규제 기반 선택

Feature를 많이 사용한다고 항상 성능이 좋아지는 것은 아니다. 불필요한 변수는 Noise와 계산 비용을 늘리고 Overfitting 가능성을 높일 수 있다.

---

## 7. 결측값 처리는 데이터 손실과 편향을 조절한다

결측값이 있는 행을 모두 삭제하면 구현은 간단하지만 데이터가 줄어들고 특정 집단이 더 많이 제거될 수 있다.

대표적인 대체 방법은 다음과 같다.

| 데이터 유형 | 처리 예시 |
| --- | --- |
| 연속형 | 평균, 중앙값, 모델 기반 대체 |
| 범주형 | 최빈값, `Unknown` 범주 |
| 시계열 | 이전 값, 보간, 계절 패턴 기반 대체 |

중앙값은 극단값의 영향을 평균보다 적게 받는다. 분포가 치우친 잔액이나 연봉 같은 변수에 사용할 수 있다.

중요한 원칙은 대체값을 Train에서 계산하는 것이다.

```python
train_median = X_train["EstimatedSalary"].median()

X_train["EstimatedSalary"] = X_train["EstimatedSalary"].fillna(train_median)
X_valid["EstimatedSalary"] = X_valid["EstimatedSalary"].fillna(train_median)
X_test["EstimatedSalary"] = X_test["EstimatedSalary"].fillna(train_median)
```

결측 여부 자체가 의미를 가질 수 있다면 `is_missing`과 같은 Indicator Feature를 함께 사용할 수도 있다.

---

## 8. Baseline은 개선 여부를 판단하는 기준선이다

Baseline의 역할은 가장 좋은 성능을 내는 것이 아니다. 이후의 복잡한 시도가 실제로 의미 있는 개선을 만들었는지 판단할 기준을 제공하는 것이다.

분류 문제에서는 다음과 같은 Baseline을 사용할 수 있다.

- 다수 클래스로만 예측하는 Naive Model
- Logistic Regression
- 깊이를 제한한 Decision Tree
- 기본 설정의 Random Forest

서로 다른 모델 계열을 먼저 비교하면 데이터의 특성과 잘 맞는 구조를 확인할 수 있다.

은행 고객 이탈 데이터의 한 비교 예시는 다음과 같다.

| 모델 | Validation AUC |
| --- | ---: |
| Decision Tree | 0.78278 |
| Random Forest | 0.84272 |
| Extra Trees | 0.85104 |
| CatBoost | **0.87117** |

이 결과의 의미는 CatBoost가 모든 상황에서 가장 좋은 모델이라는 것이 아니다. 동일한 Feature와 Validation 기준에서 CatBoost가 다음 최적화 단계로 진행할 가능성이 가장 높았다는 뜻이다.

```text
Baseline 비교
→ 유망한 모델 계열 선택
→ 선택한 계열에 계산 자원 집중
```

---

## 9. 모델 계열마다 해결하는 방식이 다르다

### Decision Tree

Feature에 대한 조건을 반복해 데이터를 나눈다.

```text
Age <= 42?
├─ Yes → NumOfProducts <= 1?
└─ No  → IsActiveMember == 0?
```

규칙을 설명하기 쉽지만 깊이가 커지면 Train 데이터의 작은 변화까지 학습해 분산이 커질 수 있다.

### Random Forest와 Extra Trees

여러 Tree의 예측을 평균해 단일 Tree의 분산을 줄인다.

- Random Forest: Bootstrap 표본과 무작위 Feature 사용
- Extra Trees: 분기 기준에도 더 많은 무작위성 적용

Tree들이 서로 다른 오류를 만들수록 평균 과정에서 일부 오류가 상쇄될 수 있다.

### Gradient Boosting

이전 모델이 만든 오차를 다음 Tree가 보완하도록 순차적으로 학습한다.

```text
초기 예측
→ 오차 학습 Tree 1
→ 남은 오차 학습 Tree 2
→ 남은 오차 학습 Tree 3
→ 최종 합산 예측
```

XGBoost, LightGBM, CatBoost가 대표적인 Boosting 모델이다. 강한 예측력을 가질 수 있지만 학습률, 깊이, 반복 횟수에 따라 Overfitting이 발생할 수 있다.

### CatBoost

CatBoost는 범주형 Feature를 처리할 수 있는 Boosting 모델이다. 고유값이 있는 범주를 단순한 정수 순서로 오해하지 않도록 처리하며, Ordered 방식으로 Target 정보가 Encoding에 과도하게 섞이는 문제를 줄인다.

범주형 변수가 포함된 정형 데이터에서 유용하지만, 라이브러리 의존성과 모델 크기, 추론 비용도 함께 고려해야 한다.

---

## 10. 분류 평가 지표는 서로 다른 오류를 본다

Confusion Matrix는 실제값과 예측값을 네 가지로 나눈다.

| | 실제 Positive | 실제 Negative |
| --- | ---: | ---: |
| 예측 Positive | TP | FP |
| 예측 Negative | FN | TN |

| 지표 | 의미 |
| --- | --- |
| Accuracy | 전체 예측 중 맞춘 비율 |
| Precision | Positive 예측 중 실제 Positive 비율 |
| Recall | 실제 Positive 중 찾아낸 비율 |
| F1 Score | Precision과 Recall의 조화평균 |
| ROC-AUC | 여러 Threshold에서의 순위 판별력 |

클래스가 불균형하면 Accuracy가 모델을 과대평가할 수 있다. 이탈률이 20%일 때 모든 고객을 유지로 예측해도 Accuracy는 약 80%가 될 수 있지만 실제 이탈 고객은 한 명도 찾지 못한다.

### AUC의 기능적 의미

AUC는 모델이 Positive 관측치에 Negative 관측치보다 높은 Score를 부여하는 능력을 평가한다.

```text
AUC = 0.5 → 무작위 순위 수준
AUC = 1.0 → 모든 Positive를 Negative보다 높은 순위로 배치
```

AUC는 Threshold를 정하기 전 후보 모델의 판별력을 비교하는 데 유용하다. 하지만 실제 서비스를 운영하려면 Threshold를 정하고 Precision, Recall, 비용을 함께 확인해야 한다.

---

## 11. Hyperparameter Search는 탐색 문제다

모델의 Hyperparameter 공간은 여러 차원으로 구성된다.

```text
depth
× learning_rate
× regularization
× sampling ratio
× number of trees
```

각 값의 조합을 모두 확인하면 계산량이 매우 커진다. 따라서 탐색 방법은 제한된 계산 자원을 어디에 사용할지 결정하는 전략이다.

### Grid Search

지정한 모든 조합을 탐색한다.

```text
3개 depth × 4개 learning rate × 5개 규제값
= 60회 학습
```

탐색 공간이 작을 때 명확하지만 변수와 후보값이 늘면 조합 수가 빠르게 증가한다.

### Random Search

전체 공간에서 일부 조합을 무작위로 선택한다. 성능에 영향이 작은 Hyperparameter의 모든 값을 반복하기보다 넓은 범위를 확인할 수 있다.

```python
from sklearn.model_selection import ParameterSampler

params = list(
    ParameterSampler(
        search_space,
        n_iter=32,
        random_state=42
    )
)
```

### Bayesian Search

이전 탐색 결과를 이용해 성능이 좋을 가능성이 높은 다음 지점을 선택한다. 적은 시도로 좋은 영역을 찾을 수 있지만 탐색 모델 자체의 설정과 초기 표본에 영향을 받는다.

| 탐색 방법 | 적합한 상황 |
| --- | --- |
| Grid | 후보가 적고 범위가 명확할 때 |
| Random | 넓은 공간을 제한된 횟수로 탐색할 때 |
| Bayesian | 한 번의 학습 비용이 크고 탐색 효율이 중요할 때 |

어떤 탐색 방법도 좋은 Hyperparameter가 탐색 공간 밖에 있으면 찾을 수 없다. 탐색 알고리즘보다 먼저 합리적인 범위를 설계해야 한다.

---

## 12. Early Stopping은 반복 횟수를 Validation으로 결정한다

Boosting에서 Tree를 계속 추가하면 Train 오차는 감소할 수 있다. 하지만 어느 시점부터 Validation 성능은 정체되거나 나빠질 수 있다.

```text
반복 증가
├─ Train 성능: 계속 개선
└─ Validation 성능: 개선 → 정체 → 하락 가능
```

Early Stopping은 Validation 성능이 일정 횟수 동안 개선되지 않으면 학습을 중단한다.

```python
model.fit(
    X_train,
    y_train,
    eval_set=(X_valid, y_valid),
    use_best_model=True,
    early_stopping_rounds=150,
)
```

Early Stopping의 역할은 다음과 같다.

- 필요 이상의 Tree 생성을 막는다.
- 학습 시간을 줄인다.
- Validation을 기준으로 적절한 반복 횟수를 선택한다.
- 과적합 가능성을 줄이는 규제 역할을 한다.

`patience`가 너무 작으면 일시적인 성능 정체에서 학습이 너무 빨리 끝날 수 있고, 너무 크면 불필요한 학습이 계속될 수 있다.

---

## 13. Ensemble은 모델의 오류를 결합한다

Ensemble은 여러 모델의 예측을 결합해 하나의 예측을 만든다.

### Hard Voting

각 모델이 예측한 Class를 투표한다.

```text
Model A → 1
Model B → 0
Model C → 1
최종    → 1
```

### Soft Voting

각 모델의 확률을 평균하거나 가중평균한다.

```python
final_probability = (
    0.5 * model_a_probability
    + 0.5 * model_b_probability
)
```

Soft Voting은 각 모델의 확신 정도를 활용할 수 있다.

Ensemble이 효과적이려면 모델들이 완전히 같은 오류를 만들지 않아야 한다. 서로 다른 알고리즘, Feature 또는 Hyperparameter를 사용한 모델을 결합하는 이유다.

```text
모델 A의 오류 + 모델 B의 다른 오류
→ 평균 과정에서 일부 오류 상쇄
→ 예측 분산 감소 가능
```

반대로 거의 동일한 모델을 결합하면 성능 향상이 작을 수 있다. 또한 모델 수가 증가하면 저장 공간, 추론 시간, 배포와 모니터링 복잡성도 증가한다.

은행 이탈 데이터에서 서로 다른 CatBoost 설정 두 개를 결합한 기술 예시는 다음과 같다.

| 구성 | Validation AUC |
| --- | ---: |
| 최고 단일 모델 | 0.87649 |
| 50:50 Soft Voting | 0.87724 |

향상 폭이 작기 때문에 평가 점수만 중요하다면 Ensemble을 선택할 수 있지만, 운영 단순성이 중요하다면 단일 모델이 더 적절할 수 있다.

---

## 14. 최적화 결과는 하나의 분할에 종속될 수 있다

특정 Validation에서 가장 좋은 Hyperparameter가 다른 데이터에서도 항상 가장 좋은 것은 아니다.

성능 차이가 매우 작을 때는 다음 항목을 함께 확인해야 한다.

- Cross Validation 평균과 표준편차
- Train과 Validation의 성능 차이
- 다른 `random_state`에서의 안정성
- 모델 크기와 추론 시간
- Hyperparameter 변화에 대한 민감도
- 데이터 기간이 달라졌을 때의 성능

```text
0.8772와 0.8768의 차이
→ 모델의 본질적인 차이일 수도 있음
→ Validation 표본의 우연일 수도 있음
```

소수점 아래의 작은 차이만 보고 복잡한 모델을 선택하면 운영 비용만 증가할 수 있다. 성능과 안정성, 단순성을 함께 평가해야 한다.

---

## 15. 모델 해석은 예측의 근거를 확인한다

모델 해석은 모델이 어떤 Feature를 사용했고 특정 예측을 왜 만들었는지 확인하는 과정이다.

### Feature Importance

Tree 모델의 Feature Importance는 분기 과정에서 각 Feature가 손실이나 불순도를 얼마나 줄였는지 요약한다.

장점은 빠르게 전체 중요도 순위를 확인할 수 있다는 점이다. 하지만 다음 한계가 있다.

- 예측을 높이는 방향과 낮추는 방향이 분리되지 않는다.
- 고유값이 많은 Feature에 편향될 수 있다.
- 상관된 Feature 사이에서 중요도가 나뉠 수 있다.

### SHAP

SHAP은 기준 예측값에서 각 Feature가 최종 예측을 얼마나 높이거나 낮췄는지 설명한다.

```text
최종 예측
= Base Value
+ Feature 1의 SHAP Value
+ Feature 2의 SHAP Value
+ ...
```

| SHAP 결과 | 역할 |
| --- | --- |
| Bar Plot | 전체 Feature 중요도 |
| Beeswarm Plot | Feature 값과 예측 방향 |
| Dependence Plot | 특정 Feature 값의 영향 변화 |
| Waterfall Plot | 개별 관측치의 예측 근거 |

Feature Importance와 SHAP은 모델의 판단을 설명한다. 현실 세계의 인과관계를 증명하지는 않는다.

```text
예측 기여도
≠ 실제 원인
```

---

## 16. Pipeline은 학습과 예측의 일관성을 보장한다

모델만 저장하고 전처리 코드를 따로 관리하면 학습과 운영의 입력이 달라질 수 있다.

대표적인 불일치는 다음과 같다.

- 결측값을 다른 값으로 대체한다.
- One-Hot Encoding 열의 순서가 달라진다.
- 일부 파생변수 생성이 누락된다.
- Scaling 기준을 신규 데이터에서 다시 계산한다.
- Feature 순서가 바뀐다.

Pipeline은 전처리와 모델을 하나의 실행 단위로 묶는다.

```python
from sklearn.pipeline import Pipeline

pipeline = Pipeline([
    ("preprocess", preprocessor),
    ("model", classifier),
])

pipeline.fit(X_train, y_train)
probability = pipeline.predict_proba(X_new)[:, 1]
```

Pipeline을 저장하면 동일한 변환을 신규 데이터에도 적용할 수 있어 재현성과 배포 안정성이 높아진다.

파생변수가 별도 함수로 구현됐다면 해당 함수의 버전도 모델과 함께 관리해야 한다.

---

## 17. 재현 가능성은 모델 품질의 일부다

같은 데이터를 다시 실행해도 결과가 달라진다면 모델을 검증하고 운영하기 어렵다.

재현 가능한 모델 개발을 위해 다음 항목을 기록해야 한다.

- 데이터 파일과 데이터 버전
- 파일 Encoding과 Schema
- Train·Validation·Test 분할 기준
- `random_state`
- 전처리와 Feature Engineering 순서
- 사용 Feature 목록과 순서
- 라이브러리와 Python 버전
- Hyperparameter와 최적 반복 횟수
- 평가 지표 계산 방법
- Ensemble 구성과 가중치

```python
model = CatBoostClassifier(
    random_seed=42,
    # 나머지 Hyperparameter
)
```

Random Seed는 무작위 과정을 반복 가능하게 만들지만 하드웨어와 라이브러리 버전까지 달라졌을 때 모든 소수점이 반드시 같아지는 것을 보장하지는 않는다.

---

## 18. 배포 이후에는 Drift를 모니터링해야 한다

모델은 과거 데이터의 관계를 학습한다. 운영 환경이 변하면 학습 당시의 관계가 더 이상 유지되지 않을 수 있다.

| Drift | 변화 대상 | 확인 예시 |
| --- | --- | --- |
| Data Drift | 입력 Feature 분포 | 연령, 잔액, 상품 수 분포 |
| Prediction Drift | 예측 결과 분포 | 평균 Score, 고위험 고객 비율 |
| Concept Drift | Feature와 Target 관계 | 같은 행동의 이탈 가능성 변화 |

Label이 아직 수집되지 않았다면 Data Drift와 Prediction Drift를 먼저 확인할 수 있다. 실제 Target이 확보되면 AUC, Precision, Recall과 Calibration을 확인한다.

Drift가 발견됐을 때의 대응은 원인에 따라 달라진다.

```text
입력 오류 또는 Schema 변경
→ 데이터 Pipeline 수정

Threshold와 업무 비용 변화
→ Threshold 재조정

최신 패턴이 추가됨
→ 최신 데이터로 재학습

관계 자체가 달라짐
→ Feature·알고리즘·문제 정의 재설계
```

재학습은 기존 구조를 유지한 채 최신 데이터로 Parameter를 다시 계산하는 것이다. 재모델링은 Feature, 모델 구조 또는 문제 정의까지 다시 검토하는 더 넓은 과정이다.

---

## 19. AutoML의 역할과 한계

AutoML은 전처리, 모델 선택과 Hyperparameter 탐색 일부를 자동화한다.

```text
여러 모델 후보 생성
→ 자동 Hyperparameter 탐색
→ Cross Validation 비교
→ Ensemble 후보 생성
```

반복 작업을 줄이고 사람이 생각하지 못한 조합을 탐색할 수 있다는 장점이 있다. 하지만 다음 판단까지 자동으로 해결하지는 못한다.

- Target이 올바르게 정의됐는가?
- 미래 정보가 Feature에 포함됐는가?
- 평가 지표가 업무 목적에 맞는가?
- 데이터 분할 방식이 현실의 예측 상황과 같은가?
- 모델 결과를 실제 업무에 어떻게 사용할 것인가?

AutoML은 모델 개발자를 대체하는 도구라기보다 탐색 범위를 넓히고 반복 실험을 자동화하는 도구에 가깝다.

---

## 20. 모델 개발과 최적화의 전체 구조

기술적 관점에서 전체 과정을 다시 정리하면 다음과 같다.

```text
1. Problem Definition
   분석 단위, Target, 예측 시점, 활용 목적 정의

2. Data Validation
   Schema, 결측, 중복, 범주, 분포, 시점 확인

3. Data Partition
   Train / Validation / Test 역할 분리

4. Feature Engineering
   Creation / Transformation / Selection

5. Baseline
   단순 모델로 최소 성능과 오류 구조 확인

6. Candidate Comparison
   여러 모델 계열을 동일 조건에서 비교

7. Hyperparameter Optimization
   Grid / Random / Bayesian Search와 Cross Validation

8. Regularization
   모델 복잡도 제한, Sampling, Early Stopping

9. Final Evaluation
   선택이 끝난 모델을 Test에서 한 번 평가

10. Interpretation
    Feature Importance, SHAP, 오류 분석

11. Packaging
    전처리와 모델을 Pipeline으로 저장

12. Monitoring
    성능, Drift, 데이터 품질을 지속적으로 확인
```

각 단계는 독립적이지 않다. 평가 결과가 좋지 않으면 Hyperparameter만 바꾸는 것이 아니라 문제 정의, 데이터 품질, Feature와 분할 방식까지 돌아가 확인해야 한다.

---

## 21. 기술 선택을 위한 체크리스트

### 데이터와 분할

- 한 행의 분석 단위가 명확한가?
- Target 정의와 예측 시점이 명확한가?
- Train과 Test 사이에 중복 또는 미래 정보가 없는가?
- 전처리 기준을 Train에서만 학습했는가?
- 분류 문제에서 클래스 비율을 확인했는가?
- 시계열이라면 시간 순서대로 분할했는가?

### 모델과 최적화

- Naive Model 또는 Baseline과 비교했는가?
- 업무 목적에 맞는 평가 지표를 선택했는가?
- Hyperparameter 탐색 공간에 의미 있는 범위를 넣었는가?
- Validation 또는 Cross Validation으로 후보를 선택했는가?
- Test를 모델 선택 과정에서 반복 사용하지 않았는가?
- 성능 향상과 계산 비용을 함께 비교했는가?

### 해석과 운영

- 중요도를 인과관계로 해석하지 않았는가?
- 전처리와 모델을 같은 단위로 저장했는가?
- 입력 Schema와 Feature 순서를 검증하는가?
- 모델과 데이터 버전을 기록했는가?
- 배포 후 Drift와 실제 성능을 확인할 수 있는가?
- 재학습 또는 재모델링 기준이 있는가?

---

## 22. 마무리

모델 개발 및 최적화는 알고리즘의 점수를 높이는 기법 모음이 아니다. 현실의 문제를 데이터 기반 예측 시스템으로 바꾸고, 그 시스템이 새로운 데이터에서도 작동하도록 검증하는 과정이다.

Feature Engineering은 데이터의 표현을 설계한다. Train·Validation·Test 분할은 일반화 성능을 측정한다. Baseline은 개선 여부를 판단하는 기준을 만든다. Hyperparameter Search와 Early Stopping은 모델의 복잡도와 학습 과정을 조절한다. Ensemble은 서로 다른 모델의 오류를 결합하고, Feature Importance와 SHAP은 모델의 판단 근거를 확인한다. Pipeline과 Drift Monitoring은 개발 결과를 운영 가능한 시스템으로 확장한다.

```text
좋은 모델 개발
= 높은 평가 점수
+ 데이터 누수 없는 검증
+ 재현 가능한 전처리와 학습
+ 설명 가능한 선택 근거
+ 운영 이후의 모니터링
```

결국 모델 최적화에서 가장 중요한 질문은 “점수가 얼마나 높아졌는가?” 하나가 아니다.

> 왜 이 모델을 선택했으며, 그 성능을 얼마나 신뢰할 수 있고, 새로운 데이터에서도 같은 과정을 유지할 수 있는가?

이 질문에 답할 수 있을 때 학습된 모델은 실험 결과를 넘어 실제로 사용할 수 있는 예측 시스템에 가까워진다.
