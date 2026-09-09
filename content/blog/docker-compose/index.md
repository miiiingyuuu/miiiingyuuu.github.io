---
title: "Docker에서 Docker Compose까지"
date: "2026-09-09"
category: ["Docker", "DevOps", "Backend"]
description: "컨테이너의 실행 원리부터 이미지, Dockerfile, 볼륨, 네트워크, PID 1, OCI 런타임, Docker Compose까지 하나의 흐름으로 정리한다."
---

# Docker에서 Docker Compose까지: 컨테이너 기술의 구조와 실행 원리

컨테이너를 처음 접하면 `docker run` 명령으로 서버를 실행하는 방법부터 배우게 된다. 하지만 명령어만 외워서는 이미지와 컨테이너가 왜 구분되는지, 컨테이너를 삭제하면 데이터가 왜 사라지는지, 여러 컨테이너를 왜 Docker Compose로 묶는지 이해하기 어렵다.

Docker의 핵심은 단순히 프로그램을 격리해서 실행하는 데 있지 않다. 애플리케이션과 실행에 필요한 파일을 **이미지라는 배포 단위**로 만들고, 같은 이미지를 어느 환경에서든 일관된 방식으로 실행하며, 그 실행 상태를 선언적으로 관리하는 데 있다.

이 글은 컨테이너 교육 자료와 `skala-container`의 샘플 코드를 바탕으로 Docker부터 Docker Compose까지의 기술적 개념을 하나의 흐름으로 정리한다. 특정 실습 환경에서의 경험이나 실행 후기가 아니라, 각 실습이 설명하는 기술과 구조에 초점을 맞춘다.

## 1. 컨테이너가 해결하려는 문제

애플리케이션을 서버에 배포하려면 소스 코드만 옮겨서는 충분하지 않다. 실행에 필요한 런타임, 라이브러리, 시스템 패키지, 설정 파일과 디렉터리 구조도 맞아야 한다.

예를 들어 같은 애플리케이션이라도 다음 차이로 실행 결과가 달라질 수 있다.

- 개발 환경과 운영 환경의 Java 또는 Python 버전이 다르다.
- 필요한 OS 패키지가 한쪽에만 설치되어 있다.
- 라이브러리 버전이나 환경변수가 다르다.
- 애플리케이션이 기대하는 파일 경로와 권한이 다르다.

가상 머신은 이 문제를 해결하기 위해 게스트 운영체제 전체를 격리한다. 격리 수준이 높고 서로 다른 운영체제를 실행할 수 있지만, 운영체제 이미지까지 포함하므로 크기가 크고 시작에 시간이 필요하다.

컨테이너는 접근 방식이 다르다. 호스트의 Linux 커널을 공유하면서 애플리케이션 프로세스가 바라보는 프로세스, 네트워크, 파일 시스템 등의 환경을 분리한다. 따라서 게스트 커널을 매번 부팅하지 않고도 격리된 실행 환경을 빠르게 만들 수 있다.

| 구분 | 가상 머신 | 컨테이너 |
|---|---|---|
| 격리 단위 | 게스트 운영체제 | 프로세스와 실행 환경 |
| 커널 | VM마다 별도 커널 | 호스트 커널 공유 |
| 이미지 내용 | OS와 가상 장치 포함 | 앱과 실행에 필요한 파일 중심 |
| 시작 방식 | 운영체제 부팅 | 프로세스 실행 |
| 일반적인 활용 | 강한 OS 단위 격리 | 애플리케이션 패키징과 빠른 배포 |

컨테이너는 VM의 축소판이 아니다. **격리된 Linux 프로세스와 그 프로세스가 사용할 파일 시스템 및 실행 설정을 하나의 관리 단위로 추상화한 것**에 가깝다.

## 2. 이미지와 컨테이너를 구분해야 하는 이유

Docker를 이해하는 첫 번째 기준은 이미지와 컨테이너를 분리해서 생각하는 것이다.

- **Dockerfile**: 이미지를 어떻게 만들지 선언하는 제작 명세서
- **이미지(Image)**: 애플리케이션 실행에 필요한 파일과 설정을 담은 읽기 전용 템플릿
- **컨테이너(Container)**: 이미지 위에 쓰기 가능한 계층을 추가하고 실제 프로세스를 실행한 상태
- **레지스트리(Registry)**: 이미지를 저장하고 배포하는 저장소

관계는 다음과 같다.

```text
소스 코드 + Dockerfile
          │
          │ docker build
          ▼
      Docker 이미지
          │
          │ docker run
          ▼
   실행 중인 컨테이너
```

하나의 이미지로 여러 컨테이너를 만들 수 있다. 각 컨테이너는 같은 읽기 전용 이미지 레이어를 공유하지만, 실행 중 발생하는 변경 사항은 각자의 쓰기 가능 계층에 기록한다.

이 구분은 운영 방식에도 영향을 준다. 이미 실행 중인 컨테이너 안에 들어가서 프로그램을 계속 수정하는 방식보다, Dockerfile과 소스 코드를 수정하여 새 이미지를 만든 다음 컨테이너를 교체하는 방식이 재현성과 추적 가능성이 높다.

## 3. Docker의 기본 실행 흐름

Docker의 기본 라이프사이클은 이미지를 가져오고, 컨테이너를 만들고, 상태를 확인한 후, 필요하면 정지하고 삭제하는 과정이다.

### 이미지 가져오기와 확인

```bash
docker pull ubuntu:24.04
docker images
```

이미지 이름은 일반적으로 다음 구조를 가진다.

```text
registry/project/image:tag
```

`ubuntu:24.04`처럼 레지스트리와 프로젝트가 생략된 공식 이미지는 Docker의 기본 레지스트리에서 조회된다. 태그를 생략하면 보통 `latest`가 사용되지만, `latest`는 특정 버전을 의미하지 않는다. 재현 가능한 빌드와 배포를 위해서는 명시적인 버전 태그를 사용하는 편이 적절하다.

### 컨테이너 생성과 실행

```bash
docker run -it --name hello ubuntu:24.04 /bin/bash
```

이 명령은 다음 작업을 한 번에 수행한다.

1. 로컬에 이미지가 없으면 레지스트리에서 가져온다.
2. 이미지로부터 `hello`라는 컨테이너를 생성한다.
3. 컨테이너의 메인 프로세스로 `/bin/bash`를 실행한다.
4. 현재 터미널의 입력과 출력을 컨테이너에 연결한다.

주요 옵션은 다음과 같다.

| 옵션 | 의미 |
|---|---|
| `-i` | 표준 입력을 열린 상태로 유지 |
| `-t` | 가상 터미널 할당 |
| `-d` | 백그라운드 실행 |
| `--name` | 컨테이너 이름 지정 |
| `-e` | 환경변수 주입 |
| `-p` | 호스트 포트와 컨테이너 포트 연결 |
| `-v` | 볼륨 또는 호스트 경로 마운트 |
| `--network` | 연결할 Docker 네트워크 지정 |
| `--rm` | 프로세스 종료 후 컨테이너 자동 삭제 |

### 실행 상태 관리

```bash
docker ps
docker ps -a
docker start hello
docker restart hello
docker stop hello
docker rm hello
```

- `docker ps`는 실행 중인 컨테이너만 보여준다.
- `docker ps -a`는 종료된 컨테이너까지 보여준다.
- `stop`은 프로세스를 정지하지만 컨테이너 메타데이터와 쓰기 계층은 남긴다.
- `rm`은 정지된 컨테이너를 제거한다.

이미 실행 중인 컨테이너에서 추가 명령을 실행할 때는 `docker exec`를 사용한다.

```bash
docker exec hello echo "Hello, container"
docker exec -it hello /bin/bash
```

`docker run`은 **새 컨테이너를 생성해 실행**하고, `docker exec`는 **실행 중인 컨테이너에 새 프로세스를 추가**한다는 차이가 있다.

상세 실행 설정을 확인할 때는 `docker inspect`가 유용하다.

```bash
docker inspect hello
```

이미지 정보, 환경변수, 실행 명령, 네트워크, 마운트, 재시작 정책과 상태 등이 JSON 형태로 출력된다.

## 4. `docker run`은 컨테이너의 실행 계약을 만든다

MariaDB 실습은 `docker run`이 단순 실행 명령이 아니라 컨테이너의 실행 조건을 정의하는 명령이라는 점을 잘 보여준다.

```bash
docker network create --driver bridge skala

docker run -d \
  --name mariadb \
  --network skala \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=skala \
  -e MYSQL_USER=user \
  -e MYSQL_PASSWORD=password \
  -p 3306:3306 \
  mariadb:latest
```

여기에는 컨테이너 실행에 필요한 네 가지 종류의 설정이 포함된다.

1. **식별자**: `--name mariadb`
2. **애플리케이션 설정**: `-e`로 전달하는 환경변수
3. **통신 경로**: `--network skala`, `-p 3306:3306`
4. **실행할 소프트웨어**: `mariadb:latest` 이미지와 이미지의 기본 실행 명령

포트 매핑은 왼쪽이 호스트, 오른쪽이 컨테이너다.

```text
-p <host-port>:<container-port>

localhost:3306 ──► mariadb 컨테이너의 3306 포트
```

컨테이너 내부 프로세스가 3306 포트에서 대기하더라도 `-p`로 게시하지 않으면 호스트의 `localhost:3306`을 통해 접근할 수 없다.

환경변수는 이미지를 다시 만들지 않고 실행 시점의 설정을 바꾸는 수단이다. 그러나 비밀번호 같은 민감한 값을 명령이나 Compose 파일에 직접 기록하면 셸 기록이나 설정 파일에 남을 수 있다. 실제 환경에서는 별도 환경 파일이나 비밀 관리 체계를 함께 고려해야 한다.

## 5. Dockerfile은 실행 환경을 코드로 만든다

Dockerfile은 컨테이너 안에서 수동으로 수행하던 설치와 설정을 선언적으로 기록한다. 이를 통해 같은 파일에서 반복해서 같은 구조의 이미지를 만들 수 있다.

Python 웹 서버를 예로 들면 다음과 같은 형태가 된다.

```dockerfile
ARG UBUNTU_VERSION=22.04
FROM ubuntu:${UBUNTU_VERSION}

RUN apt-get update \
    && apt-get install -y python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY webserver.py .

EXPOSE 8080
CMD ["python3", "webserver.py"]
```

### 주요 Dockerfile 지시어

| 지시어 | 역할 | 적용 시점 |
|---|---|---|
| `FROM` | 기반 이미지 선택 | 빌드 |
| `ARG` | 빌드 시 사용할 변수 정의 | 빌드 |
| `RUN` | 패키지 설치 등 명령 실행 | 빌드 |
| `WORKDIR` | 이후 명령의 기준 디렉터리 설정 | 빌드 및 실행 설정 |
| `COPY` | 빌드 컨텍스트의 파일을 이미지에 복사 | 빌드 |
| `ENV` | 이미지와 컨테이너에서 사용할 환경변수 설정 | 빌드 및 실행 |
| `USER` | 이후 명령과 프로세스의 사용자 지정 | 빌드 및 실행 |
| `EXPOSE` | 애플리케이션이 사용할 포트 문서화 | 이미지 설정 |
| `CMD` | 기본 실행 명령 또는 기본 인자 지정 | 실행 |
| `ENTRYPOINT` | 컨테이너의 고정 실행 프로그램 지정 | 실행 |

이미지는 다음 명령으로 빌드한다.

```bash
docker build -t python-webserver:1.0 .
```

마지막의 `.`은 현재 디렉터리를 빌드 컨텍스트로 전달한다는 뜻이다. `COPY`의 원본 경로는 이 빌드 컨텍스트를 기준으로 해석되며, 컨텍스트 밖의 파일은 직접 복사할 수 없다.

### `EXPOSE`와 `-p`는 역할이 다르다

```dockerfile
EXPOSE 8080
```

`EXPOSE`는 이미지가 어떤 포트를 사용할 예정인지 나타내는 메타데이터다. 호스트 포트를 실제로 열지는 않는다. 외부에서 접근하려면 실행 시점에 포트를 게시해야 한다.

```bash
docker run -d --name python-webserver \
  -p 8080:8080 \
  python-webserver:1.0
```

### `COPY`와 `ADD`

두 지시어 모두 파일을 이미지에 넣을 수 있지만, 역할이 단순한 경우에는 `COPY`가 의도를 명확하게 표현한다. `ADD`는 로컬 압축 파일의 자동 해제나 URL 처리와 같은 추가 동작을 제공하므로, 그 기능이 실제로 필요한 경우에 선택하는 편이 이해하기 쉽다.

## 6. 이미지 레이어와 빌드 캐시

Docker 이미지는 하나의 거대한 파일이 아니라 여러 읽기 전용 레이어와 설정 메타데이터로 구성된다. Dockerfile의 파일 시스템 변경 명령은 이전 결과 위에 새 레이어를 쌓는다.

```dockerfile
FROM ubuntu:22.04
RUN apt-get update
RUN apt-get install -y nginx
COPY index.html /var/www/html/index.html
```

레이어 구조는 다음 이점을 제공한다.

- 여러 이미지가 같은 기반 레이어를 재사용할 수 있다.
- 변경되지 않은 단계는 빌드 캐시를 사용할 수 있다.
- 레지스트리에서 이미 존재하는 레이어는 다시 전송하지 않을 수 있다.

다만 레이어를 줄이는 것만이 최적화의 전부는 아니다. 자주 바뀌지 않는 의존성 정의를 먼저 복사하고, 자주 바뀌는 소스를 나중에 복사하면 캐시를 더 효과적으로 사용할 수 있다.

Vue 샘플의 흐름이 대표적이다.

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`package.json`과 잠금 파일이 바뀌지 않았다면 소스 코드가 변경되어도 의존성 설치 레이어를 재사용할 가능성이 높다.

## 7. 멀티스테이지 빌드: 만드는 환경과 실행 환경 분리

애플리케이션을 만드는 데 필요한 도구와 실행하는 데 필요한 도구는 다를 수 있다.

- Vue를 빌드할 때는 Node.js와 npm이 필요하지만, 완성된 정적 파일은 Nginx만 있으면 제공할 수 있다.
- Spring Boot를 빌드할 때는 JDK와 Maven이 필요하지만, JAR 실행에는 JRE만 있으면 된다.

멀티스테이지 빌드는 이 둘을 분리한다.

```dockerfile
FROM ubuntu:24.04 AS builder

RUN apt-get update \
    && apt-get install -y openjdk-21-jdk maven \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pom.xml .
RUN mvn dependency:go-offline -q

COPY src ./src
RUN mvn package -DskipTests -q

FROM eclipse-temurin:21-jre
WORKDIR /app

COPY --from=builder /build/target/*.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```

첫 번째 스테이지에는 컴파일러, Maven과 소스가 포함된다. 두 번째 스테이지에는 첫 번째 스테이지가 만든 JAR와 실행용 JRE만 들어간다. 최종 이미지에서 빌드 도구와 소스를 제외할 수 있어 이미지 크기와 불필요한 구성 요소를 줄이는 데 도움이 된다.

## 8. 컨테이너의 생명주기와 PID 1

컨테이너는 가상 머신처럼 내부 운영체제가 계속 살아 있는 구조가 아니다. 컨테이너의 상태는 **메인 프로세스의 상태**와 연결된다.

- 메인 프로세스가 실행 중이면 컨테이너도 실행 중이다.
- 메인 프로세스가 종료되면 컨테이너도 종료된다.
- 컨테이너 내부의 메인 프로세스는 해당 PID 네임스페이스에서 PID 1이 된다.

따라서 웹 서버가 백그라운드 데몬으로 전환되고 최초 프로세스가 종료되면 컨테이너도 함께 종료될 수 있다. Nginx 예제에서 다음과 같이 포어그라운드 실행을 지정하는 이유다.

```dockerfile
CMD ["nginx", "-g", "daemon off;"]
```

### Exec form과 Shell form

Dockerfile의 실행 명령에는 중요한 차이가 있다.

```dockerfile
# Exec form: 애플리케이션을 직접 실행
CMD ["python3", "webserver.py"]

# Shell form에 해당하는 구조: 셸이 부모 프로세스가 됨
CMD ["/bin/sh", "-c", "python3 webserver.py"]

# 셸 처리가 필요하면 exec로 애플리케이션과 교체
CMD ["/bin/sh", "-c", "exec python3 webserver.py"]
```

`docker stop`은 먼저 컨테이너의 메인 프로세스에 종료 신호를 보내고 일정 시간 동안 정상 종료를 기다린다. 애플리케이션이 PID 1로 직접 실행되면 종료 신호를 받아 요청 처리 완료, 연결 해제, 자원 정리 같은 graceful shutdown을 수행할 수 있다.

중간의 셸이 PID 1이 되고 신호를 애플리케이션에 적절히 전달하지 않으면 정상 종료 로직이 실행되지 않을 수 있다. 그래서 특별한 셸 기능이 필요하지 않다면 exec form이 적합하며, 셸이 필요하다면 마지막에 `exec`로 애플리케이션 프로세스를 치환하는 방식을 고려한다.

### `CMD`와 `ENTRYPOINT`

다음 이미지를 생각해 보자.

```dockerfile
ENTRYPOINT ["ping"]
CMD ["-c", "3", "localhost"]
```

```bash
docker run --rm check-ping
# ping -c 3 localhost

docker run --rm check-ping google.com
# ping google.com
```

- `ENTRYPOINT`는 컨테이너가 수행할 주 프로그램을 고정한다.
- `CMD`는 기본 명령 또는 기본 인자를 제공하며, `docker run` 뒤에 전달한 값으로 대체될 수 있다.

## 9. 파일 시스템: 이미지 계층과 영속 데이터

실행 중인 컨테이너는 이미지의 읽기 전용 레이어 위에 컨테이너별 쓰기 가능 레이어를 가진다.

```text
컨테이너가 바라보는 파일 시스템
                 │
                 ▼
┌──────────────────────────────┐
│ upperdir: 컨테이너 변경(RW) │
├──────────────────────────────┤
│ 이미지 레이어 N(RO)         │
│ 이미지 레이어 N-1(RO)       │
│ ...                          │
│ 기반 이미지 레이어(RO)      │
└──────────────────────────────┘
```

OverlayFS는 이 레이어들을 하나의 파일 시스템처럼 합쳐 보여준다. 컨테이너에서 기존 파일을 수정하면 원본 이미지 레이어를 직접 변경하지 않고, 수정된 내용을 컨테이너의 쓰기 계층에 기록하는 copy-on-write 방식이 사용된다.

이 구조 덕분에 여러 컨테이너가 이미지 레이어를 공유할 수 있지만, 컨테이너의 쓰기 계층은 컨테이너와 생명주기를 함께한다. 컨테이너를 삭제해도 유지해야 하는 데이터는 외부 저장소에 분리해야 한다.

### 볼륨의 종류

| 종류 | 관리 주체 | 일반적인 용도 |
|---|---|---|
| Named Volume | Docker | 데이터베이스 등 지속 데이터 |
| Bind Mount | 사용자와 호스트 파일 시스템 | 로컬 소스·설정 파일 공유 |
| Anonymous Volume | Docker | 이름 없는 임시 데이터 공간 |

Named Volume은 이름으로 관리한다.

```bash
docker volume create mariadb-data

docker run -d \
  --name mariadb \
  -e MYSQL_ROOT_PASSWORD=password \
  -v mariadb-data:/var/lib/mysql \
  mariadb:latest
```

Bind Mount는 호스트 경로를 직접 연결한다.

```bash
mkdir -p db-data

docker run -d \
  --name mariadb \
  -e MYSQL_ROOT_PASSWORD=password \
  -v "$(pwd)/db-data:/var/lib/mysql" \
  mariadb:latest
```

왼쪽은 호스트 또는 볼륨, 오른쪽은 컨테이너 경로다.

```text
-v <host-or-volume>:<container-path>
```

설정 파일처럼 컨테이너가 수정할 필요가 없는 파일은 읽기 전용으로 연결할 수 있다.

```bash
-v "$(pwd)/nginx.conf:/etc/nginx/conf.d/default.conf:ro"
```

## 10. Docker 네트워크와 서비스 이름

컨테이너는 기본적으로 별도의 네트워크 네임스페이스를 가진다. Docker의 사용자 정의 bridge 네트워크를 사용하면 컨테이너마다 가상 네트워크 인터페이스와 IP가 할당되고, 같은 네트워크에 연결된 컨테이너끼리 통신할 수 있다.

```bash
docker network create --driver bridge skala

docker run -d \
  --name spring-backend \
  --network skala \
  spring-backend:1.0

docker run -d \
  --name frontend \
  --network skala \
  -p 8080:80 \
  frontend:1.0
```

같은 사용자 정의 네트워크에서는 컨테이너 이름을 DNS 이름처럼 사용할 수 있다. Nginx가 다음과 같이 백엔드를 호출할 수 있는 이유다.

```nginx
location /api {
    proxy_pass http://spring-backend:8080;
}
```

컨테이너 IP는 삭제와 재생성 과정에서 달라질 수 있다. 따라서 애플리케이션 설정에 IP를 고정하는 대신 안정적인 컨테이너 이름이나 Compose 서비스 이름을 사용하는 것이 적절하다.

### 내부 통신과 외부 노출은 다르다

- `EXPOSE 8080`: 이미지가 사용하는 포트에 대한 설명
- 같은 Docker 네트워크의 `spring-backend:8080`: 컨테이너 간 통신
- `-p 9090:8080`: 호스트의 9090 포트를 컨테이너의 8080 포트에 게시

백엔드나 데이터베이스가 오직 다른 컨테이너에서만 호출된다면 반드시 호스트에 포트를 게시할 필요는 없다. 필요한 진입점만 외부에 노출하면 통신 경로와 공격 표면을 줄일 수 있다.

## 11. 권한: 컨테이너 내부의 root도 주의해야 한다

별도 지정이 없으면 컨테이너 프로세스는 흔히 컨테이너 내부의 root 사용자로 실행된다. 이미지나 런타임 설정에 따라 권한이 제한되더라도, 최소 권한 원칙에 따라 애플리케이션에 필요한 권한만 부여하는 것이 바람직하다.

```dockerfile
FROM alpine:latest
WORKDIR /app

RUN addgroup -S appgroup \
    && adduser -S appuser -G appgroup

COPY --chown=appuser:appgroup . .
USER appuser

CMD ["node", "server.js"]
```

사용자만 바꾸면 항상 정상 실행되는 것은 아니다. Nginx처럼 1024 미만 포트를 사용하거나 특정 런타임 디렉터리에 파일을 써야 하는 프로그램은 포트와 파일 소유권도 함께 조정해야 한다. 교육 샘플의 일반 사용자 Nginx 구성은 포트를 8080으로 변경하고 `/var/lib/nginx`, `/var/log/nginx`, `/run` 등의 소유권을 맞추는 과정을 보여준다.

## 12. 컨테이너 내부에서는 무엇이 일어나는가

Docker CLI는 컨테이너 실행을 간단한 명령으로 추상화하지만, 실제 격리는 Linux 커널 기능과 컨테이너 런타임의 협력으로 구현된다.

### Namespace: 프로세스가 바라보는 환경 분리

Namespace는 프로세스마다 서로 다른 시스템 뷰를 제공한다.

| Namespace | 분리 대상 |
|---|---|
| PID | 프로세스 ID와 프로세스 트리 |
| Network | 인터페이스, IP, 포트, 라우팅 테이블 |
| Mount | 파일 시스템 마운트 지점 |
| UTS | 호스트 이름과 도메인 이름 |
| IPC | 공유 메모리, 메시지 큐, 세마포어 |
| User | UID와 GID 공간 |

컨테이너 안에서 PID 1부터 보이고 별도의 네트워크 인터페이스가 보이는 것은 실제로 별도 커널이 있기 때문이 아니라, 프로세스가 지정된 namespace의 정보만 바라보기 때문이다.

### cgroup: 자원 사용 제한과 관찰

cgroup은 프로세스 그룹에 CPU, 메모리, 블록 I/O, 프로세스 수 등의 제한을 적용하고 사용량을 관찰한다.

메모리 제한을 초과하여 커널의 OOM Killer가 메인 프로세스를 종료하면 컨테이너는 일반적으로 비정상 종료 상태가 된다. 즉, namespace가 “무엇을 볼 수 있는가”를 분리한다면 cgroup은 “얼마나 사용할 수 있는가”를 통제한다.

### OverlayFS: 이미지 레이어 결합

OverlayFS는 여러 읽기 전용 이미지 레이어와 컨테이너별 쓰기 레이어를 하나의 `rootfs`처럼 보이게 한다. 컨테이너 프로세스는 이 병합된 디렉터리를 자신의 `/`로 사용한다.

### Netfilter: 포트 포워딩과 NAT

Docker가 `-p 8080:80`과 같은 포트 게시를 구성할 때는 Linux 네트워크 기능을 이용해 호스트로 들어온 트래픽을 컨테이너 네트워크로 전달한다. 브리지 네트워크, 가상 이더넷 인터페이스, 라우팅과 NAT가 함께 동작한다.

## 13. Docker Engine에서 runc까지

컨테이너 하나가 실행될 때의 계층을 단순화하면 다음과 같다.

```text
docker CLI
    │
    ▼
dockerd(Docker Engine)
    │ 이미지·네트워크·볼륨·수명주기 관리
    ▼
containerd
    │ 이미지 레이어 준비, rootfs와 OCI 설정 구성
    ▼
containerd-shim
    │ 컨테이너 프로세스 감시, 입출력 연결
    ▼
runc
    │ namespace·cgroup·rootfs를 설정하고 프로세스 실행
    ▼
애플리케이션 프로세스(PID 1)
```

OCI(Open Container Initiative)는 도구 사이의 호환성을 위한 표준을 정의한다.

- **OCI Image Specification**: 이미지의 레이어와 manifest 구성
- **OCI Runtime Specification**: `config.json`과 `rootfs`로 이루어진 실행 번들
- **OCI Distribution Specification**: 레지스트리에서 이미지 manifest와 blob을 주고받는 API

Docker가 만든 이미지를 다른 OCI 호환 런타임이 해석할 수 있는 것은 이미지 형식과 실행 규격이 표준화되어 있기 때문이다. `runc` 실습에서 `rootfs`와 `config.json`을 직접 준비해 컨테이너를 실행하는 과정은 `docker run` 뒤에 숨은 저수준 동작을 드러낸다.

## 14. 샘플 애플리케이션이 보여주는 컨테이너화 패턴

`skala-container`의 애플리케이션 샘플은 서로 다른 종류의 프로그램을 어떤 이미지로 만드는지 보여준다.

### Spring Boot 백엔드

```text
JAR 파일 + JRE 이미지
        └─ java -jar app.jar
```

이미 빌드된 JAR를 JRE 이미지에 복사하는 방식과, Maven 빌드부터 이미지 안에서 수행하는 멀티스테이지 방식이 제시된다. 애플리케이션 프로필과 JVM 옵션은 `ENV` 또는 실행 시점의 `-e`로 전달할 수 있다.

### FastAPI 백엔드

```text
Python 기반 이미지
├─ FastAPI/Uvicorn 등 의존성 설치
├─ 애플리케이션 소스 복사
└─ Python 프로세스를 메인 프로세스로 실행
```

컨테이너 외부에서 접근하려면 서버가 `127.0.0.1`이 아닌 `0.0.0.0`에서 요청을 수신해야 한다. 컨테이너의 loopback 주소는 해당 컨테이너 내부만 의미하기 때문이다.

### 정적 프런트엔드

정적 HTML, CSS, JavaScript는 Nginx 이미지에 파일을 복사하여 제공한다. `/api` 요청은 Nginx reverse proxy를 통해 같은 네트워크의 백엔드 서비스로 전달한다.

```text
브라우저 ──► Nginx 프런트엔드 ──► 백엔드 API
```

브라우저에서는 하나의 출처로 요청하고 Nginx가 내부에서 프록시하므로, 프런트엔드와 백엔드의 통신 경로를 외부에 각각 노출하지 않아도 된다.

### Vue 프런트엔드

Vue는 Node.js 스테이지에서 정적 결과물을 만들고, 최종 이미지는 Nginx만 포함하는 멀티스테이지 구조를 사용한다. 개발 도구와 운영 서버의 역할이 분리되는 대표적인 사례다.

### 데이터베이스

MariaDB나 PostgreSQL은 공식 이미지를 그대로 사용하고 환경변수, 네트워크와 볼륨을 실행 시점에 연결한다. 애플리케이션 이미지를 새로 만드는 문제와 데이터 저장 위치를 설계하는 문제를 분리할 수 있다.

## 15. Docker Compose가 필요한 이유

단일 컨테이너는 `docker run`으로 관리할 수 있지만, 애플리케이션이 프런트엔드, 백엔드, 데이터베이스로 나뉘면 명령이 빠르게 길어진다.

각 컨테이너에 대해 다음 내용을 매번 맞춰야 한다.

- 사용할 이미지 또는 Dockerfile
- 포트 매핑
- 환경변수
- 볼륨
- 네트워크
- 서비스 간 의존 관계
- 헬스체크와 재시작 정책

Docker Compose는 이 실행 구성을 YAML 파일에 선언하고 하나의 프로젝트로 관리한다. Compose에서 각 컨테이너 역할은 `services` 아래의 서비스로 정의된다.

```yaml
services:
  db:
    image: postgres:15

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.backend

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
```

`image`는 기존 이미지를 사용한다는 뜻이고, `build`는 지정된 컨텍스트와 Dockerfile로 이미지를 만든다는 뜻이다.

## 16. 단일 네트워크 구성에서 역할별 네트워크 구성으로

Compose는 별도 설정이 없어도 프로젝트용 기본 bridge 네트워크를 생성한다. 모든 서비스가 서로 통신해야 하는 단순한 구조에서는 기본 네트워크로 충분할 수 있다.

서비스의 역할이 명확해지면 통신 경로도 나눌 수 있다.

```text
외부 사용자
    │
    ▼
frontend ── public network ── backend
                                  │
                             private network
                                  │
                                  db
```

- 프런트엔드는 public 네트워크에 연결한다.
- 백엔드는 public과 private 네트워크에 모두 연결한다.
- DB는 private 네트워크에만 연결한다.
- 외부에서 직접 접근할 필요가 없는 DB에는 `ports`를 선언하지 않는다.

Compose에서는 다음처럼 선언할 수 있다.

```yaml
networks:
  public:
    driver: bridge
  private:
    driver: bridge
    internal: true
```

`internal: true`인 네트워크는 외부 연결이 제한된 내부 전용 네트워크로 구성된다. 백엔드는 두 네트워크에 모두 연결되어 프런트엔드와 DB 사이의 경계 역할을 한다.

## 17. 헬스체크와 의존성은 서로 다른 문제다

프로세스가 실행 중이라고 해서 서비스가 요청을 처리할 준비까지 끝났다는 뜻은 아니다. DB 프로세스가 시작된 직후에는 초기화가 진행 중일 수 있고, 백엔드도 포트를 열기 전에 설정과 데이터베이스 연결을 준비할 수 있다.

헬스체크는 컨테이너 안의 서비스 상태를 주기적으로 검사한다.

```yaml
healthcheck:
  test: ["CMD", "pg_isready", "-U", "postgres"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
```

`depends_on`과 `condition: service_healthy`를 함께 사용하면 선행 서비스가 healthy 상태가 된 후 다음 서비스를 시작하게 구성할 수 있다.

```yaml
depends_on:
  db:
    condition: service_healthy
```

여기서 구분해야 할 점이 있다.

- `depends_on`은 서비스의 시작 의존성을 표현한다.
- `healthcheck`는 현재 상태를 `healthy` 또는 `unhealthy`로 표시한다.
- 헬스체크 실패 자체가 애플리케이션 복구를 보장하지는 않는다.
- `restart` 정책은 컨테이너 프로세스가 종료될 때의 재시작 동작을 정의한다.

따라서 애플리케이션도 일시적인 DB 연결 실패에 대비한 재시도와 오류 처리를 갖추는 것이 필요하다.

## 18. 전체 Compose 예제 읽기

교육 샘플의 최종 구조를 개념 중심으로 정리하면 다음과 같다.

```yaml
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
    volumes:
      - ./db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: always
    networks:
      - private

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.backend
    ports:
      - "9090:8080"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s
    restart: unless-stopped
    networks:
      - public
      - private

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.frontend
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - public

networks:
  public:
    driver: bridge
  private:
    driver: bridge
    internal: true
```

이 파일에는 지금까지의 개념이 모두 연결되어 있다.

| Compose 설정 | 나타내는 개념 |
|---|---|
| `image` | 기존 이미지 사용 |
| `build` | Dockerfile로 이미지 빌드 |
| `environment` | 실행 시점 설정 주입 |
| `ports` | 호스트와 컨테이너 포트 연결 |
| `volumes` | 데이터와 설정을 컨테이너 외부에 분리 |
| `networks` | 서비스별 통신 경로 정의 |
| `healthcheck` | 프로세스가 아닌 서비스 준비 상태 확인 |
| `depends_on` | 서비스 시작 의존성 표현 |
| `restart` | 프로세스 종료 이후의 재시작 정책 |

## 19. Docker Compose의 주요 명령

### 빌드와 실행

```bash
docker compose up --build -d
```

- 필요한 이미지를 빌드한다.
- 서비스별 컨테이너와 네트워크를 만든다.
- 선언된 볼륨과 환경변수를 연결한다.
- 컨테이너를 백그라운드에서 실행한다.

### 상태와 로그 확인

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend
```

개별 컨테이너 이름을 외우지 않고 Compose 서비스 단위로 상태와 로그를 확인할 수 있다.

### 컨테이너 내부 명령 실행

```bash
docker compose exec backend sh
docker compose exec backend ping db
```

같은 네트워크에서 `db`라는 서비스 이름이 해석되는지 확인할 수 있다.

### 중지와 제거

```bash
docker compose stop
docker compose start
docker compose restart backend
docker compose down
```

`docker compose down`은 Compose가 만든 컨테이너와 네트워크를 제거한다. 선언된 데이터를 함께 제거하려고 `-v`를 붙이면 볼륨까지 삭제될 수 있으므로 데이터가 필요한 환경에서는 주의해야 한다.

```bash
docker compose down -v
```

## 20. Docker와 Docker Compose의 역할 차이

Docker Compose가 Docker를 대체하는 것은 아니다. 두 도구는 서로 다른 범위의 문제를 다룬다.

| Docker | Docker Compose |
|---|---|
| 이미지 한 개를 빌드 | 여러 서비스의 빌드 정의를 모음 |
| 컨테이너 한 개의 실행 조건 지정 | 애플리케이션 전체의 실행 조건 선언 |
| 개별 네트워크와 볼륨 조작 | 서비스에 네트워크와 볼륨 연결 |
| 개별 컨테이너 수명주기 관리 | Compose 프로젝트 단위 관리 |

Dockerfile과 Compose 파일의 역할도 다르다.

```text
Dockerfile
└─ 이미지 안에 무엇을 넣고 기본적으로 어떻게 실행할 것인가

docker-compose.yaml
└─ 그 이미지를 어떤 설정·네트워크·볼륨과 함께 몇 개의 서비스로 실행할 것인가
```

Dockerfile의 `CMD`는 이미지의 기본값이며, Compose의 `command`로 실행 시점에 덮어쓸 수 있다. 이미지 자체의 책임과 배포 환경의 책임을 구분할 때 이 차이가 중요하다.

## 21. 전체 흐름 정리

Docker부터 Docker Compose까지의 내용을 한 흐름으로 연결하면 다음과 같다.

```text
1. 애플리케이션과 실행 의존성을 Dockerfile에 선언한다.
                         │
                         ▼
2. docker build로 재사용 가능한 이미지를 만든다.
                         │
                         ▼
3. 이미지를 레지스트리에 저장하거나 다른 환경으로 전달한다.
                         │
                         ▼
4. docker run으로 환경변수·포트·볼륨·네트워크를 연결한다.
                         │
                         ▼
5. 컨테이너의 PID 1 프로세스가 애플리케이션을 실행한다.
                         │
                         ▼
6. 데이터는 볼륨에, 서비스 간 통신은 bridge 네트워크에 분리한다.
                         │
                         ▼
7. 여러 서비스의 실행 계약을 docker-compose.yaml에 통합한다.
                         │
                         ▼
8. docker compose up/down으로 애플리케이션 전체를 관리한다.
```

컨테이너 기술을 이해한다는 것은 명령어의 옵션을 많이 외우는 것보다 다음 질문에 답할 수 있다는 의미에 가깝다.

- 이미지에 포함할 것과 실행 시 주입할 설정을 구분할 수 있는가?
- 컨테이너가 종료되는 조건과 PID 1의 역할을 설명할 수 있는가?
- 삭제되어도 유지해야 하는 데이터를 볼륨으로 분리했는가?
- 외부 공개가 필요한 포트와 내부 통신만 필요한 포트를 구분했는가?
- 서비스 이름을 기준으로 컨테이너 간 통신을 구성했는가?
- 빌드 도구를 최종 이미지에서 제거할 수 있는가?
- 여러 서비스의 시작 조건과 상태 확인을 Compose에 표현했는가?

이 기준이 잡히면 `docker run`은 단순한 실행 명령이 아니라 컨테이너의 실행 계약으로, Dockerfile은 이미지 제작 코드로, Docker Compose는 다중 컨테이너 애플리케이션의 실행 명세로 읽히기 시작한다.

## 정리 기준 자료

- `docs/Cloud_컨테이너 이해 및 애플리케이션 컨테이너화_이용우_v2.1.pdf`
- `docs/1. 기초개념이해_이용우_v1.0.pdf`
- `docs/2.Linux 이해_이용우_v1.0.pdf`
- `skala-container/00.sample-container`
- `skala-container/01.answer-code`

