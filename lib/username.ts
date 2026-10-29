export function usernameToEmail(username: string): string {
  const hex = Array.from(username)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('');
  return `${hex}@users.iditlessons.app`;
}

const VALID_USERNAME = /^[\u0590-\u05FFa-zA-Z0-9_]+$/;

export function isValidUsername(username: string): boolean {
  return username.length >= 2 && VALID_USERNAME.test(username);
}

// Must match auth.minimum_password_length (supabase/config.toml and the
// project's Auth settings) and the admin-reset-password function.
export const MIN_PASSWORD_LENGTH = 6;
