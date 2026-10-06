FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NODE_EXTRA_CA_CERTS=/app/rds-global-bundle.pem
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
RUN node -e "const fs=require('node:fs');fetch('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem').then(r=>{if(!r.ok)throw new Error('RDS CA download failed: '+r.status);return r.text()}).then(x=>fs.writeFileSync('/app/rds-global-bundle.pem',x))"
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
RUN chown node:node /app/rds-global-bundle.pem
USER node
EXPOSE 8080
CMD ["node", "src/index.mjs"]
