// Convert Egyptian phone numbers to a stable fake-email used for Supabase auth.
// This lets us use phone+password signup without enabling SMS/OTP.

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // Accept: 01XXXXXXXXX (11 digits) or 201XXXXXXXXX (12) or +201XXXXXXXXX
  let local: string;
  if (digits.length === 11 && digits.startsWith("01")) {
    local = digits;
  } else if (digits.length === 12 && digits.startsWith("201")) {
    local = "0" + digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith("2001")) {
    // safety, unlikely
    local = "0" + digits.slice(3);
  } else {
    return null;
  }
  // Validate Egyptian mobile prefixes (010, 011, 012, 015)
  if (!/^01[0125]\d{8}$/.test(local)) return null;
  return local;
}

export function phoneToEmail(phone: string): string {
  return `${phone}@phone.azraq.local`;
}
