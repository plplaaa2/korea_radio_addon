#!/bin/sh
cd /app
# Replace the shell so Node receives container stop signals. Related: Dockerfile.
exec node .
