#!/usr/bin/env sh
# One-time: installs the CD-06 runtimes into the self-hosted Piston (gcc covers both C and C++).
# Usage: ./piston/install-runtimes.sh [http://localhost:2000]
set -e
PISTON=${1:-http://localhost:2000}
for pkg in "java 15.0.2" "python 3.12.0" "gcc 10.2.0"; do
  set -- $pkg
  echo "Installing $1 $2 ..."
  curl -fsS -X POST "$PISTON/api/v2/packages" -H 'Content-Type: application/json' \
    -d "{\"language\":\"$1\",\"version\":\"$2\"}"
  echo
done
curl -fsS "$PISTON/api/v2/runtimes"
echo
