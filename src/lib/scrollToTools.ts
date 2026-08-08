/** Scroll to the homepage tools directory (same behavior as “Browse tools”). */
export function scrollToTools() {
  const el = document.getElementById("tools");
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

/**
 * If already on `/`, scroll to #tools. Otherwise navigate to `/#tools`.
 * Returns true when the default link navigation should be prevented.
 */
export function goToTools(pathname: string): boolean {
  if (pathname === "/") {
    history.replaceState(null, "", "/#tools");
    scrollToTools();
    return true;
  }
  return false;
}
