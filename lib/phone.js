export function normalizePhoneDigits(value = '') {
  return String(value).replace(/\D/g, '');
}
export function formatPhoneFull(digits = '') {
  if (!digits) return '';
  if (digits.length === 11) return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  return `+${digits}`;
}
export function maskPhone(digits = '') {
  if (!digits) return '';
  return `+${digits.slice(0, 2)} ${digits.slice(2, 3)}***`;
}
export function phoneContains(digits = '', query = '') {
  const q = normalizePhoneDigits(query);
  if (!q || !digits) return false;
  return digits.includes(q);
}
