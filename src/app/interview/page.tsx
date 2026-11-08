"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { INTERVIEW_QUESTIONS } from "@/lib/interview";
import { SAFETY_HELPLINES, CountryHelplines } from "@/config/safety-helplines";
import {
  buildReadBackSummary,
  StructuredFieldRecord,
  TimelineExpressionView,
  TimelineMedicationRecord,
} from "@/lib/timeline";
import {
  AdherenceValue,
  EffectValue,
  ExtractionOutput,
  OnsetAfterStartingValue,
  SideEffectsValue,
  StoppedByValue,
  StoppingReasonValue,
} from "@/lib/extraction";

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

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [patients, setPatients] = useState<
    { id: string; displayName: string }[]
  >([]);
  const [patientId, setPatientId] = useState<string>(
    searchParams.get("patientId") || ""
  );
  const [lang, setLang] = useState<"en" | "hi">(
    searchParams.get("lang") === "hi" ? "hi" : "en"
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

  // Step 0: Medication entry fields
  const [genericName, setGenericName] = useState<string>("");
  const [genericNameUnknown, setGenericNameUnknown] = useState<boolean>(false);

  const [doseInput, setDoseInput] = useState<string>("");
  const [doseUnknown, setDoseUnknown] = useState<boolean>(false);

  const [startDate, setStartDate] = useState<string>("");
  const [startDateUnknown, setStartDateUnknown] = useState<boolean>(false);

  const [stopDate, setStopDate] = useState<string>("");
  const [stopDateUnknown, setStopDateUnknown] = useState<boolean>(false);

  // Guided interview state (Steps 0..3 corresponding to INTERVIEW_QUESTIONS)
  const [questionIdx, setQuestionIdx] = useState<number>(0);
  const [currentAnswer, setCurrentAnswer] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
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

  const [confirmedExpressions, setConfirmedExpressions] = useState<
    TimelineExpressionView[]
  >([]);

  // Pending multi-meaning expressions requiring user choice
  const [pendingExpressions, setPendingExpressions] = useState<
    TimelineExpressionView[]
  >([]);

  // Safety & Fail-Safe state
  const [helplines, setHelplines] =
    useState<CountryHelplines[]>(SAFETY_HELPLINES);
  const [safetyDetails, setSafetyDetails] = useState<{
    whichCheckFired?: string;
    matchedKeyword?: string | null;
    classifierLabel?: string | null;
    failureReason?: string | null;
  } | null>(null);

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

  function startGuidedInterview(e: React.FormEvent) {
    e.preventDefault();
    const initialDose: StructuredFieldRecord<string> = doseUnknown
      ? { state: "unknown", value: null, statedOptions: [] }
      : doseInput.trim()
      ? { state: "known", value: doseInput.trim(), statedOptions: [] }
      : { state: "not_mentioned", value: null, statedOptions: [] };

    setDoseField(initialDose);
    setQuestionIdx(0);
    setCurrentAnswer("");
    setStage("question");
  }

  async function handleAnswerSubmit(
    simulateFailure?: "TIMEOUT" | "INVALID_JSON" | null
  ) {
    if (!currentAnswer.trim()) return;
    setSubmitting(true);
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
        setHelplines(data.helplines || SAFETY_HELPLINES);
        setSafetyDetails(data.safetyResult || null);
        setStage("urgent_help");
        setSubmitting(false);
        return;
      }

      if (data.status === "fail_safe") {
        // Classifier technical failure after retries: pause interview, do not extract, show help + retry
        setHelplines(data.helplines || SAFETY_HELPLINES);
        setSafetyDetails(data.safetyResult || null);
        setStage("fail_safe");
        setSubmitting(false);
        return;
      }

      if (data.status !== "safe" || !data.extraction) {
        setErrorMsg(data.error || "Extraction failed. Please retry.");
        setSubmitting(false);
        return;
      }

      const ext = data.extraction as ExtractionOutput;

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

      if (multiMeaning.length > 0) {
        // Do not choose automatically when >1 candidate meaning exists; ask the user
        setPendingExpressions(multiMeaning);
        setStage("disambiguate");
      } else {
        advanceToNextStep();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  function advanceToNextStep() {
    setCurrentAnswer("");
    if (questionIdx + 1 < INTERVIEW_QUESTIONS.length) {
      setQuestionIdx(questionIdx + 1);
      setStage("question");
    } else {
      setStage("readback");
    }
  }

  function confirmDisambiguatedMeanings() {
    setConfirmedExpressions((prev) => [...prev, ...pendingExpressions]);
    setPendingExpressions([]);
    advanceToNextStep();
  }

  const draftRecord: TimelineMedicationRecord = {
    id: "draft",
    genericName: genericNameUnknown
      ? "unknown"
      : genericName.trim() || "unknown",
    startDate: startDateUnknown ? "unknown" : startDate.trim() || "unknown",
    stopDate: stopDateUnknown ? "unknown" : stopDate.trim() || "unknown",
    dose: doseField,
    durationTaken: durationTakenField,
    onsetAfterStarting: onsetField,
    doseTimingText,
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
        setSubmitting(false);
        return;
      }
      router.push("/");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save error");
      setSubmitting(false);
    }
  }

  // --- URGENT HELP SCREEN ---
  if (stage === "urgent_help") {
    return (
      <div className="bg-red-50 border-2 border-red-600 rounded p-6 space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-red-900">
            Urgent Help & Support / तत्काल सहायता और हेल्पलाइन
          </h1>
          <p className="text-sm text-red-900 font-medium">
            The interview has been stopped and your last answer was not saved.
            If you are having thoughts of harming yourself or experiencing a
            severe physical reaction, please reach out for immediate support:
          </p>
          <p className="text-sm text-red-900">
            साक्षात्कार रोक दिया गया है और आपका पिछला उत्तर सहेजा नहीं गया है। यदि
            आपको खुद को नुकसान पहुँचाने के विचार आ रहे हैं या गंभीर शारीरिक
            प्रतिक्रिया हो रही है, तो कृपया तुरंत नीचे दिए गए नंबरों पर संपर्क
            करें:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {helplines.map((country) => (
            <div
              key={country.countryCode}
              className="bg-white border border-red-300 rounded p-4 space-y-3"
            >
              <h2 className="font-bold text-lg text-gray-900">
                {country.countryNameEn} / {country.countryNameHi}
              </h2>
              <ul className="space-y-2 text-sm">
                {country.contacts.map((c, i) => (
                  <li key={i} className="border-b border-gray-100 pb-2">
                    <div className="font-semibold">
                      {c.serviceEn} ({c.serviceHi}):{" "}
                      <span className="text-red-700 font-bold text-base">
                        {c.number}
                      </span>
                    </div>
                    <div className="text-xs text-gray-700">{c.notesEn}</div>
                    <div className="text-xs text-gray-600">{c.notesHi}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {safetyDetails && (
          <div className="text-xs text-gray-700 bg-white p-3 rounded border border-gray-300">
            <strong>Trigger logged for review:</strong> checkFired=
            {safetyDetails.whichCheckFired} | matchedKeyword=
            {safetyDetails.matchedKeyword ?? "none"} | classifierLabel=
            {safetyDetails.classifierLabel ?? "none"}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded"
          >
            Return to Timeline / टाइमलाइन पर वापस जाएं
          </button>
        </div>
      </div>
    );
  }

  // --- FAIL-SAFE PAUSE SCREEN ---
  if (stage === "fail_safe") {
    return (
      <div className="bg-amber-50 border-2 border-amber-500 rounded p-6 space-y-5">
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-amber-950">
            Interview Paused (Safety Classifier Technical Failure) / साक्षात्कार
            रोका गया है
          </h1>
          <p className="text-sm text-amber-900">
            The automated safety classifier could not complete after retries (
            {safetyDetails?.classifierLabel || "technical error"}). As a
            fail-safe, your answer was <strong>not</strong> sent to extraction.
            If you need urgent support right now, please use the numbers below;
            otherwise you may retry checking your answer.
          </p>
          <p className="text-sm text-amber-900">
            तकनीकी समस्या के कारण सुरक्षा जांच पूरी नहीं हो सकी। सुरक्षा नियम के
            तहत आपका उत्तर आगे नहीं भेजा गया है। यदि आपको तत्काल सहायता चाहिए तो
            नीचे दिए गए हेल्पलाइन नंबर देखें, या अपने उत्तर की दोबारा जांच करें।
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {helplines.map((country) => (
            <div
              key={country.countryCode}
              className="bg-white border border-amber-300 rounded p-4 space-y-2"
            >
              <h2 className="font-bold text-base">
                {country.countryNameEn} / {country.countryNameHi}
              </h2>
              <ul className="space-y-1.5 text-sm">
                {country.contacts.map((c, i) => (
                  <li key={i}>
                    <strong>{c.serviceEn}:</strong>{" "}
                    <span className="font-bold text-red-700">{c.number}</span> (
                    {c.notesEn})
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setStage("question");
              handleAnswerSubmit(null);
            }}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded"
          >
            {submitting
              ? "Retrying..."
              : "Retry Safety Check / दोबारा प्रयास करें"}
          </button>
          <button
            type="button"
            onClick={() => setStage("question")}
            className="px-4 py-2 border border-gray-300 bg-white text-sm rounded"
          >
            Back to Question / प्रश्न पर वापस जाएं
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Language Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 border border-gray-200 rounded">
        <h1 className="text-lg font-bold">
          {lang === "en"
            ? "Add Medication Period & Guided Interview"
            : "नई दवाई अवधि और निर्देशित साक्षात्कार"}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang("en")}
            className={`px-3 py-1 text-sm rounded border ${
              lang === "en"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-800 border-gray-300"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang("hi")}
            className={`px-3 py-1 text-sm rounded border ${
              lang === "hi"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-800 border-gray-300"
            }`}
          >
            हिन्दी
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-sm rounded">
          {errorMsg}
        </div>
      )}

      {/* STAGE 1: MEDICATION ENTRY */}
      {stage === "entry" && (
        <form
          onSubmit={startGuidedInterview}
          className="bg-white border border-gray-300 rounded p-5 space-y-4 text-sm"
        >
          <h2 className="font-bold text-base border-b pb-2">
            1. Medication Entry / दवाई का प्राथमिक विवरण
          </h2>
          <p className="text-gray-600">
            Any field can be marked &ldquo;unknown&rdquo; (पता नहीं / याद नहीं).
            Unknown values will be shown as explicit gaps on the timeline, never
            guessed.
          </p>

          <div>
            <label className="block font-semibold mb-1">
              Synthetic Patient Profile / मरीज़ प्रोफ़ाइल:
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 w-full max-w-md bg-white"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Medicine Name */}
          <div className="space-y-1">
            <label className="block font-semibold">
              Medicine Name (Generic Name) / दवाई का नाम (जेनेरिक):
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                disabled={genericNameUnknown}
                value={genericNameUnknown ? "unknown" : genericName}
                onChange={(e) => setGenericName(e.target.value)}
                placeholder="e.g. sertraline, escitalopram, olanzapine"
                className="border border-gray-300 rounded px-3 py-1.5 flex-1 min-w-[240px] disabled:bg-gray-100"
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={genericNameUnknown}
                  onChange={(e) => setGenericNameUnknown(e.target.checked)}
                />
                <span>Unknown / याद नहीं है</span>
              </label>
            </div>
          </div>

          {/* Dose */}
          <div className="space-y-1">
            <label className="block font-semibold">
              Dose / खुराक (डोज़):
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                disabled={doseUnknown}
                value={doseUnknown ? "unknown" : doseInput}
                onChange={(e) => setDoseInput(e.target.value)}
                placeholder="e.g. 50 mg, 10 mg (or leave blank if mentioned later)"
                className="border border-gray-300 rounded px-3 py-1.5 flex-1 min-w-[240px] disabled:bg-gray-100"
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={doseUnknown}
                  onChange={(e) => setDoseUnknown(e.target.checked)}
                />
                <span>Unknown / याद नहीं है</span>
              </label>
            </div>
          </div>

          {/* Start Date */}
          <div className="space-y-1">
            <label className="block font-semibold">
              Start Date (YYYY-MM or YYYY-MM-DD) / शुरू करने की तारीख:
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                disabled={startDateUnknown}
                value={startDateUnknown ? "unknown" : startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="e.g. 2024-05"
                className="border border-gray-300 rounded px-3 py-1.5 flex-1 min-w-[240px] disabled:bg-gray-100"
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={startDateUnknown}
                  onChange={(e) => setStartDateUnknown(e.target.checked)}
                />
                <span>Unknown / याद नहीं है</span>
              </label>
            </div>
          </div>

          {/* Stop Date */}
          <div className="space-y-1">
            <label className="block font-semibold">
              Stop Date (YYYY-MM, ongoing, or unknown) / बंद करने की तारीख:
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                disabled={stopDateUnknown}
                value={stopDateUnknown ? "unknown" : stopDate}
                onChange={(e) => setStopDate(e.target.value)}
                placeholder="e.g. 2024-09 or ongoing"
                className="border border-gray-300 rounded px-3 py-1.5 flex-1 min-w-[240px] disabled:bg-gray-100"
              />
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stopDateUnknown}
                  onChange={(e) => setStopDateUnknown(e.target.checked)}
                />
                <span>Unknown / याद नहीं है</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-gray-900 text-white font-medium rounded hover:bg-gray-800"
            >
              Continue to Guided Interview &rarr;
            </button>
          </div>
        </form>
      )}

      {/* STAGE 2: GUIDED INTERVIEW (ONE QUESTION AT A TIME IN HINDI & ENGLISH) */}
      {stage === "question" && (
        <div className="bg-white border border-gray-300 rounded p-5 space-y-4 text-sm">
          <div className="text-xs font-semibold uppercase text-gray-500">
            Step {questionIdx + 1} of {INTERVIEW_QUESTIONS.length}:{" "}
            {INTERVIEW_QUESTIONS[questionIdx].titleEn} /{" "}
            {INTERVIEW_QUESTIONS[questionIdx].titleHi}
          </div>

          {/* Both Hindi (Devanagari) and English shown for every question */}
          <div className="space-y-2 bg-gray-50 p-4 rounded border border-gray-200">
            <p className="text-base font-semibold text-gray-900">
              {INTERVIEW_QUESTIONS[questionIdx].questionHi}
            </p>
            <p className="text-sm text-gray-700">
              {INTERVIEW_QUESTIONS[questionIdx].questionEn}
            </p>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-gray-600">
              Write your answer in Hindi (Devanagari), English, or Hinglish:
            </label>
            <textarea
              rows={4}
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              placeholder={
                lang === "hi"
                  ? INTERVIEW_QUESTIONS[questionIdx].placeholderHi
                  : INTERVIEW_QUESTIONS[questionIdx].placeholderEn
              }
              className="w-full border border-gray-300 rounded p-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={submitting || !currentAnswer.trim()}
                onClick={() => handleAnswerSubmit(null)}
                className="px-4 py-2 bg-gray-900 text-white font-medium rounded disabled:opacity-50"
              >
                {submitting
                  ? "Running Safety & Understanding Layer (queued)..."
                  : "Submit Answer / उत्तर जमा करें"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  setCurrentAnswer("Mujhe iske baare mein yaad nahi hai.")
                }
                className="px-3 py-2 border border-gray-300 rounded bg-white text-xs"
              >
                Fill &ldquo;I don&apos;t remember / याद नहीं है&rdquo;
              </button>
            </div>

            {/* Demo button to test Fail-Safe behavior directly from the UI */}
            <button
              type="button"
              disabled={submitting || !currentAnswer.trim()}
              onClick={() => handleAnswerSubmit("TIMEOUT")}
              className="px-3 py-1.5 border border-amber-400 bg-amber-50 text-amber-900 rounded text-xs"
              title="Simulates a classifier timeout to test the fail-safe pause screen"
            >
              Simulate Classifier Failure (Test Fail-Safe)
            </button>
          </div>
        </div>
      )}

      {/* STAGE 3: DISAMBIGUATION WHEN >1 CANDIDATE MEANING EXISTS */}
      {stage === "disambiguate" && (
        <div className="bg-white border border-gray-300 rounded p-5 space-y-4 text-sm">
          <h2 className="font-bold text-base">
            Clarify Your Meaning / अपने शब्दों का सही अर्थ चुनें
          </h2>
          <p className="text-gray-700">
            Some phrases can mean different things. Please choose which meaning
            fits closest to what you experienced (we never choose for you):
          </p>
          <p className="text-gray-700">
            कुछ शब्दों के एक से अधिक अर्थ हो सकते हैं। कृपया चुनें कि आपके अनुभव
            के सबसे करीब कौन-सा अर्थ है:
          </p>

          <div className="space-y-4">
            {pendingExpressions.map((expr, idx) => (
              <div
                key={expr.id}
                className="border border-gray-200 rounded p-4 bg-gray-50 space-y-2"
              >
                <div className="font-semibold">
                  Your phrase / आपके शब्द: &ldquo;{expr.originalPhrase}&rdquo;
                </div>
                <div className="space-y-1.5">
                  {expr.candidateMeanings.map((meaning) => (
                    <label
                      key={meaning}
                      className="flex items-start gap-2 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={`disambig-${expr.id}`}
                        checked={expr.selectedMeaning === meaning}
                        onChange={() => {
                          setPendingExpressions((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, selectedMeaning: meaning }
                                : item
                            )
                          );
                        }}
                        className="mt-1"
                      />
                      <span>{meaning}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={confirmDisambiguatedMeanings}
            className="px-4 py-2 bg-gray-900 text-white font-medium rounded"
          >
            Confirm Selected Meanings & Continue &rarr;
          </button>
        </div>
      )}

      {/* STAGE 4: READ-BACK CONFIRMATION GATE */}
      {stage === "readback" && (
        <div className="bg-white border border-gray-300 rounded p-5 space-y-4 text-sm">
          <h2 className="font-bold text-base border-b pb-2">
            Read-Back Confirmation / विवरण की पुष्टि करें
          </h2>
          <p className="text-gray-700">
            Please review this summary in your chosen language.{" "}
            <strong>
              Nothing is saved to your timeline until you confirm below.
            </strong>
          </p>
          <p className="text-gray-700">
            कृपया नीचे दिए गए सारांश की जांच करें।{" "}
            <strong>
              जब तक आप पुष्टि नहीं करते, टाइमलाइन में कुछ भी सहेजा नहीं जाएगा।
            </strong>
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-2">
            <div className="font-semibold">
              {lang === "en"
                ? "Summary to be saved (English):"
                : "सहेजा जाने वाला सारांश (हिन्दी):"}
            </div>
            <ul className="list-disc list-inside space-y-1">
              {buildReadBackSummary(draftRecord, lang).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmAndSave}
              className="px-4 py-2 bg-gray-900 text-white font-medium rounded"
            >
              {submitting
                ? "Saving to Timeline..."
                : "Confirm & Save to Timeline / पुष्टि करें और टाइमलाइन में जोड़ें"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setQuestionIdx(0);
                setStage("entry");
              }}
              className="px-4 py-2 border border-gray-300 bg-white rounded"
            >
              Edit Details / विवरण सुधारें
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Loading interview...</div>}>
      <InterviewContent />
    </Suspense>
  );
}
