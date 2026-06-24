# 📻 Korea Radio for Home Assistant

[![License: Non-Commercial](https://img.shields.io/badge/License-Non--Commercial-orange.svg)](LICENSE)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Add--on-blue.svg)](https://www.home-assistant.io/)


Home Assistant 내에서 대한민국 주요 라디오 방송을 실시간으로 청취할 수 있는 애드온입니다. 이제 브라우저 재생을 넘어, 우리 집 곳곳의 **AI 스피커(Google Home, Sonos 등)**로도 라디오를 감상하세요.


[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/plplaaa2)

---

## ✨ 주요 특징

* 🛡️ **강력한 보안 체계**: IP 기반 로컬 네트워크 제어 제한, HTTP 보안 헤더(CSP 등) 적용, API 입력값 엄격 검증.
* 🔒 **토큰 보안**: 서버 주입 방식의 전역 변수화를 통해 소스 코드 내 토큰 노출을 차단.
* 📱 **PWA (Progressive Web App) 지원**: 모바일/PC 홈 화면에 설치하여 독립형(Standalone) 앱처럼 실행 및 사용 가능.
* 📻 **다양한 방송 채널 지원**: KBS, MBC, SBS 등 지상파부터 TBS, EBS, 국방FM 등 총 19개 채널 지원.
* ✨ **프리미엄 UI**: 글래스모피즘(Glassmorphism) 기반의 세련된 다크 모드 디자인 및 현대적인 레이아웃.
* 📺 **대형 디스플레이**: 상단에 대형 주파수 표시 및 이전/다음 채널 탐색 버튼 제공.
* 🔊 **멀티 미디어 플레이어 통합**: HA에 등록된 모든 미디어 플레이어 기기(스피커)로 즉시 스트리밍 가능.
* 📱 **지능형 리모컨**: 재생/일시정지 토글 구조로 버튼이 간소화되어 모바일 화면 겹침이 방지된 TubePlayer 스타일의 프리미엄 플로팅 리모컨 UI 제공.
* ⚡ **초고속 엔진**: 즉각적인 재생 반응 속도 및 자가 치유(Reconnect) 안정성 강화.
* 🏠 **HA 완벽 통합**: Ingress 지원 및 POST JSON 방식의 고도화된 API 지원.


> [!IMPORTANT]
> ### 🚨 [필독] 외부망(LTE/외부 와이파이) 웹 플레이어 접속 시 토큰 주입 필수 안내 🚨
> 본 애드온은 외부 웹 스캔 공격 및 비인가 탈취 시도로부터 개인 홈 네트워크를 안전하게 보호하기 위해 강력한 전역 보안 가드가 적용되어 있습니다.
> 
> **사설 IP 대역(내부 LAN 및 가정용 와이파이) 외부에서 플레이어 화면(`3005` 포트)에 직접 접속하시거나 PWA 앱을 설치/이용하실 때는 URL 뒤에 반드시 구성 탭에서 직접 설정한 보안 토큰 매개변수를 추가해야 합니다!**
> 
> * **올바른 외부망 접속 주소**: `http://<HA_외부_도메인_또는_IP>:3005/?token=<MY_TOKEN>`
> * **토큰 누락/오인증 시**: **`403 Forbidden`** 오류로 진입이 원천 차단되며, 5회 이상 오인증 실패 시 **해당 외부 IP는 5분 동안 시스템에서 즉시 임시 차단(Ban)** 처리되어 접근 불가능해집니다.
> * **내부망(가정용 와이파이) 접속 시**: 토큰 없이 예전처럼 편리하게 `http://<HA_내부_IP>:3005/`로 다이렉트 접속 가능합니다.

---

## 🚀 설치 및 설정 방법

### 자동 설치 (권장)
아래 버튼을 클릭하여 저장소를 즉시 추가할 수 있습니다.

[![Open your Home Assistant instance and show the add app repository dialog with a specific repository URL pre-filled.](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fprojectdhs%2Fha_addon)

### 수동 설치
HA 앱 -> 앱설치 버튼 클릭 -> 상단 점3개 메뉴 클릭 -> 저장소 클릭 -> 추가 클릭 -> 이 저장소 주소 복사해서 추가

```https://github.com/plplaaa2/korea_radio_addon```

### 설정 (Options)
1. 애드온 설치 후 **구성(Configuration)** 탭으로 이동합니다.
2. **token**: 외부 API 호출이나 보안을 위해 본인만의 토큰을 입력하세요 (기본: `homeassistant`).
3. 포트 설정에서 `3005` 포트가 열려 있는지 확인하세요 (스피커 연동 필수).

### 📱 PWA 앱 홈 화면 설치 방법
1. 애드온 구성을 완료하고 포트가 매핑된 웹 주소로 기기 브라우저에서 접속합니다. (예: `http://<HA_IP>:3005/?token=<MY_TOKEN>`)
2. 브라우저 주소창 오른쪽에 나타나는 **'앱 설치'** 아이콘을 누르거나 메뉴의 **'홈 화면에 추가'**를 터치합니다.
3. 생성된 바탕화면 아이콘을 실행하면 전용 모바일 앱처럼 윈도우 프레임 없이 넓고 아름다운 Standalone 플레이어를 사용하실 수 있습니다.

---

## HACS를 이용한 사용법

> [!IMPORTANT]
> **필수 HACS 설치:** 이 통합 구성요소를 사용하려면 먼저 아래 애드온이 설치되어 있어야 합니다.
> 
> [plplaaa2/korea_radio_hacs: Korea Radio Home Assistant HACS Integrate](https://github.com/plplaaa2/korea_radio_hacs)
>
> 사용법은 해당 저장소에 기재되어 있습니다.

---

## 🔌 API 및 외부 호출 사용법

본 애드온은 외부 플레이어(VLC, 미디어 자동화 등)에서 직접 호출할 수 있는 API를 제공합니다.

### 데이터 제공 API (v2.7+)
`http://<HA_IP>:3005/get_radio_list?token=<MY_TOKEN>`
- 현재 서버의 `radio-list.json` 내용을 반환합니다.

### 스트리밍 엔드포인트
`http://<HA_IP>:3005/radio?keys=<CHANNEL_KEY>&token=<MY_TOKEN>&atype=<TYPE>&format=<FORMAT>`

- **keys**: 재생할 채널의 키 (kbs_cool, sbs_power, ytn 등)
- **token**: 구성 탭에서 직접 지정한 토큰값 (기본값: homeassistant)
- **atype**: 음질 선택 (`0`: 고음질 192k, `1`: 보통 128k, `2`: 절약 96k)
- **format**: 오디오 포맷 선택 (`wav` 또는 `mp3` 가능, 기본값: `wav`) (v2.9+)

### 미디어 제어 엔드포인트 (v2.6+)
모든 미디어 제어 API는 **GET**과 **POST (JSON Body)** 방식을 모두 지원합니다.

`http://<HA_IP>:3005/media_action?token=<MY_TOKEN>&entity_id=<ENTITY_ID>&action=<ACTION>`
- **action**: `media_play`, `media_pause`, `media_stop`

`http://<HA_IP>:3005/set_volume?token=<MY_TOKEN>&entity_id=<ENTITY_ID>&volume=<VOLUME>`
- **volume**: `0.0` ~ `1.0` 사이의 실수 값

`http://<HA_IP>:3005/mute_volume?token=<MY_TOKEN>&entity_id=<ENTITY_ID>&mute=<TRUE/FALSE>`
- **mute**: `true` (음소거), `false` (해제)

`http://<HA_IP>:3005/play_on_player?token=<MY_TOKEN>&entity_id=<ENTITY_ID>&keys=<CHANNEL_KEY>&atype=<TYPE>`
- 스피커로 특정 채널을 즉시 재생 명령 전송 (v2.6+)

#### 📮 POST JSON 호출 예시 (curl)
```bash
curl -X POST http://<HA_IP>:3005/play_on_player \
     -H "Content-Type: application/json" \
     -d '{
           "token": "your_token",
           "entity_id": "media_player.living_room_speaker",
           "keys": "kbs_cool",
           "atype": "1"
         }'
```

### 🏠 Home Assistant `rest_command` 설정 예제
`configuration.yaml`에 아래와 같이 설정하여 자동화나 스크립트에서 편리하게 사용할 수 있습니다.

```yaml
rest_command:
  radio_play:
    url: "http://localhost:3005/play_on_player"
    method: post
    content_type: "application/json"
    payload: >
      {
        "token": "your_token",
        "entity_id": "{{ entity_id }}",
        "keys": "{{ keys }}",
        "atype": "{{ atype | default('1') }}"
      }

  radio_action:
    url: "http://localhost:3005/media_action"
    method: post
    content_type: "application/json"
    payload: '{"token": "your_token", "entity_id": "{{ entity_id }}", "action": "{{ action }}"}'
```

---

## 🛠 하드웨어별 최적화 팁

* **N100 / 고사양 사용자**: 모든 모드에서 CPU 점유율이 매우 낮습니다. 안정적인 재생을 위해 기본 설정을 그대로 사용하세요.
* **라즈베리 파이 3/4 사용자**: CPU 자원 절약을 위해 `atype=1` 또는 `atype=2`를 추천합니다. 특히 스피커 재생 시에는 애드온 서버에서 미디어 데이터만 가공하여 전송하므로 매우 가볍게 동작합니다.


---

## 📜 라이선스 및 유의사항

### 👤 원작자 (Original Work)
* 본 프로젝트는 **projectdhs**님의 프로젝트를 기반으로 포크 및 고도화되었습니다.
* 원본 코드의 라이선스는 **ISC License**를 따릅니다.

### 🛠️ 수정 및 추가 기능 (Modifications)

* projectdhs님의 코드 외에 추가된 모든 기능(보안 로직, API 고도화, UI 디자인 등)에 대한 권리는 작성자에게 있습니다.
* 추가된 모든 코드는 **Personal and Non-Commercial Use License**에 따라 상업적 이용이 절대 불가합니다.
* **Personal and Non-Commercial Use License**는 아래 저작권 고지 때문에 적용합니다.
  
* **저작권 고지**: 본 애드온은 기술적 연구 및 개인적 편의를 위해 제작된 오픈소스 프로젝트로, 각 방송사의 공식 앱이나 웹페이지 이용을 대체하기 위한 용도가 아닙니다. 방송사의 요청이 있을 경우 언제든 배포가 중단되거나 삭제될 수 있습니다.
