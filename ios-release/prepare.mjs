/**
 * Prepare native iOS input for either game without changing the live web games.
 * Run from repository root: node ios-release/prepare.mjs word-havoc
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const definitions = {
  'word-havoc': { name: 'Word Havoc Game', appId: 'com.wordhavoc.game' },
  'brain-attack': { name: 'Brain Attack', appId: 'com.kryntic.brainattack' }
};
const game = process.argv[2];
if (!Object.hasOwn(definitions, game)) {
  console.error('Usage: node ios-release/prepare.mjs <word-havoc|brain-attack>');
  process.exit(2);
}
const def = definitions[game];
const source = path.join(root, 'play', game + '.html');
if (!fs.existsSync(source)) throw new Error('Game source missing: ' + source);
const output = path.join(root, 'ios-release', 'generated', game);
const web = path.join(output, 'www');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });
let html = fs.readFileSync(source, 'utf8');
if (!html.toLowerCase().includes('<html') || html.length < 100000) throw new Error('Game source does not look complete');
html = html.replaceAll('../game-activity.js', './game-activity.js');
html = html.replaceAll('../word-havoc-support.html', './support.html')
           .replaceAll('../word-havoc-privacy.html', './privacy.html')
           .replaceAll('../brain-attack-support.html', './support.html')
           .replaceAll('../brain-attack-privacy.html', './privacy.html');
fs.writeFileSync(path.join(web, 'index.html'), html);
for (const [name, from] of [
  ['support.html', game + '-support.html'],
  ['privacy.html', game + '-privacy.html'],
  ['game-activity.js', 'game-activity.js']
]) {
  const p = path.join(root, from);
  if (!fs.existsSync(p)) throw new Error('Required asset missing: ' + from);
  fs.copyFileSync(p, path.join(web, name));
}
fs.writeFileSync(path.join(output, 'capacitor.config.json'), JSON.stringify({
  appId: def.appId, appName: def.name, webDir: 'www',
  server: { iosScheme: 'capacitor', androidScheme: 'https' }
}, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({
  name: 'kryntic-' + game + '-ios', version: '1.0.0', private: true,
  dependencies: { '@capacitor/core': '8.5.2', '@capacitor/ios': '8.5.2' },
  devDependencies: { '@capacitor/cli': '8.5.2', 'typescript': '7.0.2' }
}, null, 2) + '\n');
console.log('Prepared', def.name, def.appId, 'using', source);
