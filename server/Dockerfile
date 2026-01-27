FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy server code
COPY server.js .

# Expose port
EXPOSE 4444

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4444/health || exit 1

# Run as non-root user
USER node

CMD ["node", "server.js"]
