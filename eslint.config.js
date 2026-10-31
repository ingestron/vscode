// Lint rules carry the size and documentation limits from CONTRIBUTING.md.
import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      ".tmp/**",
      ".vscode-test/**",
      "schemas/**",
      "templates/**",
      "project-templates/**",
      "recipes/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: { jsdoc },
    rules: {
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true }],
      "max-depth": ["error", 3],
      complexity: ["error", 10],
      "one-var": ["error", "never"],
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true },
          contexts: [
            "TSInterfaceDeclaration",
            "TSTypeAliasDeclaration",
            "ExportNamedDeclaration > VariableDeclaration",
          ],
        },
      ],
    },
  },
  {
    // Test and script files group many small cases in one callback.
    files: ["test/**/*.ts", "scripts/**/*.ts"],
    rules: { "max-lines-per-function": "off" },
  },
  {
    // VS Code loads the integration suite with require(), so it is CommonJS.
    files: ["test/integration/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
