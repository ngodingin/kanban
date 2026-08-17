FROM node:24-slim

WORKDIR /workspace

# Install dependencies (including dev deps for scaffold)
COPY package.json package-lock.json* ./
RUN npm ci --silent || npm install --no-audit --no-fund --silent

# Copy workspace
COPY . .

# Expose port
EXPOSE 3000

CMD ["npx", "ts-node", "src/server.ts"]
