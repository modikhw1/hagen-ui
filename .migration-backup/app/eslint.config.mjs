import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tailwindcss from "eslint-plugin-tailwindcss";

const adminColorClassPattern =
  String.raw`\b(?:text-white|bg-black|(?:text|bg|border)-(?:gray|slate|zinc|neutral)-\d{2,3})\b`;
const mojibakePattern = String.raw`(?:Ã.|Â·|Â )`;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "*.js",
    "scripts/**",
    "tests/**",
  ]),
  {
    files: ["src/app/admin/**/*.{ts,tsx}", "src/components/admin/**/*.{ts,tsx}"],
    plugins: {
      tailwindcss,
    },
    settings: {
      tailwindcss: {
        config: "tailwind.config.mjs",
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/letrend-design-system", "*/legacy/inline-styles"],
              message:
                "Use Tailwind tokens in admin routes and components instead of inline design-system helpers.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXAttribute[name.name='className'] > Literal[value=/${adminColorClassPattern}/]`,
          message:
            "Use semantic admin tokens such as text-foreground, bg-background, bg-card, or text-muted-foreground instead of raw Tailwind color utilities.",
        },
        {
          selector: `JSXAttribute[name.name='className'] JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/${adminColorClassPattern}/]`,
          message:
            "Use semantic admin tokens such as text-foreground, bg-background, bg-card, or text-muted-foreground instead of raw Tailwind color utilities.",
        },
        {
          selector: `Literal[value=/${mojibakePattern}/]`,
          message:
            "Detected mojibake-like text. Replace broken UTF-8 sequences (for example 'Ã' or 'Â·') with proper characters.",
        },
        {
          selector: `TemplateElement[value.raw=/${mojibakePattern}/]`,
          message:
            "Detected mojibake-like text. Replace broken UTF-8 sequences (for example 'Ã' or 'Â·') with proper characters.",
        },
        {
          selector: `JSXText[value=/${mojibakePattern}/]`,
          message:
            "Detected mojibake-like text. Replace broken UTF-8 sequences (for example 'Ã' or 'Â·') with proper characters.",
        },
      ],
    },
  },
  {
    files: ["src/app/admin/**/*.{ts,tsx}"],
    ignores: ["src/app/admin/_actions/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program > ExpressionStatement[directive='use server']",
          message:
            "Place admin server actions under src/app/admin/_actions/*.ts so they can be audited and migrated consistently.",
        },
      ],
    },
  },
]);

export default eslintConfig;
