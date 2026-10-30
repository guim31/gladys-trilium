// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface, with the words of the Trilium interface (fr "note", "étiquette",
// "note du jour", de "Notiz", "Label", es "nota", "etiqueta"). German says
// "du", Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: {
    notes: 'Notes',
    today: 'Notes changed today',
    todo: 'Open to-dos',
    latest: 'Latest changed note',
  },
  fr: {
    notes: 'Notes',
    today: "Notes modifiées aujourd'hui",
    todo: 'Tâches ouvertes',
    latest: 'Dernière note modifiée',
  },
  de: {
    notes: 'Notizen',
    today: 'Heute geänderte Notizen',
    todo: 'Offene Aufgaben',
    latest: 'Zuletzt geänderte Notiz',
  },
  es: {
    notes: 'Notas',
    today: 'Notas modificadas hoy',
    todo: 'Tareas abiertas',
    latest: 'Última nota modificada',
  },
};

/** The "Latest changed note" text of an empty Trilium. */
export const NONE = { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguna' };

export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of Trilium and an ETAPI token in the configuration.',
    invalid: 'The Trilium address is not valid: enter an address like 192.168.1.50:8080.',
    token: 'Enter an ETAPI token (Trilium → Options → ETAPI → Create new ETAPI token).',
    unauthorized: 'Trilium refused the ETAPI token: check it, or create a new one.',
    unreachable: 'Trilium does not answer: check its address and that it is running.',
    error: 'Trilium answered with an error: see the logs of the integration.',
    invalid_answer: 'This address does not answer like Trilium: check the address and the port.',
    redirect: 'Trilium answers at another address: enter the one your browser ends up at (https?).',
  },
  fr: {
    none: "Saisissez l'adresse de Trilium et un jeton ETAPI dans la configuration.",
    invalid:
      "L'adresse de Trilium n'est pas valide : saisissez une adresse comme 192.168.1.50:8080.",
    token: 'Saisissez un jeton ETAPI (Trilium → Options → ETAPI → Créer un nouveau jeton ETAPI).',
    unauthorized: 'Trilium a refusé le jeton ETAPI : vérifiez-le, ou créez-en un nouveau.',
    unreachable: "Trilium ne répond pas : vérifiez son adresse et qu'il est démarré.",
    error: "Trilium a répondu par une erreur : consultez les journaux de l'intégration.",
    invalid_answer: "Cette adresse ne répond pas comme Trilium : vérifiez l'adresse et le port.",
    redirect:
      'Trilium répond à une autre adresse : saisissez celle où arrive votre navigateur (https ?).',
  },
  de: {
    none: 'Gib in der Konfiguration die Adresse von Trilium und ein ETAPI-Token ein.',
    invalid: 'Die Trilium-Adresse ist ungültig: Gib eine Adresse wie 192.168.1.50:8080 ein.',
    token: 'Gib ein ETAPI-Token ein (Trilium → Optionen → ETAPI → Neues ETAPI-Token erstellen).',
    unauthorized: 'Trilium hat das ETAPI-Token abgelehnt: Prüfe es oder erstelle ein neues.',
    unreachable: 'Trilium antwortet nicht: Prüfe die Adresse und ob es läuft.',
    error: 'Trilium hat mit einem Fehler geantwortet: Sieh dir die Logs der Integration an.',
    invalid_answer: 'Diese Adresse antwortet nicht wie Trilium: Prüfe Adresse und Port.',
    redirect:
      'Trilium antwortet unter einer anderen Adresse: Gib die ein, bei der dein Browser landet (https?).',
  },
  es: {
    none: 'Introduzca la dirección de Trilium y un token ETAPI en la configuración.',
    invalid:
      'La dirección de Trilium no es válida: introduzca una dirección como 192.168.1.50:8080.',
    token: 'Introduzca un token ETAPI (Trilium → Opciones → ETAPI → Crear un nuevo token ETAPI).',
    unauthorized: 'Trilium rechazó el token ETAPI: compruébelo o cree uno nuevo.',
    unreachable: 'Trilium no responde: compruebe su dirección y que esté en marcha.',
    error: 'Trilium respondió con un error: consulte los registros de la integración.',
    invalid_answer: 'Esta dirección no responde como Trilium: compruebe la dirección y el puerto.',
    redirect:
      'Trilium responde en otra dirección: introduzca aquella a la que llega su navegador (¿https?).',
  },
};

/** "Test the connection" once Trilium answered. */
export const TEST_TEXT = {
  en: (version, notes) => `Connected to Trilium ${version}: ${notes} note(s).`,
  fr: (version, notes) => `Connecté à Trilium ${version} : ${notes} note(s).`,
  de: (version, notes) => `Mit Trilium ${version} verbunden: ${notes} Notiz(en).`,
  es: (version, notes) => `Conectado a Trilium ${version}: ${notes} nota(s).`,
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Logs an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// Errors of the scene actions. `{name}` is a note title or id, `{detail}` the
// reason Trilium gave.
export const COMMAND_ERRORS = {
  en: {
    timeout: 'Trilium answered too late: the note may have been written anyway.',
    http: 'Trilium could not write the note: {detail}',
    unreachable: 'Trilium does not answer: nothing was done.',
    unauthorized: 'Trilium refused the ETAPI token: nothing was done.',
    parent: 'No note "{name}" in Trilium.',
    title: 'Enter the title of the note.',
    labels: 'The note was created, but Trilium refused its labels.',
    line: 'Enter the line to add.',
    protected: 'The day note is protected: Trilium does not let the integration write in it.',
    rejected: 'Trilium refused the note: {detail}',
  },
  fr: {
    timeout: 'Trilium a répondu trop tard : la note a peut-être été écrite quand même.',
    http: "Trilium n'a pas pu écrire la note : {detail}",
    unreachable: "Trilium ne répond pas : rien n'a été fait.",
    unauthorized: "Trilium a refusé le jeton ETAPI : rien n'a été fait.",
    parent: 'Aucune note « {name} » dans Trilium.',
    title: 'Saisissez le titre de la note.',
    labels: 'La note a été créée, mais Trilium a refusé ses étiquettes.',
    line: 'Saisissez la ligne à ajouter.',
    protected: "La note du jour est protégée : Trilium ne laisse pas l'intégration y écrire.",
    rejected: 'Trilium a refusé la note : {detail}',
  },
  de: {
    timeout: 'Trilium hat zu spät geantwortet: Die Notiz wurde vielleicht trotzdem geschrieben.',
    http: 'Trilium konnte die Notiz nicht schreiben: {detail}',
    unreachable: 'Trilium antwortet nicht: Es wurde nichts getan.',
    unauthorized: 'Trilium hat das ETAPI-Token abgelehnt: Es wurde nichts getan.',
    parent: 'Keine Notiz „{name}“ in Trilium.',
    title: 'Gib den Titel der Notiz ein.',
    labels: 'Die Notiz wurde erstellt, aber Trilium hat ihre Labels abgelehnt.',
    line: 'Gib die hinzuzufügende Zeile ein.',
    protected: 'Die Tagesnotiz ist geschützt: Trilium lässt die Integration nicht hineinschreiben.',
    rejected: 'Trilium hat die Notiz abgelehnt: {detail}',
  },
  es: {
    timeout: 'Trilium respondió demasiado tarde: puede que la nota se haya escrito de todos modos.',
    http: 'Trilium no pudo escribir la nota: {detail}',
    unreachable: 'Trilium no responde: no se ha hecho nada.',
    unauthorized: 'Trilium rechazó el token ETAPI: no se ha hecho nada.',
    parent: 'No hay ninguna nota «{name}» en Trilium.',
    title: 'Introduzca el título de la nota.',
    labels: 'La nota se creó, pero Trilium rechazó sus etiquetas.',
    line: 'Introduzca la línea que desea añadir.',
    protected:
      'La nota del día está protegida: Trilium no deja que la integración escriba en ella.',
    rejected: 'Trilium rechazó la nota: {detail}',
  },
};

/** A coded message in every language, details filled in. */
export function commandMessage(code, values = {}) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [
      language,
      (table[code] ?? table.unreachable)
        .replace('{name}', () => values.name ?? '')
        .replace('{detail}', () => values.detail ?? '')
        .slice(0, 200),
    ]),
  );
}

export const pick = (table, language) => table[language] ?? table.en;
