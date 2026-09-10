---
title: "Spring AI 실습 총정리"
date: "2026-09-10"
category: ["Java", "Spring", "AI", "RAG", "MCP"]
description: "Spring AI의 ChatClient와 Structured Output부터 Embedding, PgVector, RAG, Chat Memory, Tool Calling, MCP, Simple Agent와 Multi-Agent까지 13개 실습의 핵심 구조와 실행 흐름을 정리한다."
---


# Spring AI 실습 총정리 — ChatClient에서 RAG, MCP, Multi-Agent까지

LLM을 애플리케이션에 연결하는 가장 단순한 방법은 사용자의 질문을 모델 API에 보내고 문자열 응답을 받는 것이다. 하지만 실제 서비스를 만들려면 단순 호출만으로는 부족하다.

대화의 목적과 규칙을 전달해야 하고, 응답을 Java 객체로 변환해야 하며, 사내 문서나 최신 데이터를 근거로 답하게 해야 한다. 이전 대화를 기억하거나 파일·날씨 API 같은 외부 기능을 실행해야 할 수도 있다. 기능이 복잡해지면 하나의 모델 호출에 모든 책임을 맡기기보다 전문 Agent로 분리해 협업시키는 구조도 필요하다.

Spring AI는 이러한 기능을 Spring 애플리케이션의 구성 방식에 맞게 연결한다.

```text
기본 모델 호출
  → Prompt와 ChatOptions
  → Structured Output
  → Advisor
  → Embedding과 Vector Store
  → RAG
  → Chat Memory
  → Tool Calling
  → MCP
  → Simple Agent
  → Multi-Agent
```

이번 학습에서는 Java 21, Spring Boot 4.1.0, Spring AI 2.0.0 기반의 01~13 예제를 따라가며 이 흐름을 단계적으로 구현했다. 이 글은 명령어와 화면을 순서대로 나열하기보다, 각 기능이 어떤 문제를 해결하며 서로 어떻게 연결되는지를 중심으로 정리한다.

## 1. Spring AI가 해결하려는 문제

AI 모델 제공자마다 요청 형식, 설정 속성, 응답 객체와 Streaming 방식이 다르다. 애플리케이션이 특정 SDK에 직접 의존하면 모델을 바꾸거나 공통 기능을 추가할 때 관련 코드가 넓게 변경될 수 있다.

Spring AI는 모델과 애플리케이션 사이에 공통 추상화를 제공한다.

- `ChatModel`: 대화형 모델 호출의 핵심 추상화
- `ChatClient`: Prompt, Advisor, Tool, 응답 변환을 연결하는 고수준 API
- `EmbeddingModel`: 텍스트를 의미 벡터로 변환
- `VectorStore`: 벡터 문서 저장과 유사도 검색
- `ChatMemory`: 대화 이력 저장과 조회
- Advisor: 모델 호출 전후의 공통 처리
- Tool Calling: Java 메서드와 외부 기능 실행
- MCP: 외부 도구·리소스·프롬프트 연동 표준화

Spring AI는 LLM을 직접 학습시키는 프레임워크가 아니다. 이미 준비된 모델을 Spring 애플리케이션에 연결하고, AI 기능을 서비스 구조 안에서 조립하기 위한 프레임워크에 가깝다.

```text
Controller / Service
        ↓
    ChatClient
        ↓
Prompt · Advisor · Memory · Tool
        ↓
ChatModel / EmbeddingModel / VectorStore
        ↓
OpenAI · Ollama · PgVector · MCP Server
```

## 2. 전체 실습의 역할

저장소에는 01, 03, 05~13 예제가 있고, 02와 04의 개념은 앞뒤 예제 안에 포함되어 있다.

| 예제 | 중심 내용 | 해결하는 문제 |
|---|---|---|
| 01 | Hello AI, Prompt, ChatOptions | 모델에 역할과 질문을 전달하고 응답 받기 |
| 02 | 01 내부 개념 | 모델과 응답 생성 방식 조절하기 |
| 03 | Structured Output | 문자열 응답을 Java 객체로 변환하기 |
| 04 | Advisor | 로깅과 공통 전후 처리를 호출 코드에서 분리하기 |
| 05 | Embedding | 텍스트를 의미 기반으로 검색하기 |
| 06 | RAG ETL | TXT·PDF 문서를 분할해 Vector DB에 적재하기 |
| 07 | RAG | 검색 문서를 근거로 답변 생성하기 |
| 08 | Chat Memory | 같은 대화의 이전 내용을 기억하기 |
| 09 | Tool Calling | 시간·파일·날씨 같은 실제 기능 실행하기 |
| 10 | MCP | 도구를 외부 프로세스와 서버에서 표준 방식으로 제공하기 |
| 11 | Simple Agent | 역할과 도구가 제한된 전문 Agent 만들기 |
| 12 | Multi-Agent | Orchestrator가 전문 Agent에게 작업 위임하기 |
| 13 | 종합 실습 | RAG, Memory, Tool, Structured Output을 하나의 상담 Agent로 통합하기 |

각 예제는 독립된 기능처럼 보이지만 최종적으로 하나의 요청 처리 파이프라인을 구성한다.

## 3. ChatModel과 ChatClient로 시작하는 모델 호출

### ChatModel과 ChatClient

`ChatModel`은 모델과 직접 대화하는 핵심 인터페이스다. 반면 `ChatClient`는 애플리케이션에서 자주 필요한 프롬프트 구성, Advisor 적용, Tool 등록과 응답 변환을 Fluent API로 제공한다.

```java
@RestController
public class ChatController {

    private final ChatClient chatClient;

    public ChatController(ChatClient.Builder builder) {
        this.chatClient = builder.build();
    }
}
```

간단한 요청은 다음과 같이 구성할 수 있다.

```java
String answer = chatClient.prompt()
        .system("당신은 친절한 Spring AI 튜터입니다.")
        .user(question)
        .call()
        .content();
```

`ChatClient`가 모델 자체를 대체하는 것은 아니다. 내부에서는 결국 `ChatModel`을 호출하지만, 애플리케이션 코드가 모델 제공자의 세부 구현보다 대화 흐름에 집중하도록 도와준다.

### Prompt는 메시지와 옵션의 묶음이다

Prompt는 단순한 질문 문자열이 아니다. 모델에 전달할 Message 목록과 모델 실행 옵션을 포함한다.

| Message | 역할 |
|---|---|
| `SystemMessage` | 모델의 역할, 규칙, 답변 방식 지정 |
| `UserMessage` | 사용자의 질문이나 요청 |
| `AssistantMessage` | 이전 모델 응답 |
| `ToolResponseMessage` | Tool 실행 결과 |

System Message에는 모델이 맡을 역할과 지켜야 할 규칙을 둔다. User Message에는 실제 요청을 둔다. 역할과 질문을 분리하면 프롬프트를 재사용하기 쉽고, 서비스 정책도 일관되게 유지할 수 있다.

반복되는 프롬프트는 `PromptTemplate`로 만들고 변수를 주입할 수 있다.

```java
PromptTemplate template = new PromptTemplate("""
        {language} 전문가로서 다음 주제를 설명하세요.
        주제: {topic}
        """);

Prompt prompt = template.create(Map.of(
        "language", "Java",
        "topic", "Dependency Injection"
));
```

문자열을 직접 이어 붙이는 방법보다 입력 위치와 역할이 분명하고 재사용하기 쉽다.

### ChatOptions로 생성 방식을 조절한다

```java
ChatOptions options = ChatOptions.builder()
        .model("gpt-4o-mini")
        .temperature(0.2)
        .topP(0.9)
        .maxTokens(500)
        .build();
```

| 옵션 | 의미 |
|---|---|
| `model` | 사용할 모델 |
| `temperature` | 출력의 무작위성과 다양성 |
| `topP` | 누적 확률을 기준으로 후보 토큰 범위 제한 |
| `maxTokens` | 생성할 최대 토큰 수 |

정해진 형식이나 일관된 결과가 중요하면 temperature를 낮추는 편이 적합하다. 창의적인 아이디어가 필요하면 높일 수 있지만, 값이 높다고 응답 품질 자체가 좋아지는 것은 아니다.

### call과 stream

```java
String result = chatClient.prompt()
        .user(question)
        .call()
        .content();
```

`call()`은 모델이 응답을 완성할 때까지 기다린 뒤 결과를 반환한다.

```java
Flux<String> result = chatClient.prompt()
        .user(question)
        .stream()
        .content();
```

`stream()`은 생성되는 내용을 조각 단위로 전달한다. 긴 답변을 채팅 UI에 즉시 표시할 수 있어 첫 응답까지의 체감 시간을 줄인다. 다만 Streaming이 모델의 전체 생성 시간을 반드시 줄이는 것은 아니다.

## 4. Structured Output으로 문자열을 데이터로 바꾸기

일반 대화에서는 문자열 응답이면 충분하지만, 프런트엔드나 다른 서비스가 결과를 사용하려면 필드가 정해진 데이터 구조가 필요하다.

```java
public record ActorsFilms(
        String actor,
        List<String> films
) {}
```

```java
ActorsFilms result = chatClient.prompt()
        .user("배우 한 명과 대표 영화를 알려주세요")
        .call()
        .entity(ActorsFilms.class);
```

Spring AI는 모델이 생성한 응답을 Record나 DTO에 맞게 변환한다. 목록처럼 제네릭 타입을 보존해야 할 때는 `ParameterizedTypeReference`를 사용한다.

```java
List<ActorsFilms> result = chatClient.prompt()
        .user("배우별 대표 영화 목록을 만들어주세요")
        .call()
        .entity(new ParameterizedTypeReference<List<ActorsFilms>>() {});
```

Structured Output은 출력의 **형식**을 애플리케이션이 다루기 쉽게 만드는 기능이다. 다음 사항까지 자동으로 보장하지는 않는다.

- 모델이 말한 사실의 정확성
- 모든 필드의 업무 규칙 충족
- null, 범위, 문자열 길이에 대한 검증
- 외부 시스템에 저장해도 안전한 값인지 여부

따라서 DTO 변환 후에도 Bean Validation이나 별도의 비즈니스 검증이 필요하다.

## 5. Advisor로 공통 기능을 호출 전후에 연결하기

여러 Controller와 Service에서 매번 로깅, 대화 기록, RAG 검색을 직접 구현하면 모델 호출 코드가 복잡해진다. Advisor는 이러한 공통 관심사를 ChatClient 요청 전후에 삽입한다.

```text
사용자 요청
  → Logging Advisor
  → Memory Advisor
  → RAG Advisor
  → ChatModel
  → RAG Advisor
  → Memory Advisor
  → Logging Advisor
  → 응답
```

동기 호출은 `CallAdvisor`, Streaming 호출은 `StreamAdvisor`로 확장할 수 있다. 동기 Advisor에서 다음 호출로 진행하는 핵심은 `nextCall`이다.

```java
@Override
public ChatClientResponse adviseCall(
        ChatClientRequest request,
        CallAdvisorChain chain) {

    long start = System.currentTimeMillis();
    ChatClientResponse response = chain.nextCall(request);
    long elapsed = System.currentTimeMillis() - start;

    log.info("모델 호출 시간: {}ms", elapsed);
    return response;
}
```

Advisor A 다음에 B가 등록되면 요청은 A → B → 모델 순서로 진행하고, 응답은 모델 → B → A 순으로 돌아온다. 웹 필터나 인터셉터 체인과 유사한 구조다.

대표적인 Advisor는 다음과 같다.

- `SimpleLoggerAdvisor`: 요청과 응답 정보 로깅
- `MessageChatMemoryAdvisor`: 이전 대화 메시지 추가
- `QuestionAnswerAdvisor`: Vector Store 검색 결과 추가
- `RetrievalAugmentationAdvisor`: 검색 과정을 세부 구성하는 RAG
- `SafeGuardAdvisor`: 금지어나 정책 기반의 요청 제한

Advisor Context는 Advisor 사이에서 공유하는 실행 정보다. Context에 값을 넣었다고 그 내용이 자동으로 모델의 Prompt에 추가되는 것은 아니다.

## 6. Embedding과 PgVector로 의미를 검색하기

문서에서 사용자가 입력한 단어와 정확히 같은 문자열만 찾는다면 키워드 검색으로도 충분하다. 하지만 표현이 달라도 의미가 비슷한 문서를 찾으려면 텍스트의 의미를 비교할 수 있는 표현이 필요하다.

Embedding Model은 텍스트를 고차원 숫자 벡터로 변환한다.

```text
"대한민국의 수도는 서울이다"
             ↓ Embedding Model
[0.018, -0.032, 0.104, ..., -0.027]
```

의미가 유사한 문장은 벡터 공간에서도 가까운 위치에 놓이도록 학습되어 있다. 질문을 같은 Embedding Model로 변환한 뒤 저장된 벡터와 거리를 계산하면 의미 기반 검색이 가능하다.

Spring AI의 `Document`는 일반적으로 다음 정보를 가진다.

- ID
- 텍스트 본문
- 출처와 페이지 같은 Metadata
- Embedding Vector

Vector Store는 Document 추가, 유사도 검색과 삭제 기능을 제공한다.

```java
SearchRequest request = SearchRequest.builder()
        .query(query)
        .topK(5)
        .similarityThreshold(0.3)
        .build();

List<Document> documents = vectorStore.similaritySearch(request);
```

`topK`는 가장 유사한 결과를 최대 몇 개 가져올지 정한다. `similarityThreshold`는 검색 결과가 넘어야 할 최소 유사도 기준이다.

```text
topK 증가
→ 참고 문서는 늘어남
→ 관련 없는 문서가 섞일 가능성도 증가

threshold 증가
→ 더 유사한 문서만 통과
→ 필요한 문서를 놓칠 가능성도 증가
```

실습에서는 PostgreSQL의 pgvector 확장을 Vector Store로 사용했다. 데이터베이스 테이블에는 본문, Metadata와 Embedding Vector가 함께 저장된다.

벡터 검색에서 가장 중요한 조건 중 하나는 저장 시점과 검색 시점에 호환되는 Embedding Model을 사용하는 것이다. 모델이 바뀌면 벡터 차원과 공간의 의미도 달라질 수 있으므로 기존 문서를 다시 Embedding해야 할 수 있다.

## 7. 로컬 BAAI/bge-m3 Embedding 모델로 전환하기

외부 Embedding API 대신 로컬 Ollama 컨테이너에서 BAAI의 `bge-m3` 모델을 실행하는 실습도 진행했다.

```text
Spring Boot
  → localhost:11436
  → Ollama Container
  → bge-m3 Embedding Model
```

프로필 설정은 Embedding 구현과 접속 주소를 분리한다.

```yaml
spring:
  ai:
    model:
      embedding: ollama
    ollama:
      base-url: ${BAAI_OLLAMA_BASE_URL:http://localhost:11436}
      embedding:
        model: ${BAAI_EMBEDDING_MODEL:bge-m3}
```

이 구조의 장점은 애플리케이션 코드를 크게 바꾸지 않고 설정으로 Embedding 제공자를 교체할 수 있다는 점이다. 반면 모델 컨테이너의 실행 상태, 포트, 메모리 사용량과 모델 다운로드는 직접 관리해야 한다.

로컬 모델로 전환한 뒤에는 기존 Vector Store 데이터와 새 모델의 벡터가 호환되는지 확인해야 한다. 실습 설정의 `remove-existing-vector-store-table` 값이 `true`이면 시작 과정에서 기존 테이블을 다시 만들 수 있으므로, 유지해야 할 데이터가 있는 환경에서는 반드시 설정을 검토해야 한다.

## 8. RAG를 위한 문서 ETL

RAG는 질문이 들어올 때 문서를 처음부터 모두 읽지 않는다. 먼저 문서를 검색 가능한 형태로 가공해 Vector Store에 저장한다.

```text
원본 문서
  → Extract
  → Transform
  → Load
  → Vector Store
```

### Extract

Extract 단계는 원본 파일을 Spring AI의 Document 목록으로 읽는다.

- TXT: `TextReader`
- PDF: `PagePdfDocumentReader`

```java
this.documents = new TextReader(
        resourceLoader.getResource(DOCUMENTS_PATH + fileName)
).get();
```

PDF는 페이지를 Document로 읽도록 설정할 수 있다.

```java
PdfDocumentReaderConfig config = PdfDocumentReaderConfig.builder()
        .withPagesPerDocument(1)
        .build();

this.documents = new PagePdfDocumentReader(
        resourceLoader.getResource(DOCUMENTS_PATH + fileName),
        config
).get();
```

### Transform

긴 문서를 그대로 Embedding하면 한 벡터에 여러 주제가 섞이고 검색 정확도가 낮아질 수 있다. `TokenTextSplitter`를 사용해 문서를 작은 Chunk로 나눈다.

```java
DocumentTransformer transformer = TokenTextSplitter.builder()
        .withChunkSize(200)
        .withMinChunkSizeChars(100)
        .withMinChunkLengthToEmbed(5)
        .withKeepSeparator(true)
        .build();

this.documents = transformer.apply(documents);
```

Chunk는 작을수록 좋은 것이 아니다.

| Chunk 크기 | 장점 | 단점 |
|---|---|---|
| 너무 작음 | 특정 문장을 세밀하게 검색 | 앞뒤 문맥과 의미 단위가 끊어짐 |
| 너무 큼 | 문맥을 넓게 유지 | 질문과 무관한 내용이 함께 검색됨 |
| 적정 크기 | 검색 정확도와 문맥 유지의 균형 | 문서 유형별 실험 필요 |

### Load

Load 단계에서는 각 Chunk의 Embedding을 생성해 Vector Store에 기록한다.

```java
documentWriter.write(documents);
```

같은 문서를 반복 적재하면 중복 제거 규칙이 없는 한 유사한 행이 계속 추가될 수 있다. 실제 서비스에서는 문서 ID, 버전, 출처를 Metadata에 기록하고 갱신·삭제 전략을 함께 설계해야 한다.

## 9. QuestionAnswerAdvisor로 RAG 완성하기

문서 적재가 끝나면 질문 시점에 관련 Chunk를 찾아 Prompt에 넣는다.

```text
사용자 질문
  → 질문 Embedding
  → Vector Store 유사도 검색
  → 관련 Chunk 반환
  → 원래 질문과 검색 문서를 Prompt에 결합
  → ChatModel 호출
  → 문서를 근거로 최종 답변 생성
```

간단한 RAG는 `QuestionAnswerAdvisor`로 구성할 수 있다.

```java
QuestionAnswerAdvisor ragAdvisor = QuestionAnswerAdvisor.builder(vectorStore)
        .searchRequest(SearchRequest.builder()
                .topK(5)
                .similarityThreshold(0.3)
                .build())
        .build();

this.chatClient = chatClientBuilder
        .defaultAdvisors(ragAdvisor, new SimpleLoggerAdvisor())
        .build();
```

RAG는 Retrieval, Augmentation, Generation의 약자다.

1. **Retrieval**: 질문과 관련된 문서를 검색한다.
2. **Augmentation**: 검색한 문서를 Prompt의 Context로 추가한다.
3. **Generation**: 모델이 질문과 Context를 이용해 답변한다.

RAG를 적용하면 모델이 학습할 때 알지 못했던 사내 문서, 최신 규정, 사용자가 제공한 자료를 근거로 답하게 할 수 있다. 그러나 환각이 완전히 사라지는 것은 아니다.

- 관련 Chunk를 검색하지 못할 수 있다.
- 원본 문서에 잘못된 정보가 있을 수 있다.
- 검색 문서를 모델이 잘못 해석할 수 있다.
- 관련 없는 Chunk가 Prompt를 오염시킬 수 있다.

따라서 실제 서비스에서는 검색 점수, 출처, 모델 응답과 실패 사례를 함께 관찰해야 한다.

## 10. Chat Memory로 대화의 연속성 만들기

각 모델 호출은 기본적으로 독립적이다. 첫 질문에서 이름을 말하고 두 번째 질문에서 “내 이름이 뭐였지?”라고 물어도 이전 메시지를 다시 전달하지 않으면 모델은 알 수 없다.

`MessageChatMemoryAdvisor`는 같은 대화의 이전 메시지를 현재 Prompt에 추가한다.

```java
this.chatClient = chatClientBuilder
        .defaultAdvisors(
                MessageChatMemoryAdvisor.builder(chatMemory).build(),
                new SimpleLoggerAdvisor()
        )
        .build();
```

요청마다 Conversation ID를 지정해 대화를 구분한다.

```java
return chatClient.prompt()
        .advisors(advisor -> advisor.param(
                ChatMemory.CONVERSATION_ID,
                session.getId()
        ))
        .user(request)
        .call()
        .content();
```

Conversation ID는 단순한 부가값이 아니다. 여러 사용자의 대화가 섞이지 않도록 메모리를 분리하는 기준이다.

`MessageWindowChatMemory`는 최근 N개의 메시지만 유지한다.

```java
MessageWindowChatMemory chatMemory = MessageWindowChatMemory.builder()
        .maxMessages(3)
        .build();
```

여기서 3은 세 개의 대화 Turn이 아니라 세 개의 Message다. 일반적으로 사용자 메시지 하나와 AI 응답 하나가 각각 별도의 Message로 계산된다.

### Message Memory와 Vector Memory

| 구분 | Message Window Memory | Vector Store Memory |
|---|---|---|
| 검색 기준 | 최근 시간 순서 | 현재 질문과의 의미 유사도 |
| 적합한 상황 | 직전 대화 맥락 유지 | 긴 기록에서 관련 기억 검색 |
| 주의점 | 오래된 중요 내용이 밀려남 | Embedding 및 검색 품질에 의존 |

기본 In-memory Repository를 사용하면 애플리케이션 재시작 시 기억이 사라진다. 지속적인 대화 기록이 필요하면 JDBC, Redis, MongoDB 같은 영속 저장소를 사용해야 한다.

### Memory와 RAG는 목적이 다르다

```text
Chat Memory
→ 이 사용자와 앞에서 무슨 대화를 했는가?

RAG
→ 외부 문서 중 현재 질문에 필요한 지식은 무엇인가?
```

두 기능은 모두 Context를 추가하지만, Memory는 대화 이력이고 RAG는 외부 지식이다.

## 11. Tool Calling으로 모델이 실제 기능을 사용하게 만들기

LLM은 현재 시간을 정확히 알거나 로컬 파일을 직접 읽을 수 없다. 최신 날씨를 조회하거나 데이터를 저장하는 일도 자연어 생성만으로 수행할 수 없다.

Tool Calling은 애플리케이션의 Java 메서드를 모델이 선택할 수 있는 도구로 제공한다.

```java
@Tool(description = "도시 이름으로 현재 날씨를 조회합니다. 예: Seoul")
public String getCurrentWeather(
        @ToolParam(
                description = "도시 이름, 예: Seoul",
                required = true
        ) String city) {
    return weatherClient.get(city);
}
```

도구는 ChatClient 요청에 등록한다.

```java
return chatClient.prompt()
        .user(request)
        .tools(dateTimeTools, fileSystemTool, weatherTools)
        .call()
        .content();
```

Tool Calling의 실제 흐름은 다음과 같다.

```text
1. 애플리케이션이 Tool 이름, 설명, 인자 스키마를 모델에 전달한다.
2. 모델이 사용자 질문을 보고 Tool 이름과 인자를 선택한다.
3. Spring AI가 선택된 Java 메서드를 실행한다.
4. 실행 결과를 ToolResponseMessage로 모델에 다시 전달한다.
5. 모델이 Tool 결과를 바탕으로 최종 답변을 생성한다.
```

모델이 Java 메서드를 직접 실행하는 것은 아니다. 모델은 실행할 도구와 인자를 결정하고, 실제 실행은 애플리케이션이 담당한다.

`@Tool`과 `@ToolParam`의 description은 단순한 문서가 아니다. 모델이 어떤 상황에서 도구를 선택하고 어떤 값을 인자로 넣을지 판단하는 핵심 정보다. 기능과 입력 조건을 구체적으로 작성해야 한다.

### 파일과 외부 API 도구의 안전성

도구는 실제 시스템에 영향을 줄 수 있으므로 일반 채팅보다 더 엄격하게 제한해야 한다.

- 파일 도구는 접근 가능한 기준 디렉터리를 고정한다.
- `..`를 이용한 상위 경로 이동을 차단한다.
- 읽을 수 있는 확장자를 제한한다.
- 기존 파일 덮어쓰기와 삭제는 별도 확인 절차를 둔다.
- API 입력값의 형식과 범위를 검증한다.
- API Key를 소스 코드에 넣지 않고 환경 변수나 Secret Manager로 주입한다.
- 쓰기 작업은 재시도되어도 중복 실행되지 않도록 멱등성을 고려한다.

## 12. MCP로 도구 연결을 표준화하기

`@Tool`로 만든 메서드는 같은 Spring 애플리케이션 안에서 쉽게 사용할 수 있다. 그러나 여러 AI 애플리케이션이 같은 도구를 공유하거나, 도구를 별도 프로세스와 서버로 분리하려면 연결 방법을 표준화할 필요가 있다.

MCP(Model Context Protocol)는 AI Client와 외부 Server 사이에서 Tool, Resource, Prompt를 발견하고 사용하는 방식을 정의한다.

```text
AI Application
  └─ MCP Client
       ↕ JSON-RPC
     MCP Server
       ├─ Tools
       ├─ Resources
       └─ Prompts
```

### Tool Calling과 MCP의 관계

Tool Calling과 MCP는 경쟁 기술이 아니라 서로 다른 층을 담당한다.

| 구분 | Tool Calling | MCP |
|---|---|---|
| 핵심 질문 | 모델이 어떤 함수를 호출할 것인가? | 외부 도구를 어떻게 발견하고 호출할 것인가? |
| 범위 | 모델과 애플리케이션의 함수 실행 루프 | Client와 Server 사이의 표준 통신 |
| 로컬 어노테이션 | `@Tool` | `@McpTool`로 서버 도구 공개 |

MCP Client는 초기화 과정에서 Server의 기능과 버전을 확인하고, `tools/list`로 도구를 발견한 뒤 `tools/call`로 실행한다. 반환된 결과는 다시 모델의 Tool Response로 사용된다.

### STDIO Transport

STDIO 방식에서는 Client가 MCP Server를 자식 프로세스로 실행하고 표준 입력과 출력으로 JSON-RPC 메시지를 교환한다.

```text
MCP Client
  └─ java -jar mcp-server.jar
       ├─ stdin  ← 요청
       └─ stdout → 응답
```

별도 HTTP 포트가 필요 없고 로컬 도구를 연결하기 쉽다. 하지만 stdout이 프로토콜 통신에 사용되므로 일반 로그를 섞으면 메시지 파싱이 깨질 수 있다. 로그는 stderr나 별도 파일로 보내야 한다.

### Streamable HTTP Transport

HTTP 방식에서는 MCP Server를 독립적으로 실행하고 Client가 `/mcp` endpoint로 접속한다.

```text
Spring Boot MCP Client :8080
           ↓ HTTP
Spring Boot MCP Server :8081/mcp
```

서버를 원격에 배포하거나 여러 Client가 공유하기에 적합하다. Stateful 방식은 세션을 유지할 수 있고, Stateless 방식은 각 요청을 독립적으로 처리하기 쉽다.

Spring AI MCP Client에서는 자동 구성된 `ToolCallbackProvider`를 ChatClient에 연결할 수 있다.

```java
return chatClient.prompt()
        .user(request)
        .tools(mcpToolCallbackProvider)
        .call()
        .content();
```

MCP Server에서는 Java 메서드를 외부에 공개한다.

```java
@McpTool(description = "ID로 사용자 정보를 조회합니다")
public User findUser(
        @McpToolParam(description = "사용자 ID", required = true)
        Long id) {
    return userService.findById(id);
}
```

기존 REST Controller와 MCP Tool은 같은 Service와 Repository를 재사용할 수 있다.

```text
REST Client → REST Controller ┐
                              ├→ Service → Repository → Database
MCP Client  → MCP Tool ───────┘
```

REST를 MCP로 대체하는 것이 아니라, 같은 비즈니스 기능을 사람과 일반 애플리케이션에는 REST로, AI Client에는 MCP로 제공하는 구조다.

## 13. Simple Agent는 역할과 도구를 가진 실행 단위다

Agent는 별도의 마법 같은 모델이 아니다. 모델에 목표와 역할을 주고, 그 목표를 수행하는 데 필요한 Context와 Tool을 함께 제공하는 설계 패턴이다.

```text
Agent
├─ System Prompt: 역할과 행동 규칙
├─ ChatClient: 모델 호출과 실행 흐름
├─ Tools: 실행 가능한 행동
├─ Chat Memory: 대화 이력
└─ RAG: 필요한 외부 지식
```

실습에서는 파일 관리와 날씨 안내를 서로 다른 Agent로 분리했다.

### File Manager Agent

- 현재 디렉터리의 파일 목록 조회
- 허용된 파일 내용 읽기
- 새로운 파일 생성
- 날짜와 시간 확인

### Weather Guide Agent

- 도시별 현재 날씨 조회
- 시간과 날짜를 포함한 안내
- 확인되지 않은 날씨를 추측하지 않는 규칙

두 Agent가 같은 LLM을 사용하더라도 System Prompt와 제공된 Tool이 다르면 역할과 행동 범위가 달라진다. 필요한 도구만 제공하는 것은 모델의 선택을 단순하게 만들 뿐 아니라 최소 권한 원칙에도 부합한다.

```text
질문: "부산 날씨를 알려줘"
→ Weather Guide Agent
→ Weather Tool 호출

질문: "현재 폴더 파일을 보여줘"
→ File Manager Agent
→ File System Tool 호출
```

## 14. Multi-Agent에서 Agent를 Tool처럼 사용하기

하나의 Agent에 모든 역할과 Tool을 넣으면 System Prompt가 복잡해지고 도구 선택의 범위도 커진다. Multi-Agent 구조에서는 역할을 전문 Agent로 나누고 상위 Orchestrator가 적절한 Agent에게 요청을 위임한다.

```text
사용자 요청
    ↓
Orchestrator Agent
    ├─ Weather Guide Agent
    └─ File Manager Agent
    ↓
결과 종합
    ↓
사용자 응답
```

하위 Agent를 호출하는 메서드를 `@Tool`로 감싸면 Orchestrator는 다른 Agent를 하나의 Tool처럼 사용할 수 있다.

```java
@Tool(description = "날씨 조회가 필요한 요청을 날씨 전문 Agent에 위임합니다")
public String delegateToWeatherGuide(
        String request,
        ToolContext toolContext) {

    String conversationId = toolContext.getContext()
            .get(CONVERSATION_ID_KEY)
            .toString();

    return weatherGuideAgent.ask(request, conversationId);
}
```

Orchestrator는 Agent 위임 Tool을 등록한다.

```java
this.chatClient = chatClientBuilder
        .defaultSystem("""
                당신은 작업 조정자입니다.
                요청을 분석해 적절한 전문 Agent에 위임하고
                결과를 종합해서 답변하세요.
                """)
        .defaultTools(agentDelegationTools)
        .build();
```

“서울의 날씨를 확인해 파일로 저장해줘” 같은 요청은 두 전문 Agent를 순차적으로 사용할 수 있다.

```text
1. Orchestrator가 날씨 조회 필요성을 판단
2. Weather Guide Agent에 조회 위임
3. 날씨 결과 수신
4. File Manager Agent에 파일 저장 위임
5. 저장 결과를 확인하고 최종 응답
```

`ToolContext`는 conversation ID 같은 실행 문맥을 하위 Agent에 전달하는 데 사용한다. 이 정보가 전달되지 않으면 상위 Agent와 하위 Agent가 서로 다른 대화로 처리할 수 있다.

Multi-Agent는 역할과 책임을 분리하지만 비용 없이 얻는 구조는 아니다.

- Agent별 LLM 호출로 지연과 비용 증가
- 잘못된 위임과 중복 실행 가능성
- Agent 사이에서 Context가 손실될 가능성
- Tool Calling이 반복되는 Loop 위험
- 전체 흐름을 관찰하기 위한 로그와 Trace 필요

따라서 최대 실행 단계, Timeout, 재시도, Tool 권한과 호출 기록을 함께 설계해야 한다.

## 15. 13번 종합 실습: 도메인 상담 Agent 설계

마지막 실습은 앞에서 배운 기능을 원하는 도메인에 결합하는 과정이다. 카페 주문, 게임 규칙, 학사 행정, IT 장애 지원처럼 문서 지식과 실제 업무 기능이 함께 필요한 주제를 선정한다.

```text
1. 도메인과 해결할 문제 정의
2. RAG용 TXT·PDF·JSON 문서 준비
3. 문서를 Chunk로 분할하고 PgVector에 적재
4. 유사도 검색과 RAG 답변 검증
5. 조회·계산·처리용 Tool 구현
6. Chat Memory로 연속 대화 구성
7. Structured Output DTO 정의
8. System Prompt와 Advisor, Tool을 ChatClient에 결합
9. 복합 질문으로 전체 흐름 테스트
```

최종 요청 흐름은 다음과 같이 정리할 수 있다.

```text
사용자 질문
   ↓
System Prompt
역할과 답변 규칙 적용
   ↓
Chat Memory
이전 대화 추가
   ↓
RAG Advisor
관련 도메인 문서 검색 및 추가
   ↓
Tool Calling
필요한 실시간 조회 또는 작업 실행
   ↓
ChatModel
정보를 종합해 응답 생성
   ↓
Structured Output
Record/DTO 형태로 변환
   ↓
API 응답
```

중요한 것은 모든 기능을 넣는 것보다 책임을 구분하는 것이다.

| 요구사항 | 담당 기능 |
|---|---|
| 상담 역할과 금지 규칙 | System Prompt |
| 이전 사용자 대화 | Chat Memory |
| 사내 문서와 도메인 지식 | RAG |
| 실시간 데이터와 실제 작업 | Tool Calling |
| 외부 도구의 표준 연결 | MCP |
| 프런트엔드가 사용할 응답 형식 | Structured Output |
| 여러 전문 역할의 협업 | Multi-Agent |

## 16. 실습 과정에서 만난 실행 문제

### 5432 포트 충돌

PgVector 컨테이너가 호스트의 5432 포트를 사용하려는데 로컬 PostgreSQL이나 다른 컨테이너가 이미 점유하면 실행할 수 없다.

```bash
lsof -nP -iTCP:5432 -sTCP:LISTEN
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

같은 호스트 포트를 두 프로세스가 동시에 사용할 수는 없다. 포트를 바꾸지 않으려면 기존 PostgreSQL 서비스나 해당 포트를 사용 중인 컨테이너를 중지하고 PgVector 컨테이너를 5432에 연결해야 한다.

DBeaver는 데이터베이스 서버가 아니라 접속 클라이언트다. 기존 연결을 끊어도 PostgreSQL 서버 프로세스가 종료되는 것은 아니며, 반대로 서버나 컨테이너를 중지하면 DBeaver 연결도 실패한다.

### Spring Boot의 8080 포트 충돌

각 실습은 독립된 Spring Boot 애플리케이션이고 대부분 8080을 사용한다. 다음 예제를 실행하기 전에 이전 Java 프로세스를 종료해야 한다.

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

### Gradle Wrapper 사용

프로젝트에 Wrapper가 있다면 로컬 Gradle 버전에 의존하지 않도록 다음과 같이 빌드한다.

```bash
./gradlew clean build -x test
java -jar ./build/libs/<생성된-jar-파일>.jar
```

Jar 파일명은 예제마다 다를 수 있으므로 `build/libs`를 확인한 뒤 실행한다.

### 의존성 주입 누락

PDF ETL Controller에 `pdfEtlService.extract(...)`를 추가했지만 필드나 생성자 주입이 없으면 컴파일러는 변수를 찾지 못한다.

```java
private final PdfEtlService pdfEtlService;

public RagEtlController(
        TxtEtlService txtEtlService,
        PdfEtlService pdfEtlService) {
    this.txtEtlService = txtEtlService;
    this.pdfEtlService = pdfEtlService;
}
```

Spring Bean으로 등록된 Service라도 사용하는 클래스에 참조가 자동으로 생기는 것은 아니다. 생성자나 필드로 주입해야 한다.

### 프로필과 외부 서비스

애플리케이션 빌드 성공은 OpenAI, Ollama, PostgreSQL, MCP Server까지 정상이라는 뜻이 아니다. 실행 전 다음 의존성을 구분해서 확인해야 한다.

```text
컴파일·빌드
→ Java 코드와 의존성 확인

애플리케이션 시작
→ 설정, Bean 생성, 포트 확인

실제 AI 요청
→ API Key, 모델, 네트워크 확인

RAG 요청
→ Embedding Model, PgVector, 적재 데이터 확인

MCP 요청
→ MCP Server, Transport, Endpoint 확인
```

## 17. 전체 구조에서 얻은 핵심 구분

Spring AI의 기능은 모두 모델에 Context나 능력을 추가하지만 각각의 책임은 다르다.

| 개념 | 핵심 역할 |
|---|---|
| Prompt | 이번 호출에서 모델에 전달할 지시와 질문 |
| ChatOptions | 모델의 생성 방식 조절 |
| Structured Output | 모델 응답을 Java 데이터 구조로 변환 |
| Advisor | 모델 호출 전후의 공통 처리 |
| Embedding | 텍스트 의미를 벡터로 표현 |
| Vector Store | 벡터 저장과 유사도 검색 |
| RAG | 외부 문서를 검색해 답변 근거로 제공 |
| Chat Memory | 같은 대화의 이전 메시지 유지 |
| Tool | 외부 조회나 실제 행동 실행 |
| MCP | 외부 도구·리소스 연결 표준화 |
| Agent | 역할, 규칙, 지식, 기억과 행동을 조합 |
| Orchestrator | 여러 전문 Agent에 작업을 위임하고 결과 종합 |

이를 한 문장으로 줄이면 다음과 같다.

> **Memory는 대화를 기억하고, RAG는 지식을 찾고, Tool은 행동하며, Agent는 이들을 목적에 맞게 조율하고, MCP는 외부 기능 연결을 표준화한다.**

## 18. 마무리

처음에는 Spring AI가 모델 API 호출을 간단하게 감싸는 라이브러리처럼 보였다. 하지만 실습이 진행될수록 핵심은 호출 방법보다 **AI 기능을 애플리케이션 구조 안에서 어떻게 분리하고 조립할 것인가**에 있다는 점이 드러났다.

ChatClient는 Prompt와 모델 호출을 하나의 흐름으로 묶었다. Structured Output은 자연어를 애플리케이션 데이터로 바꿨고, Advisor는 로깅·Memory·RAG를 비즈니스 코드에서 분리했다. Embedding과 PgVector는 문서를 의미로 검색하게 했으며, Tool Calling은 모델의 판단을 실제 Java 기능으로 연결했다. MCP는 이 도구를 프로세스와 서버의 경계 밖으로 확장했고, Agent와 Multi-Agent는 역할과 책임을 기준으로 전체 실행을 조직했다.

최종적으로 Spring AI 애플리케이션은 다음과 같은 구조로 읽을 수 있다.

```text
사용자의 자연어 요청
        ↓
Prompt로 목적과 규칙 전달
        ↓
Memory와 RAG로 Context 구성
        ↓
LLM이 답변 또는 Tool 사용 판단
        ↓
로컬 Tool이나 MCP Tool 실행
        ↓
Agent가 결과 종합
        ↓
Structured Output으로 API 응답
```

모델이 모든 것을 해결하도록 기대하는 대신, 기억할 정보와 검색할 지식, 실행 가능한 행동과 응답 계약을 각각 분리해 제공하는 것이 안정적인 AI 애플리케이션 설계의 출발점이다.

## 정리 기준 자료

- `spring AI 이해_이용우.pdf`
- `01.training-code`
- `02.answer-code`
