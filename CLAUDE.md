# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 목적

브랜드 → 모델 체이닝으로 실제 기타 장비(페달·앰프·캐비닛) 스펙을 반환하는 라이브러리.

```js
new GuitarEffector().proco.rat2()
// → { company: 'proco', model: 'rat2', type: 'pedal', parameter: ['distortion','filter','volume'] }
```

**npm에 `guitar-effector`(unscoped)로 배포해서 사용자 본인의 다른 프로젝트에서 dependency로 쓰는 것이 목표.** 일회성 스크립트가 아니라 퍼블릭 패키지이므로, API 표면·키 표기·반환 스키마를 바꾸는 변경은 배포 이후엔 breaking change다.

## 명령어

```bash
npm test                      # node --test test/index.test.js (현재 13개)
npm run build:types           # src/data/gear.json → types/index.d.ts 재생성

# 테스트 1개만 실행 (이름으로 필터)
node --test --test-name-pattern="listModels returns every model key" test/index.test.js

npm pack --dry-run            # 배포될 파일 목록 확인
npm publish                   # prepublishOnly가 build:types + test를 먼저 돌림
```

빌드 단계 없음 — 소스가 그대로 배포된다. 유일한 생성물은 `types/index.d.ts`.

## 아키텍처: 단일 소스 → 두 갈래 생성

```
src/data/gear.json            ← 유일한 데이터 소스 (사람이 편집하는 유일한 파일)
        │
        ├─ src/index.js       ← 런타임. 모듈 로드 시점에 1회 그룹핑
        └─ scripts/generate-types.js → types/index.d.ts   (자동 생성, 수동 편집 금지)
                │
        src/normalize.js      ← 양쪽이 공유하는 키 생성 함수 (toKey / toPascal)
```

`normalize.js`가 이 구조의 핵심이다. 런타임의 프로퍼티 이름과 `.d.ts`의 메서드 이름이 **반드시 같아야** 하므로 양쪽 모두 같은 함수를 호출한다. 이 함수들을 수정하면 런타임 키는 즉시 바뀌지만 `.d.ts`는 그대로 남아 조용히 어긋난다 — `normalize.js`를 건드렸으면 `npm run build:types`를 반드시 같이 실행할 것.

함수가 셋인데 **역할이 다르니 섞어 쓰지 말 것**:

| 함수 | 용도 | 예 |
|---|---|---|
| `toCompanyKey` | 회사 정규키. 한 단어로 붙임 | `"Pro Co"` → `proco` |
| `toModelKey` | 모델 정규키. **단어 경계만** `_` | `"Big Muff Pi"` → `big_muff_pi`, `"DS-1"` → `ds1` |
| `toLookup` | 조회용 매칭 형태. 전부 제거 | `"big-muff-pi"` → `bigmuffpi` |

- 회사와 모델의 규칙이 **일부러 다르다.** 이 라이브러리의 출발점이 `effector.proco.rat2()`인데 회사에 단어 구분자를 넣으면 `pro_co`가 되어 그 예시가 깨진다. 반대로 모델은 캐비닛 이름이 길어서 구분자가 없으면 `princetonbrownface1x10g10alnicogold`처럼 읽을 수 없게 된다.
- `toModelKey`는 **단어 경계에만** `_`를 넣는다. `DS-1`의 하이픈은 한 모델번호 안의 기호라 단어 경계가 아니므로 `ds1`이 된다 — `ds_1`은 사람이 부르는 방식과 멀어진다.
- `toLookup`은 **저장하지 말 것.** 조회를 매칭할 때만 쓰는 형태다. 데이터에 남는 건 언제나 정규키다.
- `toPascal()`은 생성되는 TS 인터페이스 이름(`WayHugeBrand`)에만 쓰이고 런타임에는 영향 없음

### 조회는 구분자를 무시한다 (Proxy)

`separatorTolerant()`가 브랜드 객체와 인스턴스를 Proxy로 감싸서, 아래가 전부 같은 항목을 찾는다:

```js
effector.electroharmonix.big_muff_pi()      // 정규형
effector.electroharmonix.bigmuffpi()
effector.electroharmonix['big-muff-pi']()
effector['Electro Harmonix']['BIG MUFF PI']()
```

- **정규형만 밖으로 나간다.** 반환값의 `model`, `listModels()`, `Object.keys()`는 어떤 표기로 찾았든 `big_muff_pi`를 준다. 관용은 호출자를 위한 것이지 데이터를 흐리라는 게 아니다.
- 못 찾으면 `undefined`. 비슷한 걸 대신 돌려주지 않는다.
- 서로 다른 정규키가 같은 `toLookup` 형태로 뭉개지면 **import 시점에 throw한다.** 관용 조회가 둘을 구분할 수 없기 때문이다.
- **TS 자동완성은 정규형만 뜬다.** `.d.ts`에 별칭을 선언하지 않아서, TS 사용자가 `bigmuffpi`를 치면 런타임에선 되는데 타입 에러가 난다. 자동완성을 깨끗하게 유지하려고 감수한 것 — 별칭까지 선언하면 항목이 두 배가 된다.

### 런타임 동작에서 알아둘 것

- `brands`는 모듈 로드 시 1회만 만들어지고, `new GuitarEffector()`는 `Object.assign(this, brands)`로 참조만 붙인다. 인스턴스를 여러 개 만들어도 비용이 없고, 장비 함수 객체는 인스턴스 간 공유된다.
- **검증은 전부 모듈 로드 시점에 throw한다** — 해당 모델을 호출할 때가 아니라 `import` 자체가 실패한다. 중복 키, 구분자만 다른 모호한 키, 잘못된 `type`, 잘못된 `category`, 노브가 있는 `cab`.
- `parameter`는 호출할 때마다 `[...gear.parameter]`로 복사해서 반환한다. 호출자가 배열을 변형해도 데이터가 오염되지 않아야 하며, 이 불변성은 테스트로 고정돼 있다.

## 설계 결정 (임의로 바꾸지 말 것)

- **키는 camelCase가 아니라 전부 소문자.** `wayHuge`가 아니라 `wayhuge`. 사용자가 `effector.proco.rat2()`를 예시로 직접 줬고 출력값도 `company:'proco'`였기 때문에, 접근 경로와 반환값 표기를 일치시킨 것. "더 예쁘다"는 이유로 camelCase로 바꾸지 말 것.
- **반환 객체 키는 5개**: `company`, `model`, `type`, `category`, `parameter`. 배열이지만 단수형 `parameter` — 사용자 예시 그대로. 3개(0.1.0 이전) → `type` 추가 → `category` 추가(0.2.0) 순으로 늘었다. **필드 추가는 minor지만 제거·개명은 major다.**
- **`type`과 `category`는 축이 다르다.** `type`은 어떤 상자냐(pedal/amp/cab/rack), `category`는 신호에 뭘 하느냐(drive/comp/delay/...). 소비자가 아이콘·색·필터에 쓰는 건 `category`다. 앰프·캐비닛은 두 값이 같아서 `null` 처리가 필요 없다.
- **`category`는 추측이 아니라 원본 섹션에서 유도했다.** Helix의 `Distortion Models`/`Delay Models`, QC의 `Guitar overdrive`/`Compressor` 같은 섹션명을 매핑한 것이다. 83개 중 68개가 자동 매칭됐고 나머지 15개는 직접 넣은 항목이라 손으로 분류했다. **새 장비를 추가할 때도 같은 기준을 쓸 것 — 임의로 붙이지 말 것.**
- **`type`은 `pedal | amp | cab | rack` 넷.** `rack`은 스톰프박스가 아닌 실물 — Teletronix LA-2A, UA 1176, Eventide H3000, Leslie 122 같은 스튜디오·랙 장비다. 모델러가 이펙트로 묶어놨다고 해서 `pedal`로 넣지 말 것. LA-2A는 페달이 아니다.
- **페달·앰프·캐비닛이 한 네임스페이스를 공유한다.** `effector.pedals.proco.rat2()`처럼 카테고리로 쪼개지 않는다. 사용자가 준 원래 사용 예시를 지키기 위한 선택이고, 구분은 `type` 필드와 `all(type)`으로 한다.
- **캐비닛의 `parameter`는 항상 빈 배열.** 캐비닛엔 노브가 없다. 스피커 구성을 `parameter`에 욱여넣지 말 것 — 런타임이 이걸 검증해서 throw한다. 대신 사이즈와 스피커는 **`model`에 인코딩한다**: `"Basketweave 4x12 G12M-25"` → `basketweave4x12g12m25`. 안 그러면 Marshall Basketweave 3종(G12M-20/G12M-25/G12H-30)처럼 회사·모델이 같고 스피커만 다른 캐비닛들이 같은 키로 충돌한다.
- **캐비닛 model에서 스피커 제조사는 뺀다.** `Celestion`·`Jensen`·`Eminence`·`WGS`·`ElectroVoice`·`Weber`·`FatJimmy`·`JBL` 등은 키만 길게 만들고 구분에 기여하지 않는다: `"Deluxe Blackface 1x12 Jensen C12K"` → `"Deluxe Blackface 1x12 C12K"`. **예외 둘** — (1) 제조사가 유일한 스피커 정보일 때는 남긴다 (`Orange 4x12 Eminence`, `Marshall 1960TV 4x12 Celestion`, `Hiwatt AP 4x12 Fane`), (2) 빼면 숫자만 남아 사이즈 숫자와 뭉개질 때도 남긴다 (`Soldano 4x12 Eminence 12-5875` — 빼면 `_4x12125875`가 되어 읽을 수 없다).
- **숫자로 시작하는 키에는 `_`를 붙인다.** `effector.marshall.2203()`은 JS 문법 오류라서, `toKey()`가 `_2203`을 만든다. 실물 장비명의 40%가 숫자를 포함하므로 브라켓 접근으로 도망가지 말 것 — 라이브러리 전체가 하나의 호출 규약을 유지해야 한다. `toPascal()`도 같은 처리를 한다 (`13Brand`는 유효한 TS 식별자가 아님).
- **외부 의존성 0개.** 유지할 것.
- `engines: ">=24"`는 사용자가 의도적으로 유지하기로 한 것. 코드가 실제로 요구하는 수준보다 높지만 임의로 낮추지 말 것.

## 장비 추가 시 (테스트가 깨지는 지점)

1. `src/data/gear.json`에 `{ "company": "...", "model": "...", "type": "pedal|amp|cab|rack", "category": "drive|comp|...", "parameter": [...] }` 추가
2. `npm run build:types`
3. `npm test`

개수를 하드코딩한 단언은 전부 제거했으므로 데이터를 추가해도 테스트를 같이 고칠 필요는 없다. 대신 다음이 자동으로 걸린다: 키 충돌, 점 접근 불가능한 키, `listCompanies`/`all()` 불일치, 노브가 있는 캐비닛.

주의: `listModels`의 "없는 브랜드" 테스트는 실제로 존재하지 않는 문자열(`nosuchbrand`)을 쓴다. 실존 브랜드명을 예시로 쓰면 나중에 그 브랜드가 데이터에 들어오는 순간 깨진다 (`fender`로 쓰다가 실제로 깨졌다).

`parameter`는 실제 장비의 노브/컨트롤이어야 한다. 지어내지 말고, 확실하지 않으면 조사해서 채울 것 — 현재 21개는 전부 실제 컨트롤 레이아웃을 확인하고 넣은 것이다.

## 진행 중인 작업: HX Stomp XL 매뉴얼에서 데이터 확장

원본 PDF: `~/Downloads/HX Stomp XL 3.80 Owner's Manual - English .pdf` (73p). 모델 표는 **PDF 25~43페이지**에 있고, 가로 letter 2단 레이아웃이라 컬럼을 분리해야 파싱된다:

```bash
# 페이지별로 좌측 컬럼 → 우측 컬럼 순서로 뽑아야 읽기 순서가 맞는다
pdftotext -layout -f $p -l $p -x 0   -y 0 -W 396 -H 612 "$PDF" -   # 좌
pdftotext -layout -f $p -l $p -x 396 -y 0 -W 396 -H 612 "$PDF" -   # 우
```

추출 결과 실물 장비 **247종** (페달 126 · 앰프 60 · 캐비닛 46).

- **`Line 6 Original`은 제외한다** — 실물 원본이 없는 Line 6 자체 설계라 company/model로 표현할 대상이 아니다.
- **Legacy Cab 표는 제외한다** — IR 기반 Cab 표와 같은 실물 캐비닛을 가리키는 구버전 모델링이라 새 하드웨어가 아니다.
- **앰프는 채널 변형을 합친다.** 매뉴얼의 `Fender Bassman (normal channel)` / `(bright channel)`은 같은 실물 앰프 1대다. 괄호 안 수식어를 떼고 중복 제거하면 112행 → 60종.
- **매뉴얼에는 모델별 파라미터가 없다.** `Common Amp Settings` / `Common FX Settings`처럼 카테고리 공통 파라미터만 실려 있어서, `parameter`는 장비마다 따로 조사해야 한다. 캐비닛만 `parameter: []`라 조사가 불필요하다.

### 두 번째 소스: Quad Cortex 기기 목록

원본 PDF: `~/Downloads/Quad Cortex device list - Neural DSP.pdf` (40p, 웹페이지 저장본). 고정폭 컬럼이라 컬럼 오프셋으로 잘라야 한다.

- **레코드 시작은 버전 컬럼(`Added in CorOS`)으로 판정한다.** `Name`과 `Based on`이 **둘 다** 줄바꿈되는 행이 있어서, 빈 칸 여부로 컨티뉴에이션을 판단하면 한 레코드가 두 개로 쪼개진다.
- `Delay`·`EQ` 섹션은 `Based on`이 비어 있다 — Neural DSP 자체 설계라 실물 원본이 없다.
- `Neural Captures V1`에는 `Device category` 컬럼이 없다 (V2에만 있음). V1 항목은 타입을 따로 분류해야 한다.
- `Morph`·`IR loader`·`Looper`·`Utility`·`Plugin devices`·`Announced devices...`는 실물 장비가 아니라 제외.

### 소스로 쓸 수 없는 것: Logic Pro / Cubase 내장 장비

**공식 "based on" 매핑이 없어서 제외한다.** Line 6·Neural DSP는 모델마다 실물을 명시하지만, Apple은 `"Tweed 모델은 1950년대 미국 콤보 기반"`처럼 카테고리 설명만 하고 어느 앰프인지 밝히지 않는다 (Steinberg도 동일). 커뮤니티 추정 매핑은 추측이라 이 프로젝트 기준에 안 맞는다.

덧붙여 **넣어도 데이터가 거의 안 는다.** 이 라이브러리는 모델러의 모델명이 아니라 실물 기준이고, Logic이 다루는 건 결국 Tweed/Blackface Fender·Vox AC30·Marshall 스택·Mesa 같은 이미 들어있는 클래식들이다.

### 세 번째 소스: Fractal Audio (Yek's Guide)

공개 PDF 두 권. `curl`로 받아 `pdftotext -layout`으로 파싱했다.

```
드라이브 90p  https://medias.audiofanzine.com/files/yeks-guide-to-the-fractal-audio-drive-models-479833.pdf
앰프   301p  https://medias.audiofanzine.com/files/yeks-guide-to-the-fractal-audio-amp-models-479832.pdf
```

- **드라이브 가이드에는 `Original Controls` 필드가 있다** — 모델마다 실물의 노브 구성이 그대로 적혀 있어서 웹 검색 없이 뽑았다. 목차의 `(based on X)`로 실물명을, 본문의 `Original Controls`로 노브를 얻는다.
- **앰프 가이드에는 그 필드가 없다.** `Synopsis`/`Tips`/`Tonestack`만 있어서 앰프는 장비마다 따로 검색해야 한다.
- Fractal 위키(`wiki.fractalaudio.com`)는 **403**이라 WebFetch로 못 읽는다. PDF를 쓸 것.

### 소스로 쓸 수 없는 것: 제조사 공식 사이트

시험해본 결과 브랜드마다 갈린다 — Boss는 제품 목록이 JS 렌더링이라 원본 HTML에서 2개만 나오고, EHX는 `/collections/all`이 404, MXR(jimdunlop.com)은 104개가 잘 뽑힌다. 브랜드마다 파서를 따로 만들어야 하고, 무엇보다 **현행 카탈로그라 단종된 클래식(Klon Centaur, Binson EchoRec 등)이 빠진다.** 지금 데이터의 성격은 "모델러들이 검증한 실물"이지 "회사가 현재 파는 것"이 아니다.

### 두 소스를 합칠 때: 문자열이 아니라 실물로 중복 판정할 것

같은 실물 캐비닛을 Helix와 QC가 다르게 표기한다. 키 비교만으로는 안 걸리고 둘 다 들어간다:

```
Helix: Vox AC-30TB 2x12 Silver Alnico
QC:    VOX AC30 Top Boost with Celestion Alnico "Silver Bell" drivers   ← 같은 캐비닛
Helix: Bogner Uberkab 4x12 G12T-75
QC:    Bogner Ubercab with Celestion T75 drivers                        ← 같은 캐비닛
```

QC 캐비닛의 사이즈는 `Based on`이 아니라 **기기 이름 앞자리**에 있다 (`412 Brit 60B GB '71` → 4x12).

### 진행 순서 (캐비닛 → 앰프 → 페달)

- [x] **1단계 캐비닛 100종** — Helix 44 + QC 56. Helix IR Cab 표에서 `Custom open-back` 2종은 제조사가 없어 제외, QC에서 Matchless `Sig A/B`처럼 스피커가 특정되지 않은 캡처 변형도 제외
- [x] **2단계 앰프 66종** — 컨트롤 레이아웃을 웹에서 확인한 것만 넣었다
- [x] **3단계 페달 80종 + 랙 3종**
- [x] **4단계 Fractal 흡수** — 드라이브 7종, 앰프 25종 추가. 여기서 데이터 수집 마감

### 페달에서 조사 실패로 건너뛴 것

| 장비 | 건너뛴 이유 |
|---|---|
| Eventide H3000, TC Electronic 2290 | 메뉴 방식 랙이라 고정된 노브 세트가 없음. `parameter`로 표현할 대상이 아님 |
| Leslie 122/145, Fender Vibratone | 로터리 스피커 캐비닛. 자체 노브가 없고 speed는 외부 스위치/앰프에 있음 |
| EHX POG | 소스는 `POG`인데 검색으로 확인되는 건 후속작 `POG2`. 다른 제품이라 넣지 않음 |
| Helix Reverb 섹션 전체 | **25종 전부 `Line 6 Original`** — 실물 원본이 있는 리버브가 하나도 없다. 추출 오류가 아님 |

### 앰프에서 조사 실패로 건너뛴 것

**확인 못 한 것은 넣지 않았다** — 추측으로 채우면 이 라이브러리의 유일한 가치인 정확성이 사라진다. 나중에 자료가 나오면 추가할 것:

| 장비 | 건너뛴 이유 |
|---|---|
| Victoria Vintage Queen | 해당 모델명 자체가 검색되지 않음 |
| ÷13 JRT 9/15 | 자료마다 컨트롤이 엇갈림(volume/treble/bass/master vs 듀얼 volume + 6단 tone + cut) |
| Victory Kraken | QC 목록이 어느 버전인지 불명(V4는 페달형) |
| Gallien-Krueger 800RB | "4-band EQ"라고만 나오고 각 밴드 이름이 확인 안 됨 |
| Ben Adrian Cartographer, Dover DA-50, Driftwood Purple Nightmare, Dean Costello Heavy Metal Warfare, Pearce BC-1, Tech 21 SansAmp GED-2112, Gibson GA-8 | 자료 없음 |

**Carvin VLD1 Legacy Drive는 앰프가 아니라 프리앰프 페달이다** — 미추가 상태.

## 현재 상태

90개 브랜드 290항목 — 페달 80, 앰프 107, 캐비닛 100, 랙 3.

소스 세 곳(Line 6 Helix · Neural DSP QC · Fractal Audio)에서 공개된 based-on 목록을 전부 흡수한 상태다. 더 늘리려면 새 소스가 필요하고, 그건 별도 판단 사항이다.

## 공개 패키지로서 지켜야 할 것

배포된 뒤로는 소비자가 있다. 아래는 어겼을 때 남의 빌드가 깨지는 것들이다.

### semver

| | 사례 |
|---|---|
| patch | 기존 항목의 값 수정 (노브 이름 정정, 오타) |
| minor | 항목 추가 |
| major | 항목 삭제, 키 이름 변경, 필드 제거 |

**`normalize.js`의 키 생성 함수를 고치면 무조건 major다.** 항목 하나가 아니라 290개 키가 한꺼번에 바뀌고, `.d.ts`에 박혀 있으니 소비자 빌드가 통째로 깨진다.

### 내보내는 것 세 가지의 계약이 다르다

| | 계약 |
|---|---|
| `all()` | 호출마다 새 복사본. 고쳐 써도 안전 |
| `gear` | 공유되는 얼린 배열. 재할당 없음, 수정 불가 |
| `guitar-effector/gear.json` | **원본 표기** (`"Pro Co"` / `"RAT2"`). 정규화 전이다 |

세 번째가 함정이다. 번들러용으로 열어둔 서브패스인데, 이걸로 색인한 뒤 `effector[company][model]`로 되찾으면 안 맞는다. Proxy의 구분자 관용은 조회할 때 얘기고 인덱스 키 자체가 다르다.

### CI가 막아주는 것

`.github/workflows/ci.yml`의 `git diff --exit-code -- types/`가 핵심이다. **`gear.json`만 고치고 `build:types`를 안 돌린 채 커밋하면 커밋된 타입이 거짓말을 한다.** `prepublishOnly`가 배포 때 다시 만들어주지만 그전까지 아무도 모른다. 실제로 검증했고 정상 감지한다.

배포는 `publish.yml`이 태그(`v*`)에서만 돌린다. 로컬 `npm publish`로 실수로 나가는 걸 막고, 태그와 `package.json` 버전이 다르면 거기서 멈춘다. `--provenance`로 서명이 붙는다.

`npm ci`는 락파일을 요구하므로 `package-lock.json`은 의존성이 0개여도 커밋해둔다.

## npm 배포 전 남은 항목

`npm view guitar-effector` 기준 이름은 아직 비어 있음 (2026-08 확인).

- [x] `prepublishOnly`: `build:types && test` — 타입 미갱신 상태로 배포되는 사고 방지
- [x] README 설치 안내를 `npm install guitar-effector`로 수정
- [x] 상표 고지(제조사와 제휴 관계 아님) README에 추가
- [x] `LICENSE` 파일 (MIT, flashrifle)
- [x] `repository` / `author` / `bugs` / `homepage` — `flashrifle/guitar-effector-lib`
- [ ] **`git init` + GitHub 저장소 생성** — 마지막 남은 항목

## 관련 프로젝트 (이 폴더에는 없음, 참고용)

- **gear-catalog** — 검색 위주의 flat JSON 라이브러리(`search()`, `getById()`). 네임스페이스 체이닝 vs 검색 함수로 API 설계가 완전히 다름. 합칠 필요는 없어 보임.
- **tone-api** — Nest.js + Sequelize + MySQL 백엔드. `EffectModel`, `EffectFamily` 등 훨씬 큰 DB 스키마를 다루는 별개 프로젝트.
