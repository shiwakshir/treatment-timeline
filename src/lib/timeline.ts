import {
  AdherenceValue,
  EffectValue,
  FieldStateStatus,
  OnsetAfterStartingValue,
  SideEffectsValue,
  StoppedByValue,
  StoppingReasonValue,
} from "@/lib/extraction";

export interface StructuredFieldRecord<T = string> {
  state: FieldStateStatus;
  value: T | null;
  statedOptions: string[];
}

export interface TimelineExpressionView {
  id: string;
  questionCategory: string;
  originalPhrase: string;
  candidateMeanings: string[];
  selectedMeaning: string;
  confidence: string;
  matchedLexiconTerm: string | null;
}

export interface TimelineMedicationRecord {
  id: string;
  genericName: string;
  dose: StructuredFieldRecord<string>;
  startDate: string;
  stopDate: string;
  durationTaken: StructuredFieldRecord<string>;
  onsetAfterStarting: StructuredFieldRecord<OnsetAfterStartingValue>;
  doseTimingText: string | null;

  adherenceRaw: string;
  adherence: StructuredFieldRecord<AdherenceValue>;

  effectRaw: string;
  effect: StructuredFieldRecord<EffectValue>;

  sideEffectsRaw: string;
  sideEffects: StructuredFieldRecord<SideEffectsValue>;

  stoppingReasonRaw: string;
  stoppingReason: StructuredFieldRecord<StoppingReasonValue>;
  stoppedBy: StructuredFieldRecord<StoppedByValue>;

  confirmedAt: string | Date | null;
  expressions: TimelineExpressionView[];
}

export interface GapItem {
  fieldKey: string;
  gapType: "unknown" | "not_mentioned";
  labelEn: string;
  labelHi: string;
}

export function isUnknownText(value: string | null | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "unknown" ||
    normalized === "अज्ञात" ||
    normalized === "pata nahi" ||
    normalized === "yaad nahi"
  );
}

/**
 * Computes every `unknown` and `not_mentioned` field for a medication period,
 * labelling `unknown` (patient does not remember) and `not_mentioned` (not addressed)
 * distinctly in the timeline "Gaps" section.
 */
export function computeMedicationGaps(
  med: TimelineMedicationRecord
): GapItem[] {
  const gaps: GapItem[] = [];

  const checkField = (
    fieldKey: string,
    nameEn: string,
    nameHi: string,
    state: FieldStateStatus
  ) => {
    if (state === "unknown") {
      gaps.push({
        fieldKey,
        gapType: "unknown",
        labelEn: `${nameEn}: Unknown (patient does not remember)`,
        labelHi: `${nameHi}: अज्ञात (मरीज़ को याद नहीं है)`,
      });
    } else if (state === "not_mentioned") {
      gaps.push({
        fieldKey,
        gapType: "not_mentioned",
        labelEn: `${nameEn}: Not mentioned`,
        labelHi: `${nameHi}: उल्लेख नहीं किया गया`,
      });
    }
  };

  if (isUnknownText(med.genericName)) {
    gaps.push({
      fieldKey: "genericName",
      gapType: "unknown",
      labelEn: "Medicine name: Unknown (patient does not remember)",
      labelHi: "दवाई का नाम: अज्ञात (मरीज़ को याद नहीं है)",
    });
  }
  if (isUnknownText(med.startDate)) {
    gaps.push({
      fieldKey: "startDate",
      gapType: "unknown",
      labelEn: "Start date: Unknown (patient does not remember)",
      labelHi: "शुरू करने की तारीख: अज्ञात (मरीज़ को याद नहीं है)",
    });
  }
  if (isUnknownText(med.stopDate)) {
    gaps.push({
      fieldKey: "stopDate",
      gapType: "unknown",
      labelEn: "Stop date: Unknown (patient does not remember)",
      labelHi: "बंद करने की तारीख: अज्ञात (मरीज़ को याद नहीं है)",
    });
  }

  checkField("dose", "Dose", "खुराक (Dose)", med.dose.state);
  checkField(
    "durationTaken",
    "Duration taken",
    "दवाई लेने की अवधि",
    med.durationTaken.state
  );
  checkField(
    "adherence",
    "Adherence",
    "दवाई लेने का नियम",
    med.adherence.state
  );
  checkField("effect", "Effect", "दवाई का असर", med.effect.state);
  checkField(
    "sideEffects",
    "Side effects",
    "दुष्प्रभाव (Side effects)",
    med.sideEffects.state
  );
  checkField(
    "onsetAfterStarting",
    "Onset after starting",
    "शुरू करने के बाद असर/परेशानी का समय",
    med.onsetAfterStarting.state
  );
  checkField(
    "stoppingReason",
    "Reason for stopping",
    "बंद करने की वजह",
    med.stoppingReason.state
  );
  checkField(
    "stoppedBy",
    "Stopped by",
    "किसके द्वारा बंद की गई",
    med.stoppedBy.state
  );

  return gaps;
}

const ADHERENCE_TEMPLATES: Record<AdherenceValue, { en: string; hi: string }> = {
  taken_as_prescribed: {
    en: "Taken regularly as prescribed.",
    hi: "बताए गए तरीके से नियमित रूप से ली गई।",
  },
  mostly_taken_occasional_missed: {
    en: "Mostly taken as prescribed, with occasional missed doses.",
    hi: "अधिकतर बताए अनुसार ली गई, कभी-कभी खुराक छूट गई।",
  },
  irregular_or_frequently_missed: {
    en: "Taken irregularly or doses were frequently missed/changed.",
    hi: "अनियमित रूप से ली गई या खुराक बार-बार छूटी/बदली गई।",
  },
  not_taken: {
    en: "Medicine was not taken.",
    hi: "दवाई नहीं ली गई।",
  },
};

const EFFECT_TEMPLATES: Record<EffectValue, { en: string; hi: string }> = {
  helped_significantly: {
    en: "Helped significantly.",
    hi: "काफी मदद मिली।",
  },
  helped_partially: {
    en: "Helped partially.",
    hi: "आंशिक रूप से (थोड़ी) मदद मिली।",
  },
  helped_degree_not_stated: {
    en: "Helped (degree not stated).",
    hi: "आराम मिला (कितना, यह स्पष्ट नहीं है)।",
  },
  no_benefit: {
    en: "No noticeable benefit reported.",
    hi: "कोई फ़ायदा महसूस नहीं हुआ।",
  },
  worsened_or_unpleasant: {
    en: "Felt worse or unpleasant while on the medicine.",
    hi: "दवाई लेने के दौरान स्थिति और असहज या खराब महसूस हुई।",
  },
};

const SIDE_EFFECTS_TEMPLATES: Record<
  SideEffectsValue,
  { en: string; hi: string }
> = {
  present: {
    en: "Side effects or uncomfortable symptoms were reported.",
    hi: "दुष्प्रभाव या शारीरिक/मानसिक परेशानी महसूस हुई।",
  },
  none: {
    en: "No side effects reported.",
    hi: "कोई दुष्प्रभाव नहीं हुआ।",
  },
};

const STOPPING_REASON_TEMPLATES: Record<
  StoppingReasonValue,
  { en: string; hi: string }
> = {
  side_effects_or_discomfort: {
    en: "Stopped due to side effects or discomfort.",
    hi: "दुष्प्रभाव या परेशानी की वजह से बंद की गई।",
  },
  lack_of_effect: {
    en: "Stopped because it did not seem to help.",
    hi: "असर न होने की वजह से बंद की गई।",
  },
  felt_better: {
    en: "Stopped after feeling better.",
    hi: "तबियत बेहतर लगने पर बंद की गई।",
  },
  cost_or_availability: {
    en: "Stopped due to cost or medicine availability.",
    hi: "कीमत या दवाई न मिलने की वजह से बंद की गई।",
  },
  clinician_advised: {
    en: "Stopped or changed on clinician advice.",
    hi: "डॉक्टर की सलाह पर बंद या बदली गई।",
  },
  still_taking: {
    en: "Still taking this medicine.",
    hi: "यह दवाई अभी भी जारी है।",
  },
};

const STOPPED_BY_TEMPLATES: Record<StoppedByValue, { en: string; hi: string }> = {
  self: {
    en: "Stopped by the patient.",
    hi: "मरीज़ ने स्वयं बंद की।",
  },
  clinician: {
    en: "Stopped by the clinician.",
    hi: "डॉक्टर ने बंद की।",
  },
};

const ONSET_TEMPLATES: Record<
  OnsetAfterStartingValue,
  { en: string; hi: string }
> = {
  hours: {
    en: "within hours of starting",
    hi: "शुरू करने के कुछ घंटों के भीतर",
  },
  days_to_weeks: {
    en: "after days to weeks of starting",
    hi: "शुरू करने के कुछ दिनों या हफ़्तों बाद",
  },
  months: {
    en: "after months of starting",
    hi: "शुरू करने के कुछ महीनों बाद",
  },
};

function formatStateFallback(
  field: StructuredFieldRecord<unknown>,
  lang: "en" | "hi"
): string {
  if (field.state === "unknown") {
    return lang === "en"
      ? "Unknown (does not remember)."
      : "अज्ञात (याद नहीं है)।";
  }
  if (field.state === "uncertain") {
    const opts = field.statedOptions.join(" / ");
    return lang === "en"
      ? `Uncertain (${opts || "options not specified"}).`
      : `अनिश्चित (${opts || "विकल्प स्पष्ट नहीं"})।`;
  }
  return lang === "en" ? "Not mentioned." : "उल्लेख नहीं किया गया।";
}

export function formatAdherenceSentence(
  field: StructuredFieldRecord<AdherenceValue>,
  lang: "en" | "hi"
): string {
  if (field.state === "known" && field.value) {
    return ADHERENCE_TEMPLATES[field.value][lang];
  }
  return formatStateFallback(field, lang);
}

export function formatEffectSentence(
  field: StructuredFieldRecord<EffectValue>,
  lang: "en" | "hi"
): string {
  if (field.state === "known" && field.value) {
    return EFFECT_TEMPLATES[field.value][lang];
  }
  return formatStateFallback(field, lang);
}

export function formatSideEffectsSentence(
  field: StructuredFieldRecord<SideEffectsValue>,
  lang: "en" | "hi"
): string {
  if (field.state === "known" && field.value) {
    return SIDE_EFFECTS_TEMPLATES[field.value][lang];
  }
  return formatStateFallback(field, lang);
}

export function formatStoppingSentence(
  stoppingReason: StructuredFieldRecord<StoppingReasonValue>,
  stoppedBy: StructuredFieldRecord<StoppedByValue>,
  lang: "en" | "hi"
): string {
  const parts: string[] = [];
  if (stoppingReason.state === "known" && stoppingReason.value) {
    parts.push(STOPPING_REASON_TEMPLATES[stoppingReason.value][lang]);
  } else {
    parts.push(formatStateFallback(stoppingReason, lang));
  }

  if (stoppedBy.state === "known" && stoppedBy.value) {
    parts.push(STOPPED_BY_TEMPLATES[stoppedBy.value][lang]);
  }

  return parts.join(" ");
}

/**
 * Deterministic read-back summary built purely in code from the stored
 * structured fields and confirmed clinical meanings using fixed sentence templates
 * in Hindi and English (never free-text LLM output).
 */
export function buildReadBackSummary(
  med: TimelineMedicationRecord,
  lang: "en" | "hi"
): string[] {
  const lines: string[] = [];

  const medName = isUnknownText(med.genericName)
    ? lang === "en"
      ? "Unknown medicine"
      : "अज्ञात दवाई"
    : med.genericName;

  const doseStr =
    med.dose.state === "known" && med.dose.value
      ? med.dose.value
      : formatStateFallback(med.dose, lang);

  const durStr =
    med.durationTaken.state === "known" && med.durationTaken.value
      ? med.durationTaken.value
      : formatStateFallback(med.durationTaken, lang);

  const onsetStr =
    med.onsetAfterStarting.state === "known" && med.onsetAfterStarting.value
      ? ONSET_TEMPLATES[med.onsetAfterStarting.value][lang]
      : formatStateFallback(med.onsetAfterStarting, lang);

  if (lang === "en") {
    lines.push(
      `Medicine: ${medName} | Dose: ${doseStr} | Start: ${med.startDate} | Stop: ${med.stopDate}`
    );
    lines.push(`Duration taken: ${durStr} | Onset after starting: ${onsetStr}`);
    if (med.doseTimingText) {
      lines.push(`Dose timing / schedule: ${med.doseTimingText}`);
    }
    lines.push(`Adherence: ${formatAdherenceSentence(med.adherence, "en")}`);
    lines.push(`Effect: ${formatEffectSentence(med.effect, "en")}`);
    lines.push(
      `Side effects: ${formatSideEffectsSentence(med.sideEffects, "en")}`
    );
    lines.push(
      `Stopping: ${formatStoppingSentence(
        med.stoppingReason,
        med.stoppedBy,
        "en"
      )}`
    );
    if (med.expressions.length > 0) {
      for (const expr of med.expressions) {
        lines.push(
          `Confirmed meaning for "${expr.originalPhrase}": ${expr.selectedMeaning}`
        );
      }
    }
  } else {
    lines.push(
      `दवाई: ${medName} | खुराक: ${doseStr} | शुरू: ${med.startDate} | बंद: ${med.stopDate}`
    );
    lines.push(
      `लेने की अवधि: ${durStr} | शुरू करने के बाद असर/परेशानी का समय: ${onsetStr}`
    );
    if (med.doseTimingText) {
      lines.push(`दवाई का समय / दिनचर्या: ${med.doseTimingText}`);
    }
    lines.push(
      `लेने का नियम: ${formatAdherenceSentence(med.adherence, "hi")}`
    );
    lines.push(`असर: ${formatEffectSentence(med.effect, "hi")}`);
    lines.push(
      `दुष्प्रभाव: ${formatSideEffectsSentence(med.sideEffects, "hi")}`
    );
    lines.push(
      `बंद करने का विवरण: ${formatStoppingSentence(
        med.stoppingReason,
        med.stoppedBy,
        "hi"
      )}`
    );
    if (med.expressions.length > 0) {
      for (const expr of med.expressions) {
        lines.push(
          `"${expr.originalPhrase}" का पुष्ट अर्थ: ${expr.selectedMeaning}`
        );
      }
    }
  }

  return lines;
}

/**
 * Sorts medication periods in chronological order by startDate.
 */
export function sortMedicationsByDate(
  meds: TimelineMedicationRecord[]
): TimelineMedicationRecord[] {
  return [...meds].sort((a, b) => {
    const aUnknown = isUnknownText(a.startDate);
    const bUnknown = isUnknownText(b.startDate);

    if (aUnknown && bUnknown) return 0;
    if (aUnknown) return -1;
    if (bUnknown) return 1;

    return a.startDate.localeCompare(b.startDate);
  });
}
