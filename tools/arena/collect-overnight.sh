#!/bin/bash
# Overnight DanLM self-play collection on an Apple Silicon Mac.
#   tools/arena/collect-overnight.sh [workers=4] [hours=9] [model.json] [out-dir=~/danlm-data]
# Needs ~/DanLM and ~/danlm-venv (see README). Writes <out-dir>/*.jsonl.gz and
# <out-dir>/logs/w<n>.log; caffeinate keeps the Mac awake until every worker stops.
# With a model, one team in each game plays the model and DanLM labels its positions (DAgger).
set -euo pipefail
workers=${1:-4}
hours=${2:-9}
model=${3:-}
out=${4:-$HOME/danlm-data}
cd "$(dirname "$0")/../.."
mkdir -p "$out/logs"
extra=()
[ -n "$model" ] && extra=(--model "$model")
# Each worker runs one model; split the cores instead of letting each take all of them.
threads=$(( $(sysctl -n hw.ncpu) / workers )); [ "$threads" -lt 1 ] && threads=1
pids=()
for ((w = 0; w < workers; w++)); do
  OMP_NUM_THREADS=$threads MKL_NUM_THREADS=$threads \
    node --disable-warning=ExperimentalWarning --experimental-strip-types tools/arena/collect.ts \
      --danlm ~/DanLM --python ~/danlm-venv/bin/python --out-dir "$out" --worker "$w" --hours "$hours" ${extra[@]+"${extra[@]}"} \
      >> "$out/logs/w$w.log" 2>&1 &
  pids+=($!)
done
echo "started ${#pids[@]} workers (pids ${pids[*]}), $threads threads each, stopping after $hours h"
caffeinate -i -w "${pids[0]}" &
wait
echo "all workers done"
