FROM node:22.11.0-alpine

WORKDIR /etc/sentry-telegram-webhook/

COPY . .

RUN npm ci && \
    npm run build && \
    rm -rf node_modules && \
    npm ci --omit=dev

USER nobody

EXPOSE 6500

CMD ["node", "/etc/sentry-telegram-webhook/dist/main.js"]