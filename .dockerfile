# --- Build stage ---
    FROM node:18-alpine AS builder
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci
    COPY tsconfig.json ./
    COPY src ./src
    RUN npm run build
    
    # --- Run stage ---
    FROM node:18-alpine
    WORKDIR /app
    COPY package*.json ./
    RUN npm ci --omit=dev
    COPY --from=builder /app/dist ./dist
    ENV PORT=4000
    EXPOSE 4000
    CMD ["node", "dist/index.js"]
    