# 📻 Korea Radio Add-on Project Tree

```text
.
├── .gitattributes           # Git 특성 정의 파일 (개행 문자 고정 등)
├── .gitignore               # Git 커밋 제외 대상 설정 파일
├── CHANGELOG.md             # 저장소 전체 변경 이력
├── LICENSE                  # 라이선스
├── README.md                # 저장소 소개 및 설치 가이드
├── repository.json          # Home Assistant 애드온 저장소 설정 파일
├── caution.jsonl            # 개발 주의사항 및 리스크 요약 파일
├── changelog.jsonl          # 내부 개발 버전 관리 대장 (JSONL)
├── tree.md                  # 프로젝트 디렉터리 구조 (본 파일)
├── radioha/                 # 라디오 애드온 핵심 소스 폴더
│   ├── Dockerfile           # 컨테이너 빌드 설정
│   ├── config.json          # 애드온 설정 및 옵션 정의
│   ├── index.html           # 플레이어 프론트엔드 UI
│   ├── index.js             # 스트리밍 백엔드 (Node.js)
│   └── radio-list.json      # 방송국 채널 메타데이터
└── android/                 # [NEW] 안드로이드 오토 연동 모바일 앱 소스 폴더
    ├── app/
    │   ├── src/main/
    │   │   ├── AndroidManifest.xml # 권한 및 Android Auto 서비스 메타데이터 선언
    │   │   ├── java/com/example/korearadio/
    │   │   │   ├── MainActivity.kt         # 설정 폼 & 하이브리드 웹뷰
    │   │   │   └── MyMediaLibraryService.kt # Android Auto Media3 연동 서비스
    │   │   └── res/xml/
    │   │       └── automotive_app_desc.xml  # 오토 미디어 어플리케이션 명세서
    │   └── build.gradle.kts
    ├── build.gradle.kts
    └── settings.gradle.kts
```
