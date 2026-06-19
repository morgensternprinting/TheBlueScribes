/* Hand-authored CORE RULES primer for The Blue Scribes.
 *
 * The auto-generated data/rules-data.js (from the TOWen1 app) covers ARMY special
 * rules, units, magic items, spells and army composition — but NOT the universal
 * rulebook mechanics (combat resolution, Break tests, Unit Strength, the General
 * and Battle Standard, psychology, saves, to-hit/to-wound, magic, terrain…).
 *
 * This file fills that gap with a concise reference for Warhammer: The Old World.
 * It is a condensed summary for the common case; the official rulebook & FAQ are
 * always authoritative on edge cases. Edit by hand — it is NOT regenerated.
 *
 * Key rule names are given bilingually (FR / EN) so the oracle can answer in
 * either language. Exposed as window.TOW_CORE_RULES (a single text block).
 */
window.TOW_CORE_RULES = `
# RÈGLES FONDAMENTALES (Core Rules) — Warhammer: The Old World

## Profil de caractéristiques (Characteristics)
M (Mouvement), CC/WS (Capacité de Combat), CT/BS (Capacité de Tir), F/S (Force),
E/T (Endurance), PV/W (Points de Vie), I (Initiative), A (Attaques), Cd/Ld (Commandement).
Les jets se font à 2D6 pour les tests de caractéristique basés sur le Commandement
(Moralité, Panique, Peur, Stupidité, Ralliement) : il faut faire un total INFÉRIEUR OU ÉGAL
à la valeur (modifiée). Un double 1 est une réussite automatique, un double 6 un échec automatique.

## Puissance d'Unité — PU (Unit Strength, US)
Chaque figurine apporte une Puissance d'Unité : la plupart des fantassins = 1 ; cavalerie et
grandes créatures en valent davantage (souvent 2, 3+ pour les monstres). La PU d'une unité est
la somme de celle de ses figurines. Elle sert notamment à : déterminer qui « surnombre »
(outnumber), déclencher la Peur (voir plus bas), et — surtout — la règle de DÉROUTE AUTOMATIQUE :
si, au terme d'un combat, la PU du camp vainqueur est **plus du double** de celle du camp perdant,
l'unité perdante est automatiquement Brisée (mise en fuite) **sans aucun test de Moralité** — ni le
Commandement du Général, ni la Grande Bannière ne peuvent l'éviter (seules Têtu/Inébranlable le peuvent).

## Toucher et blesser (To Hit / To Wound)
- TOUCHER au corps à corps : on compare la CC de l'attaquant à celle du défenseur sur la table
  (CC égales = 4+ ; nettement supérieure = 3+ ; etc.).
- TOUCHER au tir : selon la CT du tireur (CT3 = 4+), modifié par la portée longue (-1), le couvert (-1),
  le mouvement, les tirs multiples, etc.
- BLESSER : on compare la Force de l'attaque à l'Endurance de la cible (F = E → 4+ ; chaque point
  d'écart décale d'un cran, dans la limite de 2+ / 6+).

## Sauvegardes (Saves)
- Sauvegarde d'armure (Armour save) : réduite par la Force de l'attaque — F4 = -1, F5 = -2, F6 = -3,
  et ainsi de suite (+ tout Armour Piercing / Perforant additionnel de l'arme). Une armure dont le
  jet requis dépasserait 6+ devient inutile.
- Sauvegarde invulnérable (Ward save) : jet fixe non modifié par la Force, pris APRÈS l'armure ratée.
- Régénération (Regeneration) : nouvelle tentative de sauvegarde, annulée par les Attaques Enflammées
  (Flaming Attacks).

## La phase de Combat (Close Combat) et le RÉSULTAT DE COMBAT (Combat Result)
On combat dans l'ordre d'Initiative (sauf Frappe en Premier/Dernier). Puis on calcule le résultat de
combat de chaque camp = somme de :
- les Points de Vie non sauvegardés infligés (1 chacun) ;
- le BONUS DE RANG (rang complet supplémentaire derrière le premier), plafonné à +3 ;
- +1 Bannière (Standard) ; +1 Surnombre (outnumber) si PU supérieure ; +1 Charge ;
- +1 Position dominante (higher ground) ; +1 attaque de Flanc, +2 attaque de Dos (rear).
Le camp avec le total le plus bas PERD le combat par la différence (l'« écart »).

## Test de Moralité (Break Test) — ce qui arrive au perdant
L'unité qui perd le combat fait un test de Moralité : 2D6 ≤ (Commandement − écart de résultat de combat
− autres malus). Modificateurs importants :
- **−1 par point d'écart** de résultat de combat ;
- **−1 supplémentaire si le camp vainqueur comprend une unité causant la TERREUR** ;
- on utilise le **Commandement du Général** si l'unité est à portée de Commandement de celui-ci
  (voir « Général » ci-dessous).
Réussite → l'unité « Tient bon » / Cède du Terrain (Fall Back in Good Order). Échec → elle est Brisée
et FUIT. Une unité Têtue (Stubborn) ignore l'écart une fois ; Inébranlable (Unbreakable) ne teste jamais.

## Fuite et Poursuite (Flee & Pursuit)
Une unité Brisée fuit (jet de dés selon son type de troupe). L'unité victorieuse peut tenter de
Poursuivre : si sa distance de poursuite atteint les fuyards, l'unité en fuite est **détruite**.
Sinon les fuyards s'éloignent et pourront tenter de se Rallier (Rally) lors de leur propre tour.

## Le Général (« Hold Your Ground »)
Tant qu'une unité amie est à portée de Commandement du Général (12 ps), elle peut utiliser le
Commandement du Général à la place du sien pour ses tests de Moralité, Panique et Peur.

## La Grande Bannière / Porteur de l'Étendard de Bataille (Battle Standard Bearer, BSB)
Une unité amie à portée de Commandement de la Grande Bannière (12 ps) peut **relancer un test de
Moralité (Break test) raté**. (Le Général donne SON Commandement ; la Grande Bannière donne la RELANCE
— les deux se combinent : on teste sur le Cd du Général, et on relance grâce à la Bannière.)

## Psychologie (Psychology)
- PEUR (Fear) : pour charger un ennemi causant la Peur ET de PU supérieure, il faut réussir un test de
  Commandement, sinon la charge échoue. Engagé contre un tel ennemi, il faut réussir un test au moment
  du combat, sinon −1 pour le toucher contre lui. Un seul test de Peur par tour. Qui cause la Peur y est
  immunisé.
- TERREUR (Terror) : cause AUSSI la Peur. Quand un causeur de Terreur déclare une charge, la cible teste
  son Commandement : échec = elle DOIT Fuir ; réussite = réaction de charge normale. De plus, le camp
  perdant un combat contre un causeur de Terreur subit −1 au Commandement sur son test de Moralité.
- PANIQUE (Panic) : test de Commandement déclenché notamment par de lourdes pertes (≈25 % de l'unité en
  un tour), par une unité amie proche détruite ou mise en fuite, ou par des fuyards traversant l'unité.
  Échec = l'unité fuit.
- FRÉNÉSIE (Frenzy) : +1 Attaque, doit déclarer une charge contre un ennemi à portée ; STUPIDITÉ
  (Stupidity) : test en début de mouvement sous peine de comportement erratique ; HAINE (Hatred) :
  relance des touches ratées au premier round de corps à corps. Immunisé à la Psychologie (Immune to
  Psychology) = ignore Peur, Terreur, Panique et les malus associés.

## Magie (Magic) — survol
Les sorciers tentent d'incanter en obtenant un total d'incantation supérieur ou égal à la Valeur
d'Incantation (Cast Value) du sort ; l'adversaire peut tenter de Dissiper (Dispel). Les sorts ont un
type, une portée, une durée et un effet (voir la section SORTS de la base). Pour le détail des Vents de
Magie, des canalisations et des incidents de sort, renvoyer au livre de règles officiel.

> Ce précis résume les mécaniques universelles pour le cas courant. Pour les cas limites précis (caps de
> bonus de rang, distances exactes de fuite/poursuite selon le type de troupe, interactions rares),
> rappeler que le livre de règles et la FAQ officiels de Warhammer: The Old World font foi.
`;
