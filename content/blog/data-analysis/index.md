---
title: "데이터 분석 개요 및 기초통계"
date: "2026-07-30"
category: ["Python", "DataAnalysis"]
description: "데이터 분석의 전체 프로세스와 기초통계 핵심 개념 정리. 데이터 유형 분류, 기술통계(중심경향·산포·형태), 확률과 확률분포(정규·이항·포아송), 표본추출과 중심극한정리, 상관관계와 선형회귀, 데이터 전처리(결측치·이상치·스케일링·인코딩)까지 Python 코드 예시와 함께 정리"
---

# 데이터 분석 개요 및 기초통계 — 분석 프로세스부터 확률분포·회귀까지

---

## 0. 데이터 분석 전체 프로세스

```
① 문제 정의
   └─ 비즈니스 목표를 분석 가능한 질문으로 변환
      예: "매출이 왜 감소했는가?" → "어떤 고객 세그먼트에서 이탈이 증가했는가?"

② 데이터 수집
   └─ DB 쿼리, API, 크롤링, 설문, 로그 등

③ 데이터 전처리
   └─ 결측치 처리, 이상치 탐지, 정제, 병합

④ 탐색적 데이터 분석 (EDA)
   └─ 기술통계, 시각화, 분포 파악, 변수 간 관계 탐색

⑤ 모델링 / 통계 분석
   └─ 가설 검정, 회귀 분석, 머신러닝

⑥ 결과 해석 및 시각화
   └─ 인사이트 도출, 대시보드, 보고서

⑦ 의사결정 및 배포
   └─ A/B 테스트, 모델 서빙, 모니터링
```

---

## 1. 데이터 유형 분류

분석 방법을 선택하기 전에 데이터의 유형을 파악하는 것이 가장 먼저다.

### 1-1. 측정 수준에 따른 분류

| 유형                  | 설명                   | 연산 가능 범위          | 예시                     |
| --------------------- | ---------------------- | ----------------------- | ------------------------ |
| **명목형 (Nominal)**  | 순서 없는 범주         | 같다/다르다             | 성별, 혈액형, 지역       |
| **순서형 (Ordinal)**  | 순서 있는 범주         | 크다/작다 (간격 불균등) | 학점(A/B/C), 만족도(1~5) |
| **등간형 (Interval)** | 균등 간격, 절대 0 없음 | 덧셈/뺄셈               | 섭씨온도, 연도           |
| **비율형 (Ratio)**    | 균등 간격, 절대 0 존재 | 사칙연산 모두 가능      | 나이, 소득, 주가         |

> 절대 0의 의미: "없음"을 뜻함. 온도 0°C는 "온도 없음"이 아니지만, 소득 0원은 "소득 없음"을 의미.

### 1-2. 연속형 vs 이산형

| 유형                    | 설명                    | 예시               |
| ----------------------- | ----------------------- | ------------------ |
| **연속형 (Continuous)** | 실수 범위 내 임의의 값  | 키, 몸무게, 주가   |
| **이산형 (Discrete)**   | 정수 단위 셀 수 있는 값 | 거래 건수, 클릭 수 |

```python
import pandas as pd

df = pd.read_csv("financial_data.csv")

# 데이터 유형 확인
print(df.dtypes)

# 범주형 vs 수치형 분리
categorical_cols = df.select_dtypes(include=["object", "category"]).columns
numeric_cols     = df.select_dtypes(include=["number"]).columns

print(f"범주형: {list(categorical_cols)}")
print(f"수치형: {list(numeric_cols)}")
```

---

## 2. 기술통계 (Descriptive Statistics)

데이터를 수집한 직후, **분포의 특성을 요약**하는 단계다.

### 2-1. 중심 경향 (Central Tendency)

```python
import numpy as np
import pandas as pd
from scipy import stats

data = df["price"]

mean   = data.mean()                    # 평균: 이상치에 민감
median = data.median()                  # 중앙값: 이상치에 강건
mode   = data.mode()[0]                 # 최빈값: 범주형에 유용
trimmed_mean = stats.trim_mean(data, 0.1)  # 절사평균: 상하 10% 제거 후 평균

print(f"평균:     {mean:.2f}")
print(f"중앙값:   {median:.2f}")
print(f"최빈값:   {mode:.2f}")
print(f"절사평균: {trimmed_mean:.2f}")

# 평균 vs 중앙값 차이가 크면 → 분포가 왜곡(Skewed)됨을 의심
if abs(mean - median) / median > 0.1:
    print("⚠️ 분포 왜곡 가능성 — 중앙값 사용 권장")
```

### 2-2. 산포도 (Spread / Variability)

```python
variance = data.var()          # 분산: 편차 제곱의 평균
std      = data.std()          # 표준편차: 분산의 제곱근 (단위 동일)
cv       = std / mean * 100    # 변동계수(CV): 단위 다른 집단 비교에 사용

q1 = data.quantile(0.25)
q3 = data.quantile(0.75)
iqr = q3 - q1                  # IQR: 중간 50% 범위

data_range = data.max() - data.min()  # 범위

print(f"분산:       {variance:.2f}")
print(f"표준편차:   {std:.2f}")
print(f"변동계수:   {cv:.2f}%")
print(f"IQR:        {iqr:.2f}")
print(f"범위:       {data_range:.2f}")

# 전체 요약통계
print(data.describe(percentiles=[.1, .25, .5, .75, .9]))
```

### 2-3. 분포 형태 (Shape)

```python
skewness = data.skew()    # 왜도: 분포의 비대칭 정도
kurtosis = data.kurtosis()  # 첨도: 분포의 뾰족함 정도

print(f"왜도(Skewness):  {skewness:.4f}")
print(f"첨도(Kurtosis):  {kurtosis:.4f}")
```

```
왜도 해석
  skewness > 0  : 오른쪽 꼬리 (Right-skewed) — 소수의 고소득자, 주가 급등
  skewness < 0  : 왼쪽 꼬리 (Left-skewed)  — 시험 점수 (대부분 높고 일부 낮음)
  skewness ≈ 0  : 대칭 분포

첨도 해석 (초과 첨도 기준)
  kurtosis > 0  : 뾰족한 분포 (Leptokurtic) — 금융 수익률, 꼬리가 두꺼움
  kurtosis < 0  : 납작한 분포 (Platykurtic)
  kurtosis = 0  : 정규분포 (Mesokurtic)
```

### 2-4. 분위수와 박스플롯

```python
import matplotlib.pyplot as plt

fig, axes = plt.subplots(1, 2, figsize=(12, 5))

# 히스토그램 + KDE
data.hist(bins=50, ax=axes[0], color="steelblue", edgecolor="white", density=True)
data.plot.kde(ax=axes[0], color="red", linewidth=2)
axes[0].set_title("분포 히스토그램 + KDE")
axes[0].axvline(mean,   color="red",    linestyle="--", label=f"평균: {mean:.0f}")
axes[0].axvline(median, color="orange", linestyle="--", label=f"중앙값: {median:.0f}")
axes[0].legend()

# 박스플롯
axes[1].boxplot(data.dropna(), patch_artist=True,
                boxprops=dict(facecolor="steelblue", alpha=0.6))
axes[1].set_title("박스플롯 (이상치 탐지)")

plt.tight_layout()
plt.savefig("descriptive_stats.png", dpi=150)
plt.show()
```

---

## 3. 확률과 확률분포

### 3-1. 확률 기초

```
확률의 3가지 해석
  고전적 확률: 동등 가능한 결과 중 사건의 비율
  빈도주의 확률: 무한 반복 시행에서의 상대 빈도
  베이즈 확률: 믿음의 정도 (사전확률 + 새 증거 → 사후확률)

베이즈 정리
  P(A|B) = P(B|A) × P(A) / P(B)

  예: 스팸 필터
  P(스팸|특정단어) = P(특정단어|스팸) × P(스팸) / P(특정단어)
```

### 3-2. 정규분포 (Normal Distribution)

```python
from scipy.stats import norm
import numpy as np
import matplotlib.pyplot as plt

mu, sigma = 0, 1  # 표준 정규분포

x = np.linspace(-4, 4, 1000)
pdf = norm.pdf(x, mu, sigma)   # 확률밀도함수
cdf = norm.cdf(x, mu, sigma)   # 누적분포함수

# 경험적 법칙 (68-95-99.7 Rule)
p_1sigma = norm.cdf(1) - norm.cdf(-1)   # ≈ 0.6827
p_2sigma = norm.cdf(2) - norm.cdf(-2)   # ≈ 0.9545
p_3sigma = norm.cdf(3) - norm.cdf(-3)   # ≈ 0.9973

print(f"±1σ 내 확률: {p_1sigma:.4f} (약 68%)")
print(f"±2σ 내 확률: {p_2sigma:.4f} (약 95%)")
print(f"±3σ 내 확률: {p_3sigma:.4f} (약 99.7%)")

# 표준화 (Z-score 변환)
raw_data = df["price"]
z_scores = (raw_data - raw_data.mean()) / raw_data.std()

# |Z| > 3 인 값은 이상치로 의심
outliers = raw_data[np.abs(z_scores) > 3]
print(f"Z-score 이상치: {len(outliers)}건")

# 정규성 검정
from scipy.stats import shapiro, normaltest

stat, p = shapiro(raw_data.sample(min(5000, len(raw_data))))
print(f"Shapiro-Wilk: stat={stat:.4f}, p={p:.4f}")
print("정규분포 O" if p > 0.05 else "정규분포 X")
```

### 3-3. 이항분포 (Binomial Distribution)

```python
from scipy.stats import binom

# n번 시행, 성공 확률 p
n, p = 100, 0.3   # 100건 거래, 30% 수익 확률

# 정확히 k번 성공할 확률
k = 35
prob_exact = binom.pmf(k, n, p)
print(f"정확히 {k}번 성공: {prob_exact:.4f}")

# k번 이하 성공할 누적 확률
prob_cumul = binom.cdf(k, n, p)
print(f"{k}번 이하 성공: {prob_cumul:.4f}")

# 기댓값과 분산
mean_binom = n * p          # 30
var_binom  = n * p * (1-p)  # 21
print(f"기댓값: {mean_binom}, 분산: {var_binom:.2f}")
```

### 3-4. 포아송 분포 (Poisson Distribution)

단위 시간·공간에서 **드물게 발생하는 사건의 횟수**를 모델링한다.

```python
from scipy.stats import poisson

# λ: 단위 시간당 평균 발생 횟수
lam = 5  # 시간당 평균 5건 이상 거래

# 정확히 k건 발생할 확률
for k in range(0, 11):
    print(f"P(X={k:2d}) = {poisson.pmf(k, lam):.4f}")

# 기댓값 = 분산 = λ (포아송 분포의 특징)
print(f"기댓값: {lam}, 분산: {lam}")

# 활용 예: 콜센터 문의 건수, 시스템 오류 발생 횟수, 금융 사고 건수
```

---

## 4. 표본추출과 중심극한정리

### 4-1. 표본추출 방법

| 방법            | 설명                                | 적합한 상황                    |
| --------------- | ----------------------------------- | ------------------------------ |
| **단순 무작위** | 모든 개체 동등 확률로 추출          | 모집단이 균일한 경우           |
| **층화 추출**   | 모집단을 층으로 나눠 각 층에서 추출 | 부집단 간 차이가 클 때         |
| **군집 추출**   | 군집을 선택하고 군집 내 전수 조사   | 지리적 분산이 클 때            |
| **계통 추출**   | 일정 간격으로 추출 (k번째마다)      | 목록이 있고 순서가 무작위일 때 |

```python
import pandas as pd
import numpy as np

# 단순 무작위 추출
sample_random = df.sample(n=1000, random_state=42)

# 층화 추출 (sector 비율 유지)
sample_stratified = df.groupby("sector", group_keys=False).apply(
    lambda x: x.sample(frac=0.1, random_state=42)
)

# 부트스트랩 (복원 추출 — 신뢰구간 추정에 사용)
bootstrap_means = [
    df["price"].sample(n=500, replace=True).mean()
    for _ in range(10000)
]
ci_lower = np.percentile(bootstrap_means, 2.5)
ci_upper = np.percentile(bootstrap_means, 97.5)
print(f"95% 신뢰구간: [{ci_lower:.2f}, {ci_upper:.2f}]")
```

### 4-2. 중심극한정리 (Central Limit Theorem)

> **모집단의 분포에 관계없이, 표본 크기(n)가 충분히 크면  
> 표본 평균의 분포는 정규분포에 수렴한다.**

```python
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import norm

# 오른쪽으로 심하게 치우친 지수분포 모집단
population = np.random.exponential(scale=2, size=100000)

sample_sizes = [5, 30, 100, 500]
fig, axes = plt.subplots(1, 4, figsize=(16, 4))

for ax, n in zip(axes, sample_sizes):
    # 10,000번 표본 추출 후 각 표본의 평균 계산
    sample_means = [
        np.random.choice(population, size=n, replace=False).mean()
        for _ in range(10000)
    ]

    ax.hist(sample_means, bins=50, density=True,
            color="steelblue", edgecolor="white", alpha=0.7)

    # 이론적 정규분포 오버레이
    mu    = np.mean(population)
    sigma = np.std(population) / np.sqrt(n)  # 표준 오차
    x = np.linspace(min(sample_means), max(sample_means), 200)
    ax.plot(x, norm.pdf(x, mu, sigma), "r-", linewidth=2)
    ax.set_title(f"n = {n}")

plt.suptitle("중심극한정리: 표본 크기에 따른 표본 평균 분포")
plt.tight_layout()
plt.savefig("clt_demo.png", dpi=150)
plt.show()

# n ≥ 30 이면 정규분포로 근사 가능 (경험적 기준)
```

### 4-3. 표준 오차와 신뢰구간

```python
import numpy as np
from scipy.stats import t, norm

sample = df["price"].sample(200, random_state=42)
n      = len(sample)
x_bar  = sample.mean()
s      = sample.std(ddof=1)  # 표본 표준편차 (n-1로 나눔)
se     = s / np.sqrt(n)      # 표준 오차

# 95% 신뢰구간 (t-분포, n이 작을 때)
alpha  = 0.05
t_crit = t.ppf(1 - alpha/2, df=n-1)
ci_lo  = x_bar - t_crit * se
ci_hi  = x_bar + t_crit * se

print(f"표본 평균:    {x_bar:.2f}")
print(f"표준 오차:    {se:.2f}")
print(f"95% 신뢰구간: [{ci_lo:.2f}, {ci_hi:.2f}]")
# → "모집단 평균이 이 구간 안에 있을 확률이 95%"
```

---

## 5. 상관관계 분석

### 5-1. 상관계수

```python
import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt

# 피어슨 상관계수: 선형 관계 (연속형 변수)
corr_pearson = df[numeric_cols].corr(method="pearson")

# 스피어만 상관계수: 순위 기반 (순서형, 이상치에 강건)
corr_spearman = df[numeric_cols].corr(method="spearman")

# 두 변수 간 상관계수 + 유의성 검정
from scipy.stats import pearsonr, spearmanr

r, p = pearsonr(df["price"], df["volume"])
print(f"피어슨 r = {r:.4f},  p-value = {p:.4f}")
print("유의한 상관관계" if p < 0.05 else "유의하지 않음")

# 히트맵 시각화
plt.figure(figsize=(10, 8))
sns.heatmap(
    corr_pearson,
    annot=True, fmt=".2f",
    cmap="RdBu_r", center=0,
    vmin=-1, vmax=1,
    square=True
)
plt.title("상관계수 히트맵")
plt.tight_layout()
plt.savefig("correlation_heatmap.png", dpi=150)
plt.show()
```

### 5-2. 상관관계 해석 주의사항

```
상관관계 강도 해석 (|r| 기준)
  0.0 ~ 0.2 : 거의 없음
  0.2 ~ 0.4 : 약함
  0.4 ~ 0.6 : 보통
  0.6 ~ 0.8 : 강함
  0.8 ~ 1.0 : 매우 강함

⚠️ 상관관계 ≠ 인과관계
  아이스크림 판매량 ↑ ↔ 익사 사고 ↑
  → 공통 원인: 여름(더운 날씨)

⚠️ 허위 상관 (Spurious Correlation)
  무관한 두 변수가 우연히 높은 상관관계를 보임
  → 충분한 데이터와 도메인 지식으로 검증 필요

⚠️ 심슨의 역설 (Simpson's Paradox)
  전체 집단에서의 경향이 부분 집단에서는 반대로 나타남
  → 집단별로 나눠서 분석 필요
```

---

## 6. 선형 회귀 분석

### 6-1. 단순 선형 회귀

```
Y = β₀ + β₁X + ε

Y: 종속 변수 (반응 변수)
X: 독립 변수 (설명 변수)
β₀: 절편 (X=0일 때 Y의 값)
β₁: 기울기 (X 1단위 증가 시 Y 변화량)
ε: 오차항 (설명되지 않는 변동)
```

```python
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import numpy as np
import matplotlib.pyplot as plt

X = df[["volume"]].values    # 2D 배열
y = df["price"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = LinearRegression()
model.fit(X_train, y_train)

print(f"절편 (β₀): {model.intercept_:.4f}")
print(f"기울기 (β₁): {model.coef_[0]:.4f}")

y_pred = model.predict(X_test)

mse  = mean_squared_error(y_test, y_pred)
rmse = np.sqrt(mse)
r2   = r2_score(y_test, y_pred)

print(f"RMSE: {rmse:.4f}")
print(f"R²:   {r2:.4f}")  # 1에 가까울수록 설명력 높음
```

### 6-2. 다중 선형 회귀

```python
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
import pandas as pd

features = ["volume", "market_cap", "pe_ratio", "debt_ratio"]
X = df[features]
y = df["price"]

pipeline = Pipeline([
    ("scaler", StandardScaler()),          # 피처 스케일 통일
    ("model",  LinearRegression()),
])

pipeline.fit(X_train, y_train)

# 회귀 계수 해석 (스케일링 후이므로 상대적 중요도로 해석)
coefs = pd.Series(
    pipeline.named_steps["model"].coef_,
    index=features
).sort_values(key=abs, ascending=False)

print("회귀 계수 (절댓값 기준 정렬):")
print(coefs)
```

### 6-3. 회귀 진단

```python
import matplotlib.pyplot as plt
import numpy as np
from scipy.stats import probplot

residuals = y_test - y_pred

fig, axes = plt.subplots(1, 3, figsize=(15, 5))

# ① 잔차 vs 예측값 (등분산성 확인)
axes[0].scatter(y_pred, residuals, alpha=0.3, color="steelblue")
axes[0].axhline(0, color="red", linestyle="--")
axes[0].set_xlabel("예측값")
axes[0].set_ylabel("잔차")
axes[0].set_title("잔차 vs 예측값\n(패턴 없어야 정상)")

# ② 잔차 분포 (정규성 확인)
axes[1].hist(residuals, bins=50, color="steelblue", edgecolor="white")
axes[1].set_title("잔차 분포\n(정규분포에 가까워야 정상)")

# ③ Q-Q 플롯 (정규성 확인)
probplot(residuals, plot=axes[2])
axes[2].set_title("Q-Q 플롯\n(직선에 가까워야 정상)")

plt.tight_layout()
plt.savefig("regression_diagnostics.png", dpi=150)
plt.show()
```

---

## 7. 데이터 전처리

### 7-1. 결측치 처리

```python
import pandas as pd
import numpy as np

# 결측치 현황 파악
missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(2)
missing_info = pd.DataFrame({"count": missing, "pct": missing_pct})
print(missing_info[missing_info["count"] > 0].sort_values("pct", ascending=False))

# 결측치 처리 전략 선택
# 5% 미만: 행 제거 또는 단순 대체
# 5~30%:  대체 (평균·중앙값·최빈값·모델 기반)
# 30% 이상: 컬럼 제거 or 결측 자체를 피처로 활용

# 단순 대체
df["price"].fillna(df["price"].median(), inplace=True)   # 수치형 → 중앙값
df["sector"].fillna(df["sector"].mode()[0], inplace=True) # 범주형 → 최빈값

# KNN 기반 대체 (더 정교한 방법)
from sklearn.impute import KNNImputer
imputer = KNNImputer(n_neighbors=5)
df[numeric_cols] = imputer.fit_transform(df[numeric_cols])
```

### 7-2. 이상치 처리

```python
# 방법 1: IQR 기반 (분포 기반)
def remove_outliers_iqr(series, factor=1.5):
    q1, q3 = series.quantile([0.25, 0.75])
    iqr = q3 - q1
    lower, upper = q1 - factor * iqr, q3 + factor * iqr
    return series.clip(lower, upper)   # 제거 대신 클리핑 권장

# 방법 2: Z-score 기반 (정규분포 가정)
from scipy.stats import zscore
z = zscore(df["price"].dropna())
df_clean = df[np.abs(z) < 3]

# 방법 3: Isolation Forest (비선형, 다변량)
from sklearn.ensemble import IsolationForest
iso = IsolationForest(contamination=0.05, random_state=42)
outlier_labels = iso.fit_predict(df[numeric_cols].dropna())
df["is_outlier"] = outlier_labels == -1
print(f"이상치 탐지: {df['is_outlier'].sum()}건")
```

### 7-3. 피처 스케일링

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler

# StandardScaler: 평균 0, 표준편차 1 (Z-score 정규화)
# → 정규분포 가정, 이상치에 민감
scaler_std = StandardScaler()

# MinMaxScaler: 0 ~ 1 범위 (최솟값 0, 최댓값 1)
# → 이상치에 민감, 신경망에 주로 사용
scaler_mm = MinMaxScaler()

# RobustScaler: 중앙값·IQR 기반
# → 이상치에 강건
scaler_rb = RobustScaler()

X_scaled = scaler_std.fit_transform(X_train)
```

| 스케일러           | 수식                    | 이상치 강건성 | 추천 상황                 |
| ------------------ | ----------------------- | ------------- | ------------------------- |
| **StandardScaler** | (x - μ) / σ             | 낮음          | 정규분포에 가까운 데이터  |
| **MinMaxScaler**   | (x - min) / (max - min) | 낮음          | 신경망, 범위가 중요할 때  |
| **RobustScaler**   | (x - median) / IQR      | 높음          | 이상치가 많은 금융 데이터 |

### 7-4. 범주형 인코딩

```python
import pandas as pd
from sklearn.preprocessing import LabelEncoder, OrdinalEncoder
from sklearn.preprocessing import OneHotEncoder

# 레이블 인코딩: 순서형 변수 (학점: A=4, B=3, C=2)
le = LabelEncoder()
df["grade_encoded"] = le.fit_transform(df["grade"])

# 순서 인코딩: 명시적 순서 지정
oe = OrdinalEncoder(categories=[["Low", "Medium", "High"]])
df[["risk_encoded"]] = oe.fit_transform(df[["risk_level"]])

# 원핫 인코딩: 명목형 변수 (순서 없는 범주)
ohe = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
sector_encoded = ohe.fit_transform(df[["sector"]])
sector_df = pd.DataFrame(
    sector_encoded,
    columns=ohe.get_feature_names_out(["sector"])
)

# pandas get_dummies (간편 사용)
df_encoded = pd.get_dummies(df, columns=["sector"], drop_first=True)

# 타겟 인코딩: 범주별 타겟 평균으로 대체 (카디널리티 높을 때)
target_mean = df.groupby("sector")["price"].mean()
df["sector_target_encoded"] = df["sector"].map(target_mean)
```

---

## 8. 핵심 개념 요약

| 주제             | 핵심 포인트                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| **데이터 유형**  | 측정 수준(명목·순서·등간·비율)에 따라 적용 가능한 통계 달라짐                            |
| **중심 경향**    | 이상치 많으면 평균 대신 중앙값·절사평균 사용                                             |
| **산포도**       | IQR은 이상치에 강건, 표준편차는 정규분포 가정                                            |
| **정규분포**     | 68-95-99.7 법칙, Z-score로 이상치 탐지                                                   |
| **중심극한정리** | n ≥ 30이면 표본 평균은 정규분포로 근사 가능                                              |
| **상관관계**     | 상관관계 ≠ 인과관계, 허위 상관·심슨의 역설 주의                                          |
| **선형 회귀**    | R²로 설명력 확인, 잔차 분석으로 가정 검토                                                |
| **전처리**       | 결측치→대체 전략 선택, 이상치→IQR·Z-score·IsoForest, 스케일링→RobustScaler (금융 데이터) |

---

## 📎 참고 자료

- [scipy.stats 공식 문서](https://docs.scipy.org/doc/scipy/reference/stats.html)
- [scikit-learn 전처리 가이드](https://scikit-learn.org/stable/modules/preprocessing.html)
- [StatQuest — Statistics Fundamentals](https://www.youtube.com/@statquest)
- [Think Stats (무료 교재)](https://greenteapress.com/wp/think-stats-2e/)
