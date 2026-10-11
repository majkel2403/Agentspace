# Swarm agent — centrum roju

Aplikacja do obserwowania i prowadzenia roju agentów AI. Królowa (orkiestrator) rozbija zlecenie i przydziela je
zwiadowcom, programistom, recenzentowi i testerowi. Agenci rozmawiają ze sobą, czytają i zmieniają pliki, uruchamiają
testy. Całość widać na żywo (WebSocket) albo jako nagranie z dziennika zdarzeń, z przewijaniem w obu kierunkach.

Projekt powstał jako kopia aplikacji *Neural Workflow* (Hermes) z repozytorium `majkel2403/Agentspace`. Silnik sceny
został przeniesiony bez zmian funkcjonalnych; zmieniły się role (rój zamiast zespołu Hermesa), dane demo i interfejs.

## Uruchomienie

```bash
npm install            # jedna zależność: ws (serwer LIVE)
npm start              # http://127.0.0.1:4777 (PORT=… zmienia port)
npm test               # testy silnika, serwera i rzutu 3D
npm run demo:build     # odbudowa nagrań demo z demo/make-swarm.mjs
npm run layout         # test układu w sześciu rozmiarach (wymaga działającego serwera; URL=… wskazuje adres)
```

## Co jest w środku

| Część | Plik / katalog | Rola |
|---|---|---|
| Zdarzenia | `packages/core/events.js` | schemat zdarzeń: co wolno zapisać i jakie pola są wymagane |
| Model roju | `packages/core/app.js`, `packages/core/gource/story.js` | kto kim jest w zespole, plan, okna kodu i terminala, rozmowy |
| Scena | `packages/core/gource/*`, `packages/core/render/*` | symulacja w stylu Gource, widok drzewa i widok miasta, rzut 3D |
| Interfejs | `packages/ui/swarm.{markup.mjs,logic.js,css}` | jeden szablon i logika dla aplikacji webowej i dla tablic kanwy |
| Serwer | `server/server.mjs`, `server/store.mjs` | dziennik zdarzeń, WebSocket `/live`, `POST /events` |
| Demo | `demo/make-swarm.mjs`, `demo/runs/*.jsonl` | dwa nagrane przebiegi: refaktor połączeń i zwiad |
| Artefakt | `artifact/build-app.mjs` | buduje tablice `Swarm.dc.html` i `SwarmMobile.dc.html` z tych samych plików |

## Przebiegi demo

- **swarm-refaktor** — zlecenie „zrefaktoryzuj moduł połączeń i dopisz testy”. Zwiadowcy czytają kod (lista plików
  prawdziwego repozytorium socket.io), programiści zmieniają transport i gniazdo, tester dostaje porażkę, potem
  zielony zestaw, recenzent zatwierdza.
- **swarm-zwiad** — trzech zwiadowców czyta po dwa źródła, programiści porównują wyniki, królowa składa raport.

Nagrania są **zarejestrowanymi przebiegami demonstracyjnymi**: drzewo plików jest prawdziwe, rozmowy i wyniki są
przykładowe. Prawdziwy producent wysyła te same kształty zdarzeń przez `POST /events`.

## Zdarzenia roju

Orkiestrator to `queen` (w zdarzeniach: `queen.reasoning`, `agent: "queen"`, `to: "queen"`). Pozostałe identyfikatory są
dowolne i nadaje je producent; etykieta w interfejsie idzie z `agent.spawned.label`. Pełny schemat jest w
`packages/core/events.js`.

## Co dalej (poza tym projektem)

- Podłączenie prawdziwego roju: producent wysyła `task.started`, `agent.spawned`, `message.sent` i resztę zdarzeń.
- Widok „Sieć” (agenci jako węzły, wiadomości jako łuki) — pomysł z poprzedniej wersji, nie zrobiony.
- Obrót dotykiem w widoku 3D (teraz: prawy przycisk albo Shift + przeciąganie).
