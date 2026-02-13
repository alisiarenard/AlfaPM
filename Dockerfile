# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Install drizzle-kit for database migrations
RUN npm install drizzle-kit

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy files needed for database migrations
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy static assets if needed
COPY --from=builder /app/attached_assets ./attached_assets 2>/dev/null || true

# Copy entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose port
EXPOSE 5000

# Use entrypoint script that runs migrations then starts the app
ENTRYPOINT ["./docker-entrypoint.sh"]
