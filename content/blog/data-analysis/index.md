---
title: "데이터 분석을 위한 Python"
date: "2026-07-20"
category: ["Python", "DataAnalysis"]
description: "데이터 분석 실무에서 자주 쓰이는 Python 핵심 도구 정리. Pydantic 검증 파이프라인, asyncio + httpx 비동기 수집, pytest + ruff 품질 관리, pandas EDA, Polars Lazy · DuckDB SQL 고성능 처리, matplotlib 시각화, t-test · 카이제곱 가설 검정, sklearn Pipeline까지 코드 예시와 함께 정리"
---

# 데이터 분석을 위한 Python — Pydantic · asyncio · pandas · Polars · sklearn 핵심 정리

---

## 0. 전체 흐름 한눈에 보기

데이터 분석 파이프라인은 일반적으로 아래 순서로 흘러간다.

```
[데이터 수집]         [검증 · 정제]        [탐색 · 분석]
asyncio + httpx  →  Pydantic Pipeline  →  pandas EDA
                                          Polars Lazy
                                          DuckDB SQL
                                              │
                                          [시각화]
                                          matplotlib
                                              │
                                          [통계 검정]
                                       t-test · 카이제곱
                                              │
                                          [모델링]
                                       sklearn Pipeline
                                              │
                                       [품질 관리]
                                       pytest + ruff
```

---

## 1. Pydantic 검증 파이프라인

### 1-1. 왜 필요한가?

외부 API나 파일에서 데이터를 받아올 때, 타입이 맞지 않거나 필수 필드가 빠진 경우를 사전에 걸러내지 않으면 분석 도중 예상치 못한 오류가 발생한다. **Pydantic**은 Python 타입 힌트를 기반으로 데이터를 자동 검증·변환해주는 라이브러리다.

### 1-2. 기본 모델 정의

```python
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime

class StockRecord(BaseModel):
    ticker: str
    price: float = Field(gt=0, description="주가 (0 초과)")
    volume: int = Field(ge=0, description="거래량 (0 이상)")
    timestamp: datetime
    sector: Optional[str] = None

    # 커스텀 검증: ticker는 대문자만 허용
    @field_validator("ticker")
    @classmethod
    def ticker_must_be_upper(cls, v: str) -> str:
        if not v.isupper():
            raise ValueError(f"ticker는 대문자여야 합니다: {v}")
        return v

# 사용 예시
record = StockRecord(
    ticker="AAPL",
    price=175.5,
    volume=1000000,
    timestamp="2026-07-20T09:00:00",  # 문자열 → datetime 자동 변환
)
print(record.model_dump())
```

### 1-3. 검증 파이프라인 구성

여러 단계의 검증을 파이프라인으로 연결할 수 있다.

```python
from pydantic import BaseModel, model_validator
from typing import List

class DataPipeline(BaseModel):
    raw_data: List[dict]
    validated: List[StockRecord] = []
    errors: List[dict] = []

    @model_validator(mode="after")
    def validate_records(self) -> "DataPipeline":
        for item in self.raw_data:
            try:
                self.validated.append(StockRecord(**item))
            except Exception as e:
                # 실패한 레코드는 errors에 수집 (전체 파이프라인 중단 방지)
                self.errors.append({"data": item, "error": str(e)})
        return self

# 실행
pipeline = DataPipeline(raw_data=[
    {"ticker": "AAPL", "price": 175.5, "volume": 100, "timestamp": "2026-07-20T09:00:00"},
    {"ticker": "aapl", "price": -1,    "volume": 100, "timestamp": "2026-07-20T09:00:00"},  # 실패
    {"ticker": "MSFT", "price": 420.0, "volume": 200, "timestamp": "2026-07-20T09:01:00"},
])

print(f"성공: {len(pipeline.validated)}건, 실패: {len(pipeline.errors)}건")
# 성공: 2건, 실패: 1건
```

---

## 2. asyncio + httpx — 비동기 데이터 수집

### 2-1. 왜 비동기가 필요한가?

여러 API 엔드포인트에서 동시에 데이터를 수집할 때, 동기 방식은 요청을 순차적으로 처리해 느리다.

```
[동기 방식]
요청 A → 대기 → 응답 A → 요청 B → 대기 → 응답 B  (직렬)
총 시간: T_A + T_B

[비동기 방식]
요청 A ┐
요청 B ┘ → 대기(동시) → 응답 A, 응답 B  (병렬)
총 시간: max(T_A, T_B)
```

### 2-2. httpx 비동기 클라이언트

```python
import asyncio
import httpx
from typing import List

# 단일 종목 데이터 수집
async def fetch_stock(client: httpx.AsyncClient, ticker: str) -> dict:
    url = f"https://api.example.com/stock/{ticker}"
    try:
        response = await client.get(url, timeout=5.0)
        response.raise_for_status()
        return {"ticker": ticker, "data": response.json()}
    except httpx.TimeoutException:
        return {"ticker": ticker, "error": "timeout"}
    except httpx.HTTPStatusError as e:
        return {"ticker": ticker, "error": str(e)}

# 여러 종목 동시 수집
async def fetch_all(tickers: List[str]) -> List[dict]:
    async with httpx.AsyncClient() as client:
        tasks = [fetch_stock(client, ticker) for ticker in tickers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return list(results)

# 실행
tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"]
results = asyncio.run(fetch_all(tickers))
```

### 2-3. 속도 제한 (Rate Limiting)

API 서버에 과부하를 주지 않기 위해 동시 요청 수를 제한한다.

```python
import asyncio
import httpx

# Semaphore로 동시 요청 수 제한 (최대 3개)
async def fetch_with_limit(tickers: list, max_concurrent: int = 3) -> list:
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_one(client, ticker):
        async with semaphore:  # 동시에 max_concurrent개만 실행
            await asyncio.sleep(0.1)  # 요청 간 최소 간격
            return await fetch_stock(client, ticker)

    async with httpx.AsyncClient() as client:
        tasks = [fetch_one(client, t) for t in tickers]
        return await asyncio.gather(*tasks)
```

---

## 3. pytest + ruff — 품질 관리

### 3-1. ruff: 빠른 린터 + 포매터

**ruff**는 기존 flake8, black, isort를 대체하는 초고속 Python 린터다. (Rust로 작성)

```bash
# 설치
pip install ruff

# 린트 검사
ruff check .

# 자동 수정
ruff check . --fix

# 포매팅
ruff format .
```

```toml
# pyproject.toml 설정
[tool.ruff]
line-length = 88
target-version = "py311"

[tool.ruff.lint]
select = [
    "E",   # pycodestyle 오류
    "F",   # pyflakes
    "I",   # isort
    "UP",  # pyupgrade
]
ignore = ["E501"]  # 줄 길이 무시
```

### 3-2. pytest: 데이터 검증 테스트

```python
# tests/test_pipeline.py
import pytest
from pydantic import ValidationError
from myapp.models import StockRecord
from myapp.pipeline import DataPipeline

class TestStockRecord:
    def test_valid_record(self):
        record = StockRecord(
            ticker="AAPL",
            price=175.5,
            volume=1000,
            timestamp="2026-07-20T09:00:00"
        )
        assert record.ticker == "AAPL"
        assert record.price == 175.5

    def test_invalid_ticker_lowercase(self):
        with pytest.raises(ValidationError) as exc_info:
            StockRecord(ticker="aapl", price=175.5, volume=1000,
                       timestamp="2026-07-20T09:00:00")
        assert "대문자" in str(exc_info.value)

    def test_negative_price(self):
        with pytest.raises(ValidationError):
            StockRecord(ticker="AAPL", price=-1.0, volume=1000,
                       timestamp="2026-07-20T09:00:00")

class TestDataPipeline:
    def test_partial_failure(self):
        pipeline = DataPipeline(raw_data=[
            {"ticker": "AAPL", "price": 175.5, "volume": 100,
             "timestamp": "2026-07-20T09:00:00"},
            {"ticker": "invalid", "price": -1, "volume": 100,
             "timestamp": "2026-07-20T09:00:00"},  # 실패 케이스
        ])
        assert len(pipeline.validated) == 1
        assert len(pipeline.errors) == 1

    @pytest.mark.parametrize("price,expected_valid", [
        (0.01, True),
        (0.0,  False),
        (-1.0, False),
        (9999.99, True),
    ])
    def test_price_boundary(self, price, expected_valid):
        data = {"ticker": "TEST", "price": price, "volume": 0,
                "timestamp": "2026-07-20T09:00:00"}
        if expected_valid:
            StockRecord(**data)  # 예외 없어야 함
        else:
            with pytest.raises(ValidationError):
                StockRecord(**data)
```

```bash
# 테스트 실행
pytest tests/ -v

# 커버리지 포함
pytest tests/ --cov=myapp --cov-report=term-missing
```

---

## 4. pandas EDA (탐색적 데이터 분석)

### 4-1. 데이터 로드 및 기본 탐색

```python
import pandas as pd
import numpy as np

df = pd.read_csv("stock_data.csv", parse_dates=["timestamp"])

# 기본 정보 확인
print(df.shape)          # (행 수, 열 수)
print(df.dtypes)         # 각 열의 데이터 타입
print(df.info())         # 결측치 포함 요약
print(df.describe())     # 수치형 통계 요약 (평균, 표준편차, 분위수)
print(df.isnull().sum()) # 열별 결측치 수
```

### 4-2. 결측치 · 이상치 처리

```python
# 결측치 처리
df["price"].fillna(df["price"].median(), inplace=True)  # 중앙값으로 대체
df.dropna(subset=["ticker", "timestamp"], inplace=True) # 필수 컬럼 결측 행 제거

# IQR 기반 이상치 탐지
Q1 = df["price"].quantile(0.25)
Q3 = df["price"].quantile(0.75)
IQR = Q3 - Q1
lower = Q1 - 1.5 * IQR
upper = Q3 + 1.5 * IQR

outliers = df[(df["price"] < lower) | (df["price"] > upper)]
print(f"이상치 {len(outliers)}건 탐지")

# 이상치 제거
df_clean = df[(df["price"] >= lower) & (df["price"] <= upper)]
```

### 4-3. 그룹 집계 · 피벗

```python
# 섹터별 평균 주가
sector_stats = df.groupby("sector").agg(
    avg_price=("price", "mean"),
    total_volume=("volume", "sum"),
    count=("ticker", "count")
).reset_index()

# 날짜 × 섹터 피벗 테이블
pivot = df.pivot_table(
    values="price",
    index=df["timestamp"].dt.date,
    columns="sector",
    aggfunc="mean"
)

# 날짜별 일간 수익률 계산
df = df.sort_values("timestamp")
df["return"] = df.groupby("ticker")["price"].pct_change()
```

### 4-4. 시계열 리샘플링

```python
# 일봉 → 주봉 변환 (OHLCV)
df_weekly = df.set_index("timestamp").groupby("ticker").resample("W")["price"].agg(
    open="first",
    high="max",
    low="min",
    close="last"
).reset_index()
```

---

## 5. Polars Lazy · DuckDB SQL — 고성능 처리

### 5-1. Polars Lazy API

**Polars**는 Rust 기반의 고성능 DataFrame 라이브러리다. **Lazy API**를 사용하면 실행 계획을 최적화한 뒤 한 번에 처리한다.

```python
import polars as pl

# Lazy 모드로 읽기 (실제 실행은 collect() 호출 시)
lf = pl.scan_csv("stock_data.csv")

result = (
    lf
    .filter(pl.col("price") > 0)                            # 필터
    .with_columns([
        (pl.col("price") * pl.col("volume")).alias("turnover"),  # 파생 컬럼
        pl.col("timestamp").str.to_datetime().alias("timestamp"),
    ])
    .group_by("sector")
    .agg([
        pl.col("price").mean().alias("avg_price"),
        pl.col("turnover").sum().alias("total_turnover"),
        pl.col("ticker").n_unique().alias("unique_tickers"),
    ])
    .sort("total_turnover", descending=True)
    .collect()  # 여기서 실제 실행 + 최적화
)

print(result)
```

### 5-2. pandas vs Polars 성능 비교

| 항목 | pandas | Polars (Lazy) |
|---|---|---|
| 언어 | Python (NumPy 기반) | Rust |
| 실행 방식 | 즉시 실행 | 지연 실행 + 쿼리 최적화 |
| 멀티코어 | 제한적 | 자동 병렬 처리 |
| 메모리 | 높음 | 낮음 (스트리밍 지원) |
| 문법 친숙도 | 높음 | 중간 |

> 수십만 행 이하: pandas로 충분  
> 수백만 행 이상: Polars Lazy 사용 권장

### 5-3. DuckDB SQL

**DuckDB**는 파일이나 DataFrame에 직접 SQL을 실행할 수 있는 인메모리 분석 데이터베이스다.

```python
import duckdb
import pandas as pd

df = pd.read_csv("stock_data.csv")

# pandas DataFrame에 직접 SQL 실행
result = duckdb.query("""
    SELECT
        sector,
        AVG(price)                          AS avg_price,
        SUM(price * volume)                 AS total_turnover,
        PERCENTILE_CONT(0.5)
            WITHIN GROUP (ORDER BY price)   AS median_price,
        COUNT(DISTINCT ticker)              AS unique_tickers
    FROM df
    WHERE price > 0
    GROUP BY sector
    ORDER BY total_turnover DESC
    LIMIT 10
""").df()  # pandas DataFrame으로 반환

# CSV / Parquet 파일에 직접 SQL
result2 = duckdb.query("""
    SELECT ticker, MAX(price) - MIN(price) AS price_range
    FROM read_csv_auto('stock_data.csv')
    GROUP BY ticker
    HAVING COUNT(*) > 30
""").df()
```

---

## 6. matplotlib — 데이터 시각화

```python
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import pandas as pd
import numpy as np

fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle("주식 데이터 EDA", fontsize=16, fontweight="bold")

# ① 주가 히스토그램
axes[0, 0].hist(df["price"], bins=50, color="steelblue", edgecolor="white", alpha=0.8)
axes[0, 0].set_title("주가 분포")
axes[0, 0].set_xlabel("가격")
axes[0, 0].set_ylabel("빈도")

# ② 섹터별 평균 주가 막대 그래프
sector_avg = df.groupby("sector")["price"].mean().sort_values(ascending=False)
axes[0, 1].bar(sector_avg.index, sector_avg.values, color="coral")
axes[0, 1].set_title("섹터별 평균 주가")
axes[0, 1].tick_params(axis="x", rotation=45)

# ③ 시계열 라인 차트 (특정 종목)
aapl = df[df["ticker"] == "AAPL"].sort_values("timestamp")
axes[1, 0].plot(aapl["timestamp"], aapl["price"], linewidth=1.5, color="green")
axes[1, 0].set_title("AAPL 주가 추이")
axes[1, 0].xaxis.set_major_formatter(mticker.MaxNLocator(5))

# ④ 박스플롯 (이상치 시각화)
sectors = df["sector"].dropna().unique()[:5]
data_by_sector = [df[df["sector"] == s]["price"].dropna() for s in sectors]
axes[1, 1].boxplot(data_by_sector, labels=sectors, patch_artist=True)
axes[1, 1].set_title("섹터별 주가 분포 (박스플롯)")
axes[1, 1].tick_params(axis="x", rotation=30)

plt.tight_layout()
plt.savefig("eda_report.png", dpi=150, bbox_inches="tight")
plt.show()
```

---

## 7. 가설 검정 기초 — t-test와 카이제곱

### 7-1. 가설 검정 기본 개념

```
귀무가설 (H₀): 차이가 없다 (기본 가정)
대립가설 (H₁): 차이가 있다 (증명하려는 것)

p-value < 0.05 → 귀무가설 기각 → 통계적으로 유의미한 차이 있음
p-value ≥ 0.05 → 귀무가설 채택 → 차이가 없다고 볼 수 없음
```

### 7-2. t-test (두 집단 평균 비교)

수치형 데이터 두 집단의 **평균 차이**가 통계적으로 유의미한지 검정한다.

```python
from scipy import stats
import numpy as np

# 예: 테크 섹터 vs 금융 섹터의 평균 주가 차이가 유의미한가?
tech   = df[df["sector"] == "Technology"]["price"].dropna()
finance = df[df["sector"] == "Finance"]["price"].dropna()

# 독립 표본 t-test (두 집단이 독립적인 경우)
t_stat, p_value = stats.ttest_ind(tech, finance, equal_var=False)  # Welch's t-test

print(f"t-통계량: {t_stat:.4f}")
print(f"p-value:  {p_value:.4f}")

if p_value < 0.05:
    print("✅ 두 섹터의 평균 주가 차이는 통계적으로 유의미합니다.")
else:
    print("❌ 두 섹터의 평균 주가 차이는 통계적으로 유의미하지 않습니다.")

# 효과 크기 (Cohen's d)
pooled_std = np.sqrt((tech.std()**2 + finance.std()**2) / 2)
cohens_d = (tech.mean() - finance.mean()) / pooled_std
print(f"Cohen's d: {cohens_d:.4f}  (|d| > 0.8 = 큰 효과)")
```

### 7-3. 카이제곱 검정 (범주형 변수 간 독립성)

두 범주형 변수 사이의 **관계(연관성)** 가 통계적으로 유의미한지 검정한다.

```python
from scipy.stats import chi2_contingency
import pandas as pd

# 예: 섹터(sector)와 수익 여부(profitable)는 연관이 있는가?
df["profitable"] = df["return"] > 0

contingency = pd.crosstab(df["sector"], df["profitable"])
print(contingency)
#              False  True
# sector
# Finance         45    55
# Technology      30    70
# ...

chi2, p_value, dof, expected = chi2_contingency(contingency)

print(f"카이제곱 통계량: {chi2:.4f}")
print(f"자유도:          {dof}")
print(f"p-value:         {p_value:.4f}")

if p_value < 0.05:
    print("✅ 섹터와 수익 여부 사이에 유의미한 연관성이 있습니다.")
else:
    print("❌ 섹터와 수익 여부 사이에 유의미한 연관성이 없습니다.")
```

### 7-4. t-test vs 카이제곱 선택 기준

| 검정 | 사용 시점 | 변수 유형 |
|---|---|---|
| **독립 표본 t-test** | 두 집단의 평균 비교 | 수치형 vs 수치형 |
| **대응 표본 t-test** | 동일 집단 전후 비교 | 수치형 vs 수치형 |
| **카이제곱 검정** | 두 범주형 변수의 연관성 | 범주형 vs 범주형 |

---

## 8. sklearn Pipeline — 모델링 자동화

### 8-1. Pipeline이 필요한 이유

전처리와 모델을 분리하면 **데이터 누수(Data Leakage)** 와 **코드 중복** 문제가 생긴다.

```
[Pipeline 없이]
train 전처리 → train 학습
test  전처리 → test  예측
(전처리 코드 중복, train 통계를 test에 적용했는지 불분명)

[Pipeline 사용]
Pipeline.fit(train)    → 전처리 + 학습 한 번에
Pipeline.predict(test) → 동일한 전처리 자동 적용 보장
```

### 8-2. 기본 Pipeline 구성

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report
import pandas as pd

# 피처 / 타겟 분리
X = df[["price", "volume", "sector", "market_cap"]]
y = (df["return"] > 0).astype(int)  # 수익 여부 (이진 분류)

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 수치형 / 범주형 열 분리
numeric_features  = ["price", "volume", "market_cap"]
categorical_features = ["sector"]

# 수치형 전처리: 결측치 → 중앙값 대체 → 표준화
numeric_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler",  StandardScaler()),
])

# 범주형 전처리: 결측치 → 최빈값 대체 → 원핫 인코딩
categorical_transformer = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
])

# 전처리 통합
preprocessor = ColumnTransformer([
    ("num", numeric_transformer,  numeric_features),
    ("cat", categorical_transformer, categorical_features),
])

# 최종 Pipeline: 전처리 + 분류 모델
pipeline = Pipeline([
    ("preprocessor", preprocessor),
    ("classifier",   RandomForestClassifier(n_estimators=100, random_state=42)),
])

# 학습
pipeline.fit(X_train, y_train)

# 평가
y_pred = pipeline.predict(X_test)
print(classification_report(y_test, y_pred))

# 교차 검증
cv_scores = cross_val_score(pipeline, X, y, cv=5, scoring="f1")
print(f"CV F1: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
```

### 8-3. 하이퍼파라미터 튜닝

```python
from sklearn.model_selection import GridSearchCV

param_grid = {
    "classifier__n_estimators": [50, 100, 200],
    "classifier__max_depth":    [None, 5, 10],
    "classifier__min_samples_split": [2, 5],
}

grid_search = GridSearchCV(
    pipeline,
    param_grid,
    cv=5,
    scoring="f1",
    n_jobs=-1,   # 모든 CPU 코어 사용
    verbose=1,
)
grid_search.fit(X_train, y_train)

print(f"최적 파라미터: {grid_search.best_params_}")
print(f"최적 CV F1:    {grid_search.best_score_:.4f}")

# 최적 모델로 최종 평가
best_model = grid_search.best_estimator_
y_pred_best = best_model.predict(X_test)
print(classification_report(y_test, y_pred_best))
```

---

## 9. 전체 도구 선택 가이드

| 상황 | 권장 도구 |
|---|---|
| 외부 API 병렬 수집 | `asyncio` + `httpx` |
| 수집 데이터 타입·유효성 검증 | `Pydantic` |
| 수십만 행 이하 EDA | `pandas` |
| 수백만 행 이상 대용량 처리 | `Polars Lazy` |
| SQL 익숙한 팀과 협업 | `DuckDB` |
| 데이터 시각화 | `matplotlib` (기본) |
| 두 집단 평균 비교 | `scipy.stats.ttest_ind` |
| 범주형 변수 연관성 | `scipy.stats.chi2_contingency` |
| ML 모델 전처리 + 학습 | `sklearn Pipeline` |
| 코드 품질 관리 | `ruff` + `pytest` |

---

## 📎 참고 자료

- [Pydantic 공식 문서](https://docs.pydantic.dev/)
- [httpx 공식 문서](https://www.python-httpx.org/)
- [Polars 공식 문서](https://docs.pola.rs/)
- [DuckDB 공식 문서](https://duckdb.org/docs/)
- [scikit-learn Pipeline 가이드](https://scikit-learn.org/stable/modules/compose.html)
- [ruff 공식 문서](https://docs.astral.sh/ruff/)