---
title: "프론트엔드 로그인 구현 (JWT, AccessToken, RefreshToken)"
date: "2024-07-14"
category: ["Frontend", "React", "Security"]
description: "JWT 인증 방식의 개념부터 Access Token/Refresh Token 관리 전략, Axios 인터셉터를 활용한 자동 갱신, 보안 고려사항까지 프론트엔드 로그인 구현 전반을 정리합니다."
---

팀 프로젝트에서 자체 로그인 기능을 구현하면서 JWT 토큰 방식에 대해 깊이 공부하게 되었습니다. 개념은 알고 있었지만 막상 구현하면서 토큰 저장 위치, 자동 갱신 처리, 보안 이슈까지 생각보다 고려할 것이 많았습니다. 이 글에서 그 과정을 정리합니다.

---

## 1. JWT란?

**JWT(JSON Web Token)** 는 당사자 간에 정보를 안전하게 전송하기 위한 컴팩트한 자체 포함 토큰입니다. 사용자가 로그인하면 서버가 "이 사람은 인증된 사용자입니다"라는 증명서를 발급해주고, 이후 API 요청마다 이 증명서를 제시하는 방식입니다.

### JWT 구조

```
header.payload.signature
```

세 부분이 `.`으로 구분되며, 각 부분은 Base64URL로 인코딩되어 있습니다.

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9        ← Header
.eyJ1c2VySWQiOjEsImlhdCI6MTYxNjIzOTAyMn0    ← Payload
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c ← Signature
```

| 부분 | 내용 | 특징 |
|------|------|------|
| **Header** | 토큰 타입 + 해싱 알고리즘 | 인코딩만 됨 (복호화 가능) |
| **Payload** | 사용자 정보, 권한, 만료시간 등 | 인코딩만 됨 — 민감 정보 넣지 말 것 |
| **Signature** | Header + Payload를 비밀키로 서명 | 서버의 비밀키 없이 위조 불가 |

> Payload는 누구나 디코딩할 수 있으므로 비밀번호, 카드번호 등 민감한 정보를 절대 담지 말아야 합니다.

### JWT 기반 인증의 장점

세션 방식과 달리 서버가 사용자 로그인 상태를 저장하지 않습니다. 토큰 자체에 정보가 담겨 있어 **서버가 Stateless**하게 유지됩니다. 서버 인스턴스가 여러 개로 늘어나도 세션 공유 없이 인증이 가능합니다.

---

## 2. Access Token과 Refresh Token

Access Token만으로 인증을 구현하면 한 가지 치명적인 문제가 있습니다. 토큰이 탈취되면 만료 전까지 공격자가 마음대로 API를 호출할 수 있습니다. 그렇다고 만료 시간을 너무 짧게 설정하면 사용자가 자주 로그인해야 하는 불편함이 생깁니다.

이를 해결하기 위해 역할이 다른 두 가지 토큰을 함께 사용합니다.

### Access Token

```
목적     : API 요청 시 사용자 인증
유효기간 : 짧음 (15분 ~ 1시간 권장)
저장위치 : 메모리(상태) 또는 sessionStorage
역할     : 실제 인가(Authorization) 수행
```

### Refresh Token

```
목적     : 만료된 Access Token 재발급
유효기간 : 김 (7일 ~ 30일)
저장위치 : HttpOnly Cookie (권장)
역할     : 서버에서 검증 후 새 Access Token 발급
```

### 전체 인증 플로우

```
1. 로그인 요청
   Client → Server: { email, password }

2. 토큰 발급
   Server → Client: Access Token (응답 Body)
                  + Refresh Token (HttpOnly Cookie)
   Server: DB에 Refresh Token 저장

3. API 요청
   Client → Server: Authorization: Bearer <access_token>
   Server: 토큰 유효성 검증 → 요청 처리

4. Access Token 만료 시
   Client → Server: Refresh Token (Cookie 자동 전송)
   Server: Refresh Token 검증 → 새 Access Token 발급
   Client: 새 Access Token으로 원래 요청 재시도

5. Refresh Token도 만료 시
   → 재로그인 필요

6. 로그아웃
   Client: Access Token 삭제
   Server: Refresh Token DB에서 삭제 (Cookie 만료 처리)
```

---

## 3. 토큰 저장 위치 선택

어디에 저장하느냐는 보안에서 가장 중요한 결정 중 하나입니다.

### 저장 옵션 비교

| 저장 위치 | XSS | CSRF | 지속성 | 권장 용도 |
|-----------|-----|------|--------|-----------|
| localStorage | ❌ 취약 | ✅ 안전 | 영구 | ⚠️ 비권장 |
| sessionStorage | ❌ 취약 | ✅ 안전 | 탭 닫으면 삭제 | ⚠️ Access Token 임시 저장 |
| 메모리 (State) | ✅ 안전 | ✅ 안전 | 새로고침 시 소실 | ✅ Access Token 권장 |
| HttpOnly Cookie | ✅ 안전 | ❌ 취약 | 만료일까지 | ✅ Refresh Token 권장 |

### 권장 조합

```
Access Token  → 메모리(React State) 또는 sessionStorage
Refresh Token → HttpOnly Cookie (서버에서 Set-Cookie로 설정)
```

**왜 HttpOnly Cookie인가?** JS로 접근이 불가능하므로 XSS 공격으로 토큰을 훔칠 수 없습니다. CSRF 대응은 `SameSite=Strict` 또는 CSRF 토큰으로 처리합니다.

---

## 4. 프로젝트 구조

```
src/
├── api/
│   ├── axios.ts          ← Axios 인스턴스 + 인터셉터
│   └── auth.ts           ← 로그인/로그아웃/갱신 API
├── context/
│   └── AuthContext.tsx   ← 전역 인증 상태 관리
├── hooks/
│   └── useAuth.ts        ← 인증 관련 커스텀 훅
├── components/
│   └── ProtectedRoute.tsx ← 인증 필요 라우트 보호
└── pages/
    ├── Login.tsx
    └── Dashboard.tsx
```

---

## 5. Axios 인스턴스 & 인터셉터

인터셉터는 모든 요청/응답을 중간에서 가로채 공통 처리를 합니다. Access Token 자동 삽입, 만료 시 자동 갱신이 여기서 이뤄집니다.

```tsx
// src/api/axios.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// 인증이 필요 없는 요청용 (로그인, 회원가입 등)
export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// 인증이 필요한 요청용
export const axiosPrivate = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // HttpOnly Cookie(Refresh Token) 자동 전송
});

// ── 동시 요청 중 토큰 갱신 중복 방지를 위한 큐 ──
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(prom => {
    error ? prom.reject(error) : prom.resolve(token!);
  });
  failedQueue = [];
};

// ── Request Interceptor: 모든 요청에 Access Token 자동 삽입 ──
axiosPrivate.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = sessionStorage.getItem('accessToken');
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response Interceptor: 401 발생 시 토큰 자동 갱신 ──
axiosPrivate.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // 이미 갱신 중이면 대기열에 추가 (동시 요청 처리)
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return axiosPrivate(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh Token(Cookie)으로 새 Access Token 요청
        const response = await axiosInstance.post(
          '/auth/refresh',
          {},
          { withCredentials: true }
        );
        const { accessToken } = response.data;

        sessionStorage.setItem('accessToken', accessToken);
        processQueue(null, accessToken);

        // 원래 요청 재시도
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return axiosPrivate(originalRequest);
      } catch (refreshError) {
        // Refresh Token도 만료 → 강제 로그아웃
        processQueue(refreshError, null);
        sessionStorage.removeItem('accessToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
```

> `_retry` 플래그는 무한 갱신 루프를 방지합니다. 갱신 요청 자체가 401을 반환하면 재시도 없이 로그아웃 처리합니다.

---

## 6. 인증 API 함수

```tsx
// src/api/auth.ts
import { axiosInstance, axiosPrivate } from './axios';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: { id: number; email: string; name: string };
}

// 로그인: Access Token은 Body, Refresh Token은 HttpOnly Cookie로 수신
export const login = async (credentials: LoginCredentials): Promise<AuthResponse> => {
  const response = await axiosInstance.post('/auth/login', credentials, {
    withCredentials: true,
  });
  return response.data;
};

// 로그아웃: 서버에서 Refresh Token Cookie 만료 처리
export const logout = async (): Promise<void> => {
  await axiosPrivate.post('/auth/logout');
  sessionStorage.removeItem('accessToken');
};

// Access Token 수동 갱신 (앱 초기화 시 사용)
export const refreshAccessToken = async (): Promise<string> => {
  const response = await axiosInstance.post(
    '/auth/refresh',
    {},
    { withCredentials: true }
  );
  return response.data.accessToken;
};

// 내 정보 조회
export const getCurrentUser = async () => {
  const response = await axiosPrivate.get('/auth/me');
  return response.data;
};
```

---

## 7. Auth Context (전역 인증 상태)

```tsx
// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, logout as apiLogout, getCurrentUser, refreshAccessToken } from '../api/auth';
import type { LoginCredentials } from '../api/auth';

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser]       = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 앱 시작 시: 저장된 Access Token으로 사용자 정보 복구
  // 없으면 Refresh Token(Cookie)으로 새 Access Token 발급 시도
  useEffect(() => {
    const initAuth = async () => {
      try {
        let token = sessionStorage.getItem('accessToken');

        if (!token) {
          // 새로고침 후 sessionStorage가 비어있을 때
          // Refresh Token이 Cookie에 있으면 자동으로 재발급
          token = await refreshAccessToken();
          sessionStorage.setItem('accessToken', token);
        }

        const userData = await getCurrentUser();
        setUser(userData);
      } catch {
        // Refresh Token도 없거나 만료 → 비로그인 상태
        sessionStorage.removeItem('accessToken');
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const response = await apiLogin(credentials);
    sessionStorage.setItem('accessToken', response.accessToken);
    setUser(response.user);
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      sessionStorage.removeItem('accessToken');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, isLoading,
      isAuthenticated: !!user,
      login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
```

---

## 8. 로그인 페이지

```tsx
// src/pages/Login.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Login: React.FC = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-lg shadow space-y-6">
        <h2 className="text-center text-3xl font-bold text-gray-900">로그인</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              이메일
            </label>
            <input
              id="email" type="email" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              비밀번호
            </label>
            <input
              id="password" type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit" disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
```

---

## 9. Protected Route

인증되지 않은 사용자가 보호된 페이지에 접근하면 자동으로 로그인 페이지로 리다이렉트합니다.

```tsx
// src/components/ProtectedRoute.tsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // 초기 인증 확인 중 (새로고침 후 토큰 복구 대기)
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-500">로딩 중...</div>
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
```

---

## 10. 라우팅 설정 (App.tsx)

```tsx
// src/App.tsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login     from './pages/Login';
import Dashboard from './pages/Dashboard';

const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* 인증이 필요한 페이지 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          {/* 추가 protected routes here */}
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
```

---

## 11. 보안 고려사항

### XSS (Cross-Site Scripting) 방어

XSS는 악성 스크립트를 주입해 토큰을 탈취하는 공격입니다.

```tsx
// 사용자 입력 렌더링 시 반드시 sanitize
import DOMPurify from 'dompurify';

// ❌ 위험 — 사용자 입력을 그대로 렌더링
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// ✅ 안전
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

Access Token을 메모리나 sessionStorage에 저장하는 것만으로도 XSS 피해를 크게 줄일 수 있습니다. localStorage는 XSS로 탈취 가능하므로 토큰 저장에 사용하지 않는 것이 좋습니다.

### CSRF (Cross-Site Request Forgery) 방어

CSRF는 사용자가 의도하지 않은 요청을 서버에 보내는 공격입니다. Cookie에 Refresh Token을 저장할 때 필요한 방어 방법입니다.

```tsx
// 방법 1: SameSite Cookie 설정 (서버에서)
// Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict

// 방법 2: CSRF 토큰 함께 전송
axiosPrivate.interceptors.request.use((config) => {
  const csrfToken = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute('content');
  if (csrfToken) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
```

### 토큰 만료 전 자동 갱신

만료 직전에 미리 갱신해서 UX 중단 없이 세션을 유지할 수 있습니다.

```tsx
useEffect(() => {
  if (!accessToken) return;

  // Access Token 만료 1분 전 자동 갱신
  const REFRESH_BEFORE = 60 * 1000; // 1분
  const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15분

  const timer = setTimeout(async () => {
    try {
      const newToken = await refreshAccessToken();
      sessionStorage.setItem('accessToken', newToken);
    } catch {
      // 갱신 실패 시 로그아웃
      logout();
    }
  }, ACCESS_TOKEN_EXPIRY - REFRESH_BEFORE);

  return () => clearTimeout(timer);
}, [accessToken]);
```

### 프로덕션 체크리스트

```
보안
 ✅ Access Token 유효기간 15분~1시간으로 설정
 ✅ Refresh Token은 HttpOnly Cookie에 저장
 ✅ Cookie에 Secure + SameSite=Strict 설정
 ✅ HTTPS 사용 (필수)
 ✅ Payload에 민감 정보 포함 금지

구현
 ✅ Axios 인터셉터로 토큰 자동 갱신
 ✅ 동시 요청 중 갱신 중복 방지 (failedQueue)
 ✅ _retry 플래그로 무한 루프 방지
 ✅ 로그아웃 시 Access Token 삭제 + 서버에 Refresh Token 만료 요청
 ✅ 초기화 시 Refresh Token으로 Access Token 자동 복구
```

---

## 12. Vue.js에서의 구현 (Composition API)

React 외에 Vue 3에서도 동일한 패턴을 Composable로 구현할 수 있습니다.

```ts
// src/composables/useAuth.ts
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { login as apiLogin, logout as apiLogout } from '@/api/auth';

const user = ref<{ id: number; email: string; name: string } | null>(null);

export const useAuth = () => {
  const router = useRouter();
  const isAuthenticated = computed(() => !!user.value);

  const login = async (email: string, password: string) => {
    const response = await apiLogin({ email, password });
    sessionStorage.setItem('accessToken', response.accessToken);
    user.value = response.user;
    router.push('/dashboard');
  };

  const logout = async () => {
    try {
      await apiLogout();
    } finally {
      sessionStorage.removeItem('accessToken');
      user.value = null;
      router.push('/login');
    }
  };

  return { user, isAuthenticated, login, logout };
};
```

---

## 참고 자료

- [shingy 블로그 — 알아두면 쓸데있는 로그인 기능 구현 지식들](https://shingy.tistory.com/45)
- [프론트에서 안전하게 로그인 처리하기 by yaytomato](https://velog.io/@yaytomato/프론트에서-안전하게-로그인-처리하기)
- [JWT 토큰 인증이란? by inpa](https://inpa.tistory.com/559)
- Claude AI