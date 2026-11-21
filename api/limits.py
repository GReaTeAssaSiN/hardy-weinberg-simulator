"""Общие ограничения вычислений в одном процессе API."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from threading import BoundedSemaphore
from time import monotonic

from fastapi import HTTPException

SINGLE_TIMEOUT_SECONDS = 5
BATCH_TIMEOUT_SECONDS = 30
MAX_CONCURRENT_CALCULATIONS = 2
_calculation_slots = BoundedSemaphore(MAX_CONCURRENT_CALCULATIONS)


@contextmanager
def calculation_budget(timeout: float) -> Iterator[Callable[[], None]]:
    if not _calculation_slots.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="Сервер уже выполняет максимально допустимое число расчетов. Повторите запрос позже.",
            headers={"Retry-After": "1"},
        )

    deadline = monotonic() + timeout

    def check_deadline() -> None:
        if monotonic() >= deadline:
            raise HTTPException(
                status_code=504,
                detail="Расчет не уложился в лимит времени. Уменьшите число поколений или прогонов.",
            )

    try:
        yield check_deadline
        check_deadline()
    finally:
        _calculation_slots.release()
