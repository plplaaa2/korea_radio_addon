FROM node:alpine

# 필요한 패키지 설치 (ffmpeg)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# 애플리케이션 파일 복사
COPY index.js .
COPY index.html .
COPY package.json .
COPY radio-list.json .
COPY run.sh .
COPY manifest.json .
COPY service-worker.js .

# 실행 권한 부여 및 윈도우 개행 문자(CRLF) 제거 처리 (리눅스 빌드 오류 방지)
RUN sed -i 's/\r$//' run.sh
RUN chmod a+x run.sh
RUN npm install

ENTRYPOINT [ "./run.sh" ]
