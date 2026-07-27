---
title: "AWS 핵심 서비스 정리"
date: "2026-06-16"
category: ["Cloud", "DevOps"]
description: "금융권 백엔드·인프라 이해를 위한 AWS 핵심 서비스 정리. EC2 인스턴스 구성, S3 스토리지 전략, RDS 관리형 DB, Lambda 서버리스 아키텍처, 그리고 Docker 컨테이너 배포(ECR + ECS/EC2) 흐름까지 개념과 실전 명령어를 함께 정리"
---

# AWS 핵심 서비스 정리 — EC2 · S3 · RDS · Lambda · Docker 배포

---

## 0. 들어가기 전에: AWS 글로벌 인프라 개념

AWS를 이해하려면 먼저 인프라 단위를 알아야 한다.

```
Region (지역)
  └── Availability Zone / AZ (가용 영역) × 2~6개
        └── Data Center (물리 서버 센터)
```

| 용어       | 설명                                             | 예시                                            |
| ---------- | ------------------------------------------------ | ----------------------------------------------- |
| **Region** | 독립적인 지리적 위치                             | ap-northeast-2 (서울)                           |
| **AZ**     | Region 내 격리된 데이터센터 그룹                 | ap-northeast-2a, 2b, 2c                         |
| **VPC**    | Virtual Private Cloud, 논리적 네트워크 격리 공간 | 내 AWS 계정의 전용 네트워크                     |
| **Subnet** | VPC 내 IP 대역 분할                              | Public (인터넷 접근 가능) / Private (내부 전용) |

> 금융권에서는 고가용성(HA)을 위해 **Multi-AZ 구성**이 필수다. 하나의 AZ가 장애가 나도 다른 AZ에서 서비스를 유지하는 구조다.

---

## 1. EC2 (Elastic Compute Cloud)

### 1-1. 개념

**EC2**는 AWS의 가상 서버(VM) 서비스다. 원하는 CPU, 메모리, OS를 선택해 몇 분 만에 서버를 생성하고, 사용한 만큼만 비용을 낸다.

```
EC2 핵심 구성 요소
├── AMI (Amazon Machine Image) — OS + 초기 설정 스냅샷
├── Instance Type — 하드웨어 사양 (CPU, 메모리)
├── Key Pair — SSH 접속용 공개키/개인키 쌍
├── Security Group — 인스턴스 단위 방화벽 (인바운드/아웃바운드 규칙)
├── EBS (Elastic Block Store) — 연결되는 블록 스토리지 (하드디스크)
└── Elastic IP — 고정 퍼블릭 IP 주소
```

### 1-2. 인스턴스 타입 선택 가이드

| 패밀리                | 용도                          | 예시 타입            |
| --------------------- | ----------------------------- | -------------------- |
| **t** (범용 버스터블) | 개발·테스트, 소규모 웹서버    | t3.micro, t3.medium  |
| **m** (범용 균형)     | 일반적인 웹 애플리케이션 서버 | m5.large, m6i.xlarge |
| **c** (컴퓨팅 최적화) | 고성능 연산, 배치 처리        | c5.2xlarge           |
| **r** (메모리 최적화) | 대용량 캐시, 인메모리 DB      | r5.4xlarge           |
| **p / g** (GPU)       | 머신러닝, AI 추론             | p3.2xlarge           |

> 금융권 시스템에서는 주로 **m 시리즈**(애플리케이션 서버)와 **r 시리즈**(캐시 서버)가 사용된다.

### 1-3. 구매 옵션

| 옵션              | 설명                            | 비용 절감     |
| ----------------- | ------------------------------- | ------------- |
| **On-Demand**     | 사용한 만큼 과금 (기본)         | 기준          |
| **Reserved**      | 1~3년 약정 선결제               | 최대 72% 절감 |
| **Spot**          | 남는 용량 경매 방식 (중단 가능) | 최대 90% 절감 |
| **Savings Plans** | 유연한 사용량 약정              | 최대 66% 절감 |

### 1-4. 주요 CLI 명령어

```bash
# 인스턴스 목록 조회
aws ec2 describe-instances --region ap-northeast-2

# SSH 접속
ssh -i "my-key.pem" ec2-user@<퍼블릭-IP>

# 인스턴스 시작 / 중지
aws ec2 start-instances --instance-ids i-1234567890abcdef0
aws ec2 stop-instances --instance-ids i-1234567890abcdef0
```

### 1-5. Auto Scaling + Load Balancer 조합

MTS 같은 금융 앱에서 장중 트래픽 급증을 처리하는 핵심 패턴이다.

```
[인터넷]
    │
[Application Load Balancer (ALB)]
    │         │         │
[EC2-1]   [EC2-2]   [EC2-3]  ← Auto Scaling Group이 자동으로 인스턴스 추가/제거
```

```bash
# Auto Scaling 정책 생성 예시 (CPU 70% 이상이면 인스턴스 추가)
aws autoscaling put-scaling-policy \
  --policy-name cpu-scale-out \
  --auto-scaling-group-name my-asg \
  --scaling-adjustment 1 \
  --adjustment-type ChangeInCapacity
```

---

## 2. S3 (Simple Storage Service)

### 2-1. 개념

**S3**는 AWS의 객체 스토리지 서비스다. 파일을 **버킷(Bucket)** 에 **객체(Object)** 형태로 저장하며, 이론상 무제한 용량을 제공한다.

```
S3 구조
└── Bucket (버킷) ← 전 세계 고유한 이름
      └── Object (객체)
            ├── Key (경로 + 파일명): "images/2026/profile.jpg"
            ├── Value (실제 데이터)
            └── Metadata (Content-Type, 크기 등)
```

### 2-2. 스토리지 클래스 (비용 vs 접근 빈도)

| 클래스                  | 용도                          | 특징                            |
| ----------------------- | ----------------------------- | ------------------------------- |
| **Standard**            | 자주 접근하는 파일            | 기본, 가장 빠름                 |
| **Standard-IA**         | 가끔 접근 (Infrequent Access) | Standard보다 저렴, 조회 시 요금 |
| **Glacier Instant**     | 아카이브 (즉시 조회 가능)     | 매우 저렴                       |
| **Glacier Flexible**    | 아카이브 (조회에 수 분~시간)  | 장기 보관용                     |
| **Intelligent-Tiering** | 접근 패턴 불규칙              | AWS가 자동으로 클래스 이동      |

> 금융권에서는 거래 로그·감사 데이터를 **Glacier**에 장기 보관하는 패턴이 일반적이다. 금융 규제상 거래 데이터는 5~10년 보존 의무가 있다.

### 2-3. 주요 기능

**정적 웹사이트 호스팅**

```bash
# S3 버킷을 정적 웹사이트로 설정
aws s3 website s3://my-bucket \
  --index-document index.html \
  --error-document error.html
```

**버전 관리 (Versioning)**

```bash
# 버전 관리 활성화 → 파일 덮어쓰기/삭제 시 이전 버전 복원 가능
aws s3api put-bucket-versioning \
  --bucket my-bucket \
  --versioning-configuration Status=Enabled
```

**수명 주기 정책 (Lifecycle)**

```json
{
  "Rules": [
    {
      "Status": "Enabled",
      "Transitions": [
        { "Days": 30, "StorageClass": "STANDARD_IA" },
        { "Days": 90, "StorageClass": "GLACIER" }
      ],
      "Expiration": { "Days": 3650 }
    }
  ]
}
```

**주요 CLI 명령어**

```bash
# 파일 업로드
aws s3 cp ./file.txt s3://my-bucket/folder/file.txt

# 폴더 전체 동기화
aws s3 sync ./dist s3://my-bucket --delete

# 파일 목록 조회
aws s3 ls s3://my-bucket/folder/

# Presigned URL 생성 (임시 접근 링크, 1시간)
aws s3 presign s3://my-bucket/file.txt --expires-in 3600
```

### 2-4. S3 + CloudFront 조합 (CDN)

프론트엔드 정적 파일 배포의 표준 패턴이다.

```
[사용자]
    │
[CloudFront Edge (전 세계 엣지 서버)]
    │  캐시 미스 시에만
[S3 버킷 (Origin)]
```

---

## 3. RDS (Relational Database Service)

### 3-1. 개념

**RDS**는 AWS의 관리형 관계형 데이터베이스 서비스다. DB 설치, 패치, 백업, 복제를 AWS가 대신 처리해준다.

지원 엔진: **MySQL, PostgreSQL, MariaDB, Oracle, SQL Server, Aurora**

### 3-2. EC2에 직접 DB 설치 vs RDS 비교

| 항목                | EC2 직접 설치   | RDS                 |
| ------------------- | --------------- | ------------------- |
| OS 패치             | 직접            | AWS 자동            |
| DB 패치             | 직접            | AWS 자동            |
| 백업                | 직접 구성       | 자동 (1~35일 보존)  |
| 복제 (Read Replica) | 직접 구성       | 클릭 한 번          |
| Multi-AZ 장애 조치  | 직접 구성       | 클릭 한 번          |
| 비용                | 상대적으로 저렴 | 상대적으로 비쌈     |
| 제어권              | 높음            | 낮음 (OS 접근 불가) |

> 금융권에서는 **운영 편의성과 안정성**을 위해 RDS를 선택하는 경우가 많다. 특히 **Multi-AZ + 자동 백업**은 금융 시스템 SLA 준수에 필수적이다.

### 3-3. Multi-AZ 구성 (고가용성)

```
[애플리케이션 서버]
        │
   [Primary RDS]  ──── 동기 복제 ────▶  [Standby RDS]
    (AZ-a, 읽기/쓰기)                    (AZ-b, 대기 중)
        │
    장애 발생 시 자동 Failover (약 1~2분)
        │
   [Standby → Primary 자동 승격]
```

### 3-4. Read Replica (읽기 전용 복제본)

읽기 트래픽을 분산해 Primary DB의 부하를 줄이는 패턴.

```
[쓰기 요청] → Primary RDS
[읽기 요청] → Read Replica 1
             → Read Replica 2  (최대 5개)
```

### 3-5. 주요 CLI 명령어

```bash
# RDS 인스턴스 생성
aws rds create-db-instance \
  --db-instance-identifier my-db \
  --db-instance-class db.t3.medium \
  --engine mysql \
  --master-username admin \
  --master-user-password MyPassword123! \
  --allocated-storage 20 \
  --multi-az

# 스냅샷 생성 (수동 백업)
aws rds create-db-snapshot \
  --db-instance-identifier my-db \
  --db-snapshot-identifier my-db-snapshot-20260615

# Read Replica 생성
aws rds create-db-instance-read-replica \
  --db-instance-identifier my-db-replica \
  --source-db-instance-identifier my-db
```

### 3-6. Aurora (AWS 자체 엔진)

MySQL/PostgreSQL 호환이면서 성능은 최대 5배(MySQL 대비) 향상된 AWS 전용 엔진.

```
Aurora 클러스터 구조
├── Writer 인스턴스 (1개) ← 쓰기/읽기
└── Reader 인스턴스 (최대 15개) ← 읽기 전용
      └── 공유 스토리지 (자동 6곳 복제, 자동 확장)
```

---

## 4. Lambda

### 4-1. 개념

**Lambda**는 서버를 프로비저닝하지 않고 코드를 실행하는 **서버리스(Serverless)** 컴퓨팅 서비스다.
이벤트 발생 시에만 코드가 실행되고, 실행 시간(ms) 단위로 과금된다.

```
[이벤트 소스]         [Lambda]          [대상]
API Gateway  ──▶  함수 실행 (최대 15분)  ──▶  DB / S3 / SNS
S3 업로드
DynamoDB 스트림
EventBridge (스케줄러)
SQS 메시지
```

### 4-2. EC2 vs Lambda 비교

| 항목           | EC2                    | Lambda                     |
| -------------- | ---------------------- | -------------------------- |
| 서버 관리      | 직접                   | 불필요                     |
| 실행 시간 제한 | 없음                   | 최대 15분                  |
| 과금 방식      | 서버 가동 시간         | 실행 시간 × 요청 수        |
| 확장성         | Auto Scaling 설정      | 자동 (동시 1만 건+)        |
| 적합한 작업    | 장시간 실행, 상태 유지 | 단발성 이벤트, 간헐적 실행 |

### 4-3. Lambda 함수 작성 예시

**Node.js 예시: S3 파일 업로드 시 메타데이터 추출**

```javascript
// handler.js
exports.handler = async event => {
  // S3 이벤트에서 버킷명과 파일 키 추출
  const bucket = event.Records[0].s3.bucket.name
  const key = decodeURIComponent(
    event.Records[0].s3.object.key.replace(/\+/g, " "),
  )

  console.log(`파일 업로드 감지: s3://${bucket}/${key}`)

  // 비즈니스 로직 처리
  const result = await processFile(bucket, key)

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "처리 완료", result }),
  }
}
```

**API Gateway + Lambda: REST API 패턴**

```javascript
// API Gateway가 트리거하는 Lambda
exports.handler = async event => {
  const { httpMethod, path, body, queryStringParameters } = event

  if (httpMethod === "GET" && path === "/stocks") {
    const { code } = queryStringParameters
    const stockData = await getStockPrice(code)

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stockData),
    }
  }

  return { statusCode: 404, body: "Not Found" }
}
```

### 4-4. Lambda 배포 방법

```bash
# 1. 코드 압축
zip -r function.zip . -x "*.git*"

# 2. Lambda 함수 생성
aws lambda create-function \
  --function-name my-function \
  --runtime nodejs20.x \
  --role arn:aws:iam::123456789:role/lambda-role \
  --handler handler.handler \
  --zip-file fileb://function.zip

# 3. 함수 업데이트
aws lambda update-function-code \
  --function-name my-function \
  --zip-file fileb://function.zip

# 4. 함수 직접 호출 (테스트)
aws lambda invoke \
  --function-name my-function \
  --payload '{"key": "value"}' \
  response.json
```

### 4-5. Lambda 활용 패턴 (금융권 예시)

| 패턴                 | 설명                                                   |
| -------------------- | ------------------------------------------------------ |
| **배치 리포트 생성** | EventBridge로 매일 오전 6시 일별 거래 리포트 자동 생성 |
| **실시간 알림**      | 주가 변동 감지 → Lambda → SNS/푸시 알림                |
| **파일 처리**        | 거래 내역 CSV 업로드 → S3 이벤트 → Lambda → DB 적재    |
| **API 백엔드**       | API Gateway + Lambda로 빠른 서버리스 API 구축          |

---

## 5. Docker 배포 on AWS

### 5-1. Docker 기본 개념

**Docker**는 애플리케이션과 그 실행 환경(라이브러리, 설정)을 **컨테이너**라는 단위로 패키징하는 기술이다.

```
[개발 환경]  ──▶  Docker Image 빌드  ──▶  [운영 환경]
"내 PC에서는 됐는데..." 문제를 근본적으로 해결
```

```
Docker 핵심 개념
├── Image — 실행 가능한 패키지 (읽기 전용 템플릿)
├── Container — Image를 실행한 인스턴스 (프로세스)
├── Dockerfile — Image 빌드 설명서
├── Registry — Image 저장소 (Docker Hub, AWS ECR)
└── Docker Compose — 다중 컨테이너 정의 파일
```

### 5-2. Dockerfile 작성 예시

**Node.js 앱 Dockerfile**

```dockerfile
# 1. 베이스 이미지 선택
FROM node:20-alpine

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 의존성 파일 먼저 복사 (레이어 캐시 활용)
COPY package*.json ./
RUN npm ci --only=production

# 4. 소스 코드 복사
COPY . .

# 5. 포트 노출
EXPOSE 3000

# 6. 실행 명령어
CMD ["node", "server.js"]
```

**자주 쓰는 Docker 명령어**

```bash
# 이미지 빌드
docker build -t my-app:latest .

# 컨테이너 실행
docker run -d -p 3000:3000 --name my-container my-app:latest

# 실행 중인 컨테이너 확인
docker ps

# 컨테이너 로그 확인
docker logs -f my-container

# 컨테이너 접속
docker exec -it my-container sh

# 컨테이너 중지 및 삭제
docker stop my-container && docker rm my-container
```

### 5-3. AWS ECR (Elastic Container Registry)

AWS의 Docker 이미지 저장소 서비스. Docker Hub의 AWS 버전.

```bash
# 1. ECR 로그인
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS \
  --password-stdin <계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com

# 2. 리포지토리 생성
aws ecr create-repository \
  --repository-name my-app \
  --region ap-northeast-2

# 3. 이미지 태깅
docker tag my-app:latest \
  <계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest

# 4. ECR에 Push
docker push \
  <계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest
```

### 5-4. AWS에서 Docker 컨테이너 실행 옵션 비교

| 서비스                 | 설명                                 | 적합한 경우        |
| ---------------------- | ------------------------------------ | ------------------ |
| **ECS (EC2 모드)**     | EC2 위에서 컨테이너 오케스트레이션   | 인프라 제어권 필요 |
| **ECS (Fargate 모드)** | 서버리스 컨테이너 (서버 관리 불필요) | 관리 부담 최소화   |
| **EKS**                | 관리형 Kubernetes                    | 대규모, 복잡한 MSA |
| **EC2 직접 배포**      | EC2에 Docker 설치 후 직접 실행       | 소규모, 단순 구조  |

### 5-5. ECS Fargate 배포 흐름

```
[Dockerfile]
     │ docker build
[Docker Image]
     │ docker push
[ECR 리포지토리]
     │
[ECS Task Definition] ← 컨테이너 설정 (이미지, CPU/메모리, 환경변수, 포트)
     │
[ECS Service] ← 실행할 Task 수, Auto Scaling 정책
     │
[Fargate 컨테이너] × N개
     │
[ALB (Application Load Balancer)]
     │
[인터넷]
```

**Task Definition 핵심 설정 예시 (JSON)**

```json
{
  "family": "my-app-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "my-app",
      "image": "<계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest",
      "portMappings": [{ "containerPort": 3000 }],
      "environment": [{ "name": "NODE_ENV", "value": "production" }],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-app",
          "awslogs-region": "ap-northeast-2",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 5-6. EC2에 직접 Docker 배포 (간단한 방법)

```bash
# EC2 접속 후 Docker 설치 (Amazon Linux 2)
sudo yum update -y
sudo yum install -y docker
sudo service docker start
sudo usermod -a -G docker ec2-user

# ECR에서 이미지 Pull & 실행
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS \
  --password-stdin <계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com

docker pull <계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest

docker run -d \
  -p 80:3000 \
  --name my-app \
  --restart always \
  <계정ID>.dkr.ecr.ap-northeast-2.amazonaws.com/my-app:latest
```

---

## 6. 서비스 간 관계 정리

실제 프로젝트에서는 위 서비스들이 조합되어 사용된다.

```
[클라이언트 (MTS 앱)]
        │
[CloudFront] ── 정적 파일 ──▶ [S3 버킷]
        │
[ALB (로드 밸런서)]
        │              │
[EC2 / ECS Fargate]   [Lambda]
   (API 서버)          (이벤트 처리)
        │                  │
[RDS (Primary)]        [S3 (파일 저장)]
        │
[RDS Read Replica]
```

---

## 7. 비용 최적화 핵심 원칙

| 원칙                    | 방법                                                |
| ----------------------- | --------------------------------------------------- |
| **적정 사이징**         | 실제 사용량보다 과도하게 큰 인스턴스 타입 선택 금지 |
| **Reserved 활용**       | 24시간 가동하는 서버는 1년 약정으로 최대 72% 절감   |
| **S3 수명 주기**        | 오래된 데이터는 자동으로 Glacier로 이동             |
| **Lambda 우선 검토**    | 간헐적 실행 작업은 EC2 대신 Lambda                  |
| **Fargate Spot**        | 중단 가능한 배치 작업에 Spot 컨테이너 활용          |
| **CloudWatch 모니터링** | 미사용 리소스 식별 및 정리                          |

---

## 8. 금융권 취업과의 연결고리

| AWS 서비스             | 금융 시스템 적용 사례                              |
| ---------------------- | -------------------------------------------------- |
| **EC2 + Auto Scaling** | 주식 장중 트래픽 급증 대응, MTS 채널 서버          |
| **S3 + Glacier**       | 거래 로그·감사 데이터 장기 보관 (금융 규제 준수)   |
| **RDS Multi-AZ**       | 계좌·거래 데이터 고가용성 보장 (SLA 99.9%+)        |
| **Lambda**             | 실시간 이상 거래 감지, 배치 리포트 생성, 알림 발송 |
| **Docker + ECS**       | 마이크로서비스 기반 증권 플랫폼 배포 자동화        |

---

## 📎 참고 자료

- [AWS 공식 문서](https://docs.aws.amazon.com/)
- [AWS 프리 티어](https://aws.amazon.com/ko/free/) — EC2 t2.micro, S3 5GB, Lambda 100만 건/월 무료
- [AWS Well-Architected Framework](https://aws.amazon.com/ko/architecture/well-architected/) — 안정성·보안·비용 최적화 설계 원칙
- [AWS 기술 블로그 (한국)](https://aws.amazon.com/ko/blogs/tech/) — 국내 금융사 클라우드 전환 사례 다수 수록
