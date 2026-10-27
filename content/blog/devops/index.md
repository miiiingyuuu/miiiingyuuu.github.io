---
title: "DevOps 이해 및 활용"
date: "2026-10-21"
description: "컨테이너 이미지 빌드와 Harbor, Kustomize와 Helm, Jenkins Pipeline과 Credential, Argo CD의 선언적 동기화를 연결해 CI/CD와 GitOps 배포 구조를 정리"
category: ["DevOps"]
tags: ["CI/CD", "Kubernetes"]
---

소스코드가 완성되는 시점과 사용자가 새 기능을 이용하는 시점 사이에는 여러 작업이 존재한다. 코드를 빌드하고 테스트해야 하며, 실행 환경을 이미지로 패키징하고, 배포 설정을 변경한 뒤 실제 서비스가 준비되었는지 확인해야 한다.

**DevOps는 이 전달 과정에서 개발과 운영의 협업을 개선하고, 반복 작업을 자동화하며, 변경 결과를 빠르게 확인하는 접근 방식**이다. Jenkins나 Kubernetes 같은 도구는 이를 구현하는 수단이고, 도구의 설치만으로 전달 프로세스가 완성되지는 않는다.

```text
Source Code → Application Artifact → Container Image → Registry
                                                        │
                                                        ↓
                            Git의 배포 설정 ← 새 이미지 참조
                                  │
                                  ↓
                            Argo CD 동기화
                                  │
                                  ↓
                         Kubernetes의 실제 리소스
                                  │
                                  ↓
                         Ingress를 통한 사용자 요청
```

예제의 Namespace는 `demo`, 앱 이름은 `api`, 이미지 주소는 `registry.example.com/team/api`로 통일한다. 저장소 주소, 인증정보와 도메인은 실행 환경에 맞게 변경해야 한다. 코드에는 구조를 설명하는 발췌 예제도 포함되어 있다.

---

## 1. CI, Continuous Delivery, Continuous Deployment

CI/CD는 하나의 제품이 아니라 변경을 검증하고 전달하는 절차다. 특히 CD는 Delivery와 Deployment를 구분해서 이해해야 한다.

| 구분 | 핵심 목적 | 운영 반영 |
|---|---|---|
| Continuous Integration | 변경을 자주 통합하고 빌드·테스트로 문제를 조기에 발견 | 운영 배포까지 요구하지 않음 |
| Continuous Delivery | 검증된 변경을 언제든 배포 가능한 상태로 유지 | 승인이나 수동 실행 단계를 둘 수 있음 |
| Continuous Deployment | 검증을 통과한 변경을 운영에 자동 반영 | 변경마다 별도 수동 승인 없이 자동 진행 |

```text
CI
소스 변경 → 빌드 → 테스트 → 배포 가능한 Artifact

Continuous Delivery
검증된 Artifact → 운영 반영 승인 → 배포

Continuous Deployment
검증된 Artifact → 자동 배포
```

Jenkins에서 `Build Now`를 눌렀다는 사실만으로 어떤 CD 방식을 사용하는지 결정되지는 않는다. 실제 구분 기준은 전체 전달 흐름, 검증 조건과 운영 반영 정책이다.

또한 Stage 이름이 `test`라고 해도 `echo 'Testing'`만 실행한다면 테스트를 수행한 것이 아니다. `mvn clean package -DskipTests`로 JAR를 생성하는 예제 역시 테스트 실행을 생략한 구성이다. **자동화된 빌드와 충분한 검증을 갖춘 CI는 구분해야 한다.**

## 2. 소스코드, Artifact, Image, 배포 설정의 구분

파이프라인을 이해하려면 각 단계가 무엇을 생성하고 어디에 저장하는지 구분해야 한다.

| 대상 | 예시 | 주요 저장 위치 | 사용하는 주체 |
|---|---|---|---|
| 소스코드 | Java, Python, Dockerfile | Git Repository | 개발자, CI |
| Application Artifact | `target/app.jar` | 빌드 Workspace, Artifact 저장소 | 이미지 빌더 |
| Container Image | 런타임과 앱을 포함한 이미지 | Harbor 같은 Registry | 컨테이너 런타임 |
| 배포 설정 | Deployment, Kustomize, Helm values | Git Repository | 배포 도구, Argo CD |
| 실제 실행 상태 | Deployment, Pod, Service | Kubernetes API가 관리 | Controller, 운영자 |

GitHub에 소스코드를 push하는 작업과 Harbor에 이미지를 push하는 작업은 서로 다르다. GitOps에서는 여기에 **새 이미지를 실행하도록 배포 설정을 Git에 반영하는 작업**이 추가된다.

### Dockerfile과 Build Context

Dockerfile은 이미지를 만드는 명령을 정의한다. Build Context는 빌더가 `COPY`, `ADD` 등에서 참조할 수 있는 입력 파일의 범위다.

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

위 Dockerfile은 JAR를 직접 컴파일하지 않는다. 먼저 Maven이 JAR를 생성해야 한다.

```bash
mvn clean package

docker buildx build \
  --platform linux/amd64 \
  -t registry.example.com/team/api:1.0.0 \
  --push .
```

마지막 `.`은 현재 디렉터리를 Build Context로 사용한다는 뜻이다. `target/*.jar`가 없거나 `.dockerignore`에 의해 제외되면 이미지 빌드가 실패한다. 이 패턴은 실행 가능한 JAR가 하나라는 전제도 가지므로 여러 JAR가 생성되는 프로젝트에서는 파일명을 명확히 지정하는 편이 좋다.

Build Context에는 앱에 필요한 파일만 포함해야 한다. Git 정보, 로컬 인증 파일, kubeconfig와 불필요한 빌드 결과를 제외하면 전송량과 정보 노출 범위를 줄일 수 있다.

## 3. BuildKit, Buildx, Kaniko, Buildah

이미지를 만드는 도구와 만들어진 컨테이너를 실행하는 런타임은 역할이 다르다. 어떤 빌드 도구를 선택해도 이후에는 Registry에 저장된 이미지를 Kubernetes의 컨테이너 런타임이 가져와 실행한다.

| 도구 | 역할과 특징 | 확인할 지점 |
|---|---|---|
| BuildKit | 빌드 그래프, 캐시, 독립 단계 병렬 처리 등을 제공하는 빌드 엔진 | Builder 실행 환경, 캐시와 출력 방식 |
| Docker Buildx | BuildKit을 사용하는 Docker CLI 플러그인 | Builder Driver, 대상 플랫폼, push/load |
| Kaniko | Docker 데몬 없이 컨테이너 안에서 Dockerfile 기반 이미지 생성 | Context와 인증 파일 전달, 프로젝트 유지보수 상태 |
| Buildah | Docker 데몬 없이 OCI 이미지 생성·관리 | 실행 권한, 저장 드라이버, 플랫폼 지원 |

Buildx와 BuildKit은 서로 경쟁하는 별도 빌드 엔진이 아니다. **Buildx는 빌드를 요청하는 인터페이스이고 BuildKit은 실제 빌드 작업을 처리하는 엔진**이다. BuildKit은 독립적인 빌드 단계의 병렬 실행과 사용하지 않는 단계 생략 등을 통해 작업을 최적화한다. [Docker BuildKit 문서](https://docs.docker.com/build/buildkit/)

### 멀티 플랫폼 이미지

Apple Silicon 개발 환경은 주로 arm64이고 서버는 amd64일 수 있다. 이미지에 실행 파일이나 네이티브 라이브러리가 포함된다면 대상 아키텍처가 맞아야 한다.

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t registry.example.com/team/api:1.0.0 \
  --push .
```

멀티 플랫폼 이미지는 모든 아키텍처에서 실행되는 하나의 바이너리가 아니다. 일반적으로 **플랫폼별 이미지와 이를 묶는 Image Index 또는 Manifest List**로 구성된다. 런타임은 자기 플랫폼에 맞는 이미지를 선택한다.

빌드에는 QEMU 에뮬레이션, 여러 아키텍처의 네이티브 Builder, 크로스 컴파일 같은 전략을 사용할 수 있다. `--platform`만 지정한다고 호환되지 않는 바이너리가 자동 변환되는 것은 아니다. [Docker 멀티 플랫폼 빌드 문서](https://docs.docker.com/build/building/multi-platform/)

```bash
docker buildx imagetools inspect registry.example.com/team/api:1.0.0
```

Registry에서도 태그가 참조하는 플랫폼 목록을 확인할 수 있다. 단일 플랫폼 이미지와 여러 플랫폼을 묶은 인덱스는 구분해서 확인해야 한다.

### Kaniko의 실행 구조

Kaniko는 Dockerfile, Context와 Registry 인증정보를 전달받아 이미지를 생성하고 push한다.

```text
Host의 앱 파일      → /workspace
Registry 인증 파일 → /kaniko/.docker/config.json
                     ↓
                Kaniko Executor
                     ↓
               이미지 생성·Push
```

Kaniko 자체가 Docker 데몬을 요구하지 않는다는 것과, 실습에서 Executor 컨테이너를 `docker run`으로 시작했다는 것은 양립한다. 후자는 실행 환경을 제공하는 방법이다.

`--custom-platform`은 대상 플랫폼 설정이며, 다른 CPU의 실행 파일을 자동으로 실행할 에뮬레이터까지 제공하지는 않는다. Docker 데몬이 없다는 이유만으로 모든 Dockerfile이 무권한 환경에서 동작하는 것도 아니다.

GoogleContainerTools의 원본 Kaniko 저장소는 2025년 6월 3일에 아카이브되었다. 따라서 이 내용은 교재에서 사용한 빌드 구조의 설명이며, 새 시스템에 도입할 때는 유지보수 상태까지 확인해야 한다. [Kaniko 원본 저장소](https://github.com/GoogleContainerTools/kaniko)

### Buildah와 저장 드라이버

Buildah는 로그인, 이미지 생성, Registry 전송을 개별 명령으로 수행할 수 있다.

```bash
# REGISTRY_USER와 REGISTRY_PASSWORD는 외부에서 주입된 값
set +x
printf '%s' "$REGISTRY_PASSWORD" | \
  buildah login --username "$REGISTRY_USER" --password-stdin registry.example.com

buildah bud --storage-driver=vfs \
  --platform linux/amd64 \
  -t registry.example.com/team/api:1.0.0 .

buildah push --storage-driver=vfs registry.example.com/team/api:1.0.0
```

`vfs`는 레이어를 파일 복사 방식으로 관리하므로 중첩 컨테이너 환경에서 Overlay 파일시스템 제약을 피하는 데 쓰일 수 있다. 다만 저장 공간과 I/O 비용이 커질 수 있고, 모든 권한 문제를 해결하는 옵션은 아니다.

macOS에서 Buildah 기반 이미지를 빌드할 때는 Linux 컨테이너나 VM 같은 실행 환경을 사용한다. Jenkins 예제의 `sudo buildah`는 Jenkins가 실행되는 Linux 환경의 명령이며, Mac 터미널에 그대로 옮겨 실행하는 것과는 다르다. [Buildah 프로젝트](https://github.com/podman-container-tools/buildah)

## 4. Harbor와 이미지 버전 관리

Harbor는 이미지를 보관하고 프로젝트별 접근을 관리하는 Registry다. 앱의 실행을 담당하거나 Git 배포 설정을 대신 관리하지는 않는다.

```text
registry.example.com / team / api : 1.0-dk12-a1b2c3d
        Registry      Project Repo       Tag
```

태그에 버전, 빌드 번호와 소스 커밋 해시를 포함하면 빌드 결과를 추적하기 쉽다.

```text
1.0-dk12-a1b2c3d
 │   │      └─ 소스 커밋 식별자
 │   └──────── 빌드 구분·번호
 └──────────── 버전 접두사
```

태그는 기본적으로 변경 가능한 참조다. 같은 태그를 다른 이미지에 붙일 수 있으므로 정확한 아티팩트를 고정하려면 Digest 참조나 태그 불변 정책을 함께 고려한다.

```text
registry.example.com/team/api@sha256:<digest>
```

**이미지 경로와 태그는 배포 설정과 일치해야 한다.** Harbor에 `1.0-dk12-a1b2c3d`가 있는데 Deployment가 `1.0`을 참조하면, 빌드 성공과 무관하게 이미지 다운로드가 실패할 수 있다. [Harbor 이미지 관리 문서](https://goharbor.io/docs/2.14.0/working-with-projects/working-with-images/)

## 5. Kustomize: 공통 YAML에 환경별 차이 적용하기

Kustomize는 Kubernetes YAML을 공통 리소스와 환경별 변경으로 구성한다. 파일 전체를 환경마다 복사하는 대신 공통 정의를 재사용한다.

```text
kustomize/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   ├── patch-deployment.yaml
    │   └── ingress.yaml
    └── prod/
        └── kustomization.yaml
```

base는 Deployment와 Service 같은 공통 정의를 제공한다. overlay는 Namespace, 이미지 태그, 복제 수, ConfigMap과 Ingress처럼 환경별 차이를 적용한다.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: demo

resources:
  - ../../base
  - ingress.yaml

images:
  - name: registry.example.com/team/api
    newTag: "1.0-dk12-a1b2c3d"

patches:
  - path: patch-deployment.yaml
    target:
      kind: Deployment
      name: api
```

### 태그 편집과 렌더링·배포는 다른 작업이다

```bash
# kustomization.yaml 편집
(
  cd kustomize/overlays/dev &&
  kustomize edit set image \
    registry.example.com/team/api=registry.example.com/team/api:1.0-dk12-a1b2c3d
)

# 최종 YAML 생성
kubectl kustomize kustomize/overlays/dev

# 실제 클러스터에 적용
kubectl apply -k kustomize/overlays/dev
```

`kustomize edit`는 파일을 수정한다. `kubectl kustomize`는 렌더링하고 `kubectl apply -k`는 렌더링한 리소스를 적용한다. **kubectl도 `images.newTag` 변환을 처리하지만, `kustomize edit`와 같은 파일 편집 명령은 제공하지 않는다.**

Ingress 파일을 폴더에 복사하는 것만으로 배포 대상이 되지는 않는다. `resources` 목록에 등록해야 최종 매니페스트에 포함된다. [Kustomize 공식 문서](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/)

## 6. Helm: 템플릿과 설정을 묶은 배포 패키지

Helm Chart는 Kubernetes 리소스 템플릿과 기본 설정, 차트 메타데이터를 묶는다. Kustomize가 공통 YAML에 변환을 적용한다면, Helm은 템플릿에 값을 넣어 YAML을 생성한다.

```text
helm/myfirst-api/
├── Chart.yaml
├── values.yaml
├── custom-values.yaml
└── templates/
    ├── _helpers.tpl
    ├── deployment.yaml
    ├── service.yaml
    └── ingress.yaml
```

| 구성 | 역할 |
|---|---|
| `Chart.yaml` | Chart 이름, Chart 버전, 앱 버전 등 메타데이터 |
| `values.yaml` | 템플릿에 전달할 기본값 |
| `custom-values.yaml` | 해당 배포의 설정을 덮어쓸 사용자 파일 |
| `templates/` | 값으로 렌더링할 Kubernetes 매니페스트 |
| `_helpers.tpl` | 리소스 이름과 Label 등에 사용할 공통 템플릿 |

`version`은 Chart의 버전이고 `appVersion`은 앱 버전을 설명하는 메타데이터다. `appVersion`이 항상 컨테이너 이미지 태그로 적용되는 것은 아니다. 실제 이미지 선택은 템플릿이 어떤 값을 참조하는지에 달려 있다.

### Values와 템플릿

```yaml
# custom-values.yaml
replicaCount: 1
fullnameOverride: api-helm

image:
  repository: registry.example.com/team/api
  tag: "1.0-dk12-a1b2c3d"

service:
  port: 8080
```

```yaml
# templates/deployment.yaml 중 일부
containers:
  - name: api
    image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
    ports:
      - containerPort: {{ .Values.service.port }}
```

자주 쓰는 템플릿 구문도 역할이 다르다.

| 구문 | 의미 |
|---|---|
| `{{ .Values.image.tag }}` | 설정값 참조 |
| `{{ if .Values.ingress.enabled }}` | 조건에 따라 구간 생성 |
| `{{ with .Values.service }}` | 블록의 현재 컨텍스트를 service로 변경 |
| `{{ range .Values.ports }}` | 목록 등의 항목을 순회 |
| `{{ include "chart.fullname" . }}` | 이름 있는 템플릿의 결과 사용 |

`with .Values.service` 내부의 `.port`는 service의 port를 뜻한다. 루트 컨텍스트가 필요하면 `$`를 이용할 수 있다.

동일한 키는 일반적으로 Chart 기본값보다 `-f` 파일이 우선하고, 여러 `-f` 파일 중에서는 뒤 파일이 우선한다. `--set`은 해당 파일 값보다 높은 우선순위를 가진다. [Helm Values 문서](https://helm.sh/docs/chart_template_guide/values_files/)

### 렌더링과 릴리스 관리

```bash
# 설정·Chart 검사
helm lint ./helm/myfirst-api -f ./helm/myfirst-api/custom-values.yaml

# 리소스를 생성하지 않고 최종 YAML 확인
helm template api-helm ./helm/myfirst-api \
  --namespace demo \
  -f ./helm/myfirst-api/custom-values.yaml

# Helm CLI로 릴리스 생성 또는 갱신
helm upgrade --install api-helm ./helm/myfirst-api \
  --namespace demo --create-namespace \
  -f ./helm/myfirst-api/custom-values.yaml

helm history api-helm -n demo
helm rollback api-helm 1 -n demo
```

Helm CLI로 관리하는 릴리스에서는 upgrade와 rollback 이력을 확인할 수 있다. Rollback도 과거 리비전으로 이력을 지우는 것이 아니라 새 리비전을 만든다. 기존 설정을 재사용하면서 일부 값만 변경하려면 `helm upgrade --reuse-values`를 사용할 수 있다. [Helm Upgrade 문서](https://helm.sh/docs/helm/helm_upgrade/)

여러 서비스를 묶는 **Umbrella Chart**는 부모 Chart와 하위 Chart의 의존성으로 구성한다. API, 프런트엔드, DB를 함께 배포하더라도 각 서비스의 설정 범위와 공유할 `global` 값을 구분해야 한다.

또한 HTTP 기반 Chart Repository의 `index.yaml`은 Chart 버전과 패키지 위치를 제공한다. Git 저장소에 Chart 디렉터리를 넣어 Argo CD가 읽는 방식이나 OCI Registry 방식과는 저장·검색 구조가 다르다.

## 7. Jenkins: 실행 환경과 자동화 절차의 분리

Jenkins는 Job과 실행 이력을 관리하고, Agent에 작업을 배정해 자동화 절차를 실행한다.

| 용어 | 의미 |
|---|---|
| Job | Jenkins에 등록된 작업 정의 |
| Build | Job을 한 번 실행한 기록 |
| Pipeline | 작업 순서와 조건을 정의한 자동화 절차 |
| Stage | Build, Test, Deploy 같은 논리적 단계 |
| Step | 셸 명령, 체크아웃, 메시지 출력 등의 개별 작업 |
| Controller | Job·설정·실행 상태를 관리하고 작업을 조율 |
| Agent | 실제 작업을 실행하는 환경 |

### JCasC와 Jenkinsfile

```text
jenkins.yaml → Jenkins 시스템을 어떻게 구성할 것인가?
Jenkinsfile  → 특정 앱의 작업을 어떻게 실행할 것인가?
Dockerfile  → Jenkins 또는 앱 이미지를 어떻게 만들 것인가?
```

Jenkins Configuration as Code는 사용자, 보안과 시스템 설정 등을 YAML로 관리한다. Jenkinsfile은 특정 Pipeline의 실행 절차를 정의한다. 두 파일을 구분해야 시스템 설정과 앱 빌드 로직이 섞이지 않는다. [Jenkins Configuration as Code](https://www.jenkins.io/doc/book/managing/casc/)

### Declarative Pipeline의 구조

```groovy
pipeline {
    agent any

    environment {
        APP_NAME = 'api'
        DEPLOY_ENV = 'dev'
    }

    options {
        timeout(time: 10, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '5'))
        disableConcurrentBuilds()
    }

    stages {
        stage('Build') {
            steps {
                sh 'mvn clean package'
            }
        }
        stage('Verify') {
            steps {
                echo "Artifact ready: ${env.APP_NAME}"
            }
        }
    }

    post {
        success { echo 'Pipeline succeeded' }
        failure { echo 'Pipeline failed' }
        always { echo 'Pipeline finished' }
    }
}
```

Pipeline 바로 아래에 선언한 `environment`는 전체 Pipeline에서 사용하고, Stage 안에 선언한 환경변수는 해당 Stage를 대상으로 한다.

`options`는 시간 제한, 기록 보관과 동시 실행 정책을 제어한다. `post`는 Stage 또는 전체 Pipeline의 결과에 따른 후처리를 정의한다. 셸의 파이프를 사용하는 단계에서는 앞 명령의 실패가 뒤 명령의 성공으로 가려지지 않도록 셸과 오류 전파 방식도 확인해야 한다.

### Docker Agent는 이미지 빌드와 다르다

```groovy
agent {
    docker {
        image 'alpine:3.20'
        args '--entrypoint=""'
    }
}
```

이 설정은 Pipeline 작업용 컨테이너를 실행한다. 앱 이미지를 새로 생성한다는 뜻이 아니다. `docker buildx build` 같은 Step을 작성해야 이미지 빌드가 일어난다.

```text
Controller가 작업 시작
        ↓
Docker Agent 컨테이너 생성
        ↓
Workspace를 연결하고 Step 실행
        ↓
작업 종료 후 Agent 컨테이너 정리
```

컨테이너에서 Docker 소켓을 사용하면 호스트 Docker Engine에 명령을 전달할 수 있다. 이는 빌드 편의성과 함께 호스트 제어 권한의 노출 범위도 바꾸므로, Controller와 빌드 Agent의 권한을 분리해서 설계해야 한다. [Jenkins Docker Pipeline 문서](https://www.jenkins.io/doc/book/pipeline/docker/)

## 8. Credential과 Pipeline as Code

Jenkins는 저장된 Credential을 ID로 참조한다. GitHub PAT와 Harbor 계정은 별도 Credential로 관리하며, 작업에 필요한 범위에서만 주입한다.

```groovy
withCredentials([usernamePassword(
    credentialsId: 'registry-credentials',
    usernameVariable: 'REGISTRY_USER',
    passwordVariable: 'REGISTRY_PASSWORD'
)]) {
    sh '''
        set +x
        printf '%s' "$REGISTRY_PASSWORD" | \
          docker login registry.example.com \
            --username "$REGISTRY_USER" --password-stdin
    '''
}
```

Groovy의 작은따옴표 문자열로 셸 스크립트를 전달하면 셸이 환경변수를 확장한다. 비밀번호를 Groovy 문자열 보간으로 명령에 삽입하거나 `set -x`로 출력하지 않도록 한다. Jenkins의 마스킹은 실수로 노출될 가능성을 줄이는 기능이며 임의의 로그·파일 유출까지 막는 보안 경계는 아니다. [Jenkins Credential 문서](https://www.jenkins.io/doc/book/using/using-credentials/)

### 인증과 권한 검증

GitHub 사용자 API가 HTTP 200을 반환하는 것은 계정 인증 확인이다. 특정 Private Repository를 clone하거나 push할 권한까지 증명하지는 않는다.

Harbor 프로젝트 목록 API 조회 역시 조회 권한 확인에 가깝다. 대상 프로젝트에 이미지를 push할 권한과 Kubernetes가 해당 이미지를 pull할 권한은 별도로 확인해야 한다.

### Pipeline script와 Pipeline script from SCM

| 방식 | Jenkinsfile 위치 | 적합한 용도 |
|---|---|---|
| Pipeline script | Jenkins Job 설정에 직접 입력 | 짧은 예제와 초기 검증 |
| Pipeline script from SCM | Git 저장소의 파일 | 변경 이력·리뷰·협업을 포함한 관리 |

SCM 방식에서는 Repository URL, Git Credential, Branch와 Script Path를 지정한다. Script Path는 저장소 루트 기준이다.

```text
Repository: https://github.com/example/myfirst-api-server.git
Branch:     */main
Script Path: Jenkinsfile-CI-docker
```

Jenkinsfile은 실행 정의이므로 소스 브랜치에서 관리할 수 있다. 이후 빌드 결과를 기록하는 `gitops` 브랜치와 혼동하지 않아야 한다. [Jenkinsfile 공식 문서](https://www.jenkins.io/doc/book/pipeline/jenkinsfile/)

### Poll SCM과 Webhook

```groovy
triggers {
    pollSCM('H/5 * * * *')
}
```

Poll SCM은 주기적으로 소스 변경을 확인하고 변경이 있으면 빌드한다. 위 설정은 5분 간격으로 확인하되 시작 시점을 분산한다. `cron`은 변경 여부와 관계없이 일정에 따라 실행하고, Webhook은 Git 서버가 이벤트를 전달한다.

로컬 Jenkins에 Webhook을 보내려면 Git 서버에서 접근할 수 있는 주소가 필요하다. 로컬 브라우저에서 접속되는 `localhost:8888`이 GitHub에서도 접근 가능한 주소는 아니다. [Jenkins Pipeline 문법](https://www.jenkins.io/doc/book/pipeline/syntax/)

## 9. 직접 배포에서 GitOps 기반 CI/CD로

### Jenkins가 직접 배포하는 구조

```text
Git Clone → Maven Package → Image Build & Push
                            ↓
                  Workspace의 이미지 태그 수정
                            ↓
                  kubectl apply → rollout 확인
```

이 구조에서는 Jenkins가 Kubernetes 접근 권한을 보유하고 배포를 실행한다. Workspace의 Kustomize 파일을 수정해도 Git에 commit·push하지 않으면 저장소의 배포 정의는 바뀌지 않는다.

### Jenkins와 Argo CD의 역할 분리

```text
main: 소스·Jenkinsfile
        ↓
Jenkins: 빌드 → 테스트 → 이미지 Push
        ↓
gitops: 새 이미지 참조를 포함한 배포 설정 Commit
        ↓
Argo CD: Git 상태 비교 → Kubernetes 동기화
```

| 구성 요소 | 책임 |
|---|---|
| Jenkins | 소스 검증, Artifact·이미지 생성, 배포 설정 변경 |
| Harbor | 이미지 보관·배포 |
| Git | 배포할 원하는 상태의 버전 관리 |
| Argo CD | Git의 상태를 클러스터에 지속적으로 반영 |
| Kubernetes Controller | Deployment·ReplicaSet 등의 원하는 상태 유지 |

이 구성에서 Jenkins의 CI 성공은 “새 이미지를 실행 중”이라는 뜻이 아니다. 이미지 push와 배포 설정 갱신까지만 완료했을 수 있다. 실제 배포 성공은 Argo CD와 Kubernetes 상태로 확인한다.

### 이미지 태그의 생성과 전파

```groovy
script {
    def shortCommit = sh(
        script: 'git rev-parse --short=7 HEAD',
        returnStdout: true
    ).trim()
    env.FINAL_IMAGE_TAG = "1.0-dk${env.BUILD_NUMBER}-${shortCommit}"
}
```

한 번 계산한 태그를 이미지 빌드와 GitOps 설정 갱신 단계에서 동일하게 사용한다.

```text
빌드 태그
   = Harbor에 Push한 태그
   = gitops 매니페스트의 태그
   = 최종 Deployment 이미지 참조
```

빌드 번호는 Job 단위이므로 서로 다른 Job이 같은 태그 규칙을 사용하면 충돌할 수 있다. Job 구분, 전체 커밋 해시 또는 Digest 등을 포함해 이미지 식별 정책을 설계한다.

### gitops 브랜치 갱신 전략

학습용 예제는 소스 브랜치에서 매니페스트를 바꾸고 결과를 `gitops`에 강제 push한다. 이 방식은 새 Ingress 같은 소스 변경을 함께 전달하지만 `gitops`에서 별도로 작성한 커밋을 덮어쓸 수 있다.

공유 환경에서는 배포 브랜치를 먼저 가져와 필요한 값만 수정하거나, 전용 배포 저장소에 변경을 올리고 Pull Request로 승인하는 구조를 사용할 수 있다. GitOps가 특정 브랜치 이름이나 강제 push를 요구하는 것은 아니다.

## 10. Argo CD의 Application과 상태 동기화

Argo CD는 Git에 선언한 상태와 Kubernetes의 실제 상태를 비교하고 동기화한다. Application은 소스와 배포 대상을 연결하는 사용자 정의 리소스다.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-dev
  namespace: argocd
spec:
  project: team
  source:
    repoURL: https://github.com/example/myfirst-api-server.git
    targetRevision: gitops
    path: kustomize/overlays/dev
  destination:
    server: https://kubernetes.default.svc
    namespace: demo
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

`metadata.namespace: argocd`는 Application 객체가 위치하는 곳이고, `destination.namespace: demo`는 앱 리소스가 배포되는 곳이다. `project`는 Argo CD의 AppProject 이름이며 Namespace 이름과 반드시 같을 필요는 없다.

### CRD, AppProject, ApplicationSet

| 항목 | 역할 |
|---|---|
| CRD | Kubernetes API에 새 리소스 종류와 스키마 등록 |
| Application | 저장소와 대상 클러스터를 연결하는 배포 단위 |
| AppProject | 허용 소스·대상·리소스·권한 범위 제한 |
| ApplicationSet | Generator와 Template으로 여러 Application 생성 |
| Repository Secret | Git·Chart 저장소 접근정보 등록 |
| Cluster Secret | 대상 클러스터 접근정보 등록 |

CRD가 리소스 종류를 정의하는 것과 Controller가 동작을 구현하는 것은 별개다. Application CRD만 존재한다고 Git 동기화가 실행되는 것이 아니라 Argo CD Controller가 해당 객체를 관찰해야 한다.

### Sync와 Health는 다른 축이다

| 상태 | 의미 |
|---|---|
| Synced | 비교 대상 리소스의 원하는 상태와 실제 상태가 일치 |
| OutOfSync | 원하는 상태와 실제 상태 사이에 차이 존재 |
| Healthy | 리소스 종류별 건강 상태 판단을 만족 |
| Progressing | 배포나 준비 작업 진행 중 |
| Degraded | 건강 상태 검사에서 문제 판단 |

`Synced`여도 이미지 다운로드나 앱 시작이 실패하면 건강하지 않을 수 있다. 반대로 기존 버전 앱이 정상이어도 Git의 새 설정이 적용되지 않았다면 `OutOfSync`일 수 있다. Health 역시 앱의 모든 기능과 외부 접속을 보장하지 않으므로 별도 검증이 필요하다.

### selfHeal과 prune

- **selfHeal**: 클러스터에서 관리 대상 리소스가 Git과 달라지면 Git의 상태로 복원한다.
- **prune**: Git에서 제거된 관리 대상 리소스를 동기화 시 클러스터에서도 삭제한다.

Pod만 삭제했을 때는 ReplicaSet이 복구할 수 있다. Deployment 자체를 삭제했는데 Argo CD가 이를 다시 생성한다면 Git 정의와 자동 동기화·Self Heal이 작동한 결과다. 복구 주체를 구분해야 한다.

Git 변경 감지와 배포는 즉시 완료된다고 보장되지 않는다. 서버의 reconciliation 설정, Webhook, 동기화 상태와 앱 기동 시간에 영향을 받는다. [Argo CD 자동 동기화 정책](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)

### Application 삭제와 리소스 삭제

Application을 지우는 동작과 관리 대상 리소스를 지우는 동작은 삭제 옵션과 Finalizer에 따라 달라진다.

```yaml
metadata:
  finalizers:
    - resources-finalizer.argocd.argoproj.io/foreground
```

위와 같은 리소스 정리 Finalizer를 사용하면 Application 삭제 과정에서 관리 리소스도 정리한다. 이는 Git에서 리소스를 제거했을 때의 `prune` 정책과 다른 삭제 경로다. 삭제 전에 공유 리소스 여부와 남겨야 할 데이터를 확인해야 한다.

## 11. Helm Chart를 Argo CD에 연결하기

Git 저장소에 Chart를 두었다면 Application의 `source.path`는 `Chart.yaml`이 있는 디렉터리를 가리킨다.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-helm
  namespace: argocd
spec:
  project: team
  source:
    repoURL: https://github.com/example/myfirst-api-server.git
    targetRevision: main
    path: helm/myfirst-api
    helm:
      valueFiles:
        - custom-values.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: demo
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

위와 같은 단일 Git 소스 구성에서 `valueFiles` 경로는 Chart 디렉터리 기준이다. Chart Repository를 소스로 사용한다면 Git의 `path` 대신 `chart`와 Chart 버전 등을 지정하는 형태로 달라진다.

### Argo CD는 Helm을 렌더러로 사용한다

```text
Git의 Chart + values
        ↓
Helm Template 렌더링
        ↓
Argo CD가 리소스 Apply·동기화·정리
```

Argo CD의 Helm 배포는 Helm CLI의 `helm install`로 릴리스를 생성하는 것과 다르다. Helm은 매니페스트 생성에 사용되고, 앱의 수명주기는 Argo CD가 관리한다. 따라서 Argo CD로 배포한 앱을 반드시 `helm list`에서 찾거나 `helm rollback`으로 되돌릴 수 있다고 생각하면 안 된다. [Argo CD Helm 문서](https://argo-cd.readthedocs.io/en/stable/user-guide/helm/)

이미지 버전을 되돌릴 때도 추적 중인 Git values를 원하는 버전으로 변경하고 동기화하는 구조로 이해하는 편이 일관적이다.

### Kustomize CI와 Helm CD의 연결 여부

Kustomize의 `images.newTag`를 변경하는 CI가 Helm의 `image.tag`까지 자동으로 바꾸지는 않는다.

```text
Kustomize 경로
CI → gitops/kustomize/overlays/dev/kustomization.yaml 갱신
   → Kustomize Application 동기화

Helm 경로
main/helm/myfirst-api/custom-values.yaml 갱신
   → Helm Application 동기화
```

Helm에서도 이미지 갱신을 자동화하려면 CI가 해당 values를 변경하도록 연결하거나 별도의 이미지 업데이트 방식을 구성해야 한다. **각 Application이 어느 브랜치의 어느 파일을 읽는지**가 실제 배포 흐름을 결정한다.

같은 Namespace에 두 방식을 함께 배포할 때는 Deployment·Service 이름과 Ingress Host가 충돌하지 않도록 한다. 하나의 리소스를 여러 Application이 동시에 관리하는 구성도 피해야 한다.

## 12. Ingress, TLS, Probe로 확인하는 서비스 준비 상태

### 외부 요청의 경로

```text
DNS → Load Balancer / Ingress Controller
                      ↓ Host·Path 규칙
                    Service
                      ↓ Selector·Endpoint
                   Ready Pod
                      ↓
                 Application Port
```

Ingress는 규칙이고 실제 HTTP/HTTPS 처리는 Ingress Controller가 담당한다. Service의 selector, 포트와 앱의 실제 수신 포트까지 이어져야 접속이 성공한다.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api
  namespace: demo
spec:
  ingressClassName: nginx
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 8080
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
```

`rules.host`, `tls.hosts`와 인증서의 SAN이 실제 접속 도메인과 일치해야 한다. TLS Secret은 일반적인 Ingress 참조에서 같은 Namespace에 있어야 한다. 외부 HTTPS를 Ingress에서 종료하고 앱에는 HTTP로 전달할 수도 있다.

### Startup, Liveness, Readiness

| Probe | 질문 | 실패 기준 도달 시 동작 |
|---|---|---|
| Startup | 앱의 초기 기동이 완료되었는가? | 컨테이너 재시작 처리 |
| Liveness | 앱에 재시작이 필요한가? | 컨테이너 재시작 처리 |
| Readiness | 현재 요청을 받아도 되는가? | 일반적인 Service 트래픽 대상에서 제외 |

```yaml
startupProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  periodSeconds: 5
  failureThreshold: 60

livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080

readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
```

Startup Probe가 성공하기 전에는 Liveness와 Readiness Probe가 실행되지 않는다. Spring Boot처럼 초기 기동 시간이 필요한 앱에 충분한 시작 구간을 제공할 수 있다. Actuator Endpoint는 앱에서도 활성화되어 있어야 하고, 별도 관리 포트를 사용한다면 Probe 포트도 맞춰야 한다. [Kubernetes Probe 문서](https://kubernetes.io/docs/concepts/workloads/pods/probes/)

외부 의존 서비스의 일시적인 장애를 무조건 Liveness 실패로 연결하면 재시작이 반복될 수 있다. 프로세스 복구가 필요한 상태와 요청을 잠시 받지 않아야 하는 상태를 나누는 것이 중요하다.

## 13. 배포 성공을 검증하는 방법

빌드 성공, Git 반영, 동기화 완료, 앱 준비와 외부 접속은 각각 다른 검증 지점이다.

| 검증 지점 | 확인할 것 |
|---|---|
| Jenkins | 의도한 Stage 실행, 실제 테스트 여부, 실패 로그 |
| Harbor | 이미지 Repository, Tag, Digest와 플랫폼 |
| Git | Argo CD가 읽는 브랜치·경로의 변경 Commit |
| Argo CD | 대상 Revision, Sync와 Health 상태 |
| Kubernetes | Deployment rollout, Pod Ready, 이벤트 |
| 외부 요청 | DNS·TLS·라우팅과 앱 HTTP 응답 |

```bash
# 로컬 렌더링
kustomize build kustomize/overlays/dev
helm lint helm/myfirst-api -f helm/myfirst-api/custom-values.yaml

# Helm YAML 생성 후 서버 측 검증
helm template api-helm helm/myfirst-api \
  -n demo -f helm/myfirst-api/custom-values.yaml > /tmp/api-rendered.yaml

kubectl apply --dry-run=server -n demo -f /tmp/api-rendered.yaml

# 실제 동기화·배포 상태
kubectl get applications -n argocd
kubectl rollout status deployment/api -n demo --timeout=180s
kubectl get pods,svc,ingress -n demo

# 배포 정의가 참조하는 이미지
kubectl get deployment api -n demo \
  -o jsonpath='{.spec.template.spec.containers[*].image}{"\n"}'

# 외부 접속
curl -I https://api.example.com/
curl https://api.example.com/actuator/health/readiness
```

서버 측 dry-run은 API 검증과 Admission 검사를 확인하는 단계다. 이미지 존재 여부, 컨테이너 기동 성공이나 DNS 연결까지 검증하지 않는다. Deployment의 이미지 참조와 별도로 실제 Pod의 `imageID`를 확인하면 실행 중인 Digest를 추적할 수 있다.

### 오류를 발생 단계별로 구분한다

| 증상 | 우선 확인할 것 |
|---|---|
| Registry 접근 시 HTTP 502 | Registry 앞단 프록시·백엔드 서비스·네트워크 경로 |
| HTTP 401 / 403 | 인증정보, 만료 여부, 대상 작업 권한 |
| `manifest unknown` / artifact not found | Repository와 Tag의 실제 존재 여부 |
| `ImagePullBackOff` | 이미지 참조, 노드의 pull 권한, Registry 접근 |
| Git push 실패 | PAT 쓰기 권한, Branch 보호 정책, 원격 변경 |
| Argo CD 렌더링 실패 | 브랜치·경로·Chart.yaml·values·템플릿 오류 |
| `Synced`지만 건강하지 않음 | Pod 이벤트, 앱 로그, Probe, 자원과 설정 |
| Pod Ready지만 외부 접속 실패 | IngressClass, Host·Path, DNS, Service와 TLS |

```bash
kubectl describe pod <pod-name> -n demo
kubectl logs <pod-name> -n demo
kubectl logs <pod-name> -n demo --previous
kubectl describe ingress api -n demo
```

예를 들어 Jenkins 이미지 다운로드 요청이 502로 실패하면 Jenkins 프로세스는 아직 시작되지 않았을 수 있다. 이때 Jenkinsfile이나 앱 포트를 바꾸기보다 먼저 Registry 경로를 확인해야 한다. 오류가 발생한 계층을 기준으로 진단 범위를 좁히는 것이 효과적이다.

## 14. 기술별 책임과 연결 관계

| 기술 | 관리하는 대상 | 다음 단계에 전달하는 것 |
|---|---|---|
| Git | 소스·Pipeline·배포 설정과 변경 이력 | 특정 Revision의 파일 |
| Maven | Java 앱 빌드·테스트 | JAR와 테스트 결과 |
| BuildKit·Buildx·Buildah·Kaniko | Container Image 생성 | Image와 Digest |
| Harbor | Registry의 Artifact·접근 제어 | pull 가능한 이미지 |
| Kustomize | 공통 리소스와 환경별 차이 | 최종 Kubernetes YAML |
| Helm | 템플릿과 values 기반 배포 패키지 | 렌더링된 Kubernetes YAML |
| Jenkins | 자동화 작업의 실행 | 검증 결과·이미지·Git 변경 |
| Argo CD | Git과 클러스터의 동기화 | 적용된 Kubernetes 리소스 |
| Kubernetes | 리소스 조정과 워크로드 실행 | 실행 중인 Pod·Service |
| Ingress·Probe | 요청 연결과 서비스 준비 상태 | 접근 가능한 앱과 상태 정보 |

전달 과정의 각 단계는 앞 단계의 결과를 입력으로 사용한다. 따라서 이미지 생성, 배포 설정 변경, 실제 적용과 앱 준비 상태를 각각 식별하고 검증해야 한다. **빌드 결과와 배포할 상태를 추적 가능한 형태로 연결하고, 그 상태를 지속적으로 유지하는 것**이 이 구성의 중심이다.

---

## 참고 자료

- Docker: [BuildKit](https://docs.docker.com/build/buildkit/), [Multi-platform builds](https://docs.docker.com/build/building/multi-platform/)
- Buildah: [프로젝트와 사용법](https://github.com/podman-container-tools/buildah)
- Kaniko: [원본 저장소와 아카이브 상태](https://github.com/GoogleContainerTools/kaniko)
- Harbor: [Working with Images and Tags](https://goharbor.io/docs/2.14.0/working-with-projects/working-with-images/)
- Kubernetes: [Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/), [Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- Helm: [Values Files](https://helm.sh/docs/chart_template_guide/values_files/), [Helm Upgrade](https://helm.sh/docs/helm/helm_upgrade/)
- Jenkins: [Using a Jenkinsfile](https://www.jenkins.io/doc/book/pipeline/jenkinsfile/), [Pipeline Syntax](https://www.jenkins.io/doc/book/pipeline/syntax/), [Credentials](https://www.jenkins.io/doc/book/using/using-credentials/), [JCasC](https://www.jenkins.io/doc/book/managing/casc/)
- Argo CD: [Automated Sync Policy](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/), [Helm](https://argo-cd.readthedocs.io/en/stable/user-guide/helm/)
