---
title: "[스터디] SDD(Spec-kit)"
date: "2026-05-27"
category: ["AI", "Architecture"]
description: "카카오페이 AI 플랫폼팀의 SDD(Spec-Driven Development) 도입 실전기를 정리. 무분별한 코드 생성과 환각 문제를 해결하기 위해 Spec-kit을 활용한 constitution → specify → plan → tasks → implement 파이프라인과 팀 단위 협업에서의 일관성 확보 전략을 분석"
---

# 카카오페이 SDD — Spec-kit으로 제어하는 에이전틱 코딩

> 원문: [SDD (spec-kit) 에이전트 코딩 실전기 | 카카오페이 기술 블로그](https://tech.kakaopay.com/post/ifkakao-agentic-coding/)  
> 작성자: wayne (카카오페이 AI 플랫폼팀)

---

## 🎯 한 줄 요약

에이전틱 코딩이 고도화될수록 드러나는 **무분별한 코드 생성 + 환각** 문제를,
스펙을 먼저 정의하고 AI가 그 스펙을 따르게 만드는 **SDD(Spec-Driven Development)** 로 해결한 실전 사례.

---

## 1. 왜 SDD가 필요했는가?

카카오페이 AI 플랫폼팀은 AI Platform 구축 과정에서 에이전틱 코딩을 적극 활용했다.
초기에는 개발 기간 단축과 생산성 향상 효과를 실감했지만, 프로젝트가 고도화될수록 명확한 한계에 부딪혔다.

### 기존 에이전틱 코딩(Vibe Coding)의 문제점

| 문제 | 원인 |
|---|---|
| 여기저기 무분별하게 생성되는 코드 | 프롬프트만으로는 맥락 유지가 어려움 |
| 대화가 길어질수록 일관성 붕괴 | AI가 이전 코딩 패턴을 기억하지 못함 |
| 환각(Hallucination) 증가 | 구체적인 스펙 없이 추상적 지시만 반복 |
| 코드 검토·수정 시간 증가 | 예측 불가능한 AI 산출물 |

> **결론**: AI가 생성한 코드를 제어하려면 프롬프트 개선이 아니라 **개발 방법론 자체의 전환**이 필요하다.

---

## 2. SDD란 무엇인가?

**SDD(Spec-Driven Development)** 는 개발자가 AI에게 직접 지시를 내리는 대신,
먼저 정밀한 스펙을 정의하고 AI가 그 스펙을 따라 코드를 생성하도록 하는 방법론이다.

### 기존 방식 vs SDD 비교

```
[기존 에이전틱 코딩]
개발자 → (프롬프트) → AI → 코드 생성

[SDD 방식]
개발자 → (스펙 정의) → Spec-kit → (구조화된 프롬프트 자동 생성) → AI → 코드 생성
```

개발자의 역할이 **"AI에게 지시하는 사람"** 에서 **"스펙을 검증하고 테스트를 설계하는 사람"** 으로 전환된다.

---

## 3. Spec-kit 파이프라인

Spec-kit은 아래 단계를 순서대로 거치며, 마음에 안 드는 단계가 있으면 직접 수정하지 않고 **specify 단계로 돌아가 재정의**하는 것이 원칙이다.

```
constitution → specify ↔ clarify → plan → tasks → analyze → implement
```

### 3-1. Constitution (헌법 정의)

AI가 코드를 생성할 때 반드시 따라야 할 **최상위 규칙**을 정의하는 단계다.  
코드 스타일, 테스트 커버리지, 보안 요구사항, 문서화 기준 등을 포함한다.

- 프롬프트를 완벽하게 쓸 필요는 없다. 필요한 요소를 빠짐없이 나열하면 에이전트가 정리해준다.
- 생성된 `constitution.md`는 이후 모든 단계의 기준이 된다.

### 3-2. Specify (스펙 정의)

개발할 기능의 **구체적인 요구사항**을 작성하는 단계다.  
API 엔드포인트, 데이터 모델, 비즈니스 로직 등을 포함한다.

```bash
/speckit.specify
```

- 두서없이 요구사항을 최대한 많이 작성해도 된다. 정리는 Spec-kit이 한다.
- Figma MCP, 위키 MCP 등 외부 도구도 이 단계에서 함께 호출 가능하다.

### 3-3. Clarify (명확화, 선택)

Specify가 끝난 후 선택적으로 수행하는 단계다.  
스펙을 분석해 모호한 부분을 찾고, 최대 5개의 명확화 질문을 제안해준다.

```bash
/speckit.clarify 한글로 진행해
```

- 기획자와 함께 검토하기에도 유용하다.
- 질의응답이 끝나면 스펙 문서가 자동으로 업데이트된다.

### 3-4. Plan (개발 계획)

Constitution과 Spec을 기반으로 **개발 계획**을 수립하는 단계다.

```bash
/speckit.plan 한글로 진행해
```

- 데이터 모델 정의도 이 단계에서 확인 가능하다.
- 마음에 안 드는 부분이 있어도 직접 수정하지 말고 `/speckit.specify`로 돌아가 스펙을 재정의한다.
  스펙 문서와 실제 계획이 불일치하면 팀 내 혼란을 초래한다.

### 3-5. Tasks (작업 분해)

Plan을 바탕으로 **구체적인 개발 작업 목록**을 생성하는 단계다.

```bash
/speckit.tasks 한글로 작성해
```

- 생성된 `tasks.md`에는 각 작업의 세부사항과 완료 기준이 포함된다.
- Spec에 정의한 MCP(예: Figma MCP)가 tasks에서 누락된 경우 직접 추가 지시를 내려야 할 수 있다.

```bash
/speckit.tasks tasks에 피그마 mcp를 직접 사용하는 작업을 추가해줘
```

### 3-6. Analyze (분석)

Constitution 기준으로 spec, plan, tasks 간의 **모순이나 누락을 검증**하는 단계다.

```bash
/speckit.analyze 한글로 작성해
```

- 분석 완료 후 수정사항을 제안해준다.
- 보안, 테스팅 등 일관성이 중요한 항목이 tasks에 포함되었는지 여기서 확인할 수 있다.

### 3-7. Implement (구현)

드디어 AI가 코드를 생성하는 단계다.

```bash
/speckit.implement 한글로 진행해
```

- Spec-kit은 constitution, spec, plan, tasks를 종합해 개발을 수행한다.
- 실행 중 `tasks.md`가 실시간으로 업데이트되며 완료된 작업이 표시된다.
- **주의**: AI가 tasks에 더 집중하는 경향이 있으므로, constitution 규칙이 제대로 반영되지 않는다면 tasks와의 일치 여부를 다시 점검해야 한다.

---

## 4. 빠른 시작

```bash
# uv 설치 (사전 필요)
# https://docs.astral.sh/uv/getting-started/installation/

# Spec-kit CLI 설치
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# 기존 프로젝트에 초기화
specify init --here

# 새 프로젝트 생성
specify init <PROJECT_NAME>
```

---

## 5. SDD 도입 후기: 장단점 정리

### ✅ 장점

- **기획자와의 협업 향상**: clarify 단계에서 기획자와 함께 세심하게 요구사항 검토 가능
- **팀 투명성 확보**: 다른 개발자가 어떤 작업을 했는지 스펙 문서로 명확히 파악 가능
- **일관성 보장**: tasks 단계의 구체적인 작업 지시 덕분에 AI가 맥락을 잃지 않고 일관된 코드 생성
- **보안·테스트 관리**: constitution에서 정의한 항목이 tasks에 반영되었는지 추적 가능
- **자동 문서화**: 개발 과정에서 constitution, spec, plan, tasks 문서가 자연스럽게 생성됨

### ⚠️ 단점

- **진입장벽**: 5단계 파이프라인이 처음 접하는 개발자에게 복잡하게 느껴질 수 있음
- **간단한 작업에서의 애매함**: 소규모 수정 시 SDD를 적용할지, 그냥 에이전트 모드로 처리할지 판단이 개발자마다 다를 수 있음
- **토큰 소모 증가**: 단계별 문서가 많이 생성되므로 LLM API 비용이 증가

---

## 6. 핵심 인사이트

> **"앞으로 개발자의 역할은 '코드를 작성하는 사람'에서 '스펙을 검증하고 테스트를 설계하는 사람'으로 변화할 것이다."**  
> — wayne (카카오페이 AI 플랫폼팀)

SDD가 특히 빛나는 상황은 **팀 단위 협업**이다. 바이브 코딩 방식에서는 개인의 프롬프트 스킬에 따라 AI 산출물의 품질이 크게 달라졌지만, SDD는 constitution이라는 공통 규칙 위에서 모든 팀원이 동일한 기준으로 개발할 수 있게 해준다.

엔터프라이즈 환경에서 AI 코딩 도구를 팀 단위로 도입하려 한다면, SDD는 고려할 가치가 충분한 방법론이다.

---

## 📎 참고 링크

- [카카오페이 기술 블로그 원문](https://tech.kakaopay.com/post/ifkakao-agentic-coding/)
- [if(kakao)25 세션 — AI 플랫폼 하드웨어부터 코드까지](https://if.kakao.com/2025/session?sessionId=42)
- [GitHub: spec-kit](https://github.com/github/spec-kit)
- [uv 설치 가이드](https://docs.astral.sh/uv/getting-started/installation/)