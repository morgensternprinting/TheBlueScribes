---
name: update-knowledge-base
description: Met à jour la base de connaissances du chatbot (data/rules-data.js) à partir de la dernière version de l'app TOWen1. À utiliser quand TOWen1 a été modifié (nouvelles règles, unités, sorts, armées…) et qu'il faut resynchroniser « The Blue Scribes ». Récupère TOWen1, régénère la base, repère les NOUVELLES bases de données à brancher, vérifie, puis commit/push.
---

# Mettre à jour la base de connaissances depuis TOWen1

Le chatbot « The Blue Scribes » tire toutes ses règles de l'app compagnon **TOWen1**
(`morgensternprinting/TOWen1`), dont les données sont des objets JavaScript dans son
`index.html`. Le script `build/extract.js` les extrait et écrit `data/rules-data.js`
(`window.TOW_RULES`), que le site charge. Ce skill resynchronise le tout.

## Procédure

### 1. Récupérer la dernière version de TOWen1
TOWen1 est cloné à `../TOWen1` (sinon `/home/user/TOWen1`). Se caler sur `origin/main` :
```sh
cd ../TOWen1 || cd /home/user/TOWen1
for i in 1 2 3 4; do git fetch origin main && break || sleep $((2**i)); done
git reset --hard origin/main
git log --oneline -1
```

### 2. Repérer les bases de données présentes — et les NOUVELLES
Lister toutes les structures de données de premier niveau :
```sh
grep -nE "^(window\.[A-Z_]+|const [A-Z_]+)\s*=\s*[\{\[]" index.html
```
Comparer avec ce que `build/extract.js` extrait déjà (cherche les appels
`extractObjectLiteral(html, '…')`). Aujourd'hui l'extracteur prend :
`RULES_DB, MAGIC_ITEMS_DB, ARMY_LORES, UNIT_DB, OWB_UNIT_DATA, SPELL_DB,
BONUS_DB, RENEGADE_DB, AL, CAT_PCT, RULE_PHASES, RULE_SUB, SPELL_LORES,
RULE_INTERACTIONS, INFAMY_DB`.

**Si une structure utile n'y est PAS encore** (ex. un nouveau `*_DB`), il faut
l'ajouter à `build/extract.js` (l'extraire + l'inclure dans le payload + le compteur),
puis la rendre visible dans `index.html` :
- ajouter une section dans `buildKnowledgeText()` (cherche `### ` pour le style),
- la mentionner dans `SYSTEM_INSTRUCTIONS` (paragraphe `# Your knowledge base`).
Ignorer les structures purement visuelles/UI (ex. `FACTION_THEMES`, `CAT_COLORS`,
`ARMY_EMOJI`, `*_LINKS` qui ne contiennent que des liens).

### 3. Régénérer la base
```sh
cd ../TheBlueScribes || cd /home/user/TheBlueScribes
node build/extract.js
```
La commande affiche les compteurs (rules, units, spells, infamy…).

### 4. Vérifier
```sh
node --check data/rules-data.js          # JS valide
grep -o "https\?://" data/rules-data.js | wc -l   # DOIT afficher 0 (aucun lien)
```
Vérifier aussi qu'aucun script inline d'`index.html` n'est cassé si tu l'as touché :
```sh
node -e 'const fs=require("fs"),vm=require("vm");const h=fs.readFileSync("index.html","utf8");const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0,bad=0;while((m=re.exec(h))){i++;try{new vm.Script(m[1]);}catch(e){bad++;console.log("ERR",e.message);}}console.log("scripts:",i,"erreurs:",bad);'
```
Estimer la taille en tokens (rester raisonnable ; le modèle a une grande fenêtre,
et la base est mise en cache) : ~`(taille de rules-data.js)/4`.

### 5. Commit & push (branche + main)
```sh
git add build/extract.js data/rules-data.js index.html
git commit -m "Update knowledge base from latest TOWen1 (<résumé des nouveautés>)"
for i in 1 2 3 4; do git push -u origin claude/tow-rules-chatbot-4f4764 && break || sleep $((2**i)); done
for i in 1 2 3 4; do git push origin claude/tow-rules-chatbot-4f4764:main && break || sleep $((2**i)); done
```

## Règles à respecter
- **Aucun lien** dans la base : `stripLinks()` les retire ; l'étape 4 doit donner `0`.
- Ne jamais inventer de données : tout vient de TOWen1.
- Les noms d'identifiants JS ne doivent pas contenir d'espaces — attention aux
  remplacements globaux dans `index.html`.
- Parler à l'utilisateur en **français simple** (il n'est pas développeur) ; lui
  résumer ce qui a changé (ex. « +358 règles, +10 Armées d'Infamie »).
