---
title: "Vector DB와 RAG 검색"
date: "2026-10-27"
description: "문서 청킹과 다국어 임베딩, 거리 함수와 HNSW, FAISS·Qdrant, 메타데이터 필터, BM25·RRF·Reranker, RAGAS 평가와 캐시 재현성까지 Vector DB 기반 RAG의 핵심 기술을 정리"
category: ["AI"]
tags: ["VectorDB", "RAG", "Search"]
---

Vector DB에 문서를 저장하고 비슷한 청크를 찾는 것만으로 RAG의 답변 품질이 결정되지는 않습니다. 검색할 단위를 어떻게 나누는지, 벡터의 거리를 어떤 기준으로 계산하는지, 후보를 어떻게 결합하고 평가하는지가 함께 작동합니다.

**벡터 유사도는 후보를 찾는 기준이며, 답변에 필요한 근거를 모두 확보했는지와 생성된 주장이 정확한지는 별도로 확인해야 합니다.**

이 글은 Vector DB 기반 RAG를 문서 표현, 검색 인덱스, 후보 결합, 문맥 구성, 품질 평가의 관점에서 정리합니다. 코드와 설정은 구조를 설명하기 위한 예시이며, 특정 값이 모든 데이터에 적합하다는 의미는 아닙니다.

---

## 1. RAG와 Vector DB의 역할 나누기

RAG는 외부에서 검색한 정보를 생성 모델의 입력에 연결하는 구조입니다. Vector DB는 이 과정에서 벡터와 메타데이터를 저장하고 유사한 항목을 찾는 역할을 맡습니다.

```text
문서 준비
원본 문서 → 텍스트·구조 추출 → 청크 → 임베딩 → 벡터·메타데이터 저장

질문 처리
질문 → 질의 임베딩 → 후보 검색·필터 → 재정렬
     → 문맥 구성 → 답변 생성 → 근거·인용 확인
```

| 구성 요소 | 담당하는 문제 |
| --- | --- |
| Parser·Loader | 원문에서 텍스트와 구조 추출 |
| Chunker | 검색할 정보 단위 결정 |
| Embedding Model | 질문·문서를 비교 가능한 표현으로 변환 |
| Vector Index | 가까운 벡터를 효율적으로 탐색 |
| Vector DB | 벡터·payload·검색 API·저장 관리 |
| Retriever·Reranker | 후보 확보와 질문별 재정렬 |
| Generator | 선택한 문맥에 기반한 답변 생성 |
| Evaluator | 검색·답변·근거의 품질 측정 |

Vector DB가 답변을 생성하거나 문서 내용의 사실 여부를 판정하는 것은 아닙니다. RAG의 검색 대상도 Vector DB에 한정되지 않습니다. BM25 검색 엔진이나 SQL 조회 결과를 함께 사용할 수 있습니다.

---

## 2. 문서 추출: 텍스트와 출처를 함께 보존하기

PDF의 텍스트 추출 결과는 화면에서 읽는 순서와 다를 수 있습니다. 표의 열이 섞이거나, 제목과 본문이 붙거나, 숫자와 단위가 분리되면 이후 단계에 잘못된 정보가 전달됩니다.

```python
# 설명용 청크 표현. page는 실제 PDF 페이지의 1-based 번호입니다.
chunk = {
    "chunk_id": "document-hash:12:350",
    "doc_id": "manual-001",
    "source": "equipment-manual.pdf",
    "page": 12,
    "start_char": 350,
    "text": "정격 출력은 100kW이며 적용 조건은 ...",
}
```

문서 ID는 문서를 식별하고, 청크 ID는 문서 안의 특정 조각을 식별합니다. 파일명과 페이지는 인용에, 원문 해시와 위치는 갱신·중복 확인·오류 추적에 활용할 수 있습니다.

스캔 문서는 OCR이 필요할 수 있습니다. 표는 텍스트만 이어 붙이기보다 행·열 관계와 단위를 유지해야 합니다. 임베딩 모델은 추출 과정에서 이미 사라진 조건이나 단위를 복원해 주는 장치가 아닙니다.

---

## 3. Chunking: 검색 단위와 답변 문맥을 설계하기

작은 청크는 질문의 특정 사실과 대응하기 쉽지만 주변 조건을 잃을 수 있습니다. 큰 청크는 문맥을 보존하는 대신 여러 주제가 섞이고 입력 토큰을 많이 사용합니다.

| 방식 | 경계를 정하는 기준 | 고려할 점 |
| --- | --- | --- |
| Fixed-size | 일정 문자·토큰 수 | 구현이 단순하지만 문장·표가 잘릴 수 있음 |
| Recursive | 문단·줄·공백 등의 경계 | 구조가 추출된 품질에 영향받음 |
| Semantic | 인접 구간의 의미 변화 | 임베딩 계산과 경계 임계값 설계 필요 |
| Parent-Child | 작은 검색 단위와 큰 전달 단위 분리 | 부모 연결·문맥 크기·중복 관리 필요 |

`RecursiveCharacterTextSplitter`의 기본 길이 계산이 문자 수라면 `chunk_size=500`, `chunk_overlap=50`은 500글자와 50글자 목표값입니다. 500토큰을 뜻하지 않으며, 구분자에 따른 분할 결과가 모든 위치에서 정확히 50글자씩 겹치는 것도 아닙니다. [Recursive Splitter 문서](https://docs.langchain.com/oss/python/integrations/splitters/recursive_text_splitter)

Overlap은 경계 손실을 줄이지만 같은 문장이 여러 번 검색되는 원인이 됩니다. 청크 크기를 조정할 때는 검색 적합성뿐 아니라 최종 문맥의 중복률과 토큰 수도 함께 확인해야 합니다.

---

## 4. Embedding Model: 차원·길이·언어 성능은 다른 기준이다

임베딩 모델은 텍스트를 벡터로 변환합니다. 문서와 질문이 같은 의미 공간에서 비교될 수 있어야 하므로 모델과 전처리 규칙을 호환되게 사용해야 합니다.

| 기준 | 의미 | 영향을 받는 부분 |
| --- | --- | --- |
| Vector Dimension | 벡터의 좌표 수 | 저장량·거리 계산량 |
| Maximum Sequence Length | 한 번에 처리할 입력 토큰 수 | 긴 청크의 잘림 여부 |
| 언어·도메인 적합성 | 특정 언어·분야의 표현 능력 | 실제 질문의 검색 품질 |
| Throughput·Latency | 처리량·응답 지연 | 색인 시간·질의 비용 |
| Benchmark | 정해진 태스크에서의 평가 결과 | 후보 모델 비교 |

예를 들어 BGE-M3는 1,024차원, 최대 8,192토큰을 지원하며 다국어와 Dense·Sparse·Multi-vector 표현을 다룹니다. 다만 애플리케이션에서 `max_seq_length=512`로 제한하면 실제로 처리하는 범위는 그 설정을 따릅니다. 모델의 지원 상한과 실행 설정을 구분해야 합니다. [BGE-M3 모델 카드](https://huggingface.co/BAAI/bge-m3)

다국어 모델은 언어가 다른 질문과 문서를 직접 비교하는 데 사용할 수 있습니다. 임베딩 전에 번역 API를 반드시 거쳐야 하는 것은 아닙니다. 또한 BGE-M3의 Dense 벡터만 사용한 구현을 모델의 Sparse·Multi-vector 기능까지 활용한 것으로 설명하면 안 됩니다.

MTEB는 임베딩을 여러 태스크와 데이터셋에서 평가하는 프레임워크입니다. 종합 순위만 보기보다 한국어·다국어 검색 등 목표와 가까운 평가를 확인하고 실제 질의셋에서도 비교해야 합니다. [MTEB 프로젝트](https://github.com/embeddings-benchmark/mteb)

---

## 5. 거리 함수와 정규화: 같은 벡터라도 기준을 맞춰야 한다

대표적인 비교 기준은 내적, 코사인 유사도, 유클리드 거리입니다.

$$
\operatorname{cos}(q,d)=\frac{q\cdot d}{\|q\|\|d\|}
$$

두 벡터를 각각 L2 정규화하면 길이가 1이므로 내적과 코사인 유사도가 같습니다.

$$
\hat q\cdot\hat d=\operatorname{cos}(q,d),\qquad
\|\hat q-\hat d\|^2=2-2\operatorname{cos}(q,d)
$$

따라서 정규화된 벡터에서는 내적의 내림차순과 제곱 L2 거리의 오름차순이 이론적으로 같은 순서를 만듭니다. 다만 근사 검색, 동점 처리와 수치 정밀도에 따라 실제 반환 결과는 달라질 수 있습니다.

```python
import numpy as np


def normalize(vectors):
    values = np.asarray(vectors, dtype="float32")
    if not np.isfinite(values).all():
        raise ValueError("Non-finite vector")
    lengths = np.linalg.norm(values, axis=1, keepdims=True)
    if (lengths < 1e-8).any():
        raise ValueError("Zero vector")
    return np.ascontiguousarray(values / lengths)
```

문서만 정규화하거나 질문만 정규화한 설정은 목적에 맞는지 따로 확인해야 합니다. FAISS에서 코사인 검색을 내적으로 구현할 때는 문서와 질의 모두를 정규화합니다. FAISS의 L2 반환값은 제곱 거리입니다. [FAISS 거리 함수 설명](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances)

어느 기준에서도 검색 점수 0.9를 정답 확률 90%로 해석해서는 안 됩니다.

---

## 6. FAISS와 Qdrant: 인덱스 라이브러리와 저장 서비스

FAISS는 벡터 인덱싱과 유사도 검색을 위한 라이브러리입니다. Qdrant는 벡터와 payload를 관리하고 검색·필터 API를 제공하는 Vector DB입니다.

| 항목 | FAISS | Qdrant |
| --- | --- | --- |
| 중심 역할 | 인덱스 생성·벡터 검색 | 벡터·payload·검색 서비스 관리 |
| 본문·메타데이터 | 애플리케이션에서 연결 가능 | Point의 payload로 함께 관리 |
| 저장 | 인덱스 파일 저장·복원 가능 | 데이터 저장소와 서버 운영 기능 |
| 조건 검색 | 인덱스·ID 선택·별도 구현 방식 고려 | payload 조건을 검색 요청에 포함 |
| 사용 관점 | 애플리케이션 내부 검색 구성 | 여러 클라이언트가 사용하는 검색 Backend 구성 |

“FAISS는 메모리 전용이라 영구 저장할 수 없다”는 설명은 부정확합니다. `write_index`와 `read_index`로 인덱스를 저장하고 복원할 수 있습니다. 본문·메타데이터와 인덱스 파일의 대응 관계는 별도로 관리해야 합니다. [FAISS 인덱스 저장 문서](https://github.com/facebookresearch/faiss/wiki/Index-IO,-cloning-and-hyper-parameter-tuning)

두 도구를 비교할 때는 동일한 문서·질의 벡터와 거리 기준을 사용해야 합니다. 결과가 일치한다는 것은 구성의 일관성을 확인하는 증거이며, 그 자체가 정답 근거를 찾았다는 증거는 아닙니다.

---

## 7. Exact Search와 ANN: 정확도와 탐색 비용의 교환

Exact Search는 전체 후보를 비교해 설정된 거리 기준의 최근접 이웃을 찾습니다. Dense 벡터를 전수 비교하는 비용은 대략 벡터 수와 차원 수에 비례합니다.

ANN은 Approximate Nearest Neighbor, 근사 최근접 이웃 검색입니다. 일부 공간이나 그래프를 탐색해 계산량을 줄이는 대신 정확한 최근접 이웃을 놓칠 수 있습니다.

| 계열 | 접근 | 주요 조정 대상 |
| --- | --- | --- |
| Flat | 전체 벡터 비교 | 배치·하드웨어·벡터 수 |
| HNSW | 계층적 근접 그래프 탐색 | 연결 수·탐색 후보 폭 |
| IVF | 벡터 공간을 구역으로 나누고 일부 구역 탐색 | 구역 수·검색할 구역 수 |
| Quantization | 벡터 표현 압축 | 저장량·근사 오차·재점수화 |

인덱스 구조와 압축은 조합할 수 있습니다. HNSW를 쓴다는 이유만으로 벡터가 자동 압축되는 것은 아닙니다. 작은 데이터에서는 전수 검색이 충분히 빠를 수도 있으므로 ANN의 이득은 데이터 크기와 실제 지연 시간으로 확인해야 합니다. [FAISS 인덱스 종류](https://github.com/facebookresearch/faiss/wiki/Faiss-indexes)

---

## 8. HNSW: 계층 그래프와 세 가지 조정 값

HNSW는 벡터를 근접 관계의 그래프로 연결하고 여러 층을 이용해 탐색합니다. 상위 층에서 이동 방향을 좁힌 뒤 하위 층에서 가까운 후보를 더 자세히 찾는 방식입니다.

```text
상위 층: 적은 노드를 통해 탐색 위치를 크게 이동
    ↓
중간 층: 가까운 영역으로 이동
    ↓
하위 층: 후보 이웃을 비교하며 결과 선택
```

| 파라미터 | 의미 | 증가시 주로 고려할 비용 |
| --- | --- | --- |
| M / m | 그래프 연결 수를 조절하는 값 | 인덱스 메모리·구축 비용 |
| efConstruction / ef_construct | 구축 중 비교할 후보 폭 | 구축 시간 |
| efSearch / hnsw_ef | 질의 중 탐색할 후보 폭 | 검색 지연·계산량 |
| top_k / limit | 최종 반환할 결과 수 | 결과 전송·후속 문맥 처리 |

`hnsw_ef=128`과 `limit=5`는 서로 다른 설정입니다. 128은 탐색 후보 폭을, 5는 반환 개수를 조절합니다. 연결 수와 탐색 폭을 늘리면 재현율을 높이는 방향으로 조정할 수 있지만 데이터·필터·구현에 따른 검증이 필요합니다. `M`을 모든 층의 실제 간선 수가 정확히 같다는 뜻으로 읽어서도 안 됩니다. [HNSWlib 파라미터 설명](https://github.com/nmslib/hnswlib)

설정에 HNSW가 있다고 실제 요청이 항상 HNSW를 사용하는 것도 아닙니다. Qdrant는 데이터 규모·세그먼트·필터에 따라 검색 계획을 달리할 수 있습니다. 인덱스 상태와 실제 탐색 조건을 함께 확인해야 합니다. [Qdrant 인덱싱 문서](https://qdrant.tech/documentation/manage-data/indexing/)

---

## 9. 벡터 메모리와 Quantization

압축하지 않은 Dense 벡터의 순수 좌표 저장량은 다음과 같이 계산할 수 있습니다.

$$
\text{bytes}=N\times D\times B
$$

여기서 $N$은 벡터 수, $D$는 차원, $B$는 좌표당 바이트 수입니다. 1,024차원 Float32 벡터 100만 개는 약 4.096GB, 이진 단위로 약 3.81GiB입니다. 그래프·메타데이터·원문·복제·런타임 메모리는 포함하지 않은 계산입니다.

| 표현 | 좌표당 크기 | Float32 대비 순수 벡터 크기 |
| --- | --- | --- |
| Float32 | 32bit | 1 |
| 8bit Scalar Quantization | 8bit | 약 1/4 |
| 1bit Binary Quantization | 1bit | 약 1/32 |

양자화는 저장·비교 비용을 줄이는 대신 거리 계산의 오차를 만들 수 있습니다. 압축 벡터로 후보를 찾고 원본 벡터로 다시 점수를 계산하는 방식도 사용할 수 있습니다. 원본을 함께 저장하면 전체 저장량이 단순히 위 비율만큼 줄어들지는 않습니다. [Qdrant 양자화 문서](https://qdrant.tech/documentation/manage-data/quantization/)

임베딩 추론을 FP16으로 수행하는 것, 저장된 벡터를 양자화하는 것, 생성 LLM의 가중치를 4bit로 압축하는 것은 서로 다른 작업입니다. 각각 계산 자원과 품질에 미치는 영향을 따로 측정해야 합니다.

---

## 10. Metadata Filtering: 유사한 문서 중 조건에 맞는 범위 찾기

벡터 유사도만으로는 문서 버전·적용일·문서 종류 같은 조건을 보장하기 어렵습니다. 이때 payload 필터로 검색 범위를 제한할 수 있습니다.

```python
# Qdrant 검색 요청의 필터 부분을 보여 주는 축약 예시입니다.
from qdrant_client import models

query_filter = models.Filter(
    must=[
        models.FieldCondition(
            key="doc_id", match=models.MatchValue(value="manual-001")
        ),
        models.FieldCondition(key="page", range=models.Range(gte=5)),
    ]
)
```

이 조건은 `doc_id = manual-001 AND page >= 5`입니다. 필드의 타입도 중요합니다. 페이지나 날짜 범위를 문자열의 정렬 순서에 맡기면 의도한 수치·시간 비교와 달라질 수 있습니다. [Qdrant 필터 문서](https://qdrant.tech/documentation/search/filtering/)

전체 검색 Top-5를 먼저 받고 애플리케이션에서 조건에 맞지 않는 결과를 지우면, 조건에 맞는 유효 후보를 충분히 확보하지 못할 수 있습니다. 검색 요청의 필터와 검색 후 화면용 필터는 구분해야 합니다.

권한 조건을 적용한다면 허용 문서의 판정은 신뢰할 수 있는 서버 로직에서 수행해야 합니다. 프롬프트에 “권한 없는 문서를 보여 주지 마라”라고 쓰는 것은 검색 대상 제한을 대신하지 못합니다.

---

## 11. BM25: 정확한 용어와 한국어 토큰화

Dense 검색은 표현이 다른 문장을 찾는 데 유용하지만 제품명·규정 번호·약어처럼 정확한 문자열이 중요한 질문은 어휘 검색을 함께 고려할 수 있습니다.

BM25는 질의어와 문서의 단어 일치를 바탕으로 단어 빈도, 문서 빈도, 문서 길이를 반영합니다. 어떤 문자열을 하나의 토큰으로 볼 것인지가 검색 결과에 영향을 줍니다. [BM25 유사도 설정](https://www.elastic.co/docs/reference/elasticsearch/index-settings/similarity)

```text
영문·숫자 토큰: MI400, HBM4, 432GB
한국어 어절: 반도체산업
한국어 bigram: 반도, 도체, 체산, 산업
```

형태소 분석기, 어절 분할, 문자 n-gram은 서로 다른 접근입니다. n-gram은 부분 문자열을 찾는 데 도움이 되지만 무관한 단어가 같은 조각을 공유할 수도 있습니다. “한국어를 지원한다”는 설명만으로 토큰화 품질을 판단할 수는 없습니다.

또한 Dense 검색이 정확한 코드 질의에 반드시 실패하는 것은 아닙니다. Hybrid 검색의 필요성은 실제 질문별 누락과 잡음을 측정해 판단해야 합니다.

---

## 12. Hybrid Search와 RRF: 점수가 다른 검색 결과 결합하기

BM25 점수와 Dense 유사도는 척도가 다릅니다. 원점수를 그대로 더하면 한쪽 검색기의 값 범위가 결합 결과를 지배할 수 있습니다. 점수를 정규화해 결합하거나 순위를 이용하는 방법을 사용할 수 있습니다.

RRF는 각 검색 결과에 나타난 순위를 이용합니다.

$$
\operatorname{RRF}(d)=\sum_{j:\,d\in L_j}\frac{1}{c+\operatorname{rank}_j(d)}
$$

순위는 1부터 계산하며, 해당 검색 결과에 없는 청크는 그 검색기의 기여가 0입니다. 결합 상수 $c$와 최종 반환 개수 $K$는 다른 값입니다. [RRF 원논문 정보](https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/)

```python
from collections import defaultdict


def reciprocal_rank_fusion(rankings, constant=60):
    scores = defaultdict(float)
    for ranking in rankings:
        # 같은 검색 결과 안의 중복 ID는 한 번만 반영합니다.
        for rank, chunk_id in enumerate(dict.fromkeys(ranking), start=1):
            scores[chunk_id] += 1.0 / (constant + rank)
    return sorted(scores, key=lambda key: (-scores[key], key)), dict(scores)
```

예를 들어 Dense의 1위 A, 2위 B와 BM25의 1위 B, 2위 C를 결합하면 B는 두 검색기의 기여를 받습니다. A와 C를 한쪽 목록에 없다는 이유로 그 목록의 1위로 처리하면 잘못된 결과가 됩니다.

후보를 묶는 기준도 정해야 합니다. 같은 페이지라도 청크가 다를 수 있으므로 페이지 번호만으로 병합하면 서로 다른 근거를 잃을 수 있습니다.

---

## 13. Reranker: 넓게 찾은 후보를 정밀하게 재정렬하기

Bi-encoder는 질문과 문서를 각각 벡터화하므로 문서 벡터를 미리 계산할 수 있습니다. Cross-encoder는 질문과 후보 문서를 함께 입력해 관련성을 계산하므로 보통 1차 검색 이후의 좁은 후보 집합에 적용합니다. [Retrieve & Re-Rank 설명](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)

```text
Dense 상위 50개 ─┐
                 ├→ 청크 ID 기준 RRF → 상위 30개 → Cross-encoder → 최종 5개
BM25 상위 50개 ──┘
```

최대 100개 후보가 생길 수 있지만 중복 청크가 있으면 더 적습니다. 50은 검색기별 후보 수, 30은 재정렬할 후보 수, 5는 최종 문맥 수입니다.

BGE Reranker의 원점수나 sigmoid 변환값은 후보를 정렬하는 점수입니다. 0과 1 사이로 변환됐다는 이유만으로 보정된 정답 확률이 되는 것은 아닙니다. [BGE Reranker 모델 카드](https://huggingface.co/BAAI/bge-reranker-v2-m3)

재정렬은 입력에 없는 청크를 추가할 수 없습니다. 정답이 Dense·BM25 후보에는 있지만 RRF 상위 30개에서 잘려 나갔다면 Reranker도 볼 수 없습니다. **후보 검색, 후보 절단, 재정렬, 최종 선택을 각각 관찰해야 합니다.**

---

## 14. Context 구성: Top-K만으로 해결되지 않는 문제

비슷한 청크 5개가 서로 다른 근거 5개를 뜻하지는 않습니다. 같은 페이지의 인접 청크가 반복되면 문맥 대부분이 같은 정보로 채워질 수 있습니다.

| 문제 | 고려할 구성 방식 |
| --- | --- |
| 같은 내용 반복 | 인접 청크 병합·중복 제거 |
| 여러 보고서 종합이 필요한데 한 문서에 편중 | 문서별 후보 확보·출처 다양성 제어 |
| 작은 청크에 조건·예외가 없음 | 부모 문단·주변 구간 확장 |
| 질문이 여러 하위 요구를 포함 | 질문 분해 후 하위 질의별 검색 |
| 컨텍스트가 너무 길어짐 | 토큰 예산·근거 선택·조건 보존형 압축 |

LLM의 Context Window는 검색 문서만을 위한 공간이 아닙니다. 시스템 지침, 질문, 대화 이력, 검색 근거와 출력 토큰을 함께 고려해야 합니다.

문서의 개수를 고정하기보다 필요한 사실이 포함됐는지 확인하는 것이 중요합니다. 정의 질문은 한 문단으로 충분할 수 있지만 여러 정책을 비교하는 질문은 출처가 다른 문서가 필요할 수 있습니다.

---

## 15. 검색 평가: ANN 정확도와 근거 검색 품질 구분하기

ANN이 Exact Search의 최근접 이웃을 얼마나 재현하는지와, 그 결과가 답변 근거인지 여부는 다른 문제입니다.

| 평가 | 비교 기준 |
| --- | --- |
| ANN의 이웃 재현 | 같은 벡터 공간의 Exact Top-K |
| 검색 정밀도 | 사람이 정의한 관련 청크·문서 |
| 검색 재현율 | 질문별 전체 관련 근거 집합 |
| 저장소 결과 일치 | 동일 입력으로 두 구현이 반환한 항목 |

관련 근거 집합을 $G$, 상위 $K$개의 결과를 $R_K$라고 하면 다음과 같습니다. 결과가 $K$개 반환된 경우를 가정합니다.

$$
\operatorname{Precision@K}=\frac{|R_K\cap G|}{K},\qquad
\operatorname{Recall@K}=\frac{|R_K\cap G|}{|G|}
$$

정답 근거 하나라도 찾았는지는 Hit Rate로, 첫 관련 결과의 위치는 MRR로 확인할 수 있습니다. 여러 근거를 종합하는 질문에서는 첫 관련 결과만 높게 나오는 것으로 충분하지 않을 수 있습니다.

전체 관련 페이지를 조사하지 않고 대표 페이지 몇 개만 표시했다면, 그 페이지의 검색 도달률을 전체 코퍼스 Recall@K라고 부르면 안 됩니다. 평가 단위를 청크·페이지·문서 중 무엇으로 정했는지도 명시해야 합니다.

---

## 16. RAGAS: 검색 문맥과 생성 답변을 나누어 평가하기

RAGAS는 검색 문맥·응답·참조 답변 등을 이용해 품질을 평가하는 프레임워크입니다. 여기서는 실제 비교에 사용한 0.2.15의 지표를 기준으로 설명합니다.

| 지표 | 주로 확인하는 대상 | 의미 |
| --- | --- | --- |
| Faithfulness | 생성 답변과 검색 문맥 | 답변의 주장이 문맥으로 뒷받침되는가 |
| Answer Relevancy | 생성 답변과 사용자 질문 | 답변에서 역생성한 질문이 원질문과 관련되는가 |
| Context Precision | 검색 문맥의 유용성과 순위 | 유용한 문맥이 상위에 위치하는가 |
| Context Recall | 참조 답변의 주장과 문맥 | 참조 답변의 주장을 문맥이 얼마나 뒷받침하는가 |

Faithfulness는 답변에서 추출한 주장 중 문맥이 뒷받침하는 비율을 계산합니다. 원문 자체의 오류나 최신성까지 검증하는 지표는 아닙니다. 높은 점수라도 실제 세계의 사실 정확성, 질문의 모든 요구 충족, 개별 인용 위치의 정확성을 보장하지 않습니다. [Faithfulness 문서](https://docs.ragas.io/en/v0.2.15/concepts/metrics/available_metrics/faithfulness/)

Answer Relevancy는 답변에서 질문을 역생성하고 원질문과의 임베딩 유사도를 사용합니다. 0.2.15의 구현에는 비확답 판정도 반영되므로 수치를 언급한 답변도 유보·회피 표현에 따라 낮은 점수를 받을 수 있습니다. 사실 정확성과 같은 지표는 아닙니다. [Response Relevancy 문서](https://docs.ragas.io/en/v0.2.15/concepts/metrics/available_metrics/answer_relevance/), [0.2.15 구현](https://github.com/explodinggradients/ragas/blob/v0.2.15/src/ragas/metrics/_answer_relevance.py)

### Context Precision은 단순 Precision@K와 다르다

LLM 기반 Context Precision은 청크의 유용성을 판정하고 관련 청크의 순위를 반영하는 Average Precision 형태로 집계합니다.

$$
\operatorname{ContextPrecision}=\frac{\sum_{k=1}^{K}\operatorname{Precision@k}\,v_k}{\sum_{k=1}^{K}v_k}
$$

여기서 $v_k$는 해당 청크의 관련성 판정입니다. 관련 청크가 없는 경우의 처리도 구현을 확인해야 합니다. `LLMContextPrecisionWithReference`는 참조 답변에 대한 유용성을 판단합니다. 단순히 유용한 청크 수를 $K$로 나누는 Precision@K와 구분해야 합니다. [Context Precision 문서](https://docs.ragas.io/en/v0.2.15/concepts/metrics/available_metrics/context_precision/)

LLM 기반 Context Recall의 단위는 참조 답변에서 나눈 주장입니다. 전체 관련 문서의 개수를 세는 정보검색 Recall@K와 같지 않습니다. [Context Recall 문서](https://docs.ragas.io/en/v0.2.15/concepts/metrics/available_metrics/context_recall/)

---

## 17. LLM-as-a-Judge: 평가 모델도 검증 대상이다

평가 LLM은 문장을 오해하거나, 언어가 다른 동등 표현을 근거 불일치로 판단하거나, 수치의 대상과 발표 시점을 혼동할 수 있습니다. 생성과 평가에 같은 모델을 사용하면 두 역할의 편향이 겹칠 수 있습니다.

```text
답변 생성 성공
  ≠ JSON 형식 검증 성공
  ≠ 근거 판정 성공
  ≠ 실제 사실 정확성 확인
```

구조화 출력은 필수 필드·타입 같은 계약을 확인하는 수단입니다. `supported: true`라는 올바른 형식의 JSON이 나와도 그 판정 자체가 맞는지는 별도 문제입니다.

출력이 중단돼 파싱할 수 없는 경우와, 정상 출력으로 낮은 점수가 나온 경우도 구분해야 합니다. 전자는 기술적 재시도 대상으로 기록할 수 있지만 후자의 점수가 마음에 들지 않는다고 반복해 높은 값만 선택하면 비교가 왜곡됩니다. 복구 과정에서 출력 언어나 스키마 제약을 바꿨다면 그 조건도 남겨야 합니다.

### 세 번 호출했다는 사실과 세 표본을 생성했다는 사실

역질문을 3개 생성하도록 설계해도 세 요청의 프롬프트·seed·캐시 키가 모두 같으면 같은 응답을 재사용할 수 있습니다.

```text
잘못된 표본 구성
동일 프롬프트 + seed 42 → 같은 캐시 항목을 3회 사용

구분된 요청 구성
동일 프롬프트 + seed 42 / 43 / 44 → 서로 다른 요청 캐시 항목
```

여러 출력을 요청하는 어댑터에서는 표본 번호를 seed에 반영하고 sampling temperature도 명시할 수 있습니다. 서로 다른 seed를 써도 같은 역질문이 생성될 수 있으며, 세 요청이 세 개의 서로 다른 문장이나 완전히 독립적인 표본을 보장하지는 않습니다.

지표 이름과 `strictness=3`만 기록하는 것보다 실제 요청 수, seed, 생성된 역질문과 캐시 사용 여부를 남겨야 평가 과정을 검토할 수 있습니다.

---

## 18. 로컬 모델과 데이터 영속성

검색용 임베딩 모델, 재정렬 모델, 생성 LLM, 평가 LLM은 역할이 다릅니다. 하나의 모델이 모든 역할을 맡아야 하는 것은 아닙니다.

| 역할 | 구성 예 |
| --- | --- |
| 문서·질의 임베딩 | 로컬 BGE-M3 |
| 후보 재정렬 | 로컬 BGE Reranker |
| 답변 생성 | Ollama의 로컬 LLM |
| 답변 평가 | 별도 평가 프롬프트를 사용하는 로컬 LLM |
| 검색 저장소 | 로컬 프로세스 또는 Qdrant 서버 |

모델 가중치를 다운로드하는 단계와 문서를 입력해 추론하는 단계는 구분할 수 있습니다. 로컬 구성을 검토할 때는 모델뿐 아니라 임베딩 호출, 평가 Backend와 추적 전송 설정도 확인해야 합니다. 로컬 실행이라는 표현만으로 모든 네트워크 경로가 사라지는 것은 아닙니다.

Qdrant를 컨테이너로 실행할 때는 저장 경로를 호스트 디스크에 연결해 컨테이너를 교체한 뒤에도 데이터를 다시 사용할 수 있습니다.

```yaml
services:
  qdrant:
    image: qdrant/qdrant:v1.15.5
    ports:
      - "127.0.0.1:6333:6333"
    volumes:
      - ./work/qdrant_storage:/qdrant/storage
```

위 버전은 비교 실험에서 사용한 버전입니다. 최신 버전을 의미하지 않습니다. 볼륨은 저장 위치를 분리하는 수단이며 백업·복구 시험을 대신하지는 않습니다. [Qdrant 로컬 실행 문서](https://qdrant.tech/documentation/quickstart/)

---

## 19. Cache와 실험 식별: 같은 질문만으로 재사용하면 안 된다

질문이 같아도 문서, 모델, 프롬프트가 달라지면 다른 실험입니다. 벡터 차원이 같다는 이유만으로 다른 임베딩 모델의 캐시를 섞어서도 안 됩니다.

| 캐시·결과 | 식별에 반영할 주요 정보 |
| --- | --- |
| 문서 임베딩 | 코퍼스·청킹·모델 가중치·리비전·정밀도·길이·정규화 |
| 질의 임베딩 | 임베딩 설정·질문 내용·질의 전처리 |
| 생성 답변 | 모델 digest·프롬프트·실제 문맥·생성 파라미터 |
| 평가 응답 | 평가 프롬프트·모델·스키마·seed·표본 번호 |
| 집계 결과 | 질문·참조 답변·지표 구현·평가 조건 |

```python
import hashlib
import json


def fingerprint(identity):
    payload = json.dumps(
        identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
```

해시 함수 자체보다 어떤 정보를 넣었는지가 중요합니다. 청크 ID만 같고 본문이 바뀐 경우, 모델 이름은 같고 가중치가 교체된 경우도 고려해야 합니다. 결과가 어떤 입력과 조건에서 나왔는지 추적할 수 없다면 기존 결과를 자동으로 이어 쓰기보다 새로운 실험으로 분리하는 편이 해석하기 쉽습니다.

단일 지표를 수정해 재평가했다면 어떤 값은 이전 실측을 보존했고 어떤 값은 다시 계산했는지 구분해야 합니다. 전체 파이프라인을 재실행한 것처럼 기록하면 조건을 재현할 수 없습니다.

---

## 20. 통제된 비교에서 해석할 수 있는 범위

세 단계의 효과를 비교하려면 같은 질문, 코퍼스, 청크, 임베딩과 최종 문맥 수를 사용하고 검색 전략을 바꿔야 합니다.

```text
Dense:              Dense 상위 5개
Hybrid:             Dense 50 + BM25 50 → RRF 상위 5개
Hybrid + Reranker:  같은 RRF 후보 중 상위 30개 재정렬 → 상위 5개
```

다음은 PDF 16개, 청크 2,548개, 질문 8개를 사용한 소규모 비교의 평균입니다. 생성·평가는 로컬 Qwen2.5 7B, 관련성 계산용 임베딩은 BGE-M3, 평가 프레임워크는 RAGAS 0.2.15를 사용했습니다.

| 방식 | Faithfulness | Answer Relevancy | Context Precision | Context Recall |
| --- | --- | --- | --- | --- |
| Dense | 0.861 | 0.739 | 0.706 | 0.875 |
| Hybrid | 0.896 | 0.665 | 0.781 | 0.875 |
| Hybrid + Reranker | 0.854 | 0.738 | 0.861 | 0.812 |

관련성 24개 값은 표본 요청의 중복 문제를 수정한 뒤 다시 계산했고, 나머지 72개 값과 생성 답변은 최초 실측을 보존했습니다. 따라서 수정 코드 전체로 처음부터 다시 실행한 실험은 아닙니다.

이 표에서 말할 수 있는 것은 **이 질문 집합과 평가 조건에서 리랭킹 후 유용한 문맥의 순위 지표가 높아졌지만, 모든 지표가 함께 높아진 것은 아니라는 점**입니다. 통계적으로 일반화한 성능 우위를 입증한 결과는 아닙니다.

정의 질문에서는 Dense 1위부터 직접 근거를 찾은 경우가 있었고, 통합 질문에서는 최종 문맥이 한 문서에 집중됐습니다. 이는 단계 수를 늘리는 것보다 질문 유형별 근거 충족과 출처 다양성을 확인해야 함을 보여 줍니다.

또한 이 규모의 Qdrant 컬렉션은 저장 포인트 2,548개에 대해 `indexed_vectors_count=0`이었습니다. HNSW 설정을 지정한 사실만으로 대규모 ANN 성능을 측정했다고 해석할 수 없습니다. 검색 결과 일치, 검색 품질, 인덱스 성능은 각각 다른 검증 대상입니다.

---

## 21. Advanced RAG: 실패 위치에 맞춰 확장하기

Advanced RAG는 특정 기술 하나의 이름보다 기본 검색·생성 구조를 보완하는 여러 설계의 집합으로 볼 수 있습니다.

| 관찰한 실패 | 검토할 확장 | 추가로 확인할 것 |
| --- | --- | --- |
| 관련 후보가 처음부터 없음 | 질의 재작성·Multi-query·검색원 추가 | 원질문 의도 보존·호출 비용 |
| 후보는 있으나 최종 선택에서 탈락 | 후보 수·RRF·Reranker 조정 | 단계별 후보 도달률 |
| 근거 문단의 조건이 잘림 | Parent-Child·주변 문맥 확장 | 문맥 토큰·중복 |
| 여러 요구 중 일부만 검색 | 질문 분해·하위 질의별 검색 | 각 요구의 근거 충족 |
| 한 출처에 결과 편중 | 출처별 후보 확보·다양성 제어 | 관련성이 낮은 문서를 억지로 넣지 않는지 |
| 검색 후 정보 부족을 발견 | 재검색·조건부 분기 | 반복 횟수·중단·응답 보류 정책 |

LLM이 검색원이나 재검색 여부를 판단하도록 구성하면 Agentic RAG로 확장할 수 있습니다. 이때도 종료 조건, 비용 상한과 근거가 부족할 때의 동작을 애플리케이션에서 정해야 합니다.

이 표는 실패에 대응하는 설계 방향입니다. 앞의 Dense·Hybrid·Reranker 비교에서 이 확장들까지 구현·검증했다는 의미는 아닙니다.

---

## 22. 자주 혼동하는 개념

| 혼동 | 구분해야 할 내용 |
| --- | --- |
| 벡터 차원이 같으면 캐시를 섞어도 된다 | 모델·정규화·전처리까지 호환돼야 함 |
| chunk_size=500은 500토큰이다 | 기본 길이 계산이 문자 수일 수 있음 |
| 모델의 최대 길이가 실제 입력 길이다 | 애플리케이션의 제한·잘림 설정이 별도로 존재 |
| FAISS는 영구 저장할 수 없다 | 인덱스 파일 저장·복원이 가능 |
| HNSW를 설정하면 항상 ANN으로 검색한다 | 실제 인덱스 상태와 검색 계획 확인 필요 |
| efSearch와 Top-K는 같은 값이다 | 탐색 후보 폭과 반환 개수는 다름 |
| Quantization을 하면 전체 메모리가 32배 줄어든다 | 순수 벡터 표현과 전체 저장·메모리는 다름 |
| RRF에서 없는 문서는 기본 순위로 넣는다 | 해당 검색기의 기여는 0 |
| Reranker가 누락된 정답을 찾아 준다 | 입력 후보 안에서만 재정렬 |
| 높은 유사도·sigmoid 값은 정답 확률이다 | 관련성 점수와 보정된 확률은 다름 |
| Context Precision은 단순 Precision@K다 | 관련성 판정과 순위를 반영한 집계 |
| Faithfulness가 높으면 사실도 정확하다 | 문맥에 대한 충실도와 외부 사실 정확성은 다름 |
| strictness=3이면 서로 다른 세 표본이다 | 실제 요청·캐시 키·생성 결과 확인 필요 |
| JSON이 유효하면 Judge 판정도 맞다 | 형식 검증과 의미 검증은 별개 |

---

### 공식 문서와 참고 자료

- [BGE-M3 모델 카드](https://huggingface.co/BAAI/bge-m3): 다국어·입력 길이·Dense/Sparse/Multi-vector 표현.
- [MTEB](https://github.com/embeddings-benchmark/mteb): 임베딩 벤치마크와 평가 태스크.
- [FAISS 거리 함수](https://github.com/facebookresearch/faiss/wiki/MetricType-and-distances): 내적·코사인·L2의 관계.
- [FAISS 인덱스 종류](https://github.com/facebookresearch/faiss/wiki/Faiss-indexes): Flat·HNSW·IVF 등.
- [FAISS 인덱스 저장](https://github.com/facebookresearch/faiss/wiki/Index-IO,-cloning-and-hyper-parameter-tuning): 인덱스 파일 입출력.
- [HNSWlib](https://github.com/nmslib/hnswlib): 그래프 인덱스와 파라미터.
- [Qdrant Indexing](https://qdrant.tech/documentation/manage-data/indexing/): 벡터·payload 인덱스와 검색 계획.
- [Qdrant Filtering](https://qdrant.tech/documentation/search/filtering/): 조건 기반 검색.
- [Qdrant Quantization](https://qdrant.tech/documentation/manage-data/quantization/): 압축과 재점수화.
- [RRF 논문 정보](https://research.google/pubs/reciprocal-rank-fusion-outperforms-condorcet-and-individual-rank-learning-methods/): 순위 기반 검색 결과 결합.
- [Sentence Transformers Retrieve & Re-Rank](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html): Bi-encoder와 Cross-encoder.
- [RAGAS 0.2.15 지표 문서](https://docs.ragas.io/en/v0.2.15/concepts/metrics/available_metrics/): 검색 문맥과 답변 평가.

문서 내 비교 수치는 2026년 10월 21일에 실행한 Vector DB 실습의 저장 결과를 바탕으로 했습니다. 알고리즘과 제품 기능의 설명은 위 공식 자료를 참고했으며, 비교 실험에서 사용한 설정과 추가 확장 개념을 구분했습니다.
