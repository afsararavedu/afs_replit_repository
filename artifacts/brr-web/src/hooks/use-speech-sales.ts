import { useState, useRef, useCallback, useEffect } from "react";

interface SpeechSalesCallbacks {
  onUpdateRow: (match: { brandNumber?: string; brandName?: string; size?: string }, fields: { closingCases?: number; closingBottles?: number; breakage?: number }) => void;
  onSave: () => void;
  onSubmit: () => void;
  onSelectDate: (dateStr: string) => void;
  onPageChange: (direction: "next" | "prev" | "first" | "last" | number) => void;
}

interface SpeechSalesResult {
  isListening: boolean;
  transcript: string;
  lastAction: string;
  error: string | null;
  supported: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  clearError: () => void;
}

const MONTH_MAP: Record<string, string> = {
  january: "01", jan: "01",
  february: "02", feb: "02",
  march: "03", mar: "03",
  april: "04", apr: "04",
  may: "05",
  june: "06", jun: "06",
  july: "07", jul: "07",
  august: "08", aug: "08",
  september: "09", sep: "09", sept: "09",
  october: "10", oct: "10",
  november: "11", nov: "11",
  december: "12", dec: "12",
};

const ORDINAL_ENTRIES: [string, number][] = [
  ["thirty first", 31], ["thirty-first", 31],
  ["twenty ninth", 29], ["twenty-ninth", 29],
  ["twenty eighth", 28], ["twenty-eighth", 28],
  ["twenty seventh", 27], ["twenty-seventh", 27],
  ["twenty sixth", 26], ["twenty-sixth", 26],
  ["twenty fifth", 25], ["twenty-fifth", 25],
  ["twenty fourth", 24], ["twenty-fourth", 24],
  ["twenty third", 23], ["twenty-third", 23],
  ["twenty second", 22], ["twenty-second", 22],
  ["twenty first", 21], ["twenty-first", 21],
  ["thirtieth", 30], ["30th", 30],
  ["twenty ninth", 29],
  ["nineteenth", 19], ["19th", 19],
  ["eighteenth", 18], ["18th", 18],
  ["seventeenth", 17], ["17th", 17],
  ["sixteenth", 16], ["16th", 16],
  ["fifteenth", 15], ["15th", 15],
  ["fourteenth", 14], ["14th", 14],
  ["thirteenth", 13], ["13th", 13],
  ["twelfth", 12], ["12th", 12],
  ["eleventh", 11], ["11th", 11],
  ["tenth", 10], ["10th", 10],
  ["ninth", 9], ["9th", 9],
  ["eighth", 8], ["8th", 8],
  ["seventh", 7], ["7th", 7],
  ["sixth", 6], ["6th", 6],
  ["fifth", 5], ["5th", 5],
  ["fourth", 4], ["4th", 4],
  ["third", 3], ["3rd", 3],
  ["second", 2], ["2nd", 2],
  ["first", 1], ["1st", 1],
  ["31st", 31], ["29th", 29], ["28th", 28], ["27th", 27], ["26th", 26],
  ["25th", 25], ["24th", 24], ["23rd", 23], ["22nd", 22], ["21st", 21],
  ["20th", 20],
];

const WORD_TO_NUM: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

function wordsToNumber(text: string): number | null {
  const cleaned = text.trim().toLowerCase();
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);
  if (WORD_TO_NUM[cleaned] !== undefined) return WORD_TO_NUM[cleaned];
  let total = 0;
  let current = 0;
  for (const word of cleaned.split(/\s+/)) {
    const val = WORD_TO_NUM[word];
    if (val === undefined) return null;
    if (val === 100) {
      current = (current || 1) * 100;
    } else {
      current += val;
    }
  }
  total += current;
  return total > 0 || cleaned === "zero" ? total : null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function parseDate(text: string): string | null {
  const lower = text.toLowerCase().trim();
  if (/today/i.test(lower)) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  if (/yesterday/i.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let day: number | null = null;
  let month: string | null = null;
  let year: number | null = null;

  for (const [word, num] of ORDINAL_ENTRIES) {
    if (lower.includes(word)) { day = num; break; }
  }
  if (!day) {
    const dayMatch = lower.match(/\b(\d{1,2})\b/);
    if (dayMatch) {
      const parsed = parseInt(dayMatch[1], 10);
      if (parsed >= 1 && parsed <= 31) day = parsed;
    }
  }

  for (const [word, m] of Object.entries(MONTH_MAP)) {
    if (lower.includes(word)) { month = m; break; }
  }

  const yearMatch = lower.match(/\b(20\d{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  if (day && month) {
    const y = year || new Date().getFullYear();
    const monthNum = parseInt(month, 10);
    if (!isValidDate(y, monthNum, day)) return null;
    return `${y}-${month}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

interface ParsedCommand {
  type: "update" | "save" | "submit" | "date" | "page" | "unknown";
  match?: { brandNumber?: string; brandName?: string; size?: string };
  fields?: { closingCases?: number; closingBottles?: number; breakage?: number };
  dateStr?: string;
  pageDirection?: "next" | "prev" | "first" | "last" | number;
}

function extractNumber(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  const captured = match[1].trim();
  return wordsToNumber(captured);
}

function parseTranscript(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();

  if (/save\s*(and|&)?\s*submit/i.test(lower)) {
    return { type: "submit" };
  }
  if (/\bsubmit\s*sales?\b/i.test(lower) || /^\s*submit\s*$/i.test(lower)) {
    return { type: "submit" };
  }
  if (/\bsave\s*sales?\b/i.test(lower) || (/\bsave\b/i.test(lower) && !/select|date/i.test(lower))) {
    return { type: "save" };
  }

  // Page navigation commands — checked before brand/number extraction so
  // "next", "previous", "first", "last" are not confused with field values.
  if (/\bnext\s*page\b|\bgo\s*(to\s*)?next\b|\bpage\s*next\b/i.test(lower)) {
    return { type: "page", pageDirection: "next" };
  }
  if (/\b(previous|prev|back|prior)\s*page\b|\bgo\s*(to\s*)?(previous|prev|back)\b|\bpage\s*(previous|prev|back)\b/i.test(lower)) {
    return { type: "page", pageDirection: "prev" };
  }
  if (/\bfirst\s*page\b|\bgo\s*(to\s*)?first\s*page\b|\bpage\s*one\b|\bpage\s*1\b/i.test(lower)) {
    return { type: "page", pageDirection: "first" };
  }
  if (/\blast\s*page\b|\bgo\s*(to\s*)?last\s*page\b/i.test(lower)) {
    return { type: "page", pageDirection: "last" };
  }
  const goToPageMatch = lower.match(/\bpage\s+(\w[\w\s]*)/i) || lower.match(/\bgo\s+to\s+page\s+(\w[\w\s]*)/i);
  if (goToPageMatch) {
    const num = wordsToNumber(goToPageMatch[1].trim());
    if (num !== null && num >= 1) return { type: "page", pageDirection: num };
  }

  if (/select.*date|date.*today|date.*yesterday|\b\d{1,2}\w*\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(lower) ||
      /\b(today|yesterday)\b/i.test(lower)) {
    const dateStr = parseDate(lower);
    if (dateStr) return { type: "date", dateStr };
  }

  const brandNoMatch = lower.match(/brand\s*(?:number|no\.?|#)?\s*(\d{2,6})/i) || lower.match(/\b(\d{4,6})\b/);
  const brandNumber = brandNoMatch ? brandNoMatch[1] : undefined;

  const sizeMatch = lower.match(/(\d+)\s*(?:ml|m\.?l\.?)/i) || lower.match(/size\s*(\d+)/i);
  const size = sizeMatch ? sizeMatch[1] + "ml" : undefined;

  const closingCases = extractNumber(lower, /(?:closing\s*)?(?:cases?|cs)\s+([\d]+(?:\s+[\d]+)*|[a-z]+(?:\s+[a-z]+)*)/i) ??
                       extractNumber(lower, /([\d]+(?:\s+[\d]+)*|[a-z]+(?:\s+[a-z]+)*)\s+(?:closing\s*)?cases?/i);

  const closingBottles = extractNumber(lower, /(?:closing\s*)?(?:bottles?|btls?)\s+([\d]+(?:\s+[\d]+)*|[a-z]+(?:\s+[a-z]+)*)/i) ??
                         extractNumber(lower, /([\d]+(?:\s+[\d]+)*|[a-z]+(?:\s+[a-z]+)*)\s+(?:closing\s*)?(?:bottles?|btls?)/i);

  const breakage = extractNumber(lower, /breakage\s+([\d]+(?:\s+[\d]+)*|[a-z]+(?:\s+[a-z]+)*)/i) ??
                   extractNumber(lower, /([\d]+(?:\s+[\d]+)*|[a-z]+(?:\s+[a-z]+)*)\s+breakage/i);

  const hasIdentifier = !!brandNumber || !!size;
  const hasFields = closingCases !== null || closingBottles !== null || breakage !== null;

  if (hasIdentifier && hasFields) {
    const brandName = extractBrandName(lower);
    return {
      type: "update",
      match: { brandNumber, brandName, size },
      fields: {
        closingCases: closingCases ?? undefined,
        closingBottles: closingBottles ?? undefined,
        breakage: breakage ?? undefined,
      },
    };
  }

  return { type: "unknown" };
}

function extractBrandName(lower: string): string | undefined {
  let cleaned = lower
    .replace(/brand\s*(?:number|no\.?|#)?\s*\d+/gi, "")
    .replace(/\d+\s*(?:ml|m\.?l\.?)/gi, "")
    .replace(/(?:closing\s*)?(?:cases?|cs|bottles?|btls?)\s+[\d\w]+/gi, "")
    .replace(/[\d\w]+\s+(?:closing\s*)?(?:cases?|cs|bottles?|btls?)/gi, "")
    .replace(/breakage\s+[\d\w]+/gi, "")
    .replace(/[\d\w]+\s+breakage/gi, "")
    .replace(/\bsize\s*/gi, "")
    .replace(/\bbrand\b/gi, "")
    .replace(/\bclosing\b/gi, "")
    .replace(/\bselect\b/gi, "")
    .trim();
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length >= 2) return cleaned;
  return undefined;
}

const SpeechRecognitionAPI = typeof window !== "undefined"
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : null;

export function useSpeechSales(callbacks: SpeechSalesCallbacks): SpeechSalesResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastAction, setLastAction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const supported = !!SpeechRecognitionAPI;

  const processTranscript = useCallback((text: string) => {
    const cb = callbacksRef.current;
    const command = parseTranscript(text);
    switch (command.type) {
      case "save":
        setLastAction("Saving sales...");
        cb.onSave();
        break;
      case "submit":
        setLastAction("Saving and submitting...");
        cb.onSubmit();
        break;
      case "date":
        if (command.dateStr) {
          setLastAction(`Selecting date: ${command.dateStr}`);
          cb.onSelectDate(command.dateStr);
        }
        break;
      case "page":
        if (command.pageDirection !== undefined) {
          const dir = command.pageDirection;
          const label = typeof dir === "number" ? `Page ${dir}` : dir.charAt(0).toUpperCase() + dir.slice(1) + " page";
          setLastAction(label);
          cb.onPageChange(dir);
        }
        break;
      case "update":
        if (command.match && command.fields) {
          const parts: string[] = [];
          if (command.match.brandNumber) parts.push(`Brand #${command.match.brandNumber}`);
          if (command.match.brandName) parts.push(`"${command.match.brandName}"`);
          if (command.match.size) parts.push(command.match.size);
          if (command.fields.closingCases !== undefined) parts.push(`Cs:${command.fields.closingCases}`);
          if (command.fields.closingBottles !== undefined) parts.push(`Btls:${command.fields.closingBottles}`);
          if (command.fields.breakage !== undefined) parts.push(`Brk:${command.fields.breakage}`);
          setLastAction(`Updating: ${parts.join(", ")}`);
          cb.onUpdateRow(command.match, command.fields);
        }
        break;
      default:
        setLastAction(`Could not understand: "${text}"`);
    }
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("MICROPHONE_INSECURE");
      return;
    }
    if (recognitionRef.current) {
      stop();
    }
    setError(null);
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "permission-denied") {
        setError("MICROPHONE_DENIED");
      } else if (e.error === "network") {
        setError("Speech recognition needs an internet connection.");
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        setError(`Speech error: ${e.error}`);
      }
      setIsListening(false);
    };

    let finalTranscript = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript = result[0].transcript;
          setTranscript(finalTranscript);
          processTranscript(finalTranscript);
          finalTranscript = "";
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setTranscript(interim);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [processTranscript, stop]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  const clearError = useCallback(() => setError(null), []);

  return { isListening, transcript, lastAction, error, supported, start, stop, toggle, clearError };
}
