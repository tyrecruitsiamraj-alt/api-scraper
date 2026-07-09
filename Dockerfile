# Playwright base image ships Chromium + all OS deps (needed for the login step).
# Keep the tag in sync with the "playwright" version in package.json.
FROM mcr.microsoft.com/playwright:v1.51.1-jammy

ENV NODE_ENV=production
WORKDIR /app

# poppler-utils provides pdftoppm — used to rasterize PDF attachments for OCR
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# App source
COPY src ./src
COPY workers ./workers

# Chromium is already in the base image; tell Playwright to use it
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Default: control API. Override `command` for the worker / migrate.
EXPOSE 8080
CMD ["node", "src/api/server.js"]
