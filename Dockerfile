# ==========================================
# Dockerfile for WhatsApp & Telegram Bot Suite
# Optimized for Railway, Render, VPS & Docker
# ==========================================

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies (tzdata for accurate timestamps, ca-certificates for secure HTTPS)
RUN apk add --no-cache tzdata ca-certificates

# Copy package descriptors first to take advantage of Docker layer caching
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application code
COPY . .

# Create storage and data directory structures
RUN mkdir -p /app/storage/sessions /app/storage/media /app/data/tenants

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose server port (Railway dynamically injects PORT)
EXPOSE 3000

# Start command
CMD ["node", "src/index.js"]

