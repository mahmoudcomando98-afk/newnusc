# COMANDO WhatsApp Bot — صورة تشغيل للاستضافة (Render / Railway)
FROM node:22-bookworm-slim

# Chromium + Xvfb (مطلوب لأن WhatsApp Web يحظر headless الحقيقي)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    fonts-liberation \
    fonts-noto-color-emoji \
    procps \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# استخدم Chromium النظام ولا تنزل نسخة تانية
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

# تثبيت الحزم أولاً (cache أفضل)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# نسخ الكود
COPY . .

# Xvfb بيوفر شاشة وهمية — Chromium بيتوصل معاها وWhatsApp Web بيشتغل عادي
CMD ["xvfb-run", "-a", "node", "src/index.js", "start"]
