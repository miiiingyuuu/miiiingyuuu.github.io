---
title: "JavaScript 코딩테스트 대비"
date: "2025-10-29"
category: ["JavaScript", "Algorithm"]
description: "C++, Python으로 코딩테스트를 준비하다 JavaScript로 전환할 때 반드시 알아야 할 핵심 문법 차이점과, 자료구조·알고리즘별 JS 구현 틀을 한 곳에 정리. 입출력 처리부터 정렬, BFS/DFS, DP, 그리디까지 바로 가져다 쓸 수 있는 템플릿 정리"
---

# C++/Python 개발자를 위한 코딩테스트 JavaScript 전환 가이드

---

## 0. 전환 전 핵심 주의사항

| | C++ | Python | **JavaScript** |
|---|---|---|---|
| 정수 오버플로우 | 있음 (long long) | 없음 | **있음** (`Number.MAX_SAFE_INTEGER` = 2^53-1) |
| 기본 정렬 | `sort()` 오름차순 | `sort()` 오름차순 | **`sort()`가 문자열 정렬** ← 함정! |
| 나머지 연산 음수 | 음수 가능 | 항상 양수 | **음수 가능** (`-7 % 3 === -1`) |
| 배열 선언 | 타입 고정 | 동적 | 동적 |
| 큐 | `queue<>` | `deque` | **직접 구현 필요** |
| 우선순위 큐 | `priority_queue<>` | `heapq` | **직접 구현 필요** |

> ⚠️ JS 코딩테스트의 3대 함정: **sort 기본 동작**, **BigInt 필요 여부**, **입출력 처리**

---

## 1. 입출력 처리

### 백준 / 프로그래머스 형식

```javascript
// 백준 스타일 (Node.js readline)
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const lines = [];
rl.on('line', (line) => {
  lines.push(line.trim());
});
rl.on('close', () => {
  // 여기서 로직 작성
  const n = parseInt(lines[0]);
  const arr = lines[1].split(' ').map(Number);
  
  console.log(solution(n, arr));
});
```

```javascript
// 프로그래머스 스타일 (함수형)
function solution(param1, param2) {
  // 바로 로직 작성
  return answer;
}
```

### 자주 쓰는 입력 파싱

```javascript
// 정수 한 줄
const n = parseInt(lines[0]);

// 공백으로 구분된 정수 배열
const arr = lines[0].split(' ').map(Number);

// n줄의 2D 배열
const grid = [];
for (let i = 0; i < n; i++) {
  grid.push(lines[i].split(' ').map(Number));
}

// 출력
console.log(answer);
process.stdout.write(answer + '\n'); // 개행 없이 출력
```

---

## 2. 핵심 문법 정리

### 2-1. 변수 선언

```javascript
let x = 10;          // 재할당 가능
const y = 20;        // 재할당 불가 (객체 내부는 변경 가능)
// var는 사용 금지 — 함수 스코프라 버그 유발
```

### 2-2. 배열 (Array)

```javascript
// 선언 및 초기화
const arr = [1, 2, 3];
const zeros = new Array(5).fill(0);           // [0, 0, 0, 0, 0]
const matrix = Array.from({length: 3}, () => new Array(3).fill(0)); // 2D 배열

// 주요 메서드
arr.push(4);          // 뒤에 추가 → O(1)
arr.pop();            // 뒤에서 제거 → O(1)
arr.unshift(0);       // 앞에 추가 → O(n) ← 느림
arr.shift();          // 앞에서 제거 → O(n) ← 느림
arr.splice(1, 2);     // index 1부터 2개 제거
arr.slice(1, 3);      // index 1~2 추출 (원본 불변)

// 순회
arr.forEach((val, idx) => { /* ... */ });
const doubled = arr.map(x => x * 2);
const evens = arr.filter(x => x % 2 === 0);
const sum = arr.reduce((acc, cur) => acc + cur, 0);

// ⚠️ 정렬 주의: 반드시 비교 함수 전달
arr.sort((a, b) => a - b);   // 오름차순 (숫자)
arr.sort((a, b) => b - a);   // 내림차순 (숫자)
// arr.sort() 만 쓰면 [10, 9, 2] → [10, 2, 9] 로 잘못 정렬됨!
```

### 2-3. 문자열

```javascript
const s = "hello";
s.length;                    // 5
s[0];                        // 'h'
s.includes('ell');           // true
s.indexOf('l');              // 2
s.split('');                 // ['h','e','l','l','o']
s.split('l');                // ['he','','o']
s.substring(1, 3);           // 'el'
s.toUpperCase();             // 'HELLO'
s.replace('l', 'r');         // 'herlo' (첫 번째만)
s.replaceAll('l', 'r');      // 'herro'

// 문자 ↔ 아스키코드
'A'.charCodeAt(0);           // 65
String.fromCharCode(65);     // 'A'

// 문자열은 불변 → 수정 시 배열로 변환 후 join
const chars = s.split('');
chars[0] = 'H';
const result = chars.join(''); // 'Hello'
```

### 2-4. 객체 / Map / Set

```javascript
// 객체 (해시맵 대용)
const obj = {};
obj['key'] = 1;
'key' in obj;           // true
delete obj['key'];
Object.keys(obj);       // 키 배열
Object.values(obj);     // 값 배열
Object.entries(obj);    // [키, 값] 쌍 배열

// Map (키 순서 보장, 더 명시적)
const map = new Map();
map.set('a', 1);
map.get('a');           // 1
map.has('a');           // true
map.delete('a');
map.size;               // 크기
for (const [k, v] of map) { /* ... */ }

// Set (중복 제거, O(1) 탐색)
const set = new Set([1, 2, 2, 3]);  // {1, 2, 3}
set.add(4);
set.has(2);             // true
set.delete(2);
set.size;               // 크기
const unique = [...new Set(arr)];   // 배열 중복 제거
```

### 2-5. 구조 분해 & 스프레드

```javascript
// 배열 구조 분해
const [a, b, ...rest] = [1, 2, 3, 4];  // a=1, b=2, rest=[3,4]

// 객체 구조 분해
const { x, y } = { x: 1, y: 2 };

// 스프레드 (깊은 복사 아님! 1depth만)
const copy = [...arr];
const merged = [...arr1, ...arr2];

// 2D 배열 깊은 복사
const deepCopy = arr.map(row => [...row]);
```

### 2-6. 숫자 관련 주의사항

```javascript
// 무한대
Infinity;   -Infinity;

// 안전한 정수 범위
Number.MAX_SAFE_INTEGER;  // 9007199254740991 (2^53 - 1)

// 큰 수 처리 (BigInt)
const big = BigInt("1000000000000000000");
const big2 = 1000000000000000000n;  // n 접미사

// 나머지 음수 처리
const mod = (n, m) => ((n % m) + m) % m;  // 항상 양수 보장

// 소수점 내림/올림
Math.floor(3.7);   // 3
Math.ceil(3.2);    // 4
Math.round(3.5);   // 4
parseInt(3.7);     // 3 (양수만)
```

---

## 3. 자료구조 구현 템플릿

### 3-1. 스택 (Stack)

```javascript
// 배열로 그대로 사용
const stack = [];
stack.push(1);      // push
stack.pop();        // pop (뒤에서)
stack[stack.length - 1]; // peek
stack.length === 0; // isEmpty
```

### 3-2. 큐 (Queue)

```javascript
// ⚠️ shift()는 O(n) → 큰 입력에서 TLE 발생 가능
// 소규모: 배열 사용
const queue = [];
queue.push(1);
queue.shift();  // dequeue

// 대규모: 포인터 방식 O(1) 큐
class Queue {
  constructor() {
    this.data = {};
    this.head = 0;
    this.tail = 0;
  }
  push(val) { this.data[this.tail++] = val; }
  shift() {
    if (this.isEmpty()) return undefined;
    const val = this.data[this.head];
    delete this.data[this.head++];
    return val;
  }
  front() { return this.data[this.head]; }
  isEmpty() { return this.head === this.tail; }
  get size() { return this.tail - this.head; }
}
```

### 3-3. 우선순위 큐 / 힙 (Min Heap)

```javascript
class MinHeap {
  constructor() { this.heap = []; }

  push(val) {
    this.heap.push(val);
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 1) return this.heap.pop();
    const min = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._sinkDown(0);
    return min;
  }

  peek() { return this.heap[0]; }
  get size() { return this.heap.length; }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.heap[parent] <= this.heap[i]) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.heap[l] < this.heap[smallest]) smallest = l;
      if (r < n && this.heap[r] < this.heap[smallest]) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}

// 사용 예시
const pq = new MinHeap();
pq.push(3); pq.push(1); pq.push(2);
pq.pop(); // 1

// Max Heap: push/pop에서 부등호만 반전
```

### 3-4. 연결 리스트 (필요 시)

```javascript
class ListNode {
  constructor(val) {
    this.val = val;
    this.next = null;
  }
}

// 배열 → 연결 리스트
function arrayToList(arr) {
  const dummy = new ListNode(0);
  let cur = dummy;
  for (const v of arr) {
    cur.next = new ListNode(v);
    cur = cur.next;
  }
  return dummy.next;
}
```

---

## 4. 알고리즘 템플릿

### 4-1. BFS (너비 우선 탐색)

```javascript
function bfs(graph, start) {
  const visited = new Set([start]);
  const queue = [start]; // 소규모면 배열, 대규모면 Queue 클래스 사용
  let head = 0;

  while (head < queue.length) {
    const node = queue[head++];

    for (const next of graph[node]) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
}

// 2D 그리드 BFS (최단 경로)
function bfsGrid(grid, startR, startC) {
  const n = grid.length, m = grid[0].length;
  const dist = Array.from({length: n}, () => new Array(m).fill(-1));
  const dr = [-1, 1, 0, 0];
  const dc = [0, 0, -1, 1];

  dist[startR][startC] = 0;
  const queue = [[startR, startC]];
  let head = 0;

  while (head < queue.length) {
    const [r, c] = queue[head++];

    for (let d = 0; d < 4; d++) {
      const nr = r + dr[d], nc = c + dc[d];
      if (nr < 0 || nr >= n || nc < 0 || nc >= m) continue;
      if (grid[nr][nc] === 0 || dist[nr][nc] !== -1) continue; // 벽 or 방문
      dist[nr][nc] = dist[r][c] + 1;
      queue.push([nr, nc]);
    }
  }
  return dist;
}
```

### 4-2. DFS (깊이 우선 탐색)

```javascript
// 재귀 DFS
function dfs(graph, node, visited = new Set()) {
  visited.add(node);

  for (const next of graph[node]) {
    if (!visited.has(next)) {
      dfs(graph, next, visited);
    }
  }
}

// 스택 DFS (재귀 깊이 제한 우회용)
function dfsIterative(graph, start) {
  const visited = new Set([start]);
  const stack = [start];

  while (stack.length > 0) {
    const node = stack.pop();

    for (const next of graph[node]) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
}

// 2D 그리드 DFS
function dfsGrid(grid, r, c, visited) {
  const n = grid.length, m = grid[0].length;
  if (r < 0 || r >= n || c < 0 || c >= m) return;
  if (visited[r][c] || grid[r][c] === 0) return;

  visited[r][c] = true;
  dfsGrid(grid, r - 1, c, visited);
  dfsGrid(grid, r + 1, c, visited);
  dfsGrid(grid, r, c - 1, visited);
  dfsGrid(grid, r, c + 1, visited);
}
```

### 4-3. 다이나믹 프로그래밍 (DP)

```javascript
// 1D DP (최장 증가 수열 LIS - O(n²))
function lis(arr) {
  const n = arr.length;
  const dp = new Array(n).fill(1);

  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (arr[j] < arr[i]) {
        dp[i] = Math.max(dp[i], dp[j] + 1);
      }
    }
  }
  return Math.max(...dp);
}

// 2D DP (냅색 - 0/1 Knapsack)
function knapsack(weights, values, capacity) {
  const n = weights.length;
  // dp[i][w] = i번째 물건까지 고려했을 때 무게 w 이하에서 최대 가치
  const dp = Array.from({length: n + 1}, () => new Array(capacity + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i-1][w]; // 안 담는 경우
      if (weights[i-1] <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i-1][w - weights[i-1]] + values[i-1]);
      }
    }
  }
  return dp[n][capacity];
}

// 메모이제이션 패턴
function dp(n, memo = new Map()) {
  if (n <= 1) return n;
  if (memo.has(n)) return memo.get(n);
  const result = dp(n - 1, memo) + dp(n - 2, memo);
  memo.set(n, result);
  return result;
}
```

### 4-4. 이분 탐색 (Binary Search)

```javascript
// 기본 이분 탐색 (값 찾기)
function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] === target) return mid;
    else if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

// Lower Bound (target 이상인 첫 번째 인덱스)
function lowerBound(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Upper Bound (target 초과인 첫 번째 인덱스)
function upperBound(arr, target) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// 파라메트릭 서치 (조건을 만족하는 최솟값/최댓값)
function parametricSearch(lo, hi, check) {
  // check(mid) === true인 최솟값 구하기
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (check(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
```

### 4-5. 유니온 파인드 (Union-Find)

```javascript
class UnionFind {
  constructor(n) {
    this.parent = Array.from({length: n}, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // 경로 압축
    }
    return this.parent[x];
  }

  union(x, y) {
    const px = this.find(x), py = this.find(y);
    if (px === py) return false;
    // 랭크 기반 합치기
    if (this.rank[px] < this.rank[py]) this.parent[px] = py;
    else if (this.rank[px] > this.rank[py]) this.parent[py] = px;
    else { this.parent[py] = px; this.rank[px]++; }
    return true;
  }

  isConnected(x, y) { return this.find(x) === this.find(y); }
}

// 사용 예시
const uf = new UnionFind(5);
uf.union(0, 1);
uf.union(1, 2);
uf.isConnected(0, 2); // true
```

### 4-6. 다익스트라 (Dijkstra)

```javascript
function dijkstra(graph, start, n) {
  // graph[u] = [[v, weight], ...]
  const dist = new Array(n).fill(Infinity);
  dist[start] = 0;
  const pq = new MinHeap(); // 위에서 정의한 MinHeap (커스텀 비교 필요)
  
  // [거리, 노드] 형태로 저장
  // 간단 구현을 위해 배열 정렬 방식 사용 (n이 작을 때)
  const queue = [[0, start]];
  
  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]); // MinHeap으로 교체 권장
    const [d, u] = queue.shift();
    
    if (d > dist[u]) continue; // 이미 처리된 노드
    
    for (const [v, w] of graph[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        queue.push([dist[v], v]);
      }
    }
  }
  return dist;
}
```

### 4-7. 그리디 / 정렬 기반

```javascript
// 인터벌 스케줄링 (종료 시간 기준 정렬)
function intervalScheduling(intervals) {
  intervals.sort((a, b) => a[1] - b[1]); // 종료 시간 오름차순
  let count = 0, end = -Infinity;

  for (const [s, e] of intervals) {
    if (s >= end) {
      count++;
      end = e;
    }
  }
  return count;
}
```

### 4-8. 투 포인터 / 슬라이딩 윈도우

```javascript
// 합이 target인 부분 배열 길이 최솟값
function minSubarrayLen(arr, target) {
  let left = 0, sum = 0, minLen = Infinity;

  for (let right = 0; right < arr.length; right++) {
    sum += arr[right];
    while (sum >= target) {
      minLen = Math.min(minLen, right - left + 1);
      sum -= arr[left++];
    }
  }
  return minLen === Infinity ? 0 : minLen;
}

// 고정 크기 슬라이딩 윈도우
function slidingWindow(arr, k) {
  let windowSum = arr.slice(0, k).reduce((a, b) => a + b, 0);
  let maxSum = windowSum;

  for (let i = k; i < arr.length; i++) {
    windowSum += arr[i] - arr[i - k];
    maxSum = Math.max(maxSum, windowSum);
  }
  return maxSum;
}
```

---

## 5. 자주 쓰는 유틸 스니펫

```javascript
// 최대공약수 (GCD)
const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);

// 최소공배수 (LCM)
const lcm = (a, b) => (a / gcd(a, b)) * b;

// 소수 판별
function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i <= Math.sqrt(n); i++) {
    if (n % i === 0) return false;
  }
  return true;
}

// 에라토스테네스의 체
function sieve(n) {
  const isPrime = new Array(n + 1).fill(true);
  isPrime[0] = isPrime[1] = false;
  for (let i = 2; i * i <= n; i++) {
    if (isPrime[i]) {
      for (let j = i * i; j <= n; j += i) {
        isPrime[j] = false;
      }
    }
  }
  return isPrime;
}

// 조합 (nCr)
function combination(n, r) {
  if (r === 0 || r === n) return 1;
  if (r > n - r) r = n - r; // 최적화
  let result = 1;
  for (let i = 0; i < r; i++) {
    result = result * (n - i) / (i + 1);
  }
  return result;
}

// 배열 합계
const sum = arr => arr.reduce((a, b) => a + b, 0);

// 배열 최대/최소
const max = arr => Math.max(...arr);  // 크기 제한 있음
const maxSafe = arr => arr.reduce((a, b) => Math.max(a, b));  // 큰 배열용

// 2D 배열 회전 (90도 시계방향)
function rotate90(matrix) {
  const n = matrix.length;
  return Array.from({length: n}, (_, i) =>
    Array.from({length: n}, (_, j) => matrix[n - 1 - j][i])
  );
}

// 숫자 ↔ 자릿수 배열
const digits = n => String(n).split('').map(Number);
const fromDigits = arr => parseInt(arr.join(''));
```

---

## 6. C++ / Python → JS 빠른 대응 표

| C++ / Python | JavaScript |
|---|---|
| `cin >> n` | `const n = parseInt(lines[i])` |
| `vector<int>` | `[]` or `new Array(n)` |
| `map<int,int>` | `new Map()` or `{}` |
| `set<int>` | `new Set()` |
| `sort(v.begin(), v.end())` | `arr.sort((a,b) => a-b)` |
| `queue<int>` | 배열 + head 포인터 or Queue 클래스 |
| `priority_queue` | MinHeap 클래스 |
| `INT_MAX` / `float('inf')` | `Infinity` |
| `abs(-3)` | `Math.abs(-3)` |
| `max(a, b)` | `Math.max(a, b)` |
| `printf("%.2f", x)` | `x.toFixed(2)` |
| `memset(dp, 0, sizeof(dp))` | `new Array(n).fill(0)` |
| `auto [a,b] = pair` | `const [a, b] = arr` |

---

## 7. 시간복잡도별 JS 허용 입력 크기 (참고)

| 시간복잡도 | 허용 n 크기 | 예시 알고리즘 |
|---|---|---|
| O(n!) | n ≤ 10 | 순열 완전탐색 |
| O(2^n) | n ≤ 25 | 부분집합 완전탐색 |
| O(n³) | n ≤ 300 | 플로이드-워셜 |
| O(n²) | n ≤ 5,000 | DP, 버블정렬 |
| O(n log n) | n ≤ 500만 | 정렬, 힙 |
| O(n) | n ≤ 1억 | 선형 탐색 |

> JS는 C++보다 약 3~5배 느리므로, 시간 제한이 타이트하면 알고리즘 효율에 더 신경 쓸 것

---

*참고: 이 문서의 MinHeap은 숫자 기준 비교이므로 객체 저장 시 생성자에서 비교 함수를 파라미터로 받도록 확장할 것.*