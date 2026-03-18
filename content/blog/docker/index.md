---
title: "Docker"
date: "2026-01-11"
category: ["DevOps", "Docker", "Backend"]
description: "Docker의 개념, VM과의 차이, 이미지/컨테이너/볼륨 등 핵심 구성요소, Dockerfile 작성법, 주요 명령어, Docker Compose까지 실무 중심으로 정리"
---

"내 컴퓨터에서는 잘 되는데요."

개발할 때 한 번쯤은 겪어봤을 상황입니다. 개발 환경, 테스트 환경, 운영 환경이 서로 달라서 생기는 문제인데, Docker는 이 문제를 **컨테이너**라는 개념으로 해결합니다. 애플리케이션과 그 실행에 필요한 모든 것을 하나의 패키지로 묶어서, 어디서든 동일하게 실행되도록 보장합니다.

---

## 1. Docker란?

**Docker**는 애플리케이션을 **컨테이너(Container)** 단위로 패키징하고 실행하는 오픈소스 플랫폼입니다. 2013년 출시 이후 현재 DevOps와 클라우드 환경의 표준 기술로 자리잡았습니다.

### 왜 Docker를 사용하는가?

```
Before Docker                    After Docker

개발자 A: Python 3.9, ubuntu    ┌────────────────────┐
개발자 B: Python 3.11, macOS    │   Docker Container  │
서버:     Python 3.8, CentOS    │  Python 3.11 + App  │
                                 │  (always the same)  │
→ "내 컴퓨터에서는 됩니다…"     └────────────────────┘

                                 → Works everywhere
```

Docker가 해결하는 문제들:

- **환경 불일치** — 개발/스테이징/운영 환경을 동일하게 유지
- **의존성 충돌** — 각 서비스가 독립된 환경을 가짐
- **배포 복잡성** — 이미지 하나로 어디서든 동일하게 실행
- **리소스 효율** — VM보다 가볍고 빠르게 실행

---

## 2. VM vs Container

![VM vs Container](./vm_vs_container.jpg)

### 가상머신 (VM)

가상머신은 하이퍼바이저 위에 독립적인 Guest OS를 올려 격리합니다. 완전한 OS를 포함하기 때문에 이미지가 크고 부팅이 느리지만 격리 수준이 매우 높습니다.

```
Infrastructure
└── Host OS
    └── Hypervisor
        ├── VM 1: Guest OS + App A  (수 GB)
        ├── VM 2: Guest OS + App B  (수 GB)
        └── VM 3: Guest OS + App C  (수 GB)
```

### 컨테이너 (Container)

컨테이너는 Host OS의 커널을 공유하며 프로세스 수준에서 격리합니다. Guest OS가 없어 이미지가 작고 시작이 매우 빠릅니다.

```
Infrastructure
└── Host OS (커널 공유)
    └── Docker Engine
        ├── Container 1: Bins/Libs + App A  (수 MB)
        ├── Container 2: Bins/Libs + App B  (수 MB)
        └── Container 3: Bins/Libs + App C  (수 MB)
```

| 비교 항목 | VM | Container |
|-----------|-----|-----------|
| OS | Guest OS 포함 | Host OS 커널 공유 |
| 이미지 크기 | GB 단위 | MB 단위 |
| 시작 시간 | 수십 초 | 1초 이내 |
| 리소스 사용 | 높음 | 낮음 |
| 격리 수준 | 강함 (하드웨어 수준) | 보통 (프로세스 수준) |
| 이식성 | 낮음 | 매우 높음 |

---

## 3. Docker 핵심 구성요소

![Docker Components](./docker_components.jpg)

### Dockerfile

이미지를 만들기 위한 **설계도(레시피)** 입니다. 텍스트 파일에 명령어를 순서대로 작성합니다.

### Image

Dockerfile로 빌드한 **읽기 전용 템플릿**입니다. 레이어 구조로 이루어져 있으며 불변(Immutable)합니다.

### Container

이미지를 실행한 **인스턴스**입니다. 이미지 위에 쓰기 가능한 레이어가 추가됩니다. 중지하거나 삭제할 수 있으며, 기본적으로 종료 시 내부 데이터는 사라집니다.

### Registry

이미지를 저장하고 공유하는 **저장소**입니다. Docker Hub가 공개 레지스트리이며, AWS ECR, GCP GCR 등 프라이빗 레지스트리도 있습니다.

### Volume

컨테이너가 종료되어도 데이터를 유지하는 **영속적 저장소**입니다.

```
Dockerfile  →  (build)  →  Image  →  (run)  →  Container
                              ↕                      ↕
                           Registry               Volume
```

---

## 4. Docker 이미지 레이어 구조

![Image Layers](./image_layers.jpg)

Docker 이미지는 **여러 레이어가 쌓인 구조**입니다. Dockerfile의 각 명령어가 하나의 레이어가 됩니다.

```
┌─────────────────────────────────┐  ← Writable Layer (Container 실행 시)
├─────────────────────────────────┤  ← COPY app/ /app
├─────────────────────────────────┤  ← RUN pip install -r requirements.txt
├─────────────────────────────────┤  ← RUN apt-get install -y curl
└─────────────────────────────────┘  ← FROM python:3.11-slim  (Base Image)
```

### 레이어 캐싱 (Layer Caching)

변경된 레이어 이후의 레이어만 재빌드되기 때문에, **자주 변경되는 내용은 아래쪽에 배치**할수록 빌드가 빠릅니다.

```dockerfile
# ❌ 비효율적 — 코드 변경마다 pip install 재실행
COPY . /app
RUN pip install -r requirements.txt

# ✅ 효율적 — requirements.txt 변경 시에만 pip install 재실행
COPY requirements.txt /app/
RUN pip install -r /app/requirements.txt
COPY . /app
```

---

## 5. Dockerfile 작성

### 주요 명령어

| 명령어 | 설명 |
|--------|------|
| `FROM` | 베이스 이미지 지정 (첫 번째 명령어) |
| `WORKDIR` | 작업 디렉토리 설정 |
| `COPY` | 호스트 파일을 이미지로 복사 |
| `ADD` | COPY + URL/압축파일 지원 |
| `RUN` | 빌드 시 실행할 명령어 |
| `ENV` | 환경 변수 설정 |
| `EXPOSE` | 컨테이너가 사용할 포트 명시 |
| `CMD` | 컨테이너 시작 시 기본 실행 명령어 |
| `ENTRYPOINT` | 컨테이너 시작 시 실행될 명령어 (변경 불가) |
| `ARG` | 빌드 시점 변수 |

### Python 웹 앱 Dockerfile 예시

```dockerfile
# 1. 베이스 이미지 선택 (slim = 최소화된 버전)
FROM python:3.11-slim

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 의존성 파일 먼저 복사 (캐싱 최적화)
COPY requirements.txt .

# 4. 의존성 설치
RUN pip install --no-cache-dir -r requirements.txt

# 5. 나머지 소스 코드 복사
COPY . .

# 6. 환경 변수 설정
ENV PYTHONUNBUFFERED=1 \
    PORT=8000

# 7. 포트 명시 (문서화 목적)
EXPOSE 8000

# 8. 실행 명령어
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Node.js 앱 Dockerfile 예시

```dockerfile
FROM node:20-alpine

WORKDIR /app

# package.json 먼저 복사 → npm install 캐싱
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

### .dockerignore 작성

`.gitignore`처럼 이미지에 포함하지 않을 파일을 지정합니다.

```
node_modules/
.env
.git
*.log
__pycache__/
*.pyc
.DS_Store
```

---

## 6. 주요 Docker 명령어

![Command Cheatsheet](./cheatsheet.jpg)

### 이미지 관련

```bash
# 이미지 빌드 (현재 디렉토리의 Dockerfile 사용)
docker build -t my-app:1.0 .

# 빌드 캐시 없이 새로 빌드
docker build --no-cache -t my-app:1.0 .

# 로컬 이미지 목록 확인
docker images

# 이미지 다운로드
docker pull nginx:latest

# 이미지 삭제
docker rmi my-app:1.0

# 사용하지 않는 이미지 일괄 삭제
docker image prune -a
```

### 컨테이너 실행

```bash
# 기본 실행 (포그라운드)
docker run my-app:1.0

# 백그라운드 실행 (-d: detached)
docker run -d my-app:1.0

# 포트 매핑 (-p 호스트포트:컨테이너포트)
docker run -d -p 8080:8000 my-app:1.0

# 이름 지정 + 환경변수 + 볼륨 마운트
docker run -d \
  --name my-container \
  -p 8080:8000 \
  -e DATABASE_URL=postgres://... \
  -v $(pwd)/data:/app/data \
  my-app:1.0

# 종료 시 자동 삭제 (--rm)
docker run --rm my-app:1.0

# 인터랙티브 셸 실행 (-it)
docker run -it my-app:1.0 /bin/bash
```

### 컨테이너 관리

```bash
# 실행 중인 컨테이너 목록
docker ps

# 모든 컨테이너 목록 (중지 포함)
docker ps -a

# 컨테이너 중지 (Graceful)
docker stop my-container

# 컨테이너 강제 종료
docker kill my-container

# 컨테이너 삭제
docker rm my-container

# 중지된 컨테이너 일괄 삭제
docker container prune

# 실행 중인 컨테이너에 명령어 실행
docker exec -it my-container bash

# 컨테이너 로그 확인
docker logs my-container

# 로그 실시간 팔로우
docker logs -f my-container

# 컨테이너 상세 정보
docker inspect my-container

# 리소스 사용량 모니터링
docker stats
```

### 볼륨 & 네트워크

```bash
# Named Volume 생성 및 사용
docker volume create my-data
docker run -v my-data:/app/data my-app:1.0

# 볼륨 목록 및 삭제
docker volume ls
docker volume rm my-data

# 커스텀 네트워크 생성
docker network create my-net

# 네트워크에 연결하여 실행
docker run --network my-net my-app:1.0
```

---

## 7. Docker Compose

![Docker Compose](./docker_compose.jpg)

여러 컨테이너를 함께 실행해야 할 때 사용합니다. `docker-compose.yml` 파일 하나로 전체 서비스를 정의하고 관리합니다.

### docker-compose.yml 구조

```yaml
version: '3.8'

services:
  # 웹 애플리케이션
  web:
    build: .                      # 현재 디렉토리의 Dockerfile로 빌드
    ports:
      - "8080:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/mydb
      - REDIS_URL=redis://redis:6379
    depends_on:                   # db, redis가 먼저 시작됨
      - db
      - redis
    volumes:
      - ./app:/app                # 개발 시 코드 실시간 반영
    restart: unless-stopped

  # PostgreSQL 데이터베이스
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - db_data:/var/lib/postgresql/data   # 데이터 영속성
    ports:
      - "5432:5432"

  # Redis 캐시
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

# Named Volume 정의
volumes:
  db_data:
```

### Docker Compose 명령어

```bash
# 모든 서비스 시작 (백그라운드)
docker compose up -d

# 이미지 다시 빌드 후 시작
docker compose up -d --build

# 모든 서비스 중지 (컨테이너/네트워크 삭제)
docker compose down

# 볼륨까지 삭제 (데이터 초기화)
docker compose down -v

# 서비스 로그 확인
docker compose logs -f web

# 특정 서비스만 재시작
docker compose restart web

# 실행 중인 서비스 목록
docker compose ps

# 특정 서비스 컨테이너에서 명령 실행
docker compose exec web bash
```

---

## 8. 실무 팁

### 멀티 스테이지 빌드 (Multi-stage Build)

빌드 환경과 실행 환경을 분리해 최종 이미지 크기를 줄입니다.

```dockerfile
# Stage 1: 빌드
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # dist/ 생성

# Stage 2: 실행 (빌드 결과물만 복사)
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

빌드 도구, 테스트 코드, 소스맵 등이 최종 이미지에서 제외되어 이미지 크기가 크게 줄어듭니다.

### 환경변수 관리 (.env 파일)

```bash
# .env 파일
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
SECRET_KEY=my-secret-key
DEBUG=false
```

```yaml
# docker-compose.yml에서 .env 자동 로드
services:
  web:
    env_file:
      - .env
```

### 헬스체크 (Healthcheck)

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1
```

---

## 9. 자주 하는 실수

**1. 컨테이너 내 데이터 저장**

```bash
# ❌ 컨테이너 재시작 시 데이터 사라짐
docker run my-app  # 컨테이너 내부에만 저장

# ✅ Volume을 사용해 데이터 영속성 확보
docker run -v my-data:/app/data my-app
```

**2. latest 태그에만 의존**

```bash
# ❌ 버전 추적 불가
docker pull my-app:latest

# ✅ 명시적 버전 태그 사용
docker pull my-app:1.2.3
```

**3. root 권한으로 실행**

```dockerfile
# ❌ 보안 위험
FROM python:3.11
...

# ✅ 전용 유저 생성
FROM python:3.11
RUN useradd -m appuser
USER appuser
```

**4. 민감 정보를 이미지에 포함**

```dockerfile
# ❌ 이미지에 비밀번호가 기록됨
ENV DB_PASSWORD=mysecret

# ✅ 실행 시 환경변수로 주입
docker run -e DB_PASSWORD=$DB_PASSWORD my-app
```

---

## 참고 자료

- [Docker 공식 문서](https://docs.docker.com/)
- [Docker Hub](https://hub.docker.com/)
- [Play with Docker (브라우저에서 Docker 실습)](https://labs.play-with-docker.com/)
- [Docker Compose 공식 문서](https://docs.docker.com/compose/)
- Claude AI