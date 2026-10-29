# syntax=docker/dockerfile:1
#
# Ghostmaxxing local fuzzer: a web page (scripts-dev/localfuzzer) around the
# Ghostyle fuzzer (scripts-dev/ghostyle-fuzz.cjs). Upload a video, get an
# assessment and the Ghostyles a few hours later. Nothing leaves the machine.
#
#   docker run -d --name ghostmaxxing -p 127.0.0.1:11111:11111 --shm-size=1g \
#     --stop-timeout 120 -v ghostmaxxing-data:/data ghcr.io/vecna/ghostmaxxing:latest
#   open http://localhost:11111
#
# Multi-arch (linux/amd64, linux/arm64): Node, ffmpeg and Playwright's Chromium
# exist natively for both, so Apple Silicon runs it without emulation.
# Documentation: tutorials/localfuzzer-docker.md.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim

# NPM_CONFIG_SCRIPT_SHELL=/bin/bash: bash replaces itself with the script's
# command (dash, Debian's sh, does not), so the process chain is
# tini → npm → node and docker stop's SIGTERM reaches the server, which lets
# the running trial finish and the job resume on the next start.
ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_SCRIPT_SHELL=/bin/bash \
    LOCALFUZZER_HOST=0.0.0.0 \
    LOCALFUZZER_PORT=11111 \
    LOCALFUZZER_DATA=/data

# ffmpeg/ffprobe read the videos; zip packs the downloads; tini is PID 1 and
# forwards docker stop's SIGTERM so a running job stops after its trial;
# setpriv (util-linux) lets the entrypoint drop from root to 'node'.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg zip tini util-linux ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Only the fuzzer's one dependency, @playwright/test, at the version of the
# lockfile, plus Playwright's headless Chromium and its system libraries. The
# website's dev tooling (vitest, jsdom, canvas, ...) is not installed.
COPY package-lock.json /tmp/package-lock.json
WORKDIR /opt/fuzzer-deps
RUN set -eux; \
    PW_VERSION="$(node -p "require('/tmp/package-lock.json').packages['node_modules/@playwright/test'].version")"; \
    npm init -y >/dev/null; \
    npm install --no-audit --omit=optional "@playwright/test@${PW_VERSION}"; \
    npx playwright install --with-deps --only-shell chromium; \
    rm -rf /var/lib/apt/lists/* /root/.npm /root/.cache /tmp/package-lock.json; \
    chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH"

WORKDIR /app
COPY --chown=root:root . .
RUN ln -s /opt/fuzzer-deps/node_modules /app/node_modules \
 && chmod 0755 docker/entrypoint.sh \
 && mkdir -p /data && chown node:node /data \
 && node scripts-dev/ghostyle-fuzz.cjs --version \
 && /usr/bin/tini --version && setpriv --version && ffprobe -version >/dev/null && zip -v >/dev/null \
 && test -n "$(find "$PLAYWRIGHT_BROWSERS_PATH" -maxdepth 1 -name 'chromium_headless_shell-*')"

LABEL org.opencontainers.image.title="ghostmaxxing local fuzzer" \
      org.opencontainers.image.description="Upload a video, search Ghostyles against face-api locally, download the assessment and the Ghostyles." \
      org.opencontainers.image.source="https://github.com/vecna/ghostmaxxing" \
      org.opencontainers.image.documentation="https://github.com/vecna/ghostmaxxing/blob/fuzzer/tutorials/localfuzzer-docker.md"

VOLUME ["/data"]
EXPOSE 11111
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:11111/api/info').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
CMD ["npm", "run", "localfuzzer"]
