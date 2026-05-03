import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parse, isValid } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format any date value as DD-MM-YYYY (Indian display format).
 * Accepts Date objects, ISO yyyy-MM-dd strings, dd-MMM-yyyy text, or empty values.
 */
export function formatDMY(value: Date | string | null | undefined): string {
  if (!value) return "";
  let d: Date;
  if (value instanceof Date) {
    d = value;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    d = parse(value, "yyyy-MM-dd", new Date());
  } else if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(value)) {
    d = parse(value, "dd-MMM-yyyy", new Date());
  } else {
    const tryDate = new Date(value);
    if (isValid(tryDate)) d = tryDate; else return String(value);
  }
  return isValid(d) ? format(d, "dd-MM-yyyy") : String(value);
}
