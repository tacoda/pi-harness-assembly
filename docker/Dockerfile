# Case 6 — pi as a log-triage harness, isolated in a container.
#
# The container only ships what the harness needs: node, pi, and the
# project's .pi/ tree. There is no shell in the model's tool list
# (--no-builtin-tools at launch), and the container itself runs as a
# non-root user with a read-only /logs mount and a writable
# /work/triage-output. Two belts: OS-level isolation from the host,
# and tool-level path guards inside the extension.

FROM node:20-alpine

# pi is distributed as an npm package. `--ignore-scripts` matches the
# recommendation in the project README.
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent \
    && npm cache clean --force

# Non-root. UID 10001 is arbitrary but stable so bind-mount ownership
# is predictable across hosts.
RUN addgroup -g 10001 pi && adduser -D -u 10001 -G pi pi

# /work is where the repo is mounted at runtime. /logs is where the
# read-only log corpus is mounted.
RUN mkdir -p /work /logs && chown -R pi:pi /work
WORKDIR /work
USER pi

# Extension code lives on the mounted repo, so no COPY of .pi/ here —
# that keeps the "pi is just files" iteration story intact. Edit
# .pi/extensions/triage.ts on the host, re-run the container, changes
# are picked up.

ENV TRIAGE_LOGS_DIR=/logs
ENV PI_QUIET_STARTUP=1

# The launcher (bin/pi-triage) provides the full arg list. Default
# entrypoint is just pi; CMD is left empty so `docker run ... pi-triage`
# behaves like invoking pi directly.
ENTRYPOINT ["pi"]
