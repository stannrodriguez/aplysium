/**
 * Prefix a root-absolute path with the configured base, so links keep working
 * when the site is served from a subdirectory (GitHub Pages project page).
 */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${path}`;
}
