---
title: "LLM 아키텍처 이해하기"
date: "2026-08-31"
category: ["AI", "LLM", "Transformer"]
description: "텍스트가 토큰과 벡터를 거쳐 문맥을 학습하고 다음 토큰으로 생성되는 과정을 Transformer의 핵심 개념을 중심으로 정리"
---

# LLM 아키텍처 이해하기 — 텍스트가 답변이 되기까지

---

LLM을 공부할 때 가장 먼저 마주치는 어려움은 용어가 많다는 것이다. Tokenization, Embedding, Attention, Transformer, Pretraining, Fine-tuning이 각각 별개의 기술처럼 보이기 쉽다. 하지만 이 개념들은 하나의 질문을 해결하기 위해 연결되어 있다.

> 지금까지 등장한 토큰이 주어졌을 때, 다음에는 어떤 토큰이 올 가능성이 높은가?

GPT 계열의 LLM은 이 질문에 답하는 **다음 토큰 예측 모델**이다. 문장을 사람처럼 한 번에 완성하는 것이 아니라, 다음 토큰의 점수를 계산하고 하나를 선택하는 일을 반복한다.

```text
텍스트
  ↓ Tokenization
Token ID
  ↓ Token Embedding + Position Embedding
입력 벡터
  ↓ Transformer Block × N
문맥이 반영된 표현
  ↓ Output Head
Vocabulary Logit
  ↓ Decoding
다음 토큰
  ↓ 입력에 추가한 뒤 반복
생성된 텍스트
```

이 글에서는 구현 순서나 실습 일지를 나열하기보다, 각 단계가 **어떤 문제를 해결하기 위해 존재하는지**를 중심으로 LLM의 구조를 살펴본다.

---

## 1. LLM은 문장이 아니라 토큰을 처리한다

신경망은 문자열을 직접 계산할 수 없다. 따라서 텍스트를 모델이 다룰 수 있는 작은 단위인 토큰으로 나누고, 각 토큰을 정수 ID로 변환해야 한다. 이 과정이 Tokenization이다.

```text
"나는 오늘 학교에 갔다"
        ↓ Tokenization
["나는", "오늘", "학교에", "갔다"]
        ↓ Vocabulary 조회
[125, 438, 91, 782]
```

여기서 Token ID는 의미의 크기를 나타내는 숫자가 아니다. Vocabulary에서 특정 토큰을 찾기 위한 인덱스일 뿐이다. ID가 큰 토큰이 더 중요하거나 더 많은 의미를 가진다는 뜻은 아니다.

### 왜 단어가 아니라 Subword를 사용할까?

모든 단어를 Vocabulary에 등록하는 방식은 활용형, 합성어, 신조어가 생길 때마다 항목이 계속 늘어난다. 등록되지 않은 단어를 하나의 `<unk>` 토큰으로 처리하면 서로 다른 낯선 단어가 모두 같은 정보로 사라지는 문제도 생긴다.

BPE(Byte Pair Encoding)와 같은 Subword Tokenizer는 자주 등장하는 문자열은 하나로 묶고, 드문 문자열은 이미 알고 있는 더 작은 조각으로 나눈다.

```text
자주 등장하는 표현 → 하나 또는 적은 수의 토큰
처음 보는 단어     → 여러 Subword 토큰의 조합
```

따라서 토큰 수는 글자 수나 단어 수와 일치하지 않는다. 모델의 Context Length와 입력 비용이 글자 수가 아니라 토큰 수를 기준으로 계산되는 이유도 여기에 있다.

---

## 2. Embedding은 ID를 계산 가능한 표현으로 바꾼다

Token ID는 단순한 식별자이므로 토큰 사이의 의미 관계를 계산하는 데 사용할 수 없다. Embedding Layer는 각 Token ID에 대응하는 학습 가능한 벡터를 조회한다.

```python
token_embedding = torch.nn.Embedding(vocab_size, emb_dim)
```

Embedding 행렬의 Shape은 다음과 같다.

```text
[vocab_size, emb_dim]
```

ID가 `3`인 토큰이 입력되면 행렬의 3번 행을 가져온다. 이 연산은 숫자 3 자체를 변환한다기보다, 3번 토큰에 연결된 벡터를 조회하는 것에 가깝다.

Embedding은 처음에는 무작위 값이지만 다음 토큰 예측 오차를 줄이는 과정에서 함께 학습된다. 비슷한 문맥에서 사용되는 토큰은 모델의 계산에 유용한 방향으로 관계를 형성하게 된다. 다만 벡터의 각 차원을 사람이 임의로 “감정”, “사람”, “장소”처럼 해석할 수 있는 것은 아니다. 중요한 것은 개별 숫자보다 벡터 사이의 상대적인 관계다.

### 위치 정보가 별도로 필요한 이유

Token Embedding만 사용하면 같은 토큰은 어디에 등장하더라도 같은 벡터를 가진다. 그러나 언어에서는 순서가 의미를 바꾼다.

```text
개가 사람을 물었다.
사람이 개를 물었다.
```

Transformer의 Self-Attention은 입력 순서를 그 자체로 알지 못하므로 위치를 나타내는 벡터가 필요하다. GPT-2에서는 학습 가능한 Position Embedding을 Token Embedding에 더한다.

```python
input_embeddings = token_embeddings + position_embeddings
```

```text
최종 입력 표현 = 토큰이 무엇인지 + 어느 위치에 있는지
```

두 Embedding의 차원이 같기 때문에 더한 뒤에도 `[batch, tokens, emb_dim]` Shape이 유지된다.

---

## 3. Self-Attention은 토큰의 의미를 문맥에 맞게 바꾼다

Embedding만으로는 한 토큰이 문장 안에서 어떤 의미로 쓰였는지 알기 어렵다. 같은 단어도 주변 문맥에 따라 역할이 달라지기 때문이다. Self-Attention은 각 토큰이 같은 시퀀스의 다른 토큰을 얼마나 참고해야 하는지 계산한다.

입력 벡터 `X`는 서로 다른 목적의 세 벡터로 투영된다.

```text
Q(Query) = XWq  → 현재 토큰이 찾고 있는 정보
K(Key)   = XWk  → 각 토큰이 가진 정보의 검색 표지
V(Value) = XWv  → 실제로 전달할 내용
```

Attention의 핵심 수식은 다음과 같다.

```text
Attention(Q, K, V) = softmax(QKᵀ / √dk)V
```

각 연산은 분명한 역할을 가진다.

| 연산 | 의미 |
|------|------|
| `QKᵀ` | Query와 모든 Key의 관련성 점수 계산 |
| `/ √dk` | 차원이 커질수록 점곱이 커져 Softmax가 지나치게 뾰족해지는 현상 완화 |
| `softmax` | 관련성 점수를 합이 1인 가중치로 변환 |
| `Attention Weight × V` | 관련 있는 토큰의 정보를 더 많이 반영해 문맥 벡터 생성 |

Self-Attention의 출력은 입력 토큰을 단순히 복사한 값이 아니다. 주변 토큰의 Value가 가중합된 **문맥 의존적 표현**이다.

### Attention은 의미를 미리 정해 두지 않는다

Q, K, V를 만드는 가중치 행렬은 사람이 규칙으로 작성하지 않는다. 다음 토큰 예측 Loss를 줄이는 과정에서 모델이 어떤 관계에 주목할지 학습한다. 어떤 Head는 문법적 관계에, 다른 Head는 멀리 떨어진 단어의 연결이나 위치 관계에 반응할 수 있지만, 특정 Head가 반드시 하나의 사람이 이름 붙일 수 있는 기능만 담당하는 것은 아니다.

---

## 4. Causal Mask는 학습과 생성의 조건을 일치시킨다

GPT는 왼쪽 문맥을 바탕으로 다음 토큰을 예측하는 Decoder-only 모델이다. 학습 중 정답 문장 전체가 입력되어도 현재 위치가 미래 토큰을 미리 보면 안 된다.

```text
          나는  오늘  학교에  갔다
나는        O     X      X      X
오늘        O     O      X      X
학교에      O     O      O      X
갔다        O     O      O      O
```

이를 위해 미래 위치의 Attention Score를 `-∞`로 바꾼 뒤 Softmax를 적용한다. 해당 위치의 확률은 0이 되어 현재 토큰은 자신과 이전 토큰만 참고할 수 있다.

Causal Mask는 단순한 구현 옵션이 아니다. 학습할 때도 실제 생성 시점과 동일하게 **미래 정보가 없는 조건**을 만들기 위한 장치다. 이 제약 덕분에 한 문장을 입력하더라도 모든 위치의 다음 토큰 예측을 병렬로 학습할 수 있다.

---

## 5. Multi-Head Attention은 여러 표현 공간을 병렬로 사용한다

하나의 Attention만으로 모든 관계를 하나의 기준에서 계산하면 표현 능력이 제한될 수 있다. Multi-Head Attention은 Embedding 차원을 여러 Head로 나누고 각 Head가 독립적인 Q, K, V 공간에서 관계를 계산하도록 한다.

```text
[batch, tokens, emb_dim]
        ↓ Head 분할
[batch, heads, tokens, head_dim]
        ↓ Head별 Attention
[batch, heads, tokens, head_dim]
        ↓ 결합 + Output Projection
[batch, tokens, emb_dim]
```

이때 `emb_dim = n_heads × head_dim`이어야 한다. Head를 합친 뒤 Output Projection을 통과하면 다시 원래 Embedding 차원으로 돌아온다. 입력과 출력의 Shape이 같기 때문에 Residual Connection을 적용하고 같은 구조를 여러 층 쌓을 수 있다.

Multi-Head의 핵심은 같은 문장을 여러 번 보는 것이 아니라, **서로 다른 학습된 표현 공간에서 토큰 관계를 병렬로 계산하는 것**이다.

---

## 6. Transformer Block은 정보 교환과 정보 가공을 반복한다

Attention만으로 Transformer가 완성되는 것은 아니다. GPT의 한 Transformer Block은 크게 Attention과 FeedForward Network(FFN), 그리고 깊은 학습을 안정화하는 LayerNorm과 Residual Connection으로 구성된다.

```text
입력 x
  ↓ LayerNorm
Masked Multi-Head Attention
  ↓ Dropout
x와 더하기 ───────────── Residual Connection
  ↓ LayerNorm
FeedForward Network
  ↓ Dropout
이전 값과 더하기 ─────── Residual Connection
  ↓
출력
```

### Attention과 FFN의 역할은 다르다

| 모듈 | 핵심 역할 |
|------|-----------|
| Attention | 토큰 사이에서 문맥 정보를 교환 |
| FFN | 각 토큰이 가진 특징을 독립적으로 변환 |

FFN은 일반적으로 Embedding 차원을 넓혔다가 다시 줄인다.

```text
emb_dim → 4 × emb_dim → emb_dim
768     → 3072        → 768
```

Attention으로 다른 토큰의 정보를 가져온 뒤, FFN이 각 위치에서 그 정보를 비선형적으로 가공한다고 볼 수 있다. GPT 계열에서는 부드러운 비선형 함수인 GELU가 주로 사용된다.

### LayerNorm은 값의 분포를 안정화한다

LayerNorm은 각 토큰의 Embedding 특징 차원을 기준으로 평균과 분산을 계산한다.

```text
x̂ = (x - mean) / √(variance + ε)
output = scale × x̂ + shift
```

정규화 후에도 학습 가능한 `scale`과 `shift`를 두어, 모델이 작업에 필요한 분포를 다시 만들 수 있게 한다. 실습에서 구현한 GPT는 Attention과 FFN보다 먼저 정규화하는 Pre-Norm 구조다. 이 구조는 깊은 네트워크에서 Gradient가 흐르는 경로를 안정적으로 유지하는 데 도움을 준다.

### Residual Connection은 변화량을 학습하게 한다

```python
x = x + sub_layer(x)
```

Residual Connection을 사용하면 하위 모듈이 기존 표현 전체를 새로 만드는 대신, 기존 값에 더할 변화량을 학습할 수 있다. 동시에 Gradient가 Shortcut 경로를 통해 직접 전달될 수 있어 깊은 모델의 학습을 돕는다.

Transformer Block 전체가 `[batch, tokens, emb_dim]` Shape을 유지하기 때문에 같은 Block을 여러 번 쌓을 수 있다. LLM의 깊이는 서로 다른 모듈을 계속 붙이는 것이 아니라, 동일한 형태의 문맥화와 특징 변환을 여러 층에서 반복하는 구조로 만들어진다.

---

## 7. GPT는 Decoder-only Transformer다

GPT의 전체 구조는 지금까지 살펴본 부품을 하나의 파이프라인으로 연결한 것이다.

```text
Token IDs                          [batch, tokens]
  ↓
Token + Position Embedding         [batch, tokens, emb_dim]
  ↓
Transformer Block × n_layers       [batch, tokens, emb_dim]
  ↓
Final LayerNorm                    [batch, tokens, emb_dim]
  ↓
Output Head                        [batch, tokens, vocab_size]
  ↓
Logits
```

Output Head는 각 위치의 `emb_dim`차원 Hidden State를 Vocabulary 크기의 점수로 변환한다. 예를 들어 GPT-2의 Vocabulary가 50,257개라면 각 토큰 위치마다 50,257개의 Logit이 출력된다.

Logit은 확률이 아니라 Softmax 적용 전의 점수다. 학습에서는 수치적 안정성을 위해 Logit을 Cross Entropy 함수에 직접 전달하고, 생성할 때는 필요한 디코딩 전략에 따라 확률로 변환한다.

### 아키텍처와 가중치는 서로 다른 개념이다

GPT 클래스를 구현했다고 해서 모델이 곧바로 언어를 생성할 수 있는 것은 아니다. 아키텍처는 정보가 이동하고 계산되는 **구조**이고, 가중치는 데이터에서 학습한 **패턴**이다.

```text
구조만 구현한 GPT + 무작위 가중치 → 무작위에 가까운 출력
같은 GPT 구조 + 사전학습 가중치   → 학습된 언어 패턴을 반영한 출력
```

외부의 사전학습 가중치를 불러오려면 Vocabulary 크기, Embedding 차원, Head 수, Block 수, QKV 배치, LayerNorm 설정 등 구조가 정확히 일치해야 한다.

---

## 8. 사전학습은 다음 토큰 예측을 대규모로 반복하는 과정이다

GPT의 학습 Target은 입력 토큰을 오른쪽으로 한 위치 이동해 만든다.

```text
Input:  [나는, 오늘, 학교에, 갔다]
Target: [오늘, 학교에, 갔다, .]
```

한 시퀀스의 각 위치가 하나의 다음 토큰 학습 예제가 된다. 긴 문서는 Sliding Window로 일정한 Context Length의 샘플로 나눈다.

```text
원본 텍스트
  ↓ Tokenization
연속된 Token ID
  ↓ Sliding Window
Input·Target Batch
  ↓ GPT Forward
Vocabulary Logit
  ↓ Cross Entropy
Loss
  ↓ Backpropagation + Optimizer
가중치 갱신
```

Cross Entropy는 정답 토큰에 모델이 얼마나 낮은 확률을 부여했는지를 측정한다. Loss를 역전파하면 Embedding, Attention, FFN, Output Head를 포함한 전체 파라미터가 다음 토큰을 더 잘 예측하는 방향으로 바뀐다.

이 단순한 목표를 매우 큰 데이터와 모델 규모에서 반복하면 문법, 문맥, 표현 방식과 데이터에 포함된 지식 패턴이 가중치에 함께 반영된다. LLM의 다양한 능력은 각각을 별도 규칙으로 입력한 결과가 아니라, 다음 토큰 예측에 유용한 내부 표현을 학습한 결과다.

### Loss와 Perplexity

Perplexity는 Cross Entropy Loss를 지수화한 값이다.

```text
Perplexity = exp(Loss)
```

낮을수록 모델이 정답 토큰 후보를 더 좁게 예측했다고 해석할 수 있다. 다만 Tokenizer와 평가 데이터가 다르면 Loss와 Perplexity의 기준도 달라지므로 서로 다른 모델의 숫자를 단순 비교하면 안 된다.

---

## 9. 생성은 학습이 아니라 반복 추론이다

학습이 끝난 모델은 Prompt의 마지막 위치에서 다음 토큰 Logit을 얻고, 선택한 토큰을 입력 뒤에 붙이는 과정을 반복한다.

```text
Prompt
  ↓ GPT
마지막 위치의 Logit
  ↓ Decoding
다음 Token ID 선택
  ↓
기존 입력 뒤에 추가
  ↓
종료 조건까지 반복
```

모델이 계산한 Logit이 같더라도 토큰을 선택하는 방법에 따라 결과는 달라진다.

| 전략 | 동작 | 특징 |
|------|------|------|
| Greedy | 가장 높은 점수의 토큰 선택 | 재현성이 높지만 단조롭거나 반복될 수 있음 |
| Temperature | Logit의 분포를 조절 | 낮으면 보수적, 높으면 다양성이 증가 |
| Top-k | 점수가 높은 k개 후보만 유지 | 가능성이 매우 낮은 후보를 제거 |

Temperature와 Top-k는 모델이 새 지식을 학습하게 하지 않는다. 이미 계산된 다음 토큰 분포에서 **어떻게 하나를 선택할지**를 조절하는 추론 단계의 설정이다.

또한 모델은 Context Length를 넘어선 토큰을 한 번에 참고할 수 없다. 생성 과정에서 입력이 길어지면 모델이 지원하는 범위에 맞게 Context를 관리해야 한다.

---

## 10. Fine-tuning은 지식을 처음부터 다시 배우는 과정이 아니다

사전학습된 모델은 일반적인 언어 패턴을 학습했지만, 특정 업무의 출력 형식이나 사용자의 지시를 반드시 따르도록 학습된 것은 아니다. Fine-tuning은 이미 형성된 표현을 특정 목적에 맞게 조정하는 과정이다.

### Classification Fine-tuning

분류 작업에서는 Vocabulary 전체의 다음 토큰을 생성할 필요가 없다. 기존 Output Head를 클래스 수에 맞는 Linear Layer로 교체할 수 있다.

```text
기존 생성 모델: [batch, tokens, vocab_size]
분류 모델:      [batch, tokens, num_classes]
```

Causal Attention을 사용하는 GPT에서는 마지막 위치의 Hidden State가 앞의 전체 시퀀스를 참고하므로, 마지막 토큰 위치의 Logit을 분류에 사용할 수 있다. 전체 모델을 모두 바꾸지 않고 마지막 Transformer Block, Final LayerNorm, Classification Head만 학습하는 선택도 가능하다.

핵심은 같은 Transformer 본체라도 **출력 구조와 학습 Target을 바꾸면 다른 작업을 수행할 수 있다**는 점이다.

### Instruction Fine-tuning

Instruction Fine-tuning은 `지시 + 입력 + 모범 응답`을 하나의 일관된 형식으로 구성하고, 그 시퀀스의 다음 토큰을 예측하도록 학습한다.

```text
### Instruction:
수행해야 할 작업

### Input:
작업의 대상

### Response:
모델이 생성해야 할 응답
```

학습 원리는 사전학습과 동일한 다음 토큰 예측이다. 차이는 일반 텍스트가 아니라 지시를 따르는 행동 패턴이 담긴 지도 데이터로 가중치를 조정한다는 데 있다.

길이가 다른 시퀀스를 배치로 만들 때는 Padding이 필요하지만, Padding은 정답이 아니다. Target의 Padding 위치를 `-100`으로 바꾸면 PyTorch의 Cross Entropy가 해당 위치를 Loss 계산에서 제외한다. 응답 생성에 집중하려면 Prompt 영역도 마스킹하고 Response 영역에서만 Loss를 계산할 수 있다.

---

## 11. LoRA와 양자화는 모델 본체가 아니라 효율화 방법이다

모델 규모가 커지면 전체 가중치를 그대로 학습하고 메모리에 올리는 비용이 커진다. 이 문제를 다루는 대표적인 방법이 LoRA와 양자화다. 두 기술은 함께 사용되기도 하지만 해결하는 문제가 다르다.

### LoRA: 학습할 파라미터를 줄인다

LoRA(Low-Rank Adaptation)는 기존 가중치 `W`를 고정하고, 작은 저랭크 행렬 `A`, `B`가 만드는 변화량만 학습한다.

```text
기존 방식: W 전체를 학습
LoRA:      W는 고정하고 ΔW = BA만 학습
```

```text
y = Wx + BAx
```

`A`와 `B`의 Rank를 원래 차원보다 작게 두면 학습 가능한 파라미터와 Optimizer State가 크게 줄어든다. LoRA는 주로 Attention의 Projection Layer 같은 특정 Linear Module에 Adapter 형태로 적용한다.

### 양자화: 가중치를 표현하는 비트 수를 줄인다

양자화는 모델의 가중치나 연산을 더 낮은 정밀도로 표현해 메모리 사용량과 추론 비용을 줄이는 방법이다.

```text
FP32 → FP16/BF16 → INT8 → 4-bit
```

비트 수를 낮출수록 메모리는 줄지만 원래 값을 근사하는 오차가 커질 수 있다. 4-bit 양자화에서 NF4는 정규분포에 가까운 신경망 가중치를 표현하도록 설계된 형식이다.

LoRA와 4-bit 양자화를 결합한 QLoRA 방식은 양자화된 기반 모델은 고정하고 LoRA Adapter를 학습한다. 즉, **양자화는 저장·연산 비용을 줄이고 LoRA는 업데이트할 파라미터를 줄인다.**

---

## 12. Fine-tuning과 RAG는 서로 다른 층의 문제를 해결한다

RAG(Retrieval-Augmented Generation)는 모델 가중치에 정보를 다시 학습시키는 대신, 질문과 관련된 외부 문서를 검색해 Prompt의 Context로 제공한다.

| 구분 | Fine-tuning | RAG |
|------|-------------|-----|
| 바꾸는 것 | 모델 가중치 | 모델에 전달하는 입력 Context |
| 잘 맞는 목적 | 행동, 말투, 출력 형식, 특정 작업 능력 | 최신 정보, 사내 문서, 출처 기반 답변 |
| 정보 갱신 | 다시 학습해야 함 | 검색 문서를 갱신하면 됨 |
| 대표 사례 | 스팸 분류, 지시 수행 | 사내 규정·제품 문서 질의응답 |

사내 IT Helpdesk처럼 규정이 자주 변경되는 환경에서는 정보를 가중치에만 넣으면 변경될 때마다 다시 Fine-tuning해야 한다. 반면 RAG는 문서 저장소를 갱신하고 새 문서를 검색하게 할 수 있다.

따라서 Fine-tuning과 RAG는 경쟁 관계가 아니다. 모델의 행동과 응답 형식은 Fine-tuning으로 조정하고, 최신 도메인 지식은 RAG로 제공하는 식으로 함께 사용할 수 있다.

```text
Transformer 아키텍처
        ↓ Pretraining
기반 LLM
        ↓ Fine-tuning / LoRA
업무에 맞게 행동하는 모델
        ↓ RAG
외부의 최신 지식을 참고하는 시스템
```

---

## 13. LLM 코드를 읽을 때는 Tensor Shape을 추적해야 한다

Transformer 구현은 수식보다 Tensor Shape에서 더 자주 막힌다. 각 차원이 무엇을 뜻하는지 추적하면 모듈 사이의 연결이 명확해진다.

Batch가 2, Token 수가 3, Embedding이 32차원, Head가 4개, Vocabulary가 10개인 작은 GPT를 생각해 보자.

| 단계 | Shape | 의미 |
|------|-------|------|
| Token IDs | `[2, 3]` | 두 문장에 각각 세 토큰 |
| Token Embedding | `[2, 3, 32]` | 토큰별 32차원 표현 |
| Q·K·V | 각각 `[2, 4, 3, 8]` | 네 Head가 8차원씩 사용 |
| Attention Score | `[2, 4, 3, 3]` | 각 Head의 모든 토큰 쌍 관련성 |
| Context Vector | `[2, 3, 32]` | Head를 다시 결합한 표현 |
| Transformer 출력 | `[2, 3, 32]` | 다음 Block에 전달 가능한 동일 Shape |
| Logit | `[2, 3, 10]` | 각 위치의 Vocabulary 점수 |
| 마지막 위치 Logit | `[2, 10]` | 다음 토큰 선택에 사용하는 점수 |

직접 작은 모델을 구현하는 가장 큰 의미는 성능 좋은 LLM을 새로 만드는 데 있지 않다. 각 모듈의 입출력 Shape과 역할을 분리해 보면, 거대한 모델도 결국 같은 연산 구조를 더 큰 차원과 더 많은 층에서 반복한다는 사실을 확인할 수 있다.

---

## 14. 전체 개념을 하나의 흐름으로 정리하기

```text
Tokenization
→ 문자열을 Vocabulary의 Token ID로 변환한다.

Embedding
→ Token ID와 위치를 연속적인 벡터로 표현한다.

Self-Attention
→ 토큰 사이의 관련성을 계산해 문맥 의존적 표현을 만든다.

Causal Mask
→ 미래 토큰을 가려 다음 토큰 예측 조건을 유지한다.

Multi-Head Attention
→ 여러 표현 공간에서 관계를 병렬로 계산한다.

FFN
→ 각 토큰의 특징을 비선형적으로 가공한다.

LayerNorm + Residual
→ 깊은 Transformer의 정보와 Gradient 흐름을 안정화한다.

Output Head
→ 문맥 표현을 Vocabulary 전체의 Logit으로 변환한다.

Pretraining
→ 대규모 텍스트의 다음 토큰 예측으로 일반 언어 패턴을 학습한다.

Decoding
→ Logit에서 다음 토큰을 선택하고 생성을 반복한다.

Fine-tuning / LoRA
→ 기반 모델의 행동과 작업 능력을 목적에 맞게 조정한다.

Quantization
→ 모델의 메모리와 연산 비용을 줄인다.

RAG
→ 가중치를 바꾸지 않고 외부의 최신 지식을 Context로 제공한다.
```

LLM의 답변은 어느 하나의 특별한 알고리즘에서 만들어지는 것이 아니다. Tokenizer가 입력 단위를 결정하고, Embedding이 이를 벡터로 옮기며, Transformer Block이 문맥을 반복해서 가공한다. 사전학습은 이 전체 구조의 가중치를 언어 데이터에 맞추고, Fine-tuning과 RAG는 완성된 기반 모델을 실제 목적에 연결한다.

결국 LLM 아키텍처를 이해한다는 것은 수많은 용어를 따로 암기하는 일이 아니라, **각 개념이 앞 단계의 어떤 한계를 해결하고 다음 단계에 어떤 표현을 전달하는지 연결해서 이해하는 것**이다.

---

## 관련 실습 자료

- `LLM&TransformerArchitecture/01_Embedding.ipynb`
- `LLM&TransformerArchitecture/02_Attention.ipynb`
- `LLM&TransformerArchitecture/03_Implementing_GPT.ipynb`
- `LLM&TransformerArchitecture/04_Pretraining.ipynb`
- `sLLM&FineTuning/02_Quantized_LLM.ipynb`
- `sLLM&FineTuning/03_LoRA.ipynb`
- `sLLM&FineTuning/05_Finetuning_Text_Classification.ipynb`
- `sLLM&FineTuning/06_Finetuning_Instruction.ipynb`
- `sLLM&FineTuning/AI-NOVA 사내 IT Helpdesk AI 구축 실습_배포용.ipynb`
