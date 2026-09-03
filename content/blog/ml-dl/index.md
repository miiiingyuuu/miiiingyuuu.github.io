---
title: "머신러닝과 딥러닝 이해하기: 분류·회귀부터 CNN과 LSTM까지"
date: "2026-09-03"
category: ["AI"]
description: "머신러닝과 딥러닝의 차이, 데이터 분할과 전처리, 분류·회귀·군집화·이상 탐지·시계열 그리고 신경망의 학습 원리를 실습 경험과 함께 정리"
---

# 머신러닝과 딥러닝 이해하기: 분류·회귀부터 CNN과 LSTM까지

머신러닝과 딥러닝을 처음 공부할 때는 알고리즘 이름부터 외우기 쉽다. Logistic Regression, Random Forest, XGBoost, CNN, LSTM처럼 알아야 할 모델이 계속 등장하기 때문이다.

하지만 여러 실습을 진행하고 나니 더 중요한 것은 모델 이름이 아니라 다음 질문에 답하는 일이었다.

> 어떤 문제를 풀고 있으며, 무엇을 입력해 어떤 값을 예측하고, 그 결과를 어떤 기준으로 평가할 것인가?

이번 글에서는 지금까지 공부한 머신러닝과 딥러닝의 핵심을 하나의 흐름으로 정리한다. 분류와 회귀 같은 지도학습부터 군집화, 이상 탐지, 시계열 예측을 살펴보고, 마지막에는 신경망이 실제로 어떻게 학습하는지 연결해 본다.

```text
문제 정의
  ↓
데이터 이해와 전처리
  ↓
Feature와 Target 설정
  ↓
Train / Validation / Test 분리
  ↓
모델 학습
  ↓
성능 평가와 결과 해석
```

이 글은 크게 네 흐름으로 이어진다.

1. 머신러닝과 딥러닝의 공통 분석 과정
2. 분류·회귀·군집화·이상 탐지·시계열 실습
3. 신경망의 학습 원리와 MLP·CNN
4. RNN·LSTM·Transformer로 이어지는 딥러닝 구조

---

## 1. 머신러닝과 딥러닝은 무엇이 다른가

머신러닝은 데이터에서 규칙을 학습해 새로운 데이터의 결과를 예측하는 방법이다. 사람이 모든 조건을 직접 작성하는 규칙 기반 프로그램과 달리, 입력과 정답의 관계를 데이터로부터 찾는다.

```text
전통적인 프로그램
데이터 + 사람이 만든 규칙 → 결과

머신러닝
데이터 + 정답 → 규칙을 학습한 모델
새로운 데이터 + 학습된 모델 → 예측 결과
```

딥러닝은 머신러닝의 한 분야다. 여러 층으로 구성된 신경망을 사용해 복잡한 관계와 표현을 학습한다.

| 구분 | 머신러닝 | 딥러닝 |
|---|---|---|
| 대표 모델 | Logistic Regression, Decision Tree, Random Forest, XGBoost | MLP, CNN, RNN, LSTM, Transformer |
| Feature 처리 | 분석가가 의미 있는 Feature를 만드는 일이 중요 | 신경망이 표현의 일부를 학습할 수 있음 |
| 강점 데이터 | 정형·표 데이터 | 이미지, 음성, 텍스트 같은 비정형 데이터 |
| 데이터 요구량 | 비교적 적은 데이터에서도 활용 가능 | 일반적으로 많은 데이터가 유리 |
| 계산 비용 | 상대적으로 낮음 | 상대적으로 높음 |
| 해석 가능성 | 모델에 따라 비교적 높음 | 내부 구조가 복잡해 해석하기 어려울 수 있음 |

딥러닝이 Feature를 자동으로 학습한다고 해서 전처리나 분석가의 판단이 필요 없다는 뜻은 아니다. 데이터 품질, Target 정의, 데이터 분할, 평가 지표와 누수 방지는 두 방법 모두에서 중요하다.

---

## 2. 모델보다 먼저 결정해야 하는 것

### 2.1 분석 단위와 Target

모델을 만들기 전에 한 행이 무엇을 뜻하는지부터 정해야 한다.

- 승객 한 명의 생존 여부를 예측한다.
- 환자 한 명의 질병 여부를 분류한다.
- 지역 한 곳의 주택 가격을 예측한다.
- 고객 한 명을 비슷한 특성의 집단으로 나눈다.
- 특정 월의 다음 달 승객 수를 예측한다.

Target의 형태에 따라 문제 유형도 달라진다.

| Target 또는 목적 | 문제 유형 | 예시 |
|---|---|---|
| 범주형 정답 | Classification | 생존/사망, 악성/양성 |
| 연속형 숫자 | Regression | 가격, 수요, 질병 진행 점수 |
| 정답 없이 유사한 집단 탐색 | Clustering | 고객 세분화 |
| 정상과 다른 희귀 패턴 탐색 | Anomaly Detection | 이상 거래, 이상 지역 |
| 시간 순서가 있는 미래 값 | Time Series Forecasting | 다음 달 승객 수 |

### 2.2 Feature와 Target 분리

```python
X = df.drop("target", axis=1)
y = df["target"]
```

- `X`: 모델이 예측에 사용하는 Feature
- `y`: 모델이 맞혀야 하는 Target

Target을 입력 Feature에 포함하면 정답을 미리 알려 주는 것과 같다. 이 경우 학습 성능은 매우 좋아 보일 수 있지만 실제 예측에서는 사용할 수 없다.

---

## 3. Train, Validation, Test를 나누는 이유

모델의 목표는 이미 본 데이터를 외우는 것이 아니라 새로운 데이터에서도 잘 예측하는 것이다.

| 데이터 | 역할 |
|---|---|
| Train | 모델의 Parameter를 학습 |
| Validation | 모델과 Hyperparameter를 선택 |
| Test | 모든 선택이 끝난 뒤 최종 성능을 평가 |

```python
from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.3,
    random_state=42
)
```

`random_state`는 같은 데이터 분할과 결과를 재현하기 위해 사용한다.

### Parameter와 Hyperparameter

두 용어는 모델 실습에서 자주 함께 등장하지만 결정되는 시점이 다르다.

| 구분 | 결정 방식 | 예시 |
|---|---|---|
| Parameter | 학습 데이터로부터 모델이 계산 | 선형회귀의 Weight·Bias, Tree의 분기 기준 |
| Hyperparameter | 학습 전에 사람이 설정 | `max_depth`, `n_estimators`, `learning_rate`, `batch_size` |

모델 학습은 주어진 Hyperparameter 안에서 Parameter를 찾는 과정이라고 볼 수 있다.

### 가장 조심해야 할 Data Leakage

Data Leakage는 학습 시점에 알 수 없는 정보가 모델에 들어가는 문제다.

대표적인 누수 사례는 다음과 같다.

- 전체 데이터로 결측값 대체 기준을 계산한 후 Train/Test를 나눈다.
- 전체 데이터에 Scaling을 적용한 후 Train/Test를 나눈다.
- Target을 이용해 만든 값을 Feature로 사용한다.
- 시계열에서 미래 시점의 값을 과거 예측에 사용한다.
- Test 성능을 계속 확인하며 모델을 선택한 뒤 그 값을 최종 성능이라고 보고한다.

전처리는 Train에서 학습하고 Test에는 그대로 적용해야 한다.

```python
from sklearn.preprocessing import MinMaxScaler

scaler = MinMaxScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)
```

```text
Train: fit + transform
Test : transform만 수행
```

모델 성능을 높이는 기술보다 이 원칙을 지키는 것이 먼저다.

---

## 4. Classification: 범주를 예측하는 문제

분류는 Target이 정해진 범주 중 하나인 문제다. Titanic 생존 여부와 유방암 악성·양성 진단 데이터를 이용해 Logistic Regression, Decision Tree, Random Forest 같은 모델을 비교했다.

### 4.1 Logistic Regression

이름에는 Regression이 들어가지만 주로 이진 분류에 사용한다. 입력 Feature의 선형 결합을 Sigmoid 함수에 통과시켜 0과 1 사이의 확률로 바꾼다.

```text
선형 결합 z = w₁x₁ + w₂x₂ + ... + b
               ↓ Sigmoid
Positive일 확률 P(y=1)
```

```python
from sklearn.linear_model import LogisticRegression

model = LogisticRegression(C=1.0, max_iter=5000)
model.fit(X_train, y_train)

pred = model.predict(X_test)
prob = model.predict_proba(X_test)[:, 1]
```

- `predict()`: 최종 클래스 반환
- `predict_proba()`: 클래스별 확률 반환

### 4.2 Accuracy만 보면 충분할까

Confusion Matrix는 실제값과 예측값의 조합을 네 가지로 나눈다.

|  | 실제 Positive | 실제 Negative |
|---|---:|---:|
| 예측 Positive | TP | FP |
| 예측 Negative | FN | TN |

| 지표 | 계산 | 의미 |
|---|---|---|
| Accuracy | `(TP + TN) / 전체` | 전체 예측 중 맞춘 비율 |
| Precision | `TP / (TP + FP)` | Positive 예측 중 실제 Positive 비율 |
| Recall | `TP / (TP + FN)` | 실제 Positive 중 찾아낸 비율 |
| F1 Score | Precision과 Recall의 조화평균 | 두 지표의 균형 |

암 환자를 놓치는 비용이 큰 문제라면 FN을 줄이는 Recall이 중요하다. 반대로 정상 메일을 스팸으로 잘못 보내는 비용이 크다면 Precision을 더 중요하게 볼 수 있다.

클래스가 불균형할 때 Accuracy만 확인하면 모델을 잘못 평가할 수 있다. 예를 들어 정상 99개와 이상 1개가 있을 때 모두 정상이라고 예측해도 Accuracy는 99%다.

### 4.3 유방암 분류 실습에서 배운 점

유방암 데이터에서는 Logistic Regression과 Random Forest 등을 동일한 데이터 분할로 비교했다. 일부 모델이 같은 Test Accuracy를 보였을 때는 Train Accuracy가 지나치게 높지 않은 모델을 우선해 과적합 가능성을 함께 확인했다.

수동으로 정한 후보를 비교한 실습에서는 Logistic Regression과 일부 Random Forest 조합이 **Test Accuracy 97.66%**로 동률이었다. 이때 Train Accuracy가 상대적으로 낮아 과적합이 덜한 Logistic Regression을 최종 후보로 선택했다.

실습에서 얻은 핵심은 다음과 같다.

- Test Accuracy가 가장 높은 모델이 하나만 존재하지 않을 수 있다.
- 동률이라면 Train/Test 차이와 모델 복잡도까지 살펴야 한다.
- Decision Tree의 규칙은 어떤 조건에서 악성 또는 양성 비율이 높아지는지 설명한다.
- Random Forest Feature Importance는 분류에 많이 기여한 변수를 보여 주지만 인과관계를 뜻하지 않는다.

---

## 5. Regression: 연속적인 값을 예측하는 문제

회귀는 가격, 수요, 매출처럼 연속적인 숫자를 예측한다. California Housing의 주택 가격과 당뇨병 진행 점수를 예측하면서 여러 회귀 모델과 평가 지표를 비교했다.

### 5.1 회귀 평가지표

| 지표 | 의미 | 좋은 방향 | 특징 |
|---|---|---:|---|
| MAE | 절대오차의 평균 | 0 | 실제 Target과 같은 단위 |
| MSE | 제곱오차의 평균 | 0 | 큰 오차에 더 큰 벌점 |
| RMSE | MSE의 제곱근 | 0 | 실제 Target과 같은 단위 |
| MAPE | 절대백분율오차의 평균 | 0% | 상대적인 오차를 해석하기 쉬움 |
| R² | 평균 예측 대비 설명력 | 일반적으로 1 | 음수가 될 수도 있음 |

```python
from sklearn.metrics import mean_absolute_percentage_error

test_mape = mean_absolute_percentage_error(y_test, test_pred) * 100
print(f"Test MAPE: {test_mape:.3f}%")
```

MAPE가 8%라면 실제값을 기준으로 평균 약 8%의 절대 오차가 있다는 의미다. 다만 실제값이 0이거나 매우 작으면 분모 때문에 값이 불안정해진다.

### 5.2 Train 성능과 Test 성능을 함께 보는 이유

```text
Train 오차 낮음 + Test 오차 낮음
→ 새로운 데이터에도 비교적 잘 일반화

Train 오차 매우 낮음 + Test 오차 높음
→ 학습 데이터를 외운 Overfitting 가능성

Train 오차 높음 + Test 오차 높음
→ 관계를 충분히 학습하지 못한 Underfitting 가능성
```

실습에서는 Linear Regression, Decision Tree, Random Forest, XGBoost, LightGBM 등을 비교했다. 모델이 복잡하다고 항상 Test 성능이 좋아지는 것은 아니었고, Train MAPE만 보고 모델을 선택해서도 안 되었다.

---

## 6. Decision Tree와 Ensemble

### 6.1 Decision Tree

Decision Tree는 질문을 반복하며 데이터를 나눈다.

```text
Root Node
 ├─ 조건 만족 → 왼쪽 Branch
 │              └─ Leaf Node의 예측
 └─ 조건 불만족 → 오른쪽 Branch
                └─ Leaf Node의 예측
```

- 분류 Tree는 Gini, Entropy 같은 불순도를 줄이는 방향으로 분기한다.
- 회귀 Tree는 분기 후 오차나 분산이 줄어드는 방향을 찾는다.
- `max_depth`가 커지면 더 복잡한 규칙을 만들 수 있지만 과적합 위험도 커진다.
- Tree 시각화를 통해 특정 예측값이 만들어진 조건을 Rule로 표현할 수 있다.

### 6.2 Random Forest와 Bagging

Random Forest는 서로 다른 데이터와 Feature를 사용해 여러 Tree를 학습한 뒤 결과를 결합한다.

```text
분류: 각 Tree의 예측을 투표
회귀: 각 Tree의 예측값을 평균
```

한 개의 깊은 Tree보다 데이터 변화에 덜 민감하도록 분산을 줄이는 것이 핵심이다.

### 6.3 Boosting

Boosting은 여러 모델을 독립적으로 만드는 Bagging과 달리 이전 모델이 틀린 부분을 다음 모델이 보완하도록 순차적으로 학습한다.

| 구분 | Bagging | Boosting |
|---|---|---|
| 학습 방식 | 독립·병렬 | 순차적 오류 보완 |
| 주된 효과 | 분산 감소 | 편향 감소와 강한 예측력 |
| 대표 모델 | Random Forest | XGBoost, LightGBM |

Feature Importance가 높다는 것은 해당 모델이 예측 과정에서 그 변수를 많이 활용했다는 뜻이다. 그 변수가 결과의 원인이라는 뜻은 아니다.

---

## 7. Clustering: 정답 없이 비슷한 대상을 묶기

군집화는 정답 Label 없이 데이터의 구조를 찾는 비지도학습이다. Mall Customers 데이터에서 소득과 소비점수, 연령을 사용해 고객을 세분화했다.

### 7.1 K-Means의 동작 방식

1. K개의 초기 중심점을 정한다.
2. 각 데이터를 가장 가까운 중심점에 할당한다.
3. 각 군집의 평균 위치로 중심점을 이동한다.
4. 할당과 중심점이 안정될 때까지 반복한다.

K-Means는 군집 내부의 거리 제곱합인 WCSS를 줄이는 방향으로 동작한다.

### 7.2 거리 기반 모델에서 Scaling이 중요한 이유

연 소득이 0~100이고 연령이 20~70이라면 숫자의 범위가 더 큰 Feature가 거리 계산을 지배할 수 있다.

```python
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_scaled = scaler.fit_transform(df[features])
```

StandardScaler는 각 Feature를 평균 0, 표준편차 1에 가까운 값으로 변환해 단위의 영향을 줄인다.

### 7.3 K를 선택하는 방법

- Elbow Method: K를 늘릴 때 WCSS 감소가 급격히 완만해지는 지점을 찾는다.
- Silhouette Score: 군집 내부 응집도와 군집 사이 분리도를 함께 평가한다. 높을수록 좋다.

실습에서는 소득과 소비점수만 사용했을 때 Elbow 기준으로 `K=5`, Age를 추가했을 때 `K=6`을 선택했다. 2개 변수에서는 비슷해 보인 고객도 연령을 추가하면 다른 집단으로 나뉠 수 있었다.

여기서 군집 번호 `0`, `1`, `2`는 등급이나 순서가 아니다. 각 군집의 평균 소득, 소비점수, 연령을 확인한 뒤 비즈니스 의미를 붙여야 한다.

---

## 8. Anomaly Detection: 정상과 다른 패턴 찾기

이상 탐지는 대부분의 정상 데이터와 다른 희귀 패턴을 찾는 문제다. 실제 이상 여부를 나타내는 Label이 없는 경우가 많아 비지도학습이나 One-Class 방식이 자주 사용된다.

### 8.1 Isolation Forest

Isolation Forest는 이상치가 정상 데이터보다 적은 횟수의 분할로 쉽게 고립된다는 아이디어를 사용한다.

```python
from sklearn.ensemble import IsolationForest

model = IsolationForest(
    contamination=0.05,
    random_state=42
)

anomaly_label = model.fit_predict(X)
```

- 일반적인 출력 `1`: 정상
- 일반적인 출력 `-1`: 이상
- `contamination=0.05`: 전체의 약 5%를 이상치로 판단하도록 임계값 설정

### 8.2 모델이 찾은 이상치가 실제 이상치일까

반드시 그렇지는 않다. Isolation Forest의 결과는 데이터 분포를 기준으로 한 상대적 판단이다.

실습에서는 Isolation Forest가 만든 Label을 Decision Tree와 Random Forest로 다시 설명했다. 이때 Tree Rule과 Feature Importance는 실제 업무상 이상 원인을 설명하는 것이 아니라 **Isolation Forest의 판단을 근사해서 설명하는 Surrogate Model**의 결과다.

따라서 이상 탐지는 다음 단계가 함께 필요하다.

- 원본 데이터 확인
- 업무 규칙과 비교
- 실제 이상 여부 검증
- 이상치 비율과 Threshold 검토

---

## 9. Time Series: 시간 순서를 지키는 예측

시계열 데이터는 관측 순서가 의미를 가진다. 일반적인 회귀처럼 데이터를 무작위로 섞으면 미래 정보가 과거 학습에 들어갈 수 있다.

```text
과거 구간 → Train
미래 구간 → Test
```

### 9.1 시간 정보를 Feature로 만들기

AirPassengers 데이터를 사용해 다음과 같은 Feature를 만들었다.

| Feature | 의미 |
|---|---|
| `year`, `month` | 시간의 위치 |
| `lag_1` | 1개월 전 값 |
| `lag_12` | 전년 같은 달 값 |
| `rolling_mean_3` | 최근 3개월 평균 |
| `month_sin`, `month_cos` | 월의 순환적 특성 |

```python
df["lag_1"] = df["passengers"].shift(1)
df["lag_12"] = df["passengers"].shift(12)
df["rolling_mean_3"] = df["passengers"].rolling(3).mean()
df["target"] = df["passengers"].shift(-1)
```

12월과 1월은 숫자로는 멀어 보이지만 실제로는 인접한 달이다. `sin`, `cos` 변환은 이런 순환성을 표현한다.

### 9.2 예측 거리에 따른 차이

- `t+1`: 한 달 후 예측
- `t+3`: 세 달 후 예측
- `t+5`: 다섯 달 후 예측

직접 예측은 현재 Feature로 각 미래 시점의 Target을 바로 예측한다. 재귀 예측은 `t+1` 예측값을 다음 입력으로 다시 사용한다. 재귀 방식은 예측 거리가 멀어질수록 오차가 누적될 수 있다.

시계열에서 가장 중요한 질문은 “이 값이 예측 시점에 실제로 알 수 있었는가?”이다. 이동평균이나 Lag Feature를 만들 때 미래값이 섞이지 않았는지 반드시 확인해야 한다.

---

## 10. Deep Learning: 신경망은 어떻게 학습하는가

신경망은 입력을 받는 Input Layer, 표현을 학습하는 Hidden Layer, 최종 결과를 만드는 Output Layer로 구성된다.

```text
Input Layer → Hidden Layer(s) → Output Layer
```

### 10.1 하나의 Neuron

Neuron은 입력의 가중합에 Bias를 더하고 Activation Function을 적용한다.

```text
z = w₁x₁ + w₂x₂ + ... + b
output = activation(z)
```

- Weight: 각 입력이 결과에 미치는 정도
- Bias: 결정 기준을 이동시키는 값
- Activation Function: 비선형성을 추가하는 함수

단층 Perceptron은 선형 경계만 만들 수 있어 XOR처럼 선형 분리가 불가능한 문제를 해결하지 못한다. Hidden Layer와 비선형 Activation을 추가한 MLP는 더 복잡한 결정경계를 학습할 수 있다.

### 10.2 Activation Function

| 함수 | 특징 | 대표 용도 |
|---|---|---|
| Sigmoid | 출력을 0~1로 변환 | 이진 분류 출력층 |
| Tanh | 출력을 -1~1로 변환 | 일부 순환 신경망 |
| ReLU | 음수는 0, 양수는 그대로 | Hidden Layer |
| Softmax | 여러 출력의 합을 1로 변환 | 다중 분류 출력층 |

### 10.3 Forward Propagation과 Backpropagation

신경망 학습은 다음 과정을 반복한다.

```text
1. Forward Propagation
   입력에서 예측값 계산

2. Loss 계산
   예측값과 실제값의 차이 계산

3. Backpropagation
   Chain Rule로 각 Weight가 Loss에 준 영향 계산

4. Optimizer
   Loss가 감소하는 방향으로 Weight 갱신
```

Gradient Descent의 기본적인 갱신은 다음과 같이 이해할 수 있다.

```text
새 Weight = 현재 Weight - Learning Rate × Gradient
```

Learning Rate가 너무 작으면 학습이 느리고, 너무 크면 최솟값을 지나치거나 Loss가 발산할 수 있다.

### 10.4 Epoch, Batch, Iteration

- Epoch: 전체 Train 데이터를 한 번 학습
- Batch Size: 한 번의 Weight 갱신에 사용하는 데이터 수
- Iteration: 하나의 Batch를 처리하고 Weight를 한 번 갱신하는 과정

```text
Epoch당 Iteration 수 ≈ Train 데이터 수 / Batch Size
```

작은 Batch는 더 자주 Weight를 갱신하지만 실행 시간이 늘어날 수 있다. 큰 Batch는 계산 효율이 좋지만 항상 더 좋은 일반화 성능을 보장하지는 않는다.

---

## 11. 딥러닝 회귀 실습: MLP

표 형태의 California Housing 데이터로 MLP 회귀 모델을 만들고 다음 요소를 비교했다.

- Hidden Layer의 개수와 Neuron 수
- Learning Rate
- 최대 Epoch
- Batch Size
- Early Stopping의 Patience

```python
from tensorflow.keras import Sequential
from tensorflow.keras.layers import Dense, Input

model = Sequential([
    Input(shape=(X_train.shape[1],)),
    Dense(64, activation="relu"),
    Dense(32, activation="relu"),
    Dense(1)
])

model.compile(
    optimizer="adam",
    loss="mse"
)
```

회귀 출력층에는 연속적인 값을 그대로 출력하기 위해 일반적으로 Neuron 1개를 두고 별도의 Softmax를 사용하지 않는다.

### Early Stopping

```python
from tensorflow.keras.callbacks import EarlyStopping

early_stopping = EarlyStopping(
    monitor="val_loss",
    patience=10,
    restore_best_weights=True
)
```

- Validation Loss가 개선되지 않으면 학습을 중단한다.
- `patience`는 개선을 기다릴 Epoch 수다.
- `restore_best_weights=True`는 가장 좋았던 시점의 Weight로 되돌린다.

실습에서 Hidden Layer를 깊게 만들거나 Epoch를 늘린다고 Test MAPE가 항상 좋아지지는 않았다. 정형 데이터에서는 XGBoost나 LightGBM 같은 Tree 기반 모델이 MLP보다 정확하고 빠를 수도 있었다.

딥러닝을 사용했다는 사실보다 데이터 형태와 문제에 맞는 모델을 선택하는 것이 중요하다.

---

## 12. 딥러닝 분류 실습: CNN

Fashion-MNIST 이미지 분류에서는 CNN을 사용했다.

```text
이미지
  ↓ Convolution
Feature Map
  ↓ ReLU
  ↓ Pooling
  ↓ Flatten
  ↓ Dense
  ↓ Softmax
10개 의류 클래스 확률
```

```python
from tensorflow.keras import Sequential
from tensorflow.keras.layers import (
    Input, Conv2D, MaxPooling2D,
    Flatten, Dense, Dropout
)

model = Sequential([
    Input(shape=(28, 28, 1)),
    Conv2D(16, (3, 3), activation="relu"),
    MaxPooling2D((2, 2)),
    Conv2D(32, (3, 3), activation="relu"),
    Flatten(),
    Dense(64, activation="relu"),
    Dropout(0.3),
    Dense(10, activation="softmax")
])
```

### CNN 구성 요소

- Convolution: 작은 Filter로 이미지의 지역 패턴을 추출한다.
- Feature Map: Filter를 적용해 얻은 특징 표현이다.
- Pooling: 공간 크기와 계산량을 줄이며 중요한 정보를 남긴다.
- Flatten: 다차원 Feature Map을 Dense Layer가 받을 수 있는 1차원 형태로 바꾼다.
- Softmax: 10개 클래스의 출력값을 확률 분포로 바꾼다.

### Dropout

Dropout은 학습 중 일부 Neuron을 무작위로 비활성화해 특정 연결에 지나치게 의존하는 현상을 줄인다.

- 학습 시에만 적용된다.
- Dropout Layer에는 학습할 Weight가 없다.
- 비율을 높인다고 Parameter 수가 줄어드는 것은 아니다.
- 너무 크면 필요한 정보까지 제거해 Underfitting이 발생할 수 있다.

Epoch가 증가하면 Train Accuracy는 계속 상승할 수 있지만 Validation/Test Accuracy는 정체되거나 하락할 수 있다. 따라서 학습 곡선과 Train-Test 차이를 함께 봐야 한다.

---

## 13. CNN 이후의 Sequence 모델

### 13.1 RNN

RNN은 이전 시점의 Hidden State를 다음 시점으로 전달해 순서 정보를 처리한다.

```text
x₁ → h₁ → h₂ → h₃
      ↑     ↑     ↑
     x₂    x₃    x₄
```

하지만 Sequence가 길어지면 앞부분 정보가 점차 약해지는 장기 의존성과 Gradient Vanishing 문제가 발생할 수 있다.

### 13.2 LSTM

LSTM은 Cell State와 세 가지 Gate를 사용해 오래 유지할 정보와 버릴 정보를 조절한다.

| Gate | 역할 |
|---|---|
| Forget Gate | 과거 정보 중 무엇을 버릴지 결정 |
| Input Gate | 새로운 정보 중 무엇을 저장할지 결정 |
| Output Gate | 현재 상태에서 무엇을 출력할지 결정 |

### 13.3 Attention과 Transformer

Attention은 출력을 만들 때 입력의 모든 부분을 똑같이 보는 대신 중요한 부분에 더 큰 가중치를 준다.

Self-Attention은 하나의 Sequence 안에서 각 Token이 다른 Token과 얼마나 관련 있는지 계산한다. Transformer는 RNN의 순차 처리를 Self-Attention 중심 구조로 바꾸어 병렬 처리를 가능하게 했다.

```text
RNN / LSTM
→ 이전 상태를 순서대로 전달

Transformer
→ Self-Attention으로 Token 관계를 직접 계산
```

Transformer에는 반복 구조가 없으므로 Token의 순서를 표현하기 위해 Positional Encoding이 필요하다.

---

## 14. 어떤 모델을 선택해야 할까

특정 모델이 모든 데이터에서 가장 좋은 것은 아니다.

| 상황 | 먼저 고려할 모델 |
|---|---|
| 작은 정형 데이터의 분류·회귀 | Linear Model, Random Forest, Gradient Boosting |
| 결과 규칙을 설명해야 함 | Decision Tree, Linear Model |
| 고객 집단을 탐색 | K-Means 등 Clustering |
| Label 없는 이상 패턴 탐색 | Isolation Forest |
| 이미지 | CNN |
| 순서가 중요한 Sequence | RNN, LSTM, Transformer |
| 대규모 텍스트 | Transformer |

모델을 선택할 때는 성능만이 아니라 다음 항목도 함께 고려해야 한다.

- 데이터의 크기와 형태
- 추론 속도
- 학습 비용
- 결과 해석 가능성
- 운영 환경
- 잘못된 예측의 업무 비용

---

## 15. 지금까지 실습하며 정리한 핵심 원칙

### 원칙 1. 문제 유형과 Target부터 확인한다

분류인지 회귀인지, 정답이 없는 탐색 문제인지에 따라 모델과 평가 방법이 달라진다.

### 원칙 2. Test 데이터는 마지막 평가를 위해 남긴다

모델과 설정을 Test 성능으로 계속 선택하면 Test가 사실상 Validation 역할을 하게 된다.

### 원칙 3. 전처리 기준은 Train에서만 학습한다

결측값 대체, Scaling, Encoding 모두 동일한 원칙이 적용된다.

### 원칙 4. 하나의 지표만 보지 않는다

분류에서는 Accuracy와 함께 Precision, Recall, F1을 보고, 회귀에서는 MAE, RMSE, MAPE의 특성을 구분해야 한다.

### 원칙 5. Train과 Test의 차이를 확인한다

Train 성능이 매우 좋다는 사실만으로 모델이 좋은 것은 아니다. 새로운 데이터에서 일반화되는지가 중요하다.

### 원칙 6. Feature Importance는 인과관계가 아니다

중요도는 해당 모델이 예측에 Feature를 얼마나 활용했는지를 나타낸다.

### 원칙 7. 복잡한 모델이 항상 정답은 아니다

정형 데이터에서는 머신러닝 모델이 딥러닝보다 효율적일 수 있다. 반대로 이미지와 텍스트처럼 표현 학습이 중요한 데이터에서는 딥러닝이 강점을 가진다.

---

## 마무리

이번 학습을 통해 머신러닝과 딥러닝은 완전히 분리된 기술이 아니라 같은 예측 문제를 서로 다른 방식으로 해결하는 도구라는 점을 알게 되었다.

머신러닝은 정형 데이터에서 빠르게 강력한 기준 모델을 만들고 결과를 해석하는 데 유용했다. 딥러닝은 여러 Layer를 통해 복잡한 표현을 직접 학습하고, CNN과 LSTM처럼 데이터 구조에 맞는 신경망을 구성할 수 있었다.

무엇보다 중요한 것은 모델 이름을 많이 아는 것이 아니었다.

```text
문제를 올바르게 정의하고
데이터 누수를 막고
목적에 맞는 지표로 평가하며
새로운 데이터에서도 동작하는지 확인하는 것
```

이것이 머신러닝과 딥러닝 모델을 이해하는 공통 기반이다.

다음 글에서는 이 기반 위에서 Baseline을 만들고, Hyperparameter와 Feature를 조정하고, Validation과 교차검증을 사용해 최종 모델을 선택하는 **모델 개발 및 최적화 과정**을 정리할 예정이다.
