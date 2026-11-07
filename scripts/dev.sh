#!/usr/bin/env bash
# Start/stop the dev servers in the background.
#
#   scripts/dev.sh start  frontend|backend ...
#   scripts/dev.sh stop   frontend|backend ...
#   scripts/dev.sh status frontend|backend ...
#   scripts/dev.sh restart frontend|backend ...   (stop all named, then start them)
#
# Normally called through the wrappers next to it
# (scripts/frontend-start, scripts/project-stop, ...). See RUNBOOK.md.
#
# - start: runs the server detached (survives closing the terminal's prompt),
#   output goes to .run/<name>.log, then waits until it answers HTTP.
# - stop:  kills every process of *this project's* server, found by command
#   line (e.g. node running frontend/.../vite, python running backend fastapi),
#   so it also stops servers started by hand with `npm run dev`.
#   Matching by command line rather than by a saved PID is deliberate: on
#   Windows, uv -> venv python launcher -> uvicorn don't form one process tree,
#   so killing the launched PID leaves the real server running.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
START_TIMEOUT=90   # seconds to wait for a server to answer

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) IS_WINDOWS=1 ;;
  *) IS_WINDOWS=0 ;;
esac

# --- service definitions -----------------------------------------------------

service_known() { case "$1" in frontend | backend) return 0 ;; *) return 1 ;; esac; }

service_url() {
  case "$1" in
    frontend) echo "http://localhost:5173" ;;
    backend) echo "http://127.0.0.1:8000/docs" ;;
  esac
}

service_cmd() {
  case "$1" in
    # --strictPort: fail instead of silently moving to 5174 if 5173 is taken.
    frontend) echo "npm run dev --prefix '$ROOT/frontend' -- --port 5173 --strictPort" ;;
    backend) echo "uv run --directory '$ROOT/backend' fastapi dev app/main.py --port 8000" ;;
  esac
}

# Process matching: command line must contain the service dir AND one of these.
service_dir() { echo "$ROOT/$1"; }
service_markers() {
  case "$1" in
    frontend) echo "vite npm-cli" ;;
    backend) echo "fastapi uvicorn" ;;
  esac
}

# --- helpers -----------------------------------------------------------------

is_up() { curl -s -o /dev/null --max-time 2 "$(service_url "$1")"; }

# PIDs (Windows PIDs on Windows) of this project's processes for a service.
service_pids() {
  local name=$1 dir markers
  dir=$(service_dir "$name")
  markers=$(service_markers "$name")
  if [ "$IS_WINDOWS" = 1 ]; then
    local windir marker_list
    windir=$(cygpath -w "$dir")
    marker_list=$(printf "'%s'," $markers)
    marker_list=${marker_list%,}
    # Command lines mix / and \ so normalise to \ before comparing.
    powershell.exe -NoProfile -NonInteractive -Command "
      \$dir = '$windir'.ToLower()
      \$markers = @($marker_list)
      Get-CimInstance Win32_Process -Filter \"Name='node.exe' or Name='python.exe' or Name='uv.exe' or Name='cmd.exe'\" |
        Where-Object {
          \$c = (\$_.CommandLine + '').Replace('/', '\\').ToLower()
          \$c.Contains(\$dir) -and (\$markers | Where-Object { \$c.Contains(\$_) })
        } | ForEach-Object { \$_.ProcessId }
    " 2>/dev/null | tr -d '\r' | sed '/^$/d'
  else
    local marker
    for marker in $markers; do
      pgrep -f "$dir.*$marker|$marker.*$dir" 2>/dev/null
    done | sort -u | grep -v "^$$\$"
  fi
}

# Kill a process and all its children. On Windows the PID is a Windows PID.
kill_tree() {
  local pid=$1
  if [ "$IS_WINDOWS" = 1 ]; then
    taskkill //PID "$pid" //T //F >/dev/null 2>&1
  else
    local child
    for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
    kill "$pid" 2>/dev/null
  fi
  return 0
}

# --- commands ----------------------------------------------------------------

start_service() {
  local name=$1 url log_file
  url=$(service_url "$name")
  log_file="$RUN_DIR/$name.log"

  if is_up "$name"; then
    echo "$name: already running ($url)"
    return 0
  fi

  mkdir -p "$RUN_DIR"
  (cd "$ROOT" && nohup bash -c "exec $(service_cmd "$name")" >"$log_file" 2>&1 </dev/null &)

  printf '%s: starting' "$name"
  local waited=0
  until is_up "$name"; do
    if [ "$waited" -ge "$START_TIMEOUT" ]; then
      echo
      echo "$name: did not answer within ${START_TIMEOUT}s. Last log lines (.run/$name.log):"
      tail -n 20 "$log_file" | sed 's/^/  | /'
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
    printf '.'
  done
  echo " up at $url  (log: .run/$name.log)"
}

stop_service() {
  local name=$1 pids pid tries=0 stopped=0
  while pids=$(service_pids "$name") && [ -n "$pids" ]; do
    if [ "$tries" -ge 5 ]; then
      echo "$name: could not stop PIDs: $(echo $pids)"
      return 1
    fi
    for pid in $pids; do kill_tree "$pid"; done
    stopped=1
    tries=$((tries + 1))
    sleep 1
  done

  if [ "$stopped" = 1 ]; then
    echo "$name: stopped"
  elif is_up "$name"; then
    echo "$name: something answers at $(service_url "$name") but it isn't this project's server; left it alone"
    return 1
  else
    echo "$name: not running"
  fi
}

status_service() {
  local name=$1
  if is_up "$name"; then
    echo "$name: running ($(service_url "$name"))"
  else
    echo "$name: stopped"
  fi
}

# --- main --------------------------------------------------------------------

usage() {
  echo "usage: $0 start|stop|restart|status frontend|backend ..." >&2
  exit 2
}

[ $# -ge 2 ] || usage
cmd=$1
shift

for name in "$@"; do
  service_known "$name" || { echo "unknown service: $name" >&2; usage; }
done

if [ "$cmd" = restart ]; then
  # Stop everything first (frontend before backend), then start in the order given.
  status=0
  for name in frontend backend; do
    case " $* " in *" $name "*) stop_service "$name" || status=1 ;; esac
  done
  for name in "$@"; do start_service "$name" || status=1; done
  exit $status
fi

status=0
for name in "$@"; do
  service_known "$name" || { echo "unknown service: $name" >&2; usage; }
  case "$cmd" in
    start) start_service "$name" || status=1 ;;
    stop) stop_service "$name" || status=1 ;;
    status) status_service "$name" ;;
    *) usage ;;
  esac
done
exit $status
