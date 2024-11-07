// @ts-check

// Using esbuild for faster dev builds.
// We are still using Rollup for production builds because it generates
// smaller files and provides better tree-shaking.

// 这段代码是一个基于 esbuild 的构建脚本，专门用来构建 Vue 包，并且包含了一些参数化的构建选项，支持生产和开发构建

/*
1. 入口文件设置：

* 根据 target 确定每个包的入口文件路径（src/index.ts）。

2. 外部依赖的管理：

* 依赖包的外部化通过 external 数组来控制，避免把某些库打包进最终输出文件中。不同构建模式下，外部依赖的处理方式有所不同。

3. 插件的使用：

* 使用 polyfillNode 来为非浏览器环境的构建注入 Node.js 相关的 polyfill。
* 使用自定义插件来打印每次构建结束的信息，便于调试。

4. 生产模式和开发模式的区分：

* prod 为 true 时表示生产模式，反之为开发模式。
* 根据模式不同，注入不同的构建标识和设置（如是否开启源码映射等）。
* */

import esbuild from 'esbuild'
import fs from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { parseArgs } from 'node:util'
import { polyfillNode } from 'esbuild-plugin-polyfill-node'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// values: { format: rawFormat, prod, inline: inlineDeps }：
//    rawFormat 存储解析后的 format 参数的值（例如，global 或 esm）。
//    prod 存储解析后的 prod 参数的布尔值。
//    inlineDeps 存储解析后的 inline 参数的布尔值。
// positionals：存储位置参数（即没有指定选项名称的参数）。
const {
  values: { format: rawFormat, prod, inline: inlineDeps },
  positionals,
} = parseArgs({
  allowPositionals: true,
  // 使用 parseArgs 解析命令行输入的参数，支持三个选项：format、prod 和 inline，分别指定构建格式、是否为生产构建，以及是否将依赖内联到包中
  options: {
    format: {
      type: 'string',
      short: 'f',
      default: 'global',
    },
    prod: {
      type: 'boolean',
      short: 'p',
      default: false,
    },
    inline: {
      type: 'boolean',
      short: 'i',
      default: false,
    },
  },
})

// 构建格式和输出路径
const format = rawFormat || 'global' // 输出哪种类型格式包
const targets = positionals.length ? positionals : ['vue']

// resolve output
const outputFormat = format.startsWith('global')
  ? 'iife'
  : format === 'cjs'
    ? 'cjs'
    : 'esm'

const postfix = format.endsWith('-runtime')
  ? `runtime.${format.replace(/-runtime$/, '')}`
  : format

const privatePackages = fs.readdirSync('packages-private')

for (const target of targets) {
  const pkgBase = privatePackages.includes(target)
    ? `packages-private`
    : `packages`
  // 使用 pkgBasePath 和 postfix 来动态确定每个目标包的输出文件路径
  const pkgBasePath = `../${pkgBase}/${target}`
  const pkg = require(`${pkgBasePath}/package.json`)
  const outfile = resolve(
    __dirname,
    `${pkgBasePath}/dist/${
      target === 'vue-compat' ? `vue` : target
    }.${postfix}.${prod ? `prod.` : ``}js`,
  )
  const relativeOutfile = relative(process.cwd(), outfile)

  // resolve externals 外部依赖配置
  // 根据构建的格式和包的依赖情况，动态确定哪些依赖应该被外部化（不打包进最终的构建文件）
  // TODO this logic is largely duplicated from rollup.config.js
  /** @type {string[]} */
  let external = []
  if (!inlineDeps) {
    // cjs & esm-bundler: external all deps
    // 对于 cjs 和 esm-bundler 构建格式，会外部化所有的依赖和 peerDependencies
    if (format === 'cjs' || format.includes('esm-bundler')) {
      external = [
        ...external,
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
        // for @vue/compiler-sfc / server-renderer
        'path',
        'url',
        'stream',
      ]
    }

    // 特别地，compiler-sfc 包会外部化一些特殊的依赖（如 fs、crypto 等）
    if (target === 'compiler-sfc') {
      const consolidatePkgPath = require.resolve(
        '@vue/consolidate/package.json',
        {
          paths: [resolve(__dirname, `../packages/${target}/`)],
        },
      )
      const consolidateDeps = Object.keys(
        require(consolidatePkgPath).devDependencies,
      )
      external = [
        ...external,
        ...consolidateDeps,
        'fs',
        'vm',
        'crypto',
        'react-dom/server',
        'teacup/lib/express',
        'arc-templates/dist/es5',
        'then-pug',
        'then-jade',
      ]
    }
  }

  // 构建插件
  /** @type {Array<import('esbuild').Plugin>} */
  const plugins = [
    {
      // 使用 esbuild 插件来定制构建流程。在每次构建结束后，使用一个插件打印构建成功的消息
      name: 'log-rebuild',
      setup(build) {
        build.onEnd(() => {
          console.log(`built: ${relativeOutfile}`)
        })
      },
    },
  ]

  // 如果构建格式不是 cjs 且包启用了非浏览器分支，则会使用 polyfillNode 插件来处理 Node.js API 的 polyfill
  if (format !== 'cjs' && pkg.buildOptions?.enableNonBrowserBranches) {
    plugins.push(polyfillNode())
  }

  // 使用 esbuild 的 context 方法创建一个构建上下文，设置入口文件、输出路径、构建格式等信息，并启动构建过程
  esbuild
    .context({
      entryPoints: [resolve(__dirname, `${pkgBasePath}/src/index.ts`)],
      outfile,
      bundle: true,
      external,
      sourcemap: true,
      format: outputFormat,
      globalName: pkg.buildOptions?.name,
      platform: format === 'cjs' ? 'node' : 'browser',
      plugins,
      define: {
        // 使用 define 来注入一些编译时的全局常量
        __COMMIT__: `"dev"`,
        __VERSION__: `"${pkg.version}"`, // Vue 包的版本号
        __DEV__: prod ? `false` : `true`, // 根据 prod 选项来确定是否为开发模式
        __TEST__: `false`,
        __BROWSER__: String(
          format !== 'cjs' && !pkg.buildOptions?.enableNonBrowserBranches,
        ),
        __GLOBAL__: String(format === 'global'),
        __ESM_BUNDLER__: String(format.includes('esm-bundler')),
        __ESM_BROWSER__: String(format.includes('esm-browser')),
        __CJS__: String(format === 'cjs'),
        __SSR__: String(format !== 'global'),
        __COMPAT__: String(target === 'vue-compat'),
        __FEATURE_SUSPENSE__: `true`,
        __FEATURE_OPTIONS_API__: `true`,
        __FEATURE_PROD_DEVTOOLS__: `false`,
        __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__: `true`,
      },
    }) // ctx.watch() 启动文件监视功能，在开发模式下，能够实时监听文件变化并自动重新构建
    .then(ctx => ctx.watch())
}
