"use client";

import React, { useEffect, useState } from "react";

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
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded p-4 space-y-2">
        <h1 className="text-xl font-bold">
          Safety Trigger & Fail-Safe Review Log
        </h1>
        <p className="text-sm text-gray-700">
          Every urgent safety trigger and every classifier fail-safe event is
          logged below. By default, only metadata is stored. Raw answer text is
          stored only when <code>DEV_LOG_TEXT=true</code> in{" "}
          <code>.env.local</code>.
        </p>
        <div className="text-xs font-medium text-gray-600">
          Current <code>DEV_LOG_TEXT</code> status:{" "}
          <span className="font-bold">
            {devLogTextEnabled
              ? "ENABLED (true)"
              : "DISABLED (false – metadata only)"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="p-4 text-sm text-gray-600">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded p-6 text-sm text-gray-600">
          No safety triggers or fail-safe events have been logged yet.
        </div>
      ) : (
        <div className="bg-white border border-gray-300 rounded overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="p-3 font-semibold">Timestamp</th>
                <th className="p-3 font-semibold">Event Type</th>
                <th className="p-3 font-semibold">Question Step</th>
                <th className="p-3 font-semibold">Which Check Fired</th>
                <th className="p-3 font-semibold">Matched Keyword</th>
                <th className="p-3 font-semibold">Classifier Label</th>
                <th className="p-3 font-semibold">Answer Text (if DEV_LOG_TEXT)</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-200">
                  <td className="p-3 text-xs text-gray-600">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        log.eventType === "URGENT_TRIGGER"
                          ? "bg-red-100 text-red-900"
                          : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {log.eventType}
                    </span>
                  </td>
                  <td className="p-3">{log.questionCategory || "—"}</td>
                  <td className="p-3 font-mono text-xs">
                    {log.whichCheckFired}
                  </td>
                  <td className="p-3">{log.matchedKeyword || "—"}</td>
                  <td className="p-3 font-mono text-xs">
                    {log.classifierLabel || "—"}
                  </td>
                  <td className="p-3 text-xs text-gray-500">
                    {log.answerText ?? "[redacted – metadata only]"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
