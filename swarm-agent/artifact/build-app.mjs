#!/usr/bin/env node
// build-app.mjs — the swarm boards of the Design canvas (desktop Swarm.dc.html, phone SwarmMobile.dc.html).
// The boards are the web app: the same template (packages/ui/swarm.markup.mjs), logic (swarm.logic.js) and style
// (swarm.css), plus the core bundle and the recorded runs. The layout picks itself from the board's width.
//   node artifact/build-app.mjs [repo root] [output dir]      (defaults: this repo, artifact/project)
import fs from 'node:fs';
import path from 'node:path';
import { coreBundle, runsScript } from './bundle-core.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = process.argv[2] || path.resolve(HERE, '..');
const { markup } = await import(path.join(REPO, 'packages/ui/swarm.markup.mjs'));
const CSS = fs.readFileSync(path.join(REPO, 'packages/ui/swarm.css'), 'utf8');
const LOGIC = fs.readFileSync(path.join(REPO, 'packages/ui/swarm.logic.js'), 'utf8');
const NW = coreBundle(REPO);
const RUNS_JS = runsScript(REPO, [
  ['swarm-refaktor', 'Refaktor połączeń'],
  ['swarm-zwiad', 'Zwiad i mapa'],
]);
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700;9..144,900&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">';

// the host of the boards: the recorded runs are inside the page
const HOST = `
const HX_HOST = {
  runs: () => NW_RUNS.map((r) => ({ id: r.id, name: r.name, meta: 'demo', live: false })),
  load: (id) => NW.parseJsonl((NW_RUNS.find((r) => r.id === id) || NW_RUNS[0]).jsonl).events,
};`;

function page(title, w, h) {
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONTS}
<style>body{margin:0;background:#03050E}
${CSS}</style>
</helmet>
${markup('height:100vh')}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
${NW}
${RUNS_JS}
${HOST}
${LOGIC}
</script>
</body>
</html>
`;
}

const out = process.argv[3] || path.join(HERE, 'project');
fs.writeFileSync(path.join(out, 'Swarm.dc.html'), page('Rój agentów', 1440, 900));
fs.writeFileSync(path.join(out, 'SwarmMobile.dc.html'), page('Rój agentów na telefonie', 390, 844));
console.log('built Swarm.dc.html', fs.statSync(path.join(out, 'Swarm.dc.html')).size, 'SwarmMobile.dc.html', fs.statSync(path.join(out, 'SwarmMobile.dc.html')).size);
