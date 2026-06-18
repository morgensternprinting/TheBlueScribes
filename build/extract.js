#!/usr/bin/env node
/*
 * extract.js — Builds the rules knowledge base for The Blue Scribes from the
 * TOWen1 companion app (its index.html embeds the structured rules data).
 *
 * Usage:
 *   node build/extract.js [path/to/TOWen1/index.html]
 *
 * It locates the `const RULES_DB = {…}`, `const MAGIC_ITEMS_DB = {…}` and
 * `const ARMY_LORES = {…}` declarations, brace-matches each object literal,
 * evaluates it in a sandbox, and writes data/rules-data.js as:
 *   window.TOW_RULES = { rules:{…}, magicItems:{…}, armyLores:{…}, meta:{…} };
 *
 * Keeping the data in a plain .js file (not .json) means index.html works when
 * opened directly from disk (file://) as well as from GitHub Pages.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEFAULT_SRC = path.resolve(__dirname, '..', '..', 'TOWen1', 'index.html');
const SRC = path.resolve(process.argv[2] || DEFAULT_SRC);
const OUT = path.resolve(__dirname, '..', 'data', 'rules-data.js');

function fail(msg) {
  console.error('extract.js: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  fail('source not found: ' + SRC + '\n  Pass the path to TOWen1/index.html as an argument.');
}

const html = fs.readFileSync(SRC, 'utf8');

// Brace-match an object literal starting at the `{` that follows the declaration
// of `varName` (supports `const/let/var NAME = {` and `window.NAME = {`).
function extractObjectLiteral(source, varName) {
  const decl = new RegExp('(?:(?:const|let|var)\\s+|window\\.)' + varName + '\\s*=\\s*\\{');
  const m = decl.exec(source);
  if (!m) return null;
  const start = source.indexOf('{', m.index);
  let depth = 0;
  let inStr = null; // quote char of the string we are inside, or null
  let prev = '';
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
    // track escape state (handles \\ correctly)
    prev = prev === '\\' && ch === '\\' ? '' : ch;
  }
  return null;
}

function evalLiteral(literal, varName) {
  if (!literal) fail('could not locate ' + varName + ' in source.');
  const sandbox = {};
  try {
    vm.runInNewContext('result = (' + literal + ');', sandbox, { timeout: 5000 });
  } catch (e) {
    fail('failed to evaluate ' + varName + ': ' + e.message);
  }
  return sandbox.result;
}

const rules = evalLiteral(extractObjectLiteral(html, 'RULES_DB'), 'RULES_DB');
const magicItems = evalLiteral(extractObjectLiteral(html, 'MAGIC_ITEMS_DB'), 'MAGIC_ITEMS_DB');
const armyLores = evalLiteral(extractObjectLiteral(html, 'ARMY_LORES'), 'ARMY_LORES');

// Sanitize: drop the source URL field and strip any links from the data, so the
// chatbot never surfaces or cites external links.
function stripLinks(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
}
for (const k of Object.keys(rules)) {
  const r = rules[k];
  delete r.url;
  if (r.name) r.name = stripLinks(r.name);
  if (r.desc) r.desc = stripLinks(r.desc);
}
for (const cat of Object.keys(magicItems)) {
  const byArmy = magicItems[cat] || {};
  for (const army of Object.keys(byArmy)) {
    for (const it of (byArmy[army] || [])) {
      if (it && typeof it === 'object') {
        if (it.n) it.n = stripLinks(it.n);
        if (it.d) it.d = stripLinks(it.d);
      }
    }
  }
}

// ── Units ─────────────────────────────────────────────────────────────────
// UNIT_DB holds the rich profiles (stats, troop type, equipment, special rules);
// OWB_UNIT_DATA (the builder dataset) adds French names + points cost. Merge by
// slug. NOTE: neither source stores weapon stat-lines (range / Strength / AP for
// shooting weapons), so those are simply not available.
const unitDb = evalLiteral(extractObjectLiteral(html, 'UNIT_DB'), 'UNIT_DB');
const builder = evalLiteral(extractObjectLiteral(html, 'OWB_UNIT_DATA'), 'OWB_UNIT_DATA');

const STAT_KEYS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'];
function profileStr(profiles) {
  if (!Array.isArray(profiles)) return '';
  return profiles.map(p => `${p.name || ''} [${STAT_KEYS.map(k => (p[k] != null && p[k] !== '' ? p[k] : '-')).join('/')}]`).join('; ');
}
function rulesStr(sr) {
  if (Array.isArray(sr)) return sr.map(r => (typeof r === 'string' ? r : (r && r.name) || '')).filter(Boolean).join(', ');
  if (typeof sr === 'string') return sr;
  return '';
}

const units = {};
for (const slug of Object.keys(unitDb)) {
  const u = unitDb[slug];
  units[slug] = {
    name_en: stripLinks(u.name || slug),
    army: u.army || '',
    type: u.troopType || u.category || '',
    profile: profileStr(u.profiles),
    equipment: Array.isArray(u.equipment) ? u.equipment.join(', ') : '',
    rules: stripLinks(rulesStr(u.specialRules)),
  };
}
// enrich with / add French names + points from the builder dataset
for (const id of Object.keys(builder)) {
  const o = builder[id];
  const ex = units[id] || (units[id] = { name_en: stripLinks(o.name_en || id), army: o.army || '', type: o.category || '', profile: '', equipment: '', rules: '' });
  if (o.name_fr) ex.name_fr = stripLinks(o.name_fr);
  if (o.points != null) ex.points = o.points;
  if (!ex.rules && o.specialRules) ex.rules = stripLinks(rulesStr(o.specialRules));
  if (!ex.equipment && Array.isArray(o.equip)) ex.equipment = o.equip.map(e => e.name_en || e.name_fr || '').filter(Boolean).join(' | ');
}

// Count magic items (nested: category -> army -> [items])
let miCount = 0;
for (const cat of Object.keys(magicItems)) {
  const byArmy = magicItems[cat] || {};
  for (const army of Object.keys(byArmy)) {
    if (Array.isArray(byArmy[army])) miCount += byArmy[army].length;
  }
}

const meta = {
  generatedAt: new Date().toISOString(),
  source: 'TOWen1/index.html',
  counts: {
    rules: Object.keys(rules).length,
    magicItemCategories: Object.keys(magicItems).length,
    magicItems: miCount,
    armyLores: Object.keys(armyLores).length,
    units: Object.keys(units).length,
  },
};

const banner =
  '/* AUTO-GENERATED by build/extract.js — do not edit by hand.\n' +
  ' * Source: ' + meta.source + '\n' +
  ' * Generated: ' + meta.generatedAt + '\n' +
  ' * Rules data is the intellectual property of Games Workshop Ltd.\n' +
  ' * This is an unofficial, fan-made reference shared for personal, non-commercial use.\n' +
  ' */\n';

const payload =
  banner +
  'window.TOW_RULES = ' +
  JSON.stringify({ rules, magicItems, armyLores, units, meta }, null, 0) +
  ';\n';

fs.writeFileSync(OUT, payload);
console.log('Wrote ' + OUT);
console.log('  rules:        ' + meta.counts.rules);
console.log('  magic items:  ' + meta.counts.magicItems + ' (' + meta.counts.magicItemCategories + ' categories)');
console.log('  army lores:   ' + meta.counts.armyLores);
console.log('  units:        ' + meta.counts.units);
