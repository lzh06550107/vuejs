import importX from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'
import vitest from '@vitest/eslint-plugin'
import { builtinModules } from 'node:module'

const DOMGlobals = ['window', 'document']
const NodeGlobals = ['module', 'require']

const banConstEnum = {
  selector: 'TSEnumDeclaration[const=true]',
  message:
    'Please use non-const enums. This project automatically inlines enums.',
}

export default tseslint.config(
  {
    // 基本配置
    files: ['**/*.js', '**/*.ts', '**/*.tsx'], // 文件匹配
    extends: [tseslint.configs.base], // 扩展配置，是 @typescript-eslint/eslint-plugin 包提供的基础配置，你可以在此基础上自定义和扩展更多适合项目需求的规则。
    plugins: {
      // 插件
      'import-x': importX,
    },
    rules: {
      // 包含了一些全局规则
      'no-debugger': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      // most of the codebase are expected to be env agnostic
      'no-restricted-globals': ['error', ...DOMGlobals, ...NodeGlobals],

      'no-restricted-syntax': [
        'error',
        banConstEnum,
        {
          selector: 'ObjectPattern > RestElement',
          message:
            'Our output target is ES2016, and object rest spread results in ' +
            'verbose helpers and should be avoided.',
        },
        {
          selector: 'ObjectExpression > SpreadElement',
          message:
            'esbuild transpiles object spread into very verbose inline helpers.\n' +
            'Please use the `extend` helper from @vue/shared instead.',
        },
        {
          selector: 'AwaitExpression',
          message:
            'Our output target is ES2016, so async/await syntax should be avoided.',
        },
        {
          selector: 'ChainExpression',
          message:
            'Our output target is ES2016, and optional chaining results in ' +
            'verbose helpers and should be avoided.',
        },
      ],
      'sort-imports': ['error', { ignoreDeclarationSort: true }],

      'import-x/no-nodejs-modules': [
        'error',
        { allow: builtinModules.map(mod => `node:${mod}`) },
      ],
      // This rule enforces the preference for using '@ts-expect-error' comments in TypeScript
      // code to indicate intentional type errors, improving code clarity and maintainability.
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      // Enforce the use of 'import type' for importing types
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      // Enforce the use of top-level import type qualifier when an import only has specifiers with inline type qualifiers
      '@typescript-eslint/no-import-type-side-effects': 'error',
    },
  },

  // tests, no restrictions (runs in Node / Vitest with jsdom)
  {
    // 测试配置
    files: [
      // 文件匹配
      '**/__tests__/**',
      'packages-private/dts-test/**',
      'packages-private/dts-build-test/**',
    ],
    plugins: { vitest }, // 插件
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    rules: {
      // 规则
      'no-console': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-syntax': 'off',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
    },
  },

  // shared, may be used in any env
  {
    // 共享模块配置
    files: ['packages/shared/**', 'eslint.config.js'], // 文件匹配
    rules: {
      'no-restricted-globals': 'off',
    },
  },

  // Packages targeting DOM
  {
    // DOM 目标包配置
    files: ['packages/{vue,vue-compat,runtime-dom}/**'],
    rules: {
      'no-restricted-globals': ['error', ...NodeGlobals],
    },
  },

  // Packages targeting Node
  {
    // Node 目标包配置
    files: ['packages/{compiler-sfc,compiler-ssr,server-renderer}/**'],
    rules: {
      'no-restricted-globals': ['error', ...DOMGlobals],
      'no-restricted-syntax': ['error', banConstEnum],
    },
  },

  // Private package, browser only + no syntax restrictions
  {
    // 私有包配置（仅限浏览器环境）
    files: [
      'packages-private/template-explorer/**',
      'packages-private/sfc-playground/**',
    ],
    rules: {
      'no-restricted-globals': ['error', ...NodeGlobals],
      'no-restricted-syntax': ['error', banConstEnum],
      'no-console': 'off',
    },
  },

  // JavaScript files
  {
    // JavaScript 文件配置
    files: ['*.js'],
    rules: {
      // We only do `no-unused-vars` checks for js files, TS files are checked by TypeScript itself.
      'no-unused-vars': ['error', { vars: 'all', args: 'none' }],
    },
  },

  // Node scripts
  {
    // Node 脚本配置
    files: [
      'eslint.config.js',
      'rollup*.config.js',
      'scripts/**',
      './*.{js,ts}',
      'packages/*/*.js',
      'packages/vue/*/*.js',
    ],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-syntax': ['error', banConstEnum],
      'no-console': 'off',
    },
  },

  // Import nodejs modules in compiler-sfc
  {
    // 特定文件夹配置
    files: ['packages/compiler-sfc/src/**'],
    rules: {
      'import-x/no-nodejs-modules': ['error', { allow: builtinModules }],
    },
  },

  {
    // 忽略文件夹配置，忽略 dist、temp、coverage、.idea 等文件夹
    ignores: [
      '**/dist/',
      '**/temp/',
      '**/coverage/',
      '.idea/',
      'explorations/',
      'dts-build/packages',
    ],
  },
)
