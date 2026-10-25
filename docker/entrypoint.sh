#!/bin/sh
# Entry point of the ghostmaxxing local-fuzzer image.
#
# Started as root (the default), it makes the data folder writable for the
# unprivileged 'node' user (uid 1000) and drops to it. A bind-mounted host
# folder is often owned by root or by another uid; only the folder itself is
# chown-ed, and only when 'node' cannot write to it. Started with
# `docker run --user <uid>:<gid>`, it runs as that user and touches nothing.
set -eu
DATA="${LOCALFUZZER_DATA:-/data}"

if [ "$(id -u)" = "0" ]; then
   mkdir -p "$DATA"
   if ! setpriv --reuid=node --regid=node --init-groups test -w "$DATA"; then
      echo "entrypoint: giving $DATA to uid 1000 (node) so the service can write there" >&2
      chown node:node "$DATA"
   fi
   exec env HOME=/home/node setpriv --reuid=node --regid=node --init-groups "$@"
fi

if ! [ -w "$DATA" ]; then
   echo "entrypoint: $DATA is not writable by uid $(id -u); mount a folder this user owns, or start without --user" >&2
   exit 1
fi
exec "$@"
