#!/usr/bin/env node
/**
 * Cliquet ESLint du backend.
 *
 * Le backend traîne ~1 700 erreurs de typage ESLint historiques (`no-unsafe-*`,
 * `require-await`…) qu'on ne corrige pas d'un coup. Le cliquet fige leur nombre
 * PAR FICHIER ET PAR RÈGLE dans `.lint-baseline.json` :
 *   - une erreur de plus sur un couple (fichier, règle), ou un couple nouveau,
 *     fait échouer la vérification (exit 1) ;
 *   - une baisse est acceptée ; `--update` l'enregistre pour qu'elle ne puisse
 *     plus remonter.
 *
 * Seules les erreurs (sévérité 2) comptent ; les warnings sont ignorés.
 *
 * Usage :
 *   node scripts/lint-ratchet.mjs           # vérifie (npm run lint:ratchet)
 *   node scripts/lint-ratchet.mjs --update  # réécrit la baseline (npm run lint:ratchet:update)
 */
import { ESLint } from 'eslint';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = resolve(BACKEND_DIR, '.lint-baseline.json');
const PATTERNS = ['src/**/*.ts', 'test/**/*.ts'];
/** Erreur sans règle (fichier illisible, erreur de parsing). */
const FATAL = '(parsing)';

const update = process.argv.includes('--update');

/** Lint (sans --fix) et compte les erreurs : { fichier: { règle: n } }. */
async function countErrors() {
  const eslint = new ESLint({
    cwd: BACKEND_DIR,
    errorOnUnmatchedPattern: false,
  });
  const results = await eslint.lintFiles(PATTERNS);
  /** @type {Record<string, Record<string, number>>} */
  const counts = {};
  for (const result of results) {
    const file = relative(BACKEND_DIR, result.filePath).split(sep).join('/');
    for (const message of result.messages) {
      if (message.severity !== 2) continue;
      const rule = message.ruleId ?? FATAL;
      counts[file] ??= {};
      counts[file][rule] = (counts[file][rule] ?? 0) + 1;
    }
  }
  return counts;
}

/** Clés triées : une baseline stable, des diffs git lisibles. */
function sorted(counts) {
  return Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [
        file,
        Object.fromEntries(
          Object.keys(counts[file])
            .sort()
            .map((rule) => [rule, counts[file][rule]]),
        ),
      ]),
  );
}

const total = (counts) =>
  Object.values(counts).reduce(
    (sum, rules) => sum + Object.values(rules).reduce((a, b) => a + b, 0),
    0,
  );

/** Couples (fichier, règle) dont le compte a changé entre deux relevés. */
function compare(baseline, current) {
  const increases = [];
  const decreases = [];
  const files = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const file of files) {
    const rules = new Set([
      ...Object.keys(baseline[file] ?? {}),
      ...Object.keys(current[file] ?? {}),
    ]);
    for (const rule of rules) {
      const before = baseline[file]?.[rule] ?? 0;
      const after = current[file]?.[rule] ?? 0;
      if (after > before) increases.push({ file, rule, before, after });
      else if (after < before) decreases.push({ file, rule, before, after });
    }
  }
  const byPosition = (a, b) =>
    a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule);
  return {
    increases: increases.sort(byPosition),
    decreases: decreases.sort(byPosition),
  };
}

const line = ({ file, rule, before, after }) =>
  `  ${file}  ${rule}  ${before} → ${after}`;

async function main() {
  const current = sorted(await countErrors());

  if (update) {
    if (existsSync(BASELINE_PATH)) {
      const previous = JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
      const { increases } = compare(previous, current);
      if (increases.length > 0) {
        console.warn(
          `⚠ La nouvelle baseline ACCEPTE ${increases.length} hausse(s) :\n` +
            increases.map(line).join('\n'),
        );
      }
    }
    await writeFile(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
    console.log(
      `Baseline écrite : ${total(current)} erreur(s) ESLint figée(s) dans ${relative(BACKEND_DIR, BASELINE_PATH)}.`,
    );
    return;
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error(
      'Baseline absente : lancer `npm run lint:ratchet:update` puis la committer.',
    );
    process.exit(1);
  }

  const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
  const { increases, decreases } = compare(baseline, current);
  const summary = `ESLint : ${total(current)} erreur(s) (baseline : ${total(baseline)}).`;

  if (increases.length > 0) {
    console.error(
      `✖ Cliquet ESLint : ${increases.length} hausse(s) d'erreurs (fichier  règle  baseline → actuel) :\n` +
        increases.map(line).join('\n') +
        `\n\n${summary}\n` +
        'Corriger ces erreurs (`npx eslint <fichier>` pour le détail). ' +
        'La baseline ne doit pas être relevée pour faire passer du code neuf.',
    );
    process.exit(1);
  }

  console.log(`✔ Cliquet ESLint : aucune hausse. ${summary}`);
  if (decreases.length > 0) {
    console.log(
      `${decreases.length} baisse(s) à verrouiller avec \`npm run lint:ratchet:update\` :\n` +
        decreases.map(line).join('\n'),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
