# Keep the base compatible with the configured HA architectures. Related: config.json, package-lock.json.
FROM alpine:3.23.4

RUN apk add --no-cache ca-certificates ffmpeg nodejs npm tini

WORKDIR /app

# 애플리케이션 파일 복사
COPY index.js .
COPY index.html .
COPY package.json package-lock.json ./
COPY radio-list.json .
COPY run.sh .
COPY manifest.json .
COPY service-worker.js .
COPY icon.png .

# 실행 권한 부여 및 윈도우 개행 문자(CRLF) 제거 처리 (리눅스 빌드 오류 방지)
RUN sed -i 's/\r$//' run.sh
RUN chmod a+x run.sh
RUN npm ci --omit=dev

ENTRYPOINT ["/sbin/tini", "-g", "--", "./run.sh"]
