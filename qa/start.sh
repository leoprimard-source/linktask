#!/bin/bash
# 用法: bash qa/start.sh PORT DATA_DIR [OFF_DAYS] [fresh]
# fresh: 先从 $SRC_DATA（默认 ./data）复制一份数据副本
ROOT=$(cd "$(dirname "$0")/.." && pwd)
for p in $(pgrep -f "node.*server.js"); do tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -q "^PORT=$1$" && kill "$p"; done; sleep 0.5
[ "$4" = fresh ] && rm -rf "$2" && cp -r "${SRC_DATA:-$ROOT/data}" "$2"
cd "$ROOT" && (PORT=$1 DATA_DIR=$2 LT_OFF_DAYS=${3:-0} nohup node --require "$ROOT/qa/fake-date.js" server.js > "${LOG_DIR:-$ROOT/qa}/srv-$1.log" 2>&1 &)
for i in $(seq 1 120); do curl -s -o /dev/null "localhost:$1/api/users" && break; sleep 0.5; done
