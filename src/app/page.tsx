"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  formatMonthYearDate,
  isUnknownText,
  type TimelineMedicationRecord,
} from "@/lib/timeline";
import { resolvePatientMeaning } from "@/lib/lexicon";
import { useLang, useT } from "@/components/ui/i18n";
import { ScreenTitle } from "@/components/ui/screen-shell";
import { buildMedicationDisplay } from "@/components/ui/medication-view";

interface PatientProfileView {
  id: string;
  displayName: string;
  preferredLanguage: "en" | "hi";
  storySummaryEn: string;
  storySummaryHi: string;
  medications: TimelineMedicationRecord[];
}

function HomeScreen({
  patients,
  onViewTimeline,
  onAddMedication,
}: {
  patients: PatientProfileView[];
  onViewTimeline: (patientId: string) => void;
  onAddMedication: (patientId: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();

  return (
    <section>
      <ScreenTitle eyebrow={t("homeIntro")}>{t("homeTitle")}</ScreenTitle>
      <ul className="space-y-4">
        {patients.map((p) => (
          <li key={p.id} className="card-calm">
            <div className="flex items-start gap-4">
              <div aria-hidden className="avatar-soft">
                {p.displayName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-foreground">
                  {p.displayName}
                </h2>
                <p className="mt-1 text-base text-muted-foreground">
                  {lang === "hi" ? p.storySummaryHi : p.storySummaryEn}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.medications.length} {t("medicines")}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => onViewTimeline(p.id)}
              >
                {t("viewTimeline")}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onAddMedication(p.id)}
              >
                {t("addMedication")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TimelineScreen({
  patient,
  onAddMedication,
}: {
  patient: PatientProfileView;
  onAddMedication: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const meds = patient.medications;

  return (
    <section>
      <div className="mb-4">
        <Link href="/" className="link-calm inline-flex items-center gap-1">
          ← {t("home")}
        </Link>
      </div>
      <ScreenTitle
        eyebrow={
          lang === "hi" ? patient.storySummaryHi : patient.storySummaryEn
        }
      >
        {t("timelineOf", { name: patient.displayName })}
      </ScreenTitle>
      <button
        type="button"
        className="btn-secondary mb-8 w-full sm:w-auto"
        onClick={onAddMedication}
      >
        + {t("addMedication")}
      </button>
      {meds.length === 0 && (
        <p className="text-lg text-muted-foreground">{t("noMeds")}</p>
      )}
      <ol className="timeline-rail space-y-8">
        {meds.map((m) => {
          const { rows, unknownFieldNames, notMentionedFieldNames } =
            buildMedicationDisplay(m, lang);
          const startHeading = isUnknownText(m.startDate)
            ? "—"
            : formatMonthYearDate(m.startDate, lang);
          const medTitle = isUnknownText(m.genericName)
            ? t("unknownMed")
            : m.genericName;

          return (
            <li key={m.id} className="relative pl-8">
              <span aria-hidden className="timeline-dot" />
              <p className="mb-2 text-sm font-medium text-muted-foreground">
                {startHeading}
              </p>
              <article className="card-calm">
                <h2 className="text-2xl font-semibold capitalize text-foreground">
                  {medTitle}
                </h2>
                <dl className="mt-3 divide-y divide-border">
                  {rows.map((r) => (
                    <div
                      key={r.key}
                      className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr]"
                    >
                      <dt className="text-base text-muted-foreground">
                        {t(r.label)}
                      </dt>
                      <dd className="space-y-2">
                        <p
                          className={
                            r.uncertain
                              ? "text-lg text-foreground uncertain-value"
                              : "text-lg text-foreground"
                          }
                        >
                          {r.text}
                        </p>
                        {r.rawWords && r.expressions.length === 0 && (
                          <blockquote className="quote-calm text-base">
                            “{r.rawWords}”
                          </blockquote>
                        )}
                        {r.expressions.map((e) => {
                          const resolved =
                            lang === "hi"
                              ? resolvePatientMeaning(
                                  e.selectedMeaning,
                                  "hi",
                                  e.matchedLexiconTerm
                                )
                              : resolvePatientMeaning(
                                  e.selectedMeaning,
                                  "en",
                                  e.matchedLexiconTerm
                                );
                          return (
                            <div
                              key={e.id}
                              className="rounded-xl bg-secondary p-3"
                            >
                              <blockquote className="quote-calm text-base">
                                “{e.originalPhrase}”
                              </blockquote>
                              <p className="mt-2 text-base text-secondary-foreground">
                                <span className="text-muted-foreground">
                                  {t("meaning")}:{" "}
                                </span>
                                {resolved}
                              </p>
                            </div>
                          );
                        })}
                      </dd>
                    </div>
                  ))}
                </dl>

                {(unknownFieldNames.length > 0 ||
                  notMentionedFieldNames.length > 0) && (
                  <div className="mt-4 rounded-xl border border-dashed border-input p-4">
                    <h3 className="mb-2 text-base font-semibold text-foreground">
                      {t("gaps")}
                    </h3>
                    {unknownFieldNames.length > 0 && (
                      <p className="text-base text-foreground">
                        <span className="font-medium">
                          {t("dontRemember")}
                        </span>
                        {unknownFieldNames.join(", ")}
                      </p>
                    )}
                    {notMentionedFieldNames.length > 0 && (
                      <p className="mt-1 text-base text-muted-foreground">
                        <span className="font-medium">
                          {t("notDiscussed")}
                        </span>
                        {notMentionedFieldNames.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function HomeAndTimelineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPatientId = searchParams.get("patientId") || "";

  const [patients, setPatients] = useState<PatientProfileView[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => r.json())
      .then((data) => {
        if (data.patients) {
          setPatients(data.patients);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <p className="text-base text-muted-foreground">Loading timeline…</p>
    );
  }

  if (error) {
    return (
      <div className="card-calm border-destructive text-destructive">
        Error: {error}
      </div>
    );
  }

  if (selectedPatientId) {
    const currentPatient = patients.find((p) => p.id === selectedPatientId);
    if (!currentPatient) {
      return (
        <p className="text-lg">
          Patient not found.{" "}
          <Link href="/" className="link-calm">
            Home
          </Link>
        </p>
      );
    }

    return (
      <TimelineScreen
        patient={currentPatient}
        onAddMedication={() =>
          router.push(
            `/interview?patientId=${encodeURIComponent(currentPatient.id)}`
          )
        }
      />
    );
  }

  return (
    <HomeScreen
      patients={patients}
      onViewTimeline={(patientId) =>
        router.push(`/?patientId=${encodeURIComponent(patientId)}`)
      }
      onAddMedication={(patientId) =>
        router.push(`/interview?patientId=${encodeURIComponent(patientId)}`)
      }
    />
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="text-base text-muted-foreground">Loading timeline…</p>
      }
    >
      <HomeAndTimelineContent />
    </Suspense>
  );
}
