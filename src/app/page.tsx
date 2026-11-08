"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  buildReadBackSummary,
  computeMedicationGaps,
  formatAdherenceSentence,
  formatDoseSentence,
  formatDurationSentence,
  formatEffectSentence,
  formatMonthYearDate,
  formatOnsetSentence,
  formatSideEffectsSentence,
  formatStoppingSentence,
  TimelineMedicationRecord,
} from "@/lib/timeline";
import { resolvePatientMeaning } from "@/lib/lexicon";

interface PatientProfileView {
  id: string;
  displayName: string;
  preferredLanguage: "en" | "hi";
  storySummaryEn: string;
  storySummaryHi: string;
  medications: TimelineMedicationRecord[];
}

const UI_LABELS = {
  en: {
    pageTitle: "Patient Treatment History Timeline",
    selectPatient: "Select Synthetic Patient Profile:",
    langToggleLabel: "Language / भाषा:",
    addMedicationBtn: "+ Add Medication Period",
    noMeds: "No confirmed medication periods yet.",
    cardHeaderDates: "Dates",
    startLabel: "Start",
    stopLabel: "Stop",
    doseLabel: "Dose",
    durationLabel: "Duration Taken",
    onsetLabel: "Onset After Starting",
    doseTimingLabel: "When you took the medicine",
    symptomTimingLabel: "When the effect or side effect happened",
    adherenceLabel: "Adherence (Whether taken as prescribed)",
    effectLabel: "Effect (Whether it helped)",
    sideEffectsLabel: "Side Effects or Problems",
    stoppingLabel: "Reason for Stopping & Who Stopped",
    patientWordsLabel: "Patient's original words:",
    confirmedMeaningLabel: "Confirmed meaning:",
    interpretedExpressionsLabel: "Confirmed Expressions & Meanings:",
    gapsSectionTitle: "Gaps (Unknown & Not Mentioned Fields)",
    gapBadgeUnknown: "UNKNOWN (Not remembered)",
    gapBadgeNotMentioned: "NOT MENTIONED",
    readBackSummaryTitle: "Confirmed Read-Back Summary",
  },
  hi: {
    pageTitle: "आपकी दवाई का इतिहास (टाइमलाइन)",
    selectPatient: "काल्पनिक प्रोफ़ाइल चुनें:",
    langToggleLabel: "भाषा / Language:",
    addMedicationBtn: "+ नई दवाई अवधि जोड़ें",
    noMeds: "अभी तक कोई पुष्ट दवाई अवधि नहीं है।",
    cardHeaderDates: "तारीखें",
    startLabel: "शुरू",
    stopLabel: "बंद",
    doseLabel: "खुराक (Dose)",
    durationLabel: "दवाई लेने की अवधि",
    onsetLabel: "शुरू करने के बाद असर का समय",
    doseTimingLabel: "आप दवाई कब लेते थे",
    symptomTimingLabel: "परेशानी कब होती थी",
    adherenceLabel: "आपने दवाई कैसे ली (Adherence)",
    effectLabel: "दवाई का असर (Effect)",
    sideEffectsLabel: "परेशानी या साइड इफेक्ट (Side Effects)",
    stoppingLabel: "बंद करने की वजह और किसने बंद की",
    patientWordsLabel: "आपके मूल शब्द:",
    confirmedMeaningLabel: "पुष्ट किया गया अर्थ:",
    interpretedExpressionsLabel: "पुष्ट किए गए लक्षण और अर्थ:",
    gapsSectionTitle: "अधूरी जानकारी / गैप्स (याद नहीं और ज़िक्र नहीं किया गया)",
    gapBadgeUnknown: "याद नहीं है",
    gapBadgeNotMentioned: "ज़िक्र नहीं किया गया",
    readBackSummaryTitle: "पुष्ट किया गया सारांश (Read-Back)",
  },
};

export default function TimelinePage() {
  const [patients, setPatients] = useState<PatientProfileView[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => r.json())
      .then((data) => {
        if (data.patients && data.patients.length > 0) {
          setPatients(data.patients);
          setSelectedPatientId(data.patients[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
  }, []);

  const labels = UI_LABELS[lang];
  const currentPatient = patients.find((p) => p.id === selectedPatientId);

  if (loading) {
    return <div className="p-4 text-sm text-gray-600">Loading timeline...</div>;
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 text-red-800 rounded">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top controls: Title + Language Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 border border-gray-200 rounded">
        <div>
          <h1 className="text-xl font-bold">{labels.pageTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">{labels.langToggleLabel}</span>
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
            हिन्दी (Devanagari)
          </button>
        </div>
      </div>

      {/* Patient selector */}
      <div className="bg-white p-4 border border-gray-200 rounded space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label htmlFor="patient-select" className="text-sm font-semibold">
              {labels.selectPatient}
            </label>
            <select
              id="patient-select"
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
          <Link
            href={`/interview?patientId=${encodeURIComponent(
              selectedPatientId
            )}&lang=${lang}`}
            className="px-4 py-1.5 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800"
          >
            {labels.addMedicationBtn}
          </Link>
        </div>

        {currentPatient && (
          <p className="text-sm text-gray-600">
            {lang === "en"
              ? currentPatient.storySummaryEn
              : currentPatient.storySummaryHi}
          </p>
        )}
      </div>

      {/* Chronological Medication Cards */}
      {currentPatient && currentPatient.medications.length === 0 && (
        <div className="p-6 bg-white border border-gray-200 rounded text-sm text-gray-600">
          {labels.noMeds}
        </div>
      )}

      {currentPatient &&
        currentPatient.medications.map((med, index) => {
          const gaps = computeMedicationGaps(med);
          const readBackLines = buildReadBackSummary(med, lang);

          return (
            <div
              key={med.id}
              className="bg-white border border-gray-300 rounded p-5 space-y-4"
            >
              {/* Card Header: Medicine, Dose, Dates */}
              <div className="border-b border-gray-200 pb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold uppercase text-gray-500 mr-2">
                    #{index + 1}
                  </span>
                  <span className="text-lg font-bold">
                    {med.genericName === "unknown"
                      ? lang === "en"
                        ? "Unknown medicine"
                        : "अज्ञात दवाई"
                      : med.genericName}
                  </span>
                  <span className="ml-3 text-sm text-gray-700">
                    ({formatDoseSentence(med.dose, lang)})
                  </span>
                </div>
                <div className="text-sm text-gray-700">
                  <strong>{labels.startLabel}:</strong>{" "}
                  {formatMonthYearDate(med.startDate, lang)} |{" "}
                  <strong>{labels.stopLabel}:</strong>{" "}
                  {formatMonthYearDate(med.stopDate, lang)}
                </div>
              </div>

              {/* Duration, Onset, Dose Timing, Symptom Timing */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm bg-gray-50 p-3 rounded border border-gray-200">
                <div>
                  <div className="font-semibold text-gray-700">
                    {labels.durationLabel}
                  </div>
                  <div>{formatDurationSentence(med.durationTaken, lang)}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700">
                    {labels.onsetLabel}
                  </div>
                  <div>{formatOnsetSentence(med.onsetAfterStarting, lang)}</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700">
                    {labels.doseTimingLabel}
                  </div>
                  <div>
                    {med.doseTimingText ||
                      (lang === "en" ? "Not mentioned" : "ज़िक्र नहीं किया गया")}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-gray-700">
                    {labels.symptomTimingLabel}
                  </div>
                  <div>
                    {med.symptomTimingText ||
                      (lang === "en" ? "Not mentioned" : "ज़िक्र नहीं किया गया")}
                  </div>
                </div>
              </div>

              {/* Four Interpreted Interview Sections (each showing patient's original words + confirmed meaning) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {/* 1. Adherence */}
                <div className="border border-gray-200 rounded p-3 space-y-1.5">
                  <div className="font-semibold text-gray-900">
                    1. {labels.adherenceLabel}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">
                      {labels.confirmedMeaningLabel}{" "}
                    </span>
                    {formatAdherenceSentence(med.adherence, lang)}
                  </div>
                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                    <strong>{labels.patientWordsLabel}</strong> &ldquo;
                    {med.adherenceRaw}&rdquo;
                  </div>
                </div>

                {/* 2. Effect */}
                <div className="border border-gray-200 rounded p-3 space-y-1.5">
                  <div className="font-semibold text-gray-900">
                    2. {labels.effectLabel}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">
                      {labels.confirmedMeaningLabel}{" "}
                    </span>
                    {formatEffectSentence(med.effect, lang)}
                  </div>
                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                    <strong>{labels.patientWordsLabel}</strong> &ldquo;
                    {med.effectRaw}&rdquo;
                  </div>
                </div>

                {/* 3. Side Effects */}
                <div className="border border-gray-200 rounded p-3 space-y-1.5">
                  <div className="font-semibold text-gray-900">
                    3. {labels.sideEffectsLabel}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">
                      {labels.confirmedMeaningLabel}{" "}
                    </span>
                    {formatSideEffectsSentence(med.sideEffects, lang)}
                  </div>
                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                    <strong>{labels.patientWordsLabel}</strong> &ldquo;
                    {med.sideEffectsRaw}&rdquo;
                  </div>
                </div>

                {/* 4. Stopping Reason & Stopped By */}
                <div className="border border-gray-200 rounded p-3 space-y-1.5">
                  <div className="font-semibold text-gray-900">
                    4. {labels.stoppingLabel}
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">
                      {labels.confirmedMeaningLabel}{" "}
                    </span>
                    {formatStoppingSentence(
                      med.stoppingReason,
                      med.stoppedBy,
                      lang
                    )}
                  </div>
                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                    <strong>{labels.patientWordsLabel}</strong> &ldquo;
                    {med.stoppingReasonRaw}&rdquo;
                  </div>
                </div>
              </div>

              {/* Confirmed Expressions & Disambiguated Meanings */}
              {med.expressions.length > 0 && (
                <div className="border border-gray-200 rounded p-3 space-y-2 text-sm">
                  <div className="font-semibold">
                    {labels.interpretedExpressionsLabel}
                  </div>
                  <ul className="space-y-1.5">
                    {med.expressions.map((expr) => (
                      <li
                        key={expr.id}
                        className="bg-gray-50 p-2 rounded border border-gray-200 flex flex-wrap justify-between gap-2"
                      >
                        <div>
                          <span className="font-medium">
                            {labels.patientWordsLabel}
                          </span>{" "}
                          &ldquo;{expr.originalPhrase}&rdquo; &rarr;{" "}
                          <span className="font-medium">
                            {labels.confirmedMeaningLabel}
                          </span>{" "}
                          {lang === "hi"
                            ? resolvePatientMeaning(
                                expr.selectedMeaning,
                                "hi",
                                expr.matchedLexiconTerm
                              )
                            : expr.selectedMeaning}
                          {lang === "hi" && (
                            <span className="text-xs text-gray-500 ml-1">
                              [Clinician view: {expr.selectedMeaning}]
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          [confidence: {expr.confidence}
                          {expr.matchedLexiconTerm
                            ? ` | lexicon: ${expr.matchedLexiconTerm} (unvalidated)`
                            : ""}
                          ]
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps Section: lists both unknown and not_mentioned fields, labelled differently */}
              {gaps.length > 0 && (
                <div className="border border-amber-300 bg-amber-50 rounded p-3 space-y-2 text-sm">
                  <div className="font-semibold text-amber-950">
                    {labels.gapsSectionTitle} ({gaps.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {gaps.map((g) => (
                      <span
                        key={g.fieldKey}
                        className={`px-2.5 py-1 rounded text-xs font-medium border ${
                          g.gapType === "unknown"
                            ? "bg-red-100 text-red-900 border-red-300"
                            : "bg-gray-100 text-gray-800 border-gray-300"
                        }`}
                      >
                        [
                        {g.gapType === "unknown"
                          ? labels.gapBadgeUnknown
                          : labels.gapBadgeNotMentioned}
                        ] {lang === "en" ? g.labelEn : g.labelHi}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Fixed-Template Read-Back Summary */}
              <details className="text-xs text-gray-600 border-t border-gray-200 pt-2">
                <summary className="cursor-pointer font-medium text-gray-700">
                  {labels.readBackSummaryTitle}
                </summary>
                <ul className="mt-2 list-disc list-inside space-y-1">
                  {readBackLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
    </div>
  );
}
