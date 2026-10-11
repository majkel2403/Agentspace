# Rój · centrum agentów

Aplikacja do obserwowania i prowadzenia roju agentów AI. **Królowa** (orkiestrator) rozbija zlecenie i przydziela
części zwiadowcom, programistom, recenzentowi i testerowi. Agenci rozmawiają, czytają i zmieniają pliki, uruchamiają
testy. Całość widać w scenie 3D i na pulpicie: rozmowy, plan, pliki, testy, dziennik i inspektor. Przebieg można
odtwarzać i przewijać, albo oglądać na żywo.

## Zasada

**Wszystko na ekranie wynika z dziennika zdarzeń.** Nic nie jest animowane, czego log nie mówi. Stan roju w chwili `t`
to wynik zastosowania wszystkich zdarzeń do `t`, a nie osobny model, który trzeba synchronizować. Dzięki temu:

- przewijanie w tył i w przód daje dokładnie ten sam obraz co odtwarzanie od zera (testy to sprawdzają),
- tryb na żywo i odtwarzanie zapisanego przebiegu używają tego samego kodu,
- scena i pulpit nie mogą pokazać czegoś, czego nie ma w logu.

Jedyne, co nie pochodzi z logu, to kamera (orbita, „Śledź”, „Dopasuj”) i czas dojścia agenta do miejsca lub
pojawienia się pliku. Te przejścia są funkcją czasu logu, więc też są powtarzalne.

## Uruchomienie

```bash
npm install          # ws (serwer LIVE) i three (scena 3D)
npm start            # http://127.0.0.1:4777   (PORT=… zmienia port)
npm run demo:build   # odbudowa nagranych przebiegów z demo/make-swarm.mjs
npm test             # 16 testów: zdarzenia, model, układ, serwer
npm run smoke       # przeglądarka: odtwarza przebieg, klika agenta i plik (wymaga Playwright; URL=… i PLAYWRIGHT_MODULE=…)
```

## Architektura

| Część | Plik | Co robi |
|---|---|---|
| Zdarzenia | `src/events.js` | schemat, walidacja, odczyt JSONL (złe linie są zgłaszane, nie przerywają) |
| Model | `src/model.js` | `applyEvent` (jedyne miejsce, gdzie log zmienia stan) i `createReplay` (stan w czasie `t`, z pamięcią podręczną) |
| Układ | `src/layout.js` | miejsca folderów i plików, liczone z pełnej listy ścieżek przebiegu (drzewo nie „skacze”) |
| Kolory | `src/palette.js` | królowa zawsze różowa, pozostali w kolejności pojawiania się; ta sama funkcja w scenie i na pulpicie |
| Scena | `src/scene.js` | Three.js: foldery, pliki, agenci, wiązki (działania), łuki (wiadomości), kamera |
| Pulpit | `src/ui.js` | HTML z (stanu, widoku): pasek górny, zespół, zakładki, oś czasu |
| Aplikacja | `src/app.js` | zegar logu, odtwarzanie, przewijanie, LIVE przez WebSocket, kliknięcia |
| Serwer | `server/server.mjs`, `server/store.mjs` | przebiegi (REST), zapis zdarzeń z walidacją, WebSocket `/live`, pliki statyczne |
| Demo | `demo/make-swarm.mjs`, `demo/runs/*.jsonl` | dwa nagrane przebiegi (prawdziwa lista plików socket.io, przykładowa rozmowa) |

### Zakładki pulpitu

- **Rozmowy** — kto do kogo, rodzaj wiadomości (zlecenie, pytanie, wynik, recenzja…), treść.
- **Pliki** — każdy dotknięty plik: stan (czytany, nowy, zmieniony, usunięty), liczba dotknięć, kto ostatni.
- **Plan** — kroki planu królowej; bieżący podświetlony.
- **Testy** — wynik każdego testu i fragment wyjścia przy porażce.
- **Dziennik** — ostatnie zdarzenia do chwili `t`, surowo.
- **Inspektor** — po kliknięciu agenta (scena, zespół, rozmowa) albo pliku: jego stan i historia.

## Format zdarzeń

Jedno zdarzenie to jedna linia `.jsonl`. Pełny schemat: `src/events.js`. Najważniejsze typy:

| typ | pola | znaczenie |
|---|---|---|
| `run.started` / `run.completed` / `run.failed` | `text` | początek i koniec zlecenia |
| `queen.thought` | `text` | co myśli królowa |
| `plan.updated` | `steps`, `step` | plan i bieżący krok |
| `agent.spawned` | `agent`, `parent`, `label`, `role`, `text` | nowy agent (domyślnie pod królową) |
| `agent.finished` / `agent.failed` | `agent` | koniec pracy agenta |
| `message.sent` | `from`, `to`, `tone`, `text`, `task` | wiadomość; `tone` ∈ assign, question, answer, result, handoff, critique, revision, approve |
| `tool.started` / `tool.finished` | `agent`, `tool`, `command`, `ok` | użycie narzędzia |
| `file.read` | `agent`, `path` | odczyt pliku |
| `file.write` | `agent`, `path`, `action`, `lines` | `action` ∈ created, modified, deleted |
| `scan` | `agent`, `paths` | lista plików w przestrzeni roboczej (tworzy drzewo) |
| `test` | `agent`, `name`, `status`, `output` | `status` ∈ passed, failed |
| `result` | `agent`, `text` | wynik zwrócony przez agenta |

Pole `ts` to czas w ms (liczba albo ISO). Brak `ts` przy wysyłaniu = czas przyjęcia.

## Wysyłanie zdarzeń na żywo

```bash
curl -X POST http://127.0.0.1:4777/api/runs/moj-przebieg/events \
  -H 'content-type: application/json' \
  -d '{"type":"run.started","text":"Napraw błąd w logowaniu"}'
```

Można wysłać tablicę zdarzeń. Odpowiedź mówi, które przyjęto (`kept`) i które odrzucono wraz z powodem (`refused`).
Przeglądarka z otwartym przebiegiem `moj-przebieg` dostaje zdarzenia przez WebSocket `/live?run=moj-przebieg` i przesuwa
zegar na koniec, jeśli „Śledź” jest włączone.

## Ograniczenia

- Nagrane przebiegi są **demonstracyjne**: lista plików jest prawdziwa, rozmowy i wyniki są przykładowe.
- Brak prawdziwego producenta roju w tym repo; producent wysyła zdarzenia przez API powyżej.
- Obrót dotykiem w 3D nie jest zrobiony (mysz: prawy przycisk albo Shift + przeciąganie; kółko przybliża).
- Przy bardzo dużych drzewach (tysiące plików) scena rysuje każdy plik jako osobną siatkę; wymagałoby to instancjonowania.
- Sieć, której węzłami są agenci, jest tylko pomysłem (łuki wiadomości są już w scenie).
