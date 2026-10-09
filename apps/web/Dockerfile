# Development image for the Inkomoko Assistant web app (Next.js + Bun).
# Docker Compose bind-mounts apps/web to /app and keeps node_modules in a named volume.
FROM oven/bun:1

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "run", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
