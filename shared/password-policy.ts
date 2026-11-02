/** Bounds shared by the server policy, form attributes, and localized UI copy. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 256;

/** Count Unicode code points so astral characters count as one character. */
export function passwordLength(password: string): number {
  let length = 0;
  for (const _char of password) length += 1;
  return length;
}

export function isPasswordLengthValid(password: string): boolean {
  const length = passwordLength(password);
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}
