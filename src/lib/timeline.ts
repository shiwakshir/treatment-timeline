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
  dose: string;
  startDate: string;
  stopDate: string;
  adherenceRaw: string;
  adherenceSummaryEn: string;
  adherenceSummaryHi: string;
  adherenceUnknown: boolean;
  effectRaw: string;
  effectSummaryEn: string;
  effectSummaryHi: string;
  effectUnknown: boolean;
  sideEffectsRaw: string;
  sideEffectsSummaryEn: string;
  sideEffectsSummaryHi: string;
  sideEffectsUnknown: boolean;
  stoppingReasonRaw: string;
  stoppingReasonSummaryEn: string;
  stoppingReasonSummaryHi: string;
  stoppingReasonUnknown: boolean;
  confirmedAt: string | Date | null;
  expressions: TimelineExpressionView[];
}

export interface GapItem {
  fieldKey: string;
  labelEn: string;
  labelHi: string;
}

export function isUnknownValue(value: string | null | undefined): boolean {
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
 * Computes every unknown/missing field for a medication period so it can be
 * explicitly surfaced in the card's "Gaps" section, never guessed.
 */
export function computeMedicationGaps(
  med: TimelineMedicationRecord
): GapItem[] {
  const gaps: GapItem[] = [];

  if (isUnknownValue(med.genericName)) {
    gaps.push({
      fieldKey: "genericName",
      labelEn: "Medicine name (unknown)",
      labelHi: "दवाई का नाम (अज्ञात)",
    });
  }
  if (isUnknownValue(med.dose)) {
    gaps.push({
      fieldKey: "dose",
      labelEn: "Dose (unknown)",
      labelHi: "खुराक / डोज़ (अज्ञात)",
    });
  }
  if (isUnknownValue(med.startDate)) {
    gaps.push({
      fieldKey: "startDate",
      labelEn: "Start date (unknown)",
      labelHi: "शुरू करने की तारीख (अज्ञात)",
    });
  }
  if (isUnknownValue(med.stopDate)) {
    gaps.push({
      fieldKey: "stopDate",
      labelEn: "Stop date (unknown)",
      labelHi: "बंद करने की तारीख (अज्ञात)",
    });
  }
  if (med.adherenceUnknown || isUnknownValue(med.adherenceRaw)) {
    gaps.push({
      fieldKey: "adherence",
      labelEn: "Whether taken as prescribed (unknown)",
      labelHi: "दवाई कैसे ली गई (अज्ञात)",
    });
  }
  if (med.effectUnknown || isUnknownValue(med.effectRaw)) {
    gaps.push({
      fieldKey: "effect",
      labelEn: "Effect / whether it helped (unknown)",
      labelHi: "दवाई का असर (अज्ञात)",
    });
  }
  if (med.sideEffectsUnknown || isUnknownValue(med.sideEffectsRaw)) {
    gaps.push({
      fieldKey: "sideEffects",
      labelEn: "Side effects or problems (unknown)",
      labelHi: "दुष्प्रभाव या परेशानी (अज्ञात)",
    });
  }
  if (med.stoppingReasonUnknown || isUnknownValue(med.stoppingReasonRaw)) {
    gaps.push({
      fieldKey: "stoppingReason",
      labelEn: "Reason for stopping (unknown)",
      labelHi: "बंद करने की वजह (अज्ञात)",
    });
  }

  return gaps;
}

/**
 * Sorts medication periods in chronological order by startDate.
 * Periods with "unknown" start dates are placed first with an explicit gap indicator
 * so clinicians immediately see unanchored historical periods.
 */
export function sortMedicationsByDate(
  meds: TimelineMedicationRecord[]
): TimelineMedicationRecord[] {
  return [...meds].sort((a, b) => {
    const aUnknown = isUnknownValue(a.startDate);
    const bUnknown = isUnknownValue(b.startDate);

    if (aUnknown && bUnknown) return 0;
    if (aUnknown) return -1;
    if (bUnknown) return 1;

    return a.startDate.localeCompare(b.startDate);
  });
}
