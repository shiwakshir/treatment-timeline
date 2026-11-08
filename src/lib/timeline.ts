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
    "किसने बंद की",
    med.stoppedBy.state
  );

  return gaps;
}

const ADHERENCE_TEMPLATES: Record<AdherenceValue, { en: string; hi: string }> = {
  taken_as_prescribed: {
    en: "Taken regularly as prescribed.",
    hi: "दवाई बताए गए तरीके से नियमित रूप से ली गई।",
  },
  mostly_taken_occasional_missed: {
    en: "Mostly taken as prescribed, with occasional missed doses.",
    hi: "दवाई अधिकतर समय पर ली गई, बस कभी-कभी खुराक छूट गई।",
  },
  irregular_or_frequently_missed: {
    en: "Taken irregularly, or doses were frequently missed or changed.",
    hi: "दवाई अनियमित रूप से ली गई या खुराक कई बार छूटी।",
  },
  not_taken: {
    en: "The medicine was not taken.",
    hi: "यह दवाई नहीं ली गई।",
  },
};

const EFFECT_TEMPLATES: Record<EffectValue, { en: string; hi: string }> = {
  helped_significantly: {
    en: "The medicine helped significantly.",
    hi: "इस दवाई से काफी आराम मिला।",
  },
  helped_partially: {
    en: "The medicine helped partially.",
    hi: "इस दवाई से थोड़ा (आंशिक) आराम मिला।",
  },
  helped_degree_not_stated: {
    en: "The medicine helped (how much was not stated).",
    hi: "इस दवाई से आराम तो था (कितना फर्क पड़ा, यह स्पष्ट नहीं है)।",
  },
  no_benefit: {
    en: "No benefit was noticed from the medicine.",
    hi: "इस दवाई से कोई खास फायदा महसूस नहीं हुआ।",
  },
  worsened_or_unpleasant: {
    en: "Felt worse or unpleasant while taking the medicine.",
    hi: "दवाई लेने के दौरान तबीयत या मन और उदास/असहज रहा।",
  },
};

const SIDE_EFFECTS_TEMPLATES: Record<
  SideEffectsValue,
  { en: string; hi: string }
> = {
  present: {
    en: "Side effects or physical/mental discomfort were reported.",
    hi: "दवाई लेते समय शरीर या मन में परेशानी (दुष्प्रभाव) महसूस हुई।",
  },
  none: {
    en: "No side effects were reported.",
    hi: "दवाई से कोई दुष्प्रभाव या परेशानी नहीं हुई।",
  },
};

const STOPPING_REASON_TEMPLATES: Record<
  StoppingReasonValue,
  { en: string; hi: string }
> = {
  side_effects_or_discomfort: {
    en: "Stopped because of side effects or discomfort.",
    hi: "परेशानी या दुष्प्रभाव होने की वजह से दवाई बंद कर दी गई।",
  },
  lack_of_effect: {
    en: "Stopped because it did not seem to help.",
    hi: "फायदा न लगने की वजह से दवाई बंद कर दी गई।",
  },
  felt_better: {
    en: "Stopped after feeling better.",
    hi: "तबीयत ठीक लगने के बाद दवाई बंद कर दी गई।",
  },
  cost_or_availability: {
    en: "Stopped because the medicine was expensive or unavailable at the pharmacy.",
    hi: "दवाई महंगी होने या मेडिकल स्टोर पर न मिलने की वजह से बंद करनी पड़ी।",
  },
  clinician_advised: {
    en: "Stopped or changed on the doctor's advice.",
    hi: "डॉक्टर की सलाह से दवाई बंद या बदली गई।",
  },
  still_taking: {
    en: "Still taking this medicine.",
    hi: "यह दवाई अभी भी चल रही है।",
  },
};

const STOPPED_BY_TEMPLATES: Record<StoppedByValue, { en: string; hi: string }> = {
  self: {
    en: "Stopped by the patient.",
    hi: "मरीज़ ने खुद यह दवाई छोड़ी।",
  },
  clinician: {
    en: "Stopped by the clinician.",
    hi: "डॉक्टर ने यह दवाई बंद की।",
  },
};

const ONSET_TEMPLATES: Record<
  OnsetAfterStartingValue,
  { en: string; hi: string }
> = {
  hours: {
    en: "Began within hours of starting the medicine.",
    hi: "दवाई शुरू करने के कुछ ही घंटों में यह बदलाव दिखा।",
  },
  days_to_weeks: {
    en: "Began days to weeks after starting the medicine.",
    hi: "दवाई शुरू करने के कुछ दिनों या हफ़्तों बाद यह असर/बदलाव दिखा।",
  },
  months: {
    en: "Began months after starting the medicine.",
    hi: "दवाई शुरू करने के कुछ महीनों बाद यह बदलाव दिखा।",
  },
};

function localizeDurationToHindi(text: string): string {
  return text
    .replace(/\bmonths?\b/gi, "महीने")
    .replace(/\bweeks?\b/gi, "हफ़्ते")
    .replace(/\bdays?\b/gi, "दिन")
    .replace(/\byears?\b/gi, "साल");
}

function formatStateFallback(
  field: StructuredFieldRecord<unknown>,
  lang: "en" | "hi",
  fieldContext?: "dose" | "duration" | "general"
): string {
  if (field.state === "unknown") {
    return lang === "en"
      ? "Unknown (patient does not remember)."
      : "याद नहीं है (अज्ञात)।";
  }
  if (field.state === "uncertain") {
    if (lang === "en") {
      const opts = field.statedOptions.join(" or ");
      return `Uncertain (possibly ${opts || "unspecified"}).`;
    } else {
      const localizedOpts =
        fieldContext === "duration"
          ? field.statedOptions.map(localizeDurationToHindi)
          : field.statedOptions;
      const opts = localizedOpts.join(" या ");
      return `पक्के तौर पर याद नहीं है (संभवतः ${opts || "अनिश्चित"})।`;
    }
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

export function formatDoseSentence(
  dose: StructuredFieldRecord<string>,
  lang: "en" | "hi"
): string {
  if (dose.state === "known" && dose.value) {
    return lang === "en" ? `Dose: ${dose.value}.` : `खुराक: ${dose.value}।`;
  }
  if (dose.state === "uncertain") {
    const opts = dose.statedOptions.join(lang === "en" ? " or " : " या ");
    return lang === "en"
      ? `Dose: Uncertain (possibly ${opts}).`
      : `खुराक: पक्के तौर पर याद नहीं है (शायद ${opts} थी)।`;
  }
  if (dose.state === "unknown") {
    return lang === "en"
      ? "Dose: Unknown (patient does not remember)."
      : "खुराक: याद नहीं है (अज्ञात)।";
  }
  return lang === "en" ? "Dose: Not mentioned." : "खुराक: उल्लेख नहीं किया गया।";
}

export function formatDurationSentence(
  durationTaken: StructuredFieldRecord<string>,
  lang: "en" | "hi"
): string {
  if (durationTaken.state === "known" && durationTaken.value) {
    return lang === "en"
      ? `Duration taken: ${durationTaken.value}.`
      : `दवाई लेने की अवधि: लगभग ${localizeDurationToHindi(durationTaken.value)} तक ली गई।`;
  }
  if (durationTaken.state === "uncertain") {
    const opts =
      lang === "en"
        ? durationTaken.statedOptions.join(" or ")
        : durationTaken.statedOptions.map(localizeDurationToHindi).join(" या ");
    return lang === "en"
      ? `Duration taken: Uncertain (possibly ${opts}).`
      : `दवाई लेने की अवधि: पक्के तौर पर याद नहीं है (लगभग ${opts} तक ली थी)।`;
  }
  if (durationTaken.state === "unknown") {
    return lang === "en"
      ? "Duration taken: Unknown (patient does not remember)."
      : "दवाई लेने की अवधि: याद नहीं है (अज्ञात)।";
  }
  return lang === "en"
    ? "Duration taken: Not mentioned."
    : "दवाई लेने की अवधि: उल्लेख नहीं किया गया।";
}

export function formatOnsetSentence(
  onsetAfterStarting: StructuredFieldRecord<OnsetAfterStartingValue>,
  lang: "en" | "hi"
): string {
  if (onsetAfterStarting.state === "known" && onsetAfterStarting.value) {
    return ONSET_TEMPLATES[onsetAfterStarting.value][lang];
  }
  return lang === "en"
    ? `Onset after starting: ${formatStateFallback(onsetAfterStarting, "en")}`
    : `शुरू करने के बाद असर दिखने का समय: ${formatStateFallback(
        onsetAfterStarting,
        "hi"
      )}`;
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
      ? "Unknown (patient does not remember)"
      : "याद नहीं है (अज्ञात)"
    : med.genericName;

  if (lang === "en") {
    lines.push(
      `Medicine: ${medName} | Start date: ${med.startDate} | Stop date: ${med.stopDate}`
    );
    lines.push(formatDoseSentence(med.dose, "en"));
    lines.push(formatDurationSentence(med.durationTaken, "en"));
    lines.push(formatOnsetSentence(med.onsetAfterStarting, "en"));
    if (med.doseTimingText) {
      lines.push(`Dose timing / daily pattern: ${med.doseTimingText}.`);
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
          `Confirmed meaning for "${expr.originalPhrase}": ${expr.selectedMeaning}.`
        );
      }
    }
  } else {
    lines.push(
      `दवाई का नाम: ${medName} | शुरू की तारीख: ${med.startDate} | बंद की तारीख: ${med.stopDate}`
    );
    lines.push(formatDoseSentence(med.dose, "hi"));
    lines.push(formatDurationSentence(med.durationTaken, "hi"));
    lines.push(formatOnsetSentence(med.onsetAfterStarting, "hi"));
    if (med.doseTimingText) {
      lines.push(`दवाई लेने या असर का दैनिक समय: ${med.doseTimingText}।`);
    }
    lines.push(
      `दवाई लेने का नियम: ${formatAdherenceSentence(med.adherence, "hi")}`
    );
    lines.push(`दवाई का असर: ${formatEffectSentence(med.effect, "hi")}`);
    lines.push(
      `दुष्प्रभाव या परेशानी: ${formatSideEffectsSentence(
        med.sideEffects,
        "hi"
      )}`
    );
    lines.push(
      `दवाई बंद करने का विवरण: ${formatStoppingSentence(
        med.stoppingReason,
        med.stoppedBy,
        "hi"
      )}`
    );
    if (med.expressions.length > 0) {
      for (const expr of med.expressions) {
        lines.push(
          `आपके शब्द "${expr.originalPhrase}" का चुना गया अर्थ: ${expr.selectedMeaning}।`
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
