import type { MITSFormSchema } from "@/types/mits";

/* ──────────────────────────────────────────────────────────────────────────
   Example form schemas.

   In-memory stand-ins for what the backend will serve from a schema store. They
   exist so the wizard and the renderer can be exercised end-to-end in the
   frontend alone, and they double as the reference for how a MITS ticket type is
   authored: plain JSON Schema for the data, uiHints for presentation only —
   including the human labels for enum values, so `schema` needs no non-standard
   `enumNames` extension.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The "Schnell-Ticket" (legacy) intake. It is a schema like every other form —
 * the classic tab is a *schema choice*, not a hand-built component.
 */
export const QUICK_TICKET_SCHEMA: MITSFormSchema = {
  id: "quick-ticket",
  title: "Schnell-Ticket",
  description: "Freitext-Meldung, wenn keine Kategorie passt.",
  category: "Allgemein",
  version: 1,
  icon: "PenLine",
  submitLabel: "Ticket senden",
  aiHint: "Auffangformular für alles, was in kein spezifisches Schema passt.",
  schema: {
    type: "object",
    required: ["title", "priority", "description"],
    properties: {
      title: { type: "string", title: "Titel", minLength: 5, maxLength: 120 },
      priority: {
        type: "string",
        title: "Priorität",
        enum: ["low", "medium", "high", "critical"],
        default: "medium",
      },
      description: {
        type: "string",
        title: "Beschreibung",
        minLength: 20,
        maxLength: 4000,
      },
      attachments: {
        type: "array",
        title: "Anhänge",
        maxItems: 5,
        items: { type: "string", format: "data-url" },
      },
    },
  },
  uiHints: {
    title: {
      order: 1,
      placeholder: "Kurz und konkret, z. B. „Drucker Etage 3 offline“",
    },
    priority: {
      order: 2,
      widget: "select",
      tooltip: "Dringend bedeutet: Arbeit steht komplett still.",
      optionLabels: {
        low: "Niedrig",
        normal: "Normal",
        high: "Hoch",
        urgent: "Dringend",
      },
    },
    description: {
      order: 3,
      widget: "textarea",
      placeholder: "Was ist passiert? Seit wann? Welche Fehlermeldung erscheint?",
      help: "Mindestens 20 Zeichen.",
    },
    attachments: {
      order: 4,
      accept: "image/*,.pdf,.log,.txt",
      help: "Screenshots oder Logs, bis 5 Dateien.",
    },
  },
};

export const HARDWARE_ORDER_SCHEMA: MITSFormSchema = {
  id: "hardware-order",
  title: "Hardware bestellen",
  description: "Neues Gerät oder Zubehör für einen Arbeitsplatz anfordern.",
  category: "Hardware",
  version: 1,
  icon: "Laptop",
  submitLabel: "Bestellung anfordern",
  aiHint:
    "Beschaffung von Notebooks, Monitoren, Dockingstations, Tastaturen, Headsets und Zubehör.",
  schema: {
    type: "object",
    required: [
      "device_type",
      "quantity",
      "cost_center",
      "needed_by",
      "justification",
    ],
    properties: {
      device_type: {
        type: "string",
        title: "Gerätetyp",
        enum: ["notebook", "desktop", "monitor", "docking", "phone", "accessory"],
      },
      model_preference: {
        type: "string",
        title: "Modellwunsch",
        maxLength: 120,
      },
      quantity: {
        type: "integer",
        title: "Menge",
        minimum: 1,
        maximum: 50,
        default: 1,
      },
      cost_center: {
        type: "string",
        title: "Kostenstelle",
        pattern: "^[0-9]{4,6}$",
      },
      needed_by: { type: "string", title: "Benötigt ab", format: "date" },
      accessories: {
        type: "array",
        title: "Zubehör",
        items: {
          type: "string",
          enum: ["dock", "second_monitor", "headset", "mouse", "keyboard", "bag"],
        },
      },
      justification: {
        type: "string",
        title: "Begründung",
        minLength: 20,
        maxLength: 2000,
      },
      replaces_existing: {
        type: "boolean",
        title: "Ersetzt ein vorhandenes Gerät",
      },
      quote: {
        type: "array",
        title: "Angebot / Kostenvoranschlag",
        maxItems: 3,
        items: { type: "string", format: "data-url" },
      },
    },
  },
  uiHints: {
    device_type: {
      order: 1,
      widget: "select",
      group: "Gerät",
      optionLabels: {
        notebook: "Notebook",
        desktop: "Desktop-PC",
        monitor: "Monitor",
        docking: "Dockingstation",
        phone: "Smartphone",
        accessory: "Zubehör",
      },
    },
    model_preference: {
      order: 2,
      group: "Gerät",
      placeholder: "z. B. Dell Latitude 5550",
      help: "Optional — ohne Angabe wird das Standardmodell bestellt.",
    },
    quantity: { order: 3, group: "Gerät" },
    cost_center: {
      order: 4,
      group: "Gerät",
      placeholder: "z. B. 41200",
      tooltip: "Vier- bis sechsstellige Nummer, steht auf der Kostenstellenliste.",
    },
    needed_by: { order: 5, group: "Gerät" },
    accessories: {
      order: 6,
      group: "Zubehör & Begründung",
      optionLabels: {
        dock: "Dockingstation",
        second_monitor: "Zweiter Monitor",
        headset: "Headset",
        mouse: "Maus",
        keyboard: "Tastatur",
        bag: "Notebook-Tasche",
      },
    },
    justification: {
      order: 7,
      widget: "textarea",
      group: "Zubehör & Begründung",
      placeholder: "Wofür wird das Gerät gebraucht? Wer nutzt es?",
    },
    replaces_existing: {
      order: 8,
      widget: "switch",
      group: "Zubehör & Begründung",
      help: "Bei Ersatz wird das Altgerät eingezogen und abgeschrieben.",
    },
    quote: {
      order: 9,
      group: "Zubehör & Begründung",
      accept: "application/pdf,image/*",
    },
  },
};

export const USER_ONBOARDING_SCHEMA: MITSFormSchema = {
  id: "user-onboarding",
  title: "Neuen Mitarbeitenden anlegen",
  description: "Accounts, Rechte und Ausstattung für einen Eintritt vorbereiten.",
  category: "Onboarding",
  version: 1,
  icon: "UserPlus",
  submitLabel: "Onboarding starten",
  aiHint:
    "Eintritt neuer Mitarbeitender: Benutzerkonto, E-Mail, Gruppen, Systemzugänge, Erstausstattung.",
  schema: {
    type: "object",
    required: [
      "first_name",
      "last_name",
      "start_date",
      "department",
      "employment_type",
      "manager_email",
      "systems",
    ],
    properties: {
      first_name: {
        type: "string",
        title: "Vorname",
        minLength: 2,
        maxLength: 60,
      },
      last_name: {
        type: "string",
        title: "Nachname",
        minLength: 2,
        maxLength: 60,
      },
      start_date: { type: "string", title: "Eintrittsdatum", format: "date" },
      department: {
        type: "string",
        title: "Abteilung",
        enum: ["it", "sales", "service", "accounting", "hr", "logistics"],
      },
      employment_type: {
        type: "string",
        title: "Beschäftigungsart",
        enum: ["permanent", "temporary", "trainee", "external"],
      },
      manager_email: {
        type: "string",
        title: "E-Mail der Führungskraft",
        format: "email",
      },
      systems: {
        type: "array",
        title: "Systemzugänge",
        minItems: 1,
        items: {
          type: "string",
          enum: ["ad", "m365", "erp", "dms", "crm", "vpn", "phone"],
        },
      },
      copy_permissions_from: {
        type: "string",
        title: "Rechte kopieren von",
        format: "email",
      },
      notes: { type: "string", title: "Hinweise", maxLength: 2000 },
    },
  },
  uiHints: {
    first_name: { order: 1, step: 1, group: "Person" },
    last_name: { order: 2, step: 1, group: "Person" },
    start_date: { order: 3, step: 1, group: "Person" },
    department: {
      order: 4,
      step: 1,
      widget: "select",
      group: "Person",
      optionLabels: {
        it: "IT",
        sales: "Vertrieb",
        service: "Service",
        accounting: "Buchhaltung",
        hr: "Personal",
        logistics: "Logistik",
      },
    },
    employment_type: {
      order: 5,
      step: 1,
      widget: "radio",
      group: "Person",
      optionLabels: {
        permanent: "Festanstellung",
        temporary: "Befristet",
        trainee: "Auszubildend",
        external: "Extern",
      },
    },
    manager_email: {
      order: 6,
      step: 2,
      group: "Zugänge",
      placeholder: "vorname.nachname@wellergruppe.de",
    },
    systems: {
      order: 7,
      step: 2,
      group: "Zugänge",
      help: "Mindestens ein System auswählen.",
      optionLabels: {
        ad: "Active Directory",
        m365: "Microsoft 365",
        erp: "ERP",
        dms: "Dokumentenmanagement",
        crm: "CRM",
        vpn: "VPN",
        phone: "Telefonie",
      },
    },
    copy_permissions_from: {
      order: 8,
      step: 2,
      group: "Zugänge",
      tooltip:
        "Übernimmt Gruppen und Freigaben einer bestehenden Person mit gleicher Rolle.",
    },
    notes: {
      order: 9,
      step: 2,
      widget: "textarea",
      group: "Zugänge",
      placeholder: "Besonderheiten, Schichtmodell, Standort …",
    },
  },
};

export const SOFTWARE_ACCESS_SCHEMA: MITSFormSchema = {
  id: "software-access",
  title: "Software-Zugang beantragen",
  description: "Lizenz oder Berechtigung für eine Anwendung anfordern.",
  category: "Software",
  version: 1,
  icon: "KeyRound",
  submitLabel: "Zugang beantragen",
  aiHint:
    "Anträge auf Softwarelizenzen, Anwendungsberechtigungen, Rollen und Freigaben in bestehenden Systemen.",
  schema: {
    type: "object",
    required: [
      "application",
      "access_level",
      "business_justification",
      "consent",
    ],
    properties: {
      application: {
        type: "string",
        title: "Anwendung",
        enum: ["erp", "crm", "dms", "bi", "cad", "other"],
      },
      application_other: {
        type: "string",
        title: "Andere Anwendung",
        maxLength: 120,
      },
      access_level: {
        type: "string",
        title: "Berechtigungsstufe",
        enum: ["read", "write", "admin"],
      },
      valid_until: { type: "string", title: "Befristet bis", format: "date" },
      business_justification: {
        type: "string",
        title: "Fachliche Begründung",
        minLength: 20,
        maxLength: 2000,
      },
      screenshot: {
        type: "array",
        title: "Screenshot der Fehlermeldung",
        maxItems: 3,
        items: { type: "string", format: "data-url" },
      },
      consent: {
        type: "boolean",
        title: "Ich bestätige, dass die Berechtigung fachlich erforderlich ist.",
        const: true,
      },
    },
  },
  uiHints: {
    application: {
      order: 1,
      widget: "select",
      optionLabels: {
        erp: "ERP",
        crm: "CRM",
        dms: "Dokumentenmanagement",
        bi: "BI / Reporting",
        cad: "CAD",
        other: "Andere",
      },
    },
    application_other: {
      order: 2,
      placeholder: "Name und Hersteller",
      help: "Nur ausfüllen, wenn oben „Andere“ gewählt wurde.",
    },
    access_level: {
      order: 3,
      widget: "radio",
      optionLabels: {
        read: "Lesen",
        write: "Lesen & Schreiben",
        admin: "Administration",
      },
    },
    valid_until: {
      order: 4,
      tooltip: "Leer lassen für einen unbefristeten Zugang.",
    },
    business_justification: {
      order: 5,
      widget: "textarea",
      placeholder: "Welche Aufgabe erfordert diesen Zugang?",
    },
    screenshot: { order: 6, accept: "image/*" },
    consent: { order: 7, widget: "checkbox" },
  },
};

/**
 * The schemas that ship with MITS, in catalogue order.
 *
 * `lib/form-schemas.ts` layers the admin-built schemas from the database on top
 * of these; nothing outside that module should read this list to resolve an id,
 * or builder edits would be invisible.
 */
/**
 * Security incident, as produced by an inbound Defender alert.
 *
 * A schema rather than new ticket columns, which is rule 5 doing its job: the alert's
 * host, severity and title are answers to a form nobody filled in by hand, and putting
 * them in the payload means the existing detail view, the AI extractor and the search
 * all handle them with no extra code.
 *
 * It is in the catalogue too, so an agent can raise one by hand — a phone call about a
 * suspicious mail is the same kind of ticket as a machine-generated alert.
 */
export const SECURITY_INCIDENT_SCHEMA: MITSFormSchema = {
  id: "security-incident",
  title: "Security Incident",
  description:
    "Sicherheitsvorfall — automatisch aus einem Defender-Alert oder von Hand erfasst.",
  category: "Sicherheit",
  version: 1,
  icon: "ShieldAlert",
  submitLabel: "Vorfall melden",
  aiHint:
    "Sicherheitsvorfall, Malware-Fund, verdächtige Anmeldung, Defender- oder Virenwarnung.",
  schema: {
    type: "object",
    required: ["title", "severity"],
    properties: {
      title: {
        type: "string",
        title: "Alert",
        minLength: 3,
        maxLength: 160,
      },
      severity: {
        type: "string",
        title: "Schweregrad",
        enum: ["critical", "high", "medium", "low"],
        default: "high",
      },
      host: {
        type: "string",
        title: "Betroffenes Gerät oder Konto",
        maxLength: 120,
      },
      incident_id: {
        type: "string",
        title: "Incident-Nummer",
        maxLength: 32,
      },
      source: {
        type: "string",
        title: "Quelle",
        enum: ["defender", "manual", "other"],
        default: "manual",
      },
      detail: {
        type: "string",
        title: "Meldungstext",
        maxLength: 8000,
      },
    },
  },
  uiHints: {
    title: { order: 1, placeholder: "z. B. Suspicious PowerShell execution" },
    severity: {
      order: 2,
      widget: "select",
      optionLabels: {
        critical: "Kritisch",
        high: "Hoch",
        medium: "Mittel",
        low: "Niedrig",
      },
    },
    host: { order: 3, placeholder: "NB-VERTRIEB-07 oder person@firma.de" },
    incident_id: { order: 4, help: "Nummer aus dem Defender-Portal, falls vorhanden." },
    source: {
      order: 5,
      widget: "select",
      optionLabels: {
        defender: "Microsoft Defender",
        manual: "Von Hand erfasst",
        other: "Andere Quelle",
      },
    },
    detail: { order: 6, widget: "textarea" },
  },
};

export const BUILTIN_SCHEMAS: MITSFormSchema[] = [
  QUICK_TICKET_SCHEMA,
  USER_ONBOARDING_SCHEMA,
  HARDWARE_ORDER_SCHEMA,
  SOFTWARE_ACCESS_SCHEMA,
  SECURITY_INCIDENT_SCHEMA,
];

/** Group schemas by category, preserving the order they arrive in. Pure. */
export function groupByCategory(schemas: MITSFormSchema[]): {
  category: string;
  schemas: MITSFormSchema[];
}[] {
  const buckets = new Map<string, MITSFormSchema[]>();
  for (const schema of schemas) {
    const existing = buckets.get(schema.category);
    if (existing) existing.push(schema);
    else buckets.set(schema.category, [schema]);
  }
  return [...buckets].map(([category, grouped]) => ({
    category,
    schemas: grouped,
  }));
}
