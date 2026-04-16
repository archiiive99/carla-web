"""Per-client adaptive sensor-rate controller (Agent D).

This module owns two related concerns:
  * D1: per-(client, sensor) send decisions via ``should_send``.
  * D2: the 1 Hz adaptive control loop driven by client health reports.

The queue/worker architecture stays in ``sensor_manager.py``; this module only
answers "who should receive this frame right now?" and "should this client be
upgraded/downgraded?".
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from src.config import (
    ADAPTIVE_BACKLOG_HEALTHY,
    ADAPTIVE_BACKLOG_HIGH,
    ADAPTIVE_BACKLOG_TREND_SAMPLES,
    ADAPTIVE_DECODE_LAG_HEALTHY_MS,
    ADAPTIVE_DECODE_LAG_HIGH_MS,
    ADAPTIVE_DOWNGRADE_FACTOR,
    ADAPTIVE_DOWNGRADE_HYSTERESIS_SECONDS,
    ADAPTIVE_HEALTHY_SAMPLE_WINDOW,
    ADAPTIVE_MAX_FPS,
    ADAPTIVE_RATE_ENABLED,
    ADAPTIVE_SAMPLE_HZ,
    ADAPTIVE_STATS_HISTORY,
    ADAPTIVE_UPGRADE_COOLDOWN_SECONDS,
    ADAPTIVE_UPGRADE_FACTOR,
    ADAPTIVE_VIEWPORT_INACTIVE_FPS,
    MIN_CLIENT_FPS,
)

if TYPE_CHECKING:
    from src.sensor_manager import SensorManager
    from src.ws_broadcaster import ClientConnection, WebSocketBroadcaster

logger = logging.getLogger(__name__)


def _finite_or_zero(value: Any) -> float:
    """Coerce a stats value to a finite float, returning 0.0 for
    None / non-numeric / NaN / Infinity inputs. Stats from a hostile or
    buggy WS client could otherwise inject NaN into the rate controller's
    thresholds — NaN > x is always False so downgrade never fires and
    the controller silently degrades."""
    try:
        result = float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0
    return result if math.isfinite(result) else 0.0


@dataclass(slots=True)
class SubscriberRate:
    target_fps: float
    effective_fps: float
    frames_since_send: int = 0
    last_adjust_time: float = 0.0
    viewport_forced: bool = False
    last_downgrade_time: float = 0.0


@dataclass(slots=True)
class ClientStatsSample:
    ts_monotonic_server: float
    client_id: str
    sensor_stats: dict[int, dict[str, float]]
    rtt_ms: float | None
    viewport_active: bool


@dataclass(slots=True)
class RateAdjustment:
    client_id: str
    sensor_id: int
    old_fps: float
    new_fps: float
    reason: str
    backlog: float
    decode_lag_ms: float
    rtt_ms: float | None
    viewport_active: bool


@dataclass(slots=True)
class RateController:
    history_size: int = ADAPTIVE_STATS_HISTORY
    sample_hz: float = ADAPTIVE_SAMPLE_HZ
    _state: dict[tuple[str, int], SubscriberRate] = field(default_factory=dict)
    _samples: dict[tuple[str, int], deque[ClientStatsSample]] = field(default_factory=dict)
    _last_stats_token: dict[str, str] = field(default_factory=dict)
    _logged_unknown_native: set[tuple[str, int]] = field(default_factory=set)

    def ensure_state(
        self,
        client_id: str,
        sensor_id: int,
        *,
        native_fps: float | None,
        default_target_fps: float,
        now_monotonic: float | None = None,
    ) -> SubscriberRate:
        key = (client_id, sensor_id)
        state = self._state.get(key)
        if state is not None:
            return state
        now_monotonic = now_monotonic if now_monotonic is not None else time.monotonic()
        clamped = self._clamp_fps(default_target_fps, native_fps)
        state = SubscriberRate(
            target_fps=clamped,
            effective_fps=clamped,
            frames_since_send=0,
            last_adjust_time=now_monotonic,
        )
        self._state[key] = state
        return state

    def clear_subscription(self, client_id: str, sensor_id: int) -> None:
        key = (client_id, sensor_id)
        self._state.pop(key, None)
        self._samples.pop(key, None)
        self._logged_unknown_native.discard(key)

    def clear_sensor(self, sensor_id: int) -> None:
        for key in [k for k in self._state if k[1] == sensor_id]:
            self.clear_subscription(*key)

    def set_target_fps(
        self,
        client_id: str,
        sensor_id: int,
        target_fps: float,
        *,
        native_fps: float | None,
        now_monotonic: float | None = None,
    ) -> float:
        now_monotonic = now_monotonic if now_monotonic is not None else time.monotonic()
        clamped = self._clamp_fps(target_fps, native_fps)
        state = self.ensure_state(
            client_id,
            sensor_id,
            native_fps=native_fps,
            default_target_fps=clamped,
            now_monotonic=now_monotonic,
        )
        state.target_fps = clamped
        state.effective_fps = clamped
        state.frames_since_send = 0
        state.last_adjust_time = now_monotonic
        state.last_downgrade_time = 0.0
        state.viewport_forced = False
        logger.info("client %s: sensor %s target_fps := %.2f", client_id, sensor_id, clamped)
        return clamped

    def restore_state(
        self,
        client_id: str,
        sensor_id: int,
        snapshot: SubscriberRate,
        *,
        native_fps: float | None,
        now_monotonic: float | None = None,
    ) -> None:
        now_monotonic = now_monotonic if now_monotonic is not None else time.monotonic()
        target = max(MIN_CLIENT_FPS, min(float(snapshot.target_fps), ADAPTIVE_MAX_FPS))
        effective = target
        if native_fps is not None and native_fps > 0:
            effective = min(effective, native_fps)
        self._state[(client_id, sensor_id)] = SubscriberRate(
            target_fps=target,
            effective_fps=effective,
            frames_since_send=0,
            last_adjust_time=now_monotonic,
            viewport_forced=False,
            last_downgrade_time=0.0,
        )

    def get_state(self, client_id: str, sensor_id: int) -> SubscriberRate | None:
        return self._state.get((client_id, sensor_id))

    def get_target_fps(self, client_id: str, sensor_id: int) -> float | None:
        state = self.get_state(client_id, sensor_id)
        return None if state is None else state.target_fps

    def iter_rates(self) -> list[tuple[str, int, float, float]]:
        return [
            (client_id, sensor_id, state.target_fps, state.effective_fps)
            for (client_id, sensor_id), state in sorted(self._state.items())
        ]

    def should_send(
        self,
        client_id: str,
        sensor_id: int,
        sensor_native_fps: float | None,
    ) -> bool:
        state = self._state.get((client_id, sensor_id))
        if state is None:
            return True
        if sensor_native_fps is None or sensor_native_fps <= 0:
            key = (client_id, sensor_id)
            if key not in self._logged_unknown_native:
                logger.debug(
                    "Adaptive rate fallback for client=%s sensor=%s: native fps unknown, sending every frame",
                    client_id,
                    sensor_id,
                )
                self._logged_unknown_native.add(key)
            return True

        effective_fps = max(MIN_CLIENT_FPS, min(state.effective_fps, state.target_fps, sensor_native_fps))
        # MIN_CLIENT_FPS is the floor, but it's env-configurable and an
        # operator could set it to 0 — combined with a client-requested
        # target_fps=0 this would propagate to effective_fps=0 and the
        # ratio division below would ZeroDivisionError every frame,
        # spamming the worker-error log and gating every subsequent
        # packet. "Send every frame" is the safe fallback shape, matching
        # the sensor_native_fps <= 0 branch just above.
        if effective_fps <= 0:
            state.frames_since_send = 0
            return True
        ratio = sensor_native_fps / effective_fps
        if ratio <= 1.0:
            state.frames_since_send = 0
            return True

        state.frames_since_send += 1
        if state.frames_since_send + 1e-9 >= ratio:
            state.frames_since_send = 0
            return True
        return False

    def ingest_connection_stats(
        self,
        client_id: str,
        raw_stats: Mapping[str, Any],
        *,
        now_monotonic: float | None = None,
    ) -> None:
        sensors = raw_stats.get("sensors")
        if not isinstance(sensors, Mapping):
            return

        token = self._stats_token(raw_stats)
        if self._last_stats_token.get(client_id) == token:
            return
        self._last_stats_token[client_id] = token

        now_monotonic = now_monotonic if now_monotonic is not None else time.monotonic()
        rtt_ms = self._coerce_optional_float(raw_stats.get("rtt_ms"))
        viewport_active = bool(raw_stats.get("viewport_active", True))

        for raw_sensor_id, stats in sensors.items():
            if not isinstance(stats, Mapping):
                continue
            try:
                sensor_id = int(raw_sensor_id)
            except (TypeError, ValueError):
                continue

            # Non-finite stat values (NaN / Infinity from a buggy or
            # hostile client) would silently degrade the rate controller:
            # backlog > threshold is False for NaN, so downgrade never
            # fires and the client stays on effective_fps=target while
            # actually unable to keep up. Coerce non-finite to 0 so the
            # rate controller just treats the reading as "zero backlog"
            # (healthy) — same shape as the missing-key fallback.
            parsed_stats = {
                "queue_backlog": _finite_or_zero(stats.get("queue_backlog", 0.0)),
                "decode_lag_ms": _finite_or_zero(stats.get("decode_lag_ms", 0.0)),
                "frames_dropped": _finite_or_zero(stats.get("frames_dropped", 0.0)),
                "frames_received": _finite_or_zero(stats.get("frames_received", 0.0)),
            }
            sample = ClientStatsSample(
                ts_monotonic_server=now_monotonic,
                client_id=client_id,
                sensor_stats={sensor_id: parsed_stats},
                rtt_ms=rtt_ms,
                viewport_active=viewport_active,
            )
            key = (client_id, sensor_id)
            buf = self._samples.setdefault(key, deque(maxlen=self.history_size))
            buf.append(sample)

    def refresh_stats_from_connections(
        self,
        clients: Mapping[str, ClientConnection],
        *,
        now_monotonic: float | None = None,
    ) -> None:
        live_client_ids = set(clients)
        for client_id in list(self._last_stats_token):
            if client_id not in live_client_ids:
                self._last_stats_token.pop(client_id, None)

        for client_id, conn in clients.items():
            raw_stats = getattr(conn, "last_stats", None)
            if isinstance(raw_stats, Mapping):
                self.ingest_connection_stats(client_id, raw_stats, now_monotonic=now_monotonic)

    def tick(
        self,
        clients: Mapping[str, ClientConnection] | None = None,
        *,
        now_monotonic: float | None = None,
    ) -> list[RateAdjustment]:
        now_monotonic = now_monotonic if now_monotonic is not None else time.monotonic()
        if clients is not None:
            self.refresh_stats_from_connections(clients, now_monotonic=now_monotonic)
        adjustments: list[RateAdjustment] = []

        for key, state in list(self._state.items()):
            client_id, sensor_id = key
            samples = self._samples.get(key)
            if not samples:
                continue

            latest = samples[-1]
            stats = latest.sensor_stats.get(sensor_id, {})
            backlog = float(stats.get("queue_backlog", 0.0) or 0.0)
            decode_lag_ms = float(stats.get("decode_lag_ms", 0.0) or 0.0)
            rtt_ms = latest.rtt_ms
            viewport_active = latest.viewport_active

            if not viewport_active:
                if state.effective_fps != ADAPTIVE_VIEWPORT_INACTIVE_FPS or not state.viewport_forced:
                    adjustments.append(
                        self._apply_adjustment(
                            client_id,
                            sensor_id,
                            state,
                            ADAPTIVE_VIEWPORT_INACTIVE_FPS,
                            reason="viewport_inactive",
                            backlog=backlog,
                            decode_lag_ms=decode_lag_ms,
                            rtt_ms=rtt_ms,
                            viewport_active=viewport_active,
                            now_monotonic=now_monotonic,
                            mark_viewport_forced=True,
                        )
                    )
                continue

            if state.viewport_forced:
                adjustments.append(
                    self._apply_adjustment(
                        client_id,
                        sensor_id,
                        state,
                        state.target_fps,
                        reason="viewport_active_restore",
                        backlog=backlog,
                        decode_lag_ms=decode_lag_ms,
                        rtt_ms=rtt_ms,
                        viewport_active=viewport_active,
                        now_monotonic=now_monotonic,
                        mark_viewport_forced=False,
                    )
                )
                continue

            backlog_high = backlog > ADAPTIVE_BACKLOG_HIGH or self._is_backlog_rising(samples, sensor_id)
            decode_lag_high = decode_lag_ms > ADAPTIVE_DECODE_LAG_HIGH_MS
            healthy = self._is_healthy(samples, sensor_id)

            if backlog_high or decode_lag_high:
                if (
                    state.last_downgrade_time
                    and now_monotonic - state.last_downgrade_time < ADAPTIVE_DOWNGRADE_HYSTERESIS_SECONDS
                ):
                    continue
                new_fps = max(MIN_CLIENT_FPS, state.effective_fps * ADAPTIVE_DOWNGRADE_FACTOR)
                if new_fps < state.effective_fps:
                    adjustments.append(
                        self._apply_adjustment(
                            client_id,
                            sensor_id,
                            state,
                            new_fps,
                            reason=(
                                "backlog_high" if backlog_high and not decode_lag_high
                                else "decode_lag_high" if decode_lag_high and not backlog_high
                                else "backlog_high+decode_lag_high"
                            ),
                            backlog=backlog,
                            decode_lag_ms=decode_lag_ms,
                            rtt_ms=rtt_ms,
                            viewport_active=viewport_active,
                            now_monotonic=now_monotonic,
                            mark_downgrade=True,
                        )
                    )
                continue

            if healthy and state.effective_fps < state.target_fps:
                if now_monotonic - state.last_adjust_time <= ADAPTIVE_UPGRADE_COOLDOWN_SECONDS:
                    continue
                new_fps = min(state.target_fps, state.effective_fps * ADAPTIVE_UPGRADE_FACTOR)
                if new_fps > state.effective_fps:
                    adjustments.append(
                        self._apply_adjustment(
                            client_id,
                            sensor_id,
                            state,
                            new_fps,
                            reason="healthy_upgrade",
                            backlog=backlog,
                            decode_lag_ms=decode_lag_ms,
                            rtt_ms=rtt_ms,
                            viewport_active=viewport_active,
                            now_monotonic=now_monotonic,
                        )
                    )

        live_keys = set(self._state)
        for key in [k for k in self._samples if k not in live_keys]:
            self._samples.pop(key, None)
            self._logged_unknown_native.discard(key)

        return adjustments

    def _apply_adjustment(
        self,
        client_id: str,
        sensor_id: int,
        state: SubscriberRate,
        new_fps: float,
        *,
        reason: str,
        backlog: float,
        decode_lag_ms: float,
        rtt_ms: float | None,
        viewport_active: bool,
        now_monotonic: float,
        mark_downgrade: bool = False,
        mark_viewport_forced: bool | None = None,
    ) -> RateAdjustment:
        old_fps = state.effective_fps
        state.effective_fps = max(MIN_CLIENT_FPS, min(new_fps, state.target_fps))
        state.frames_since_send = 0
        state.last_adjust_time = now_monotonic
        if mark_downgrade:
            state.last_downgrade_time = now_monotonic
        if mark_viewport_forced is not None:
            state.viewport_forced = mark_viewport_forced
        adjustment = RateAdjustment(
            client_id=client_id,
            sensor_id=sensor_id,
            old_fps=old_fps,
            new_fps=state.effective_fps,
            reason=reason,
            backlog=backlog,
            decode_lag_ms=decode_lag_ms,
            rtt_ms=rtt_ms,
            viewport_active=viewport_active,
        )
        logger.info(
            "adaptive_rate client=%s sensor=%s backlog=%.1f decode_lag_ms=%.1f rtt_ms=%s "
            "old_fps=%.2f new_fps=%.2f target_fps=%.2f viewport_active=%s reason=%s",
            adjustment.client_id,
            adjustment.sensor_id,
            adjustment.backlog,
            adjustment.decode_lag_ms,
            "n/a" if adjustment.rtt_ms is None else f"{adjustment.rtt_ms:.1f}",
            adjustment.old_fps,
            adjustment.new_fps,
            state.target_fps,
            adjustment.viewport_active,
            adjustment.reason,
        )
        return adjustment

    @staticmethod
    def _clamp_fps(target_fps: float, native_fps: float | None) -> float:
        # A NaN/Infinity target_fps propagates through min/max (both
        # return NaN on NaN inputs in Python) and lands in
        # state.effective_fps — after which every comparison with NaN is
        # False, so the ratio-gate in should_send silently drops every
        # frame for that subscriber. The WS handler only catches
        # TypeError/ValueError from its float() cast, and float("nan")
        # succeeds without raising. Replace non-finite inputs with the
        # MIN_CLIENT_FPS floor so a hostile or buggy set_rate payload
        # just falls back to the minimum cadence instead of muting the
        # stream.
        target = float(target_fps)
        if not math.isfinite(target):
            target = MIN_CLIENT_FPS
        ceiling = ADAPTIVE_MAX_FPS
        if native_fps is not None and math.isfinite(native_fps) and native_fps > 0:
            ceiling = min(ceiling, native_fps)
        return max(MIN_CLIENT_FPS, min(target, ceiling))

    @staticmethod
    def _coerce_optional_float(value: Any) -> float | None:
        if value is None:
            return None
        try:
            result = float(value)
        except (TypeError, ValueError):
            return None
        # Reject NaN / Infinity too — same reasoning as _finite_or_zero
        # above. rtt_ms is currently only used in log formatting
        # (f"{rtt_ms:.1f}" renders NaN as "nan"), but treating it as
        # "unknown" is the honest shape matching None callers already
        # handle.
        return result if math.isfinite(result) else None

    @staticmethod
    def _stats_token(raw_stats: Mapping[str, Any]) -> str:
        sensors = raw_stats.get("sensors", {})
        sensors_token = json.dumps(sensors, sort_keys=True, separators=(",", ":"))
        return "|".join(
            [
                str(raw_stats.get("_recv_ts", "")),
                str(raw_stats.get("ts_client_ms", "")),
                str(raw_stats.get("rtt_ms", "")),
                str(raw_stats.get("viewport_active", True)),
                sensors_token,
            ]
        )

    @staticmethod
    def _metric(sample: ClientStatsSample, sensor_id: int, key: str) -> float:
        return float(sample.sensor_stats.get(sensor_id, {}).get(key, 0.0) or 0.0)

    def _is_backlog_rising(
        self,
        samples: deque[ClientStatsSample],
        sensor_id: int,
    ) -> bool:
        if len(samples) < ADAPTIVE_BACKLOG_TREND_SAMPLES:
            return False
        recent = list(samples)[-ADAPTIVE_BACKLOG_TREND_SAMPLES:]
        values = [self._metric(sample, sensor_id, "queue_backlog") for sample in recent]
        # Require a strict monotonic rise across the entire window — previously
        # the check hardcoded values[0] < values[1] < values[2], so raising
        # ADAPTIVE_BACKLOG_TREND_SAMPLES above 3 silently grew the history
        # window without extending the trend check, and the operator-facing
        # env knob became a lie past its initial 3-sample default.
        return all(values[i] < values[i + 1] for i in range(len(values) - 1))

    def _is_healthy(
        self,
        samples: deque[ClientStatsSample],
        sensor_id: int,
    ) -> bool:
        if len(samples) < ADAPTIVE_HEALTHY_SAMPLE_WINDOW:
            return False
        recent = list(samples)[-ADAPTIVE_HEALTHY_SAMPLE_WINDOW:]
        return all(
            self._metric(sample, sensor_id, "queue_backlog") <= ADAPTIVE_BACKLOG_HEALTHY
            and self._metric(sample, sensor_id, "decode_lag_ms") <= ADAPTIVE_DECODE_LAG_HEALTHY_MS
            and sample.viewport_active
            for sample in recent
        )


class AdaptiveRateController:
    """Lifecycle wrapper that keeps the 1 Hz control loop out of SensorManager."""

    def __init__(
        self,
        sensor_manager: SensorManager,
        broadcaster: WebSocketBroadcaster,
        sample_hz: float = ADAPTIVE_SAMPLE_HZ,
    ) -> None:
        self.sensor_manager = sensor_manager
        self.broadcaster = broadcaster
        self.sample_hz = sample_hz
        self._task: asyncio.Task | None = None

    @property
    def rate_controller(self) -> RateController:
        return self.sensor_manager.rate_controller

    def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        if not ADAPTIVE_RATE_ENABLED:
            logger.info("Adaptive rate control loop disabled (ADAPTIVE_RATE_ENABLED=false)")
            return
        # get_running_loop() raises if called outside an async context.
        # The sole caller (main.py lifespan) is always inside one.
        # Previously this fell back to asyncio.get_event_loop(), which
        # emits DeprecationWarning on 3.10+ and raises on 3.12+ when no
        # loop is running — an error path nobody exercises.
        self._task = asyncio.get_running_loop().create_task(self._run())
        logger.info("Adaptive rate control loop started (sample_hz=%.2f)", self.sample_hz)

    async def stop(self) -> None:
        task = self._task
        self._task = None
        if task is not None:
            # Await the cancelled task so Python's asyncio runtime doesn't
            # log "Task was destroyed but it is pending!" on shutdown and
            # any unobserved exception is collected here.
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                logger.debug("AdaptiveRateController stop: task exited with %s", exc)

    async def _run(self) -> None:
        period = 1.0 / max(self.sample_hz, 0.1)
        while True:
            try:
                await asyncio.sleep(period)
                self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("AdaptiveRateController tick error: %s", exc)

    def tick(self) -> list[RateAdjustment]:
        return self.rate_controller.tick(self.broadcaster.get_clients())
