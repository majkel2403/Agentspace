# Agentspace — Hermes · Neural Workflow

Przestrzeń 3D, w której widać, jak Hermes (orchestrator) prowadzi agentów przez zadanie.
Zasada: **zero fałszywej animacji** — każdy węzeł, linia, impuls, fala i rozbłysk pochodzi z prawdziwego zdarzenia
w logu przebiegu. „5D” = 3D + czas (LIVE / REPLAY z przewijaniem) + stan (rozmiar, światło, ruch wynikają z liczby
zdarzeń, opóźnień, tokenów i pewności).

```
Hermes / Jarvis ──► Event Bus ──► server (Workflow Recorder) ──► Event Store (data/runs/<run>.jsonl)
                                        │
                                        └─► WebSocket /live ──► viewer 3D (Graph State → WebGL)
```

## Uruchomienie

Wymaga Node 22+.

```bash
npm install
npm start                 # http://127.0.0.1:4777  (PORT, HOST w zmiennych środowiskowych)
```

W przeglądarce: wybór przebiegu, przełącznik pierwszego kadru **„Orb → graf”** (z daleka kula cząstek Hermesa,
zbliżenie odsłania workflow) albo **„Od razu graf”**, oś czasu (0.25× / 1× / 4× / 10×, przewijanie w obie strony),
Process Log, inspektor po kliknięciu w węzeł, „Wczytaj log (.jsonl)” do odtworzenia własnego przebiegu.
Kadr można też wybrać w adresie: `/?opening=graph`.

Przebieg na żywo z zapisanego logu (symulacja producenta):

```bash
npm run demo:emit -- demo/runs/repo-fix.jsonl --speed 2 --run live-demo
```

Viewer pokaże przebieg `live-demo` z plakietką **LIVE** i będzie podążał za zdarzeniami.

## Podłączenie Hermesa / Jarvisa

Producent wysyła zdarzenia jednym z trzech kanałów — serwer zapisuje je do Event Store i rozsyła widzom:

| Kanał | Jak |
| --- | --- |
| HTTP | `POST /events` — jeden obiekt JSON, tablica albo JSONL w treści |
| WebSocket | `ws://127.0.0.1:4777/ingest` — jedno zdarzenie JSON na wiadomość |
| STDIN | `node server/server.mjs --stdin` — linie JSONL, np. `jarvis … \| node server/server.mjs --stdin` |

Odczyt: `GET /api/runs` (lista), `GET /api/runs/:run` (pełny log JSONL do REPLAY), `ws://…/live?run=<id|*>` (na żywo).

Przykład:

```bash
curl -X POST http://127.0.0.1:4777/events -H 'content-type: application/json' \
  -d '{"ts":1791280800000,"run":"r1","type":"task.started","text":"Przeanalizuj repo"}'
```

## Schemat zdarzenia

Jedna linia JSONL = jedno zdarzenie (walidacja: `packages/core/events.js`).

| Pole | Opis |
| --- | --- |
| `ts` | czas (ms od epoki lub ISO) — wymagane |
| `run` | identyfikator przebiegu — wymagane |
| `type` | typ zdarzenia (poniżej) — wymagane |
| `agent` | agent (`research`, `coder`, …); `hermes` = rdzeń |
| `tool` | narzędzie (`web_search`, `edit`, `terminal`, …) |
| `resource` | ścieżka / URL / klucz zasobu |
| `to` | odbiorca wiadomości (`message.sent`) |
| `parent` | agent-rodzic (`agent.spawned`) |
| `name` | nazwa testu / bramki MCP-API |
| `text` | opis dla człowieka (log, inspektor) |
| `latencyMs`, `tokens`, `confidence` | metryki, sterują rozmiarem, światłem i energią |

Typy: `task.started|completed|failed`, `hermes.reasoning`, `planner.step`,
`agent.spawned|waiting|completed|failed`, `tool.started|completed|failed`, `resource.read|written`,
`file.read|created|modified|deleted`, `memory.read|write`, `gateway.call`, `test.started|passed|failed`,
`message.sent`, `result.returned`, `error`.

Słownik wizualny: Hermes = duży Orb cząstek (rozumowanie = cząstki w środku), agent = mniejszy orb z własną orbitą,
narzędzie = węzeł geometryczny, plik = liść, MCP/API = portal, zdarzenie = foton biegnący po krawędzi,
błąd = czerwona fala uderzeniowa, sukces = fala wracająca przez graf.

## Gource

Adapter zamienia log zdarzeń na custom log Gource (`timestamp|user|A/M/D|/run/hermes/agent/tool/zasób|kolor`):

```bash
node adapters/to-gource.mjs demo/runs/repo-fix.jsonl > repo-fix.gource.log
gource --log-format custom repo-fix.gource.log
# na żywo:
tail -f data/runs/<run>.jsonl | node adapters/to-gource.mjs --stream | gource --log-format custom --realtime -
```

## Struktura

- `packages/core/` — schemat zdarzeń, reduktor i oś czasu (`stateAt`, migawki do przewijania wstecz),
  deterministyczny układ 3D, adapter Gource, renderer (WebGL bez bibliotek + awaryjny Canvas 2D, nakładka 2D).
- `server/` — ingest (HTTP / WS / STDIN), Event Store, LIVE fan-out, REPLAY.
- `web/` — viewer.
- `demo/` — zapisane przebiegi (`runs/*.jsonl`, generowane przez `npm run demo:build`) i emiter na żywo.
- `test/` — `npm test` (schemat, przewijanie, układ, adapter Gource, serwer).

Przebiegi w `demo/runs` są wygenerowanymi scenariuszami, nie zapisem prawdziwego Jarvisa — po podłączeniu producenta
jego przebiegi trafiają do `data/runs/`.
