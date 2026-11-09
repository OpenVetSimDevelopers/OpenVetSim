#!/bin/bash
# ============================================================================
# ovs-diagnose.sh — capture what OpenVetSim is doing when it misbehaves (macOS)
#
# Run it WHILE the problem is happening, before you quit or restart anything:
#
#   bash ~/Documents/"Claude OVS"/scripts/ovs-diagnose.sh
#
# It takes about 30 seconds, changes nothing, needs no password, and writes a
# folder "OVS-diagnostics-<date-time>" on your Desktop:
#
#   summary.txt         is the simulator answering? CPU, memory, threads,
#                       connections, sleep/App Nap state
#   engine-sample.txt   a stack trace of every thread in the simulator engine
#                       (WinVetSim) — shows exactly where it is stuck
#   php-sample.txt      the same for the PHP web server
#   engine-lsof.txt     every file and network connection the engine holds
#   logs/               the end of vetsim.log and php.log, and the newest
#                       session logs, from the app and the development folder
# ============================================================================

OUT="$HOME/Desktop/OVS-diagnostics-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT/logs"
exec > >(tee "$OUT/summary.txt") 2>&1

section() { printf '\n==== %s ====\n' "$1"; }

section "When and where"
date
sw_vers 2>/dev/null
uptime

ENGINE_PID=$(pgrep -x WinVetSim | head -1)
PHP_PID=$(pgrep -f 'php -S .*:8081' | head -1)
APP_PID=$(pgrep -x OpenVetSim | head -1)
[ -z "$APP_PID" ] && APP_PID=$(pgrep -x Electron | head -1)
echo "engine (WinVetSim) pid: ${ENGINE_PID:-NOT RUNNING}"
echo "PHP server pid:         ${PHP_PID:-NOT RUNNING}"
echo "app (Electron) pid:     ${APP_PID:-not found}"

section "Is the simulator answering? (3 tries, 5 s limit each)"
# timed out = engine alive but stuck; refused (000 at once) = engine not running
for i in 1 2 3; do
  curl -s -m 5 -o /dev/null -w "engine  :40845/simstatus.cgi  HTTP %{http_code}  %{time_total}s\n" \
       "http://127.0.0.1:40845/simstatus.cgi?status=1"
done
curl -s -m 5 -o /dev/null -w "PHP     :8081/sim-ii/css/common.css  HTTP %{http_code}  %{time_total}s\n" \
     "http://127.0.0.1:8081/sim-ii/css/common.css"
echo "engine status reply (first 400 characters):"
curl -s -m 5 "http://127.0.0.1:40845/simstatus.cgi?status=1" | head -c 400; echo

section "Processes: CPU, memory, state, running time"
ps -o pid,ppid,%cpu,%mem,rss,vsz,state,etime,command -p "${ENGINE_PID:-0},${PHP_PID:-0},${APP_PID:-0}" 2>/dev/null
for p in $ENGINE_PID $PHP_PID; do
  echo "threads in $p: $(( $(ps -M -p "$p" 2>/dev/null | wc -l) - 1 ))"
done

section "Network connections on the simulator ports (by state)"
# server side = the simulator's end of a connection; client side = the app's
netstat -anp tcp 2>/dev/null | awk '
  $4 ~ /\.(40845|40844|8081)$/ { n = split($4, a, "."); print ":" a[n], "server-side", $6; next }
  $5 ~ /\.(40845|40844|8081)$/ { n = split($5, a, "."); print ":" a[n], "client-side", $6 }' \
  | sort | uniq -c | sort -rn

if [ -n "$ENGINE_PID" ]; then
  section "Engine open files and sockets"
  lsof -nP -p "$ENGINE_PID" > "$OUT/engine-lsof.txt" 2>/dev/null
  echo "total open: $(( $(wc -l < "$OUT/engine-lsof.txt") - 1 ))"
  awk 'NR>1 {print $5}' "$OUT/engine-lsof.txt" | sort | uniq -c | sort -rn | head
  echo "TCP by state:"
  grep TCP "$OUT/engine-lsof.txt" | grep -o '([A-Z_]*)' | sort | uniq -c

  section "Engine thread stacks (10 s sample) -> engine-sample.txt"
  sample "$ENGINE_PID" 10 -file "$OUT/engine-sample.txt" >/dev/null 2>&1 && echo saved || echo "sample failed"
fi
if [ -n "$PHP_PID" ]; then
  sample "$PHP_PID" 3 -file "$OUT/php-sample.txt" >/dev/null 2>&1 && echo "PHP stacks saved -> php-sample.txt"
fi

section "Sleep and App Nap"
pmset -g assertions 2>/dev/null | sed -n '1,40p'
echo "--- recent sleep/wake events ---"
pmset -g log 2>/dev/null | grep -E ' (Sleep|Wake|DarkWake) ' | tail -15

section "Logs"
copy_logs() {   # $1 = a simlogs folder, $2 = label
  [ -d "$1" ] || return
  echo "found: $1"
  [ -f "$1/vetsim.log" ] && tail -n 5000 "$1/vetsim.log" > "$OUT/logs/$2-vetsim-tail.log"
  [ -f "$1/php.log" ]    && tail -n 1000 "$1/php.log"    > "$OUT/logs/$2-php-tail.log"
  ls -t "$1"/20*.log 2>/dev/null | head -3 | while read -r f; do cp "$f" "$OUT/logs/$2-$(basename "$f")"; done
}
copy_logs "$HOME/Library/Application Support/OpenVetSim/simlogs" app
copy_logs "$HOME/Documents/Claude OVS/simlogs" dev

section "Done"
echo "Saved to: $OUT"
open "$OUT" 2>/dev/null
