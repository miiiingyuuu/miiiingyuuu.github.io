---
title: "AI Agent 설계와 서비스 구현"
date: "2026-10-19"
description: "AI Agent Advanced와 Capstone을 바탕으로 공통 State와 병렬 실행, 근거 기반 RAG, MCP, FastAPI 수명주기, SSE, Supervisor와 LangSmith 평가를 연결하는 기술 구조를 정리"
category: ["AI"]
tags: ["Agent", "LangGraph", "MCP"]
---

LLM이 질문에 답하는 것과, 외부 도구를 사용해 여러 작업을 수행하는 애플리케이션은 설계해야 할 범위가 다릅니다. 도구를 선택하는 과정뿐 아니라 **어떤 상태를 공유하고, 언제 실행을 종료하며, 중간 결과를 어떻게 전달하고, 답변의 품질을 무엇으로 판단할지** 정해야 합니다.

AI Agent Advanced의 투자 평가 시스템과 Capstone의 ICT 운영 지원 시스템은 도메인은 다르지만 이 문제를 공유합니다. 전자는 근거 수집과 여러 분석 결과의 결합에, 후자는 도구 연결과 대화형 서비스의 실행·관찰·평가에 초점을 둡니다.

---

## 1. Agent 시스템의 핵심 구성

Agent를 구성하는 요소는 모델과 프롬프트에 한정되지 않습니다.

```text
사용자 요청
  → 상태 초기화
  → 계획·분기
  → 필요한 도구 실행
  → 근거와 결과를 상태에 반영
  → 후속 작업 또는 종료
  → 응답 전달
  → 실행 관찰·품질 평가
```

| 요소 | 담당하는 문제 |
| --- | --- |
| Model | 요청 해석, 도구 선택 제안, 정보 추출·서술 |
| State | 현재 요청·중간 결과·누적 이력 저장 |
| Node | 특정 작업 실행과 상태 변경분 생성 |
| Edge | 순서·조건 분기·반복·종료 결정 |
| Tool | 검색·조회·외부 시스템 작업 |
| Schema | 입력·출력의 구조와 값 범위 검증 |
| Transport | 프로세스·HTTP·브라우저 사이의 전달 |
| Trace·Evaluation | 실행 과정과 품질의 확인 |

모델이 도구 호출을 생성하면 애플리케이션이 인자를 검증하고 실제 함수를 실행합니다. 모델의 자연어 응답에 “조회했다”는 문장이 있다는 것만으로 도구가 실행됐다고 판단할 수는 없습니다. 도구 호출 기록과 반환 결과를 따로 확인해야 합니다.

---

## 2. LangGraph: State, Node, Edge로 실행을 표현하기

LangGraph의 Graph API는 상태를 공유하는 작업을 노드와 연결 관계로 표현합니다. 노드는 현재 상태를 입력받고 변경분을 반환하며, Edge는 다음 작업을 결정합니다. [공식 Graph API 설명](https://docs.langchain.com/oss/python/langgraph/graph-api)

### 전체 상태를 매번 반환할 필요는 없다

```python
from typing import TypedDict


class AnalysisState(TypedDict):
    company: str
    profile: dict
    technology: dict
    market: dict


def analyze_technology(state: AnalysisState) -> dict:
    # 설명용: 실제 구현에서는 RAG 검색과 근거 검증을 수행
    return {
        "technology": {
            "company": state["company"],
            "evidence_status": "missing",
        }
    }
```

이 노드는 `technology`의 변경분만 반환합니다. 다른 노드의 책임인 `market`이나 `profile`을 불필요하게 다시 쓰지 않으면 작업 간 간섭을 줄일 수 있습니다.

### State 스키마와 데이터 검증은 구분한다

`TypedDict`는 필드 구조를 표현하지만 임의의 입력값을 런타임에서 검증하는 장치는 아닙니다. 모델이 만든 JSON이나 외부 API 응답에는 Pydantic 같은 별도 검증이 필요합니다.

```text
외부 입력·LLM 출력
  → Pydantic으로 타입·범위 검증
  → 검증된 값으로 State 업데이트
  → 후속 Node 실행
```

예를 들어 날짜 문자열의 형식이 맞더라도 실제로 최신 자료인지, 인용 URL이 존재하더라도 주장과 일치하는지는 별도의 검사 대상입니다.

---

## 3. Reducer: 덮어쓸 값과 누적할 값을 구분하기

상태의 모든 필드가 같은 방식으로 갱신되지는 않습니다.

```text
현재 기업 프로필     → 다음 기업으로 넘어가면 교체
현재 기술·시장 분석  → 다음 기업에서 초기화
기업별 평가 이력     → 이전 결과를 유지하며 누적
참조한 출처         → 중복 기준을 정해 병합
```

누적 필드는 Reducer로 업데이트 규칙을 정의할 수 있습니다.

```python
import operator
from typing import Annotated, TypedDict


class EvaluationState(TypedDict):
    current_company: str
    evaluation_history: Annotated[list[dict], operator.add]


def record_result(state: EvaluationState) -> dict:
    # Reducer가 기존 목록과 합치므로 새 항목만 반환
    return {
        "evaluation_history": [
            {"company": state["current_company"], "decision": "hold"}
        ]
    }
```

기존 목록 전체에 새 항목을 붙인 뒤 다시 반환하면 Reducer가 이전 항목을 중복 추가할 수 있습니다. 반대로 현재 분석처럼 교체해야 하는 값에 누적 규칙을 적용하면 서로 다른 기업의 결과가 섞일 수 있습니다.

`operator.add`는 목록 연결 규칙일 뿐 중복 제거 기능은 없습니다. 작업을 재시도하거나 재개할 수 있다면 기업 ID·문서 ID 같은 키를 기준으로 병합하는 규칙이나 별도의 멱등성 처리가 필요합니다.

---

## 4. 병렬 실행과 합류, 후보 반복 설계

Advanced 시스템에서는 기업 프로필을 바탕으로 기술과 시장을 각각 분석한 뒤 두 결과를 경쟁사 분석에 전달합니다.

```text
기업 프로필
  ├─ 기술 분석 ─┐
  └─ 시장 분석 ─┴→ 경쟁사 비교 → 투자 판단
                                  ↓
                       다음 후보가 있으면 반복
                       없으면 전체 보고서 생성
```

### 병렬 작업은 서로 다른 상태 필드를 갱신한다

다음은 외부 API 없이 실행할 수 있는 설명용 Graph입니다.

```python
from typing import TypedDict
from langgraph.graph import START, END, StateGraph


class State(TypedDict):
    company: str
    technology: str
    market: str
    comparison: str


def profile(state):
    return {"company": state["company"].strip()}


def technology(state):
    return {"technology": "기술 근거 검토 결과"}


def market(state):
    return {"market": "시장 근거 검토 결과"}


def compare(state):
    return {
        "comparison": f"{state['technology']} / {state['market']}"
    }


builder = StateGraph(State)
builder.add_node("profile", profile)
builder.add_node("technology", technology)
builder.add_node("market", market)
builder.add_node("compare", compare)
builder.add_edge(START, "profile")
builder.add_edge("profile", "technology")
builder.add_edge("profile", "market")
builder.add_edge(["technology", "market"], "compare")
builder.add_edge("compare", END)

graph = builder.compile()
result = graph.invoke({"company": "Example Bio"})
assert result["comparison"] == "기술 근거 검토 결과 / 시장 근거 검토 결과"
```

리스트 형태의 시작 노드를 사용한 합류 Edge는 지정한 두 작업의 완료를 기다립니다. 두 병렬 노드가 Reducer 없는 동일한 필드를 동시에 갱신하는 구조는 피해야 합니다.

### 병렬화가 항상 전체 시간을 절반으로 줄이지는 않는다

두 분석이 독립적이고 실제로 동시에 실행된다면 다음과 같이 생각할 수 있습니다.

```text
순차 분석 시간 ≈ 기술 분석 시간 + 시장 분석 시간
병렬 분석 시간 ≈ max(기술 분석 시간, 시장 분석 시간) + 합류 비용
```

공유 자원, 모델 API의 동시 호출 제한, 검색 서버의 응답 시간 때문에 실제 효과는 달라집니다. 병렬 작업의 시간 합을 전체 지연 시간으로 해석해서도 안 됩니다.

### 반복에는 명시적인 종료 조건이 필요하다

후보 평가가 끝나면 “남은 후보가 있는가?”를 상태로 확인합니다. 후보가 없다면 보고서 노드로 이동하고, 후보가 처음부터 0개라면 무추천 결과를 생성할 수 있어야 합니다.

`recursion_limit`은 무한 실행을 막는 실행 제한입니다. “모든 후보 평가 완료” 같은 업무상의 종료 조건을 대신하지는 않습니다.

---

## 5. 구조화 출력과 근거의 데이터 계약

LLM의 긴 설명을 그대로 다음 Agent에 넘기면 사실·추론·미확인이 섞이기 쉽습니다. 필드를 나누면 후속 단계가 무엇을 확정값으로 사용할 수 있는지 명확해집니다.

```python
from typing import Literal
from pydantic import BaseModel, Field


class Evidence(BaseModel):
    claim: str
    status: Literal["supported", "inferred", "missing"]
    source_urls: list[str] = Field(default_factory=list)
    rationale: str
```

이 구조는 설명용입니다. `supported`라는 문자열을 모델이 반환했다고 사실 검증이 끝나는 것은 아닙니다. 실제 출처에 해당 내용이 있는지, 기업·기간·조건이 일치하는지 확인해야 합니다.

### 결측은 부정과 다르다

| 표현 | 의미 |
| --- | --- |
| `null` | 아직 확인되지 않음 |
| `false` | 정해진 확인 절차에서 거짓으로 판정 |
| `[]` | 해당 필드의 계약에 따라 비어 있는 결과 목록 |
| `"missing"` | 필요한 근거가 부족함을 명시 |

검색 장애로 얻은 빈 목록과 정상 조회 후의 결과 없음은 다릅니다. 오류·조회 시각·검색 범위를 별도 필드에 보관해야 둘을 구분할 수 있습니다.

특히 위험 관문을 `null → false`로 바꾸면 미확인 위험을 “없음”으로 처리하게 됩니다. 평가를 계속할지 보류할지는 모델의 추측이 아니라 명시적인 정책으로 정해야 합니다.

---

## 6. Agentic RAG: 검색 결과에서 판단 근거까지

Advanced의 기술·시장 분석은 웹검색과 PDF RAG를 서로 다른 목적으로 사용합니다.

```text
웹검색   → 특정 기업의 현재 제품·계약·개발 단계 확인
PDF RAG  → 기술 검증·시장 분석에 필요한 기준과 배경 보강
```

산업 전체의 성장 전망은 특정 기업의 매출 전망을 직접 증명하지 않습니다. 검색 결과가 주제와 비슷한지와, 특정 주장의 근거가 되는지는 따로 판단해야 합니다.

### Dense 검색과 BM25 결합

팀 구현은 BGE-M3 Dense 검색과 Kiwi BM25 검색 결과를 RRF로 결합합니다. Dense는 의미적 유사성에, BM25는 용어 일치에 서로 다른 강점이 있습니다. 실제 구성과 검색 평가는 [Advanced 저장소의 RAG 설명](https://github.com/ai-invest-eval/invest-agent#3-agentic-rag)에 정리되어 있습니다.

RRF는 서로 다른 검색 점수를 직접 더하지 않고 순위를 결합합니다.

```text
RRF(d) = Σ 1 / (k + rank_i(d))

rank_i(d): 검색기 i에서 문서 d의 순위
k: 상위 순위 차이를 완화하는 상수
검색 결과에 없는 문서는 해당 검색기의 기여를 0으로 처리
```

하이브리드가 항상 더 좋은 것은 아닙니다. 질문 집합과 검색 목적에 따라 Dense보다 Recall@k나 Hit@k가 낮을 수도 있으므로 비교 평가가 필요합니다.

### 재검색에는 횟수 제한과 종료 조건을 둔다

```text
질문 계획
  → 기술/시장·주제 필터
  → 하이브리드 검색
  → 근거 적합성 판단
       ├─ 충분함: 분석에 사용
       └─ 부족함: 검색어 변경 후 제한된 재검색
                    → 필요 시 웹 보완
                    → 여전히 부족하면 정보 부족 표시
```

검색 횟수를 늘리는 것만으로 근거가 만들어지지는 않습니다. 문서·페이지·발행 시점과 실제 사용한 구절을 보존해야 인용을 검증할 수 있습니다.

반면 **Capstone의 운영 매뉴얼 검색은 로컬 Runbook의 키워드 검색과 snippet 반환**입니다. 두 시스템 모두 검색 기능이 있지만, Capstone에 벡터 DB·Dense/BM25 검색이 구현되어 있는 것으로 혼동하면 안 됩니다.

---

## 7. 판단 규칙과 자연어 생성을 분리하기

LLM은 근거를 읽고 항목별 평가를 제안할 수 있지만, 같은 입력에서 일관되어야 하는 계산과 관문은 코드로 표현하는 편이 검증하기 쉽습니다.

```text
LLM
  → 항목별 점수 제안·근거·출처

검증 코드
  → 값 범위 확인
  → 결측 비중 계산
  → 가중 합산
  → 필수 관문 적용
  → 통과·보류·순위 결정

LLM 또는 템플릿
  → 확정된 수치·판정으로 보고서 서술
```

예를 들어 점수가 1~5점이고 영역별 가중치를 적용한다면 다음 계산은 코드로 고정할 수 있습니다.

```text
영역 점수 = 항목 평균 / 5 × 100
전체 점수 = Σ(영역 점수 × 영역 가중치)
```

점수 범위와 가중치 합, 필수 항목 누락, 동점 정렬 기준도 검사 대상입니다. “결측 점수는 몇 점인가?” 같은 정책을 프롬프트에만 두면 실행마다 달라질 수 있습니다.

Advanced의 통과선과 관문은 팀이 정한 평가 정책입니다. 그 점수 자체가 실제 투자 수익률이나 성공 확률을 뜻하지는 않습니다.

---

## 8. MCP: 외부 기능을 연결하는 표준 인터페이스

MCP는 모델 자체가 아니라 애플리케이션과 외부 기능을 연결하는 프로토콜입니다.

```text
Host 애플리케이션
  └─ MCP Client
       ↔ MCP Server
            ├─ Tools
            ├─ Resources
            └─ Prompts
```

| 구성 | 제공하는 것 | Capstone 예 |
| --- | --- | --- |
| Tool | 인자를 받아 실행하는 기능 | 상태 조회, 매뉴얼 검색, Jira 검색·생성 |
| Resource | URI로 식별되는 문서·데이터 | `runbook://incident-response/auth-failure` |
| Prompt | 인자로 구체화하는 대화 템플릿 | 시스템·증상을 넣는 표준 진단 절차 |

MCP Tool은 이름·설명·입력 스키마와 함께 노출됩니다. 호출 허용 범위와 실제 실행은 Host 애플리케이션이 제어해야 합니다. [MCP Tools 명세](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

### FastMCP의 Tool 등록

다음은 독립적으로 실행할 수 있는 축약 예제입니다.

```python
from fastmcp import FastMCP

mcp = FastMCP("operations-example")


@mcp.tool()
def get_monitoring_status(system_name: str) -> dict:
    """샘플 시스템의 상태를 조회한다."""
    states = {"auth-service": "degraded"}
    return {
        "system_name": system_name,
        "status": states.get(system_name, "unknown"),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
```

타입 힌트와 설명은 모델에 전달할 인터페이스를 만드는 데 사용됩니다. 그러나 잘못된 시스템 이름, 권한, 타임아웃과 외부 API 오류까지 자동으로 해결해 주지는 않습니다.

### STDIO의 프로세스 구조

STDIO에서는 Client가 Server를 subprocess로 실행하고 표준 입력·출력으로 프로토콜 메시지를 주고받습니다. 일반 로그는 프로토콜 출력과 섞이지 않게 표준 오류로 보내야 합니다. [MCP Transport 명세](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

```text
FastAPI 프로세스
  └─ MCP Client Session
       └─ Python MCP Server subprocess
            stdin  ← 요청
            stdout → 프로토콜 응답
            stderr → 로그
```

Inspector에서 도구·자료·Prompt를 각각 확인해도 Backend가 이를 모두 자동 사용하는 것은 아닙니다. 현재 Backend는 MCP Tools를 로드하고 Resource·Prompt는 Inspector에서 별도로 검증합니다.

---

## 9. FastAPI lifespan으로 연결 수명 관리하기

MCP 연결을 Tool 목록을 얻은 직후 닫으면 실제 Agent 실행 시 세션을 사용할 수 없습니다. 애플리케이션 시작 시 연결하고 종료 시 정리하도록 수명을 맞춰야 합니다.

다음은 저장소의 연결 구조를 축약한 코드입니다. `mcp_tool_session`과 `build_agent`는 프로젝트 모듈입니다.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from agent.graph import build_agent
from agent.mcp_client import mcp_tool_session


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_tool_session() as tools:
        app.state.agent = await build_agent(tools)
        yield
        # async with를 벗어나며 MCP 세션과 subprocess 정리


app = FastAPI(lifespan=lifespan)
```

FastAPI의 lifespan은 시작·종료에 필요한 자원을 같은 문맥에서 관리하는 방식입니다. [공식 lifespan 설명](https://fastapi.tiangolo.com/advanced/events/)

### Checkpointer와 thread_id

Checkpointer를 설정한 Graph에서는 요청의 thread_id로 대화 상태를 구분할 수 있습니다.

```python
config = {"configurable": {"thread_id": "conversation-001"}}

# 설명용: 이미 생성한 Agent를 호출
result = await agent.ainvoke(
    {"messages": [{"role": "user", "content": "auth-service 상태를 알려주세요."}]},
    config=config,
)
```

같은 thread_id를 전달하면 같은 대화 상태를 이어갈 수 있습니다. 다만 메모리 Checkpointer는 프로세스가 종료되면 상태가 사라지며 여러 Worker 사이에서도 자동 공유되지 않습니다.

thread_id는 대화 식별자이며 사용자 인증·권한 검증의 대체물이 아닙니다. 운영 환경에서는 요청 사용자가 해당 대화에 접근할 수 있는지 별도로 확인해야 합니다.

---

## 10. SSE: 토큰과 실행 상태를 HTTP로 전달하기

일반 JSON 응답은 처리가 끝난 뒤 결과를 반환합니다. SSE를 사용하면 HTTP 응답 본문을 열어 둔 상태에서 이벤트를 순차 전달할 수 있습니다.

```text
일반 응답
요청 → 작업 완료 → 최종 JSON

스트리밍 응답
요청 → Tool 시작 → Tool 결과 → 토큰 → 토큰 → 완료
```

Capstone은 POST 요청 본문에 질문을 담아 `fetch`로 보내고, 응답의 `ReadableStream`을 읽는 방식을 사용합니다. 기본 `EventSource`의 자동 재연결 동작을 그대로 사용하는 구조는 아닙니다.

### 이벤트 형식

```text
event: tool_call_start
data: {"type":"tool_call_start","tool_name":"get_monitoring_status","args":{"system_name":"auth-service"}}

event: token
data: {"type":"token","content":"현재 상태는"}

event: done
data: {"type":"done","thread_id":"conversation-001"}

```

이벤트는 빈 줄로 구분합니다. `done`은 이 애플리케이션이 정의한 이벤트이며 SSE 자체가 정한 필수 이벤트 이름은 아닙니다.

### 네트워크 chunk는 이벤트 경계가 아니다

```text
chunk 1: event: token\ndata: {"type":"token","con
chunk 2: tent":"안녕하세요"}\n\nevent: done\ndata: ...
```

한 이벤트가 여러 chunk로 나뉘거나 한 chunk에 여러 이벤트가 들어갈 수 있습니다. 따라서 문자열 버퍼에서 완성된 이벤트만 꺼내야 합니다.

다음은 현재 서버의 `\n\n` 구분 형식에 맞춘 파싱 핵심입니다. 범용 SSE 파서는 CRLF, 여러 data 행 등 명세의 다른 형태도 처리해야 합니다.

```typescript
let buffer = "";
let receivedDone = false;

// chunk는 TextDecoderStream을 거친 문자열
function consume(chunk: string) {
  buffer += chunk;
  const blocks = buffer.split("\n\n");
  buffer = blocks.pop() ?? "";

  for (const block of blocks) {
    const data = block
      .split("\n")
      .find(line => line.startsWith("data: "));
    if (!data) continue;

    const event = JSON.parse(data.slice(6));
    if (event.type === "done") receivedDone = true;
    // onEvent(event): React 상태에 반영
  }
}
```

바이트를 직접 읽는 경우 UTF-8 문자도 chunk 사이에서 나뉠 수 있습니다. 스트리밍 디코더로 문자열을 복원한 뒤 이벤트 경계를 처리해야 합니다.

---

## 11. HTTP 성공, 스트림 완료, 작업 성공은 다르다

스트리밍에서는 세 가지 상태를 구분해야 합니다.

| 상태 | 의미 | 확인 방법 |
| --- | --- | --- |
| HTTP 연결 성공 | 응답이 시작됨 | 상태 코드·헤더 |
| 스트림 정상 완료 | 애플리케이션 완료 신호 수신 | `done` 이벤트 |
| 작업 성공 | 필요한 조회·분석이 의도대로 수행됨 | Tool 결과·Task 결과·평가 |

응답 헤더와 본문 일부가 전송된 뒤 오류가 발생하면 이미 보낸 `200 OK`를 일반적인 `500` 응답으로 되돌릴 수 없습니다. 이때는 정의한 오류 이벤트를 보내거나 연결 종료를 감지해야 합니다.

현재 프론트엔드는 완료 신호 없이 끝난 스트림을 오류로 표시합니다. Backend를 종료한 뒤 새 요청에서 발생한 `Failed to fetch`는 연결 실패이고, 이미 시작된 응답 도중 끊기는 경우와는 구분해야 합니다.

### 중단과 재시도

- `AbortController`로 클라이언트 요청을 중단할 수 있습니다.
- 중단된 요청이 뒤늦게 새 대화 화면을 덮어쓰지 않도록 요청 ID를 구분합니다.
- 브라우저 요청 중단이 외부 작업의 취소·롤백까지 보장하지는 않습니다.
- 조회 작업과 티켓 생성 같은 쓰기 작업은 재시도 정책을 구분합니다. 쓰기 요청을 재전송하면 중복 생성 여부를 확인해야 합니다.

자동 재연결은 대화 상태·재개 위치·중복 실행 정책과 함께 설계해야 합니다. 스트림을 다시 여는 것만으로 이전 작업을 정확히 이어가는 것은 아닙니다.

---

## 12. Supervisor와 Task 상태를 UI에 전달하기

Supervisor는 사용자 요청을 계획과 Task로 나누고 담당 Agent에 위임합니다.

```text
planning
  → task_start
  → execute
       ├─ 남은 Task 있음: task_start로 반복
       └─ 모두 완료: finalize
```

Advanced의 고정된 분석 Graph와 달리 Capstone Supervisor는 모델이 요청에 맞는 Task 목록을 만듭니다. 다만 생성된 Task의 실행 자체는 순차 방식입니다.

### 계획도 검증할 데이터다

```python
from typing import Literal
from pydantic import BaseModel, Field


class PlannedTask(BaseModel):
    description: str
    agent: Literal["research", "writing"]


class Plan(BaseModel):
    plan: str
    tasks: list[PlannedTask] = Field(min_length=1, max_length=8)
```

담당 Agent와 Task 수를 제한하면 잘못된 구조를 줄일 수 있습니다. 현재 구현은 마지막 Task가 writing이 아니면 통합 작업을 추가합니다. 따라서 8개 제한은 모델이 만든 계획의 제한이며, 보정 후 전체 목록의 상한을 엄격하게 유지하려면 추가 검증이 필요합니다.

### task_start를 분리하는 이유

하나의 실행 노드 안에서 상태를 `in_progress`로 바꿔도 그 변경분을 실행 종료 시 반환하면 UI에는 중간 상태가 전달되지 않습니다.

```text
시작 노드 반환: in_progress
  → UI에 task_started 전달
  → 하위 Agent 실행·토큰 전달
  → 실행 노드 반환: completed
```

### updates와 custom 스트림의 역할

실습의 `astream`에서는 노드 변경분을 `updates`, 하위 작업의 사용자 정의 진행 이벤트를 `custom`으로 구분합니다. [LangGraph 스트리밍 설명](https://docs.langchain.com/oss/python/langgraph/streaming)

```python
# 설명용: Supervisor 실행의 스트림 구독 형태
async for mode, payload in graph.astream(
    inputs,
    config=config,
    stream_mode=["updates", "custom"],
):
    if mode == "updates":
        # 계획·Task 시작·완료·최종 결과를 앱 이벤트로 변환
        ...
    elif mode == "custom":
        # task_id가 있는 토큰·Tool 이벤트를 전달
        ...
```

React 화면은 메시지 위치만으로 결과를 붙이지 않고 `task_id`를 기준으로 Task 카드와 연결해야 합니다. 현재 구현에서 하위 Agent 토큰은 Task 카드에 표시하고, 최종 답변은 마지막 writing 결과를 한 번에 전달합니다.

---

## 13. Observability: 실행을 설명할 수 있는 기록

Trace는 요청 하나에 속한 여러 실행 기록을 연결합니다. 각 Run에는 입력·출력, 실행 시간, 오류와 메타데이터 등을 기록할 수 있습니다.

```text
요청 Trace
  └─ Supervisor
       ├─ planning
       │    └─ LLM
       ├─ research:task_1
       │    ├─ LLM
       │    ├─ Tool
       │    └─ LLM
       └─ writing:task_2
            └─ LLM
```

### 이름과 메타데이터는 분석 기준이다

`planning`, `research:task_1`, `writing:task_2`처럼 역할을 구분하고 thread_id·task_id를 기록하면 어느 질문의 어떤 단계인지 추적하기 쉽습니다.

| 질문 | 확인할 기록 |
| --- | --- |
| 왜 느린가? | 전체 시간, 단계별 시간, 외부 Tool 지연 |
| 왜 토큰이 많이 드는가? | 입력·출력 usage, 중복 검색, 앞선 결과 전달량 |
| 왜 답변이 틀렸는가? | 계획, 검색 인자, Tool 원문, 통합 답변 |
| 실제로 도구를 사용했는가? | Tool Run과 인자·결과·오류 |

### 토큰 집계에서 중복과 누락을 피한다

부모 Run의 합계와 그 자식 LLM Run의 토큰을 함께 더하면 같은 사용량이 중복될 수 있습니다. 실습의 보고서는 고유 LLM Run ID로 중복을 제거한 뒤 usage를 합산합니다.

```text
잘못된 합산
Supervisor 토큰 합계 + research 합계 + 각 LLM 토큰

집계 기준 예
Trace에 포함된 고유 LLM 호출의 입력·출력 토큰 합
```

usage가 누락되면 0으로 단정하지 않고 알 수 없음으로 표시합니다. 동시 요청에서는 Collector를 전역으로 공유하지 않고 요청·Task별로 분리합니다.

토큰 합계는 비용 그 자체가 아닙니다. 실제 비용을 계산하려면 모델별 입력·출력 단가와 캐시·추론 토큰 등 제공되는 사용량 항목을 구분해야 합니다. Trace에 들어가는 질문·응답·Tool 결과의 민감 정보도 기록 전에 검토해야 합니다.

---

## 14. Evaluation: Dataset, Target, Evaluator, Experiment

Observability가 실행 과정을 설명한다면 Evaluation은 정해진 질문과 기준으로 결과를 비교합니다. LangSmith에서는 Dataset의 예시를 Target에 실행하고 Evaluator 결과를 Experiment에 기록할 수 있습니다. [공식 Agent 평가 설명](https://docs.langchain.com/langsmith/evaluate-llm-application)

```text
Dataset의 Example
  ├─ inputs: 질문
  └─ outputs: 기대 토픽·참조값
          ↓
Target: 평가할 Agent 실행
          ↓
Run의 실제 outputs
          ↓
Evaluator: 점수·근거
          ↓
Experiment: 여러 Example의 실행·평가 결과
```

### Dataset은 평가 기준의 일부다

```python
example = {
    "inputs": {
        "message": "auth-service 시스템 상태와 관련 ticket을 알려주세요."
    },
    "outputs": {
        "expected_topics": ["auth-service", "degraded"],
        "expected_tools_used": [
            "get_monitoring_status",
            "search_jira_tickets",
        ],
    },
}
```

질문이 모호하면 기대 Tool도 하나로 정하기 어려울 수 있습니다. `degraded`를 한국어로 정확히 설명한 답변을 문자열 검사에서 실패로 볼지도 평가 설계에 포함됩니다.

Dataset 재실행 시 중복 추가를 방지하고, 기존 기대값을 바꿀 때는 버전을 구분해야 합니다. 질문·참조값·모델·프롬프트·검색 자료가 동시에 바뀌면 점수 차이의 원인을 해석하기 어렵습니다.

### 질문별 상태를 격리한다

서로 독립적인 평가 질문에 같은 thread_id를 재사용하면 이전 질문의 정보가 다음 응답에 들어갈 수 있습니다. 현재 평가 Target은 질문마다 별도 thread_id·MCP 세션·Graph를 생성합니다.

다중 턴 평가에서는 반대로 한 시나리오 안의 턴들은 같은 대화를 유지하고, 다른 시나리오와 분리해야 합니다. 상태 격리 방식은 평가 단위에 맞춰 선택해야 합니다.

### aevaluate로 비동기 평가하기

아래 코드는 프로젝트의 `backend` 디렉터리에서 사용할 수 있는 평가 실행 형태입니다. Target과 두 Evaluator는 저장소에 구현되어 있고, Dataset과 API 설정을 먼저 준비해야 합니다.

```python
import asyncio
from langsmith import aevaluate
from eval.target import target_function
from eval.evaluators import has_expected_topics, response_quality_judge


async def main():
    results = await aevaluate(
        target_function,
        data="capstone-ict-operations",
        evaluators=[has_expected_topics, response_quality_judge],
        experiment_prefix="supervisor-v1",
        max_concurrency=2,
    )
    async for row in results:
        print(row["evaluation_results"])


if __name__ == "__main__":
    asyncio.run(main())
```

동시 실행 수를 늘리면 평가 시간이 줄 수 있지만 모델·검색 API의 제한과 동시 자원 사용도 함께 고려해야 합니다.

---

## 15. 평가 점수는 무엇을 측정하는가?

### 문자열 토픽 포함률

```python
def topic_coverage(response: str, expected: list[str]) -> float:
    if not expected:
        return 1.0  # 기대 항목이 없을 때의 명시적 정책
    normalized = response.lower()
    found = sum(topic.lower() in normalized for topic in expected)
    return found / len(expected)
```

간단하고 재현하기 쉽지만 동의어와 번역 표현을 놓칠 수 있습니다. 반대로 단어만 나열한 잘못된 답변도 점수를 받을 수 있습니다. 이 점수는 사실 정확도가 아닙니다.

### LLM-as-a-Judge

Judge는 질문과 응답을 읽고 관련성·명확성·구조 같은 기준으로 평가합니다. 다음과 같은 출력 스키마를 사용할 수 있습니다.

```python
from pydantic import BaseModel, Field


class QualityGrade(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    reasoning: str
```

범위 검증은 1.5 같은 잘못된 값의 수용을 막지만, 채점 근거가 타당한지까지 보장하지는 않습니다. 단순 인사에 과도한 전문성을 요구하거나 유창한 답변에 높은 점수를 주는 편향이 생길 수 있습니다.

정답 문서나 실제 Tool 출력을 보지 않는 Judge는 사실 정확성을 충분히 검증할 수 없습니다. 필요하면 참조 근거를 제공하고 항목별 기준을 구체화하며 사람의 채점과 비교해야 합니다.

### 실제 Tool 집합 비교

호출된 Tool 이름 집합을 기대 집합과 비교할 수도 있습니다.

```text
Jaccard = |기대 Tool ∩ 실제 Tool| / |기대 Tool ∪ 실제 Tool|

기대: {상태 조회, 티켓 검색}
실제: {상태 조회}
점수: 1 / 2
```

응답 본문에 도구 이름이 있다는 이유로 호출한 것으로 처리하면 안 됩니다. 실제 호출 기록이 필요합니다. 집합 비교는 호출 순서·횟수·인자 정확성·실행 성공까지 평가하지 않으므로 별도 검사를 추가해야 합니다.

---

## 16. 검증 항목을 계층별로 나누기

Inspector 성공, HTTP 200, 브라우저 출력과 높은 평가 점수는 서로 다른 것을 확인합니다.

| 계층 | 확인할 내용 | 확인하지 못하는 것 |
| --- | --- | --- |
| Schema·단위 테스트 | 값 범위, Reducer·집계·평가 로직 | 외부 API의 실제 응답 |
| MCP Inspector | 기능 등록, 입력·반환값, Resource·Prompt | Backend의 자동 활용 여부 |
| Backend API | 요청 계약, 연결 수명, thread 상태 | 브라우저 렌더링·CORS 전체 |
| SSE 소비 | 이벤트 경계, 순서, 완료·중단 | 응답의 사실 정확성 |
| 브라우저 E2E | Plan·Task·Tool·최종 답변과 오류 UI | 모든 질문에서의 일반화 |
| Dataset 평가 | 고정 질문에서의 기준별 비교 | 실제 전체 트래픽의 성능 |

예를 들어 긴 답변을 요청했는데 모델이 범위를 좁혀 달라고 답하면, 응답은 정상이어도 긴 토큰 스트림 검증을 수행한 것은 아닙니다. 네트워크 장애를 재현하려면 Backend 종료 전·후 요청인지, 응답 시작 후 중단인지 조건도 명확히 해야 합니다.

재현 가능한 기록에는 질문, 모델·프롬프트 버전, 검색 자료·mock 여부, 기대 동작과 실제 동작을 함께 남기는 것이 좋습니다.

---

## 17. 자주 혼동하는 개념

| 혼동 | 구분해야 할 내용 |
| --- | --- |
| Agent가 여러 개면 병렬이다 | Agent 수와 실행 스케줄은 별개. 현재 Supervisor는 순차 실행 |
| 구조화 출력이면 사실도 맞다 | 스키마 검증과 근거 검증은 별개 |
| 검색 결과가 있으면 주장도 검증됐다 | 기업·시점·조건·인용 구절까지 일치해야 함 |
| MCP Prompt를 조회하면 진단이 실행된다 | 템플릿 획득과 모델·Tool 실행은 별개 |
| thread_id가 있으면 대화가 영구 저장된다 | 저장 Backend와 수명에 따라 다름 |
| HTTP 200이면 스트리밍 작업도 성공했다 | 완료 신호·Task·Tool 결과를 함께 확인 |
| 하위 Agent 토큰과 최종 응답은 같은 스트림이다 | UI의 Task 출력과 최종 답변 이벤트를 구분 |
| Judge 점수가 높으면 정확하다 | 기준·참조 근거·모델 편향에 따라 달라짐 |
| mock 티켓이 최신 incident다 | 샘플 데이터와 실제 운영 시스템 조회를 구분 |

---

### 공식 문서

- [LangGraph Graph API](https://docs.langchain.com/oss/python/langgraph/graph-api): State, Node, Edge와 Reducer.
- [LangGraph Streaming](https://docs.langchain.com/oss/python/langgraph/streaming): 상태 변경·토큰·사용자 정의 이벤트 전달.
- [MCP Server 개념](https://modelcontextprotocol.io/specification/2025-06-18/server/index): Tools·Resources·Prompts.
- [MCP Transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports): STDIO와 프로토콜 전달.
- [FastAPI Lifespan](https://fastapi.tiangolo.com/advanced/events/): 시작·종료 자원 관리.
- [MDN SSE 형식](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events): 이벤트 스트림의 문법.
- [LangSmith Agent Evaluation](https://docs.langchain.com/langsmith/evaluate-llm-application): Dataset·Target·Evaluator와 실행 평가.
