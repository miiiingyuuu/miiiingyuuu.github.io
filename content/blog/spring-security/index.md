---
title: "Spring Security + JWT 인증"
date: "2025-03-05"
category: ["Backend", "Java", "Spring", "Security"]
description: "Spring Security의 동작 원리, JWT 구조, 로그인/인증 필터 구현, Access Token + Refresh Token 전략까지 입문자 눈높이에서 단계별로 정리"
---

API 서버를 만들다 보면 반드시 마주치는 것이 인증(Authentication)과 인가(Authorization)입니다. Spring Security와 JWT를 처음 접하면 설정해야 할 것이 많아 어렵게 느껴지지만, 흐름을 이해하면 패턴이 보입니다. 이 글에서는 왜 JWT를 사용하는지부터 실제 코드 구현까지 순서대로 정리합니다.

---

## 1. 인증(Authentication) vs 인가(Authorization)

Spring Security를 시작하기 전에 두 개념을 먼저 구분해야 합니다.

| | 인증 (Authentication) | 인가 (Authorization) |
|--|----------------------|---------------------|
| 질문 | "당신이 누구인가?" | "당신이 이걸 할 수 있는가?" |
| 예시 | 로그인 (아이디/비밀번호 확인) | 관리자 페이지 접근 권한 확인 |
| HTTP 상태 | 401 Unauthorized | 403 Forbidden |
| Spring | `AuthenticationManager` | `AccessDecisionManager` |

---

## 2. 세션 방식 vs JWT 방식

![Session vs JWT](./session_vs_jwt.jpg)

### 세션 방식의 한계

기존 세션 방식은 서버가 로그인한 사용자 정보를 **서버 메모리나 DB에 저장**합니다.

```
문제 1: 서버가 여러 대면? (수평 확장)
  → 서버 A에서 로그인했는데 서버 B에는 세션 없음
  → Sticky Session 또는 세션 공유 서버 필요 → 복잡도 증가

문제 2: 모바일 앱, 다른 도메인 API 서버
  → Cookie 기반 세션은 Cross-Origin 환경에서 불편
```

### JWT 방식의 장점

JWT는 **토큰 자체에 사용자 정보를 담아** 서버가 별도로 저장할 필요가 없습니다.

```
✅ Stateless: 서버가 상태를 저장하지 않아 수평 확장 자유로움
✅ Cross-Origin: HTTP 헤더로 전달하므로 도메인 제약 없음
✅ 다양한 클라이언트: 웹, 앱, 외부 서비스 모두 동일 방식
```

---

## 3. JWT 구조 이해

![JWT Structure](./jwt_structure.jpg)

JWT는 점(`.`)으로 구분된 세 부분으로 이루어집니다.

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.SflKxwRJSMeKKF
─────────────────── ─────────────────── ────────────────
     HEADER               PAYLOAD           SIGNATURE
```

### Header

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

서명 알고리즘과 토큰 타입을 담습니다. Base64로 인코딩됩니다.

### Payload (Claims)

```json
{
  "userId": 1,
  "email": "user@example.com",
  "role": "USER",
  "iat": 1700000000,
  "exp": 1700003600
}
```

| 필드 | 의미 |
|------|------|
| `iat` | issued at — 발급 시간 (Unix timestamp) |
| `exp` | expiration — 만료 시간 |
| `sub` | subject — 주체 (주로 userId) |
| 커스텀 | userId, role 등 필요한 정보 추가 가능 |

> ⚠️ **Payload는 암호화되지 않습니다.** Base64 디코딩만 하면 내용이 보입니다. 비밀번호, 카드번호 같은 민감한 정보는 절대 넣으면 안 됩니다.

### Signature

```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  SECRET_KEY
)
```

서버만 알고 있는 `SECRET_KEY`로 서명합니다. 누군가 Payload를 변조하면 Signature 검증에서 실패합니다.

---

## 4. 의존성 추가

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>

<!-- JWT 라이브러리 (jjwt) -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>0.11.5</version>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-impl</artifactId>
    <version>0.11.5</version>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-jackson</artifactId>
    <version>0.11.5</version>
    <scope>runtime</scope>
</dependency>
```

```yaml
# application.yml
jwt:
  secret: my-very-long-secret-key-must-be-at-least-256-bits
  access-expiration: 3600000      # 1시간 (ms)
  refresh-expiration: 604800000   # 7일 (ms)
```

---

## 5. JWT 토큰 생성 / 검증 클래스

```java
@Component
public class JwtProvider {

    @Value("${jwt.secret}")
    private String secretKey;

    @Value("${jwt.access-expiration}")
    private long accessExpiration;

    @Value("${jwt.refresh-expiration}")
    private long refreshExpiration;

    // 서명 키 생성
    private Key getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(secretKey);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    // ── Access Token 생성 ──────────────────────
    public String generateAccessToken(Long userId, String role) {
        return Jwts.builder()
                .setSubject(String.valueOf(userId))   // sub: userId
                .claim("role", role)                  // 커스텀 클레임
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + accessExpiration))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    // ── Refresh Token 생성 ─────────────────────
    public String generateRefreshToken(Long userId) {
        return Jwts.builder()
                .setSubject(String.valueOf(userId))
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + refreshExpiration))
                .signWith(getSigningKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    // ── 토큰에서 userId 추출 ───────────────────
    public Long getUserId(String token) {
        return Long.parseLong(
            parseClaims(token).getSubject()
        );
    }

    // ── 토큰에서 role 추출 ────────────────────
    public String getRole(String token) {
        return parseClaims(token).get("role", String.class);
    }

    // ── 토큰 유효성 검증 ──────────────────────
    public boolean validate(String token) {
        try {
            parseClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            throw new CustomException(ErrorCode.TOKEN_EXPIRED);
        } catch (JwtException | IllegalArgumentException e) {
            throw new CustomException(ErrorCode.TOKEN_INVALID);
        }
    }

    // ── Claims 파싱 (내부 공통) ───────────────
    private Claims parseClaims(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getSigningKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }
}
```

---

## 6. Spring Security Filter Chain

![Filter Chain](./filter_chain.jpg)

Spring Security는 요청이 컨트롤러에 도달하기 전에 여러 **필터**를 통과시킵니다. 우리는 그 중간에 JWT를 검증하는 커스텀 필터를 추가합니다.

```
HTTP Request
     ↓
[SecurityFilterChain]
     ↓
[JwtAuthenticationFilter]  ← 우리가 만들 필터
     ↓
[ExceptionTranslationFilter]
     ↓
[AuthorizationFilter]
     ↓
DispatcherServlet → Controller
```

### JwtAuthenticationFilter 구현

```java
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        // 1. Authorization 헤더에서 토큰 추출
        String token = extractToken(request);

        // 2. 토큰이 있고 유효하면 인증 정보 설정
        if (token != null && jwtProvider.validate(token)) {
            Long userId = jwtProvider.getUserId(token);
            String role  = jwtProvider.getRole(token);

            // 3. Authentication 객체 생성
            UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                    userId,          // principal
                    null,            // credentials (null for JWT)
                    List.of(new SimpleGrantedAuthority("ROLE_" + role))
                );

            // 4. SecurityContext에 저장 → 이후 필터/컨트롤러에서 사용 가능
            SecurityContextHolder.getContext().setAuthentication(auth);
        }

        // 5. 다음 필터로 전달
        filterChain.doFilter(request, response);
    }

    // "Bearer <token>" 형식에서 토큰만 추출
    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
```

---

## 7. SecurityConfig 설정

```java
@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            // REST API는 CSRF 불필요 (JWT 사용)
            .csrf(AbstractHttpConfigurer::disable)

            // 세션 사용 안 함 (Stateless)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

            // URL별 접근 권한
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()  // 로그인/회원가입은 허용
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()                 // 나머지는 인증 필요
            )

            // JWT 필터를 기본 폼 로그인 필터 앞에 추가
            .addFilterBefore(jwtAuthFilter,
                UsernamePasswordAuthenticationFilter.class)

            // 인증/인가 실패 처리
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, e) -> {
                    res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    res.getWriter().write("{\"error\": \"Unauthorized\"}");
                })
                .accessDeniedHandler((req, res, e) -> {
                    res.setStatus(HttpServletResponse.SC_FORBIDDEN);
                    res.getWriter().write("{\"error\": \"Forbidden\"}");
                })
            )
            .build();
    }

    // 비밀번호 암호화 (BCrypt)
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

---

## 8. 로그인 API 구현

```java
// DTO
public record LoginRequest(String email, String password) {}
public record LoginResponse(String accessToken, String tokenType) {
    public LoginResponse(String accessToken) {
        this(accessToken, "Bearer");
    }
}
```

```java
// Controller
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request,
                                               HttpServletResponse response) {
        LoginResponse loginResponse = authService.login(request, response);
        return ResponseEntity.ok(loginResponse);
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(HttpServletRequest request) {
        LoginResponse loginResponse = authService.refresh(request);
        return ResponseEntity.ok(loginResponse);
    }
}
```

```java
// Service
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtProvider    jwtProvider;
    private final PasswordEncoder passwordEncoder;

    public LoginResponse login(LoginRequest request, HttpServletResponse response) {
        // 1. 사용자 조회
        User user = userRepository.findByEmail(request.email())
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        // 2. 비밀번호 검증 (BCrypt 비교)
        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new CustomException(ErrorCode.INVALID_PASSWORD);
        }

        // 3. 토큰 발급
        String accessToken  = jwtProvider.generateAccessToken(user.getId(), user.getRole());
        String refreshToken = jwtProvider.generateRefreshToken(user.getId());

        // 4. Refresh Token → HttpOnly Cookie에 저장
        ResponseCookie cookie = ResponseCookie.from("refresh_token", refreshToken)
                .httpOnly(true)      // JS로 접근 불가 (XSS 방어)
                .secure(true)        // HTTPS에서만 전송
                .path("/api/auth/refresh")
                .maxAge(Duration.ofDays(7))
                .sameSite("Strict")
                .build();
        response.addHeader("Set-Cookie", cookie.toString());

        return new LoginResponse(accessToken);
    }

    public LoginResponse refresh(HttpServletRequest request) {
        // Cookie에서 Refresh Token 추출
        String refreshToken = Arrays.stream(
                Optional.ofNullable(request.getCookies()).orElse(new Cookie[0]))
                .filter(c -> "refresh_token".equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElseThrow(() -> new CustomException(ErrorCode.TOKEN_NOT_FOUND));

        // Refresh Token 검증 후 새 Access Token 발급
        jwtProvider.validate(refreshToken);
        Long userId = jwtProvider.getUserId(refreshToken);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new CustomException(ErrorCode.USER_NOT_FOUND));

        String newAccessToken = jwtProvider.generateAccessToken(userId, user.getRole());
        return new LoginResponse(newAccessToken);
    }
}
```

---

## 9. Access Token + Refresh Token 전략

![Token Strategy](./token_strategy.jpg)

### 왜 두 개의 토큰이 필요한가?

```
Access Token만 사용하면:
  만료를 짧게 → 자주 재로그인 → 불편
  만료를 길게 → 탈취 시 오래 악용 → 위험

→ 두 토큰으로 역할 분리
```

| | Access Token | Refresh Token |
|--|-------------|--------------|
| 만료 | 짧음 (15분~1시간) | 긺 (7일~30일) |
| 저장 위치 | 메모리 (변수) | HttpOnly Cookie |
| 용도 | API 요청마다 헤더에 포함 | Access Token 재발급 전용 |
| 탈취 시 | 짧은 만료로 피해 최소화 | 서버 DB에서 무효화 가능 |

### 저장 위치가 중요한 이유

```
Access Token을 localStorage에 저장하면?
  → JavaScript로 접근 가능 → XSS 공격에 취약

Refresh Token을 HttpOnly Cookie에 저장하면?
  → JavaScript로 접근 불가 → XSS 방어
  → CSRF 방어를 위해 SameSite=Strict 설정 필요
```

---

## 10. 전체 아키텍처 정리

![Architecture](./architecture.jpg)

### 로그인 흐름

```
1. POST /api/auth/login { email, password }
2. AuthService: 사용자 조회 + 비밀번호 검증
3. JwtProvider: Access Token + Refresh Token 발급
4. Refresh Token → HttpOnly Cookie
5. Access Token → Response Body
```

### 인증된 요청 흐름

```
1. GET /api/posts
   Authorization: Bearer <access_token>
2. JwtAuthenticationFilter: 토큰 추출 & 검증
3. SecurityContextHolder에 Authentication 저장
4. Controller: @AuthenticationPrincipal로 userId 접근
5. Service: 비즈니스 로직 처리
```

### 컨트롤러에서 인증 정보 사용

```java
@GetMapping("/me")
public ResponseEntity<UserResponse> getMyProfile(
        @AuthenticationPrincipal Long userId) {  // SecurityContext에서 꺼냄
    return ResponseEntity.ok(userService.getProfile(userId));
}

// 또는 직접 꺼내는 방법
@GetMapping("/me")
public ResponseEntity<UserResponse> getMyProfile() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    Long userId = (Long) auth.getPrincipal();
    return ResponseEntity.ok(userService.getProfile(userId));
}
```

---

## 11. 메서드 단위 권한 제어 (@PreAuthorize)

```java
@Configuration
@EnableMethodSecurity  // 메서드 보안 활성화
public class SecurityConfig { ... }
```

```java
@Service
public class AdminService {

    @PreAuthorize("hasRole('ADMIN')")
    public List<User> getAllUsers() { ... }

    @PreAuthorize("hasRole('ADMIN') or #userId == authentication.principal")
    public UserDetail getUserDetail(Long userId) { ... }

    @PostAuthorize("returnObject.ownerId == authentication.principal")
    public Post getPost(Long postId) { ... }
}
```

---

## 12. 자주 하는 실수

**1. SECRET_KEY가 너무 짧으면 예외 발생**

```yaml
# ❌ 너무 짧은 키
jwt:
  secret: "mykey"

# ✅ 256비트(32바이트) 이상, Base64 인코딩
jwt:
  secret: "bXlWZXJ5TG9uZ1NlY3JldEtleVRoYXRJczI1NkJpdHNMb25n"
```

**2. CSRF 설정을 잊으면 POST 요청이 막힘**

```java
// ❌ JWT를 쓰면서 CSRF를 켜두면 모든 POST 요청에 CSRF 토큰 필요
// ✅ REST API + JWT 조합에서는 CSRF 비활성화
.csrf(AbstractHttpConfigurer::disable)
```

**3. 세션을 Stateless로 설정 안 하면 세션이 생성됨**

```java
// ✅ 반드시 STATELESS 설정
.sessionManagement(session ->
    session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
```

**4. 401 vs 403 혼동**

```
401 Unauthorized → 인증 안 됨 (토큰 없음, 만료, 유효하지 않음)
403 Forbidden    → 인증은 됐지만 권한 없음 (USER가 ADMIN 페이지 접근)
```

**5. HttpOnly Cookie 없이 Refresh Token을 localStorage에 저장**

```javascript
// ❌ XSS 공격으로 탈취 가능
localStorage.setItem('refresh_token', token)

// ✅ 서버에서 HttpOnly Cookie로 설정 → JS 접근 불가
```

---

## 참고 자료

- [Spring Security 공식 문서](https://docs.spring.io/spring-security/reference/index.html)
- [JWT 공식 사이트 (jwt.io)](https://jwt.io/)
- [jjwt 라이브러리 GitHub](https://github.com/jwtk/jjwt)