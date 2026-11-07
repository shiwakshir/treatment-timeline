import { InterviewQuestionCategory } from "@/lib/extraction";

export interface InterviewQuestionDefinition {
  category: InterviewQuestionCategory;
  stepNumber: number;
  titleEn: string;
  titleHi: string;
  questionEn: string;
  questionHi: string;
  placeholderEn: string;
  placeholderHi: string;
}

/**
 * Four guided interview questions asked one at a time for each medication period.
 * Written specifically for this prototype in plain, conversational Hindi (Devanagari)
 * and English — not copied from any published clinical questionnaire.
 */
export const INTERVIEW_QUESTIONS: InterviewQuestionDefinition[] = [
  {
    category: "adherence",
    stepNumber: 1,
    titleEn: "Taking the medicine",
    titleHi: "दवाई लेने का तरीका",
    questionEn:
      "How did taking this medicine fit into your routine? Were you able to take it the way it was written, or were some doses missed or changed?",
    questionHi:
      "यह दवाई अपनी रोज़मर्रा की दिनचर्या में लेना कैसा रहा? क्या आप इसे बताए गए तरीके से ले पाए, या कभी-कभी खुराक छूट जाती थी या बदल जाती थी?",
    placeholderEn:
      "e.g. Roz raat ko leta tha, par hafte mein ek-do baar bhool jaata tha...",
    placeholderHi:
      "उदाहरण: रोज़ रात को लेता था, पर कभी-कभी दफ़्तर के काम में भूल जाता था...",
  },
  {
    category: "effect",
    stepNumber: 2,
    titleEn: "Whether it helped",
    titleHi: "दवाई का असर",
    questionEn:
      "Did you notice any difference in how you felt while on this medicine? Did it help you, and if so, in what way or how much?",
    questionHi:
      "इस दवाई को लेते समय क्या आपको अपने महसूस करने में कोई बदलाव दिखा? क्या इससे कुछ मदद मिली, और अगर हाँ, तो किस तरह या कितनी?",
    placeholderEn:
      "e.g. Shuru mein kuch farak nahi laga, par 3 hafte baad ghabrahat thodi kam hui...",
    placeholderHi:
      "उदाहरण: शुरू में कुछ फ़र्क नहीं लगा, पर कुछ हफ़्तों बाद घबराहट थोड़ी कम हुई...",
  },
  {
    category: "side_effects",
    stepNumber: 3,
    titleEn: "Side effects or difficulties",
    titleHi: "दुष्प्रभाव या परेशानियाँ",
    questionEn:
      "Did you notice any uncomfortable feelings in your body or mind, or any new problems while taking this medicine?",
    questionHi:
      "क्या इस दवाई को लेने के दौरान शरीर या मन में कोई तकलीफ़, बेचैनी, या कोई नई परेशानी महसूस हुई?",
    placeholderEn:
      "e.g. Subah uthne par sar bhaari rehta hai aur muh sookhta tha...",
    placeholderHi:
      "उदाहरण: सुबह उठने पर सर भारी रहता है और मुँह सूखता था...",
  },
  {
    category: "stopping_reason",
    stepNumber: 4,
    titleEn: "Reason for stopping",
    titleHi: "दवाई बंद करने की वजह",
    questionEn:
      "If you have stopped taking this medicine, what led to stopping it? (If you are still taking it now, you can write that.)",
    questionHi:
      "अगर आपने यह दवाई बंद कर दी है, तो इसे बंद करने की क्या वजह रही? (अगर आप अभी भी इसे ले रहे हैं, तो वह लिख सकते हैं।)",
    placeholderEn:
      "e.g. Bahut susti rehti thi isliye bina pooche band kar di, ya doctor ne badal di...",
    placeholderHi:
      "उदाहरण: बहुत सुस्ती रहती थी इसलिए बंद कर दी, या डॉक्टर ने दवाई बदल दी...",
  },
];
