// Verify before any real use.
// Emergency and mental health support contact numbers for the Urgent Help and Fail-Safe screens.

export interface HelplineEntry {
  serviceEn: string;
  serviceHi: string;
  number: string;
  notesEn: string;
  notesHi: string;
}

export interface CountryHelplines {
  countryCode: "UK" | "IN";
  countryNameEn: string;
  countryNameHi: string;
  contacts: HelplineEntry[];
}

// Verify before any real use.
export const SAFETY_HELPLINES: CountryHelplines[] = [
  {
    countryCode: "UK",
    countryNameEn: "United Kingdom (UK)",
    countryNameHi: "यूनाइटेड किंगडम (UK)",
    contacts: [
      {
        serviceEn: "Emergency Services",
        serviceHi: "आपातकालीन सेवाएं (Emergency)",
        number: "999",
        notesEn: "999 for emergencies (immediate danger to life or severe physical reaction)",
        notesHi: "आपातकालीन स्थिति या गंभीर शारीरिक प्रतिक्रिया के लिए 999 पर कॉल करें",
      },
      {
        serviceEn: "NHS 111 – urgent medical help (option 2 for mental health)",
        serviceHi: "NHS 111 – तुरंत डॉक्टरी मदद (मानसिक स्वास्थ्य के लिए 2 दबाएँ)",
        number: "111",
        notesEn: "NHS 111 (select option 2 for mental health crisis support)",
        notesHi: "NHS 111 (मानसिक स्वास्थ्य सहायता के लिए विकल्प 2 चुनें)",
      },
      {
        serviceEn: "Samaritans",
        serviceHi: "Samaritans (समारिटन्स)",
        number: "116 123",
        notesEn: "Free 24/7 confidential listening support",
        notesHi: "24 घंटे नि:शुल्क और गोपनीय भावनात्मक सहायता",
      },
    ],
  },
  {
    countryCode: "IN",
    countryNameEn: "India (भारत)",
    countryNameHi: "भारत (India)",
    contacts: [
      {
        serviceEn: "National Emergency Number",
        serviceHi: "राष्ट्रीय आपातकालीन नंबर",
        number: "112",
        notesEn: "112 for emergencies (medical, police, or immediate crisis)",
        notesHi: "किसी भी आपातकालीन या गंभीर स्वास्थ्य स्थिति के लिए 112 पर कॉल करें",
      },
      {
        serviceEn: "Tele-MANAS (National Tele Mental Health Programme)",
        serviceHi: "टेली-मानस (Tele-MANAS राष्ट्रीय मानसिक स्वास्थ्य हेल्पलाइन)",
        number: "14416",
        notesEn: "Free 24/7 government mental health helpline in Hindi, English, and regional languages (also 1800-891-4416)",
        notesHi: "24/7 नि:शुल्क सरकारी मानसिक स्वास्थ्य हेल्पलाइन (हिन्दी और अंग्रेज़ी में उपलब्ध)",
      },
    ],
  },
];
