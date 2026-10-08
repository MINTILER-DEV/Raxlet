export function launcherSnippet(origin: string) {
  const url = JSON.stringify(new URL("/launcher.js", origin).href);
  const fallback = JSON.stringify(new URL("/dashboard/launcher", origin).href);
  return `(()=>{const s=document.createElement('script');s.src=${url};s.onerror=()=>{alert('This page blocked Raxlet. Open the launcher guide for browser restrictions.');window.open(${fallback},'_blank','noopener')};document.documentElement.appendChild(s)})()`;
}
export const bookmarklet = (origin: string) =>
  "javascript:" + launcherSnippet(origin);
