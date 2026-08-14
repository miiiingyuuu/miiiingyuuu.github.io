---
title: "Vue.js 핵심 문법 정리"
date: "2026-08-14"
category: ["Frontend", "JavaScript"]
description: "Vue 3 Composition API 기반의 핵심 문법 정리. SFC 구조와 반응형 시스템(ref/computed/watch), 주요 디렉티브(v-bind·v-model·v-if·v-for), 컴포넌트 통신(Props·Emits·Slot), 생명주기 훅, Vue Router, Pinia 전역 상태 관리, Axios 비동기 통신, 환경변수와 GitHub Pages 배포까지 코드 예시와 함께 정리"
---

# Vue.js 핵심 문법 정리 — 디렉티브 · Composition API · Router · Pinia · Axios

---

## 0. Vue 3 SFC 기본 구조

Vue의 **SFC(Single-File Component)** 는 하나의 `.vue` 파일 안에 로직·화면·스타일을 모두 담는다.

```vue
<script setup>
// JavaScript 로직 (Composition API)
</script>

<template>
  <!-- 화면 구조 (HTML + Vue 디렉티브) -->
</template>

<style scoped>
/* 현재 컴포넌트에만 적용되는 스타일 */
</style>
```

`<script setup>`은 Vue 3의 **Composition API** 문법 설탕이다. 별도의 `setup()` 함수 없이 최상위에서 변수·함수를 선언하면 템플릿에서 바로 사용할 수 있다.

애플리케이션 진입점은 `main.js`다.

```js
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

---

## 1. 반응형 시스템 — ref와 reactive

### 1-1. ref()

`ref()`로 감싼 값은 변경 시 Vue가 감지해 DOM을 자동으로 다시 렌더링한다.

```vue
<script setup>
import { ref } from "vue";

let normalCount = 0;        // 일반 변수 — 변경해도 화면 갱신 없음
const vueCount = ref(0);    // 반응형 변수 — 변경 시 화면 자동 갱신
</script>

<template>
  <!-- 스크립트에서는 vueCount.value, 템플릿에서는 자동 언래핑 -->
  <button @click="vueCount++">{{ vueCount }}</button>
</template>
```

> 스크립트 블록에서는 `.value`로 접근하고, 템플릿에서는 `.value`를 생략한다.

### 1-2. computed() — 파생 상태 계산

`computed`는 기존 반응형 값에서 새로운 값을 계산한다. 의존하는 값이 변경될 때만 재계산되고 결과가 **캐시**된다.

```js
import { ref, computed } from "vue";

const weatherList = ref([...]);
const searchQuery = ref("");

const filteredList = computed(() => {
  const query = searchQuery.value.trim();
  if (!query) return weatherList.value;
  return weatherList.value.filter((item) => item.name.includes(query));
});
```

- 화면에 표시할 **파생 데이터**를 만들 때 사용한다.
- 메서드와 달리 의존값이 바뀌지 않으면 재실행하지 않는다.

### 1-3. watch() — 특정 상태 감시

지정한 반응형 값이 변경됐을 때 콜백을 실행한다. `ref` 자체를 감시 대상으로 전달한다 (`.value` 아님).

```js
import { watch } from "vue";

watch(selectedCity, (newVal, oldVal) => {
  console.log(`${oldVal} → ${newVal}`);
});
```

### 1-4. watchEffect() — 의존성 자동 추적

콜백 안에서 **읽은** 반응형 값을 Vue가 자동으로 추적한다. 컴포넌트 생성 시 즉시 한 번 실행된다.

```js
import { watchEffect } from "vue";

watchEffect(() => {
  console.log(`현재 검색어: ${searchQuery.value}`);
  // searchQuery.value를 읽으므로 자동으로 이 값을 감시
});
```

### computed · watch · watchEffect 비교

| API | 목적 | 반환값 | 실행 시점 |
| --- | --- | --- | --- |
| `computed` | 파생 상태 계산 | 반응형 값 | 의존값 변경 + 값이 필요할 때 |
| `watch` | 특정 상태 변경 후 부수 효과 | 없음 | 지정한 값이 변경된 후 |
| `watchEffect` | 의존성 자동 추적 + 부수 효과 | 없음 | 즉시 실행 후 의존값 변경 시 |

> **원칙**: 화면에 표시할 값 → `computed`, API 호출·로그 같은 부수 효과 → `watch` / `watchEffect`

---

## 2. 템플릿 문법

### 2-1. 보간법 {{ }}

`{{ }}` 안에 변수뿐 아니라 JavaScript 표현식도 사용할 수 있다.

```vue
<p>{{ message }}</p>
<p>{{ message.toUpperCase() }}</p>
<p>{{ isLoggedIn ? "로그인됨" : "로그아웃" }}</p>
```

---

## 3. 주요 디렉티브

### 3-1. v-html과 v-text

```vue
<p v-html="htmlString" />  <!-- 태그를 실제 HTML로 렌더링 -->
<p v-text="textString" />  <!-- 태그를 문자열로 출력 (보간법과 동일) -->
```

> ⚠️ `v-html`에 사용자 입력을 검증 없이 전달하면 **XSS 취약점**이 생긴다. 신뢰할 수 있는 데이터에만 사용해야 한다.

### 3-2. v-bind — 동적 속성 바인딩

HTML 속성을 반응형 데이터와 연결한다. 단축 문법은 `:`이다.

```vue
<a :href="url">링크</a>
<img :src="imageSrc" />
<button :disabled="isLoading">제출</button>

<!-- 클래스 바인딩: 객체 형식 -->
<p :class="{ 'text-danger': isWarning }">경고</p>

<!-- 클래스 바인딩: 배열 형식 -->
<div :class="[themeClass, isWarning ? 'border-red' : 'border-gray']"></div>

<!-- 스타일 바인딩 -->
<div :style="[baseStyle, { width: boxWidth + 'px' }]"></div>
```

Vue 3.4 이상에서는 속성 이름과 변수 이름이 같을 때 단축 문법을 사용할 수 있다.

```vue
<script setup>
const id = "user-card";
const src = "https://example.com/img.png";
</script>

<template>
  <div :id>           <!-- :id="id" 와 동일 -->
    <img :src />      <!-- :src="src" 와 동일 -->
  </div>
</template>
```

### 3-3. v-model — 양방향 바인딩

폼 입력 요소의 값과 반응형 상태를 양방향으로 연결한다.

```vue
<input v-model="searchQuery" />
<textarea v-model="content" />
<input type="checkbox" v-model="isAgreed" />  <!-- Boolean -->
<select v-model="selected" />
```

`v-model`의 내부 동작은 다음과 같다.

```vue
<!-- v-model은 아래의 단축 표현 -->
<input :value="searchQuery" @input="(e) => (searchQuery = e.target.value)" />
```

**v-model 수식어**

| 수식어 | 동작 |
| --- | --- |
| `.lazy` | `input` 대신 `change` 시점에 반영 |
| `.number` | 입력값을 숫자로 변환 |
| `.trim` | 앞뒤 공백 제거 |

```vue
<input v-model.trim.number="price" />
```

### 3-4. v-if · v-else-if · v-else

조건에 따라 DOM 요소를 **생성하거나 제거**한다.

```vue
<p v-if="score >= 90">A</p>
<p v-else-if="score >= 80">B</p>
<p v-else>C</p>
```

`<template>` 태그에 `v-if`를 붙이면 실제 DOM 없이 여러 요소를 하나의 조건으로 묶을 수 있다.

```vue
<template v-if="isLoaded">
  <h2>제목</h2>
  <p>내용</p>
</template>
```

### 3-5. v-show

DOM 요소는 유지하고 `display: none`만 토글한다.

```vue
<div v-show="isVisible">보였다 숨겨지는 요소</div>
```

**v-if vs v-show 선택 기준**

| | v-if | v-show |
| --- | --- | --- |
| DOM 처리 | 조건이 false면 DOM 제거 | DOM 유지, CSS만 변경 |
| 초기 비용 | 낮음 (false면 렌더링 안 함) | 높음 (항상 렌더링) |
| 전환 비용 | 높음 (매번 생성·제거) | 낮음 (CSS만 변경) |
| 적합한 경우 | 조건 변경이 드문 경우 | 자주 토글되는 UI |

### 3-6. v-for — 반복 렌더링

```vue
<!-- 배열 -->
<li v-for="(item, index) in items" :key="item.id">
  [{{ index }}] {{ item.name }}
</li>

<!-- 객체 -->
<li v-for="(value, key, index) in userInfo" :key="key">
  {{ key }}: {{ value }}
</li>
```

> `:key`는 Vue가 각 요소를 안정적으로 추적하기 위해 반드시 필요하다. 고유 ID가 있다면 배열 인덱스보다 ID를 사용하는 것이 좋다.

### 3-7. 그 외 디렉티브

| 디렉티브 | 역할 |
| --- | --- |
| `v-pre` | Vue 컴파일을 건너뜀 — `{{ }}` 를 문자열 그대로 출력 |
| `v-cloak` | 마운트 전 템플릿 노출 방지 (`[v-cloak] { display: none }` 과 함께 사용) |
| `v-once` | 최초 한 번만 렌더링, 이후 상태 변경에도 고정 |
| `v-memo` | 지정한 의존성 배열이 변경될 때만 해당 영역 갱신 |

---

## 4. 이벤트 처리

`v-on`의 단축 문법은 `@`이다.

```vue
<button @click="count++">인라인 연산</button>
<button @click="handleClick">함수 호출</button>
<button @click="handleClick('Alice', $event)">인자 + 이벤트 전달</button>
```

```js
const handleClick = (name, event) => {
  console.log(name, event.target.tagName);
};
```

**이벤트 수식어**

| 수식어 | 역할 |
| --- | --- |
| `.prevent` | `event.preventDefault()` — 기본 동작 방지 |
| `.stop` | `event.stopPropagation()` — 버블링 차단 |
| `.once` | 이벤트를 한 번만 처리 |
| `.self` | 이벤트 발생 요소가 자기 자신일 때만 처리 |

```vue
<a href="https://vuejs.org" @click.prevent="handleLink">링크</a>
<button @click.stop="showDetail">상세보기</button> <!-- 부모로 버블링 방지 -->
```

---

## 5. 컴포넌트 통신

### 5-1. Props — 부모 → 자식 데이터 전달

```vue
<!-- 부모 -->
<WeatherCard :city-item="selectedCity" :is-selected="true" />
```

```vue
<!-- 자식 WeatherCard.vue -->
<script setup>
defineProps({
  cityItem: { type: Object, required: true },
  isSelected: { type: Boolean, default: false },
});
</script>

<template>
  <div>{{ cityItem.name }}</div>
</template>
```

> 자식은 전달받은 prop을 **직접 수정하지 않는다**. 변경이 필요하면 emit으로 부모에게 알린다.

### 5-2. Emits — 자식 → 부모 이벤트 전달

```vue
<!-- 자식 SearchBar.vue -->
<script setup>
defineProps({ currentQuery: { type: String, default: "" } });

const emit = defineEmits(["update-query"]);
</script>

<template>
  <input
    :value="currentQuery"
    @input="emit('update-query', $event.target.value)"
  />
</template>
```

```vue
<!-- 부모 -->
<SearchBar
  :current-query="searchQuery"
  @update-query="(val) => (searchQuery = val)"
/>
```

**단방향 데이터 흐름 원칙**

```
부모 상태 ──── props ────▶ 자식 (읽기만)
부모 함수 ◀─── emits ──── 자식 (변경 요청)
```

### 5-3. Slot — 템플릿 조합

Slot은 부모가 자식 컴포넌트의 특정 위치에 템플릿을 삽입하는 기능이다. Props가 데이터를 전달한다면, Slot은 **화면 구조**를 유연하게 조합한다.

**기본 슬롯**

```vue
<!-- 자식 BaseCard.vue -->
<template>
  <section class="card">
    <slot />  <!-- 부모가 삽입할 위치 -->
  </section>
</template>
```

```vue
<!-- 부모 -->
<BaseCard>
  <h3>카드 제목</h3>
  <p>카드 내용</p>
</BaseCard>
```

**이름 있는 슬롯**

```vue
<!-- 자식 -->
<template>
  <header><slot name="header" /></header>
  <main><slot /></main>
  <footer><slot name="footer" /></footer>
</template>
```

```vue
<!-- 부모 -->
<BaseLayout>
  <template #header><h1>제목</h1></template>
  <p>본문 내용</p>
  <template #footer><p>푸터</p></template>
</BaseLayout>
```

**범위 슬롯 (Scoped Slot)** — 자식의 데이터를 부모 템플릿에서 사용

```vue
<!-- 자식 -->
<slot :item="currentItem" />

<!-- 부모 -->
<template #default="{ item }">
  <p>{{ item.name }}</p>
</template>
```

---

## 6. 생명주기 훅

컴포넌트는 생성 → 마운트 → 업데이트 → 언마운트 단계를 거친다.

```vue
<script setup>
import { onMounted, onUnmounted, onUpdated } from "vue";

onMounted(() => {
  // DOM에 연결된 직후 — API 초기 호출, DOM 접근
  fetchWeatherData();
});

onUpdated(() => {
  // 반응형 변경으로 DOM이 갱신된 직후
});

onUnmounted(() => {
  // 컴포넌트 제거 직후 — 타이머, 이벤트 리스너 반드시 정리
  clearInterval(timer);
  window.removeEventListener("resize", handleResize);
});
</script>
```

| 훅 | 실행 시점 | 주요 용도 |
| --- | --- | --- |
| `onBeforeMount` | DOM 연결 직전 | 마운트 전 상태 확인 |
| `onMounted` | DOM 연결 직후 | **초기 데이터 요청, DOM 접근** |
| `onBeforeUpdate` | DOM 갱신 직전 | 갱신 전 상태 확인 |
| `onUpdated` | DOM 갱신 직후 | 갱신된 DOM 후속 처리 |
| `onBeforeUnmount` | 제거 직전 | 정리 준비 |
| `onUnmounted` | 제거 직후 | **타이머·이벤트 리스너 해제** |

> 타이머나 전역 이벤트를 등록했다면 반드시 `onUnmounted`에서 해제해야 메모리 누수를 방지할 수 있다.

---

## 7. Vue Router

Vue Router는 URL과 컴포넌트를 연결한다. `createApp`에 플러그인으로 등록한다.

```js
// router/index.js
import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", name: "Home", component: HomeView },
  {
    path: "/about",
    name: "About",
    component: () => import("../views/AboutView.vue"), // 지연 로딩
  },
  {
    path: "/weather/:cityId", // 동적 파라미터
    name: "WeatherDetail",
    component: () => import("../views/WeatherDetailView.vue"),
  },
  {
    path: "/:pathMatch(.*)*", // Catch-all — 404 처리
    name: "NotFound",
    component: () => import("../views/NotFoundView.vue"),
  },
];

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
```

### 7-1. RouterLink와 RouterView

```vue
<!-- 새로고침 없이 SPA 방식으로 이동 -->
<RouterLink to="/about">소개</RouterLink>
<RouterLink :to="{ name: 'WeatherDetail', params: { cityId: 'seoul' } }">
  서울 날씨
</RouterLink>

<!-- 현재 경로에 맞는 View 렌더링 위치 -->
<RouterView />
```

### 7-2. 코드에서 라우팅

```js
import { useRouter, useRoute } from "vue-router";

const router = useRouter();
const route = useRoute();

// 이동
router.push({ name: "WeatherDetail", params: { cityId: item.id } });

// 현재 params 읽기
const cityId = route.params.cityId;

// query string 사용 (검색어 URL에 보존)
router.push({ path: route.path, query: { search: query || undefined } });
const currentSearch = route.query.search;
```

**Params vs Query**

| | params | query |
| --- | --- | --- |
| URL 형태 | `/weather/seoul` | `/weather?search=서울` |
| 용도 | 자원 식별자 | 필터·정렬 같은 부가 상태 |
| 라우트 정의 | `/:cityId` 필요 | 불필요 |

> 라우트 이름으로 이동하면 나중에 URL 구조가 바뀌어도 호출부 변경을 줄일 수 있다.

---

## 8. Pinia — 전역 상태 관리

Props/Emits는 인접한 컴포넌트 사이에 적합하다. 멀리 떨어진 여러 컴포넌트가 같은 값을 공유해야 할 때 **Pinia store**를 사용한다.

```js
// main.js
import { createPinia } from "pinia";
app.use(createPinia());
```

### Store 정의

```js
// stores/configStore.js
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useConfigStore = defineStore("config", () => {
  // State — 공유하는 원본 상태
  const unit = ref("celsius");

  // Getter — State에서 계산한 파생 상태
  const unitSymbol = computed(() =>
    unit.value === "celsius" ? "°C" : "°F"
  );

  // Action — State를 변경하는 함수
  function toggleUnit() {
    unit.value = unit.value === "celsius" ? "fahrenheit" : "celsius";
  }

  return { unit, unitSymbol, toggleUnit };
});
```

### Store 사용

```vue
<script setup>
import { useConfigStore } from "@/stores/configStore";
import { computed } from "vue";

const configStore = useConfigStore();

// 단위에 따라 표시 온도 계산
const displayTemp = computed(() => {
  const raw = props.cityItem.temp; // 항상 섭씨로 저장된 원본
  if (configStore.unit === "fahrenheit") {
    return Math.round((raw * 9) / 5 + 32);
  }
  return raw;
});
</script>

<template>
  <p>{{ displayTemp }} {{ configStore.unitSymbol }}</p>
  <button @click="configStore.toggleUnit()">단위 전환</button>
</template>
```

> **원칙**: 원본 데이터는 원래 단위(섭씨)로 유지하고, 화면 표시용 값만 `computed`로 변환한다. 비즈니스 규칙(25도 이상이면 "더움")은 원본 기준으로 유지해야 단위 변경에 영향받지 않는다.

---

## 9. Axios — 비동기 HTTP 통신

Axios는 Promise 기반 HTTP 클라이언트로, Fetch API와 달리 JSON 응답이 `response.data`에 바로 담겨 있다.

### 9-1. 기본 GET 요청

```js
import axios from "axios";

const response = await axios.get("https://api.example.com/data", {
  params: { q: "Seoul", units: "metric" }, // 쿼리 파라미터 자동 조합
});

console.log(response.data); // 응답 데이터
```

### 9-2. 로딩·성공·실패 상태 관리

비동기 통신 화면은 데이터뿐 아니라 **loading · error · empty** 상태도 함께 설계해야 한다.

```js
const data = ref(null);
const isLoading = ref(false);
const errorMessage = ref("");

const fetchData = async () => {
  isLoading.value = true;
  errorMessage.value = "";

  try {
    const response = await axios.get(API_URL);
    data.value = response.data;
  } catch (error) {
    errorMessage.value = "데이터를 불러오지 못했습니다.";
    console.error(error);
  } finally {
    isLoading.value = false; // 성공·실패 모두 로딩 종료
  }
};
```

```vue
<template>
  <div v-if="isLoading">로딩 중...</div>
  <div v-else-if="errorMessage">{{ errorMessage }}</div>
  <template v-else>
    <!-- 정상 데이터 화면 -->
  </template>
</template>
```

### 9-3. HTTP 메서드별 사용법

```js
// GET — 조회
await axios.get(url, { params });

// POST — 생성
await axios.post(url, { title: "새 글", body: "내용" });

// PUT — 수정
await axios.put(`${url}/${id}`, { title: "수정된 글" });

// DELETE — 삭제
await axios.delete(`${url}/${id}`);
```

### 9-4. Promise.all — 병렬 요청

서로 독립적인 여러 요청을 동시에 보내 전체 대기 시간을 줄인다.

```js
const cities = ["Seoul", "Busan", "Jeju"];

const responses = await Promise.all(
  cities.map((city) =>
    axios.get(API_URL, { params: { q: city, appid: API_KEY, units: "metric" } })
  )
);

const weatherList = responses.map((res) => res.data);
```

---

## 10. 환경변수와 보안

API 키는 소스 코드에 직접 작성하지 않고 Git에서 제외되는 `.env.local`에 저장한다.

```bash
# .env.local (Git에서 제외)
VITE_OPENWEATHER_API_KEY=발급받은_API_키
```

```js
// 코드에서 읽기
const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
```

> **주의**: Vite의 `VITE_` 변수는 브라우저 번들에 포함된다. 완전한 비밀 저장소가 아니므로 실제 서비스에서는 API 제공자의 도메인 제한이나 백엔드 프록시를 함께 고려해야 한다.

`.env.example`에는 변수 이름만 남겨 다른 개발자가 필요한 설정을 알 수 있도록 한다.

```bash
# .env.example
VITE_OPENWEATHER_API_KEY=
```

---

## 11. 프로덕션 빌드와 GitHub Pages 배포

### 빌드

```bash
npm run lint    # 정적 분석
npm run build   # 프로덕션 빌드 → dist/ 생성
npm run preview # 빌드 결과 로컬 미리보기
```

### GitHub Pages 경로 설정

GitHub Pages는 프로젝트 이름이 기본 경로가 되므로 Vite와 Router에 같은 `base`를 지정해야 한다.

```js
// vite.config.js
export default defineConfig({
  base: "/my-project/",
});

// router/index.js
createWebHistory(import.meta.env.BASE_URL);
```

### SPA 새로고침 문제 해결

SPA에서 `/about` 같은 하위 경로를 직접 열거나 새로고침하면 서버가 해당 파일을 찾지 못해 404가 발생한다. 이를 막기 위해 배포 환경에 맞는 설정을 추가한다.

```text
# Netlify: public/_redirects
/* /index.html 200

# Vercel: vercel.json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

`gh-pages` 패키지를 사용하면 `dist` 결과물을 원격 `gh-pages` 브랜치에 자동으로 게시한다.

---

## 12. 스타일 스코핑

`<style scoped>`를 사용하면 스타일이 현재 컴포넌트에만 적용된다. Vue가 고유 속성(예: `data-v-xxxxxx`)을 요소에 자동으로 추가한다.

```vue
<style scoped>
.title { color: tomato; }
/* 컴파일 결과: .title[data-v-xxxxxx] { color: tomato; } */
</style>
```

여러 컴포넌트가 공유하는 스타일은 외부 CSS 파일로 분리한다.

```vue
<style src="./assets/global.css"></style>
```

---

## 핵심 개념 한줄 요약

| 개념 | 한줄 요약 |
| --- | --- |
| **SFC** | 로직·화면·스타일을 하나의 `.vue` 파일에서 관리 |
| **ref()** | 변경 시 화면을 자동으로 갱신하는 반응형 값 |
| **computed** | 반응형 값에서 캐시된 파생 데이터 계산 |
| **watch** | 특정 상태 변경 시 부수 효과 실행 |
| **watchEffect** | 콜백 안에서 사용한 의존성을 자동 추적해 부수 효과 실행 |
| **v-bind (:)** | HTML 속성을 반응형 데이터와 동적으로 연결 |
| **v-model** | 폼 입력과 상태의 양방향 바인딩 |
| **v-if / v-show** | DOM 제거 vs CSS 토글로 조건부 표시 |
| **v-for + :key** | 배열·객체를 반복 렌더링, key로 안정적 추적 |
| **Props** | 부모 → 자식 단방향 데이터 전달 |
| **Emits** | 자식 → 부모 이벤트 상향 통신 |
| **Slot** | 부모가 자식 컴포넌트 내부에 템플릿을 삽입 |
| **생명주기 훅** | 컴포넌트 마운트·갱신·언마운트 시점에 로직 실행 |
| **Vue Router** | URL과 View를 연결하는 SPA 라우팅 |
| **Pinia** | 멀리 떨어진 컴포넌트 간 공유 상태 관리 |
| **Axios** | Promise 기반 HTTP 클라이언트, 응답은 `response.data` |

---

## 📎 참고 자료

- [Vue 3 공식 문서](https://vuejs.org/)
- [Vue Router 공식 문서](https://router.vuejs.org/)
- [Pinia 공식 문서](https://pinia.vuejs.org/)
- [Axios 공식 문서](https://axios-http.com/)
- [Element Plus](https://element-plus.org/)
- [Vite 공식 문서](https://vitejs.dev/)
