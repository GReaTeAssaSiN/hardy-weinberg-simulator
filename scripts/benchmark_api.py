"""Замеры времени запросов к запущенному API, включая передачу ответа."""

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import csv
from io import StringIO
import json
from statistics import median
from threading import Barrier
from time import perf_counter
from urllib.error import HTTPError
from urllib.request import Request, urlopen

SINGLE = "/api/simulate"
BATCH = "/api/simulate/batch"
EXPORT = "/api/export"
POPULATION = {"n": 100_000, "p0": 0.5, "generations": 1_000, "drift": {"seed": 7}}
FACTORS = {
    "migration": {"m": 0.1, "p_m": 0.8},
    "selection": {"w11": 1, "w12": 1, "w22": 0.8, "target_p": 0.9},
    "inbreeding": {"f": 0.25},
}


def post(base_url, path, params):
    request = Request(
        base_url + path, data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    started = perf_counter()
    try:
        with urlopen(request, timeout=45) as response:
            status, body = response.status, response.read()
    except HTTPError as response:
        status, body = response.code, response.read()
    return perf_counter() - started, status, body


def measure(base_url, label, path, params, repetitions, threshold=None):
    _, status, body = post(base_url, path, params)
    if status != 200:
        raise SystemExit(f"{label} — HTTP {status} при прогреве")
    times = []
    for _ in range(repetitions):
        elapsed, status, body = post(base_url, path, params)
        if status != 200:
            raise SystemExit(f"{label} — HTTP {status}")
        times.append(elapsed)
    peak = max(times)
    result = ""
    if threshold is not None:
        result = f" · порог {threshold} с {'соблюден' if peak <= threshold else 'превышен'}"
    print(f"{label} — медиана {median(times):.4f} с · максимум {peak:.4f} с{result}", flush=True)
    return body, threshold is None or peak <= threshold


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8080", help="Адрес запущенного приложения")
    parser.add_argument("--repetitions", type=int, default=5, help="Число замеров после прогрева")
    args = parser.parse_args()
    if args.repetitions < 1:
        parser.error("--repetitions должно быть положительным")
    url = args.url.rstrip("/")
    print(f"{args.repetitions} замеров на сценарий после одного прогрева · N = 100000 · T = 1000 · зерно 7")
    single, single_pass = measure(url, "Один прогон, четыре фактора", SINGLE, POPULATION | FACTORS,
                                  args.repetitions, threshold=5)
    batch, batch_pass = measure(url, "100 прогонов нейтрального дрейфа", BATCH, POPULATION | {"runs": 100},
                                args.repetitions, threshold=30)
    for label, result in [("CSV одиночного прогона", single), ("CSV серии", batch)]:
        outcome = json.loads(result)
        export, _ = measure(url, label, EXPORT, {"params": outcome["params"], "rows": outcome["rows"]}, args.repetitions)
        if len(list(csv.DictReader(StringIO(export.decode())))) != POPULATION["generations"] + 1:
            raise SystemExit(f"{label} — неверное число поколений")

    workload = POPULATION | {"runs": 1_000}
    barrier = Barrier(4)

    def run_concurrently():
        barrier.wait()
        return post(url, BATCH, workload)[1]

    with ThreadPoolExecutor(max_workers=4) as pool:
        requests = [pool.submit(run_concurrently) for _ in range(4)]
        statuses = Counter(request.result() for request in requests)
    print(f"Четыре одновременных запроса по 1000 прогонов · HTTP {dict(sorted(statuses.items()))}")
    recovery = post(url, BATCH, POPULATION | {"runs": 10})[1]
    print(f"Повторный запрос после нагрузки · HTTP {recovery}")
    if not single_pass or not batch_pass or set(statuses) - {200, 429} or not statuses[200] or recovery != 200:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
