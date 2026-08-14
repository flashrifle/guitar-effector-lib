# guitar-effector

브랜드 → 모델 순서로 체이닝해서 실제 기타 장비(페달·앰프·캐비닛) 스펙을 가져오는 라이브러리예요.

```js
import { GuitarEffector } from 'guitar-effector';

const effector = new GuitarEffector();
const rat2 = effector.proco.rat2();

console.log('내 디스토션 페달 :', rat2);
// 내 디스토션 페달 : {
//   company: 'proco',
//   model: 'rat2',
//   type: 'pedal',
//   parameter: [ 'distortion', 'filter', 'volume' ]
// }
```

에디터에서 `effector.` 치면 브랜드가 자동완성으로 뜨고, `effector.boss.` 치면 그 브랜드의 모델들이 떠요 (`types/index.d.ts`가 자동 생성돼있어서 JS 프로젝트에서도 타입 힌트가 붙어요).

## 설치

```bash
npm install guitar-effector
```

## API

```js
effector.<company>.<model>()   // → { company, model, type, parameter }

effector.listCompanies()        // → ['proco', 'boss', 'ibanez', ...]
effector.listModels('boss')     // → ['ds1', 'sd1', 'bd2', 'ce2', 'dm2', 'cs3']
effector.all()                  // → 전체를 평탄화한 배열
effector.all('amp')             // → 앰프만
```

### 전체 데이터를 훑거나 색인할 때

`all()`은 호출할 때마다 290개를 새로 만들어요. 고쳐 쓰라고 주는 복사본이거든요. 읽기만 할 거면 `gear`를 쓰세요 — **한 번만 만들어지고 얼려져 있어요.**

```js
import { gear } from 'guitar-effector';

const index = new Map(gear.map((g) => [`${g.company} ${g.model}`, g]));
index.get('proco rat2');   // → { company:'proco', model:'rat2', ... }
```

| | 언제 |
|---|---|
| `gear` | 읽기·색인. 재할당 없음, 수정 불가 (frozen) |
| `all()` | 결과를 고칠 때. 매번 새 복사본 |

### 번들러에서 쓸 때

메인 엔트리는 `node:fs`로 데이터를 읽어서 **Node 전용**이에요. 브라우저 번들에 넣으려면 JSON을 직접 import 하세요.

```js
import raw from 'guitar-effector/gear.json' with { type: 'json' };
```

⚠️ **`gear.json`은 원본 표기예요.** `{ company: "Pro Co", model: "RAT2" }` — 정규화된 키(`proco` / `rat2`)가 아니에요. 이걸로 색인해서 `effector[company][model]`로 되찾으려 하면 안 맞아요. 정규화된 형태가 필요하면 `gear`를 쓰세요.

(import attributes는 Node 22+가 `with`, 그 이전은 `assert`예요.)

### `type`

`'pedal'`, `'amp'`, `'cab'`, `'rack'` 중 하나예요. `rack`은 Teletronix LA-2A처럼 스톰프박스가 아닌 스튜디오 장비예요. 페달과 앰프는 `parameter`에 실제 노브 구성이 들어가고, **캐비닛은 노브가 없어서 `parameter`가 항상 빈 배열**이에요.

```js
effector.all('cab').every((cab) => cab.parameter.length === 0)  // → true
```

### 이름 표기는 신경 안 쓰셔도 돼요

구분자를 무시하고 찾아요. 아래는 전부 같은 페달이에요.

```js
effector.electroharmonix.big_muff_pi()        // 정규형
effector.electroharmonix.bigmuffpi()
effector.electroharmonix['big-muff-pi']
effector['Electro Harmonix']['BIG MUFF PI']
```

어떻게 찾았든 **돌려주는 값은 항상 정규형**이에요.

```js
effector.electroharmonix.bigmuffpi().model    // → 'big_muff_pi'
```

없는 걸 찾으면 비슷한 걸 주지 않고 `undefined`예요.

### 숫자로 시작하는 모델명

Marshall 2203, Peavey 5150처럼 숫자로 시작하는 제품명은 `effector.marshall.2203()`이 JS 문법 오류라서, 그런 키에만 언더스코어를 붙여요.

```js
effector.marshall._1960a_4x12_g12t75()   // 숫자로 시작 → _ 접두사
effector.proco.rat2()                    // 알파벳으로 시작 → 그대로
```

TypeScript 자동완성에는 정규형만 떠요. 다른 표기도 런타임에선 동작하지만 타입 에러가 나요 — 자동완성 목록을 깨끗하게 두려고 그렇게 했어요.

## 지금 들어있는 것 (90개 브랜드, 290항목)

| 타입 | 개수 | 비고 |
|---|---|---|
| `pedal` | 80 | 실제 노브를 확인한 것만 |
| `amp` | 107 | 실제 컨트롤을 확인한 것만 |
| `cab` | 100 | `parameter`는 전부 빈 배열 |
| `rack` | 3 | 스튜디오·랙 장비 |

```js
effector.listCompanies()   // 전체 브랜드 키
effector.all('cab')        // 캐비닛 100개
```

데이터는 Line 6 Helix, Neural DSP Quad Cortex, Fractal Audio 세 곳이 공개한 "based on" 목록의 실제 하드웨어를 기준으로 모았어요. 노브 구성은 장비마다 실제 컨트롤을 확인해서 넣었고, 확인이 안 되는 건 넣지 않았어요.

## 새 장비 추가하는 법

`src/data/gear.json`에 한 줄 추가하면 끝이에요.

```json
{ "company": "Marshall", "model": "JCM800", "type": "amp",
  "parameter": ["presence", "bass", "middle", "treble", "master", "preamp"] }
```

그 다음:

```bash
npm run build:types   # types/index.d.ts를 자동 재생성 (수동 편집 금지 — 스크립트가 덮어씀)
npm test
```

브랜드/모델 키는 `src/normalize.js`가 만들어요. 회사는 한 단어로 붙이고(`"Way Huge"` → `wayhuge`), 모델은 단어 경계만 `_`로 이어요(`"Big Muff Pi"` → `big_muff_pi`). 모델번호 안의 하이픈은 단어 경계가 아니라서 `"DS-1"` → `ds1`이에요.

잘못된 데이터는 **모듈을 import하는 시점에 바로 에러를 던져요** (해당 모델을 호출할 때가 아니라):

- 같은 브랜드 안에서 두 모델이 같은 키로 충돌할 때 (예: `"TS-808"`과 `"TS808"`을 둘 다 넣는 경우)
- 두 모델의 키가 구분자만 다를 때 (예: `"Big Muff Pi"`와 `"BigMuffPi"` — 구분자를 무시하는 조회가 둘을 구별할 수 없어서예요)
- `type`이 `pedal`/`amp`/`cab` 중 하나가 아닐 때
- `type: "cab"`인데 `parameter`가 비어있지 않을 때

## 테스트

```bash
npm test
```

## 고지

이 패키지는 언급된 제조사 어느 곳과도 제휴하거나 승인받은 관계가 아니에요. 모든 회사명·제품명은 각 소유자의 상표이며, 해당 장비를 식별하기 위한 목적으로만 사용했어요.

## 라이센스

MIT
