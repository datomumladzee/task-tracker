# Dev image only. Mirrors backend/Dockerfile: dependencies are installed at
# build time, the source is mounted over /app by docker-compose.yml.
FROM node:24-slim

WORKDIR /app

# Runs as the image's node user, uid 1000, the same id as the host user. Files
# the dev server writes into the mounted folder (.next) then belong to you,
# not root, and host commands like `npm run build` can still write there.
RUN chown node:node /app
USER node

# Copied on their own first, so editing source code does not reinstall
# everything on the next build. Only a change to these two files does.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

EXPOSE 3000

# 0.0.0.0 so the dev server answers from outside the container, same reason
# as uvicorn's --host in the backend.
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
