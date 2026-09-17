---
title: "모델 서빙과 AIOps 이해"
date: "2026-09-17"
category: ["MLOps", "LLMOps", "AIOps", "Model Serving"]
description: "학습된 모델을 재현 가능한 Artifact로 저장하고 FastAPI, Airflow, KServe, Ray Serve, vLLM, Kubeflow로 서비스한 뒤 MLflow, LGTM, LangSmith와 AIOps로 관찰·관리·자동화하는 전체 구조를 정리"
---


# 모델 서빙과 AIOps 이해 — 모델 저장부터 관찰성, 이상 탐지와 안전한 자동화까지

머신러닝 모델의 개발이 끝났다는 말은 보통 학습과 평가가 끝났다는 뜻이다. 그러나 실제 사용자가 모델을 이용하려면 그 뒤에 더 긴 과정이 필요하다. 모델과 전처리 정보를 저장하고, 새로운 프로세스에서 복원하며, API 요청을 검증하고, 동시 요청을 처리해야 한다. 모델이 많아지면 학습과 배포 과정을 자동화해야 하고, 운영 중에는 성능 저하와 장애를 관찰해야 한다.

모델 서빙은 단순히 `predict()`를 HTTP Endpoint로 감싸는 작업이 아니다. **학습 결과를 반복 가능하고 관찰 가능하며 안전하게 변경할 수 있는 서비스로 만드는 과정**이다.

```text
데이터와 코드
  → 모델 학습·평가
  → 모델과 전처리 Artifact 저장
  → API 서빙
  → Workflow 오케스트레이션
  → Kubernetes 기반 배포·확장
  → 실험과 모델 버전 관리
  → Metric·Log·Trace 관찰
  → 이상 탐지와 원인 분석
  → Guardrail을 적용한 운영 조치
```

이 글은 도구의 실행 명령을 순서대로 나열하기보다, 이 과정에서 각 기술이 어떤 문제를 해결하며 서로 어떻게 연결되는지를 설명한다.

## 1. 모델 학습과 모델 서빙은 다른 문제다

학습은 데이터로부터 모델의 파라미터를 찾는 과정이다. 서빙은 학습된 결과를 반복적인 요청에 안정적으로 제공하는 과정이다.

```text
학습
데이터 → 전처리 → train → evaluate → 모델 Artifact

서빙
요청 → 입력 검증 → 전처리 → inference → 후처리 → 응답
```

| 구분 | 학습 | 서빙 |
|---|---|---|
| 입력 | 학습 Dataset | 개별 요청 또는 Batch |
| 출력 | 모델과 평가 결과 | 예측값·확률·생성 결과 |
| 실행 방식 | 주기적 Job | 지속 실행 Service 또는 예약 Job |
| 주요 지표 | Accuracy, Loss, F1 | Latency, Throughput, Error Rate, Availability |
| 실패 영향 | 새 모델 생성 실패 | 사용자 요청 실패 또는 잘못된 의사결정 |

평가 점수가 높은 모델도 운영 환경에서는 실패할 수 있다. 학습 때와 전처리가 다르거나, Library Version이 맞지 않거나, 요청 Schema가 틀리거나, 동시 요청으로 Memory가 부족해질 수 있다. 모델의 품질과 서비스의 품질을 함께 관리해야 하는 이유다.

## 2. 재현 가능한 모델 Artifact 만들기

### 모델만 저장해서는 충분하지 않다

학습된 모델 파일은 배포에 필요한 정보의 일부다. 운영 환경에서 같은 결과를 얻으려면 다음 항목을 함께 관리해야 한다.

```text
모델 Artifact
+ 전처리·후처리 정보
+ Feature 순서와 입력 Schema
+ Code와 Data Version
+ Library·Runtime Version
+ Hyperparameter와 Random Seed
+ 실행 환경
```

학습에서는 표준화를 적용했는데 서빙에서는 원본 값을 바로 모델에 넣으면, 모델 파일이 같아도 예측은 달라진다. `scaler.npz` 같은 전처리 Artifact가 모델만큼 중요한 이유다.

### 저장 형식의 차이

| 형식 | 주요 대상 | 특징 | 주의점 |
|---|---|---|---|
| pickle/joblib | Python 객체, scikit-learn | 사용이 간단하고 객체 상태를 보존 | Python·Library Version 의존, 신뢰할 수 없는 파일의 Code 실행 위험 |
| TorchScript | PyTorch 모델 | 연산 구조를 실행 가능한 Graph로 저장 | 지원 연산과 PyTorch Version 검증 필요 |
| `.keras` | Keras 모델 | 구조와 Weight를 함께 복원하기 편리 | Custom Layer·Function과 Backend 호환성 확인 |
| ONNX | Framework 간 교환 | 학습 Framework와 추론 Runtime 분리 | 변환 가능한 연산과 출력 동등성 검증 필요 |

TorchScript는 모델의 연산 구조를 저장하므로 원래 Python Model Class가 없는 프로세스에서도 로드할 수 있다. Keras 기본 Layer로 만든 모델 역시 `.keras` 파일에서 구조와 Weight를 복원할 수 있다. 반면 pickle은 Python 객체 직렬화이므로 환경 의존성이 크다.

### 저장·복원의 검증 기준

저장이 성공했다는 메시지만으로는 충분하지 않다. 새로운 프로세스에서 다음 검증을 수행해야 한다.

```text
학습 직후 예측
   vs
저장 → 새 프로세스에서 로드 → 같은 입력으로 예측
```

두 출력이 같거나 허용 오차 안에 있어야 한다. 이 검증은 Artifact가 실제 배포 경계를 넘어 사용 가능한지를 확인한다.

### 재현성과 Seed

재현성은 같은 조건에서 실행했을 때 같은 결과를 얻을 수 있는 성질이다.

```python
random_state = 42
```

Seed를 고정하면 데이터 분할, Weight 초기화, Sampling 같은 난수 과정을 통제할 수 있다. 하지만 Seed 하나가 모든 비결정성을 제거하지는 않는다. GPU Kernel, 병렬 연산, Hardware와 Library Version도 결과에 영향을 줄 수 있다.

## 3. 모델을 HTTP API로 제공하기

가장 단순한 모델 서비스는 FastAPI 같은 Web Framework에서 모델을 불러와 `/predict` Endpoint로 제공하는 구조다.

```text
Service Startup
  → 모델과 전처리 Artifact 로드
  → 준비 상태 확인

POST /predict
  → JSON Schema 검증
  → 전처리
  → Model Inference
  → 후처리
  → JSON 응답
```

### Lifespan에서 모델을 한 번 로드한다

요청마다 모델 파일을 다시 읽으면 Disk I/O와 역직렬화가 반복된다. 모델은 Application Process가 시작될 때 한 번 메모리에 올리고 요청마다 재사용하는 편이 적합하다.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    state["model"] = load_model("model.pkl")
    state["scaler"] = load_scaler("scaler.npz")
    yield
    state.clear()

app = FastAPI(lifespan=lifespan)
```

여기서 “한 번”은 서버 전체가 아니라 **Process마다 한 번**이다. Uvicorn Worker가 네 개면 네 Process가 각자 Model과 Scaler를 로드한다.

### Health Endpoint의 역할

Health Check는 Process가 실행 중인지뿐 아니라 요청을 처리할 준비가 되었는지를 구분해야 한다.

| 검사 | 질문 |
|---|---|
| Liveness | Process가 멈추거나 교착 상태인가? |
| Readiness | Model과 의존 서비스가 준비되어 요청을 받을 수 있는가? |
| Startup | 큰 모델을 로드하는 초기 구간이 끝났는가? |

Model File을 아직 읽는 중인 Process에 Traffic을 보내면 초기 요청이 실패할 수 있다. Kubernetes에서는 Startup Probe와 Readiness Probe로 이를 제어할 수 있다.

### HTTP 오류를 구분한다

| 상태 코드 | 모델 API에서의 의미 |
|---|---|
| 400 | Feature 값이나 차원이 잘못됨 |
| 401/403 | 인증 또는 권한 문제 |
| 404 | Endpoint나 Model Version을 찾지 못함 |
| 422 | Request Body가 Schema와 맞지 않음 |
| 429 | 동시 요청·Rate Limit 초과 |
| 500 | Model Load, 전처리, 추론 중 내부 예외 |
| 503 | 준비된 Replica가 없거나 과부하 상태 |

Client 입력 오류와 Server 내부 오류를 구분해야 장애 분석과 재시도 정책을 올바르게 설계할 수 있다.

## 4. Worker, GIL과 성능 지표

### Worker는 독립 Process다

CPython의 GIL은 한 Process 안에서 한 시점에 하나의 Thread만 Python Bytecode를 실행하도록 제한한다. CPU 중심의 Python 작업에서는 Thread만 늘려도 여러 Core를 충분히 사용하지 못할 수 있다.

```text
Worker 1 Process → Python Interpreter 1 → GIL 1 → Model Copy 1
Worker 2 Process → Python Interpreter 2 → GIL 2 → Model Copy 2
```

여러 Worker는 독립 GIL을 가지므로 병렬 처리 범위를 넓힌다. 다만 Worker 수를 네 배로 늘린다고 처리량이 정확히 네 배가 되지는 않는다.

- CPU Core 수
- Model 연산 특성
- PyTorch·NumPy 내부 Thread
- Memory와 Model 크기
- I/O와 Network
- 부하 생성기의 한계

이 요소들이 함께 결과를 결정한다. Worker마다 Model을 별도로 로드하므로 Memory 사용량도 증가한다.

### Throughput과 Latency

| 지표 | 의미 | 단위 예시 |
|---|---|---|
| Throughput | 단위 시간에 처리한 요청 | req/s, token/s |
| Latency | 요청 하나의 응답 시간 | ms, s |
| Concurrency | 동시에 처리 중인 요청 수 | requests |
| Queue Time | 실행 전에 기다린 시간 | ms |

평균 Latency만으로는 느린 일부 요청을 찾기 어렵다.

- P50: 절반의 요청이 이 시간 안에 완료
- P95: 95%의 요청이 이 시간 안에 완료
- P99: 99%의 요청이 이 시간 안에 완료

P99가 크다는 것은 소수의 사용자가 매우 느린 응답을 경험한다는 뜻이다. 평균과 함께 Tail Latency를 관찰해야 한다.

## 5. 학습과 배포 과정을 Workflow로 만들기

모델 Lifecycle은 여러 단계의 의존성을 가진다.

```text
데이터 수집
  → 검증
  → 전처리
  → 학습
  → 평가
  → 승인
  → Registry 등록
  → 배포
```

앞 단계가 실패했는데 뒤 단계가 실행되면 잘못된 모델이 배포될 수 있다. Workflow Orchestrator는 작업 순서, 재시도, Scheduling, 상태와 실행 이력을 관리한다.

### Airflow의 DAG

DAG는 Directed Acyclic Graph, 즉 방향은 있지만 순환은 없는 작업 그래프다.

```text
extract → transform → train → evaluate → register
```

Cycle이 있으면 어떤 Task를 먼저 시작해야 하는지 결정할 수 없으므로 Airflow는 DAG Parsing 과정에서 순환을 거부한다.

| 구성요소 | 역할 |
|---|---|
| Scheduler | 일정과 의존성을 확인해 실행 대상을 결정 |
| Executor | Task를 어떤 방식으로 실행할지 결정 |
| Worker | 실제 Task 실행 |
| Triggerer | 비동기 대기와 Event 처리 |
| Metadata DB | DAG Run과 Task 상태 저장 |

### XCom은 작은 값만 전달한다

XCom은 Task 사이에 실행 ID, 정확도, Object Storage 경로 같은 작은 Metadata를 전달한다. 큰 DataFrame이나 Model Binary를 넣으면 Metadata DB가 비대해지고 직렬화 비용이 커진다.

```text
큰 Dataset·Model → Object Storage
Task 간 전달      → 저장 위치 URI
```

### Sensor와 Asset

| 구분 | Sensor | Asset |
|---|---|---|
| 동작 | 조건을 주기적으로 확인 | Data 갱신 Event로 DAG 실행 |
| 관점 | Task 수준 대기 | Dataset 의존성 |
| 비유 | Pull·Polling | Push·Event |

Asset 기반 Scheduling은 “언제 실행할까”보다 “어떤 Data가 갱신됐는가”를 중심으로 Workflow를 연결한다.

### 멱등성

Workflow Task는 같은 입력으로 다시 실행해도 중복과 손상을 만들지 않도록 설계해야 한다.

- 실행 ID를 Output 경로에 포함한다.
- 이미 존재하는 결과를 어떻게 처리할지 정한다.
- Upsert나 Atomic Write를 사용한다.
- 중간 실패 후 재시작할 지점을 명확히 한다.

## 6. Kubernetes에서 모델을 선언적으로 서빙하기

직접 `docker run`으로 Container를 실행하면 재시작, Replica, Network와 배포를 사용자가 관리해야 한다. Kubernetes는 원하는 상태를 선언하고 Controller가 실제 상태를 그 상태로 수렴시킨다.

```text
사용자: 모델 Service Replica를 2개 유지하라
Controller:
  현재 1개 → 1개 추가
  Pod 장애 → 새 Pod 생성
  Image 변경 → Rolling Update
```

### KServe의 InferenceService

KServe는 Kubernetes 위에서 Model Serving에 필요한 Resource를 모델 중심의 API로 추상화한다.

```text
InferenceService
  ├─ Predictor: Model Inference
  ├─ Transformer: 전처리·후처리
  └─ Explainer: 설명 가능성
```

| Resource | 역할 |
|---|---|
| InferenceService | Model 위치, Runtime, Resource와 확장 정책 선언 |
| ServingRuntime | 특정 Model Format을 실행하는 Container 규격 |
| ClusterServingRuntime | Cluster 전체에서 공유하는 Runtime |

`modelFormat`이 `sklearn`이면 KServe는 이를 지원하는 Runtime을 찾아 배치한다. Storage Initializer는 Object Storage의 Model을 내려받아 공유 경로에 놓고, Runtime Container가 그 경로에서 Model을 읽는다.

```text
Object Storage
   ↓ storage-initializer
/mnt/models
   ↓
Serving Runtime
```

### Standard와 Serverless Mode

| 구분 | Standard | Serverless |
|---|---|---|
| 기반 | Kubernetes Deployment·Service | Knative Serving |
| Scale-to-Zero | 기본 제공하지 않음 | 가능 |
| 장점 | 구조가 단순하고 예측 가능 | 유휴 비용 절감과 Request 기반 확장 |
| 고려사항 | 최소 Replica 비용 | Cold Start와 큰 Model Load 시간 |

Scale-to-Zero는 Traffic이 없을 때 비용을 줄이지만 첫 요청은 Pod 시작과 Model Download를 기다려야 한다. 큰 Model에서는 최소 Replica, Model Cache와 사전 로딩 전략이 필요하다.

### V1 Predict Protocol

KServe의 대표적인 요청·응답 형태는 Batch를 고려한다.

```json
{
  "instances": [
    [5.1, 3.5, 1.4, 0.2],
    [6.7, 3.0, 5.2, 2.3]
  ]
}
```

```json
{
  "predictions": [0, 2]
}
```

`instances`는 Batch × Feature 구조이고, `predictions`는 각 Sample의 결과다.

## 7. Ray Serve와 분산 Model Composition

Ray는 Python Task와 Actor를 여러 CPU·GPU Node에서 실행하는 분산 Framework다. Ray Serve는 그 위에서 Online Inference Service를 구성한다.

```text
Ray Serve
  ├─ Controller: Deployment 상태 관리
  ├─ HTTP Proxy: Request 진입점
  ├─ Deployment: 논리적 Service 단위
  └─ Replica: Actor로 실행되는 Instance
```

Ray Serve의 Deployment는 Kubernetes Deployment와 다른 개념이다. Ray 내부에서 Function이나 Class를 Replica로 실행하는 논리적 단위다.

```python
from ray import serve

@serve.deployment(num_replicas=2)
class Predictor:
    def __init__(self):
        self.model = load_model()

    async def __call__(self, request):
        data = await request.json()
        return self.model.predict(data)
```

Ray Serve는 전처리, 여러 Model, 후처리를 Python 코드로 조합하고 각 단계를 독립적으로 확장할 때 유용하다.

```text
Request
  → Preprocessor 4 Replicas
  → GPU Model 2 Replicas
  → Postprocessor 2 Replicas
```

## 8. vLLM과 LLM 추론 최적화

분류 Model은 보통 한 번의 Forward Pass로 결과를 낸다. LLM은 Prompt를 처리한 뒤 Token을 하나씩 반복 생성한다.

```text
Prompt Token 처리: Prefill
  → 첫 Token
  → KV Cache를 사용해 Decode 반복
  → 종료 조건
```

### KV Cache와 PagedAttention

LLM은 이전 Token의 Attention Key·Value를 KV Cache에 저장한다. 요청 길이와 동시 사용자가 늘면 KV Cache가 GPU Memory의 큰 부분을 차지한다.

PagedAttention은 KV Cache를 고정 크기 Block으로 나누고 필요한 Block을 연결해 사용한다.

```text
Logical Token Sequence
  → Block Table
  → GPU Memory의 분산된 KV Blocks
```

연속된 큰 Memory 공간을 미리 확보하지 않아도 되므로 Memory 단편화와 낭비를 줄인다.

### Continuous Batching

정적 Batch는 가장 긴 요청이 끝날 때까지 다른 요청이 기다릴 수 있다. Continuous Batching은 Decode 단계마다 완료된 요청을 빼고 새 요청을 넣는다.

```text
Step 1: A, B, C
Step 2: A 완료 → D 투입, B·C 계속
Step 3: B 완료 → E 투입, C·D 계속
```

GPU에 처리할 Token을 계속 공급해 전체 처리량을 높인다.

### LLM Service에서 관찰할 지표

- TTFT(Time To First Token)
- ITL(Inter-Token Latency)
- End-to-End Latency
- Input·Output Tokens per Second
- Queue Time
- KV Cache 사용률
- GPU Memory와 Utilization

Streaming은 사용자가 첫 Token을 빨리 보게 할 수 있지만 전체 생성 시간이 자동으로 줄어드는 것은 아니다.

## 9. Kubeflow Pipelines와 ML Workflow

Kubeflow는 Kubernetes 위에서 ML 개발·학습·Pipeline·Serving을 구성하는 Platform이다.

```text
Notebook에서 개발
  → Pipeline Component Container화
  → KFP가 Step을 Pod로 실행
  → Artifact와 Metric 저장
  → 평가 조건 통과
  → KServe 배포
```

### Airflow와 KFP 비교

| 구분 | Airflow | Kubeflow Pipelines |
|---|---|---|
| 중심 목적 | 범용 Workflow | ML Workflow |
| 실행 단위 | Python·Bash 등의 Task | Container Component |
| Artifact | XCom과 외부 Storage 조합 | Dataset·Model·Metrics Type |
| 조건부 실행 | Branch Operator 등 | `dsl.If` |
| Cluster 실행 | Executor 구성에 따라 다름 | Argo Workflow의 Pod |

KFP에서 Python DSL은 Pipeline 실행 자체가 아니다. DSL을 IR로 Compile한 뒤 Backend가 Kubernetes Workflow로 변환해 각 Component를 Pod로 실행한다.

```text
Python DSL
  → Compile
  → Pipeline IR
  → Argo Workflow
  → Kubernetes Pods
```

`dsl.If` 조건은 Workflow의 `when`과 같은 조건부 실행 구조로 변환된다.

### Artifact는 일회성 Pod 밖에 저장한다

Pipeline Pod는 작업이 끝나면 사라진다. Model과 Dataset은 Object Storage나 Persistent Storage에 저장하고 다음 Step에는 URI와 Metadata를 전달한다.

```text
Step A Pod → Model Artifact → Object Storage
Step B Pod ← Artifact URI  ← Metadata
```

## 10. MLflow로 실험에서 운영 모델까지 관리하기

실험이 많아지면 File 이름만으로 모델을 관리하기 어렵다. 어떤 Parameter가 어떤 Metric과 Artifact를 만들었는지, 운영에서 어떤 Version을 사용해야 하는지 추적할 체계가 필요하다.

```text
Training Code
  │ Params, Metrics, Artifacts
  ▼
MLflow Tracking Server
  ├─ Backend Store: Run Metadata
  ├─ Artifact Store: Model·Image·Report
  └─ Model Registry: Version·Alias·Tag
```

### 핵심 개념

| 개념 | 의미 |
|---|---|
| Experiment | 관련 Run을 묶는 그룹 |
| Run | 학습·평가 한 번의 기록 |
| Parameter | 실행 전에 정한 설정 |
| Metric | 실행 후 측정한 숫자 결과 |
| Artifact | Model, Image, Report 같은 File |
| Registered Model | Registry의 논리적 Model 이름 |
| Model Version | 등록할 때 생성되는 Version |
| Alias | 특정 Version을 가리키는 이동 가능한 이름 |
| Tag | 검색·설명을 위한 Key-Value Metadata |

### Model URI와 Alias

| URI | 의미 |
|---|---|
| `runs:/<run-id>/model` | 특정 Run의 Model Artifact |
| `models:/<name>/<version>` | Registry의 특정 불변 Version |
| `models:/<name>@champion` | `champion` Alias가 가리키는 Version |

Alias를 사용하면 Application은 Version 번호를 고정하지 않아도 된다. 더 좋은 Model을 운영에 승격할 때 Alias만 새 Version으로 이동한다.

### Round-trip 검증

```text
Model 저장
  → Registry 등록
  → Alias 지정
  → Alias URI로 다시 Load
  → 실제 Predict
```

등록 화면이 보이는 것만 확인하지 않고, 운영에서 사용할 URI로 다시 읽어 실제 추론까지 수행해야 Artifact 저장과 Registry 경로 전체를 검증할 수 있다.

## 11. Monitoring에서 Observability로

Monitoring은 미리 정의한 지표와 임계값으로 알려진 문제를 감시한다. Observability는 시스템이 내보내는 신호를 이용해 예상하지 못한 문제의 내부 상태까지 추론하는 능력이다.

### 관찰성의 세 신호

| 신호 | 답하는 질문 | 예시 |
|---|---|---|
| Metric | 얼마나 많이·빠르게 발생했는가? | 요청 수, Error Rate, Latency |
| Log | 구체적으로 무슨 일이 일어났는가? | 요청 성공·실패와 Error Message |
| Trace | 요청이 어디를 거쳤는가? | Service 호출과 Span별 시간 |

```text
Metric: Error Rate가 증가했다.
  → Log: 어떤 요청이 어떤 오류로 실패했는가?
  → Trace: 그 요청의 어느 Span에서 지연·실패했는가?
```

Metric은 이상을 빠르게 발견하고, Log와 Trace는 원인을 좁히는 문맥을 제공한다.

## 12. LGTM Stack의 데이터 흐름

| 구성요소 | 역할 |
|---|---|
| Prometheus | `/metrics`를 주기적으로 Scrape |
| Mimir | Prometheus Metric 장기 저장 |
| Loki | Log 저장·조회 |
| Tempo | Trace 저장·조회 |
| Alloy | OpenTelemetry 신호 수집과 Routing |
| Grafana | 여러 Backend를 Query하고 시각화 |

### Metric 경로

```text
Application /metrics
      ↑ Prometheus Scrape: Pull
Prometheus
      └─ Remote Write: Push → Mimir
Grafana ── Query → Mimir
```

### Log와 Trace 경로

```text
Application
  └─ OTLP Push → Alloy
                   ├─ Log → Loki
                   └─ Trace → Tempo
Grafana ── Query → Loki·Tempo
```

OTLP는 Metric·Log·Trace를 표준 형식으로 전송하기 위한 OpenTelemetry Protocol이다.

### 교차 정합성

서로 다른 경로가 같은 요청을 보고 있는지 확인할 수 있다.

```text
Mimir의 요청 Metric 합계
= Loki의 요청 Log 합계
= 실제 전송한 요청 수
```

Tempo의 Trace 수는 요청 수보다 많을 수 있다. Prometheus의 `/metrics` Scrape 같은 내부 HTTP 요청도 자동 계측되면 Trace를 생성하기 때문이다.

### Trace와 Span

- Trace: 한 요청의 전체 여정
- Span: Trace를 구성하는 개별 작업 구간
- Trace ID: 같은 요청에 속한 Trace 식별자
- Span ID: Trace 안의 작업 식별자

Log에 Trace ID를 넣으면 오류 Log에서 바로 해당 Trace로 이동할 수 있다.

### Cardinality

Metric Label 조합의 개수를 Cardinality라고 한다. `status`, `method`, `route`처럼 값 종류가 제한된 Label은 집계에 적합하다. `user_id`, `request_id`, `order_id`처럼 거의 매 요청마다 다른 값은 시계열을 폭증시킨다.

```text
낮은 Cardinality → Metric Label
높은 Cardinality의 상세 문맥 → Log·Trace Field
```

## 13. 모델과 LLM에서 추가로 관찰할 것

서비스가 HTTP 200을 반환해도 모델 품질이 유지된다는 뜻은 아니다.

| 관점 | 지표 예시 |
|---|---|
| Service | Request Rate, Error Rate, P95/P99 Latency, Saturation |
| Data | Missing, Schema, 범위, Feature Distribution |
| Model | Accuracy, Precision, Recall, F1, Prediction Distribution |
| LLM | TTFT, Token/s, Token 수, Cost, 평가 점수, 환각·안전성 |
| Business | 전환율, 손실 감소, 사용자 만족도 |

### Drift

| 유형 | 의미 |
|---|---|
| Data Drift | 입력 Feature 분포가 달라짐 |
| Prediction Drift | Model Output 분포가 달라짐 |
| Concept Drift | 입력과 정답 사이의 관계가 달라짐 |

Drift는 성능 저하의 신호일 수 있지만 성능 저하 자체와 항상 같지는 않다. Ground Truth가 확보되면 실제 품질 Metric과 함께 확인해야 한다.

## 14. LangSmith와 LLM Observability

LLM Application은 한 번의 Model 호출보다 복잡하다.

```text
User Input
  → Prompt Template
  → Retriever
  → LLM
  → Tool
  → Output Parser
  → Final Response
```

최종 답변만 보면 어느 단계가 잘못됐는지 알기 어렵다. LangSmith는 Chain의 입력, 출력, Token, Latency, Error와 중첩 호출을 기록한다.

| 개념 | 의미 |
|---|---|
| Run | LLM·Retriever·Tool 같은 한 실행 기록 |
| Trace | Root Run과 Child Run으로 구성된 전체 실행 Tree |
| Project | 관련 Run을 묶는 공간 |
| Feedback | Run에 연결한 사람·자동 평가 |
| Dataset | 반복 평가용 입력과 기대 결과 |
| Evaluation | Dataset을 실행하고 Evaluator로 비교한 결과 |
| Prompt Hub | Prompt의 Version 저장과 공유 |

### Trace 구조

```text
Trace
└─ Root Run: 전체 Chain
   ├─ Child Run: Retriever
   ├─ Child Run: Prompt
   ├─ Child Run: LLM
   └─ Child Run: Parser
```

### Dataset 평가

LLM 응답은 표현이 다양하므로 분류 Accuracy만으로 평가하기 어렵다.

- Keyword·Rule 기반 평가
- 의미 유사도
- LLM-as-a-Judge
- 사람 Feedback
- Task 성공률
- 사실성·근거성·유해성 평가

Prompt, Model, Retriever와 Dataset Version을 함께 기록해야 평가 결과를 재현할 수 있다.

### MLflow와 LangSmith

| 구분 | MLflow | LangSmith |
|---|---|---|
| 중심 대상 | ML 실험과 Model Lifecycle | LLM Application의 실행 Chain |
| 핵심 기록 | Params, Metrics, Artifacts, Model | Prompt, Input/Output, Child Run, Token, Latency |
| Version 관리 | Model Registry | Prompt Hub |
| 평가 | 학습 Metric과 Model 비교 | Dataset·Feedback 기반 Application 평가 |

두 도구는 경쟁 관계로만 볼 필요가 없다. Model과 Training Experiment는 MLflow로 관리하고, 그 Model을 사용하는 LLM Chain은 LangSmith로 추적할 수 있다.

## 15. DevOps, MLOps, LLMOps와 AIOps

| 영역 | 중심 대상 | 핵심 문제 |
|---|---|---|
| DevOps | Software와 Infrastructure | Build, Test, Deploy, Reliability |
| MLOps | Data와 ML Model | Experiment, Registry, Drift, Retraining |
| LLMOps | Prompt·RAG·LLM Application | Evaluation, Token·Cost, Safety, Prompt Version |
| AIOps | IT 운영 과정 | 이상 탐지, Event 상관 분석, RCA, Remediation |

MLOps는 AI Model을 운영하는 방법에 가깝고, AIOps는 AI와 통계 기법으로 IT 운영을 개선하는 방법에 가깝다.

```text
MLOps: 이 모델을 어떻게 재현하고 배포하고 재학습할까?
AIOps: 이 서비스의 이상을 어떻게 찾고 원인과 조치를 좁힐까?
```

## 16. AIOps Pipeline의 다섯 단계

AIOps는 하나의 거대한 AI Model이 모든 운영을 대신하는 개념이 아니다. 운영 Data를 단계적으로 가공해 판단과 조치로 연결하는 Pipeline으로 이해하는 편이 정확하다.

```text
1. Auto Discovery
  → 2. Dynamic Baselining
  → 3. Anomaly Detection
  → 4. Root Cause Analysis
  → 5. Remediation
```

### 1단계: Auto Discovery

운영 환경의 Service와 Instance는 계속 생성·삭제된다. 정적 Target 목록만 사용하면 새 Service가 Monitoring에서 빠지거나 삭제된 Target을 계속 수집하게 된다.

```text
이전 Topology와 현재 Topology 비교
  → 추가된 Service
  → 제거된 Service
  → 현재 관측 Target
```

Kubernetes API, Service Mesh, Cloud API와 CMDB가 Discovery Source가 될 수 있다.

### 2단계: Dynamic Baselining

모든 Service에 같은 `150ms` 임계값을 적용하면 평소에도 150ms 근처인 Service에서 오탐이 많아진다. Dynamic Baseline은 Service별 최근 평균과 표준편차, 시간대와 계절성을 반영한다.

```text
최근 N개 값
  → 평균(mean)
  → 표준편차(stdev)
  → 정상 범위
```

Baseline은 고정 숫자가 아니라 “이 Service의 현재 정상 상태”를 표현한다.

### 3단계: Anomaly Detection

z-score는 현재 값이 평균에서 표준편차 몇 배만큼 떨어져 있는지 나타낸다.

```text
z = (현재 값 - 평균) / 표준편차
```

| 방식 | 판단 기준 | 특징 |
|---|---|---|
| Static Threshold | 절대값이 기준 초과 | 단순하지만 Service 차이와 시간 변화를 놓침 |
| Moving z-score | 최근 Baseline에서의 편차 | Service별 변화에 적응하지만 Window와 Data 품질에 민감 |

이상은 항상 “절대값이 큰가”만의 문제가 아니다. **평소와 얼마나 다른가**도 중요하다.

### 4단계: Event Correlation과 RCA

동시에 발생한 여러 Alert를 하나의 Incident로 묶고, 다음 정보를 연결해 원인 후보를 좁힌다.

- 최근 Deployment와 Configuration 변경
- Service Dependency
- 같은 Trace의 Error Span
- Node·Pod·Network Event
- 시간적 선후 관계

```text
Latency 이상
  + 직전 Deployment
  + 같은 Service의 Error Log
  + 하위 Dependency Trace 지연
  → 원인 후보 우선순위
```

상관관계는 조사 범위를 줄이지만 인과관계를 자동으로 증명하지는 않는다. 변경 Diff, Log, Trace와 재현 결과를 추가로 확인해야 한다.

### 5단계: Remediation

원인 후보가 좁혀지면 Rollback, Restart, Feature Toggle, Traffic 우회 같은 조치를 제안할 수 있다.

```text
Incident
  → Action 제안
  → Guardrail 검사
  → Dry Run
  → 사람 승인 또는 정책 승인
  → 실행
  → 결과 확인
  → Audit Log
```

자동화가 빠를수록 잘못된 조치의 피해도 빠르게 커질 수 있다. 따라서 실행 권한과 안전장치가 핵심이다.

## 17. 안전한 Remediation을 위한 Guardrail

### 허용·금지 작업

```yaml
allowed_actions:
  - rollback_deployment
  - restart_service
  - toggle_feature

forbidden_actions:
  - delete_namespace
  - delete_pvc
```

### Dry Run

Dry Run은 실제 시스템을 변경하지 않고 요청의 유효성과 예상 영향을 확인한다. 승인되었다는 사실과 실제 실행되었다는 사실을 구분해야 한다.

### Human in the Loop

위험도에 따라 자동화 수준을 다르게 적용할 수 있다.

| 위험 | 예시 | 정책 |
|---|---|---|
| 낮음 | Diagnostic Query, Cache Refresh | 자동 실행 가능 |
| 중간 | Pod Restart, Traffic 일부 전환 | 조건부 자동 또는 승인 |
| 높음 | Deployment Rollback, Data 변경 | 사람 승인 필수 |

### Audit Log

다음 정보를 남겨야 한다.

- 언제 어떤 Incident가 발생했는가
- 어떤 Data와 규칙으로 판단했는가
- 어떤 Action을 제안했는가
- 누가 승인했는가
- Dry Run과 실제 실행 결과는 무엇인가
- 실패 시 어떤 Rollback을 했는가

운영 자동화의 목표는 사람을 완전히 제거하는 것이 아니라, 반복 판단을 자동화하면서 위험한 변경은 통제 가능하게 만드는 것이다.

## 18. 전체 Architecture 연결하기

각 기술은 다음과 같이 하나의 Model Service Lifecycle을 이룬다.

```text
┌──────────────────── Build ────────────────────┐
│ Data → Training → Evaluation                  │
│          │ Params·Metrics·Artifacts           │
│          └──────────────→ MLflow              │
└─────────────────────┬─────────────────────────┘
                      │ Model Version·Alias
                      ▼
┌────────────────── Orchestration ──────────────┐
│ Airflow / Kubeflow Pipelines                  │
│ 검증 → 학습 → 승인 → 등록 → 배포              │
└─────────────────────┬─────────────────────────┘
                      ▼
┌──────────────────── Serving ──────────────────┐
│ FastAPI / KServe / Ray Serve / vLLM           │
│ Kubernetes Replica · Service · Autoscaling    │
└─────────────────────┬─────────────────────────┘
                      │ Metric·Log·Trace
                      ▼
┌────────────────── Observability ──────────────┐
│ Prometheus·Mimir / Loki / Tempo / Grafana     │
│ LLM Chain → LangSmith                         │
└─────────────────────┬─────────────────────────┘
                      ▼
┌──────────────────── AIOps ────────────────────┐
│ Discovery → Baseline → Anomaly → RCA          │
│ → Guardrail → Dry Run → Remediation           │
└───────────────────────────────────────────────┘
```

이 구조에서 중요한 것은 각 도구의 이름보다 경계와 Data 흐름이다.

- Model Binary와 Metadata는 어디에 저장되는가?
- 어떤 Process가 Model을 Memory에 올리는가?
- 요청은 어느 Replica와 Runtime으로 전달되는가?
- Parameter, Metric, Artifact는 어떤 Run에 연결되는가?
- Metric, Log, Trace는 어떤 경로로 수집되는가?
- 어떤 Data가 이상 판단과 원인 분석의 근거가 되는가?
- 자동 조치는 어떤 권한과 Guardrail 안에서 실행되는가?

## 19. 장애를 계층별로 진단하기

### API가 응답하지 않을 때

```text
Process 실행 여부
  → Port Listen 여부
  → Health·Readiness
  → Model Load Log
  → 입력 Schema
  → Dependency와 Network
```

### Kubernetes에서 Model Pod가 실행되지 않을 때

```text
Pod Event
  → Image Pull
  → Volume·Model Download
  → Runtime과 Model Format Matching
  → Resource Request와 Scheduling
  → Readiness Probe
```

### 응답은 오지만 느릴 때

```text
P50/P95/P99
  → Queue Time
  → Trace Span
  → Worker·Replica 수
  → CPU/GPU·Memory
  → Batch와 Model 크기
```

### 응답은 빠르지만 품질이 나쁠 때

```text
입력 Schema·Feature 순서
  → 전처리 Version
  → Model Version·Alias
  → Data·Prediction Drift
  → Ground Truth 기반 품질
  → Prompt·Retriever·Dataset Version
```

성능 문제와 품질 문제를 같은 지표로 판단하면 안 된다. HTTP 200과 낮은 Latency는 Service가 동작한다는 뜻이지 예측이 올바르다는 뜻은 아니다.

## 20. 운영 가능한 AI Service의 설계 원칙

### Artifact를 불변 Version으로 관리한다

Model, Scaler, Prompt와 Container Image를 같은 이름으로 덮어쓰기보다 Version이나 Digest를 부여한다. Alias는 운영 대상에 대한 가변 참조로 사용한다.

### 학습과 서빙의 전처리를 하나의 계약으로 본다

Feature 이름, 순서, Type, 범위와 Scaling 정보를 Schema와 Artifact로 관리한다.

### 수평 확장 전에 병목을 측정한다

Worker와 Replica를 늘리기 전에 Queue, CPU/GPU, Memory, I/O, Model Load와 Tail Latency를 확인한다.

### 큰 Data는 외부 Storage에 둔다

XCom과 Kubernetes Object에는 URI와 Metadata를 전달하고, Model과 Dataset은 Object Storage나 Persistent Storage에 보관한다.

### 관측 신호를 연결한다

Metric Label은 낮은 Cardinality로 유지하고, Log에 Trace ID를 포함해 Metric → Log → Trace 탐색 경로를 만든다.

### Model 품질과 Service 상태를 함께 본다

System Metric, Data Drift, Model 품질과 Business 결과를 분리해 관찰하고 상관관계를 분석한다.

### 자동화에 먼저 안전장치를 둔다

Remediation 구현 전에 허용 작업, Dry Run, 승인, Timeout, Rollback과 Audit 정책을 설계한다.

## 마무리

모델 서빙의 성숙도는 모델을 HTTP로 호출할 수 있는가에서 끝나지 않는다.

```text
만들기
  → 재현 가능하게 저장하기
  → 안정적으로 서빙하기
  → Workflow로 자동화하기
  → 선언적으로 배포하고 확장하기
  → 실험과 Version을 관리하기
  → Metric·Log·Trace로 관찰하기
  → 이상과 원인 후보를 찾기
  → Guardrail 안에서 안전하게 조치하기
```

FastAPI, Airflow, KServe, Ray Serve, vLLM, Kubeflow, MLflow, LGTM, LangSmith와 AIOps는 서로 다른 층의 문제를 해결한다. 운영 가능한 AI 시스템을 설계하려면 도구 하나의 사용법보다 **Artifact, 실행 주체, 상태, 관측 신호와 권한이 어떤 흐름으로 연결되는지** 이해해야 한다.
