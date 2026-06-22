# The Blue Scribes — assistant de règles *Warhammer: The Old World*

> *Dans le lore, les Blue Scribes sont deux hérauts de Tzeentch — **Xirat'p**, qui lit
> chaque requête, et **P'tarix**, qui en transcrit la réponse — parcourant le monde pour
> collecter sorts et bribes de savoir.*

👉 **Application en ligne / Live app:** https://morgensternprinting.github.io/TheBlueScribes/

---

## 🇫🇷 Français

**Outil de fan, destiné à aider les joueurs** à retrouver une règle de
*Warhammer: The Old World*. Une intelligence artificielle répond aux questions en
s'appuyant sur une base de connaissances tirée de l'appli compagnon
[TOW en 1](https://github.com/morgensternprinting/TOWen1).

> ⚠️ **Projet non officiel.** *Warhammer: The Old World*, ainsi que l'ensemble des
> règles, noms et images associés, sont la **pleine propriété intellectuelle de
> Games Workshop Ltd.** Ce site n'est **ni édité, ni affilié, ni approuvé** par Games
> Workshop. C'est une **aide entre joueurs**, sans valeur officielle : en cas de doute,
> **seuls le livre de règles et les FAQ officiels font foi**. Les réponses de l'IA
> peuvent être inexactes.
>
> 💰 **Ce qui est payant, et ce qui ne l'est pas.** Les « écus » financent **uniquement
> le fonctionnement du chatbot** (le service d'intelligence artificielle, qui a un coût).
> **Le contenu des règles n'est jamais vendu** : il n'est pas à vendre et reste la
> propriété de Games Workshop. On paie le *service*, pas les *règles*.

**Ce qu'il fait :**

- **Répond aux questions de règles** (règles spéciales, objets magiques, lores de magie et
  leurs interactions).
- **Demande une précision** quand la question est ambiguë, plutôt que de deviner.
- **Note ce qu'il ne sait pas** dans un carnet (le *Liber Caelestis* 🧪) pour vérification.
- **Bilingue FR / EN** : l'IA répond toujours dans la langue de la question.

---

## 🇬🇧 English

A **fan-made tool to help players** look up a *Warhammer: The Old World* rule. An AI
answers questions using a knowledge base extracted from the companion app
[TOW en 1](https://github.com/morgensternprinting/TOWen1).

> ⚠️ **Unofficial project.** *Warhammer: The Old World* and all associated rules, names
> and imagery are the **full intellectual property of Games Workshop Ltd.** This site is
> **not published by, affiliated with, or approved by** Games Workshop. It is a
> **player aid** with no official standing: when in doubt, **only the official rulebook
> and FAQs are authoritative**. AI answers can be wrong.
>
> 💰 **What is paid, and what is not.** The "écus" (credits) only fund **the chatbot's
> operation** (the AI service, which has a real cost). **The rules content is never
> sold** — it is not for sale and remains Games Workshop's property. You pay for the
> *service*, not the *rules*.

**What it does:**

- **Answers rules questions** (special rules, magic items, lores of magic and their
  interactions).
- **Asks for clarification** when a question is ambiguous, instead of guessing.
- **Logs what it doesn't know** in a notebook (the *Liber Caelestis* 🧪) for review.
- **Bilingual FR / EN**: the AI always replies in the language of your question.

---

## En bref (technique) / Technical notes

- Page web statique (GitHub Pages), sans installation. / Static web page (GitHub Pages),
  no install.
- Base de règles regénérée depuis *TOW en 1* via `build/extract.js`. / Rules data is
  regenerated from *TOW en 1* via `build/extract.js`.
- Serveur relais optionnel ([Cloudflare Worker](./worker/README.md)) : comptes, clé d'IA
  côté serveur, système d'« écus ». / Optional relay ([Cloudflare Worker](./worker/README.md)):
  accounts, server-side AI key, the "écus" credit system.
- Code et outillage sous licence **MIT** — **ne couvre pas** le contenu des règles
  (propriété Games Workshop). / Code and tooling under **MIT** — **does not cover** the
  rules content (Games Workshop's property).
