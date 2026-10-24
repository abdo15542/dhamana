FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
RUN npm ci --omit=dev -w api
COPY api api
COPY web web
ENV NODE_ENV=production PORT=4000 DHAMANA_DATA_DIR=/data
VOLUME /data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "api/src/server.js"]
