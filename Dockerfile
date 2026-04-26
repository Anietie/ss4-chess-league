FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production deps for socket server
RUN npm ci --omit=dev

# Copy socket server and shared libs it needs
COPY server/socket-server.js ./server/
COPY src/lib/glicko2.ts ./src/lib/
COPY src/lib/games-and-notifications.ts ./src/lib/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server/socket-server.js"]