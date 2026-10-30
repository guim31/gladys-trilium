# Trilium Notes

Connectez Gladys à [Trilium Notes](https://triliumnotes.org) (TriliumNext),
l'application de prise de notes hiérarchique auto-hébergée : suivez vos
compteurs et vos tâches ouvertes, réagissez quand une note est créée ou
modifiée, créez des notes depuis vos scènes, et tenez un journal de la maison
dans la note du jour de Trilium, que Gladys remplit ligne par ligne. Tout reste
sur votre réseau local : Gladys parle directement à votre serveur Trilium, par
son ETAPI.

Testée sur un vrai TriliumNext v0.106.1 (l'image Docker
`triliumnext/trilium`). Vos retours sont les bienvenus sur le forum Gladys.

## Prérequis

- Gladys Assistant 5.1 ou plus récent.
- Un serveur Trilium joignable depuis la machine de Gladys : TriliumNext, ou
  le Trilium Notes d'origine en 0.50 ou plus récent (l'ETAPI). L'application de
  bureau seule n'a pas de serveur : utilisez son édition serveur, ou un serveur
  de synchronisation.
- Un jeton ETAPI : dans Trilium, ouvrez **Options → ETAPI** et cliquez sur
  **Créer un nouveau jeton ETAPI**. Copiez-le : il n'est affiché qu'une fois.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Dans **Adresse de Trilium**, saisissez l'adresse à laquelle vous ouvrez
   Trilium, par exemple `192.168.1.50:8080` ou `https://notes.example.org`.
3. Collez le **Jeton ETAPI**.
4. **Lire Trilium toutes les** : 5, 15 (par défaut), 30 ou 60 minutes. Les
   notes modifiées sont annoncées à la lecture suivante.
5. **Étiquette des tâches** : l'étiquette de vos tâches, `todo` par défaut.
   Une tâche est ouverte tant que la note porte cette étiquette et pas
   l'étiquette `#done`.
6. **Langue des noms et messages** fixe le nom des fonctionnalités (figé à
   l'ajout de l'appareil) et les textes de l'intégration. Français par défaut.
7. Enregistrez, puis utilisez **Tester la connexion** : elle affiche la version
   de Trilium et le nombre de notes.
8. Dans l'onglet **Découverte**, ajoutez l'appareil **Trilium**.

## Appareils

**Trilium** (un appareil pour le serveur) :

| Fonctionnalité              | Valeur                                              |
| --------------------------- | --------------------------------------------------- |
| Notes                       | nombre de notes (hors notes archivées et cachées)   |
| Notes modifiées aujourd'hui | notes créées ou modifiées depuis minuit             |
| Tâches ouvertes             | notes portant l'étiquette des tâches et pas `#done` |
| Dernière note modifiée      | titre de la dernière note créée ou modifiée         |

Les compteurs gardent leur historique. L'appareil garde son identité quand
l'adresse du serveur change.

## Widget du tableau de bord

**Trilium** : trois tuiles (notes, modifiées aujourd'hui, tâches) et les huit
dernières notes modifiées, avec l'heure de la modification. Dans les réglages
du widget, **Étiquette** (par exemple `todo` ou `courses`) liste à la place les
notes qui la portent et pas `#done` : une liste de tâches sur le tableau de
bord. **Masquer les compteurs** ne garde que la liste. Quand Trilium est joint
en https, chaque note s'ouvre dans Trilium.

## Déclencheurs de scène

- **Note Trilium créée ou modifiée** : une note est créée ou modifiée dans
  Trilium. Filtre : **Changement** (créée, modifiée, ou vide : les deux).
- **Note Trilium étiquetée modifiée** : la même chose, pour les notes portant
  une étiquette : **Étiquette** (obligatoire, le nom de l'étiquette sans `#`,
  exactement comme dans Trilium, ex. `todo`) et **Changement**. Les étiquettes
  héritées et celles d'un modèle comptent. Une note à plusieurs étiquettes
  déclenche une fois par nom d'étiquette : une scène réglée sur une étiquette
  ne s'exécute qu'une fois.

Variables : **Titre de la note**, **Changement** (`created` ou `updated`),
**Adresse de la note**, **Étiquettes** (celles de la note elle-même, en
`#nom=valeur`), **Identifiant de la note**, et **Étiquette** pour le second
déclencheur.

La première lecture après l'installation est silencieuse : les notes déjà là ne
sont pas annoncées. Les notes écrites par cette intégration ne sont jamais
annoncées. Dix notes au plus sont annoncées par lecture, les plus anciennes
d'abord ; les suivantes attendent la lecture d'après. Au-delà de 50
modifications entre deux lectures (un import), dix sont annoncées et le reste
est compté comme vu.

## Actions de scène

- **Ajouter une ligne à la note du jour Trilium** : **Ligne**, ajoutée à la fin
  de la note d'aujourd'hui du journal de Trilium, en nouveau paragraphe,
  précédée de l'heure sauf si **Commencer par l'heure** est désactivé. Trilium
  crée la note du jour (et son mois et son année) quand elle manque, d'après
  votre modèle de jour si vous en avez un. La ligne est écrite en texte brut.
- **Créer une note Trilium** : **Titre**, et au besoin **Note parente** (le
  titre exact ou l'identifiant d'une note existante ; vide : la racine),
  **Contenu** (texte brut, un paragraphe par ligne) et **Étiquettes** (séparées
  par des virgules, `nom=valeur` pour une étiquette avec valeur). L'étiquette
  `todo` en fait une tâche. Une note parente inconnue est une erreur :
  l'intégration n'en crée jamais.

Les deux renvoient **Identifiant de la note**, **Titre de la note** et
**Adresse de la note** ; **Créer une note Trilium** renvoie aussi **Note
parente**.

## Exemples de scènes

- **Journal de la maison** : quand la pression de la chaudière passe sous 1 bar
  → **Ajouter une ligne à la note du jour Trilium**, « Pression chaudière sous
  1 bar ». Chaque jour, la note du jour garde ce qui s'est passé dans la maison.
- **Tâche à la voix** : une scène vocale → **Créer une note Trilium**, parente
  `Courses`, titre tiré de la demande, étiquettes `todo`. Le compteur **Tâches
  ouvertes** et le widget la montrent.
- **Savoir ce qui a changé** : déclencheur **Note Trilium étiquetée modifiée**,
  étiquette `famille` → envoyer un message « {{triggerEvent.data.note_title}}
  a été modifiée ».
- **Rappel des tâches** : chaque soir, quand **Tâches ouvertes** dépasse 5 →
  envoyer un message.

## Dépannage

- **« Trilium a refusé le jeton ETAPI »** : le jeton a été supprimé ou mal
  recopié. Créez-en un nouveau dans Options → ETAPI.
- **« Trilium ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys. Le conteneur est sur un réseau en pont : `localhost` est
  le conteneur lui-même, saisissez plutôt l'adresse IP du serveur.
- **« Cette adresse ne répond pas comme Trilium »** : une page de connexion
  d'un proxy répond à la place de Trilium. Saisissez l'adresse de Trilium
  lui-même.
- **« La note du jour est protégée »** : Trilium ne donne pas le contenu d'une
  note protégée à l'ETAPI. Retirez la protection du journal, ou écrivez
  ailleurs avec **Créer une note Trilium**.
- Pour plus de détails dans les journaux de l'intégration, réglez
  `LOG_LEVEL=debug`.

## Limites

- Les déclencheurs partent à la lecture suivante (15 minutes par défaut), pas
  instantanément : Trilium ne pousse rien. Les notes supprimées ou déplacées ne
  sont pas annoncées, ni une étiquette ajoutée seule (Trilium ne change pas
  alors l'heure de modification de la note) ; une note enregistrée plusieurs
  fois entre deux lectures est annoncée une fois.
- Les notes protégées sont comptées, mais leur contenu n'est jamais lu ni
  écrit.
- Une lecture, c'est quelques recherches ETAPI. Les comptages lisent la liste
  des notes en flux, sans la garder : une base de dizaines de milliers de notes
  tient dans la mémoire du conteneur, mais se compte un peu plus lentement.
- L'intégration ne supprime ni ne déplace jamais rien dans Trilium.
- Sans lien avec Trilium Notes ni TriliumNext.
