# Guildbook MCP server (stdio). Used by directory checkers such as Glama to
# start the server and run introspection; end users should prefer `npx -y guildbook-mcp`.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json index.js ./
RUN npm ci --omit=dev
ENV GUILDBOOK_API_URL=https://www.guildbook.ai
ENTRYPOINT ["node", "index.js"]
