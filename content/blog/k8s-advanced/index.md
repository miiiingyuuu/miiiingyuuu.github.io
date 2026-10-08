---
title: "Kubernetes 심화 정리"
date: "2026-10-08"
category: ["DevOps", "Kubernetes", "Infrastructure"]
description: "Kubernetes API, ServiceAccount와 RBAC, 컨테이너 실행, 배포 전략, Service와 Ingress, 저장소, Probe, 보안과 QoS를 예제 코드와 함께 정리"
---

Kubernetes는 컨테이너를 실행하는 도구를 넘어, 선언한 상태를 지속적으로 유지하는 시스템이다. 애플리케이션을 운영하려면 컨테이너 실행뿐 아니라 인증, 권한, 네트워크, 데이터 저장, 배포 전략, 상태 검사와 자원 관리가 함께 구성되어야 한다.

API와 인증·권한부터 컨테이너 실행, 배포, 네트워크, 설정, 저장소, 상태 검사와 자원 관리까지 주요 기술을 예제와 함께 정리합니다. 예제의 이미지 주소, Namespace, 도메인과 저장소 설정은 실행 환경에 맞게 변경해야 합니다.

---

## 왜 Kubernetes를 사용하는가?

컨테이너를 실행하는 것만으로 애플리케이션 운영이 끝나지는 않습니다. 장애 시 복구, 트래픽 연결, 버전 교체와 데이터 보관을 함께 관리해야 합니다.

- **복제본 관리**: 앱을 여러 Pod로 실행하고 원하는 수를 유지합니다.
- **선언적 배포**: YAML로 원하는 상태를 정의하고 Controller가 현재 상태를 조정합니다.
- **네트워크 연결**: Service와 Ingress로 안정적인 내부·외부 접속점을 제공합니다.
- **설정과 데이터 분리**: ConfigMap, Secret, Volume으로 이미지와 운영 정보를 분리합니다.
- **운영 자동화**: Probe, Job, CronJob과 자원 설정으로 상태 검사와 작업 실행을 관리합니다.

---

## 초기 세팅

`kubectl`과 접근 가능한 Kubernetes 클러스터, 올바른 kubeconfig가 필요합니다. 이미지 빌드에는 Docker를 사용하며, 실습 템플릿과 kubeconfig 처리에는 `yq`를 사용합니다.

```bash
# 현재 접속 대상과 접근 가능한 노드 확인
kubectl config current-context
kubectl cluster-info
kubectl get nodes

# 예제용 Namespace 생성
kubectl create namespace demo --dry-run=client -o yaml | kubectl apply -f -
```

노드 조회는 클러스터 범위 권한이 필요합니다. 교육용 계정에서 `Forbidden`이 발생하면 허용된 Namespace의 리소스로 접근 상태를 확인합니다.

```bash
kubectl get pods -n demo
```

## 기본 YAML 구조

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
```

| 필드 | 역할 |
|---|---|
| `apiVersion` | 사용할 API 그룹과 버전 |
| `kind` | 리소스 종류 |
| `metadata` | 이름, Namespace, Label 등 식별 정보 |
| `spec` | 원하는 상태 |
| `status` | Kubernetes가 관찰한 현재 상태. 보통 직접 작성하지 않음 |

---

## Kubernetes 구성 요소와 선언적 운영

Kubernetes의 기본 실행 단위는 **Pod**다. Pod에는 하나 이상의 컨테이너가 포함되며, 스케줄러는 Pod를 단위로 노드를 선택한다.

| 구성 요소 | 역할 |
|---|---|
| kube-apiserver | API 요청의 진입점. 인증·인가와 요청 처리를 수행한다. |
| etcd | 클러스터 상태와 리소스 정보를 저장한다. |
| kube-scheduler | 배치되지 않은 Pod가 실행될 Node를 선택한다. |
| kube-controller-manager | 리소스의 현재 상태와 원하는 상태를 비교해 조정한다. |
| kubelet | 각 Node에서 Pod의 컨테이너 실행과 상태 관리를 수행한다. |
| 컨테이너 런타임 | containerd 등 실제 컨테이너 실행을 담당한다. |
| CoreDNS | 클러스터 내부의 이름 해석을 제공한다. |
| kube-proxy 또는 대체 구현 | Service 트래픽 전달을 구현한다. |

확장 인터페이스도 역할별로 구분한다.

| 인터페이스 | 대상 |
|---|---|
| CRI | 컨테이너 런타임 |
| CNI | 컨테이너 네트워크 |
| CSI | 스토리지 |

### 원하는 상태와 조정 루프

```text
YAML로 원하는 상태 선언
        ↓
API Server에 요청
        ↓
리소스 정보 저장
        ↓
Controller가 현재 상태를 관찰하고 조정
```

예를 들어 Deployment의 `replicas: 3`은 “Pod를 한 번 세 개 생성하라”가 아니라 “관리 대상 Pod가 세 개 유지되도록 하라”는 선언이다. Pod가 삭제되면 Controller가 부족한 수를 다시 생성한다.

```bash
kubectl apply -f deployment.yaml
kubectl get pods -n demo
kubectl describe pod <pod-name> -n demo
```

### Namespace, Label, Selector

- **Namespace**는 팀이나 환경별로 리소스를 논리적으로 분리한다. Namespace 자체만으로 네트워크 격리가 완성되는 것은 아니다.
- **Label**은 리소스에 붙이는 식별·분류용 메타데이터다.
- **Selector**는 Label을 조건으로 리소스 집합을 선택한다.

```yaml
metadata:
  labels:
    app: web
    version: "1.0"
```

Service의 `selector: {app: web}`은 같은 Namespace에서 해당 Label을 가진 Pod를 연결 대상으로 선택한다. Pod 이름에 `web`이 포함되는지는 관계없다.

---

## Kubernetes API와 직접 호출

`kubectl`은 Kubernetes API를 편리하게 호출하는 클라이언트다. 서버 주소, 인증과 요청 형식을 직접 구성하면 `curl`로도 리소스를 조회·생성·삭제할 수 있다.

| 작업 | HTTP 메서드 | 경로 예시 |
|---|---|---|
| Pod 목록 조회 | GET | `/api/v1/namespaces/demo/pods` |
| Pod 생성 | POST | `/api/v1/namespaces/demo/pods` |
| 특정 Pod 삭제 | DELETE | `/api/v1/namespaces/demo/pods/web` |
| Deployment 목록 조회 | GET | `/apis/apps/v1/namespaces/demo/deployments` |

Core API는 `/api/v1`, `apps`처럼 이름이 있는 API 그룹은 `/apis/<그룹>/<버전>`을 사용한다.

```bash
curl --cacert "$CA_FILE" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_SERVER/api/v1/namespaces/demo/pods"
```

실습의 API 스크립트는 `yq`로 kubeconfig의 Context, 클러스터 주소와 사용자 토큰을 읽는다. 이러한 구현은 kubeconfig에 정적 `token`이 있는 인증 방식을 전제로 한다. 인증서나 `exec` 플러그인 기반 인증에는 추가 처리가 필요하다.

`yq` 같은 의존 도구가 없으면 주소와 토큰을 읽지 못해 이후 요청까지 실패한다. 요청 전에 의존성과 필수 값이 준비되어 있는지 확인해야 한다.

---

## ServiceAccount와 RBAC

API 접근에서는 **인증**과 **인가**를 구분한다.

| 구분 | 질문 | 관련 기술 |
|---|---|---|
| 인증 | 요청한 주체는 누구인가? | ServiceAccount, 토큰, 인증서 |
| 인가 | 그 주체가 어떤 작업을 할 수 있는가? | RBAC |

### ServiceAccount

ServiceAccount는 Pod 안의 애플리케이션이 API에 접근할 때 사용할 수 있는 신원이다. `serviceAccountName`을 지정하지 않은 Pod는 해당 Namespace의 `default` ServiceAccount를 사용한다.

기본적인 자동 마운트 설정에서는 다음 파일을 확인할 수 있다.

```text
/var/run/secrets/kubernetes.io/serviceaccount/
├── token
├── ca.crt
└── namespace
```

```bash
kubectl exec -it <pod-name> -n demo -- /bin/sh
ls /var/run/secrets/kubernetes.io/serviceaccount
```

현대 Kubernetes에서는 일반적으로 만료 시간이 있는 projected ServiceAccount 토큰을 사용한다. 실습의 `kubernetes.io/service-account-token` Secret은 장기 토큰을 별도로 생성하는 방식이다. 자동 마운트 여부는 `automountServiceAccountToken`으로 제어할 수 있다.

### Role과 Binding

```text
ServiceAccount ── RoleBinding ── Role
     신원             연결        허용 작업
```

| 리소스 | 역할 |
|---|---|
| Role | Namespace 범위의 권한 정의 |
| ClusterRole | 클러스터 범위 권한 또는 재사용할 Namespace 리소스 권한 정의 |
| RoleBinding | 해당 Namespace에서 Role 또는 ClusterRole을 주체에 연결 |
| ClusterRoleBinding | 클러스터 전체 범위에서 ClusterRole을 주체에 연결 |

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: demo
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

```bash
kubectl auth can-i list pods -n demo
kubectl auth can-i list secrets -n demo
```

Pod 조회 권한이 있다고 ServiceAccount나 Secret 조회 권한까지 있는 것은 아니다. 권한은 API 그룹·리소스·동작 조합으로 결정된다.

---

## 컨테이너 실행: command, args, Init Container, Sidecar

### command와 args

Kubernetes의 `command`는 이미지의 ENTRYPOINT, `args`는 CMD에 대응한다.

```yaml
command: ["/bin/sh", "-c"]
args:
  - exec python3 "$EXEC_PYTHON_CODE" --port "$SERVER_PORT"
env:
  - name: EXEC_PYTHON_CODE
    value: fastserver.py
  - name: SERVER_PORT
    value: "8080"
```

이 예제에서는 셸이 환경변수를 확장하고 `python3 fastserver.py --port 8080`을 실행한다. `exec`는 셸을 앱 프로세스로 교체하므로 앱이 종료 신호를 직접 받는 데 도움이 된다.

### Init Container와 Sidecar

| 구분 | 일반 Init Container | Sidecar 패턴 |
|---|---|---|
| 목적 | 앱 시작 전 준비 | 앱 실행 중 보조 |
| 실행 방식 | 순서대로 실행하고 성공 종료 | 메인 앱과 함께 실행 |
| 예시 | 초기 데이터 준비, 파일·의존 서비스 대기 | 프록시, 로그 수집 |

실습에서는 Init 컨테이너가 공유 볼륨의 `active.enabled` 파일을 기다린다.

```text
파일 대기 → 파일 확인 → Init 성공 종료 → 메인 시작 → readiness 검사
```

완료된 Init 컨테이너에는 `kubectl exec`로 접속할 수 없다. 메인 컨테이너 시작 전, Init 컨테이너가 실행 중인 동안 접속해야 한다.

Sidecar 실습에서는 같은 Pod의 Nginx가 `127.0.0.1:8080`으로 앱에 요청을 전달한다. 같은 Pod의 컨테이너는 네트워크를 공유하지만, 파일을 공유하려면 공통 볼륨을 별도로 구성해야 한다.

실습은 일반 `containers`에 보조 컨테이너를 배치한 방식이다. Kubernetes에는 `initContainers`와 `restartPolicy: Always`를 사용하는 네이티브 Sidecar 구성도 있다.

---

## Deployment, ReplicaSet, StatefulSet

### Deployment와 ReplicaSet

```text
Deployment → ReplicaSet → Pod
배포·업데이트   복제 수 유지   실제 실행
```

- ReplicaSet은 원하는 Pod 수를 유지한다.
- Deployment는 ReplicaSet을 관리하며 배포·업데이트·롤백을 지원한다.
- 이미지 등 Pod 템플릿이 변경되면 새 ReplicaSet이 생성된다.
- 복제 수만 변경하면 기존 ReplicaSet의 원하는 수가 조정된다.

```bash
kubectl get deployment,replicaset,pod -n demo
kubectl scale deployment/web -n demo --replicas=3
kubectl rollout status deployment/web -n demo
kubectl rollout history deployment/web -n demo
kubectl rollout undo deployment/web -n demo
```

기본 업데이트 전략인 RollingUpdate는 기존 Pod를 점진적으로 교체한다. `maxSurge`는 업데이트 중 추가 허용 Pod 수, `maxUnavailable`은 사용할 수 없어도 되는 Pod 수를 제어한다.

### StatefulSet과 Headless Service

| 항목 | Deployment | StatefulSet |
|---|---|---|
| Pod 정체성 | 대체 가능한 복제본 중심 | Pod별 안정적인 정체성 |
| 이름 | 임의 접미사 | `web-0`, `web-1` 등 순번 |
| 저장소 | 별도 구성 | `volumeClaimTemplates`로 Pod별 PVC 구성 가능 |

StatefulSet은 안정적인 이름과 연결된 저장소가 필요한 워크로드에 적합하다. 데이터 복제나 데이터베이스의 일관성을 자동으로 구현하는 것은 아니다.

Headless Service는 `clusterIP: None`으로 설정하며, 하나의 가상 IP 대신 개별 Pod 주소를 DNS로 발견하도록 돕는다.

```yaml
spec:
  clusterIP: None
  selector:
    app: web
```

---

## Service와 Ingress

### Service: 안정적인 접속점

Pod IP는 교체 과정에서 바뀔 수 있다. Service는 Pod 집합에 안정적인 이름과 접속점을 제공한다.

| 유형·구성 | 특징 |
|---|---|
| ClusterIP | 기본 유형. 클러스터 내부 가상 IP 제공 |
| NodePort | 노드 포트로 Service 노출 |
| LoadBalancer | 외부 로드밸런서와 연결 |
| ExternalName | 외부 도메인으로 DNS 별칭 제공 |
| Headless | 가상 IP 없이 개별 주소 발견 |
| selector 없음 | EndpointSlice 등으로 연결 대상을 별도 관리 |

실습에는 selector 없는 Service와 수동 Endpoints 예제가 포함되어 있다. 새로운 구성에서는 EndpointSlice를 중심으로 이해하는 것이 좋다.

```text
Service port → targetPort → 앱이 실제로 듣는 포트
```

`containerPort`는 선언 정보이며, 앱의 수신 포트를 직접 열거나 변경하지 않는다.

```bash
kubectl port-forward -n demo deployment/web 9090:8080
```

위 명령은 로컬 9090을 대상의 8080으로 전달한다. NodePort Service 생성과는 별개다.

### Ingress: HTTP/HTTPS 라우팅

```text
외부 사용자 → Ingress Controller → Service → Pod
                    ↑
              Ingress 규칙
```

Ingress는 Host와 Path에 따른 연결 규칙이다. 실제 요청을 처리할 Ingress Controller가 필요하며 `ingressClassName`으로 처리할 클래스를 지정한다.

`pathType: Prefix`의 `/api`는 `/api/users`와 일치하지만 `/apix`와는 일치하지 않는다. 경로를 바꾸는 rewrite 설정이 없다면 원래 경로가 백엔드로 전달된다.

### TLS와 cert-manager

TLS Secret은 `kubernetes.io/tls` 타입이며 `tls.crt`, `tls.key`를 포함한다. Ingress는 같은 Namespace의 Secret을 `tls.secretName`으로 참조한다.

- 인증서의 SAN은 실제 접속 도메인과 일치해야 한다.
- 자체 서명 인증서는 클라이언트의 기본 신뢰 목록에 없으므로 경고가 발생할 수 있다.
- cert-manager는 인증서 발급과 갱신을 자동화한다.
- Issuer는 Namespace 범위, ClusterIssuer는 클러스터 범위에서 참조한다.
- Let's Encrypt 와일드카드 발급에는 DNS-01 검증이 필요하다.

Controller에서 TLS를 종료하고 백엔드에는 HTTP로 전달하는 구성도 가능하다. 외부 HTTPS가 내부 통신까지 자동으로 HTTPS로 바꾸지는 않는다.

---

## ConfigMap과 Secret

| 항목 | ConfigMap | Secret |
|---|---|---|
| 대상 | 일반 설정 | 비밀번호·토큰 등 민감한 설정 |
| 환경변수 참조 | configMapKeyRef | secretKeyRef |
| 파일 전달 | ConfigMap 볼륨 | Secret 볼륨 |

Secret의 `stringData`는 평문 작성용 필드이고, API로 조회하는 `data`는 Base64 표현이다. Base64는 암호화가 아니며 접근 제어와 저장 시 암호화는 별도로 고려해야 한다.

설정 변경 후 동작도 전달 방식에 따라 다르다.

- 환경변수는 실행 중인 컨테이너에 자동 반영되지 않아 재생성이 필요하다.
- 일반적인 볼륨 마운트 파일은 나중에 갱신되지만 앱이 다시 읽어야 실제 설정에 반영된다.
- `subPath` 마운트는 자동 갱신되지 않는다.
- ConfigMap이나 Secret 변경만으로 Deployment가 자동 재배포되지는 않는다.

---

## Volume, PV, PVC, StorageClass

| 기술 | 데이터 수명과 특징 |
|---|---|
| emptyDir | Pod 수명에 연결. 컨테이너 재시작에는 유지, Pod 삭제 시 소멸 |
| hostPath | 노드의 디렉터리 연결. 특정 노드에 종속 |
| PV | 클러스터 범위의 저장소 자원 표현 |
| PVC | Namespace에서 필요한 저장소를 요청 |
| StorageClass | 동적 공급 방식과 파라미터 정의 |

정적 공급에서는 PV를 직접 정의하고 PVC와 연결한다. 동적 공급에서는 PVC가 StorageClass를 참조해 저장소 공급을 요청한다. 연결 완료 상태는 `Bound`다.

| 접근 모드 | 의미 |
|---|---|
| ReadWriteOnce | 한 노드에서 읽기·쓰기 |
| ReadOnlyMany | 여러 노드에서 읽기 전용 |
| ReadWriteMany | 여러 노드에서 읽기·쓰기 |
| ReadWriteOncePod | 하나의 Pod로 읽기·쓰기 제한 |

**ReadWriteOnce는 Pod 하나만 사용한다는 의미가 아니다.** 같은 노드의 여러 Pod가 사용할 수 있다.

실습의 EFS는 여러 노드의 공유 파일 저장소, EBS는 노드 연결 제약이 있는 블록 저장소를 비교하는 예제다. 접근 모드만으로 모든 저장소가 해당 기능을 제공하는 것은 아니며 드라이버와 저장소가 지원해야 한다.

PV의 회수 정책도 구분한다.

- `Retain`: PVC 삭제 이후 저장소를 보존하고 별도 정리한다.
- `Delete`: 지원하는 공급자에서 연결된 저장소도 삭제한다.

```bash
kubectl get pvc -n demo
kubectl describe pvc <pvc-name> -n demo
kubectl get storageclass
```

---

## Blue-Green과 Canary 배포

| 방식 | 동작 |
|---|---|
| RollingUpdate | Pod를 점진적으로 교체 |
| Blue-Green | 신·구 환경을 준비한 후 연결 대상 전환 |
| Canary | 일부 요청에 새 버전을 먼저 적용 |

Blue-Green 실습은 Service selector의 `version`을 변경한다.

```yaml
selector:
  app: web
  version: "2.0"
```

Canary 실습은 Nginx Ingress의 annotation으로 헤더, 쿠키, 가중치에 따른 트래픽 분기를 구성한다. 이러한 annotation은 Controller 구현에 종속되며 Kubernetes 공통 기능은 아니다.

새 버전 Pod를 실행하는 단계와 사용자 트래픽을 연결하는 단계를 구분하면 배포 전략을 이해하기 쉽다.

---

## 정상 종료와 Probe

### Graceful shutdown

| 설정 | 역할 |
|---|---|
| postStart | 컨테이너 생성 이후 실행하는 훅 |
| preStop | 종료 전에 실행하는 훅 |
| terminationGracePeriodSeconds | 정상 종료 유예 시간 |

`postStart`가 앱의 ENTRYPOINT보다 먼저 완료된다는 보장은 없다. 일반적인 정상 종료에서는 `preStop`, 종료 신호 전달, 앱 종료 대기가 이루어지며 유예 시간 이후 강제 종료될 수 있다.

유예 시간에는 `preStop` 실행 시간도 포함된다. 실습처럼 유예 시간을 0으로 설정하면 `preStop`의 대기 작업을 완료할 시간을 보장하지 않는다. 앱 자체의 종료 신호 처리도 함께 구현해야 한다.

### Probe

| 검사 | 질문 | 실패 기준 도달 시 |
|---|---|---|
| startupProbe | 앱 시작이 끝났는가? | 컨테이너 재시작 처리 |
| livenessProbe | 앱에 재시작이 필요한가? | 컨테이너 재시작 처리 |
| readinessProbe | 요청을 받아도 되는가? | 일반적인 Service 트래픽 대상에서 제외 |

startupProbe 성공 전에는 liveness와 readiness 검사가 시작되지 않는다. 실습 파일은 liveness와 readiness를 중심으로 구성되어 있다.

`initialDelaySeconds`, `periodSeconds`, `timeoutSeconds`, `failureThreshold`로 검사 시점과 실패 판단을 조절한다. HTTP Probe의 성공 범위는 200 이상 400 미만이다.

**Running은 실행 상태, Ready는 요청을 받을 준비 상태다.** readiness 실패만으로 컨테이너가 재시작되지는 않는다.

---

## Job과 CronJob

```text
CronJob → Job → Pod
실행 일정   완료 관리   실제 작업
```

| 필드 | 의미 |
|---|---|
| completions | 필요한 성공 완료 수 |
| parallelism | 동시에 실행할 수 있는 Pod 수 |
| backoffLimit | 실패 재시도 제한 |
| schedule | Cron 표현식 |
| concurrencyPolicy | 해당 CronJob의 작업 중복 실행 정책 |

`completions: 3`, `parallelism: 2`는 총 세 번 성공해야 하며 최대 두 개를 동시에 실행한다는 의미다.

`*/3 * * * *`는 매 3분이다. `concurrencyPolicy: Forbid`는 이전 Job이 실행 중이면 다음 실행을 건너뛴다. 완료 시점을 관리하는 Job은 계속 실행되는 서버를 관리하는 Deployment와 목적이 다르다.

---

## SecurityContext와 스케줄링

### 프로세스 실행 권한

| 설정 | 의미 |
|---|---|
| runAsUser / runAsGroup | 실행 UID / GID |
| runAsNonRoot | root 실행 방지 |
| privileged | 광범위한 시스템 권한 허용 |
| capabilities | Linux 권한을 선택적으로 추가·제거 |

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

위 구성은 이미지가 해당 사용자로 실행될 수 있다는 전제가 필요하다. 파일 접근 권한이나 시작 명령이 root를 요구하면 실행에 실패할 수 있다.

ServiceAccount와 RBAC는 API 요청 권한을, SecurityContext는 컨테이너 프로세스의 실행 권한을 제어한다.

### 배치 조건

- Taint는 특정 Pod의 노드 배치를 막거나 제한한다.
- Toleration은 해당 Taint를 허용하지만 그 노드에 배치됨을 보장하지 않는다.
- Node Affinity는 노드 조건을 지정한다.
- Pod Affinity는 다른 Pod와 가까이, Anti-Affinity는 떨어져 배치한다.
- `requiredDuringSchedulingIgnoredDuringExecution`은 스케줄링 시 필수 조건이다. 실행 이후 조건 변경만으로 Pod를 자동 이동시키지는 않는다.

---

## requests, limits, QoS, PriorityClass

| 개념 | 역할 |
|---|---|
| requests | 스케줄링 시 필요한 자원량 판단 기준 |
| limits | 실행 중 자원 사용 상한 |
| QoS | 자원 설정에 따른 Pod 분류 |
| PriorityClass | Pod의 스케줄링 우선순위 지정 |

```yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "200m"
    memory: "256Mi"
```

`100m`은 CPU 0.1개에 해당한다. requests는 자원을 미리 사용하는 값이 아니라 스케줄링과 자원 관리의 기준이다.

| QoS | 일반적인 CPU·메모리 설정 조건 |
|---|---|
| BestEffort | 모든 컨테이너에 requests와 limits가 없음 |
| Guaranteed | 모든 컨테이너에 CPU·메모리 requests와 limits가 있으며 각각 동일 |
| Burstable | 위 두 조건에 해당하지 않는 경우 |

CPU limit 초과는 주로 throttling으로 실행이 제한된다. 메모리 limit 초과는 OOM 종료로 이어질 수 있다.

PriorityClass는 자원이 부족할 때 중요한 Pod의 스케줄링 우선순위를 높이며 조건에 따라 낮은 우선순위 Pod의 선점을 유발할 수 있다. QoS와 별개이고, 높은 우선순위가 자원 무제한이나 무중단을 보장하지 않는다.

---

## 문제 확인 순서

문제 발생 시 설정을 무작정 바꾸기보다 상태와 이벤트를 먼저 확인한다.

```bash
kubectl get pods -n demo -o wide
kubectl describe pod <pod-name> -n demo
kubectl logs <pod-name> -n demo -c <container-name>
kubectl logs <pod-name> -n demo -c <container-name> --previous
```

| 상태·증상 | 우선 확인할 것 |
|---|---|
| Pending | requests, 배치 조건, Taint, PVC, 노드 자원 |
| ErrImagePull / ImagePullBackOff | 이미지 경로·태그·인증·레지스트리 접근 |
| Init 대기 | Init 로그와 완료 조건 |
| CrashLoopBackOff | 종료 원인, 앱 로그, 실행 명령, Probe |
| Running이지만 Ready 아님 | readiness 설정과 앱 준비 상태 |
| Service 접속 실패 | Namespace, selector, 대상 Pod 준비 상태, 포트 |
| Ingress 접속 실패 | DNS, Controller, IngressClass, Host·Path, Service |
| HTTPS 검증 실패 | 인증서 신뢰, SAN, 유효기간, TLS Secret |
| Forbidden | 요청 신원과 RBAC 권한 |

Events에는 해결 이전의 오류도 남는다. 과거 경고만으로 현재 실패 상태라고 판단하지 않고, 현재 컨테이너 상태·Ready 조건·최신 이벤트를 함께 확인한다.

---

## 기술별 역할 요약

```text
API Server               API 요청 진입점
ServiceAccount / RBAC     요청 신원과 허용 작업
Init / Sidecar           시작 전 준비와 실행 중 보조
Deployment / StatefulSet 복제본과 상태형 워크로드 관리
Service / Ingress        내부 접속점과 외부 HTTP 라우팅
ConfigMap / Secret       일반 설정과 민감한 설정 전달
PV / PVC / StorageClass  데이터 저장과 저장소 공급
Probe / 종료 훅           준비 상태·재시작·정상 종료
Job / CronJob            완료 작업과 예약 실행
SecurityContext          프로세스 실행 권한
requests / limits / QoS  자원 요구량·상한·분류
PriorityClass            스케줄링 우선순위
```
