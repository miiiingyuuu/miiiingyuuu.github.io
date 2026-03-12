---
title: "클라우드 서비스 개발"
date: "2026-03-07"
category: ["Cloud", "Backend", "Architecture"]
description: "클라우드 서비스 설계/개발, 비즈니스 솔루션 구현, 아키텍처 전략 수립에 필요한 핵심 기술들을 정리"
---

클라우드 기반 서비스 개발에서 다루게 되는 기술들을 정리했습니다. 크게 세 가지 영역으로 나눌 수 있습니다. 클라우드 인프라를 이해하고 서비스를 설계/개발하는 것, 비즈니스 요구사항을 바탕으로 솔루션을 구현하는 것, 그리고 전체 시스템의 아키텍처 전략을 수립하는 것입니다.

---

## 1. 클라우드 기초 개념

### 서비스 모델 — IaaS / PaaS / SaaS

클라우드는 제공하는 추상화 수준에 따라 세 가지 모델로 구분됩니다.

| 모델 | 제공 범위 | 사용자 관리 범위 | 예시 |
|------|-----------|-----------------|------|
| **IaaS** | 서버, 네트워크, 스토리지 | OS, 미들웨어, 앱 직접 관리 | AWS EC2, GCP Compute Engine |
| **PaaS** | OS + 런타임 + 미들웨어 | 애플리케이션 코드만 관리 | AWS Elastic Beanstalk, Heroku |
| **SaaS** | 완성된 소프트웨어 | 데이터, 사용 설정만 관리 | Gmail, Slack, Salesforce |

### 배포 모델

```
Public Cloud  : AWS, GCP, Azure 등 퍼블릭 사업자 인프라 활용
               → 비용 효율, 빠른 확장

Private Cloud : 기업 전용 클라우드 (온프레미스 또는 전용 호스팅)
               → 높은 보안, 높은 초기 비용

Hybrid Cloud  : Public + Private 혼합
               → 민감 데이터는 Private, 탄력적 부하는 Public

Multi Cloud   : 여러 퍼블릭 클라우드 동시 활용
               → 벤더 종속 방지, 서비스별 최적 클라우드 선택
```

---

## 2. 클라우드 인프라 핵심 기술

### 가상화 (Virtualization)

물리 서버 위에 독립된 가상 머신(VM)을 여러 개 실행하는 기술입니다. 클라우드 컴퓨팅의 근간입니다.

```
물리 서버
└── Hypervisor (VMware, KVM, Hyper-V)
    ├── VM 1 — Ubuntu + App A
    ├── VM 2 — CentOS + App B
    └── VM 3 — Windows + App C
```

### 컨테이너 (Container)

VM보다 가벼운 격리 단위입니다. OS 커널을 공유하면서 프로세스 수준에서 격리합니다.

```
VM vs Container

VM                          Container
├── Guest OS 포함           ├── Guest OS 없음 (호스트 OS 공유)
├── GB 단위 이미지           ├── MB 단위 이미지
├── 부팅에 수십 초           ├── 부팅에 수 초 이내
└── 강한 격리, 무거움         └── 가볍고 빠른 배포에 적합
```

**Dockerfile 예시:**

```dockerfile
FROM openjdk:17-jdk-slim

WORKDIR /app

COPY target/my-app.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Docker 기본 명령어:**

```bash
# 이미지 빌드
docker build -t my-app:1.0 .

# 컨테이너 실행
docker run -d -p 8080:80 --name my-container my-app:1.0

# 실행 중인 컨테이너 확인
docker ps

# 로그 확인
docker logs my-container
```

### 컨테이너 오케스트레이션 — Kubernetes

다수의 컨테이너를 자동으로 배포/관리/확장하는 시스템입니다.

```
Control Plane
├── API Server        : 모든 요청의 진입점
├── Scheduler         : Pod를 어느 노드에 배치할지 결정
├── etcd              : 클러스터 상태 저장 (분산 KV 스토어)
└── Controller Manager: 원하는 상태 지속 유지

Worker Node
├── kubelet           : 노드 에이전트, Pod 실행 관리
├── kube-proxy        : 네트워크 규칙 관리
└── Container Runtime : Docker, containerd
```

**Deployment & Service 예시:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
      - name: my-app
        image: my-app:1.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: my-app-service
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
  - port: 80
    targetPort: 8080
```

---

## 3. 가용성 (High Availability) 설계

클라우드 서비스에서 **가용성**은 서비스가 중단 없이 운영되는 비율을 의미합니다.

### 가용성 목표 (SLA)

```
99%     → 연간 약 87시간 다운타임 허용
99.9%   → 연간 약 8.7시간   ("Three Nines")
99.99%  → 연간 약 52분      ("Four Nines")
99.999% → 연간 약 5분       ("Five Nines") ← 금융/의료급
```

### 가용성 확보 전략

**이중화 — 단일 장애점(SPOF) 제거**

```
        [사용자]
           │
      [Load Balancer]  ← 이중화
      ┌────┴────┐
  [App 1]   [App 2]    ← 다중 인스턴스
      └────┬────┘
     [DB Primary]
           └── [DB Replica]  ← 복제본
```

**Auto Scaling**

트래픽에 따라 인스턴스 수를 자동으로 조절합니다.

```
Scale Out : 인스턴스 수 증가 (트래픽 급증 시)
Scale In  : 인스턴스 수 감소 (트래픽 감소 시)
Scale Up  : 인스턴스 사양 향상 (CPU, RAM 증가)
Scale Down: 인스턴스 사양 축소
```

**Circuit Breaker 패턴**

외부 서비스 장애가 내부로 전파되는 것을 차단합니다.

```
CLOSED (정상 운영)
  → 오류율이 임계치 초과하면
OPEN (요청 차단)    ← 모든 요청 즉시 실패 처리
  → 일정 시간 후 테스트 요청 허용
HALF-OPEN
  → 성공 시 CLOSED 복귀
  → 실패 시 OPEN 유지
```

---

## 4. 클라우드 네이티브 아키텍처 패턴

### 마이크로서비스 아키텍처 (MSA)

하나의 큰 애플리케이션을 독립적으로 배포 가능한 작은 서비스들로 분리하는 방식입니다.

```
모놀리식 (Monolithic)              마이크로서비스 (MSA)

┌──────────────────┐              ┌────────┐  ┌────────┐
│  사용자 관리      │              │  User  │  │ Order  │
│  주문 처리        │    →         │  Svc   │  │  Svc   │
│  결제             │              └────────┘  └────────┘
│  알림             │              ┌────────┐  ┌────────┐
└──────────────────┘              │  Pay   │  │ Notify │
                                  │  Svc   │  │  Svc   │
                                  └────────┘  └────────┘
```

| | 모놀리식 | MSA |
|--|---------|-----|
| 배포 | 전체를 한 번에 | 서비스별 독립 배포 |
| 확장 | 전체 스케일 아웃 | 필요한 서비스만 스케일 |
| 장애 격리 | 한 곳 장애 → 전체 영향 | 해당 서비스만 영향 |
| 복잡도 | 낮음 | 높음 (분산 시스템 관리) |

### API Gateway 패턴

클라이언트와 내부 서비스 사이의 단일 진입점입니다.

```
클라이언트
    │
[API Gateway]
├── 인증 / 인가
├── 요청 라우팅
├── Rate Limiting
├── 로드밸런싱
└── 로깅 / 모니터링
    │
    ├── User Service
    ├── Order Service
    └── Payment Service
```

### 이벤트 드리븐 아키텍처

서비스 간 직접 호출 대신 이벤트(메시지)를 통해 통신합니다. 결합도를 낮추고 확장성을 높입니다.

```
[주문 서비스] → "주문 완료" 이벤트 발행
                      │
                [Kafka / RabbitMQ]
                      │
       ┌──────────────┼──────────────┐
  [결제 서비스]  [재고 서비스]   [알림 서비스]
```

---

## 5. CI/CD 파이프라인

빠르고 안정적인 배포를 위한 자동화 파이프라인입니다.

```
코드 Push
    │
[소스 저장소 — GitHub / GitLab]
    │
[CI: 빌드 & 검증]
├── 빌드 (Maven, Gradle)
├── 단위 테스트
├── 정적 분석 (SonarQube)
└── Docker 이미지 빌드 & 레지스트리 Push
    │
[CD: 자동 배포]
├── 개발 환경 자동 배포
├── 스테이징 환경 배포 (승인 후)
└── 프로덕션 환경 배포 (승인 후)
```

**GitHub Actions 예시:**

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3

    - name: Set up JDK 17
      uses: actions/setup-java@v3
      with:
        java-version: '17'

    - name: Build & Test
      run: ./gradlew build test

    - name: Build Docker Image
      run: docker build -t my-app:${{ github.sha }} .

    - name: Push to Registry
      run: |
        docker tag my-app:${{ github.sha }} registry.example.com/my-app:latest
        docker push registry.example.com/my-app:latest

    - name: Deploy to Kubernetes
      run: |
        kubectl set image deployment/my-app \
          my-app=registry.example.com/my-app:latest
```

---

## 6. 관찰 가능성 (Observability)

운영 중인 서비스의 상태를 파악하고 문제를 조기에 감지하기 위한 세 가지 핵심 요소입니다.

```
┌───────────┬───────────┬───────────┐
│  Metrics  │   Logs    │  Traces   │
│  (지표)   │  (로그)   │  (추적)   │
├───────────┼───────────┼───────────┤
│ CPU, 메모리│ 애플리케이션│ 요청이 여러│
│ 응답시간  │ 이벤트 기록 │ 서비스를  │
│ 처리량 등 │            │ 거치는 경로│
├───────────┼───────────┼───────────┤
│Prometheus │ ELK Stack │  Jaeger   │
│ Grafana   │  Datadog  │  Zipkin   │
└───────────┴───────────┴───────────┘
```

### SLI / SLO / SLA

```
SLI (Service Level Indicator) : 실제 측정 지표
├── 가용성   : 성공 요청 수 / 전체 요청 수
├── 지연시간 : 요청~응답 소요 시간 (p50, p95, p99)
└── 처리량   : 초당 처리 요청 수 (TPS, RPS)

SLO (Service Level Objective) : 내부 목표 수준
└── 예: "99.9% 요청이 200ms 이내 응답"

SLA (Service Level Agreement) : 고객과의 계약
└── SLO 미달 시 패널티/환불 조항 포함
```

---

## 7. 보안 (Cloud Security)

인프라, 네트워크, 애플리케이션 레벨 모두에서 보안을 고려해야 합니다.

### IAM — 최소 권한 원칙

필요한 최소한의 권한만 부여하는 것이 핵심입니다.

```
User   : 개별 사람 계정
Group  : User들의 집합 → 그룹 단위 정책 적용
Role   : 서비스/인스턴스에 부여하는 권한 묶음
Policy : 특정 리소스에 대한 허용/거부 규칙 문서
```

### 네트워크 보안 — VPC 구조

```
[Internet]
     │
[Internet Gateway]
     │
┌─── VPC ─────────────────────────┐
│  Public Subnet                  │
│  ├── Load Balancer              │
│  └── Bastion Host               │
│                                 │
│  Private Subnet                 │
│  ├── Application Server         │
│  └── Database                   │
│                                 │
│  Security Group (방화벽)          │
│  ├── Inbound : 80, 443만 허용   │
│  └── Outbound: 제한적 허용       │
└─────────────────────────────────┘
```

### DevSecOps

CI/CD 파이프라인에 보안 검사를 내장하는 방식입니다.

```
코드 작성 → SAST (정적 코드 분석)
빌드      → SCA  (오픈소스 취약점 스캔)
배포 전   → DAST (동적 취약점 테스트)
운영 중   → RASP (실시간 공격 탐지)
```

---

## 8. 아키텍처 설계 원칙

### 12-Factor App

클라우드 네이티브 애플리케이션 설계를 위한 12가지 원칙입니다.

```
I.   Codebase        : 하나의 코드베이스, 여러 배포 환경
II.  Dependencies    : 의존성 명시적 선언 (pom.xml, package.json)
III. Config          : 설정은 환경 변수로 분리 (.env, ConfigMap)
IV.  Backing Services: DB, 캐시 등을 교체 가능한 리소스로 취급
V.   Build/Release   : 빌드-릴리즈-실행 단계 엄격히 분리
VI.  Processes       : 무상태(Stateless) 프로세스로 실행
VII. Port Binding    : 포트 바인딩으로 서비스 노출
VIII.Concurrency     : 프로세스 모델로 수평 확장
IX.  Disposability   : 빠른 시작, 안전한 종료 (Graceful Shutdown)
X.   Dev/Prod Parity : 개발-스테이징-프로덕션 환경 최대한 동일하게
XI.  Logs            : 로그를 이벤트 스트림으로 처리
XII. Admin Processes : 관리 작업을 일회성 프로세스로 실행
```

### 요구사항 분류

아키텍처를 설계할 때 기능적 요구사항 외에 비기능적 요구사항을 함께 정의해야 합니다.

```
기능적 요구사항 (Functional Requirements)
└── "무엇을" 해야 하는가 — 기능 명세

비기능적 요구사항 (Non-Functional Requirements)
├── 성능    : 응답시간 목표, TPS
├── 가용성  : SLA 목표 수준
├── 확장성  : 트래픽 증가 대응 방법
├── 보안    : 인증/인가, 데이터 암호화
├── 유지보수 : 코드 가독성, 테스트 커버리지
└── 비용    : 인프라 비용 최적화 전략
```

---

## 참고 자료

- [12-Factor App 공식 문서](https://12factor.net/ko/)
- [Kubernetes 공식 문서](https://kubernetes.io/ko/docs/)
- [AWS Well-Architected Framework](https://aws.amazon.com/ko/architecture/well-architected/)
- [Google SRE Book (무료 공개)](https://sre.google/sre-book/table-of-contents/)
- Claude AI