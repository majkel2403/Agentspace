# Artefakt (kanwa Design na claude.ai)

Źródła kanwy „Hermes — Neural Workflow i zespół agentów”. Opublikowana kanwa to kopia plików z `project/`.

| Plik | Co to jest |
| --- | --- |
| `project/canvas.json` | indeks kanwy: tablice, ich położenie, notatki |
| `project/Workflow.dc.html`, `project/WorkflowMobile.dc.html` | **generowane** przez `build-workflow.mjs` — aktualna wizualizacja (desktop, telefon) |
| `project/Main.dc.html` | centrum dowodzenia; jego scenę (dawniej galaktyka 3D) podmienia na scenę jak Gource `gourcify-main.mjs` (wkleja rdzeń i trzy przebiegi zespołowe; uruchamiać po zmianie rdzenia) |
| `project/Roster.dc.html`, `Mobile.dc.html` | wcześniejsza wersja (katalog, telefon 3D) — zamrożone |
| `bundle-core.mjs` | wspólne sklejanie rdzenia i przebiegów dla tablic |
| `build-workflow.mjs` | wkleja rdzeń `packages/core` (kolejność z `manifest.json`, bez importów) i przebiegi `demo/runs` do dwóch tablic |
| `check-board.mjs` | statyczna kontrola tablicy `.dc.html` (bez przeglądarki) |
| `shot.mjs` | zrzuty tablic w Chromium — wymaga lokalnych kopii fontów/Reacta i runtime'u typu Design (patrz niżej) |
| `legacy/` | narzędzia i dane, którymi powstała wersja 3D (archiwum, bez gwarancji, że dziś działają) |

## Przebudowa po zmianie rdzenia lub demo

```bash
node artifact/build-workflow.mjs                       # → artifact/project/Workflow*.dc.html
node artifact/gourcify-main.mjs                        # → scena Gource w artifact/project/Main.dc.html
node artifact/check-board.mjs artifact/project/Workflow.dc.html
node artifact/check-board.mjs artifact/project/WorkflowMobile.dc.html
node artifact/check-board.mjs artifact/project/Main.dc.html
```

Tablice nie mogą korzystać z sieci ani budować DOM skryptem; rdzeń musi działać bez modułów ES
(dlatego każdy plik w `manifest.json` może zależeć tylko od wcześniejszych).

## Publikacja

Zmienione pliki publikuje się narzędziem Artifact pod ten sam adres kanwy
(`https://claude.ai/artifact/Sch77E9SUusuRvnsF1SYfp`), z `root` = `artifact`, `file_path` = jedna ze zmienionych
tablic i pozostałymi w `files` (`project/<nazwa>`). `canvas.json` wysyła się tylko przy zmianie układu lub notatek.

## Zrzuty (opcjonalnie)

`shot.mjs` potrzebuje katalogu `artifact/.vendor/` (lub `DC_VENDOR`) z fontami fontsource i Reactem oraz pliku
`dc-runtime.js` typu Design (odczyt `artifact-type/dc-runtime.js` z opublikowanej kanwy; `DC_RUNTIME`).
Te pliki nie są częścią repozytorium (cudze kopie).
