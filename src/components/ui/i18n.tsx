"use client";

import React, { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "en" | "hi";

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  React.useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("tt_lang");
      if (saved === "hi" || saved === "en") {
        setLangState(saved);
      } else {
        setLangState("en");
      }
    } catch {
      setLangState("en");
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      window.sessionStorage.setItem("tt_lang", l);
    } catch {
      // Fall back to in-memory state (defaulting to English on reload) if sessionStorage is unavailable
    }
  };

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);

export const T = {
  // --- Existing app labels preserved from src/lib/timeline.ts & src/app/* ---
  banner: {
    en: "Prototype – not for clinical use – do not enter real information",
    hi: "Prototype – not for clinical use – do not enter real information",
  },
  safetyLog: { en: "Safety Trigger Log", hi: "सुरक्षा लॉग" },
  medicine: { en: "Medicine Name (Generic Name)", hi: "दवाई का नाम" },
  dose: { en: "Dose", hi: "खुराक" },
  startMonth: { en: "Start date", hi: "शुरू करने का समय" },
  stopMonth: { en: "Stop date", hi: "बंद करने का समय" },
  duration: { en: "Duration taken", hi: "कितने समय तक ली" },
  whenTaken: { en: "When you took the medicine", hi: "आप दवाई कब लेते थे" },
  whenProblems: {
    en: "When the effect or side effect happened",
    hi: "परेशानी कब होती थी",
  },
  onset: {
    en: "Onset after starting",
    hi: "असर या परेशानी कब शुरू हुई",
  },
  adherence: { en: "How you took it", hi: "आपने दवाई कैसे ली" },
  effect: { en: "Whether it helped", hi: "दवाई का असर" },
  sideEffects: { en: "Side effects", hi: "परेशानी या साइड इफेक्ट" },
  stoppingReason: { en: "Reason for stopping", hi: "बंद करने की वजह" },
  stoppedBy: {
    en: "Who decided to stop it",
    hi: "दवाई बंद करने का फ़ैसला किसने लिया",
  },
  meaning: { en: "Confirmed meaning", hi: "पुष्ट किया गया अर्थ" },
  gaps: { en: "Gaps", hi: "अधूरी जानकारी / गैप्स" },
  notDiscussed: {
    en: "Not discussed yet: ",
    hi: "इनके बारे में आपने अभी कुछ नहीं बताया: ",
  },
  dontRemember: { en: "You don't remember: ", hi: "आपको याद नहीं: " },
  noMeds: {
    en: "No confirmed medication periods yet.",
    hi: "अभी तक कोई पुष्ट दवाई अवधि नहीं है।",
  },
  unknownMed: { en: "Unknown medicine", hi: "अज्ञात दवाई" },
  addMedication: { en: "Add Medication Period", hi: "दवाई जोड़ें" },

  // --- New UI strings ported & refined ---
  appName: { en: "Treatment Timeline", hi: "उपचार टाइमलाइन" },
  home: { en: "Home", hi: "होम" },
  homeTitle: {
    en: "Whose history are we looking at?",
    hi: "किसकी दवाइयों का रिकॉर्ड देखना है?",
  },
  homeIntro: {
    en: "These are made-up people for trying out the app.",
    hi: "ये ऐप आज़माने के लिए काल्पनिक लोग हैं।",
  },
  viewTimeline: { en: "View timeline", hi: "टाइमलाइन देखें" },
  medicines: { en: "medicines", hi: "दवाइयाँ" },
  dontKnow: { en: "I don't know", hi: "मुझे नहीं पता" },
  notSure: { en: "I'm not sure", hi: "पक्का याद नहीं" },
  notSureHint: { en: "Enter each possibility", hi: "हर संभावना लिखें" },
  addAnother: { en: "+ Add another", hi: "+ एक और" },
  continue: { en: "Continue", hi: "आगे बढ़ें" },
  back: { en: "Back", hi: "पीछे" },
  addTitle: { en: "Add a medicine", hi: "एक दवाई जोड़ें" },
  addIntro: {
    en: "Fill in what you remember. It's fine not to know.",
    hi: "जो याद है वह भरें। न पता होना ठीक है।",
  },
  questionOf: { en: "Question {n} of {t}", hi: "सवाल {n} / {t}" },
  next: { en: "Next", hi: "अगला" },
  skip: { en: "Skip this question", hi: "यह सवाल छोड़ें" },
  statusNoted: {
    en: "Got it — meaning noted",
    hi: "समझ गए — अर्थ नोट कर लिया",
  },
  statusSaving: {
    en: "Saving to the timeline…",
    hi: "टाइमलाइन में सेव हो रहा है…",
  },
  statusSaved: { en: "Saved", hi: "सेव हो गया" },
  checking: {
    en: "Checking your answer…",
    hi: "आपका जवाब देखा जा रहा है…",
  },
  meaningTitle: { en: "What did you mean?", hi: "आपका मतलब क्या था?" },
  meaningIntro: { en: "You said:", hi: "आपने कहा:" },
  noneOfThese: {
    en: "None of these – let me explain",
    hi: "इनमें से कोई नहीं – मुझे अपने शब्दों में बताना है",
  },
  explainPlaceholder: {
    en: "Tell us in your own words",
    hi: "अपने शब्दों में बताएँ",
  },
  readBackTitle: { en: "Is this right?", hi: "क्या यह सही है?" },
  readBackIntro: {
    en: "Here is what we understood. Nothing is saved until you say yes.",
    hi: "हमने यह समझा। आपके 'हाँ' कहने तक कुछ भी सेव नहीं होगा।",
  },
  yesRight: { en: "Yes, this is right", hi: "हाँ, यह सही है" },
  changeSomething: { en: "Change something", hi: "कुछ बदलें" },
  urgentTitle: {
    en: "We're glad you told us. You don't have to face this alone.",
    hi: "आपने हमें बताया, यह अच्छा किया। आपको इसका अकेले सामना नहीं करना है।",
  },
  urgentBody: {
    en: "What you wrote sounds like you might be in danger. Please talk to someone who can help now. If you are in immediate danger, call 999 (UK) or 112 (India). These numbers are free to call.",
    hi: "आपने जो लिखा, उससे लगता है कि आप ख़तरे में हो सकते हैं। कृपया अभी किसी ऐसे व्यक्ति से बात करें जो मदद कर सके। अगर आप तुरंत ख़तरे में हैं, तो 999 (UK) या 112 (भारत) पर कॉल करें। इन नंबरों पर कॉल करना मुफ़्त है।",
  },
  urgentPhysicalTitle: {
    en: "This may be a medical emergency.",
    hi: "यह एक मेडिकल इमरजेंसी हो सकती है।",
  },
  urgentPhysicalBody: {
    en: "Call an ambulance now. UK: 999. India: 112. If you can, ask someone to stay with you.",
    hi: "अभी एम्बुलेंस बुलाएँ। UK: 999। भारत: 112। अगर हो सके, तो किसी को अपने पास रुकने के लिए कहें।",
  },
  call: { en: "Call", hi: "कॉल करें" },
  iAmSafe: {
    en: "I am safe – go back to home",
    hi: "मैं सुरक्षित हूँ – होम पर जाएँ",
  },
  pausedTitle: {
    en: "We couldn't check your answer",
    hi: "हम आपका जवाब जाँच नहीं पाए",
  },
  pausedBody: {
    en: "Something went wrong on our side. Your words are kept — nothing is lost. Please try again.",
    hi: "हमारी तरफ़ से कुछ गड़बड़ हुई। आपने जो लिखा है, वह मिटा नहीं है। कृपया फिर से कोशिश करें।",
  },
  pausedHelp: {
    en: "If you need to talk to someone now:",
    hi: "अगर अभी किसी से बात करनी है:",
  },
  tryAgain: { en: "Try again", hi: "फिर से कोशिश करें" },
  timelineOf: {
    en: "{name}'s medicine timeline",
    hi: "{name} की दवाई टाइमलाइन",
  },
  logTitle: {
    en: "Safety log (developer view)",
    hi: "सुरक्षा लॉग (डेवलपर व्यू)",
  },
  logIntro: {
    en: "By default, answer text is not shown or stored here.",
    hi: "डिफ़ॉल्ट रूप से, जवाब का टेक्स्ट यहाँ न दिखाया जाता है, न रखा जाता है।",
  },
  time: { en: "Time", hi: "समय" },
  checkFired: { en: "Check that fired", hi: "कौन सा चेक चला" },
  keyword: { en: "Matched keyword", hi: "मिला हुआ शब्द" },
  label: { en: "Label", hi: "लेबल" },
} as const;

export type TKey = keyof typeof T;

export function useT() {
  const { lang } = useLang();
  return (key: TKey, vars?: Record<string, string | number>) => {
    let s: string = T[key][lang];
    for (const [k, v] of Object.entries(vars ?? {})) {
      s = s.replace(`{${k}}`, String(v));
    }
    return s;
  };
}
