import tseslint from "typescript-eslint";

const features = [
  "android-background",
  "files",
  "forwards",
  "git",
  "hosts",
  "projects",
  "session-tabs",
  "shells",
  "ssh",
];

function deepImportPatterns(featureNames) {
  return featureNames.map((name) => ({
    group: [`@/features/${name}/*`, `@/features/${name}/**`],
    message: `Import from @/features/${name} barrel only. Deep paths are feature-internal.`,
  }));
}

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "public/**",
      "e2e/**",
      "playwright-report/**",
      "test-results/**",
      "blob-report/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: deepImportPatterns(features),
        },
      ],
    },
  },
  ...features.map((feature) => ({
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: deepImportPatterns(
            features.filter((name) => name !== feature),
          ),
        },
      ],
    },
  })),
);
