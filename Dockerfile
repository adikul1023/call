# Multi-stage build for SecureVoice with WireGuard
FROM node:20-alpine AS app-build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Generate SSL certificates for HTTPS/WSS
RUN apk add --no-cache openssl && \
    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem \
    -days 1825 -nodes -subj "/CN=securevoice.local"

# Final stage with WireGuard
FROM linuxserver/wireguard:latest

# Install Node.js and required tools
RUN apk add --no-cache \
    nodejs \
    npm \
    sqlite \
    iptables \
    ip6tables

# Create app directory
WORKDIR /app

# Copy built application from previous stage
COPY --from=app-build /app /app

# Copy WireGuard configuration template
COPY docker/wg0.conf.template /config/wg0.conf.template

# Expose ports
# 51820/udp - WireGuard VPN
# 3000/tcp - HTTPS signaling server (only accessible via VPN)
EXPOSE 51820/udp
EXPOSE 3000/tcp

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider https://localhost:3000/ || exit 1

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
