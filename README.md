# Agentspace — Hermes · Neural Workflow

Przebieg pracy Hermesa i jego agentów pokazany tak, jak [Gource](https://github.com/acaudwell/Gource) pokazuje historię
repozytorium: **drzewo to przestrzeń robocza** (pliki repo, strony WWW, pamięć, wywołania MCP, testy, wyniki), a **Hermes i
agenci to awatary**, które podlatują do tego, co czytają lub zmieniają, i strzelają w to promieniami.
Zasada: **zero fałszywej animacji** — każdy plik, promień i błysk pochodzi z prawdziwego zdarzenia w logu przebiegu;
ruch układu to fizyka Gource (gałęzie odpychają się, pliki układają w pierścienie), a nie dekoracja.

Renderer jest napisany od zera (JS + WebGL, bez bibliotek) według zachowania Gource 0.54: drzewo katalogów, które rozgałęzia
się tylko tam, gdzie ścieżki się rozchodzą; pliki w pierścieniach (6, 9, 12 … na pierścień) kolorowane hashem rozszerzenia;
krawędzie jako krzywe z opóźnionym punktem kontrolnym; poświata (bloom) wokół katalogów; awatary z siłami przyciągania do plików;
promienie akcji; kamera, która sama obejmuje całe drzewo; klucz rozszerzeń i data jak w Gource. Kod Gource nie jest
kopiowany ani dołączany — prawdziwy Gource służy tylko jako wzorzec do porównania (`tools/compare-gource.mjs`).

| Promień | Znaczenie |
| --- | --- |
| zielony | utworzenie pliku (jak w Gource) |
| pomarańczowy | zmiana pliku (jak w Gource) |
| czerwony | usunięcie (jak w Gource) |
| niebieski | odczyt (dodatek: agenci dużo czytają) |
| jasnozielony / czerwony błysk | test zaliczony / nieudany |
| cienki promień między awatarami | wiadomość między agentami (kolor = ton) |

Pod awatarem widać narzędzie, którego agent właśnie używa (np. `edit`, `terminal`).

```
Hermes / Jarvis ──► Event Bus ──► server (Workflow Recorder) ──► Event Store (data/runs/<run>.jsonl)
                                        │
                                        └─► WebSocket /live ──► viewer (akcje → symulacja Gource → WebGL)
```

## Uruchomienie

Wymaga Node 22+.

```bash
npm install
npm start                 # http://127.0.0.1:4777  (PORT, HOST w zmiennych środowiskowych)
```

W przeglądarce: wybór przebiegu, oś czasu (0.25× / 1× / 4× / 10×, dokładne przewijanie w obie strony — symulacja ma
punkty kontrolne co sekundę), Process Log, inspektor po kliknięciu w plik lub awatar (co dokładnie robił), przeciąganie
przesuwa widok, kółko przybliża, „Wczytaj log (.jsonl)” odtwarza własny przebieg. `/?chrome=0` pokazuje samą scenę,
`/?compat=1` rysuje tylko to, co umie pokazać prawdziwy Gource (do porównań).

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
| `paths` | lista ścieżek (`workspace.scanned`, np. wynik `git ls-files`) |
| `latencyMs`, `tokens`, `confidence` | metryki (inspektor) |

Typy: `task.started|completed|failed`, `hermes.reasoning`, `planner.step`,
`agent.spawned|waiting|completed|failed`, `tool.started|completed|failed`, `resource.read|written`,
`file.read|created|modified|deleted`, `memory.read|write`, `gateway.call`, `test.started|passed|failed`,
`message.sent`, `result.returned`, `error`, `workspace.scanned`.

Jak zdarzenia stają się drzewem: zasób bez schematu → `<przestrzeń>/<ścieżka>` (nazwa przestrzeni z ostatniego
`workspace.scanned`, domyślnie `projekt`), URL → `web/<host>/…`, pamięć → `pamięć/…`, MCP → `mcp/<nazwa>/…`,
testy → `testy/<nazwa>`, zadanie → `zadanie/opis.md`, plan i rozumowanie Hermesa → `hermes/…`, zespół → `zespol/<agent>.md`,
wynik → `wynik/raport.md`. `workspace.scanned` pokazuje całe prawdziwe drzewo repozytorium przez jedno zdarzenie.

## Prawdziwy Gource (wzorzec i prototyp)

Adapter zapisuje ten sam strumień akcji co viewer jako log Gource (`timestamp|user|A/M/D|ścieżka`, odczyty i testy jako M):

```bash
node adapters/to-gource.mjs demo/runs/repo-fix.jsonl > repo-fix.gource.log      # czas ×100
gource --log-format custom --seconds-per-day 864 --key repo-fix.gource.log
# na żywo:
tail -n +1 -f data/runs/<run>.jsonl | node adapters/to-gource.mjs --stream | gource --log-format custom --realtime -
```

Porównanie klatka w klatkę (wymaga `gource`, `xvfb-run`, `ffmpeg`, Playwright i `npm start`):

```bash
node tools/compare-gource.mjs repo-fix 6,12,20,30,44 /tmp/porownanie
```

Zapisuje pary obrazów (Gource po lewej, nasz renderer po prawej) i miarę SSIM rozmytych klatek.

## Struktura

- `packages/core/` — schemat zdarzeń, oś czasu, `gource/` (kolory, zdarzenia → akcje, deterministyczna symulacja,
  odtwarzacz z punktami kontrolnymi, opis klatki, WebGL + awaryjny Canvas 2D, napisy, inspektor), `render/viewer.js`.
  `manifest.json` podaje kolejność plików do budowy bez modułów (artefakt).
- `server/` — ingest (HTTP / WS / STDIN), Event Store, LIVE fan-out, REPLAY.
- `web/` — viewer.
- `demo/` — zapisane przebiegi (`runs/*.jsonl`, generowane przez `npm run demo:build`), lista plików prawdziwego
  repozytorium socket.io (`workspaces/socket.io.txt`) i emiter na żywo. `npm run demo:build -- --workspace <katalog>`
  buduje przebieg „napraw repo” na drzewie dowolnego repozytorium git (np. własnego).
- `web/fonts/` — FreeSans (GNU FreeFont, GPL z wyjątkiem dla czcionek), ta sama czcionka co w Gource.
- `test/` — `npm test` (schemat, przewijanie, układ, adapter Gource, serwer).

Przebiegi w `demo/runs` są wygenerowanymi scenariuszami, nie zapisem prawdziwego Jarvisa. W „napraw repo” drzewo plików
jest prawdziwe (socket.io), ale błąd i poprawka w historii są demonstracyjne. Po podłączeniu producenta jego przebiegi
trafiają do `data/runs/`.
