# artifact — tablice kanwy

`build-app.mjs` składa dwie tablice Design z plików `packages/ui` i `packages/core`:
`artifact/project/Swarm.dc.html` (desktop, 1440×900) i `artifact/project/SwarmMobile.dc.html` (telefon, 390×844).
Każda tablica to ta sama aplikacja co `npm start`, z wklejonymi nagraniami demo.

```bash
node artifact/build-app.mjs                              # → artifact/project/Swarm*.dc.html
node artifact/check-board.mjs artifact/project/Swarm.dc.html
node artifact/check-board.mjs artifact/project/SwarmMobile.dc.html
```

`check-board.mjs` pilnuje zasad kanwy: bez `innerHTML`, `appendChild`, `createElement`, `fetch`, `WebSocket`, bez emoji
i bez dziur SVG w atrybutach `d`. `bundle-core.mjs` sprawdza kolizje nazw między plikami rdzenia.

Opublikowana kanwa (Design) trzyma te pliki w `project/`; indeks `canvas.json` tworzy się przy pierwszej publikacji.
