# The Blue Scribes — assistant de règles *Warhammer: The Old World*

> *Dans le lore, les Blue Scribes sont deux hérauts de Tzeentch — **Xirat'p**, qui lit
> chaque requête, et **P'tarix**, qui en transcrit la réponse — parcourant le monde pour
> collecter sorts et bribes de savoir.*

**Outil de fan, gratuit, destiné à aider les joueurs** à retrouver une règle de
*Warhammer: The Old World*. Une intelligence artificielle répond aux questions en
s'appuyant sur une base de connaissances tirée de l'appli compagnon
[TOW en 1](https://github.com/morgensternprinting/TOWen1).

👉 **Application en ligne :** https://morgensternprinting.github.io/TheBlueScribes/

> ⚠️ **Projet non officiel.** *Warhammer: The Old World*, ainsi que l'ensemble des
> règles, noms et images associés, sont la **pleine propriété intellectuelle de
> Games Workshop Ltd.** Ce site n'est **ni édité, ni affilié, ni approuvé** par Games
> Workshop. C'est une **aide entre joueurs**, sans valeur officielle : en cas de doute,
> **seuls le livre de règles et les FAQ officiels font foi**. Les réponses de l'IA
> peuvent être inexactes.

## Ce qu'il fait

- **Répond aux questions de règles** (règles spéciales, objets magiques, lores de magie et
  leurs interactions), à partir d'une base de connaissances extraite de *TOW en 1*.
- **Demande une précision** quand la question est ambiguë, plutôt que de deviner.
- **Note ce qu'il ne sait pas** dans un carnet (le *Liber Caelestis* / bac à sable 🧪) :
  la question et la réponse du joueur y sont conservées pour vérification ultérieure.
- **Bilingue FR / EN** : l'IA répond toujours dans la langue de la question.

## En bref (technique)

- Page web statique (hébergée sur GitHub Pages), sans installation.
- La base de règles est regénérée depuis *TOW en 1* via `build/extract.js`.
- Un petit serveur relais optionnel ([Cloudflare Worker](./worker/README.md)) gère les
  comptes, la clé d'IA côté serveur et le système d'« écus » (recharge).
- Le code et l'outillage sont sous licence **MIT** — **ce qui ne couvre pas** le contenu
  des règles, qui reste la propriété de Games Workshop.

## ⚠️ Avertissement complet

Outil non officiel, créé par un fan — **non** approuvé, affilié ni soutenu par Games
Workshop Limited. *Warhammer: The Old World* et tous les noms, règles et visuels associés
sont la propriété intellectuelle de **Games Workshop Ltd.** Partagé à des fins
personnelles d'aide au jeu. **Les réponses de l'IA peuvent être erronées : le livre de
règles et les FAQ officiels font seuls autorité.**
