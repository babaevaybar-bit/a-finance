#!/usr/bin/env python3
"""
Progress monitor script for Deep Research (single-check mode).

Each invocation reads only new content from the log file, prints it, then exits immediately.
A <log_file>.pos file tracks the last read byte position so subsequent calls resume from there.

Usage (called in a loop by the model, with increasing sleep intervals):
    python3 scripts/monitor.py --log-file /tmp/dr_google_xxx.log [--pid 12345]

Exit codes:
    0 - Task completed ([DONE] found in log)
    1 - Task failed ([ERROR] found in log)
    2 - Task still running, continue monitoring
    3 - Process has exited but no termination marker found (unexpected exit)
"""

import argparse
import os
import sys
import time

sys.stdout.reconfigure(line_buffering=True)


def read_pos(log_file: str) -> int:
    """
    read_pos
    """
    pos_file = log_file + ".pos"
    if not os.path.exists(pos_file):
        return 0
    try:
        with open(pos_file, "r") as f:
            return int(f.read().strip())
    except (ValueError, OSError):
        return 0


def write_pos(log_file: str, pos: int) -> None:
    """
    write_pos
    """
    try:
        with open(log_file + ".pos", "w") as f:
            f.write(str(pos))
    except OSError:
        pass


def is_process_alive(pid: int) -> bool:
    """
    is_process_alive
    """
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError):
        return False


def main():
    """
    main
    """
    parser = argparse.ArgumentParser(description="Deep Research progress monitor (single-check mode)")
    parser.add_argument("--log-file", required=True, help="Path to the log file")
    parser.add_argument("--pid", type=int, default=None, help="PID of the worker process to monitor")
    args = parser.parse_args()

    log_file = args.log_file
    pid = args.pid

    last_pos = read_pos(log_file)
    new_lines = []

    if os.path.exists(log_file):
        with open(log_file, "r", encoding="utf-8") as f:
            f.seek(last_pos)
            content = f.read()
            new_pos = f.tell()
        new_lines = [l for l in content.splitlines() if l.strip()]
        write_pos(log_file, new_pos)

    if new_lines:
        print(f"[{time.strftime('%H:%M:%S')}] Progress update:")
        for line in new_lines:
            print(f"  {line}")
    else:
        print(f"[{time.strftime('%H:%M:%S')}] No new progress...")
    sys.stdout.flush()

    all_done = False
    all_error = False
    if os.path.exists(log_file):
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                full = f.read()
            all_done = "[DONE]" in full
            all_error = "[ERROR]" in full
        except OSError:
            pass

    if all_done:
        sys.exit(0)
    if all_error:
        sys.exit(1)

    if pid is not None and not is_process_alive(pid):
        print(f"[{time.strftime('%H:%M:%S')}] Process {pid} has exited without [DONE] marker")
        sys.exit(3)

    sys.exit(2)


if __name__ == "__main__":
    main()
