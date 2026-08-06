---
title: "Java 백엔드 핵심 기술 정리"
date: "2026-08-06"
category: ["Java", "Backend"]
description: "Spring Boot 기반 인증 게시판 실습을 통해 학습한 백엔드 핵심 기술 정리. JDBC와 PreparedStatement, Spring IoC/DI, Security Filter Chain과 JWT 인증 흐름, JPA 영속성 컨텍스트와 변경 감지, Spring Data JPA, DTO 분리 이유, Docker와 Docker Compose 배포, 모놀리식 vs MSA 비교까지 개념 중심으로 정리"
---

# Java 백엔드 핵심 기술 정리 — JDBC · Spring Boot · JPA · JWT · Docker

---

## 1. JDBC — Java와 DB를 연결하는 표준 인터페이스

**JDBC(Java Database Connectivity)** 는 Java 애플리케이션이 DB와 통신하기 위한 표준 API다. 어떤 DBMS를 사용하든 같은 코드로 접근할 수 있게 해주는 추상화 레이어다.

### 1-1. JDBC URL 구조

```java
"jdbc:mariadb://localhost:{포트번호}/sql_db"
//  ↑          ↑          ↑    ↑
// 드라이버   호스트     포트  DB명
```

드라이버 종류에 따라 `jdbc:mysql://`, `jdbc:postgresql://` 등으로 바뀐다.

### 1-2. Connection → PreparedStatement → ResultSet

JDBC의 표준 실행 흐름은 세 객체를 순서대로 사용한다.

```java
Connection conn = DriverManager.getConnection(DB_URL, USER, PASSWORD);
PreparedStatement stmt = conn.prepareStatement("SELECT password FROM users WHERE username = ?");
stmt.setString(1, username);   // ? 에 값을 바인딩
ResultSet rs = stmt.executeQuery();

if (rs.next()) {
    String savedPassword = rs.getString("password");
}
```

### 1-3. PreparedStatement가 중요한 이유

SQL Injection은 사용자 입력이 SQL 구문 자체로 해석될 때 발생한다.

```sql
-- 입력값: ' OR '1'='1
-- 취약한 쿼리 (문자열 이어붙이기)
SELECT * FROM users WHERE username = '' OR '1'='1'
-- → 항상 참이 되어 모든 사용자 정보 노출
```

`PreparedStatement`는 입력값을 SQL 구문이 아닌 **데이터**로만 처리하므로 이 문제를 근본적으로 차단한다.

```java
// ? 자리는 데이터만 들어갈 수 있음 → SQL 구문 삽입 불가
PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users WHERE username = ?");
stmt.setString(1, userInput);
```

### 1-4. try-with-resources로 자원 누수 방지

DB 연결은 반드시 사용 후 닫아야 한다. `try-with-resources`는 예외가 발생해도 자동으로 `close()`를 호출해준다.

```java
try (
    Connection conn = DriverManager.getConnection(DB_URL, USER, PASSWORD);
    PreparedStatement stmt = conn.prepareStatement(sql);
    ResultSet rs = stmt.executeQuery()
) {
    // 블록이 끝나면 rs, stmt, conn 순서로 자동 close()
}
```

### 1-5. JdbcTemplate — 반복 코드 제거

Spring의 `JdbcTemplate`은 Connection 획득·해제, 예외 변환 같은 반복 작업을 자동으로 처리해준다.

```java
// 순수 JDBC: Connection, PreparedStatement, ResultSet 직접 관리
// JdbcTemplate: SQL과 결과 매핑에만 집중
Optional<User> user = jdbcTemplate.query(
    "SELECT id, username, password FROM users WHERE username = ?",
    (rs, rowNum) -> new User(rs.getLong("id"), rs.getString("username"), rs.getString("password")),
    username
).stream().findFirst();
```

---

## 2. BCrypt — 안전한 비밀번호 저장

비밀번호를 평문으로 저장하면 DB가 탈취됐을 때 모든 사용자의 비밀번호가 그대로 노출된다. BCrypt는 이를 방지하는 단방향 해시 알고리즘이다.

### 핵심 특징

```
단방향: 해시 → 원문 복원 불가
Salt: 같은 비밀번호도 매번 다른 해시 생성 (Rainbow Table 공격 방지)
Cost Factor: 계산 비용 조절 가능 (숫자가 클수록 느리고 안전)
```

```java
// 저장: 평문 → 해시
String hashed = BCrypt.hashpw(rawPassword, BCrypt.gensalt(12));
// gensalt(12) → 2^12 = 4096번 반복 해시 (무차별 대입 공격 지연)

// 검증: 평문 + 저장된 해시 비교 (복호화가 아님)
boolean isValid = BCrypt.checkpw(rawPassword, hashedFromDB);
```

Spring Security에서는 `PasswordEncoder` Bean으로 일관되게 사용한다.

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
}

// 사용
String encoded = passwordEncoder.encode(rawPassword);
boolean matches = passwordEncoder.matches(rawPassword, encoded);
```

---

## 3. Spring Boot 핵심 개념

### 3-1. IoC (Inversion of Control) — 제어의 역전

일반적으로 객체는 자신이 필요한 의존 객체를 직접 생성한다.

```java
// 제어권이 개발자에게 있음
AuthService authService = new AuthService(new JdbcUserRepository(...));
```

IoC에서는 객체 생성과 연결의 제어권이 **프레임워크(Spring 컨테이너)** 로 넘어간다.

```java
// 제어권이 Spring에게 있음
// 개발자는 "필요하다"고 선언만 함
@Service
public class AuthService {
    private final UserRepository userRepository;

    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository; // Spring이 알아서 주입
    }
}
```

### 3-2. DI (Dependency Injection) — 의존성 주입

IoC를 구현하는 방식이 DI다. Spring이 Bean을 생성하고 생성자 타입을 보고 필요한 의존성을 자동으로 연결한다.

```java
// 생성자 주입 (권장)
@Service
public class PostService {
    private final PostRepository postRepository; // final → 불변

    public PostService(PostRepository postRepository) {
        this.postRepository = postRepository;
    }
}
```

생성자 주입을 권장하는 이유는 다음과 같다.

```
1. 의존 필드를 final로 선언해 불변성 보장
2. 객체 생성 시 필요한 의존성이 명확하게 드러남
3. Spring 없이도 단위 테스트 가능 (new PostService(mockRepo))
4. 생성 단계에서 순환 의존성 감지 가능
```

### 3-3. DIP (Dependency Inversion Principle)

구체 클래스가 아닌 **인터페이스에 의존**해야 한다는 원칙이다. DI가 DIP를 자동으로 만들어주는 것이 아니라, 인터페이스 중심으로 설계한 구조를 Spring이 편리하게 조립·관리해주는 것이다.

```java
// 인터페이스에 의존 (DIP)
public class AuthService {
    private final UserRepository userRepository; // 인터페이스
    // JdbcUserRepository, JpaUserRepository 등 구현체 교체 시 AuthService 수정 불필요
}
```

### 3-4. Spring Boot 시작 흐름

```
@SpringBootApplication → main() 실행
  → application.yml + 환경변수 로드
  → 컴포넌트 스캔 (@Controller, @Service, @Repository, @Component)
  → Bean 생성 + 생성자 의존성 주입
  → DB 연결 + schema.sql 실행
  → 내장 Tomcat 시작
```

`@SpringBootApplication`은 구성 클래스(`@Configuration`), 자동 설정(`@EnableAutoConfiguration`), 컴포넌트 스캔(`@ComponentScan`)을 하나로 합친 편의 애노테이션이다.

### 3-5. DispatcherServlet과 요청 처리 흐름

```
HTTP 요청
  → Tomcat (서블릿 컨테이너)
  → Spring Security Filter Chain
  → DispatcherServlet (Front Controller)
  → HandlerMapping (URL → Controller 메서드 탐색)
  → Controller 실행
  → Service → Repository → DB
  → Controller 응답 반환
  → MessageConverter (객체 → JSON 직렬화)
  → HTTP 응답
```

### 3-6. application.yml — 설정과 코드 분리

```yaml
spring:
  datasource:
    url: ${DB_URL:jdbc:mariadb://localhost:{포트번호}/sql_db} # 환경변수 우선, 없으면 기본값
    username: ${DB_USER:root}
    password: ${DB_PASSWORD:password}

app:
  jwt:
    secret: ${JWT_SECRET:dev-secret-key}
    issuer: myapp
```

`${환경변수명:기본값}` 형식으로 환경변수를 우선 사용하므로, 개발·컨테이너·운영 환경에서 동일한 JAR를 사용할 수 있다.

---

## 4. Spring Security + JWT 인증

### 4-1. Security Filter Chain

Spring Security는 Controller에 도달하기 전에 **필터 체인**으로 요청을 가로챈다.

```
HTTP 요청
  → JwtAuthenticationFilter (JWT 검증)
  → SecurityConfig (경로별 인가 규칙 확인)
    → 인증 필요 경로이고 인증 없음 → 401 반환
    → 공개 경로 또는 인증 완료 → Controller 진입
```

### 4-2. JWT (JSON Web Token)

JWT는 서버가 세션을 저장하지 않고(Stateless) 토큰 자체에 사용자 정보를 담아 인증하는 방식이다.

```
JWT 구조: Header.Payload.Signature
  Header:    알고리즘, 토큰 타입
  Payload:   클레임 (사용자 ID, username, 만료 시각 등)
  Signature: Header + Payload를 Secret Key로 서명 → 위변조 감지
```

```java
// JWT 생성
String token = JWT.create()
    .withIssuer("myapp")
    .withIssuedAt(Date.from(now))
    .withExpiresAt(Date.from(now.plus(1, ChronoUnit.HOURS)))
    .withSubject(String.valueOf(user.getId()))
    .withClaim("username", user.getUsername())
    .sign(Algorithm.HMAC256(secretKey));

// JWT 검증
DecodedJWT jwt = JWT.require(Algorithm.HMAC256(secretKey))
    .withIssuer("myapp")
    .build()
    .verify(token);
String username = jwt.getClaim("username").asString();
```

### 4-3. JWT 인증 필터 동작 원리

```java
// JwtAuthenticationFilter.java
cookieService.readAccessToken(request).ifPresent(token -> {
    try {
        DecodedJWT jwt = jwtProvider.verify(token);
        // JWT → Authentication 객체 생성
        Authentication authentication = new UsernamePasswordAuthenticationToken(
            jwt.getClaim("username").asString(),
            null,
            List.of(new SimpleGrantedAuthority("ROLE_USER"))
        );
        // SecurityContext에 저장 → 이후 모든 레이어에서 사용 가능
        SecurityContextHolder.getContext().setAuthentication(authentication);
    } catch (JWTVerificationException e) {
        SecurityContextHolder.clearContext(); // 유효하지 않으면 인증 정보 제거
    }
});
filterChain.doFilter(request, response);
```

Controller는 JWT 검증 방법을 알 필요 없이 `Authentication` 객체만 받아 사용한다.

```java
@PostMapping
public PostResponse create(
    @Valid @RequestBody PostCreateRequest request,
    Authentication authentication   // Security가 주입
) {
    return postService.create(request, authentication.getName());
}
```

### 4-4. Session vs JWT 비교

| 항목           | 세션 방식                   | JWT 방식                   |
| -------------- | --------------------------- | -------------------------- |
| 상태 저장 위치 | 서버 메모리                 | 클라이언트 (토큰)          |
| 서버 확장성    | 여러 서버 간 세션 공유 필요 | Stateless → 수평 확장 용이 |
| 토큰 크기      | 작음 (세션 ID만)            | 상대적으로 큼              |
| 즉시 무효화    | 서버에서 세션 삭제 가능     | 만료 전 무효화 어려움      |
| 저장 위치 권장 | HttpOnly Cookie             | HttpOnly Cookie            |

### 4-5. 쿠키 보안 속성

```
HttpOnly : JavaScript에서 접근 불가 → XSS 공격으로 토큰 탈취 방지
Secure   : HTTPS 연결에서만 전송
SameSite : 외부 사이트 요청 시 쿠키 전송 제한 → CSRF 방지
  - Strict: 외부 사이트 요청에 쿠키 미포함
  - Lax   : GET 요청엔 포함, POST엔 미포함
  - None  : 항상 포함 (반드시 Secure와 함께)
```

---

## 5. JPA — Java Persistence API

### 5-1. JPA란?

JPA는 Java 객체와 관계형 DB 테이블을 매핑하는 **ORM(Object-Relational Mapping)** 표준 명세다. Hibernate가 가장 많이 사용되는 구현체다.

```
개발자가 직접 작성하던 것         JPA가 대신 처리하는 것
─────────────────────────────────────────────────────
Connection, PreparedStatement   → 자동 처리
INSERT INTO posts VALUES (...)  → save(entity)
SELECT * FROM posts WHERE id=?  → findById(id)
UPDATE posts SET title=? WHERE  → 변경 감지 (Dirty Checking)
```

### 5-2. Entity 매핑

```java
@Entity                      // JPA 관리 대상
@Table(name = "posts")       // 매핑할 테이블 이름
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;         // AUTO_INCREMENT

    @Column(nullable = false, length = 200)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    protected Post() { }     // JPA 기본 생성자 (외부에서 빈 객체 생성 방지)

    public Post(String title, String content, String writer) {
        this.title = title;
        this.content = content;
        this.writer = writer;
        this.createdAt = LocalDateTime.now();
        this.updatedAt = this.createdAt;
    }

    // 상태 변경은 Entity 내부 메서드로 → 수정 시각 갱신 누락 방지
    public void update(String title, String content) {
        this.title = title;
        this.content = content;
        this.updatedAt = LocalDateTime.now();
    }
}
```

### 5-3. 영속성 컨텍스트 (Persistence Context)

영속성 컨텍스트는 JPA가 Entity를 관리하는 **1차 캐시**다. 트랜잭션 내에서 조회한 Entity는 영속 상태로 관리된다.

```
영속성 컨텍스트 상태

비영속 (New)      : new Post() — JPA가 모름
영속 (Managed)    : save() 또는 find() 후 — JPA가 추적
준영속 (Detached) : 트랜잭션 종료 후 — JPA가 더 이상 추적 안 함
삭제 (Removed)    : delete() 호출 — 트랜잭션 종료 시 DELETE 실행
```

### 5-4. 변경 감지 (Dirty Checking)

JPA는 영속 상태의 Entity를 수정하면 **명시적인 save() 호출 없이도** 트랜잭션 종료 시 UPDATE SQL을 자동으로 실행한다.

```java
@Transactional
public PostResponse update(Long postId, PostUpdateRequest request, String username) {
    Post post = postRepository.findById(postId).orElseThrow(...);
    // → 영속성 컨텍스트가 최초 상태 보관

    verifyWriter(post, username);
    post.update(request.title(), request.content()); // 필드 변경
    // → postRepository.save(post) 없음!

    return PostResponse.from(post);
    // 트랜잭션 종료 시 JPA가 변경 감지 → UPDATE SQL 자동 실행
}
```

```
findById() → 영속성 컨텍스트가 스냅샷 저장
  ↓
post.update() → 필드 변경
  ↓
트랜잭션 종료 → 스냅샷과 현재 상태 비교
  ↓
변경된 필드 있으면 UPDATE SQL 실행 → COMMIT
```

### 5-5. Spring Data JPA

인터페이스 선언만으로 CRUD 구현을 자동 생성해준다.

```java
public interface PostRepository extends JpaRepository<Post, Long> {
    // 기본 제공: save, findById, findAll, delete, count 등

    // 메서드 이름 규칙으로 쿼리 자동 생성
    List<Post> findAllByOrderByIdDesc();
    // → SELECT * FROM posts ORDER BY id DESC
}
```

**JPA Specification — 동적 검색 조건**

검색 조건이 다양할 때 조건별로 Repository 메서드를 만들지 않고 동적으로 조합할 수 있다.

```java
// PostSpecifications.java
Predicate keywordPredicate = switch (searchType) {
    case "title"   -> builder.like(root.get("title"),   "%" + keyword + "%");
    case "content" -> builder.like(root.get("content"), "%" + keyword + "%");
    default -> builder.or(
        builder.like(root.get("title"),   "%" + keyword + "%"),
        builder.like(root.get("content"), "%" + keyword + "%")
    );
};

// 사용
Page<Post> result = postRepository.findAll(
    PostSpecifications.withCondition(condition),
    pageable
);
```

### 5-6. 트랜잭션 전략

```java
@Service
@Transactional(readOnly = true)  // 클래스 기본값: 읽기 전용
public class PostService {

    // 조회: 기본값(readOnly=true) 적용
    public PostResponse findById(Long postId) { ... }

    @Transactional  // 쓰기: readOnly=false로 재정의
    public PostResponse create(PostCreateRequest request, String username) { ... }

    @Transactional  // 쓰기
    public PostResponse update(Long postId, PostUpdateRequest request, String username) { ... }
}
```

`readOnly = true`는 불필요한 변경 감지 작업을 줄이고, 읽기 전용 의도를 코드에 명확히 표현한다.

---

## 6. Entity · DTO · VO — 왜 구분하는가?

### Entity를 그대로 반환하면 생기는 문제

```
1. DB 컬럼 추가/변경이 API 응답 형식에 직접 영향
2. 비밀번호 같은 내부 필드가 의도치 않게 노출
3. 양방향 관계 시 JSON 직렬화 무한 루프
4. 변경되면 안 되는 id, 생성 시각까지 클라이언트에서 수정 가능
```

### 올바른 계층별 역할

```
[클라이언트]
    ↓ 요청 DTO (필요한 입력만)
[Controller]
    ↓ 검증된 DTO + Authentication
[Service]        ← 비즈니스 로직, Entity 조작
    ↓ Entity
[Repository]     ← DB 접근
    ↓
[DB]
    ↑ Entity
[Service]        ← Entity → 응답 DTO 변환
    ↑ 응답 DTO
[Controller]
    ↑ JSON 직렬화
[클라이언트]
```

```java
// 요청 DTO: 입력에 필요한 것만
public record PostCreateRequest(
    @NotBlank String title,
    @NotBlank String content
    // 작성자는 여기서 받지 않음 → JWT에서 결정 (조작 방지)
) { }

// 응답 DTO: 변환 로직을 내부에 캡슐화
public record PostResponse(Long id, String title, String content, String writer, ...) {
    public static PostResponse from(Post post) {
        return new PostResponse(post.getId(), post.getTitle(), ...);
    }
}
```

---

## 7. HTTP 상태 코드와 REST API 설계

```
2xx 성공
  200 OK          : 조회, 수정 성공
  201 Created     : 새 자원 생성 성공 (POST)
  204 No Content  : 성공이지만 반환할 데이터 없음 (DELETE)

4xx 클라이언트 오류
  400 Bad Request  : 입력값 검증 실패 (@Valid 위반)
  401 Unauthorized : 인증 실패 (JWT 없음 또는 만료)
  403 Forbidden    : 인증은 됐지만 권한 없음 (다른 사람 글 수정 시도)
  404 Not Found    : 요청한 자원 없음
  409 Conflict     : 중복 충돌 (좋아요 중복 등록)

5xx 서버 오류
  500 Internal Server Error : 서버 내부 오류
```

```java
// 게시글 작성: 201 Created + Location 헤더
return ResponseEntity
    .created(URI.create("/api/posts/" + postId))
    .body(response);

// 게시글 삭제: 204 No Content
@ResponseStatus(HttpStatus.NO_CONTENT)
public void delete(@PathVariable Long postId, Authentication authentication) {
    postService.delete(postId, authentication.getName());
}
```

---

## 8. Docker와 MariaDB

### 8-1. Docker를 사용하는 이유

Docker는 애플리케이션과 실행 환경(라이브러리, 설정)을 **컨테이너**라는 단위로 패키징한다.

```
이점
  - 설치 환경이 동일하게 유지 ("내 PC에서는 됐는데..." 문제 해결)
  - 운영체제 영향 최소화
  - 컨테이너 삭제 후 쉽게 재생성
  - 팀원과 동일한 DB 환경 공유
```

### 8-2. 핵심 Docker 명령어

```bash
# 이미지 빌드
docker build -t my-app:latest .

# 컨테이너 실행
docker run -d -p 8080:8080 --name my-app my-app:latest

# 실행 중인 컨테이너 확인
docker ps

# 로그 확인 (트러블슈팅 필수)
docker logs -f my-app

# 컨테이너 접속
docker exec -it my-app sh

# 중지 및 삭제
docker stop my-app && docker rm my-app
```

### 8-3. Dockerfile 작성

```dockerfile
FROM eclipse-temurin:21-jre-alpine     # 베이스 이미지
WORKDIR /app
COPY build/libs/app.jar app.jar        # 빌드된 JAR 복사
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"] # 실행 명령
```

### 8-4. Docker Compose — 멀티 컨테이너 관리

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "{포트번호}:{포트번호}"
    environment:
      DB_URL: jdbc:mariadb://mariadb:{포트번호}/sql_db
      DB_USER: root
      DB_PASSWORD: ${DB_PASSWORD} # .env 파일에서 주입
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - mariadb
    restart: unless-stopped # 비정상 종료 시 재시작

  mariadb:
    image: mariadb:10.11
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: sql_db
    ports:
      - "3306:3306"
    volumes:
      - db_data:/var/lib/mysql # 데이터 영속 보관

volumes:
  db_data:
```

```bash
# 빌드 및 실행
docker compose up -d --build

# 상태 확인
docker compose ps

# 로그 확인
docker compose logs -f app

# 중지
docker compose down
```

### 8-5. 설정 보안

`docker-compose.yml`에 비밀번호·JWT secret을 평문으로 작성하면 Git에 노출될 위험이 있다.

```bash
# .env 파일에 민감 정보 분리
DB_PASSWORD=my-secret-password
JWT_SECRET=very-long-random-secret-key

# .gitignore에 등록
echo ".env" >> .gitignore
```

운영 환경에서는 `.env` 대신 Docker Secret, 클라우드 Secret Manager, Vault 사용을 권장한다.

---

## 9. 커넥션 풀 — HikariCP

DB 연결(`Connection`)을 매번 새로 만드는 것은 비용이 크다. 커넥션 풀은 연결을 미리 만들어두고 재사용하는 패턴이다.

```
요청마다 연결 (비효율)
  요청 → 연결 생성 → SQL 실행 → 연결 종료

커넥션 풀 (효율적)
  [미리 만들어 둔 연결 10개]
  요청 → 풀에서 연결 빌림 → SQL 실행 → 풀에 연결 반납
```

Spring Boot는 기본적으로 **HikariCP**를 커넥션 풀로 사용한다. `application.yml`에서 풀 크기를 설정할 수 있다.

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 10 # 최대 연결 수
      minimum-idle: 5 # 최소 유지 연결 수
      connection-timeout: 30000 # 연결 대기 시간 (ms)
```

---

## 10. 모놀리식 아키텍처 vs MSA

### 모놀리식 (Monolithic)

인증·게시글·댓글·좋아요가 하나의 프로세스, 하나의 JAR, 하나의 DB에 있는 구조다.

```
장점
  - 개발·디버깅·배포 단순
  - 서비스 간 호출이 메서드 호출 (네트워크 지연 없음)
  - 로컬 ACID 트랜잭션 보장
  - 팀이 작을 때 빠른 개발 가능

단점
  - 기능 수정 시 전체 재빌드·재배포
  - 특정 기능만 선택적 확장 불가
  - 코드베이스가 커질수록 복잡도 증가
```

### MSA (Microservices Architecture)

서비스별로 독립적으로 배포하고 실행하는 구조다.

```
장점
  - 서비스별 독립 배포
  - 부하가 큰 서비스만 선택 확장
  - 기술 스택 다양화 가능

단점
  - 서비스 간 통신: HTTP/gRPC/메시지 큐
  - 분산 트랜잭션 (Saga 패턴 등) 복잡도
  - 분산 추적·모니터링·계약 관리 필요
  - 운영 비용 증가
```

| 구분      | 모놀리식           | MSA                        |
| --------- | ------------------ | -------------------------- |
| 배포 단위 | 전체 애플리케이션  | 서비스별 독립              |
| 호출 방식 | 메서드 호출        | HTTP / gRPC / 메시지       |
| 데이터    | 하나의 DB 공유     | 서비스별 DB 소유           |
| 트랜잭션  | 로컬 ACID          | Saga / 최종 일관성         |
| 장애 영향 | 전체 기능 영향     | 격리 가능 (연쇄 장애 주의) |
| 확장      | 전체 인스턴스 확장 | 부하 서비스만 확장         |

> 컨테이너화(Docker)는 MSA와 같은 개념이 아니다. 현재 구조처럼 하나의 모놀리식 애플리케이션을 하나의 컨테이너로 패키징할 수 있다. 컨테이너는 실행 환경의 일관성과 배포 편의성을 제공할 뿐, 서비스 경계를 자동으로 분리하지는 않는다.

---

## 핵심 개념 한줄 요약

| 기술                  | 한줄 요약                                                         |
| --------------------- | ----------------------------------------------------------------- |
| **JDBC**              | Java에서 DB에 연결하기 위한 표준 인터페이스                       |
| **PreparedStatement** | 입력값을 데이터로만 처리해 SQL Injection 방지                     |
| **BCrypt**            | 단방향 해시 + salt로 비밀번호를 안전하게 저장                     |
| **IoC / DI**          | 객체 생성·연결의 제어권을 Spring 컨테이너에 위임                  |
| **Spring Security**   | 필터 체인으로 Controller 이전에 인증·인가 처리                    |
| **JWT**               | 서버 세션 없이 토큰 자체에 사용자 정보를 담아 인증                |
| **JPA / ORM**         | Java 객체와 DB 테이블을 매핑해 SQL 반복 작업 자동화               |
| **영속성 컨텍스트**   | JPA가 Entity를 추적하는 1차 캐시                                  |
| **변경 감지**         | 영속 Entity 수정 시 save() 없이 트랜잭션 종료 시 UPDATE 자동 실행 |
| **DTO 분리**          | Entity 노출 방지·입력 제한·응답 제어를 위한 계층 간 데이터 객체   |
| **HikariCP**          | DB 연결을 미리 만들어 재사용하는 커넥션 풀                        |
| **Docker**            | 앱과 실행 환경을 컨테이너로 패키징해 어디서나 동일하게 실행       |
| **Docker Compose**    | 멀티 컨테이너 서비스를 하나의 yml로 선언·실행·관리                |

---

## 📎 참고 자료

- [Spring Boot 공식 문서](https://docs.spring.io/spring-boot/docs/current/reference/html/)
- [Spring Security 공식 문서](https://docs.spring.io/spring-security/reference/)
- [Spring Data JPA 공식 문서](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/)
- [HikariCP GitHub](https://github.com/brettwooldridge/HikariCP)
- [JWT 공식 사이트](https://jwt.io/)
- [Docker 공식 문서](https://docs.docker.com/)
- [MariaDB 공식 문서](https://mariadb.com/kb/en/documentation/)
