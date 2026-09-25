# Imagen del frontend para correr todo junto con docker compose (planazo-infra).
# En producción el frontend se despliega en Vercel; este Dockerfile es solo para local.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Las NEXT_PUBLIC_* se incrustan en el build: se pasan como build args desde compose.
ARG NEXT_PUBLIC_API_MODE=live
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_REALTIME_URL=ws://localhost:8081/ws
ARG NEXT_PUBLIC_GAME_URL=ws://localhost:8082
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
    NEXT_PUBLIC_GAME_URL=$NEXT_PUBLIC_GAME_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
USER node
COPY --from=build --chown=node:node /app ./
EXPOSE 3000
CMD ["npm", "start"]
