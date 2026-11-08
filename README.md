# Симулятор Харди — Вайнберга

Учебный проект моделирования генетического равновесия популяции. Текущий этап: **идеальная популяция без факторов**. Доступны ввод параметров, расчет на Python-сервере, графики и таблица по поколениям. Кнопки факторов пока отключены: они будут реализованы на следующих этапах.

## Что необходимо

- Python 3.12 или новее. Зафиксированные версии NumPy и SciPy требуют Python 3.12 или новее.
- Node.js 24 и npm.
- Установленные зависимости из `requirements.txt` и `web/package-lock.json`.

Клонируйте репозиторий и перейдите в папку проекта:

```bash
git clone https://github.com/GReaTeAssaSiN/hardy-weinberg-simulator.git
cd hardy-weinberg-simulator
```

Создайте виртуальное окружение и установите зависимости Python.

Для macOS и Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --cache-dir .cache/pip -r requirements.txt
```

Для Windows в PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --cache-dir .cache/pip -r requirements.txt
```

Установите зависимости интерфейса (все платформы):

```bash
cd web
npm ci --cache ../.cache/npm
```

Окружение `.venv`, `node_modules` и кэши находятся внутри проекта и не включаются в Git.

## Запуск приложения

Нужны **два окна терминала**. В каждом перейдите в папку клонированного проекта `hardy-weinberg-simulator`. Node.js и npm должны быть доступны в терминале.

1. В первом окне запустите сервер. Для macOS и Linux:

   ```bash
   .venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8000
   ```

   Для Windows в PowerShell:

   ```powershell
   .\.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000
   ```

   Ожидается сообщение `Uvicorn running on http://127.0.0.1:8000`. Проверка сервера: откройте в браузере `http://127.0.0.1:8000/health` — должен появиться `{"status":"ok"}`.

2. Во втором окне запустите интерфейс:

   ```bash
   cd web
   npm --cache ../.cache/npm run dev
   ```

   Откройте адрес `Local`, который напечатает Vite (обычно `http://127.0.0.1:5173/`). Если порт занят, используйте выведенный Vite адрес.

3. Введите `N = 500`, `p = 0,3`, `T = 100` и нажмите **«Запустить»**. Ожидается постоянная частота `p = 0,3`, `q = 0,7`, доли генотипов `AA = 0,09`, `Aa = 0,42`, `aa = 0,49` и гетерозиготность `H = 0,42`.

Для остановки нажмите **Control+C в каждом окне**. Серверы слушают только локальный компьютер.

## Проверка разработки

Из корня проекта, на macOS или Linux:

```bash
.venv/bin/python -m pytest
```

Для Windows в PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Для интерфейса (все платформы):

```bash
cd web
npm --cache ../.cache/npm run test
npm --cache ../.cache/npm run build
```

Сборка создается в `web/dist`. Проверка `/api/simulate` и автоматически формируемая схема API доступны на `http://127.0.0.1:8000/docs` при запущенном сервере.

## Структура

- `core/ideal.py` — независимое от веб-части математическое ядро.
- `api/main.py` — FastAPI, проверка данных и маршрут одного расчета.
- `web/` — React, TypeScript и интерфейс.
- `tests/` — проверки модели и API.
- `reference/`, `docs/` — каталоги для эталонных расчетов и документации следующих этапов.

На данном этапе интерфейс и API принимают только параметры идеальной популяции. Миграция, отбор, инбридинг, дрейф, серии прогонов, сравнение и экспорт еще не реализованы.
