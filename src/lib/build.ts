export type BuildInfo = {
  sha: string;
  shortSha: string;
  time: string;
  source: string;
};

export function getBuildInfo(): BuildInfo {
  const sha = import.meta.env.PUBLIC_GIT_SHA || 'local';
  const time = import.meta.env.PUBLIC_BUILD_TIME || 'dev';
  const source = import.meta.env.PUBLIC_SOURCE_URL || '';
  return {
    sha,
    shortSha: sha === 'local' ? 'local' : sha.slice(0, 7),
    time,
    source,
  };
}

export function formatBuildYear(time: string): string {
  if (time === 'dev') return String(new Date().getFullYear());
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? String(new Date().getFullYear()) : String(date.getUTCFullYear());
}
