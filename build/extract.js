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
// RULE_FR maps a rule slug to its French name. Merge it in so every rule carries
// both its English name (`name`) and its French name (`name_fr`); the `desc` text
// is already in French in RULES_DB. (Optional source — older TOWen1 lacks it.)
const ruleFrLit = extractObjectLiteral(html, 'RULE_FR');
const ruleFr = ruleFrLit ? evalLiteral(ruleFrLit, 'RULE_FR') : {};
let ruleFrCount = 0;
for (const slug of Object.keys(ruleFr)) {
  const fr = stripLinks(ruleFr[slug]);
  if (!fr) continue;
  if (rules[slug]) { rules[slug].name_fr = fr; ruleFrCount++; }
}
for (const cat of Object.keys(magicItems)) {
  const byArmy = magicItems[cat] || {};
  for (const army of Object.keys(byArmy)) {
    for (const it of (byArmy[army] || [])) {
      if (it && typeof it === 'object') {
        if (it.n) it.n = stripLinks(it.n);
        if (it.d) it.d = stripLinks(it.d);
        if (it.df) it.df = stripLinks(it.df); // French description (bilingual)
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

// ── Spells ────────────────────────────────────────────────────────────────
// SPELL_DB holds every spell of every lore in French, WITH cast value, type,
// range, duration and effect — the richest spell source in the app.
const spellDb = evalLiteral(extractObjectLiteral(html, 'SPELL_DB'), 'SPELL_DB');
const spells = {};
let spellCount = 0;
for (const lore of Object.keys(spellDb)) {
  const arr = Array.isArray(spellDb[lore]) ? spellDb[lore] : [];
  spells[lore] = arr.map(s => ({
    name: stripLinks(s.name || ''),
    castValue: s.castValue || '',
    type: stripLinks(s.type || ''),
    range: s.range || '',
    duration: stripLinks(s.duration || ''),
    effect: stripLinks(s.effect || ''),
  }));
  spellCount += spells[lore].length;
}

// ── Equipment / weapon combat effects ───────────────────────────────────────
// BONUS_DB maps an equipment slug to the combat-stat changes it grants (e.g.
// great weapon → +2 Strength, strikes last). Flatten into a readable string.
const bonusDb = evalLiteral(extractObjectLiteral(html, 'BONUS_DB'), 'BONUS_DB');
const CTX = { C: 'au corps à corps', A: 'toujours', S: 'au tir' };
function bonusStr(b) {
  const parts = [];
  if (Array.isArray(b.effects)) {
    for (const e of b.effects) {
      let p = `${e.val > 0 ? '+' : ''}${e.val} ${e.stat}`;
      if (e.ctx && CTX[e.ctx]) p += ' ' + CTX[e.ctx];
      if (e.cond === 'charge') p += ' (à la charge)';
      parts.push(p);
    }
  }
  if (b.save != null) parts.push(`sauvegarde d'armure ${b.save}+`);
  if (b.saveBonus != null) parts.push(`sauvegarde d'armure ${b.saveBonus > 0 ? '+' : ''}${b.saveBonus}`);
  if (b.parry != null) parts.push(`parade ${b.parry}+`);
  if (b.wardSave != null) parts.push(`sauvegarde invulnérable ${b.wardSave}+`);
  if (b.regen != null) parts.push(`régénération ${b.regen}+`);
  if (b.note) parts.push(stripLinks(b.note));
  return parts.join('; ');
}
const equipment = {};
for (const slug of Object.keys(bonusDb)) {
  const str = bonusStr(bonusDb[slug] || {});
  if (str) equipment[slug] = str;
}

// ── Renegade army lists ─────────────────────────────────────────────────────
// RENEGADE_DB describes the "Renegade" composition + per-unit overrides for a
// handful of allied armies. Flatten into compact, readable text.
const renegadeDb = evalLiteral(extractObjectLiteral(html, 'RENEGADE_DB'), 'RENEGADE_DB');
function noteStr(note) {
  if (Array.isArray(note)) return note.map(stripLinks).join('; ');
  return stripLinks(note || '');
}
const renegade = {};
for (const army of Object.keys(renegadeDb)) {
  const r = renegadeDb[army] || {};
  const out = { comp: stripLinks(r.comp || '') };
  if (r.units && Object.keys(r.units).length) {
    out.units = {};
    for (const slug of Object.keys(r.units)) {
      out.units[slug] = noteStr(r.units[slug].note) || '';
    }
  }
  if (Array.isArray(r.rules) && r.rules.length) {
    out.rules = r.rules.map(x => `${stripLinks(x.n || '')}: ${stripLinks(x.c || '')}`);
  }
  if (Array.isArray(r.spells) && r.spells.length) {
    out.spells = r.spells.map(x => `${stripLinks(x.n || '')} (${stripLinks(x.c || '')})`);
  }
  renegade[army] = out;
}

// ── Army composition lists ──────────────────────────────────────────────────
// AL holds each army's list: which units may be taken in each category
// (Characters / Core / Special / Rare / Mercenaries / Allies), with 0-1 / 0-X
// limits embedded in the display names. CAT_PCT holds the points-percentage
// limits per category that apply to (almost) every army.
const alDb = evalLiteral(extractObjectLiteral(html, 'AL'), 'AL');
const catPct = evalLiteral(extractObjectLiteral(html, 'CAT_PCT'), 'CAT_PCT');
const CAT_ORDER = ['characters', 'core', 'special', 'rare', 'mercenaries', 'allies'];
const armyComposition = {};
for (const army of Object.keys(alDb)) {
  const a = alDb[army] || {};
  const out = {};
  for (const cat of CAT_ORDER) {
    const arr = a[cat];
    if (!Array.isArray(arr) || !arr.length) continue;
    // entries are {n,s} for unit categories, or plain strings for allies
    out[cat] = arr.map(e => (typeof e === 'string' ? stripLinks(e) : stripLinks(e.n || e.s || ''))).filter(Boolean);
  }
  armyComposition[army] = out;
}
const categoryLimits = {};
for (const cat of Object.keys(catPct)) categoryLimits[cat] = catPct[cat];

// ── Rule timing / phase logic ───────────────────────────────────────────────
// RULE_PHASES maps a rule slug to the game phase(s) it operates in (letters),
// RULE_SUB to finer sub-phase timing labels. Attach both to each rule so the
// oracle knows *when* a rule applies, not just what it says.
const rulePhases = evalLiteral(extractObjectLiteral(html, 'RULE_PHASES'), 'RULE_PHASES');
const ruleSub = evalLiteral(extractObjectLiteral(html, 'RULE_SUB'), 'RULE_SUB');
const PHASE_NAMES = { S: 'Strategy', M: 'Movement', T: 'Shooting', C: 'Combat', A: 'Any phase' };
for (const slug of Object.keys(rules)) {
  const ph = rulePhases[slug];
  if (Array.isArray(ph) && ph.length) rules[slug].phase = ph.map(p => PHASE_NAMES[p] || p).join(', ');
  const sub = ruleSub[slug];
  if (Array.isArray(sub) && sub.length) rules[slug].timing = sub.join(', ');
}

// ── Bilingual spell reference ───────────────────────────────────────────────
// SPELL_LORES is the smaller but fully bilingual (FR/EN) spell set — useful when
// answering in English. SPELL_DB (above) is the larger French-only set. Keep
// both: this one keyed by lore id with {fr,en} names and texts.
const spellLores = evalLiteral(extractObjectLiteral(html, 'SPELL_LORES'), 'SPELL_LORES');
const spellsBilingual = {};
let blSpellCount = 0;
for (const id of Object.keys(spellLores)) {
  const lore = spellLores[id] || {};
  const arr = Array.isArray(lore.spells) ? lore.spells : [];
  spellsBilingual[id] = {
    name_fr: stripLinks((lore.name && lore.name.fr) || ''),
    name_en: stripLinks((lore.name && lore.name.en) || ''),
    spells: arr.map(s => ({
      name_fr: stripLinks((s.name && s.name.fr) || ''),
      name_en: stripLinks((s.name && s.name.en) || ''),
      cv: s.cv != null ? s.cv : '',
      text_fr: stripLinks((s.text && s.text.fr) || ''),
      text_en: stripLinks((s.text && s.text.en) || ''),
    })),
  };
  blSpellCount += arr.length;
}

// ── Rule interaction index ──────────────────────────────────────────────────
// Invert RULE_SUB (rule -> moments) into moment -> rules, so the oracle can ask
// "at THIS point of play, which special rules can change the outcome?" and
// enumerate every relevant one instead of forgetting modifiers. Ordered roughly
// by the sequence of a game turn.
const MOMENT_ORDER = [
  'Deployment', 'Reserves / Deployment', 'Command', 'Compulsory Moves',
  'Declare Charges', 'Charge Moves', 'Remaining Moves', 'Magic (casting)',
  'Shooting', 'Fight', 'Combat Result', 'Break Test', 'Pursuit',
  'Any phase', 'Any phase (saves)',
];
const ruleIndex = {};
for (const slug of Object.keys(ruleSub)) {
  const name = (rules[slug] && rules[slug].name) || slug;
  for (const moment of ruleSub[slug]) {
    (ruleIndex[moment] || (ruleIndex[moment] = [])).push(`${name} (${slug})`);
  }
}
// stable, play-order keys
const ruleInteractionIndex = {};
for (const m of MOMENT_ORDER) if (ruleIndex[m]) ruleInteractionIndex[m] = ruleIndex[m].sort();
for (const m of Object.keys(ruleIndex)) if (!ruleInteractionIndex[m]) ruleInteractionIndex[m] = ruleIndex[m].sort();

// ── Rule interactions ───────────────────────────────────────────────────────
// RULE_INTERACTIONS maps a rule slug to a precise French note on how that rule
// interacts with others (cancellations, stacking, exceptions). Attach to the
// matching rule AND keep a standalone map.
const ruleInteractionsDb = evalLiteral(extractObjectLiteral(html, 'RULE_INTERACTIONS'), 'RULE_INTERACTIONS');
const ruleInteractions = {};
for (const slug of Object.keys(ruleInteractionsDb)) {
  const txt = stripLinks(ruleInteractionsDb[slug]);
  if (txt) ruleInteractions[slug] = txt;
}

// ── Armies of Infamy ────────────────────────────────────────────────────────
// INFAMY_DB holds the "Armies of Infamy" alternative army lists: per army a set
// of sub-lists, each with composition text, special rules, a per-category roster,
// unit limits and requirements. Flatten into readable text.
const infamyDb = evalLiteral(extractObjectLiteral(html, 'INFAMY_DB'), 'INFAMY_DB');
const infamy = {};
let infamyLists = 0;
for (const army of Object.keys(infamyDb)) {
  const lists = Array.isArray(infamyDb[army] && infamyDb[army].lists) ? infamyDb[army].lists : [];
  infamy[army] = lists.map(l => {
    const roster = l.roster || {};
    const rosterStr = {};
    for (const cat of Object.keys(roster)) if (Array.isArray(roster[cat]) && roster[cat].length) rosterStr[cat] = roster[cat].join(', ');
    const limits = l.limit && Object.keys(l.limit).length
      ? Object.keys(l.limit).map(k => `${k}: ${l.limit[k]}`).join('; ') : '';
    const reqs = Array.isArray(l.req) ? l.req.map(r => stripLinks(r.label || '')).filter(Boolean).join('; ') : '';
    return {
      name: stripLinks(l.name || l.key || ''),
      comp: stripLinks(l.comp || ''),
      rules: Array.isArray(l.ruleSlugs) ? l.ruleSlugs.join(', ') : '',
      roster: rosterStr,
      limits: stripLinks(limits),
      requires: reqs,
    };
  });
  infamyLists += infamy[army].length;
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
    ruleFrNames: ruleFrCount,
    magicItemCategories: Object.keys(magicItems).length,
    magicItems: miCount,
    armyLores: Object.keys(armyLores).length,
    units: Object.keys(units).length,
    spellLores: Object.keys(spells).length,
    spells: spellCount,
    equipment: Object.keys(equipment).length,
    renegadeArmies: Object.keys(renegade).length,
    armyComposition: Object.keys(armyComposition).length,
    bilingualSpells: blSpellCount,
    ruleInteractionMoments: Object.keys(ruleInteractionIndex).length,
    ruleInteractions: Object.keys(ruleInteractions).length,
    infamyArmies: Object.keys(infamy).length,
    infamyLists: infamyLists,
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
  JSON.stringify({ rules, magicItems, armyLores, units, spells, spellsBilingual, equipment, renegade, armyComposition, categoryLimits, ruleInteractionIndex, ruleInteractions, infamy, meta }, null, 0) +
  ';\n';

fs.writeFileSync(OUT, payload);
console.log('Wrote ' + OUT);
console.log('  rules:        ' + meta.counts.rules + ' (' + meta.counts.ruleFrNames + ' with FR name)');
console.log('  magic items:  ' + meta.counts.magicItems + ' (' + meta.counts.magicItemCategories + ' categories)');
console.log('  army lores:   ' + meta.counts.armyLores);
console.log('  units:        ' + meta.counts.units);
console.log('  spells:       ' + meta.counts.spells + ' (' + meta.counts.spellLores + ' lores)');
console.log('  equipment:    ' + meta.counts.equipment);
console.log('  renegade:     ' + meta.counts.renegadeArmies + ' armies');
console.log('  army comp:    ' + meta.counts.armyComposition + ' armies');
console.log('  bilingual sp: ' + meta.counts.bilingualSpells);
console.log('  rule index:   ' + meta.counts.ruleInteractionMoments + ' moments');
console.log('  interactions: ' + meta.counts.ruleInteractions + ' rules');
console.log('  infamy:       ' + meta.counts.infamyArmies + ' armies, ' + meta.counts.infamyLists + ' lists');
