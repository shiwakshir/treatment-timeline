"use client";

import React from "react";
import { SAFETY_HELPLINES, type CountryHelplines } from "@/config/safety-helplines";
import { useLang, useT } from "./i18n";

export function Helplines({
  size,
  helplines = SAFETY_HELPLINES,
  prioritizeEmergency = false,
}: {
  size: "large" | "small";
  helplines?: CountryHelplines[];
  prioritizeEmergency?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();

  if (size === "large" && prioritizeEmergency) {
    // Extract 999 and 112 to display first and largest
    const emergencyItems: Array<{
      countryTitle: string;
      serviceLabel: string;
      number: string;
      telHref: string;
    }> = [];

    for (const group of helplines) {
      const countryTitle =
        lang === "hi" ? group.countryNameHi : group.countryNameEn;
      for (const c of group.contacts) {
        const cleanNum = c.number.trim();
        if (cleanNum === "999" || cleanNum === "112") {
          emergencyItems.push({
            countryTitle,
            serviceLabel: lang === "hi" ? c.serviceHi : c.serviceEn,
            number: c.number,
            telHref: c.number.replace(/\s+/g, ""),
          });
        }
      }
    }

    return (
      <div className="space-y-8">
        <div className="space-y-3">
          {emergencyItems.map((em) => (
            <a
              key={`emergency-${em.number}`}
              href={`tel:${em.telHref}`}
              className="btn-call py-5"
            >
              <span className="text-left">
                <span className="block text-base font-medium opacity-90">
                  {em.countryTitle} — {em.serviceLabel}
                </span>
                <span className="block text-4xl font-bold tracking-wide">
                  {em.number}
                </span>
              </span>
              <span className="shrink-0 text-lg font-semibold">
                {t("call")} →
              </span>
            </a>
          ))}
        </div>

        <div className="space-y-6">
          {helplines.map((group) => {
            const title =
              lang === "hi" ? group.countryNameHi : group.countryNameEn;
            const nonEmergency = group.contacts.filter(
              (c) => c.number.trim() !== "999" && c.number.trim() !== "112"
            );
            if (nonEmergency.length === 0) return null;
            return (
              <div key={group.countryCode}>
                <h2 className="mb-3 text-xl font-semibold">{title}</h2>
                <ul className="space-y-3">
                  {nonEmergency.map((c) => {
                    const telHref = c.number.replace(/\s+/g, "");
                    const label = lang === "hi" ? c.serviceHi : c.serviceEn;
                    return (
                      <li key={`${group.countryCode}-${c.number}`}>
                        <a href={`tel:${telHref}`} className="btn-call">
                          <span className="text-left">
                            <span className="block text-base font-medium opacity-90">
                              {label}
                            </span>
                            <span className="block text-2xl font-bold tracking-wide">
                              {c.number}
                            </span>
                          </span>
                          <span className="shrink-0 text-base font-semibold">
                            {t("call")} →
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className={size === "large" ? "space-y-6" : "grid gap-4 sm:grid-cols-2"}
    >
      {helplines.map((group) => {
        const title = lang === "hi" ? group.countryNameHi : group.countryNameEn;
        return (
          <div key={group.countryCode}>
            <h2
              className={
                size === "large"
                  ? "mb-3 text-xl font-semibold"
                  : "mb-2 text-base font-semibold"
              }
            >
              {title}
            </h2>
            <ul className={size === "large" ? "space-y-3" : "space-y-1.5"}>
              {group.contacts.map((c) => {
                const telHref = c.number.replace(/\s+/g, "");
                const label = lang === "hi" ? c.serviceHi : c.serviceEn;
                return (
                  <li key={`${group.countryCode}-${c.number}`}>
                    {size === "large" ? (
                      <a href={`tel:${telHref}`} className="btn-call">
                        <span className="text-left">
                          <span className="block text-base font-medium opacity-90">
                            {label}
                          </span>
                          <span className="block text-3xl font-bold tracking-wide">
                            {c.number}
                          </span>
                        </span>
                        <span className="shrink-0 text-base font-semibold">
                          {t("call")} →
                        </span>
                      </a>
                    ) : (
                      <a
                        href={`tel:${telHref}`}
                        className="flex justify-between gap-3 text-base underline-offset-4 hover:underline"
                      >
                        <span>{label}</span>
                        <span className="shrink-0 font-semibold">
                          {c.number}
                        </span>
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
