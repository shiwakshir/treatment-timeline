"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { INTERVIEW_QUESTIONS } from "@/lib/interview";
import { resolvePatientMeaning } from "@/lib/lexicon";
import { SAFETY_HELPLINES, type CountryHelplines } from "@/config/safety-helplines";
import {
  buildReadBackSummary,
  isUnknownText,
  type StructuredFieldRecord,
  type TimelineExpressionView,
  type TimelineMedicationRecord,
} from "@/lib/timeline";
import {
  type AdherenceValue,
  type EffectValue,
  type ExtractionOutput,
  type OnsetAfterStartingValue,
  type SideEffectsValue,
  type StoppedByValue,
  type StoppingReasonValue,
} from "@/lib/extraction";
import { useLang, useT } from "@/components/ui/i18n";
import { ScreenTitle } from "@/components/ui/screen-shell";
import { StatusOverlay, type StatusKind } from "@/components/ui/status-overlay";
import { Helplines } from "@/components/ui/helplines";
import { buildMedicationDisplay } from "@/components/ui/medication-view";

type UrgentSafetyCategory =
  | "self_harm_or_suicide"
  | "severe_physical_reaction"
  | "both"
  | null;

function emptyField<T = string>(): StructuredFieldRecord<T> {
  return { state: "not_mentioned", value: null, statedOptions: [] };
}

function mergeField<T>(
  current: StructuredFieldRecord<T>,
  incoming: {
    state: StructuredFieldRecord<T>["state"];
    value?: T | null;
    statedOptions?: string[];
  }
): StructuredFieldRecord<T> {
  if (incoming.state !== "not_mentioned") {
    return {
      state: incoming.state,
      value: incoming.value ?? null,
      statedOptions: incoming.statedOptions ?? [],
    };
  }
  return current;
}

type EntryMode = "value" | "unknown" | "uncertain";
interface EntryDraft {
  mode: EntryMode;
  value: string;
  options: string[];
}

function draftToField(d: EntryDraft): StructuredFieldRecord<string> {
  if (d.mode === "unknown") {
    return { state: "unknown", value: null, statedOptions: [] };
  }
  if (d.mode === "uncertain") {
    const opts = d.options.map((o) => o.trim()).filter(Boolean);
    return opts.length > 0
      ? { state: "uncertain", value: null, statedOptions: opts }
      : { state: "not_mentioned", value: null, statedOptions: [] };
  }
  return d.value.trim()
    ? { state: "known", value: d.value.trim(), statedOptions: [] }
    : { state: "not_mentioned", value: null, statedOptions: [] };
}

function draftToString(d: EntryDraft): string {
  if (d.mode === "unknown") return "unknown";
  if (d.mode === "uncertain") {
    const opts = d.options.map((o) => o.trim()).filter(Boolean);
    return opts.length > 0 ? opts.join(" or ") : "unknown";
  }
  return d.value.trim() || "unknown";
}

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const { lang } = useLang();

  const [patients, setPatients] = useState<
    { id: string; displayName: string }[]
  >([]);
  const [patientId, setPatientId] = useState<string>(
    searchParams.get("patientId") || ""
  );

  // Stage: "entry" | "question" | "disambiguate" | "readback" | "urgent_help" | "fail_safe"
  const [stage, setStage] = useState<
    | "entry"
    | "question"
    | "disambiguate"
    | "readback"
    | "urgent_help"
    | "fail_safe"
  >("entry");

  // Step 0: Medication entry drafts (supporting known, unknown, and uncertain)
  const [entryDrafts, setEntryDrafts] = useState<{
    genericName: EntryDraft;
    dose: EntryDraft;
    startMonth: EntryDraft;
    stopMonth: EntryDraft;
  }>({
    genericName: { mode: "value", value: "", options: ["", ""] },
    dose: { mode: "value", value: "", options: ["", ""] },
    startMonth: { mode: "value", value: "", options: ["", ""] },
    stopMonth: { mode: "value", value: "", options: ["", ""] },
  });

  const updateDraft = (
    key: keyof typeof entryDrafts,
    patch: Partial<EntryDraft>
  ) => {
    setEntryDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  // Guided interview state (Steps 0..3 corresponding to INTERVIEW_QUESTIONS)
  const [questionIdx, setQuestionIdx] = useState<number>(0);
  const [answersByCategory, setAnswersByCategory] = useState<
    Record<string, string>
  >({});
  const [currentAnswer, setCurrentAnswer] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [overlayStatus, setOverlayStatus] = useState<StatusKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Accumulated structured medication period state
  const [adherenceRaw, setAdherenceRaw] = useState<string>("");
  const [effectRaw, setEffectRaw] = useState<string>("");
  const [sideEffectsRaw, setSideEffectsRaw] = useState<string>("");
  const [stoppingReasonRaw, setStoppingReasonRaw] = useState<string>("");

  const [adherenceField, setAdherenceField] = useState<
    StructuredFieldRecord<AdherenceValue>
  >(emptyField());
  const [effectField, setEffectField] = useState<
    StructuredFieldRecord<EffectValue>
  >(emptyField());
  const [sideEffectsField, setSideEffectsField] = useState<
    StructuredFieldRecord<SideEffectsValue>
  >(emptyField());
  const [stoppingReasonField, setStoppingReasonField] = useState<
    StructuredFieldRecord<StoppingReasonValue>
  >(emptyField());
  const [stoppedByField, setStoppedByField] = useState<
    StructuredFieldRecord<StoppedByValue>
  >(emptyField());
  const [doseField, setDoseField] = useState<StructuredFieldRecord<string>>(
    emptyField()
  );
  const [durationTakenField, setDurationTakenField] = useState<
    StructuredFieldRecord<string>
  >(emptyField());
  const [onsetField, setOnsetField] = useState<
    StructuredFieldRecord<OnsetAfterStartingValue>
  >(emptyField());
  const [doseTimingText, setDoseTimingText] = useState<string | null>(null);
  const [symptomTimingText, setSymptomTimingText] = useState<string | null>(
    null
  );

  const [confirmedExpressions, setConfirmedExpressions] = useState<
    TimelineExpressionView[]
  >([]);

  // Pending multi-meaning expressions requiring user choice
  const [pendingExpressions, setPendingExpressions] = useState<
    TimelineExpressionView[]
  >([]);
  const [pendingIdx, setPendingIdx] = useState<number>(0);
  const [explainingOwn, setExplainingOwn] = useState<boolean>(false);
  const [ownExplanation, setOwnExplanation] = useState<string>("");

  // Safety & Fail-Safe state
  const [helplines, setHelplines] =
    useState<CountryHelplines[]>(SAFETY_HELPLINES);
  const [safetyCategory, setSafetyCategory] =
    useState<UrgentSafetyCategory>(null);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => r.json())
      .then((data) => {
        if (data.patients && data.patients.length > 0) {
          setPatients(data.patients);
          if (!patientId) {
            setPatientId(data.patients[0].id);
          }
        }
      })
      .catch(() => undefined);
  }, [patientId]);

  const currentPatient = patients.find((p) => p.id === patientId);
  const patientName = currentPatient?.displayName || "";

  function startGuidedInterview(e: React.FormEvent) {
    e.preventDefault();
    setDoseField(draftToField(entryDrafts.dose));
    setQuestionIdx(0);
    const firstCat = INTERVIEW_QUESTIONS[0].category;
    setCurrentAnswer(answersByCategory[firstCat] ?? "");
    setStage("question");
  }

  /**
   * Skip this question without calling /api/interview/analyze.
   * Sets the field for this question to `not_mentioned` and moves to the next question.
   */
  function handleSkipQuestion() {
    const currentQ = INTERVIEW_QUESTIONS[questionIdx];
    setAnswersByCategory((prev) => ({ ...prev, [currentQ.category]: "" }));
    if (currentQ.category === "adherence") {
      setAdherenceRaw("");
      setAdherenceField(emptyField());
    } else if (currentQ.category === "effect") {
      setEffectRaw("");
      setEffectField(emptyField());
    } else if (currentQ.category === "side_effects") {
      setSideEffectsRaw("");
      setSideEffectsField(emptyField());
    } else if (currentQ.category === "stopping_reason") {
      setStoppingReasonRaw("");
      setStoppingReasonField(emptyField());
      setStoppedByField(emptyField());
    }
    advanceToNextStep();
  }

  function handleBackFromQuestion() {
    const currentQ = INTERVIEW_QUESTIONS[questionIdx];
    setAnswersByCategory((prev) => ({
      ...prev,
      [currentQ.category]: currentAnswer,
    }));
    if (questionIdx === 0) {
      setStage("entry");
    } else {
      const prevIdx = questionIdx - 1;
      const prevCat = INTERVIEW_QUESTIONS[prevIdx].category;
      setQuestionIdx(prevIdx);
      setCurrentAnswer(answersByCategory[prevCat] ?? "");
    }
  }

  async function handleAnswerSubmit(
    simulateFailure?: "TIMEOUT" | "INVALID_JSON" | null
  ) {
    if (!currentAnswer.trim()) return;
    setSubmitting(true);
    setOverlayStatus("loading");
    setErrorMsg(null);

    const currentQ = INTERVIEW_QUESTIONS[questionIdx];

    try {
      const res = await fetch("/api/interview/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answerText: currentAnswer,
          questionCategory: currentQ.category,
          simulateClassifierFailure: simulateFailure ?? null,
        }),
      });

      const data = await res.json();

      if (data.status === "urgent") {
        // Urgent safety trigger: stop interview immediately, save nothing from that answer
        setCurrentAnswer("");
        setAnswersByCategory((prev) => ({ ...prev, [currentQ.category]: "" }));
        setHelplines(data.helplines || SAFETY_HELPLINES);
        setSafetyCategory(data.safetyCategory ?? null);
        setOverlayStatus(null);
        setSubmitting(false);
        setStage("urgent_help");
        return;
      }

      if (data.status === "fail_safe") {
        // Classifier technical failure after retries: pause interview, keep user's words, do not extract
        setHelplines(data.helplines || SAFETY_HELPLINES);
        setOverlayStatus(null);
        setSubmitting(false);
        setStage("fail_safe");
        return;
      }

      if (data.status !== "safe" || !data.extraction) {
        setErrorMsg(data.error || "Extraction failed. Please retry.");
        setOverlayStatus(null);
        setSubmitting(false);
        return;
      }

      const ext = data.extraction as ExtractionOutput;

      setAnswersByCategory((prev) => ({
        ...prev,
        [currentQ.category]: currentAnswer,
      }));

      // Save raw text for this question step
      if (currentQ.category === "adherence") setAdherenceRaw(currentAnswer);
      if (currentQ.category === "effect") setEffectRaw(currentAnswer);
      if (currentQ.category === "side_effects") setSideEffectsRaw(currentAnswer);
      if (currentQ.category === "stopping_reason")
        setStoppingReasonRaw(currentAnswer);

      // Merge extracted field states
      setAdherenceField((prev) => mergeField(prev, ext.adherence));
      setEffectField((prev) => mergeField(prev, ext.effect));
      setSideEffectsField((prev) => mergeField(prev, ext.sideEffects));
      setStoppingReasonField((prev) => mergeField(prev, ext.stoppingReason));
      setStoppedByField((prev) => mergeField(prev, ext.stoppedBy));
      setDoseField((prev) => mergeField(prev, ext.dose));
      setDurationTakenField((prev) => mergeField(prev, ext.durationTaken));
      setOnsetField((prev) => mergeField(prev, ext.onsetAfterStarting));
      if (ext.doseTimingText) {
        setDoseTimingText((prev) =>
          prev ? `${prev}; ${ext.doseTimingText}` : ext.doseTimingText
        );
      }
      if (ext.symptomTimingText) {
        setSymptomTimingText((prev) =>
          prev ? `${prev}; ${ext.symptomTimingText}` : ext.symptomTimingText
        );
      }

      const mappedExprs: TimelineExpressionView[] = ext.expressions.map(
        (item, idx) => ({
          id: `${currentQ.category}-${idx}-${Date.now()}`,
          questionCategory: currentQ.category,
          originalPhrase: item.originalPhrase,
          candidateMeanings: item.candidateMeanings,
          selectedMeaning: item.candidateMeanings[0] ?? item.originalPhrase,
          confidence: item.confidence,
          matchedLexiconTerm: item.matchedLexiconTerm,
        })
      );

      const multiMeaning = mappedExprs.filter(
        (item) => item.candidateMeanings.length > 1
      );
      const singleMeaning = mappedExprs.filter(
        (item) => item.candidateMeanings.length <= 1
      );

      if (singleMeaning.length > 0) {
        setConfirmedExpressions((prev) => [...prev, ...singleMeaning]);
      }

      setOverlayStatus(null);
      setSubmitting(false);

      if (multiMeaning.length > 0) {
        setPendingExpressions(multiMeaning);
        setPendingIdx(0);
        setExplainingOwn(false);
        setOwnExplanation("");
        setStage("disambiguate");
      } else {
        advanceToNextStep();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
      setOverlayStatus(null);
      setSubmitting(false);
    }
  }

  function advanceToNextStep() {
    if (questionIdx + 1 < INTERVIEW_QUESTIONS.length) {
      const nextIdx = questionIdx + 1;
      const nextCat = INTERVIEW_QUESTIONS[nextIdx].category;
      setQuestionIdx(nextIdx);
      setCurrentAnswer(answersByCategory[nextCat] ?? "");
      setStage("question");
    } else {
      setCurrentAnswer("");
      setStage("readback");
    }
  }

  function handleSelectMeaning(selectedMeaning: string, confidence: string) {
    const currentExpr = pendingExpressions[pendingIdx];
    const updated: TimelineExpressionView = {
      ...currentExpr,
      selectedMeaning,
      confidence,
    };
    setConfirmedExpressions((prev) => [...prev, updated]);
    setExplainingOwn(false);
    setOwnExplanation("");

    setOverlayStatus("confirmed");
    setTimeout(() => {
      setOverlayStatus(null);
      if (pendingIdx + 1 < pendingExpressions.length) {
        setPendingIdx(pendingIdx + 1);
      } else {
        setPendingExpressions([]);
        setPendingIdx(0);
        advanceToNextStep();
      }
    }, 800);
  }

  const draftRecord: TimelineMedicationRecord = {
    id: "draft",
    genericName: draftToString(entryDrafts.genericName),
    startDate: draftToString(entryDrafts.startMonth),
    stopDate: draftToString(entryDrafts.stopMonth),
    dose: doseField,
    durationTaken: durationTakenField,
    onsetAfterStarting: onsetField,
    doseTimingText,
    symptomTimingText,
    adherenceRaw,
    adherence: adherenceField,
    effectRaw,
    effect: effectField,
    sideEffectsRaw,
    sideEffects: sideEffectsField,
    stoppingReasonRaw,
    stoppingReason: stoppingReasonField,
    stoppedBy: stoppedByField,
    confirmedAt: null,
    expressions: confirmedExpressions,
  };

  async function handleConfirmAndSave() {
    setSubmitting(true);
    setOverlayStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/medications/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          genericName: draftRecord.genericName,
          startDate: draftRecord.startDate,
          stopDate: draftRecord.stopDate,
          dose: draftRecord.dose,
          durationTaken: draftRecord.durationTaken,
          onsetAfterStarting: draftRecord.onsetAfterStarting,
          doseTimingText: draftRecord.doseTimingText,
          symptomTimingText: draftRecord.symptomTimingText,
          adherenceRaw: draftRecord.adherenceRaw,
          adherence: draftRecord.adherence,
          effectRaw: draftRecord.effectRaw,
          effect: draftRecord.effect,
          sideEffectsRaw: draftRecord.sideEffectsRaw,
          sideEffects: draftRecord.sideEffects,
          stoppingReasonRaw: draftRecord.stoppingReasonRaw,
          stoppingReason: draftRecord.stoppingReason,
          stoppedBy: draftRecord.stoppedBy,
          expressions: draftRecord.expressions,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || "Failed to save medication period");
        setOverlayStatus(null);
        setSubmitting(false);
        return;
      }
      // Show "Saved" ONLY after the server confirms the save
      setOverlayStatus("saved");
      setTimeout(() => {
        setOverlayStatus(null);
        setSubmitting(false);
        router.push(`/?patientId=${encodeURIComponent(patientId)}`);
      }, 900);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save error");
      setOverlayStatus(null);
      setSubmitting(false);
    }
  }

  const statusLabels: Record<StatusKind, string> = {
    loading: t("checking"),
    confirmed: t("statusNoted"),
    saving: t("statusSaving"),
    saved: t("statusSaved"),
  };

  const overlay = overlayStatus ? (
    <StatusOverlay kind={overlayStatus} label={statusLabels[overlayStatus]} />
  ) : null;

  // --- URGENT HELP SCREEN (Full-screen interrupt; category-aware; no way to continue interview; no pulsing/moving elements) ---
  if (stage === "urgent_help") {
    const isPhysicalOnly = safetyCategory === "severe_physical_reaction";
    const isSelfHarmOnly = safetyCategory === "self_harm_or_suicide";
    const isMissingOrBoth = !isPhysicalOnly && !isSelfHarmOnly;

    const titleText = isPhysicalOnly
      ? t("urgentPhysicalTitle")
      : t("urgentTitle");
    const primaryBodyText = isPhysicalOnly
      ? t("urgentPhysicalBody")
      : t("urgentBody");

    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="urgent-title"
        className="urgent-screen"
      >
        <div className="mx-auto max-w-xl px-5 pb-10 pt-16">
          <h1 id="urgent-title" className="text-3xl font-semibold leading-snug">
            {titleText}
          </h1>
          <p className="mt-4 text-lg leading-relaxed opacity-95">
            {primaryBodyText}
          </p>
          {isMissingOrBoth && (
            <p className="mt-3 text-lg font-medium leading-relaxed opacity-95">
              {t("urgentPhysicalBody")}
            </p>
          )}
          <div className="mt-8">
            <Helplines
              size="large"
              helplines={helplines}
              prioritizeEmergency={isPhysicalOnly || isMissingOrBoth}
            />
          </div>
          <button
            type="button"
            className="btn-urgent-home mt-10"
            onClick={() => router.push("/")}
          >
            {t("iAmSafe")}
          </button>
        </div>
      </div>
    );
  }

  // --- FAIL-SAFE PAUSE SCREEN ---
  if (stage === "fail_safe") {
    return (
      <>
        <section>
          <ScreenTitle>{t("pausedTitle")}</ScreenTitle>
          <p className="text-lg text-muted-foreground">{t("pausedBody")}</p>
          <button
            type="button"
            disabled={submitting}
            className="btn-primary mt-6 w-full"
            onClick={() => handleAnswerSubmit(null)}
          >
            {t("tryAgain")}
          </button>
          <div className="card-calm mt-8">
            <p className="mb-3 text-base font-medium text-foreground">
              {t("pausedHelp")}
            </p>
            <Helplines size="small" helplines={helplines} />
          </div>
        </section>
        {overlay}
      </>
    );
  }

  // --- STAGE 1: ADD MEDICATION SCREEN ---
  if (stage === "entry") {
    const entryFields: Array<{
      k: keyof typeof entryDrafts;
      label: string;
      type: "text" | "month";
      placeholder?: string;
    }> = [
      {
        k: "genericName",
        label: t("medicine"),
        type: "text",
        placeholder: "e.g. sertraline",
      },
      {
        k: "dose",
        label: t("dose"),
        type: "text",
        placeholder: "e.g. 50 mg",
      },
      { k: "startMonth", label: t("startMonth"), type: "month" },
      { k: "stopMonth", label: t("stopMonth"), type: "month" },
    ];

    return (
      <section>
        <ScreenTitle eyebrow={patientName}>{t("addTitle")}</ScreenTitle>
        <p className="mb-6 text-lg text-muted-foreground">{t("addIntro")}</p>
        {errorMsg && (
          <div className="card-calm mb-4 border-destructive text-destructive">
            {errorMsg}
          </div>
        )}
        <form className="space-y-5" onSubmit={startGuidedInterview}>
          {entryFields.map(({ k, label, type, placeholder }) => {
            const d = entryDrafts[k];
            const id = `f-${k}`;
            return (
              <fieldset key={k} className="card-calm space-y-3">
                <label
                  htmlFor={id}
                  className="block text-lg font-semibold text-foreground"
                >
                  {label}
                </label>
                {d.mode === "value" && (
                  <input
                    id={id}
                    type={type}
                    className="input-calm"
                    value={d.value}
                    placeholder={placeholder}
                    onChange={(e) => updateDraft(k, { value: e.target.value })}
                  />
                )}
                {d.mode === "uncertain" && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("notSureHint")}
                    </p>
                    {d.options.map((o, i) => (
                      <input
                        key={i}
                        id={i === 0 ? id : undefined}
                        type={type}
                        aria-label={`${label} ${i + 1}`}
                        className="input-calm"
                        value={o}
                        placeholder={placeholder}
                        onChange={(e) =>
                          updateDraft(k, {
                            options: d.options.map((x, j) =>
                              j === i ? e.target.value : x
                            ),
                          })
                        }
                      />
                    ))}
                    <button
                      type="button"
                      className="link-calm"
                      onClick={() =>
                        updateDraft(k, { options: [...d.options, ""] })
                      }
                    >
                      {t("addAnother")}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-pressed={d.mode === "unknown"}
                    className="chip-toggle"
                    onClick={() =>
                      updateDraft(k, {
                        mode: d.mode === "unknown" ? "value" : "unknown",
                      })
                    }
                  >
                    {t("dontKnow")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={d.mode === "uncertain"}
                    className="chip-toggle"
                    onClick={() =>
                      updateDraft(k, {
                        mode: d.mode === "uncertain" ? "value" : "uncertain",
                      })
                    }
                  >
                    {t("notSure")}
                  </button>
                </div>
              </fieldset>
            );
          })}
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                router.push(
                  patientId
                    ? `/?patientId=${encodeURIComponent(patientId)}`
                    : "/"
                )
              }
            >
              {t("back")}
            </button>
            <button type="submit" className="btn-primary">
              {t("continue")}
            </button>
          </div>
        </form>
      </section>
    );
  }

  // --- STAGE 2: INTERVIEW QUESTION SCREEN ---
  if (stage === "question") {
    const currentQ = INTERVIEW_QUESTIONS[questionIdx];
    const total = INTERVIEW_QUESTIONS.length;
    const primary =
      lang === "hi" ? currentQ.questionHi : currentQ.questionEn;
    const secondary =
      lang === "hi" ? currentQ.questionEn : currentQ.questionHi;
    const placeholder =
      lang === "hi" ? currentQ.placeholderHi : currentQ.placeholderEn;

    return (
      <>
        <section>
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              {t("questionOf", { n: questionIdx + 1, t: total })}
            </p>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={questionIdx + 1}
            >
              <div
                className="progress-fill"
                style={{ width: `${((questionIdx + 1) / total) * 100}%` }}
              />
            </div>
          </div>
          {errorMsg && (
            <div className="card-calm mb-4 border-destructive text-destructive">
              {errorMsg}
            </div>
          )}
          <h1 className="text-2xl font-semibold leading-snug text-foreground sm:text-3xl">
            {primary}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">{secondary}</p>
          <label htmlFor="answer" className="sr-only">
            {primary}
          </label>
          <textarea
            id="answer"
            className="input-calm mt-6 min-h-48 text-lg"
            value={currentAnswer}
            placeholder={placeholder}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            disabled={submitting}
          />
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="link-calm"
              onClick={handleSkipQuestion}
              disabled={submitting}
            >
              {t("skip")}
            </button>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleBackFromQuestion}
              disabled={submitting}
            >
              {t("back")}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleAnswerSubmit(null)}
              disabled={submitting || !currentAnswer.trim()}
            >
              {submitting ? t("checking") : t("next")}
            </button>
          </div>
        </section>
        {overlay}
      </>
    );
  }

  // --- STAGE 3: MEANING CHECK SCREEN ---
  if (stage === "disambiguate") {
    const currentExpr = pendingExpressions[pendingIdx];
    if (!currentExpr) return null;

    return (
      <>
        <section>
          <ScreenTitle>{t("meaningTitle")}</ScreenTitle>
          <p className="text-lg text-muted-foreground">{t("meaningIntro")}</p>
          <blockquote className="quote-calm my-5 text-2xl">
            “{currentExpr.originalPhrase}”
          </blockquote>
          <div className="space-y-3">
            {currentExpr.candidateMeanings.map((meaning) => {
              const displayMeaning = resolvePatientMeaning(
                meaning,
                lang,
                currentExpr.matchedLexiconTerm
              );
              return (
                <button
                  key={meaning}
                  type="button"
                  className="choice-card"
                  onClick={() => handleSelectMeaning(meaning, "high")}
                >
                  <span className="block text-lg font-medium">
                    {displayMeaning}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              aria-expanded={explainingOwn}
              className="choice-card choice-card-quiet"
              onClick={() => setExplainingOwn((v) => !v)}
            >
              <span className="block text-lg">{t("noneOfThese")}</span>
            </button>
          </div>
          {explainingOwn && (
            <div className="mt-4 space-y-3">
              <label htmlFor="own" className="sr-only">
                {t("explainPlaceholder")}
              </label>
              <textarea
                id="own"
                className="input-calm min-h-32 text-lg"
                placeholder={t("explainPlaceholder")}
                value={ownExplanation}
                onChange={(e) => setOwnExplanation(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary w-full"
                disabled={!ownExplanation.trim()}
                onClick={() =>
                  handleSelectMeaning(ownExplanation.trim(), "low")
                }
              >
                {t("continue")}
              </button>
            </div>
          )}
        </section>
        {overlay}
      </>
    );
  }

  // --- STAGE 4: READ-BACK CONFIRMATION GATE ---
  const { rows, unknownFieldNames, notMentionedFieldNames } =
    buildMedicationDisplay(draftRecord, lang);
  const medTitle = isUnknownText(draftRecord.genericName)
    ? t("unknownMed")
    : draftRecord.genericName;
  const readBackLines = buildReadBackSummary(draftRecord, lang);

  return (
    <>
      <section>
        <ScreenTitle eyebrow={t("readBackIntro")}>
          {t("readBackTitle")}
        </ScreenTitle>
        {errorMsg && (
          <div className="card-calm mb-4 border-destructive text-destructive">
            {errorMsg}
          </div>
        )}
        <div className="card-calm">
          <h2 className="mb-4 text-2xl font-semibold capitalize text-foreground">
            {medTitle}
          </h2>
          <dl className="divide-y divide-border">
            {rows.map((r) => (
              <div
                key={r.key}
                className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]"
              >
                <dt className="text-base text-muted-foreground">
                  {t(r.label)}
                </dt>
                <dd
                  className={
                    r.uncertain
                      ? "text-lg text-foreground uncertain-value"
                      : "text-lg text-foreground"
                  }
                >
                  {r.text}
                </dd>
              </div>
            ))}
          </dl>
          {draftRecord.expressions.map((e) => (
            <p key={e.id} className="mt-3 text-base text-foreground">
              “{e.originalPhrase}” →{" "}
              <strong>
                {resolvePatientMeaning(
                  e.selectedMeaning,
                  lang,
                  e.matchedLexiconTerm
                )}
              </strong>
            </p>
          ))}
          {(notMentionedFieldNames.length > 0 ||
            unknownFieldNames.length > 0) && (
            <div className="mt-5 space-y-2 rounded-xl bg-secondary p-4 text-base text-secondary-foreground">
              {notMentionedFieldNames.length > 0 && (
                <p>
                  {t("notDiscussed")}
                  {notMentionedFieldNames.join(", ")}
                </p>
              )}
              {unknownFieldNames.length > 0 && (
                <p>
                  {t("dontRemember")}
                  {unknownFieldNames.join(", ")}
                </p>
              )}
            </div>
          )}
          <div className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">
            <ul className="space-y-1">
              {readBackLines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={submitting}
            onClick={() => setStage("entry")}
          >
            {t("changeSomething")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={submitting}
            onClick={handleConfirmAndSave}
          >
            {t("yesRight")}
          </button>
        </div>
      </section>
      {overlay}
    </>
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <p className="text-base text-muted-foreground">Loading interview…</p>
      }
    >
      <InterviewContent />
    </Suspense>
  );
}
