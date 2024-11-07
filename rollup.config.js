// @ts-check
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import replace from '@rollup/plugin-replace'
import json from '@rollup/plugin-json'
import pico from 'picocolors'
import commonJS from '@rollup/plugin-commonjs'
import polyfillNode from 'rollup-plugin-polyfill-node'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import esbuild from 'rollup-plugin-esbuild'
import alias from '@rollup/plugin-alias'
import { entries } from './scripts/aliases.js'
import { inlineEnums } from './scripts/inline-enums.js'
import { minify as minifySwc } from '@swc/core'

/**
 * @template T
 * @template {keyof T} K
 * @typedef { Omit<T, K> & Required<Pick<T, K>> } MarkRequired
 */
/** @typedef {'cjs' | 'esm-bundler' | 'global' | 'global-runtime' | 'esm-browser' | 'esm-bundler-runtime' | 'esm-browser-runtime'} PackageFormat */
/** @typedef {MarkRequired<import('rollup').OutputOptions, 'file' | 'format'>} OutputOptions */
// 检查环境变量 TARGET 是否被指定，如果没有，则抛出错误。这通常用于指定要构建的具体包
if (!process.env.TARGET) {
  throw new Error('TARGET package must be specified via --environment flag.')
}

// 使用 Node.js 的内置模块处理文件路径和读取包信息，确定构建的目标包及其路径
// 允许在 ES 模块中使用 CommonJS 模块的 require 功能
const require = createRequire(import.meta.url)
// 将 URL 转换为文件路径
// 1. 获取当前模块的 URL：通过 import.meta.url 获取当前模块的完整 URL。
// 2. 创建当前目录的 URL：通过 new URL('.', import.meta.url) 生成指向当前模块所在目录的 URL。
// 3. 转换为文件系统路径：使用 fileURLToPath 将这个 URL 转换为文件系统路径，以便在 Node.js 中使用。
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const masterVersion = require('./package.json').version
// @vue/consolidate 是 Vue 生态系统中的一个包，通常用于模板引擎的整合，支持多种模板引擎如 EJS、Pug 等
const consolidatePkg = require('@vue/consolidate/package.json')

// 通过读取 packages-private 目录来管理包。如果环境变量 TARGET 存在且是 privatePackages 中的一个包，则使用私有包的路径
const privatePackages = fs.readdirSync('packages-private')
const pkgBase = privatePackages.includes(process.env.TARGET)
  ? `packages-private`
  : `packages`
const packagesDir = path.resolve(__dirname, pkgBase)
const packageDir = path.resolve(packagesDir, process.env.TARGET)

// 这里定义了 resolve 函数来简化路径的绝对解析。这个函数帮助构建更清晰的路径逻辑，避免在代码中多次重复路径拼接
const resolve = (/** @type {string} */ p) => path.resolve(packageDir, p)
const pkg = require(resolve(`package.json`))
const packageOptions = pkg.buildOptions || {}
const name = packageOptions.filename || path.basename(packageDir)

const [enumPlugin, enumDefines] = inlineEnums()

// 定义了不同格式的输出配置，包括 ESM、CJS 和 IIFE 等格式，以便在构建时使用
/** @type {Record<PackageFormat, OutputOptions>} */
const outputConfigs = {
  'esm-bundler': {
    file: resolve(`dist/${name}.esm-bundler.js`),
    format: 'es',
  },
  'esm-browser': {
    file: resolve(`dist/${name}.esm-browser.js`),
    format: 'es',
  },
  cjs: {
    file: resolve(`dist/${name}.cjs.js`),
    format: 'cjs',
  },
  global: {
    file: resolve(`dist/${name}.global.js`),
    format: 'iife', // 立即调用函数表达式格式（iife），通常用于在浏览器中直接引入
  },
  // runtime-only builds, for main "vue" package only
  'esm-bundler-runtime': {
    file: resolve(`dist/${name}.runtime.esm-bundler.js`),
    format: 'es',
  },
  'esm-browser-runtime': {
    file: resolve(`dist/${name}.runtime.esm-browser.js`),
    format: 'es', // 专为浏览器运行时设计
  },
  'global-runtime': {
    file: resolve(`dist/${name}.runtime.global.js`),
    format: 'iife', // 立即调用函数表达式格式（iife），用于全局范围内的运行时
  },
}

// 根据环境变量和包配置确定要构建的格式，并调用 createConfig 函数生成相应的构建配置
/** @type {ReadonlyArray<PackageFormat>} */
const defaultFormats = ['esm-bundler', 'cjs']
/** @type {ReadonlyArray<PackageFormat>} */
const inlineFormats = /** @type {any} */ (
  process.env.FORMATS && process.env.FORMATS.split(',')
)
/** @type {ReadonlyArray<PackageFormat>} */
const packageFormats = inlineFormats || packageOptions.formats || defaultFormats
const packageConfigs = process.env.PROD_ONLY
  ? []
  : packageFormats.map(format => createConfig(format, outputConfigs[format]))

// 如果在生产环境中，针对特定格式生成生产配置和压缩配置
if (process.env.NODE_ENV === 'production') {
  packageFormats.forEach(format => {
    if (packageOptions.prod === false) {
      return
    }
    if (format === 'cjs') {
      packageConfigs.push(createProductionConfig(format))
    }
    if (/^(global|esm-browser)(-runtime)?/.test(format)) {
      packageConfigs.push(createMinifiedConfig(format))
    }
  })
}

// 导出生成的构建配置，以便 Rollup 使用
export default packageConfigs

// 生成配置的函数

/**
 * 负责生成具体的 Rollup 配置，包括输入、输出、插件、外部依赖等。
 * 包含复杂的逻辑来处理各种包格式的特殊情况，例如兼容性包、浏览器构建等。
 * @param {PackageFormat} format 指定构建格式，可能的值有 esm-bundler、esm-browser、cjs、global 等
 * @param {OutputOptions} output 指定 Rollup 的输出配置（如文件路径、模块格式等）
 * @param {ReadonlyArray<import('rollup').Plugin>} plugins Rollup 插件的列表，可以在此基础上扩展或自定义插件
 * @returns {import('rollup').RollupOptions}
 */
function createConfig(format, output, plugins = []) {
  if (!output) {
    console.log(pico.yellow(`invalid format: "${format}"`))
    process.exit(1)
  }

  // 1. 环境判断
  const isProductionBuild =
    process.env.__DEV__ === 'false' || /\.prod\.js$/.test(output.file) // 判断是否为生产环境构建
  const isBundlerESMBuild = /esm-bundler/.test(format)
  const isBrowserESMBuild = /esm-browser/.test(format)
  const isServerRenderer = name === 'server-renderer'
  const isCJSBuild = format === 'cjs' // 判断是否为 CJS 构建
  const isGlobalBuild = /global/.test(format) // 判断是否为全局构建（IIFE 格式）
  const isCompatPackage =
    pkg.name === '@vue/compat' || pkg.name === '@vue/compat-canary' // 判断包是否为 @vue/compat 或 @vue/compat-canary
  const isCompatBuild = !!packageOptions.compat // 判断是否为兼容构建
  const isBrowserBuild =
    (isGlobalBuild || isBrowserESMBuild || isBundlerESMBuild) &&
    !packageOptions.enableNonBrowserBranches // 判断是否为浏览器构建（包括 global、esm-browser、esm-bundler）

  // 为构建的文件添加包信息注释（pkg.name 和 masterVersion）
  output.banner = `/**
* ${pkg.name} v${masterVersion}
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/`

  // 2. 输出配置设置
  // 决定如何导出模块，通常是 auto 或 named
  output.exports = isCompatPackage ? 'auto' : 'named'
  if (isCJSBuild) {
    // 对于 CJS 构建，确保模块兼容 ES 模块
    output.esModule = true
  }
  // 如果 SOURCE_MAP 环境变量存在，则启用 sourcemap
  output.sourcemap = !!process.env.SOURCE_MAP
  // 控制是否使用外部的 live bindings
  output.externalLiveBindings = false
  // https://github.com/rollup/rollup/pull/5380 解决 Rollup 的特定问题
  output.reexportProtoFromExternal = false

  if (isGlobalBuild) {
    output.name = packageOptions.name
  }

  // 3. 入口文件解析
  let entryFile = /runtime$/.test(format) ? `src/runtime.ts` : `src/index.ts`

  // the compat build needs both default AND named exports. This will cause
  // Rollup to complain for non-ESM targets, so we use separate entries for
  // esm vs. non-esm builds. 对于兼容构建，还会选择不同的入口文件，以支持 ESM 或非 ESM 构建
  if (isCompatPackage && (isBrowserESMBuild || isBundlerESMBuild)) {
    entryFile = /runtime$/.test(format)
      ? `src/esm-runtime.ts`
      : `src/esm-index.ts`
  }

  // 定义替换
  // resolveDefine：返回一个对象，包含一系列的定义替换项，例如 __DEV__、__VERSION__、__BROWSER__ 等，这些值会在构建过程中被注入代码中
  // 一些值可以通过环境变量覆盖，例如 process.env 中的值
  function resolveDefine() {
    /** @type {Record<string, string>} */
    const replacements = {
      __COMMIT__: `"${process.env.COMMIT}"`,
      __VERSION__: `"${masterVersion}"`,
      // this is only used during Vue's internal tests
      __TEST__: `false`,
      // If the build is expected to run directly in the browser (global / esm builds)
      __BROWSER__: String(isBrowserBuild),
      __GLOBAL__: String(isGlobalBuild),
      __ESM_BUNDLER__: String(isBundlerESMBuild),
      __ESM_BROWSER__: String(isBrowserESMBuild),
      // is targeting Node (SSR)?
      __CJS__: String(isCJSBuild),
      // need SSR-specific branches?
      __SSR__: String(!isGlobalBuild),

      // 2.x compat build
      __COMPAT__: String(isCompatBuild),

      // feature flags
      __FEATURE_SUSPENSE__: `true`,
      __FEATURE_OPTIONS_API__: isBundlerESMBuild
        ? `__VUE_OPTIONS_API__`
        : `true`,
      __FEATURE_PROD_DEVTOOLS__: isBundlerESMBuild
        ? `__VUE_PROD_DEVTOOLS__`
        : `false`,
      __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__: isBundlerESMBuild
        ? `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__`
        : `false`,
    }

    if (!isBundlerESMBuild) {
      // hard coded dev/prod builds
      replacements.__DEV__ = String(!isProductionBuild)
    }

    // allow inline overrides like
    //__RUNTIME_COMPILE__=true pnpm build runtime-core
    Object.keys(replacements).forEach(key => {
      if (key in process.env) {
        const value = process.env[key]
        assert(typeof value === 'string')
        replacements[key] = value
      }
    })
    return replacements
  }

  // esbuild define is a bit strict and only allows literal json or identifiers
  // so we still need replace plugin in some cases 代码替换插件配置
  // 根据构建类型（生产环境、浏览器构建等）动态地替换代码中的部分内容，例如将 process.env 替换为浏览器友好的值，或者为函数调用添加 /*@__PURE__*/ 注释，以便于树摇优化。
  function resolveReplace() {
    const replacements = { ...enumDefines }

    if (isProductionBuild && isBrowserBuild) {
      Object.assign(replacements, {
        'context.onError(': `/*@__PURE__*/ context.onError(`,
        'emitError(': `/*@__PURE__*/ emitError(`,
        'createCompilerError(': `/*@__PURE__*/ createCompilerError(`,
        'createDOMCompilerError(': `/*@__PURE__*/ createDOMCompilerError(`,
      })
    }

    if (isBundlerESMBuild) {
      Object.assign(replacements, {
        // preserve to be handled by bundlers
        __DEV__: `!!(process.env.NODE_ENV !== 'production')`,
      })
    }

    // for compiler-sfc browser build inlined deps
    if (isBrowserESMBuild) {
      Object.assign(replacements, {
        'process.env': '({})',
        'process.platform': '""',
        'process.stdout': 'null',
      })
    }

    if (Object.keys(replacements).length) {
      return [replace({ values: replacements, preventAssignment: true })]
    } else {
      return []
    }
  }

  // 外部依赖处理，根据构建类型决定哪些依赖需要外部化（即不打包进输出文件）
  function resolveExternal() {
    const treeShakenDeps = [
      'source-map-js',
      '@babel/parser',
      'estree-walker',
      'entities/lib/decode.js',
    ]

    if (isGlobalBuild || isBrowserESMBuild || isCompatPackage) {
      // 对于浏览器构建，某些依赖会被外部化，以减小包体积
      if (!packageOptions.enableNonBrowserBranches) {
        // normal browser builds - non-browser only imports are tree-shaken,
        // they are only listed here to suppress warnings.
        return treeShakenDeps
      }
    } else {
      // 对于 Node/ESM 构建，则会外部化所有直接依赖和 peer 依赖
      // Node / esm-bundler builds.
      // externalize all direct deps unless it's the compat build.
      return [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
        // for @vue/compiler-sfc / server-renderer
        ...['path', 'url', 'stream'],
        // somehow these throw warnings for runtime-* package builds
        ...treeShakenDeps,
      ]
    }
  }

  // Node 插件
  //
  function resolveNodePlugins() {
    // we are bundling forked consolidate.js in compiler-sfc which dynamically
    // requires a ton of template engines which should be ignored.
    // 某些包（如 @vue/compiler-sfc）可能会忽略特定的依赖项（例如 crypto、react-dom/server 等）
    /** @type {ReadonlyArray<string>} */
    let cjsIgnores = []
    if (
      pkg.name === '@vue/compiler-sfc' ||
      pkg.name === '@vue/compiler-sfc-canary'
    ) {
      cjsIgnores = [
        ...Object.keys(consolidatePkg.devDependencies),
        'vm',
        'crypto',
        'react-dom/server',
        'teacup/lib/express',
        'arc-templates/dist/es5',
        'then-pug',
        'then-jade',
      ]
    }

    // 当需要处理 Node 特定模块时（例如 CommonJS 模块转换、Node 解析），会使用一些 Node 插件，如 commonJS、nodeResolve
    const nodePlugins =
      (format === 'cjs' && Object.keys(pkg.devDependencies || {}).length) ||
      packageOptions.enableNonBrowserBranches
        ? [
            commonJS({
              sourceMap: false,
              ignore: cjsIgnores,
            }),
            ...(format === 'cjs' ? [] : [polyfillNode()]),
            nodeResolve(),
          ]
        : []

    return nodePlugins
  }

  return {
    input: resolve(entryFile), // 入口文件的路径
    // Global and Browser ESM builds inlines everything so that they can be
    // used alone.
    external: resolveExternal(), // 外部依赖项列表（通过 resolveExternal 计算）
    plugins: [
      // 插件列表
      json({
        namedExports: false,
      }),
      alias({
        entries, // 别名
      }),
      enumPlugin, // 处理枚举的插件
      ...resolveReplace(),
      esbuild({
        tsconfig: path.resolve(__dirname, 'tsconfig.json'),
        sourceMap: output.sourcemap,
        minify: false,
        target: isServerRenderer || isCJSBuild ? 'es2019' : 'es2016',
        define: resolveDefine(),
      }),
      ...resolveNodePlugins(),
      ...plugins,
    ],
    output, // 传入的输出配置
    onwarn: (msg, warn) => {
      // 自定义警告处理，忽略循环依赖警告
      if (msg.code !== 'CIRCULAR_DEPENDENCY') {
        warn(msg)
      }
    },
    treeshake: {
      // 配置树摇行为，禁用副作用检查
      moduleSideEffects: false,
    },
  }
}

// 生成生产配置
function createProductionConfig(/** @type {PackageFormat} */ format) {
  return createConfig(format, {
    file: resolve(`dist/${name}.${format}.prod.js`),
    format: outputConfigs[format].format,
  })
}

// 生成压缩配置
function createMinifiedConfig(/** @type {PackageFormat} */ format) {
  return createConfig(
    format,
    {
      file: outputConfigs[format].file.replace(/\.js$/, '.prod.js'),
      format: outputConfigs[format].format,
    },
    [
      {
        name: 'swc-minify',

        // enderChunk 方法接受源代码和其它配置参数，并返回压缩后的代码和源映射（如果需要）
        async renderChunk(
          contents,
          _,
          { format, sourcemap, sourcemapExcludeSources },
        ) {
          // 使用了 swc 作为压缩工具（swc-minify 插件）
          const { code, map } = await minifySwc(contents, {
            module: format === 'es', // 指定模块类型，如果是 ES 模块格式（es），则传入 true
            compress: {
              // 设置压缩选项，ecma: 2016 表示生成 ECMAScript 2016 兼容的代码
              ecma: 2016,
              pure_getters: true, // 使 getter 变成纯粹的函数调用以优化性能
            },
            safari10: true, // 启用 Safari 10 的兼容性优化
            mangle: true, // 启用混淆（变量名压缩）
            sourceMap: !!sourcemap, // 是否生成源映射
            inlineSourcesContent: !sourcemapExcludeSources, // 是否将源内容嵌入源映射中
          })

          return { code, map: map || null }
        },
      },
    ],
  )
}
