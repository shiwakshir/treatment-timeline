import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding 3 synthetic patient stories (synthetic data only)...");

  await prisma.extractedExpression.deleteMany();
  await prisma.medicationPeriod.deleteMany();
  await prisma.patientProfile.deleteMany();

  // Story 1: Aarav (Hinglish mix, includes an earlier unknown medicine gap + a sertraline trial)
  const aarav = await prisma.patientProfile.create({
    data: {
      id: "patient-aarav-hinglish",
      displayName: "Aarav (Synthetic Hinglish Profile)",
      preferredLanguage: "en",
      storySummaryEn:
        "Synthetic demo profile: 28-year-old software engineer describing two past medication periods in Hinglish, including an unremembered first tablet and a sertraline trial with disambiguated expressions.",
      storySummaryHi:
        "काल्पनिक डेमो प्रोफ़ाइल: 28 वर्षीय इंजीनियर जिन्होंने हिंग्लिश में दो पुरानी दवाइयों का विवरण दिया है (एक अज्ञात पुरानी दवाई और एक सर्ट्रालिन का कोर्स)।",
    },
  });

  // Aarav Period 1: Unknown medicine in 2023 (demonstrates explicit gaps)
  await prisma.medicationPeriod.create({
    data: {
      patientId: aarav.id,
      genericName: "unknown",
      startDate: "2023-06",
      stopDate: "unknown",
      doseJson: JSON.stringify({
        state: "uncertain",
        value: null,
        statedOptions: ["50 mg", "100 mg"],
      }),
      durationTakenJson: JSON.stringify({
        state: "uncertain",
        value: null,
        statedOptions: ["3 months", "4 months"],
      }),
      onsetAfterStartingJson: JSON.stringify({
        state: "not_mentioned",
        value: null,
        statedOptions: [],
      }),
      doseTimingText: null,
      symptomTimingText: "din bhar",
      adherenceRaw:
        "Dose yaad nahi, shayad 50 thi ya 100, teen-chaar mahine li thi.",
      adherenceJson: JSON.stringify({
        state: "not_mentioned",
        value: null,
        statedOptions: [],
      }),
      effectRaw:
        "Sach kahun toh mujhe bilkul yaad nahi hai ki is dawai se koi fayda hua tha ya nahi, bahut purani baat hai.",
      effectJson: JSON.stringify({
        state: "unknown",
        value: null,
        statedOptions: [],
      }),
      sideEffectsRaw:
        "Dawai से din bhar susti rehti thi.",
      sideEffectsJson: JSON.stringify({
        state: "known",
        value: "present",
        statedOptions: [],
      }),
      stoppingReasonRaw: "Yaad nahi kyun band ki thi.",
      stoppingReasonJson: JSON.stringify({
        state: "unknown",
        value: null,
        statedOptions: [],
      }),
      stoppedByJson: JSON.stringify({
        state: "not_mentioned",
        value: null,
        statedOptions: [],
      }),
      confirmedAt: new Date("2026-10-01T10:00:00Z"),
      expressions: {
        create: [
          {
            questionCategory: "side_effects",
            originalPhrase: "susti rehti thi",
            candidateMeaningsJson: JSON.stringify([
              "Daytime drowsiness or sedation (feeling sleepy from the medication)",
              "Physical fatigue, lethargy, or bodily weakness without sleepiness",
            ]),
            selectedMeaning:
              "Daytime drowsiness or sedation (feeling sleepy from the medication)",
            confidence: "high",
            matchedLexiconTerm: "thakaan aur kamzori",
          },
        ],
      },
    },
  });

  // Aarav Period 2: Sertraline in 2024
  await prisma.medicationPeriod.create({
    data: {
      patientId: aarav.id,
      genericName: "sertraline",
      startDate: "2024-03",
      stopDate: "2024-09",
      doseJson: JSON.stringify({
        state: "known",
        value: "50 mg",
        statedOptions: [],
      }),
      durationTakenJson: JSON.stringify({
        state: "known",
        value: "6 months",
        statedOptions: [],
      }),
      onsetAfterStartingJson: JSON.stringify({
        state: "known",
        value: "days_to_weeks",
        statedOptions: [],
      }),
      doseTimingText: "subah nashta ke baad",
      symptomTimingText: "shaam ko / raat ko",
      adherenceRaw:
        "Roz subah nashta ke baad ek goli leta tha, kabhi Sunday ko chhoot jaati thi.",
      adherenceJson: JSON.stringify({
        state: "known",
        value: "mostly_taken_occasional_missed",
        statedOptions: [],
      }),
      effectRaw:
        "Pehle do hafte kuch farak nahi pada, par baad mein jo baat-baat par dil ghabrata hai woh thoda kam hua.",
      effectJson: JSON.stringify({
        state: "known",
        value: "helped_partially",
        statedOptions: [],
      }),
      sideEffectsRaw:
        "Dawai lene ke baad shaam ko bahut ghabrahat hoti hai aur raat ko neend nahi aati.",
      sideEffectsJson: JSON.stringify({
        state: "known",
        value: "present",
        statedOptions: [],
      }),
      stoppingReasonRaw:
        "Shuru ke dinon mein pet mein gadbad aur neend ki dikkat ke kaaran doctor se pooch kar band ki.",
      stoppingReasonJson: JSON.stringify({
        state: "known",
        value: "side_effects_or_discomfort",
        statedOptions: [],
      }),
      stoppedByJson: JSON.stringify({
        state: "known",
        value: "clinician",
        statedOptions: [],
      }),
      confirmedAt: new Date("2026-10-02T10:00:00Z"),
      expressions: {
        create: [
          {
            questionCategory: "effect",
            originalPhrase: "dil ghabrata hai",
            candidateMeaningsJson: JSON.stringify([
              "Awareness of fast or pounding heartbeat (palpitations)",
              "Sudden emotional dread, sinking feeling, or acute anxiety",
              "Epigastric uneasiness or nausea-like sensation in the upper stomach/chest",
            ]),
            selectedMeaning:
              "Sudden emotional dread, sinking feeling, or acute anxiety",
            confidence: "high",
            matchedLexiconTerm: "dil ghabrata hai",
          },
          {
            questionCategory: "side_effects",
            originalPhrase: "ghabrahat",
            candidateMeaningsJson: JSON.stringify([
              "Psychological anxiety, panic, or sudden sense of fear/dread",
              "Physical restlessness or inner agitation (possible akathisia)",
              "Autonomic symptoms such as racing heart (palpitations) or chest tightness",
            ]),
            selectedMeaning:
              "Physical restlessness or inner agitation (possible akathisia)",
            confidence: "medium",
            matchedLexiconTerm: "ghabrahat",
          },
          {
            questionCategory: "side_effects",
            originalPhrase: "neend nahi aati",
            candidateMeaningsJson: JSON.stringify([
              "Difficulty falling asleep at night (initial insomnia)",
              "Fragmented sleep with frequent nighttime awakenings (maintenance insomnia)",
            ]),
            selectedMeaning:
              "Difficulty falling asleep at night (initial insomnia)",
            confidence: "high",
            matchedLexiconTerm: "neend nahi aati",
          },
        ],
      },
    },
  });

  // Story 2: Meera (Hindi Devanagari profile)
  const meera = await prisma.patientProfile.create({
    data: {
      id: "patient-meera-hindi",
      displayName: "मीरा / Meera (Synthetic Hindi Profile)",
      preferredLanguage: "hi",
      storySummaryEn:
        "Synthetic demo profile: 42-year-old teacher describing past escitalopram and clonazepam periods in Hindi (Devanagari).",
      storySummaryHi:
        "काल्पनिक डेमो प्रोफ़ाइल: 42 वर्षीय शिक्षिका जिन्होंने देवनागरी हिन्दी में अपनी पुरानी दवाइयों (एस्सिटालोप्राम और क्लोनाज़ेपम) का अनुभव साझा किया है।",
    },
  });

  await prisma.medicationPeriod.create({
    data: {
      patientId: meera.id,
      genericName: "escitalopram",
      startDate: "2024-01",
      stopDate: "2024-04",
      doseJson: JSON.stringify({
        state: "known",
        value: "10 mg",
        statedOptions: [],
      }),
      durationTakenJson: JSON.stringify({
        state: "known",
        value: "3 months",
        statedOptions: [],
      }),
      onsetAfterStartingJson: JSON.stringify({
        state: "not_mentioned",
        value: null,
        statedOptions: [],
      }),
      doseTimingText: "रोज़ सुबह",
      symptomTimingText: "सुबह उठने के बाद पूरा दिन",
      adherenceRaw: "मैंने डॉक्टर के बताए अनुसार रोज़ सुबह एक गोली ली थी।",
      adherenceJson: JSON.stringify({
        state: "known",
        value: "taken_as_prescribed",
        statedOptions: [],
      }),
      effectRaw: "इस दवाई से anxiety थोड़ी कम हुई पर weight बढ़ गया।",
      effectJson: JSON.stringify({
        state: "known",
        value: "helped_partially",
        statedOptions: [],
      }),
      sideEffectsRaw:
        "सुबह उठने के बाद पूरा दिन सर भारी रहता है और बार-बार मुँह सूखता था।",
      sideEffectsJson: JSON.stringify({
        state: "known",
        value: "present",
        statedOptions: [],
      }),
      stoppingReasonRaw:
        "सुबह उठते वक्त चक्कर आते थे और दिन भर शरीर में कमज़ोरी रहती थी, इसलिए मैंने तीन महीने बाद दवाई छोड़ दी।",
      stoppingReasonJson: JSON.stringify({
        state: "known",
        value: "side_effects_or_discomfort",
        statedOptions: [],
      }),
      stoppedByJson: JSON.stringify({
        state: "known",
        value: "self",
        statedOptions: [],
      }),
      confirmedAt: new Date("2026-10-05T10:00:00Z"),
      expressions: {
        create: [
          {
            questionCategory: "side_effects",
            originalPhrase: "सर भारी रहता है",
            candidateMeaningsJson: JSON.stringify([
              "Tension-type headache or physical pressure in the head",
              "Daytime sedation, grogginess, or cognitive fog from the medication",
              "Orthostatic lightheadedness or dizziness",
            ]),
            selectedMeaning:
              "Daytime sedation, grogginess, or cognitive fog from the medication",
            confidence: "high",
            matchedLexiconTerm: "sar bhaari rehta hai",
          },
          {
            questionCategory: "side_effects",
            originalPhrase: "मुँह सूखता था",
            candidateMeaningsJson: JSON.stringify([
              "Dry mouth (xerostomia / anticholinergic side effect)",
            ]),
            selectedMeaning:
              "Dry mouth (xerostomia / anticholinergic side effect)",
            confidence: "high",
            matchedLexiconTerm: "muh sookhna",
          },
          {
            questionCategory: "stopping_reason",
            originalPhrase: "चक्कर आते थे",
            candidateMeaningsJson: JSON.stringify([
              "Lightheadedness or feeling faint upon standing (orthostatic dizziness)",
              "Spinning sensation (true vertigo) or vestibular imbalance",
            ]),
            selectedMeaning:
              "Lightheadedness or feeling faint upon standing (orthostatic dizziness)",
            confidence: "high",
            matchedLexiconTerm: "chakkar aana",
          },
        ],
      },
    },
  });

  await prisma.medicationPeriod.create({
    data: {
      patientId: meera.id,
      genericName: "clonazepam",
      startDate: "2024-06",
      stopDate: "2024-08",
      doseJson: JSON.stringify({
        state: "unknown",
        value: null,
        statedOptions: [],
      }),
      durationTakenJson: JSON.stringify({
        state: "known",
        value: "2 months",
        statedOptions: [],
      }),
      onsetAfterStartingJson: JSON.stringify({
        state: "not_mentioned",
        value: null,
        statedOptions: [],
      }),
      doseTimingText: "रात को सोने से पहले",
      symptomTimingText: "गोली खाने के एक घंटे बाद",
      adherenceRaw: "रात को सोने से पहले लेती थी।",
      adherenceJson: JSON.stringify({
        state: "known",
        value: "taken_as_prescribed",
        statedOptions: [],
      }),
      effectRaw: "इस दवाई से मेरी नींद पहले से काफी बेहतर हो गई थी।",
      effectJson: JSON.stringify({
        state: "known",
        value: "helped_significantly",
        statedOptions: [],
      }),
      sideEffectsRaw:
        "गोली खाने के एक घंटे बाद शरीर में बहुत बेचैनी होती थी और चाय का कप पकड़ते समय हाथ कांपते थे।",
      sideEffectsJson: JSON.stringify({
        state: "known",
        value: "present",
        statedOptions: [],
      }),
      stoppingReasonRaw:
        "दवाई से तो आराम था, लेकिन हमारे पास के मेडिकल स्टोर पर यह मिलना बंद हो गई और काफी महंगी भी पड़ रही थी, इसलिए बंद करनी पड़ी।",
      stoppingReasonJson: JSON.stringify({
        state: "known",
        value: "cost_or_availability",
        statedOptions: [],
      }),
      stoppedByJson: JSON.stringify({
        state: "not_mentioned",
        value: null,
        statedOptions: [],
      }),
      confirmedAt: new Date("2026-10-06T10:00:00Z"),
      expressions: {
        create: [
          {
            questionCategory: "side_effects",
            originalPhrase: "बहुत बेचैनी",
            candidateMeaningsJson: JSON.stringify([
              "Motor restlessness or inability to sit still (possible akathisia)",
              "Psychological worry, inner tension, or emotional unease",
            ]),
            selectedMeaning:
              "Motor restlessness or inability to sit still (possible akathisia)",
            confidence: "high",
            matchedLexiconTerm: "bechaini",
          },
          {
            questionCategory: "side_effects",
            originalPhrase: "हाथ कांपते थे",
            candidateMeaningsJson: JSON.stringify([
              "Hand tremor (involuntary shaking of the hands)",
            ]),
            selectedMeaning: "Hand tremor (involuntary shaking of the hands)",
            confidence: "high",
            matchedLexiconTerm: "haath kaampna",
          },
        ],
      },
    },
  });

  // Story 3: Rohan (English with Hinglish idioms)
  const rohan = await prisma.patientProfile.create({
    data: {
      id: "patient-rohan-english",
      displayName: "Rohan (Synthetic English & Hinglish Profile)",
      preferredLanguage: "en",
      storySummaryEn:
        "Synthetic demo profile: 34-year-old accountant describing amitriptyline in English with Hinglish phrases.",
      storySummaryHi:
        "काल्पनिक डेमो प्रोफ़ाइल: 34 वर्षीय अकाउंटेंट जिन्होंने अंग्रेज़ी और हिंग्लिश में एमिट्रिप्टिलाइन दवाई का विवरण दिया है।",
    },
  });

  await prisma.medicationPeriod.create({
    data: {
      patientId: rohan.id,
      genericName: "amitriptyline",
      startDate: "2025-01",
      stopDate: "2025-05",
      doseJson: JSON.stringify({
        state: "known",
        value: "25 mg",
        statedOptions: [],
      }),
      durationTakenJson: JSON.stringify({
        state: "known",
        value: "4 months",
        statedOptions: [],
      }),
      onsetAfterStartingJson: JSON.stringify({
        state: "known",
        value: "days_to_weeks",
        statedOptions: [],
      }),
      doseTimingText: "every night after dinner",
      symptomTimingText: "next morning",
      adherenceRaw:
        "I took one tablet every night after dinner as told, though I missed two or three Sundays when travelling.",
      adherenceJson: JSON.stringify({
        state: "known",
        value: "mostly_taken_occasional_missed",
        statedOptions: [],
      }),
      effectRaw:
        "Dawai se mann udaas rehta hai aur susti aati hai, par koi galat khayal nahi aata aur main ghar ke kaam kar leta hoon.",
      effectJson: JSON.stringify({
        state: "known",
        value: "worsened_or_unpleasant",
        statedOptions: [],
      }),
      sideEffectsRaw:
        "The night dose knocked me out completely—I slept like a log for 11 hours and felt groggy at work the next morning.",
      sideEffectsJson: JSON.stringify({
        state: "known",
        value: "present",
        statedOptions: [],
      }),
      stoppingReasonRaw:
        "Is goli se mera dimaag sunn ho gaya tha aur shuru ke dinon mein pet mein gadbad rehti thi.",
      stoppingReasonJson: JSON.stringify({
        state: "known",
        value: "side_effects_or_discomfort",
        statedOptions: [],
      }),
      stoppedByJson: JSON.stringify({
        state: "known",
        value: "self",
        statedOptions: [],
      }),
      confirmedAt: new Date("2026-10-10T10:00:00Z"),
      expressions: {
        create: [
          {
            questionCategory: "effect",
            originalPhrase: "mann udaas rehta hai",
            candidateMeaningsJson: JSON.stringify([
              "Depressed mood or persistent sadness",
              "Anhedonia (loss of interest/pleasure) or medication-induced emotional blunting",
            ]),
            selectedMeaning:
              "Anhedonia (loss of interest/pleasure) or medication-induced emotional blunting",
            confidence: "high",
            matchedLexiconTerm: "mann udaas rehta hai",
          },
          {
            questionCategory: "side_effects",
            originalPhrase: "felt groggy",
            candidateMeaningsJson: JSON.stringify([
              "Daytime drowsiness, sedation, or morning hangover effect",
            ]),
            selectedMeaning:
              "Daytime drowsiness, sedation, or morning hangover effect",
            confidence: "high",
            matchedLexiconTerm: null,
          },
          {
            questionCategory: "stopping_reason",
            originalPhrase: "dimaag sunn ho gaya",
            candidateMeaningsJson: JSON.stringify([
              "Emotional blunting (feeling emotionally numb or flat)",
              "Cognitive slowing or difficulty concentrating (brain fog)",
            ]),
            selectedMeaning:
              "Cognitive slowing or difficulty concentrating (brain fog)",
            confidence: "high",
            matchedLexiconTerm: "dimaag sunn ho gaya",
          },
        ],
      },
    },
  });

  console.log("Seed complete: created 3 synthetic patient profiles.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
