"use client";

import React, { useEffect, useState } from "react";
import { useLang, useT } from "@/components/ui/i18n";
import { ScreenTitle } from "@/components/ui/screen-shell";

interface TriggerLogEntry {
  id: string;
  createdAt: string;
  eventType: string;
  questionCategory: string | null;
  whichCheckFired: string;
  matchedKeyword: string | null;
  classifierLabel: string | null;
  failureReason: string | null;
  answerText: string | null;
}

export default function SafetyLogsPage() {
  const t = useT();
  const { lang } = useLang();
  const [logs, setLogs] = useState<TriggerLogEntry[]>([]);
  const [devLogTextEnabled, setDevLogTextEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((data) => {
        if (data.logs) setLogs(data.logs);
        setDevLogTextEnabled(Boolean(data.devLogTextEnabled));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <section>
      <ScreenTitle eyebrow={t("logIntro")}>{t("logTitle")}</ScreenTitle>
      <div className="mb-4">
        {devLogTextEnabled ? (
          <span
            id="dev-log-indicator"
            className="inline-block rounded-full border border-caution bg-caution-soft px-3 py-1 text-sm font-semibold text-caution-foreground"
          >
            Answer text logging: ON
          </span>
        ) : (
          <span
            id="dev-log-indicator"
            className="log-label px-3 py-1 text-sm font-semibold"
          >
            Answer text logging: OFF – metadata only
          </span>
        )}
      </div>
      {loading ? (
        <p className="text-base text-muted-foreground">Loading logs…</p>
      ) : (
        <div className="card-calm overflow-x-auto p-0">
          <table className="w-full min-w-[32rem] text-left text-base">
            <thead className="bg-secondary text-secondary-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("time")}</th>
                <th className="px-4 py-3 font-semibold">{t("checkFired")}</th>
                <th className="px-4 py-3 font-semibold">{t("keyword")}</th>
                <th className="px-4 py-3 font-semibold">{t("label")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-foreground">
                    {new Date(e.createdAt).toLocaleString(
                      lang === "hi" ? "hi-IN" : "en-GB",
                      { dateStyle: "medium", timeStyle: "short" }
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-foreground">
                    {e.whichCheckFired}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {e.matchedKeyword ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="log-label">
                      {e.classifierLabel || e.eventType}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
