# 📻 Korea Radio Add-on Project Tree

```text
.
├── .gitignore               # Git 커밋 제외 대상 설정 파일
├── CHANGELOG.md             # 저장소 전체 변경 이력
├── LICENSE                  # 라이선스
├── README.md                # 저장소 소개 및 설치 가이드
├── repository.json          # Home Assistant 애드온 저장소 설정 파일
├── tree.md                  # 프로젝트 디렉터리 구조 (본 파일)
└── radioha/                 # 라디오 애드온 핵심 소스 폴더
    ├── CHANGELOG.md         # 애드온 개별 변경 이력
    ├── DOC.md               # 애드온 상세 설명 문서
    ├── Dockerfile           # 컨테이너 빌드 설정 (Alpine Node 기반)
    ├── config.json          # 애드온 설정 및 옵션 정의
    ├── icon.png             # 애드온 아이콘 이미지
    ├── index.html           # 플레이어 프론트엔드 UI
    ├── index.js             # 스트리밍 및 API 중계 백엔드 (Node.js)
    ├── package.json         # Node.js 패키지 의존성 설정
    ├── radio-list.json      # 방송국 채널 메타데이터 및 스트림 주소
    └── run.sh               # 애드온 실행 셸 스크립트
```
