import {
  AdherenceValue,
  EffectValue,
  FieldStateStatus,
  OnsetAfterStartingValue,
  SideEffectsValue,
  StoppedByValue,
  StoppingReasonValue,
} from "@/lib/extraction";
import { resolvePatientMeaning } from "@/lib/lexicon";

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

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_HI = [
  "जनवरी",
  "फ़रवरी",
  "मार्च",
  "अप्रैल",
  "मई",
  "जून",
  "जुलाई",
  "अगस्त",
  "सितंबर",
  "अक्टूबर",
  "नवंबर",
  "दिसंबर",
];

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
 * Formats a date string as Month and Year (for example "जनवरी 2025" / "January 2025").
 */
export function formatMonthYearDate(
  dateStr: string | null | undefined,
  lang: "en" | "hi"
): string {
  if (isUnknownText(dateStr)) {
    return lang === "en" ? "Unknown (you do not remember)" : "आपको याद नहीं है";
  }

  const trimmed = dateStr!.trim();
  if (trimmed.toLowerCase() === "ongoing" || trimmed === "जारी है") {
    return lang === "en" ? "Ongoing" : "अभी चल रही है";
  }

  // Match YYYY-MM or YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(trimmed);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthIdx = parseInt(isoMatch[2], 10) - 1;
    if (monthIdx >= 0 && monthIdx < 12) {
      const monthName =
        lang === "en" ? MONTHS_EN[monthIdx] : MONTHS_HI[monthIdx];
      return `${monthName} ${year}`;
    }
  }

  // Match English "Month YYYY"
  const monthYearMatch = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (monthYearMatch) {
    const monthPart = monthYearMatch[1].toLowerCase();
    const year = monthYearMatch[2];
    const idx = MONTHS_EN.findIndex((m) => m.toLowerCase() === monthPart);
    if (idx >= 0) {
      const monthName = lang === "en" ? MONTHS_EN[idx] : MONTHS_HI[idx];
      return `${monthName} ${year}`;
    }
  }

  return trimmed;
}

/**
 * Computes every `unknown` and `not_mentioned` field for a medication period,
 * labelling `unknown` and `not_mentioned` distinctly in the timeline "Gaps" section.
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
        labelEn: `${nameEn}: Unknown (not remembered)`,
        labelHi: `${nameHi}: आपको याद नहीं है`,
      });
    } else if (state === "not_mentioned") {
      gaps.push({
        fieldKey,
        gapType: "not_mentioned",
        labelEn: `${nameEn}: Not mentioned`,
        labelHi: `${nameHi}: आपने इसका ज़िक्र नहीं किया`,
      });
    }
  };

  if (isUnknownText(med.genericName)) {
    gaps.push({
      fieldKey: "genericName",
      gapType: "unknown",
      labelEn: "Medicine name: Unknown (not remembered)",
      labelHi: "दवाई का नाम: आपको याद नहीं है",
    });
  }
  if (isUnknownText(med.startDate)) {
    gaps.push({
      fieldKey: "startDate",
      gapType: "unknown",
      labelEn: "Start date: Unknown (not remembered)",
      labelHi: "शुरू करने का समय: आपको याद नहीं है",
    });
  }
  if (isUnknownText(med.stopDate)) {
    gaps.push({
      fieldKey: "stopDate",
      gapType: "unknown",
      labelEn: "Stop date: Unknown (not remembered)",
      labelHi: "बंद करने का समय: आपको याद नहीं है",
    });
  }

  checkField("dose", "Dose", "खुराक", med.dose.state);
  checkField(
    "durationTaken",
    "Duration taken",
    "कितने समय तक ली",
    med.durationTaken.state
  );
  checkField(
    "adherence",
    "Adherence",
    "दवाई कैसे ली",
    med.adherence.state
  );
  checkField("effect", "Effect", "दवाई का असर", med.effect.state);
  checkField(
    "sideEffects",
    "Side effects",
    "परेशानी या साइड इफेक्ट",
    med.sideEffects.state
  );
  checkField(
    "onsetAfterStarting",
    "Onset after starting",
    "असर या परेशानी कब शुरू हुई",
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
    en: "You took the medicine regularly as prescribed.",
    hi: "आपने दवाई डॉक्टर के बताए अनुसार नियमित रूप से ली।",
  },
  mostly_taken_occasional_missed: {
    en: "You mostly took the medicine as prescribed, with occasional missed doses.",
    hi: "आपने दवाई अधिकतर समय पर ली, बस कभी-कभी खुराक छूट गई।",
  },
  irregular_or_frequently_missed: {
    en: "You took the medicine irregularly, or missed doses frequently.",
    hi: "आपने दवाई अनियमित रूप से ली या कई बार खुराक छूट गई।",
  },
  not_taken: {
    en: "You did not take this medicine.",
    hi: "आपने यह दवाई नहीं ली।",
  },
};

const EFFECT_TEMPLATES: Record<EffectValue, { en: string; hi: string }> = {
  helped_significantly: {
    en: "You felt the medicine helped significantly.",
    hi: "इस दवाई से आपको काफी आराम मिला।",
  },
  helped_partially: {
    en: "You felt the medicine helped partially.",
    hi: "इस दवाई से आपको थोड़ा आराम मिला।",
  },
  helped_degree_not_stated: {
    en: "You felt the medicine helped (you did not mention how much).",
    hi: "इस दवाई से आपको आराम मिला (कितना फर्क पड़ा, यह आपने नहीं बताया)।",
  },
  no_benefit: {
    en: "You did not notice any benefit from the medicine.",
    hi: "इस दवाई से आपको कोई खास फायदा महसूस नहीं हुआ।",
  },
  worsened_or_unpleasant: {
    en: "You felt worse or unpleasant while taking the medicine.",
    hi: "दवाई लेने के दौरान आपको तबीयत या मन और उदास या असहज लगा।",
  },
};

const SIDE_EFFECTS_TEMPLATES: Record<
  SideEffectsValue,
  { en: string; hi: string }
> = {
  present: {
    en: "You experienced side effects or discomfort while taking the medicine.",
    hi: "दवाई लेते समय आपको शरीर या मन में परेशानी महसूस हुई।",
  },
  none: {
    en: "You did not experience any side effects.",
    hi: "इस दवाई से आपको कोई परेशानी या साइड इफेक्ट नहीं हुआ।",
  },
};

const STOPPING_REASON_TEMPLATES: Record<
  StoppingReasonValue,
  { en: string; hi: string }
> = {
  side_effects_or_discomfort: {
    en: "You stopped because of side effects or discomfort.",
    hi: "परेशानी या साइड इफेक्ट होने की वजह से आपने दवाई बंद कर दी।",
  },
  lack_of_effect: {
    en: "You stopped because the medicine did not seem to help.",
    hi: "फायदा न लगने की वजह से आपने दवाई बंद कर दी।",
  },
  felt_better: {
    en: "You stopped after feeling better.",
    hi: "तबीयत ठीक लगने के बाद आपने दवाई बंद कर दी।",
  },
  cost_or_availability: {
    en: "You had to stop because the medicine was expensive or unavailable at the pharmacy.",
    hi: "दवाई महंगी होने या मेडिकल स्टोर पर न मिलने की वजह से आपको यह बंद करनी पड़ी।",
  },
  clinician_advised: {
    en: "Stopped or changed on your doctor's advice.",
    hi: "डॉक्टर की सलाह पर आपने दवाई बंद की या बदली।",
  },
  still_taking: {
    en: "You are still taking this medicine.",
    hi: "आप यह दवाई अभी भी ले रहे हैं।",
  },
};

const STOPPED_BY_TEMPLATES: Record<StoppedByValue, { en: string; hi: string }> = {
  self: {
    en: "You stopped this medicine yourself.",
    hi: "आपने खुद यह दवाई छोड़ी।",
  },
  clinician: {
    en: "Your doctor stopped this medicine.",
    hi: "डॉक्टर ने यह दवाई बंद कराई।",
  },
};

const ONSET_TEMPLATES: Record<
  OnsetAfterStartingValue,
  { en: string; hi: string }
> = {
  hours: {
    en: "Within hours of starting the medicine.",
    hi: "दवाई शुरू करने के कुछ ही घंटों में आपको यह बदलाव महसूस हुआ।",
  },
  days_to_weeks: {
    en: "Days to weeks after starting the medicine.",
    hi: "दवाई शुरू करने के कुछ दिनों या हफ़्तों बाद आपको यह बदलाव महसूस हुआ।",
  },
  months: {
    en: "Months after starting the medicine.",
    hi: "दवाई शुरू करने के कुछ महीनों बाद आपको यह बदलाव महसूस हुआ।",
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
      ? "You do not remember."
      : "आपको याद नहीं है।";
  }
  if (field.state === "uncertain") {
    if (lang === "en") {
      const opts = field.statedOptions.join(" or ");
      return `You were not sure (possibly ${opts || "unspecified"}).`;
    } else {
      const localizedOpts =
        fieldContext === "duration"
          ? field.statedOptions.map(localizeDurationToHindi)
          : field.statedOptions;
      const opts = localizedOpts.join(" या ");
      return `आपको पक्का याद नहीं है (शायद ${opts || "अनिश्चित"})।`;
    }
  }
  return lang === "en"
    ? "You did not mention this."
    : "आपने इसका ज़िक्र नहीं किया।";
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
    return lang === "en"
      ? `Dose: You took ${dose.value}.`
      : `खुराक: आपने ${dose.value} ली।`;
  }
  if (dose.state === "uncertain") {
    const opts = dose.statedOptions.join(lang === "en" ? " or " : " या ");
    return lang === "en"
      ? `Dose: You were not sure (possibly ${opts}).`
      : `खुराक: आपको पक्का याद नहीं है (शायद ${opts} थी)।`;
  }
  if (dose.state === "unknown") {
    return lang === "en"
      ? "Dose: You do not remember."
      : "खुराक: आपको याद नहीं है।";
  }
  return lang === "en"
    ? "Dose: You did not mention this."
    : "खुराक: आपने इसका ज़िक्र नहीं किया।";
}

export function formatDurationSentence(
  durationTaken: StructuredFieldRecord<string>,
  lang: "en" | "hi"
): string {
  if (durationTaken.state === "known" && durationTaken.value) {
    return lang === "en"
      ? `Duration taken: You took it for ${durationTaken.value}.`
      : `कितने समय तक ली: आपने यह दवाई ${localizeDurationToHindi(durationTaken.value)} तक ली।`;
  }
  if (durationTaken.state === "uncertain") {
    const opts =
      lang === "en"
        ? durationTaken.statedOptions.join(" or ")
        : durationTaken.statedOptions.map(localizeDurationToHindi).join(" या ");
    return lang === "en"
      ? `Duration taken: You were not sure (possibly ${opts}).`
      : `कितने समय तक ली: आपको पक्का याद नहीं है (शायद ${opts} तक ली थी)।`;
  }
  if (durationTaken.state === "unknown") {
    return lang === "en"
      ? "Duration taken: You do not remember."
      : "कितने समय तक ली: आपको याद नहीं है।";
  }
  return lang === "en"
    ? "Duration taken: You did not mention this."
    : "कितने समय तक ली: आपने इसका ज़िक्र नहीं किया।";
}

export function formatOnsetSentence(
  onsetAfterStarting: StructuredFieldRecord<OnsetAfterStartingValue>,
  lang: "en" | "hi"
): string {
  if (onsetAfterStarting.state === "known" && onsetAfterStarting.value) {
    return lang === "en"
      ? `When effects/side effects started: ${ONSET_TEMPLATES[onsetAfterStarting.value].en}`
      : `असर या परेशानी कब शुरू हुई: ${ONSET_TEMPLATES[onsetAfterStarting.value].hi}`;
  }
  return lang === "en"
    ? `When effects/side effects started: ${formatStateFallback(onsetAfterStarting, "en")}`
    : `असर या परेशानी कब शुरू हुई: ${formatStateFallback(
        onsetAfterStarting,
        "hi"
      )}`;
}

/**
 * Deterministic read-back summary built purely in code from the stored
 * structured fields and plain-language meanings using fixed sentence templates
 * in Hindi and English (never free-text LLM output).
 * - Uses second person ("आपने" / "आपको" in Hindi, "You" in English).
 * - Uses `meaningHi` in the Hindi read-back and plain-language `meaningEn` in the English read-back.
 * - Shows dates as Month and Year (e.g. "जनवरी 2025" / "January 2025").
 */
export function buildReadBackSummary(
  med: TimelineMedicationRecord,
  lang: "en" | "hi"
): string[] {
  const lines: string[] = [];

  const medName = isUnknownText(med.genericName)
    ? lang === "en"
      ? "Unknown (you do not remember)"
      : "आपको नाम याद नहीं है"
    : med.genericName;

  const formattedStart = formatMonthYearDate(med.startDate, lang);
  const formattedStop = formatMonthYearDate(med.stopDate, lang);

  if (lang === "en") {
    lines.push(
      `Medicine: ${medName} | Start date: ${formattedStart} | Stop date: ${formattedStop}`
    );
    lines.push(formatDoseSentence(med.dose, "en"));
    lines.push(formatDurationSentence(med.durationTaken, "en"));
    lines.push(formatOnsetSentence(med.onsetAfterStarting, "en"));
    if (med.doseTimingText) {
      lines.push(`Dose timing / daily pattern: ${med.doseTimingText}.`);
    }
    lines.push(`How you took it: ${formatAdherenceSentence(med.adherence, "en")}`);
    lines.push(`How it helped: ${formatEffectSentence(med.effect, "en")}`);
    lines.push(
      `Side effects or discomfort: ${formatSideEffectsSentence(med.sideEffects, "en")}`
    );
    lines.push(
      `Stopping details: ${formatStoppingSentence(
        med.stoppingReason,
        med.stoppedBy,
        "en"
      )}`
    );
    if (med.expressions.length > 0) {
      for (const expr of med.expressions) {
        const plainMeaningEn = resolvePatientMeaning(
          expr.selectedMeaning,
          "en",
          expr.matchedLexiconTerm
        );
        lines.push(
          `What you meant by "${expr.originalPhrase}": ${plainMeaningEn}.`
        );
      }
    }
  } else {
    lines.push(
      `दवाई का नाम: ${medName} | शुरू करने का समय: ${formattedStart} | बंद करने का समय: ${formattedStop}`
    );
    lines.push(formatDoseSentence(med.dose, "hi"));
    lines.push(formatDurationSentence(med.durationTaken, "hi"));
    lines.push(formatOnsetSentence(med.onsetAfterStarting, "hi"));
    if (med.doseTimingText) {
      lines.push(`दवाई लेने या असर का समय: ${med.doseTimingText}।`);
    }
    lines.push(
      `आपने दवाई कैसे ली: ${formatAdherenceSentence(med.adherence, "hi")}`
    );
    lines.push(`दवाई का असर: ${formatEffectSentence(med.effect, "hi")}`);
    lines.push(
      `परेशानी या साइड इफेक्ट: ${formatSideEffectsSentence(
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
        const plainMeaningHi = resolvePatientMeaning(
          expr.selectedMeaning,
          "hi",
          expr.matchedLexiconTerm
        );
        lines.push(
          `आपके शब्द "${expr.originalPhrase}" का अर्थ: ${plainMeaningHi}।`
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
