/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_GIT_SHA?: string;
  readonly PUBLIC_BUILD_TIME?: string;
  readonly PUBLIC_SOURCE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
