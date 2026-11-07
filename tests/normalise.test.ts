import assert from "node:assert/strict";
import { normalise, checkSafetyKeywords } from "../src/lib/safety";

interface TestCase {
  name: string;
  fn: () => void;
}

const tests: TestCase[] = [
  {
    name: "1. Token boundary: 'spend it all' does NOT match 'end it all'",
    fn: () => {
      const res = checkSafetyKeywords("I got my salary and went to spend it all at the market.");
      assert.equal(res.matched, false, `Expected no match for 'spend it all', got: ${res.matchedPhrase}`);

      const positive = checkSafetyKeywords("Sometimes I feel ready to end it all tonight.");
      assert.equal(positive.matched, true);
      assert.equal(positive.matchedPhrase, "end it all");
    },
  },
  {
    name: "2. Exclusion of 'nai': 'nai dawai' stays 'nai dawai' and is not mapped to 'nahi'",
    fn: () => {
      assert.equal(normalise("nai dawai shuru ki"), "nai dawai shuru ki");
      const res = checkSafetyKeywords("Doctor ne kal se nai dawai likhi hai.");
      assert.equal(res.matched, false);

      // Even in a phrase like "jeene ka mann nai", "nai" is not mapped to "nahi"
      const resNai = checkSafetyKeywords("jeene ka mann nai");
      assert.equal(resNai.matched, false);

      // Whereas "nahi", "nahin", "nhi" all map to "nahi" and match
      for (const variant of [
        "jeene ka mann nahi",
        "jeene ka man nahin",
        "jine ka mn nhi",
      ]) {
        const matchRes = checkSafetyKeywords(variant);
        assert.equal(matchRes.matched, true, `Expected '${variant}' to match`);
        assert.equal(matchRes.matchedPhrase, "jeene ka mann nahi");
      }
    },
  },
  {
    name: "3. Exclusion of 'saas': 'saas nahi aa rahi' (mother-in-law) does NOT match 'saans nahi aa rahi'",
    fn: () => {
      const resSaas = checkSafetyKeywords("Meri saas nahi aa rahi aaj ghar par.");
      assert.equal(
        resSaas.matched,
        false,
        `Expected 'saas nahi aa rahi' NOT to match, but matched: ${resSaas.matchedPhrase}`
      );

      // Whereas "saans" and "sans" DO match "saans nahi aa rahi"
      const resSaans = checkSafetyKeywords("Dawai ke baad saans nahi aa rahi hai.");
      assert.equal(resSaans.matched, true);
      assert.equal(resSaans.matchedPhrase, "saans nahi aa rahi");

      const resSans = checkSafetyKeywords("Dawai ke baad sans nhi aa rahi.");
      assert.equal(resSans.matched, true);
      assert.equal(resSans.matchedPhrase, "saans nahi aa rahi");
    },
  },
  {
    name: "4. Whole-token mapping only: substrings inside longer words are never mapped",
    fn: () => {
      // "man" inside "manzil" or "mana" must not be altered by token map
      const norm = normalise("manzil par jaana mana hai");
      assert.equal(norm, "manzil par jana mana hai");
    },
  },
  {
    name: "5. Devanagari nukta normalisation: ज़/ज, ड़/ड, फ़/फ match as equal",
    fn: () => {
      assert.equal(normalise("ज़िंदगी खत्म कर"), normalise("जिंदगी खत्म कर"));
      assert.equal(normalise("सीने में तेज़ दर्द"), normalise("सीने में तेज दर्द"));

      const resNoNukta = checkSafetyKeywords("मुझे लग रहा है कि जिंदगी खत्म कर लूं");
      assert.equal(resNoNukta.matched, true);
      assert.equal(resNoNukta.matchedPhrase, "ज़िंदगी खत्म कर");

      const resChest = checkSafetyKeywords("गोली के बाद सीने में तेज दर्द हो रहा है");
      assert.equal(resChest.matched, true);
      assert.equal(resChest.matchedPhrase, "सीने में तेज़ दर्द");
    },
  },
  {
    name: "6. Devanagari chandrabindu (ँ) and anusvara (ं) normalisation: साँस/सांस, गोलियाँ/गोलियां, उठूँ/उठूं, दूँ/दूं match as equal",
    fn: () => {
      assert.equal(normalise("साँस नहीं आ रही"), normalise("सांस नहीं आ रही"));
      assert.equal(normalise("सारी गोलियाँ एक साथ"), normalise("सारी गोलियां एक साथ"));
      assert.equal(normalise("सुबह न उठूँ"), normalise("सुबह न उठूं"));
      assert.equal(normalise("सब खत्म कर दूँ"), normalise("सब खत्म कर दूं"));

      const resBreath = checkSafetyKeywords("मुझे सांस नहीं आ रही है");
      assert.equal(resBreath.matched, true);
      assert.equal(resBreath.matchedPhrase, "साँस नहीं आ रही");

      const resPills = checkSafetyKeywords("सोचता हूँ सारी गोलियां एक साथ खा लूँ");
      assert.equal(resPills.matched, true);
      assert.equal(resPills.matchedPhrase, "सारी गोलियाँ एक साथ");

      const resWake = checkSafetyKeywords("बस सो जाऊं और सुबह न उठूं");
      assert.equal(resWake.matched, true);
      assert.equal(resWake.matchedPhrase, "सुबह न उठूँ");
    },
  },
  {
    name: "7. Classifier-only fixtures (fix-18, fix-19, fix-20) have zero keyword matches",
    fn: () => {
      const classifierOnlyTexts = [
        "Kabhi kabhi lagta hai ki agar main na rahun toh kisi ko farak nahi padega.",
        "मुझे लगता है कि अब और सहने की ताकत नहीं बची, बस सब रुक जाए।",
        "Honestly some days I just want everything to stop for good.",
      ];
      for (const text of classifierOnlyTexts) {
        const res = checkSafetyKeywords(text);
        assert.equal(
          res.matched,
          false,
          `Expected 0 keyword matches for classifier_only text "${text}", but matched "${res.matchedPhrase}"`
        );
      }
    },
  },
];

let passed = 0;
console.log("==============================================================");
console.log("  Running normalise() & Keyword Boundary Unit Tests");
console.log("==============================================================");

for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`  [PASS] ${t.name}`);
  } catch (err) {
    console.error(`  [FAIL] ${t.name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("--------------------------------------------------------------");
console.log(`  Result: ${passed}/${tests.length} unit tests passed.`);
console.log("==============================================================\n");
