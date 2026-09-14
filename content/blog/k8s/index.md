---
title: "Kubernetes 이해"
date: "2026-09-14"
description: "Kubernetes의 선언적 제어 구조를 시작으로 Pod, Deployment, Service, EndpointSlice, CoreDNS, ConfigMap, Secret, PVC, Ingress, Probe와 배포 전략이 어떻게 하나의 애플리케이션 운영 구조를 만드는지 정리"
tags: ["DevOps", "Cloud", "Backend"]
---

# Kubernetes 이해 — 선언적 배포에서 서비스, 설정, 스토리지, 무중단 운영까지

컨테이너는 애플리케이션과 실행 환경을 이미지로 묶어 어디서든 일관되게 실행할 수 있게 한다. 하지만 운영 환경에서는 컨테이너를 실행하는 것만으로 충분하지 않다. 여러 서버 중 어디에서 실행할지 결정해야 하고, 장애가 발생하면 복구해야 하며, 트래픽에 맞춰 실행 개수를 조절해야 한다. 새 버전을 배포하는 동안에도 서비스가 계속 요청을 처리해야 한다.

Kubernetes는 이런 운영 문제를 **원하는 상태를 선언하고 시스템이 그 상태를 계속 유지하는 방식**으로 해결한다.

```text
애플리케이션 코드
  → 컨테이너 이미지 빌드
  → Registry에 이미지 저장
  → Kubernetes에 원하는 상태 선언
  → Pod 배치와 실행
  → Service를 통한 안정적인 연결
  → 설정과 스토리지 주입
  → 상태 검사와 점진적 배포
  → 메트릭과 로그를 통한 관측
```

이 글은 명령어를 순서대로 따라 하는 실습 기록보다, 각 구성 요소가 어떤 문제를 해결하며 서로 어떻게 연결되는지에 초점을 맞춘다.

## 1. Kubernetes가 해결하려는 문제

서버 한 대에서 컨테이너 하나를 실행하는 일은 어렵지 않다. 운영 규모가 커지면 실행 자체보다 실행 이후의 관리가 복잡해진다.

| 운영 상황 | 필요한 동작 | Kubernetes의 해법 |
|---|---|---|
| 컨테이너가 종료됐다 | 다시 실행 | kubelet의 컨테이너 관리와 Controller의 복구 |
| 서버가 장애 상태다 | 다른 서버에 다시 배치 | Scheduler와 Controller |
| API 서버를 항상 3개 유지해야 한다 | 부족한 복제본 생성 | Deployment와 ReplicaSet |
| Pod가 교체되면서 IP가 바뀐다 | 안정적인 접속점 제공 | Service와 CoreDNS |
| 새 버전을 중단 없이 배포해야 한다 | 기존 Pod를 점진적으로 교체 | RollingUpdate |
| 환경마다 설정이 다르다 | 실행 시점에 설정 주입 | ConfigMap과 Secret |
| Pod가 교체되어도 데이터가 남아야 한다 | 실행 환경과 데이터 분리 | PV와 PVC |
| 실행 중인 앱이 요청을 처리할 수 있는지 알아야 한다 | 상태 검사 | Startup, Readiness, Liveness Probe |

Docker도 단일 호스트에서 재시작 정책과 네트워크, 볼륨을 제공한다. Kubernetes의 역할은 여러 Node에 걸친 배포와 복구, 네트워크 연결, 설정, 저장소, 배포 전략을 공통 API로 관리하는 데 있다.

## 2. 핵심 철학은 원하는 상태다

명령적 방식은 시스템이 수행할 절차를 직접 지시한다.

```text
컨테이너 하나 실행
→ 하나 더 실행
→ 장애 컨테이너 삭제
→ 다시 하나 실행
```

Kubernetes의 선언적 방식은 최종적으로 유지할 상태를 기술한다.

```yaml
spec:
  replicas: 3
```

이 선언은 “이 애플리케이션의 Pod가 항상 3개 존재해야 한다”는 의미다. Controller는 원하는 상태와 현재 상태를 비교하고 차이를 줄이는 동작을 반복한다. 이를 **조정 루프(Reconciliation Loop)**라고 한다.

```text
원하는 상태: 3개
현재 상태:   2개
       ↓ 차이 발견
Pod 1개 추가 생성
       ↓
현재 상태:   3개
       ↓
계속 관찰
```

이 구조에서 `kubectl apply`의 성공은 YAML이 API Server에 반영됐다는 뜻이다. 이미지 다운로드, 컨테이너 시작, 애플리케이션 준비까지 끝났다는 뜻은 아니다.

```bash
kubectl apply -f deploy.yaml
kubectl rollout status deployment/my-api
kubectl get pods
```

## 3. Manifest, Resource, Object, spec과 status

Kubernetes YAML을 이해하려면 비슷하게 보이는 용어를 구분해야 한다.

| 용어 | 의미 | 예시 |
|---|---|---|
| Manifest | 원하는 상태를 표현한 YAML 또는 JSON 문서 | `deploy.yaml` |
| Resource | Kubernetes API가 관리하는 자원의 유형 | Pod, Deployment, Service |
| Object | 클러스터에 실제 생성된 개별 인스턴스 | 이름이 `my-api`인 Deployment |
| `spec` | 사용자가 요청한 원하는 상태 | `replicas: 3` |
| `status` | 시스템이 관찰한 실제 상태 | `readyReplicas: 2` |

기본 Manifest는 네 영역으로 읽을 수 있다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
  namespace: production
spec:
  replicas: 2
```

- `apiVersion`: 이 리소스를 해석할 API 그룹과 버전
- `kind`: 생성할 리소스의 유형
- `metadata`: 이름, Namespace, label과 annotation 같은 식별 정보
- `spec`: 사용자가 원하는 리소스 상태

실제 Object를 조회하면 Kubernetes가 부여한 UID와 생성 시간, `status` 등이 추가된다.

```bash
kubectl get deployment my-api -o yaml
```

## 4. Kubernetes를 구성하는 컴포넌트

Kubernetes 클러스터는 관리 기능을 담당하는 Control Plane과 애플리케이션을 실행하는 Worker Node로 나뉜다.

```text
사용자와 자동화 도구
        │ kubectl / REST API
        ▼
┌──────────────── Control Plane ────────────────┐
│ API Server ◀──────────────▶ etcd              │
│     ▲                                         │
│     ├── Scheduler                             │
│     └── Controller Manager                    │
└─────┼─────────────────────────────────────────┘
      │ Watch와 상태 보고
      ▼
┌──────────────── Worker Node ──────────────────┐
│ kubelet → Container Runtime → Pod             │
│ kube-proxy 또는 대체 네트워크 구현             │
└───────────────────────────────────────────────┘
```

| 구성 요소 | 역할 |
|---|---|
| API Server | 모든 Kubernetes API 요청의 공통 진입점 |
| etcd | 리소스와 클러스터 상태를 보관하는 분산 저장소 |
| Scheduler | 아직 Node가 정해지지 않은 Pod를 실행할 Node 선택 |
| Controller Manager | 원하는 상태와 현재 상태를 맞추는 여러 Controller 실행 |
| kubelet | Node에 배정된 Pod를 실행하고 상태를 API Server에 보고 |
| Container Runtime | 이미지를 가져오고 컨테이너 프로세스를 실행 |
| CNI Plugin | Pod 네트워크 구성 |
| CoreDNS | 클러스터 내부 Service 이름 해석 |

Control Plane 구성 요소는 보통 API Server를 통해 상태를 조회하고 변경한다. etcd에 직접 접근하는 공통 구조로 이해하면 안 된다.

### kubelet은 API Server를 계속 polling할까

kubelet은 1초마다 “새 Pod가 있는가”를 반복 질문하는 단순 polling 방식으로 동작하지 않는다. API Server에 장기 **Watch 연결**을 열고 자신에게 배정된 Pod의 변경 이벤트를 전달받는다.

```text
kubelet ── Watch 연결 ──▶ API Server
        변경이 없으면 연결을 유지하며 대기
        변경되면 이벤트 수신

kubelet ── Node·Pod 상태 보고 ──▶ API Server
```

연결이 끊어지면 kubelet은 목록을 다시 동기화하고 Watch를 재연결한다. 별도의 동기화 루프와 Node Lease 갱신도 수행한다. 원하는 상태는 Watch로 받아 실행하고, 관찰한 실제 상태는 API Server에 보고하는 양방향 관계다.

## 5. 코드가 Pod로 실행되기까지

Kubernetes가 소스 코드를 직접 빌드하는 것은 아니다. 일반적인 배포 흐름은 다음과 같다.

```text
소스 코드 + Dockerfile
        │ docker build
        ▼
컨테이너 이미지
        │ docker push
        ▼
Container Registry
        │ Node의 Runtime이 pull
        ▼
Pod 안의 컨테이너 실행
```

이미지 주소는 다음처럼 구성된다.

```text
registry.example.com/team/my-api:1.0
└ Registry 주소 ┘ └경로┘ └Image┘ └Tag┘
```

`docker push`는 이미지를 Registry에 저장하고, `kubectl apply`는 Kubernetes 리소스를 생성하거나 변경한다. 이미지를 push했다고 Pod가 자동 생성되는 것은 아니다.

Tag는 변경 가능한 이름표다. 같은 `1.0` Tag로 새 이미지를 push하더라도 실행 중인 Pod가 자동으로 교체되지 않는다. 특정 이미지 내용을 정확히 고정하려면 `sha256` digest를 사용할 수 있다.

```text
registry.example.com/team/my-api@sha256:...
```

## 6. Pod는 함께 배치되는 최소 단위다

Pod는 Kubernetes가 Node에 배치하는 최소 실행 단위이며 하나 이상의 컨테이너를 포함한다.

```text
Cluster
  ├─ Node A
  │    ├─ Pod 1 → API Container
  │    └─ Pod 2 → API Container
  └─ Node B
       └─ Pod 3 → API Container
```

같은 Pod의 컨테이너는 다음 실행 환경을 공유한다.

- 하나의 Pod IP
- 네트워크와 포트 공간
- hostname
- Pod에 정의한 Volume

따라서 같은 Pod의 컨테이너는 `localhost`로 통신할 수 있다. 반면 컨테이너의 기본 파일 시스템은 분리되어 있으므로 파일을 공유하려면 공통 Volume을 마운트해야 한다.

프런트엔드, API, 데이터베이스를 하나의 Pod에 넣는 방식은 각각 독립적으로 확장하고 교체하기 어렵다. 일반적으로 서로 다른 생명주기와 확장 요구를 가진 애플리케이션은 Pod를 분리한다. 여러 컨테이너가 항상 함께 움직여야 할 때 sidecar 같은 다중 컨테이너 패턴을 사용한다.

### 컨테이너 재시작과 Pod 재생성은 다르다

| 상황 | 동작 주체와 결과 |
|---|---|
| Pod 안의 컨테이너 프로세스 종료 | kubelet이 재시작 정책에 따라 컨테이너 재시작 가능 |
| Deployment가 관리하는 Pod 삭제 | ReplicaSet Controller가 새 Pod 생성 |
| Controller 없이 만든 단독 Pod 삭제 | 일반적으로 자동 재생성되지 않음 |

새 Pod는 기존 Pod가 이동한 것이 아니다. 새로운 UID와 IP를 받을 수 있으므로 애플리케이션이 Pod IP에 직접 의존해서는 안 된다.

## 7. Deployment가 Pod의 개수와 버전을 관리한다

Deployment는 Stateless 애플리케이션의 복제본 수와 업데이트, 롤백을 관리하는 리소스다.

```text
Deployment
  └─ ReplicaSet
       ├─ Pod A
       └─ Pod B
```

대표적인 Deployment는 다음과 같다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-api
  template:
    metadata:
      labels:
        app: my-api
    spec:
      containers:
        - name: api
          image: registry.example.com/team/my-api:1.0
          ports:
            - containerPort: 8080
```

Deployment의 selector와 Pod template의 label은 반드시 일치해야 한다.

```text
Deployment selector: app=my-api
                         │ 일치
Pod label:            app=my-api
```

`replicas`를 1에서 2로 바꾸면 같은 ReplicaSet이 Pod를 하나 더 생성한다. 이미지나 환경변수처럼 `spec.template`이 변경되면 새로운 ReplicaSet이 생기고 새 Pod가 기존 Pod를 교체한다.

```bash
kubectl get deployment my-api
kubectl get replicaset -l app=my-api
kubectl get pods -l app=my-api
kubectl rollout status deployment/my-api
```

이전 ReplicaSet이 `DESIRED=0` 상태로 남을 수 있다. 이는 이상 상태가 아니라 배포 이력과 롤백을 위해 보존된 결과일 수 있다.

## 8. Service가 변하는 Pod 앞에 안정적인 주소를 만든다

Pod는 교체될 수 있고 IP도 변한다. Service는 label selector로 Pod 집합을 선택하고, 그 앞에 안정적인 ClusterIP와 DNS 이름을 제공한다.

```text
Client
  │ http://my-api:8080
  ▼
Service: my-api
  │ selector: app=my-api
  ▼
EndpointSlice
  ├─ Pod A IP:8080
  └─ Pod B IP:8080
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-api
spec:
  type: ClusterIP
  selector:
    app: my-api
  ports:
    - name: http
      port: 8080
      targetPort: 8080
```

Service는 Deployment 이름을 참조하지 않는다. **Service selector와 Pod label의 일치 여부**가 연결을 결정한다. 이름이 같아도 label이 다르면 연결되지 않고, 이름이 달라도 label이 맞으면 연결된다.

### port, targetPort, containerPort

```text
Client → Service:8080 → Pod Application:8080
             port              targetPort
```

| 필드 | 의미 |
|---|---|
| `containerPort` | 컨테이너가 사용할 예정인 포트에 관한 선언적 정보 |
| Service `port` | 클라이언트가 Service에 접속하는 포트 |
| Service `targetPort` | Service가 Pod로 전달할 대상 포트 |

`containerPort`나 Dockerfile의 `EXPOSE`가 애플리케이션의 실제 리슨 포트를 변경하지는 않는다. 애플리케이션이 `targetPort`에서 실제로 요청을 받아야 한다.

### EndpointSlice는 실제 목적지를 표현한다

EndpointSlice는 Service가 트래픽을 전달할 Pod IP와 포트를 기록한다. 기존의 Endpoints 리소스를 확장성 있게 대체하는 구조다.

```bash
kubectl get endpointslices \
  -l kubernetes.io/service-name=my-api
```

Service와 Pod가 모두 존재하더라도 selector와 label이 다르거나 Pod가 준비되지 않았다면 정상적인 요청 대상이 없을 수 있다.

### Service 유형

| 유형 | 역할 |
|---|---|
| ClusterIP | 클러스터 내부에 가상 IP와 DNS 이름 제공 |
| NodePort | 각 Node IP의 특정 포트로 Service 노출 |
| LoadBalancer | 클라우드 등의 외부 Load Balancer와 연동 |
| ExternalName | 외부 DNS 이름을 CNAME으로 연결 |

## 9. CoreDNS가 Service Discovery를 제공한다

Kubernetes 내부의 클라이언트는 매번 Pod IP를 찾지 않고 Service 이름을 호출한다.

```text
API Client Pod
  │ my-api 주소 질의
  ▼
CoreDNS
  │ Service ClusterIP 반환
  ▼
Service
  │ EndpointSlice의 준비된 목적지 선택
  ▼
API Pod
```

같은 Namespace에서는 짧은 이름을 사용할 수 있다.

```text
http://my-api:8080
```

전체 DNS 이름은 다음 형태다.

```text
my-api.production.svc.cluster.local
└Service┘ └ Namespace┘ └클러스터 서비스 도메인┘
```

CoreDNS는 일반적인 ClusterIP Service의 이름을 Service IP로 해석한다. 실제 Pod 목적지는 EndpointSlice가 관리한다.

## 10. Namespace는 논리적인 관리 경계다

Namespace는 하나의 클러스터를 팀, 프로젝트, 환경 단위로 나누는 논리적 공간이다.

- 서로 다른 Namespace에는 같은 이름의 Service와 Deployment가 존재할 수 있다.
- Role과 RoleBinding으로 Namespace 범위의 권한을 나눌 수 있다.
- ResourceQuota와 LimitRange로 자원 사용 정책을 적용할 수 있다.
- Namespace가 네트워크를 자동으로 격리하지는 않는다. 네트워크 격리에는 NetworkPolicy가 필요하다.

| Namespace에 속하는 리소스 | 클러스터 전체 범위 리소스 |
|---|---|
| Pod, Deployment, Service | Node |
| ConfigMap, Secret | PersistentVolume |
| PVC, Ingress | StorageClass |
| Role, RoleBinding | ClusterRole, ClusterRoleBinding |

```bash
kubectl get pods -n production
kubectl get pods --all-namespaces
kubectl config set-context --current --namespace=production
```

## 11. ConfigMap과 Secret으로 설정을 외부화한다

환경에 따라 DB 주소, API Endpoint, 로그 레벨이 달라진다. 이런 값을 이미지에 고정하면 설정을 변경할 때마다 이미지를 다시 빌드해야 한다.

```text
동일한 애플리케이션 이미지
  ├─ Dev ConfigMap
  ├─ QA ConfigMap
  └─ Prod ConfigMap
```

ConfigMap은 일반 설정을 key-value나 파일 형태로 관리한다.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-api-config
data:
  application-prod.yaml: |
    server:
      port: 8080
    logging:
      level:
        root: INFO
```

Pod에서는 환경변수로 주입하거나 Volume으로 마운트할 수 있다.

```yaml
containers:
  - name: api
    env:
      - name: SPRING_PROFILES_ACTIVE
        value: prod
    volumeMounts:
      - name: config-volume
        mountPath: /app/config
volumes:
  - name: config-volume
    configMap:
      name: my-api-config
```

최종적으로 ConfigMap의 Key가 컨테이너 내부 파일이 된다.

```text
ConfigMap: my-api-config
  └─ application-prod.yaml
        ↓ Volume mount
/app/config/application-prod.yaml
        ↓
Spring Boot가 prod 설정으로 읽음
```

ConfigMap을 변경해도 실행 중인 애플리케이션이 설정을 자동으로 다시 읽는다고 보장할 수 없다. 프로세스가 시작 시점에만 설정을 읽는다면 Deployment를 재시작해야 한다.

```bash
kubectl rollout restart deployment/my-api
```

비밀번호, 인증서, Token 같은 민감한 값은 Secret으로 분리한다. Secret의 기본 base64 표현은 암호화가 아니므로 접근 권한과 저장 시 암호화 정책도 함께 고려해야 한다.

## 12. Volume, PV, PVC가 데이터 생명주기를 분리한다

컨테이너의 쓰기 가능 계층은 컨테이너와 생명주기를 함께한다. Pod가 교체되어도 유지해야 하는 데이터는 외부 스토리지에 저장해야 한다.

```text
Pod
  │ PVC를 마운트
  ▼
PersistentVolumeClaim
  │ 조건에 맞는 저장소 요청
  ▼
PersistentVolume
  │ 실제 스토리지 구현
  ▼
EBS, EFS, NFS, Cloud Disk 등
```

| 리소스 | 역할 |
|---|---|
| PV | 클러스터가 사용할 수 있는 저장소를 표현 |
| PVC | 애플리케이션이 필요한 용량과 접근 방식을 요청 |
| StorageClass | 동적 프로비저닝에 사용할 저장소 종류와 정책 |
| CSI Driver | Kubernetes와 실제 스토리지 시스템 연결 |

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-api-data
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 1Gi
  storageClassName: shared-filesystem
```

접근 모드는 이름을 정확히 해석해야 한다.

- `ReadWriteOnce(RWO)`: 한 Node에서 읽기·쓰기
- `ReadWriteMany(RWX)`: 여러 Node에서 읽기·쓰기
- `ReadWriteOncePod(RWOP)`: 지원되는 환경에서 한 Pod로 접근 제한

`RWO`를 Pod 하나만 사용할 수 있다는 의미로 해석하면 부정확하다. 핵심 경계는 Node다.

PVC의 `Bound`는 PV와 논리적으로 연결됐다는 뜻이다. 애플리케이션 컨테이너에서 마운트와 파일 접근까지 성공했다는 의미는 아니므로 Pod Events와 실제 mount 상태도 확인해야 한다.

## 13. Ingress가 외부 HTTP 요청의 경로를 결정한다

ClusterIP Service는 주로 클러스터 내부 통신에 사용한다. 외부 사용자가 하나의 도메인으로 프런트엔드와 API를 호출하려면 HTTP 경로를 내부 Service에 연결하는 진입 규칙이 필요하다.

```text
Browser
  │ https://app.example.com
  ▼
Ingress Controller
  ├─ /api/* → API Service → API Pod
  └─ /*     → Web Service → Nginx Pod
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: my-api
                port:
                  number: 8080
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-web
                port:
                  number: 80
```

**Ingress는 라우팅 규칙이고 Ingress Controller는 규칙을 실제로 처리하는 프로그램**이다. Ingress Object만 생성하고 Controller가 없다면 외부 트래픽을 처리할 수 없다.

또한 Ingress에 `host`를 적는 것만으로 인터넷 DNS 레코드나 TLS 인증서가 자동 생성되는 것은 아니다. DNS, Load Balancer, Ingress Controller, 인증서 관리 구성이 함께 필요하다.

## 14. Probe는 실행 상태와 서비스 가능 상태를 구분한다

컨테이너 프로세스가 실행 중이어도 애플리케이션 초기화가 끝나지 않았거나 요청 처리 기능이 고장 났을 수 있다.

```text
Running: 컨테이너 프로세스가 실행 중
Ready:   현재 Service 요청을 받을 준비가 됨
```

Kubernetes는 세 가지 Probe를 제공한다.

| Probe | 확인하는 질문 | 실패 시 대표 동작 |
|---|---|---|
| Startup | 애플리케이션 기동이 끝났는가 | 컨테이너 재시작 대상 |
| Readiness | 지금 요청을 처리할 수 있는가 | Service의 일반 요청 대상에서 제외 |
| Liveness | 재시작해야 회복될 상태인가 | 컨테이너 재시작 |

```yaml
startupProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  periodSeconds: 5
  failureThreshold: 30

livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  periodSeconds: 5
  failureThreshold: 3
```

Startup Probe가 설정되면 성공하기 전까지 Liveness와 Readiness 검사를 미룬다. 시작이 느린 애플리케이션이 초기화 중에 반복 재시작되는 문제를 줄일 수 있다.

Readiness 실패는 컨테이너를 재시작하지 않는다. 해당 Pod가 요청을 받을 준비가 되지 않았다고 판단해 일반적인 Service 트래픽 대상에서 제외한다. 반면 Liveness 실패는 같은 Pod 안의 컨테이너를 재시작한다.

DB와 같은 외부 의존성의 일시 장애를 Liveness에 무조건 포함하면 모든 API Pod가 동시에 재시작되어 장애를 키울 수 있다. 각 Probe는 애플리케이션의 실제 복구 전략에 맞게 설계해야 한다.

## 15. RollingUpdate와 Blue/Green 배포

새 버전을 배포할 때 모든 기존 Pod를 먼저 종료하면 서비스 중단이 발생한다. Kubernetes는 Deployment의 RollingUpdate로 Pod를 점진적으로 교체한다.

```text
기존 ReplicaSet: 3 → 2 → 1 → 0
신규 ReplicaSet: 0 → 1 → 2 → 3
```

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

- `maxUnavailable: 0`: 원하는 복제본 수보다 준비된 Pod가 적어지지 않게 진행
- `maxSurge: 1`: 교체 중 목표 복제본보다 최대 한 개 더 생성

RollingUpdate 중에는 신·구 버전이 동시에 요청을 처리할 수 있다. API와 DB 스키마가 두 버전에서 호환되어야 한다.

Blue/Green은 기존 버전과 신규 버전을 각각 완성된 환경으로 유지한 후 트래픽 대상을 전환한다.

```text
Blue Deployment + Blue Service: 현재 운영
Green Deployment + Green Service: 신규 버전 검증

Ingress backend
  Blue Service → Green Service로 전환
```

| 방식 | 장점 | 고려할 점 |
|---|---|---|
| RollingUpdate | 추가 자원이 비교적 적고 Deployment에서 기본 지원 | 배포 중 두 버전 공존 |
| Blue/Green | 전환 전 신규 환경 검증, 빠른 트래픽 복귀 | 두 환경을 위한 추가 자원 필요 |
| Canary | 일부 트래픽에 먼저 신버전 노출 | 비율 제어와 분석을 위한 추가 라우팅 필요 |

배포 전략만 설정했다고 무중단이 자동 보장되지는 않는다. Readiness Probe, graceful shutdown, 종료 유예 시간, API 호환성과 충분한 클러스터 자원이 함께 필요하다.

## 16. 관측성은 로그, 메트릭, 트레이스를 연결한다

애플리케이션이 실행되고 있다는 사실만으로 정상 운영을 판단할 수 없다.

| 데이터 | 답하는 질문 | 예시 |
|---|---|---|
| 로그 | 어떤 사건과 오류가 발생했는가 | 예외 메시지, 요청 실패 원인 |
| 메트릭 | 얼마나 많이, 느리게 발생하는가 | 요청 수, 오류율, 지연, CPU |
| 트레이스 | 요청이 여러 서비스를 어떻게 통과했는가 | API → 결제 → DB 호출 경로 |

Spring Boot Actuator와 Prometheus를 사용하는 흐름은 다음과 같다.

```text
Application
  → /actuator/prometheus에 메트릭 노출
  ← Prometheus가 주기적으로 scrape
  → 시계열 데이터 저장
  → Grafana가 조회하고 시각화
```

Pod annotation은 수집 대상 탐색에 활용될 수 있다.

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
    prometheus.io/path: "/actuator/prometheus"
```

이 annotation을 실제로 읽을지는 Prometheus의 수집 설정에 달려 있다. annotation만 붙였다고 메트릭 수집이 자동 완성되는 것은 아니다.

대시보드에서는 요청량, 오류율, 응답 지연, CPU와 메모리, 재시작 수를 함께 봐야 한다. CPU가 낮아도 외부 API나 DB 응답을 기다리느라 서비스 지연이 커질 수 있다.

## 17. 장애 상태를 읽는 기준

Pod 목록의 `STATUS`는 문제의 출발점이며 최종 원인 자체는 아니다.

| 상태 | 의미와 주요 원인 | 우선 확인할 곳 |
|---|---|---|
| `Pending` | 아직 Node 배치나 실행 준비를 완료하지 못함 | 자원, 스케줄링, PVC Events |
| `ContainerCreating` | 이미지, 네트워크, Volume 준비 중 | `describe pod` Events |
| `ErrImagePull` | 이미지 가져오기 실패 | 이미지 주소, Tag, Registry 권한 |
| `ImagePullBackOff` | 이미지 pull 재시도 간격을 늘리는 중 | `describe pod` Events |
| `CrashLoopBackOff` | 컨테이너가 반복 종료됨 | 현재·이전 컨테이너 로그 |
| `Running 0/1` | 실행 중이지만 Ready가 아님 | Readiness Probe와 앱 상태 |
| `OOMKilled` | 메모리 한도를 초과해 종료됐을 가능성 | 종료 이유, 사용량, memory limit |

문제 해결은 다음 순서로 범위를 좁히는 것이 효율적이다.

```bash
# 1. 올바른 Cluster와 Namespace인지 확인
kubectl config current-context
kubectl get pods -n production

# 2. Pod 상태와 Events 확인
kubectl describe pod POD_NAME -n production
kubectl get events -n production --sort-by=.metadata.creationTimestamp

# 3. 애플리케이션 로그 확인
kubectl logs POD_NAME -n production --tail=100
kubectl logs POD_NAME -n production --previous --tail=100

# 4. Service 연결 확인
kubectl get service my-api -n production -o yaml
kubectl get pods -n production --show-labels
kubectl get endpointslices -n production \
  -l kubernetes.io/service-name=my-api

# 5. Ingress 확인
kubectl describe ingress my-app-ingress -n production
```

`ImagePullBackOff`는 이미지 다운로드 문제이고 `CrashLoopBackOff`는 이미지를 실행한 뒤 프로세스가 반복 종료되는 문제다. 전자는 Events, 후자는 로그가 가장 중요한 단서가 된다.

## 18. 전체 요청과 제어 흐름

Kubernetes의 각 리소스는 독립된 기능처럼 보이지만 하나의 배포와 요청 흐름을 구성한다.

```text
1. 개발자가 이미지를 Registry에 push
2. Deployment Manifest를 API Server에 apply
3. API Server가 원하는 상태를 저장
4. Deployment Controller가 ReplicaSet 생성
5. ReplicaSet Controller가 Pod 생성
6. Scheduler가 Pod를 실행할 Node 선택
7. 해당 Node의 kubelet이 변경을 Watch
8. Container Runtime이 Registry에서 이미지를 pull
9. 컨테이너 실행 후 kubelet이 상태 보고
10. Readiness Probe가 성공하면 Pod가 요청 처리 준비
11. Service selector가 Pod label과 일치하는 Pod 선택
12. EndpointSlice에 준비된 Pod IP와 포트 반영
13. CoreDNS가 Service 이름을 ClusterIP로 해석
14. Ingress가 외부 HTTP 경로를 Service에 연결
15. Service 또는 네트워크 구현이 요청을 Pod로 전달
16. Prometheus가 메트릭을 수집하고 Grafana가 시각화
```

이 흐름에서 가장 중요한 관계는 네 가지다.

```text
Deployment selector = Pod label
Service selector    = Pod label
Service port        → Pod targetPort
PVC                 → PV → 실제 Storage
```

Kubernetes를 이해한다는 것은 YAML 필드를 외우는 것보다, **원하는 상태가 어떤 Controller에 의해 실제 상태로 바뀌고, 네트워크 요청이 어떤 리소스를 거쳐 준비된 Pod에 도달하는지 설명할 수 있는 것**에 가깝다.

