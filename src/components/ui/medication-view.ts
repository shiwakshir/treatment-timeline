import {
  computeMedicationGaps,
  formatAdherenceSentence,
  formatDoseSentence,
  formatDurationSentence,
  formatEffectSentence,
  formatMonthYearDate,
  formatOnsetSentence,
  formatSideEffectsSentence,
  formatStoppingSentence,
  isUnknownText,
  type StructuredFieldRecord,
  type TimelineExpressionView,
  type TimelineMedicationRecord,
} from "@/lib/timeline";
import { type Lang, type TKey } from "./i18n";

export interface DisplayRow {
  key: string;
  label: TKey;
  text: string;
  uncertain: boolean;
  rawWords?: string;
  expressions: TimelineExpressionView[];
}

function stripLeadingPrefix(sentence: string): string {
  const idx = sentence.indexOf(": ");
  return idx >= 0 ? sentence.slice(idx + 2) : sentence;
}

function hasValue(f: StructuredFieldRecord<unknown>): boolean {
  return f.state === "known" || f.state === "uncertain";
}

export function buildMedicationDisplay(
  med: TimelineMedicationRecord,
  lang: Lang
): {
  rows: DisplayRow[];
  unknownFieldNames: string[];
  notMentionedFieldNames: string[];
} {
  const rows: DisplayRow[] = [];

  if (hasValue(med.dose)) {
    rows.push({
      key: "dose",
      label: "dose",
      text: stripLeadingPrefix(formatDoseSentence(med.dose, lang)),
      uncertain: med.dose.state === "uncertain",
      expressions: [],
    });
  }

  if (!isUnknownText(med.startDate)) {
    rows.push({
      key: "startMonth",
      label: "startMonth",
      text: formatMonthYearDate(med.startDate, lang),
      uncertain: med.startDate.includes(" or ") || med.startDate.includes(" या "),
      expressions: [],
    });
  }

  if (!isUnknownText(med.stopDate)) {
    rows.push({
      key: "stopMonth",
      label: "stopMonth",
      text: formatMonthYearDate(med.stopDate, lang),
      uncertain: med.stopDate.includes(" or ") || med.stopDate.includes(" या "),
      expressions: [],
    });
  }

  if (hasValue(med.durationTaken)) {
    rows.push({
      key: "durationTaken",
      label: "duration",
      text: stripLeadingPrefix(formatDurationSentence(med.durationTaken, lang)),
      uncertain: med.durationTaken.state === "uncertain",
      expressions: [],
    });
  }

  if (med.doseTimingText) {
    rows.push({
      key: "doseTiming",
      label: "whenTaken",
      text: med.doseTimingText,
      uncertain: false,
      expressions: [],
    });
  }

  if (med.symptomTimingText) {
    rows.push({
      key: "symptomTiming",
      label: "whenProblems",
      text: med.symptomTimingText,
      uncertain: false,
      expressions: [],
    });
  }

  if (hasValue(med.onsetAfterStarting)) {
    rows.push({
      key: "onsetAfterStarting",
      label: "onset",
      text: stripLeadingPrefix(formatOnsetSentence(med.onsetAfterStarting, lang)),
      uncertain: med.onsetAfterStarting.state === "uncertain",
      expressions: [],
    });
  }

  if (hasValue(med.adherence)) {
    rows.push({
      key: "adherence",
      label: "adherence",
      text: formatAdherenceSentence(med.adherence, lang),
      uncertain: med.adherence.state === "uncertain",
      rawWords: med.adherenceRaw || undefined,
      expressions: med.expressions.filter(
        (e) => e.questionCategory === "adherence"
      ),
    });
  }

  if (hasValue(med.effect)) {
    rows.push({
      key: "effect",
      label: "effect",
      text: formatEffectSentence(med.effect, lang),
      uncertain: med.effect.state === "uncertain",
      rawWords: med.effectRaw || undefined,
      expressions: med.expressions.filter(
        (e) => e.questionCategory === "effect"
      ),
    });
  }

  if (hasValue(med.sideEffects)) {
    rows.push({
      key: "sideEffects",
      label: "sideEffects",
      text: formatSideEffectsSentence(med.sideEffects, lang),
      uncertain: med.sideEffects.state === "uncertain",
      rawWords: med.sideEffectsRaw || undefined,
      expressions: med.expressions.filter(
        (e) => e.questionCategory === "side_effects"
      ),
    });
  }

  if (hasValue(med.stoppingReason)) {
    rows.push({
      key: "stoppingReason",
      label: "stoppingReason",
      text: formatStoppingSentence(
        med.stoppingReason,
        { state: "not_mentioned", value: null, statedOptions: [] },
        lang
      ),
      uncertain: med.stoppingReason.state === "uncertain",
      rawWords: med.stoppingReasonRaw || undefined,
      expressions: med.expressions.filter(
        (e) => e.questionCategory === "stopping_reason"
      ),
    });
  }

  if (hasValue(med.stoppedBy)) {
    const stoppedByText =
      med.stoppedBy.state === "known" && med.stoppedBy.value
        ? med.stoppedBy.value === "self"
          ? lang === "hi"
            ? "आपने खुद यह दवाई छोड़ी।"
            : "You stopped this medicine yourself."
          : lang === "hi"
          ? "डॉक्टर ने यह दवाई बंद कराई।"
          : "Your doctor stopped this medicine."
        : med.stoppedBy.statedOptions.join(lang === "hi" ? " या " : " or ") + "?";
    rows.push({
      key: "stoppedBy",
      label: "stoppedBy",
      text: stoppedByText,
      uncertain: med.stoppedBy.state === "uncertain",
      expressions: [],
    });
  }

  const gaps = computeMedicationGaps(med);
  const stripGapSuffix = (s: string) => {
    const colonIdx = s.indexOf(":");
    return colonIdx >= 0 ? s.slice(0, colonIdx).trim() : s;
  };

  const unknownFieldNames = gaps
    .filter((g) => g.gapType === "unknown")
    .map((g) => stripGapSuffix(lang === "hi" ? g.labelHi : g.labelEn));

  const notMentionedFieldNames = gaps
    .filter((g) => g.gapType === "not_mentioned")
    .map((g) => stripGapSuffix(lang === "hi" ? g.labelHi : g.labelEn));

  return { rows, unknownFieldNames, notMentionedFieldNames };
}
