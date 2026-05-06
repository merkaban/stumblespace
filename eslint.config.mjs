import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	...obsidianmd.configs.recommended,
	{
		// Tests and benches don't ship in main.js, so the obsidianmd rules
		// (notably no-console) don't apply.
		ignores: ["src/**/*.test.ts", "src/**/*.bench.test.ts"],
	},
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				sourceType: "module",
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
		},
	},
];
