#!/usr/bin/env python3
"""Agent E integration-test harness — one-command runner.

Example:
    python tools/e2e/run_suite.py --base-url http://host:58337 \
        --ws-url ws://host:58337/ws [--tests E1,E3,E6]

Per §3.5 / §3.6 the runner emits:
- JUnit XML per run
- Markdown + JSON summaries
- idempotence snapshot diff (before first run vs after last run)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
BRIDGE_ROOT = HERE.parent.parent
OUTPUT_DEFAULT = HERE / "fixtures"

SCENARIOS = {
    "E1": "test_e1_actor_lifecycle.py",
    "E2": "test_e2_sensor_stream.py",
    "E4": "test_e4_weather.py",
    "E6": "test_e6_slow_client.py",
    "E7": "test_e7_sensor_destroy.py",
    "E8": "test_e8_concurrent_subs.py",
    "E5": "test_e5_recording.py",
    "E3": "test_e3_hot_reload.py",
}

COORDINATION_LOG = {
    "production_imports": [
        "from src.ws.protocol import decode_frame, decode_frame_header, decode_camera_payload, decode_world_tick_payload, encode_frame",
        "from src.ws.channels import Channel, CHANNEL_NAMES",
    ],
    "agent_a_thresholds": {
        "e6_absolute_stddev_floor_ms": 50.0,
        "e6_relative_stddev_factor": 3.0,
        "e6_relative_p95_factor": 3.0,
        "e6_slow_min_frames": 5,
        "camera_nominal_fps": 20.0,
    },
    "agent_d_note": "Adaptive-rate behavior is only indirectly covered via the live bridge timing in E6; no dedicated D-only route/assertion exists in this harness.",
    "route_ambiguities": [
        "Some live bridge sessions may not expose /api/realtime/session even though the repo checkout defines it; runner/tests fall back to actor-role inference.",
        "WORLD_TICK currently carries frame/timestamp/actors only, not weather; E4 asserts weather via HTTP plus tick continuity.",
        "Recording/replay endpoints do not expose replay status or replayed actor ids; E5 infers the replayed vehicle from /api/actors.",
    ],
}

LIMITATIONS = [
    "Recording determinism is tolerance-based, not exact; E5 uses a best-aligned max per-axis replay-error threshold of 5 m.",
    "E4 does not assert weather effects on rendered sensor output, only the weather API state plus WORLD_TICK continuity.",
    "E6 thresholds assume a 20 FPS RGB camera (sensor_tick=0.05); other sensor classes need different acceptance bounds.",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Agent E integration test harness")
    parser.add_argument("--base-url", default="http://127.0.0.1:58337", help="Bridge HTTP base URL")
    parser.add_argument("--ws-url", default=None, help="Bridge WS URL (default: derived from --base-url + /ws)")
    parser.add_argument("--tests", default=None, help="Comma-separated subset (e.g. E1,E3,E6). Default: all")
    parser.add_argument("--runs", type=int, default=1, help="Sequential run count for flake analysis")
    parser.add_argument("--output", default=str(OUTPUT_DEFAULT), help="Artifact directory")
    parser.add_argument("--pytest-args", default="", help="Extra args passed through to pytest")
    return parser.parse_args()


def derive_ws_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 58337
    return f"{scheme}://{host}:{port}/ws"


def http_json(base_url: str, path: str) -> dict[str, Any] | None:
    req = urllib.request.Request(base_url.rstrip("/") + path, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def fetch_runtime_snapshot(base_url: str) -> dict[str, Any]:
    snapshot: dict[str, Any] = {
        "reachable": False,
        "session": {},
        "non_managed_actor_ids": [],
        "non_managed_actor_count": None,
        "weather": None,
        "health": None,
        "actors_total": None,
    }
    health = http_json(base_url, "/health")
    if not health:
        return snapshot
    snapshot["reachable"] = True
    snapshot["health"] = health
    session = http_json(base_url, "/api/realtime/session") or {}
    info = http_json(base_url, "/api/info") or {}
    actors = http_json(base_url, "/api/actors") or {}
    weather = http_json(base_url, "/api/world/weather")
    count = http_json(base_url, "/api/actors/count") or {}

    actor_rows = actors.get("actors", []) if isinstance(actors, dict) else []
    bridge_ego = next((row for row in actor_rows if row.get("role_name") == "bridge_ego"), None)
    if "default_vehicle_id" not in session and bridge_ego is not None:
        vehicle_id = int(bridge_ego["id"])
        camera = next(
            (
                row
                for row in actor_rows
                if row.get("parent_id") == vehicle_id and row.get("type_id", "").startswith("sensor.camera.")
            ),
            None,
        )
        session = {
            "default_vehicle_id": vehicle_id,
            "default_camera_id": int(camera["id"]) if camera else None,
            "session_ready": camera is not None,
            "state": "INFERRED_READY" if camera else "INFERRED_PARTIAL",
        }
    snapshot["session"] = {**info, **session}
    snapshot["weather"] = weather
    snapshot["actors_total"] = count.get("count")

    managed_ids = {
        value
        for key, value in snapshot["session"].items()
        if key in {"default_vehicle_id", "default_camera_id"} and value is not None
    }
    non_managed = [
        int(row["id"])
        for row in actor_rows
        if int(row["id"]) not in managed_ids
        and row.get("role_name") != "bridge_ego"
        and row.get("parent_id") not in managed_ids
        and not row.get("type_id", "").startswith("traffic.")
    ]
    snapshot["non_managed_actor_ids"] = sorted(non_managed)
    snapshot["non_managed_actor_count"] = len(non_managed)
    return snapshot


def diff_snapshots(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    before_ids = set(before.get("non_managed_actor_ids") or [])
    after_ids = set(after.get("non_managed_actor_ids") or [])
    return {
        "reachable_before": before.get("reachable"),
        "reachable_after": after.get("reachable"),
        "non_managed_added": sorted(after_ids - before_ids),
        "non_managed_removed": sorted(before_ids - after_ids),
        "non_managed_count_before": before.get("non_managed_actor_count"),
        "non_managed_count_after": after.get("non_managed_actor_count"),
        "weather_before": before.get("weather"),
        "weather_after": after.get("weather"),
        "session_before": before.get("session"),
        "session_after": after.get("session"),
        "actors_total_before": before.get("actors_total"),
        "actors_total_after": after.get("actors_total"),
    }


def parse_junit(path: Path) -> dict[str, Any]:
    try:
        tree = ET.parse(path)
        root = tree.getroot()
    except Exception:
        return {"tests": [], "passed": 0, "failed": 0, "skipped": 0}

    tests: list[dict[str, Any]] = []
    for suite in root.iter("testsuite"):
        for case in suite.iter("testcase"):
            entry = {
                "name": case.get("name") or "",
                "classname": case.get("classname") or "",
                "time": float(case.get("time", 0.0)),
                "status": "passed",
                "message": "",
            }
            failure = case.find("failure")
            error = case.find("error")
            skipped = case.find("skipped")
            if failure is not None or error is not None:
                failure_node = failure if failure is not None else error
                entry["status"] = "failed"
                entry["message"] = (failure_node.get("message") or failure_node.text or "").strip()[:500]
            elif skipped is not None:
                entry["status"] = "skipped"
                entry["message"] = (skipped.get("message") or skipped.text or "").strip()[:500]
            tests.append(entry)

    return {
        "tests": tests,
        "passed": sum(1 for test in tests if test["status"] == "passed"),
        "failed": sum(1 for test in tests if test["status"] == "failed"),
        "skipped": sum(1 for test in tests if test["status"] == "skipped"),
    }


def run_once(args: argparse.Namespace, run_idx: int, tests: list[str], output_dir: Path) -> dict[str, Any]:
    junit = output_dir / f"junit_run{run_idx}.xml"
    log_file = output_dir / f"run{run_idx}.log"
    env = os.environ.copy()
    parsed = urlparse(args.base_url)
    env["BRIDGE_HOST_E2E"] = parsed.hostname or "127.0.0.1"
    env["BRIDGE_PORT"] = str(parsed.port or 58337)
    env["BRIDGE_WS_URL_E2E"] = args.ws_url
    env["PYTHONPATH"] = f"{BRIDGE_ROOT}:{env.get('PYTHONPATH', '')}"

    cmd = [
        sys.executable,
        "-m",
        "pytest",
        "-v",
        "--tb=short",
        f"--junit-xml={junit}",
        "--log-cli-level=INFO",
        "--log-cli-format=%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    ]
    cmd.extend(str(HERE / SCENARIOS[test]) for test in tests)
    if args.pytest_args:
        cmd.extend(args.pytest_args.split())

    start = time.time()
    with log_file.open("w") as handle:
        proc = subprocess.run(cmd, cwd=BRIDGE_ROOT, env=env, stdout=handle, stderr=subprocess.STDOUT)
    duration = time.time() - start

    summary = parse_junit(junit)
    summary.update(
        {
            "run": run_idx,
            "duration_s": duration,
            "returncode": proc.returncode,
            "junit": str(junit),
            "log": str(log_file),
        }
    )
    return summary


def render_markdown(
    args: argparse.Namespace,
    runs: list[dict[str, Any]],
    idempotence: dict[str, Any],
    bridge_log_path: str | None,
) -> str:
    lines = ["# Agent E Integration Test Harness Report", ""]
    lines.extend(
        [
            f"- Base URL: `{args.base_url}`",
            f"- WS URL: `{args.ws_url}`",
            f"- Runs: {len(runs)}",
            f"- Scope: {args.tests or 'ALL'}",
            "",
            "## 1. Scenario-by-scenario pass/fail table",
            "",
        ]
    )

    for run in runs:
        lines.append(f"### Run {run['run']} — returncode={run['returncode']} duration={run['duration_s']:.1f}s")
        lines.append("")
        lines.append("| Scenario | Status | Time (s) | Evidence |")
        lines.append("|---|---|---:|---|")
        for test in run.get("tests", []):
            evidence = f"`{Path(run['log']).name}`"
            note = test.get("message", "").replace("\n", " ")[:120]
            if note:
                evidence += f" — {note}"
            scenario = test["name"].replace("test_", "").replace("_", " ")
            lines.append(f"| {scenario} | {test['status']} | {test['time']:.2f} | {evidence} |")
        lines.append("")
        lines.append(f"Passed={run['passed']} Failed={run['failed']} Skipped={run['skipped']}")
        lines.append("")

    lines.append("## 2. Idempotence re-run diff summary")
    lines.append("")
    lines.append(f"- non-managed actor count: {idempotence['non_managed_count_before']} -> {idempotence['non_managed_count_after']}")
    lines.append(f"- non-managed actors added: {idempotence['non_managed_added']}")
    lines.append(f"- non-managed actors removed: {idempotence['non_managed_removed']}")
    lines.append(f"- total actor count: {idempotence['actors_total_before']} -> {idempotence['actors_total_after']}")
    lines.append(f"- session before: `{json.dumps(idempotence['session_before'], sort_keys=True)}`")
    lines.append(f"- session after: `{json.dumps(idempotence['session_after'], sort_keys=True)}`")
    lines.append(f"- weather before: `{json.dumps(idempotence['weather_before'], sort_keys=True)}`")
    lines.append(f"- weather after: `{json.dumps(idempotence['weather_after'], sort_keys=True)}`")
    lines.append("")

    total_results = sum(run["passed"] + run["failed"] + run["skipped"] for run in runs)
    total_failures = sum(run["failed"] for run in runs)
    flake_rate = (total_failures / total_results * 100.0) if total_results else 0.0
    lines.append("## 3. Flake analysis")
    lines.append("")
    lines.append(f"- sequential runs: {len(runs)}")
    lines.append(f"- total results: {total_results}")
    lines.append(f"- failures: {total_failures}")
    lines.append(f"- flake rate: {flake_rate:.1f}%")
    quarantine = [test['name'] for run in runs for test in run.get('tests', []) if test['status'] == 'failed']
    lines.append(f"- quarantine list: {sorted(set(quarantine)) if quarantine else []}")
    lines.append("")

    lines.append("## 4. Coordination log")
    lines.append("")
    lines.append("### Exact symbol imports from production code")
    for item in COORDINATION_LOG["production_imports"]:
        lines.append(f"- `{item}`")
    lines.append("### Shared thresholds with Agent A / Agent D")
    lines.append(f"- Agent A E6 thresholds: `{json.dumps(COORDINATION_LOG['agent_a_thresholds'], sort_keys=True)}`")
    lines.append(f"- Agent D note: {COORDINATION_LOG['agent_d_note']}")
    lines.append("### Route/schema ambiguities")
    for item in COORDINATION_LOG["route_ambiguities"]:
        lines.append(f"- {item}")
    lines.append("")

    lines.append("## 5. Limitations")
    lines.append("")
    for item in LIMITATIONS:
        lines.append(f"- {item}")
    lines.append("")

    lines.append("## Bridge log evidence")
    lines.append("")
    if bridge_log_path:
        lines.append(f"- inspected log path candidate: `{bridge_log_path}`")
    else:
        lines.append("- no stable bridge log file was discoverable from the no-restart runner context")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    if args.ws_url is None:
        args.ws_url = derive_ws_url(args.base_url)

    tests = [token.strip().upper() for token in args.tests.split(",")] if args.tests else list(SCENARIOS)
    unknown = [token for token in tests if token not in SCENARIOS]
    if unknown:
        print(f"ERROR: unknown tests {unknown}. Valid: {sorted(SCENARIOS)}", file=sys.stderr)
        return 2

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    before = fetch_runtime_snapshot(args.base_url)
    if not before["reachable"]:
        print(
            f"Bridge not reachable at {args.base_url}; no-restart contract forbids reviving it from the runner.",
            file=sys.stderr,
        )
        return 2
    health = before.get("health") or {}
    if not health.get("carla_connected"):
        print(
            f"CARLA not reachable through {args.base_url} within 5 s: {health}. "
            "The no-restart contract forbids reviving it from the runner.",
            file=sys.stderr,
        )
        return 2

    runs: list[dict[str, Any]] = []
    for run_idx in range(1, args.runs + 1):
        print(f"=== Run {run_idx}/{args.runs} ===", flush=True)
        summary = run_once(args, run_idx, tests, output_dir)
        print(
            f"    passed={summary['passed']} failed={summary['failed']} skipped={summary['skipped']} rc={summary['returncode']}",
            flush=True,
        )
        runs.append(summary)

    after = fetch_runtime_snapshot(args.base_url)
    idempotence = diff_snapshots(before, after)
    bridge_log = next((candidate for candidate in ("/tmp/bridge.log", str(BRIDGE_ROOT / "bridge.log"), str(BRIDGE_ROOT / "supervisor.log")) if Path(candidate).exists()), None)

    summary_json = {
        "args": vars(args),
        "runs": runs,
        "idempotence": idempotence,
        "coordination_log": COORDINATION_LOG,
        "limitations": LIMITATIONS,
        "bridge_log_path": bridge_log,
    }
    json_path = output_dir / "summary.json"
    json_path.write_text(json.dumps(summary_json, indent=2, default=str))

    md_path = output_dir / "summary.md"
    md_path.write_text(render_markdown(args, runs, idempotence, bridge_log))
    print(f"Summary: {md_path}")
    print(f"JSON:    {json_path}")

    return 0 if all(run["failed"] == 0 and run["returncode"] == 0 for run in runs) else 1


if __name__ == "__main__":
    sys.exit(main())
