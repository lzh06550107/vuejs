// @ts-check

/*
Produces production builds and stitches together d.ts files.

To specify the package to build, simply pass its name and the desired build
formats to output (defaults to `buildOptions.formats` specified in that package,
or "esm,cjs"):

```
# name supports fuzzy match. will build all packages with name containing "dom":
nr build dom

# specify the format to output
nr build core --formats cjs
```
*/

import fs from 'node:fs'
import { parseArgs } from 'node:util'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import pico from 'picocolors'
import { cpus } from 'node:os'
import { targets as allTargets, exec, fuzzyMatchTarget } from './utils.js'
import { scanEnums } from './inline-enums.js'
import prettyBytes from 'pretty-bytes'
import { spawnSync } from 'node:child_process'

// 这条命令的作用是获取当前 Git 仓库的最新提交的 7 位短版本号
// spawnSync 是 Node.js 中 child_process 模块的一部分，用于同步执行外部命令并获取输出。它会阻塞进程，直到外部命令执行完成并返回结果。
// * 'git'：表示执行 Git 命令行工具。
// * rev-parse：是 Git 中用来解析各种引用（如分支名、commit hash 等）的命令。
// * --short=7：指定输出简短的 7 位 commit hash（Git commit hash 默认是 40 位长的，通过 --short=7 可以只输出前 7 位）。
// * 'HEAD'：表示当前 Git 仓库的最新提交，也就是当前 HEAD 引用的 commit。
const commit = spawnSync('git', ['rev-parse', '--short=7', 'HEAD'])
  .stdout.toString()
  .trim()

// 使用 parseArgs 解析命令行输入的参数
const { values, positionals: targets } = parseArgs({
  allowPositionals: true,
  options: {
    formats: {
      // 指定构建格式
      type: 'string',
      short: 'f',
    },
    devOnly: {
      // 只构建开发版本
      type: 'boolean',
      short: 'd',
    },
    prodOnly: {
      // 只构建生产版本
      type: 'boolean',
      short: 'p',
    },
    withTypes: {
      // 是否生成类型定义文件（.d.ts）
      type: 'boolean',
      short: 't',
    },
    sourceMap: {
      // 是否生成源映射文件
      type: 'boolean',
      short: 's',
    },
    release: {
      // 是否执行发布版本构建
      type: 'boolean',
    },
    all: {
      // 构建所有符合条件的目标包
      type: 'boolean',
      short: 'a',
    },
    size: {
      // 是否检查构建后的文件大小
      type: 'boolean',
    },
  },
})

const {
  formats,
  all: buildAllMatching,
  devOnly,
  prodOnly,
  withTypes: buildTypes,
  sourceMap,
  release: isRelease,
  size: writeSize,
} = values

const sizeDir = path.resolve('temp/size')

run()

async function run() {
  // 如果 size 被启用，创建存储文件大小信息的目录
  if (writeSize) fs.mkdirSync(sizeDir, { recursive: true })
  // 扫描并清理一些缓存
  const removeCache = scanEnums()
  try {
    // 解析目标包，执行构建任务
    const resolvedTargets = targets.length
      ? fuzzyMatchTarget(targets, buildAllMatching)
      : allTargets
    await buildAll(resolvedTargets)
    // 检查构建的文件大小
    await checkAllSizes(resolvedTargets)
    if (buildTypes) {
      // 如果需要，使用 pnpm 构建 .d.ts 类型定义文件
      await exec(
        'pnpm',
        [
          'run',
          'build-dts',
          ...(targets.length
            ? ['--environment', `TARGETS:${resolvedTargets.join(',')}`]
            : []),
        ],
        {
          stdio: 'inherit',
        },
      )
    }
  } finally {
    removeCache()
  }
}

/**
 * Builds all the targets in parallel.
 * 该函数并行构建所有指定的目标包（targets）。它使用 runParallel 函数并行执行构建任务，并设置最大并发数为系统 CPU 核心数
 * @param {Array<string>} targets - An array of targets to build.
 * @returns {Promise<void>} - A promise representing the build process.
 */
async function buildAll(targets) {
  await runParallel(cpus().length, targets, build)
}

/**
 * Runs iterator function in parallel.
 * 该函数用于控制并发执行多个任务，它通过 Promise.race 保证不会同时启动过多的任务，从而避免超出系统资源的限制
 * @template T - The type of items in the data source
 * @param {number} maxConcurrency - The maximum concurrency.
 * @param {Array<T>} source - The data source
 * @param {(item: T) => Promise<void>} iteratorFn - The iteratorFn
 * @returns {Promise<void[]>} - A Promise array containing all iteration results.
 */
async function runParallel(maxConcurrency, source, iteratorFn) {
  /**@type {Promise<void>[]} */
  const ret = []
  /**@type {Promise<void>[]} */
  const executing = []
  for (const item of source) {
    const p = Promise.resolve().then(() => iteratorFn(item))
    ret.push(p)

    if (maxConcurrency <= source.length) {
      const e = p.then(() => {
        executing.splice(executing.indexOf(e), 1)
      })
      executing.push(e)
      if (executing.length >= maxConcurrency) {
        await Promise.race(executing)
      }
    }
  }
  return Promise.all(ret)
}

const privatePackages = fs.readdirSync('packages-private')

/**
 * Builds the target.
 * @param {string} target - The target to build.
 * @returns {Promise<void>} - A promise representing the build process.
 */
async function build(target) {
  // 选择合适的目录（packages 或 packages-private）
  const pkgBase = privatePackages.includes(target)
    ? `packages-private`
    : `packages`
  const pkgDir = path.resolve(`${pkgBase}/${target}`)
  const pkg = JSON.parse(readFileSync(`${pkgDir}/package.json`, 'utf-8'))

  // if this is a full build (no specific targets), ignore private packages
  // 如果是发布构建，并且包是私有的，则跳过
  if ((isRelease || !targets.length) && pkg.private) {
    return
  }

  // if building a specific format, do not remove dist.
  if (!formats && existsSync(`${pkgDir}/dist`)) {
    fs.rmSync(`${pkgDir}/dist`, { recursive: true })
  }

  const env =
    (pkg.buildOptions && pkg.buildOptions.env) ||
    (devOnly ? 'development' : 'production')

  // 使用 rollup 执行构建任务，并设置适当的构建环境（development 或 production）和参数
  await exec(
    'rollup', // 它通过 rollup 执行实际的构建过程，并且通过多线程并发执行加速构建
    [
      '-c',
      '--environment',
      [
        `COMMIT:${commit}`,
        `NODE_ENV:${env}`,
        `TARGET:${target}`,
        formats ? `FORMATS:${formats}` : ``,
        prodOnly ? `PROD_ONLY:true` : ``,
        sourceMap ? `SOURCE_MAP:true` : ``,
      ]
        .filter(Boolean)
        .join(','),
    ],
    { stdio: 'inherit' },
  )
}

/**
 * Checks the sizes of all targets. 文件大小检查
 * @param {string[]} targets - The targets to check sizes for.
 * @returns {Promise<void>}
 */
async function checkAllSizes(targets) {
  // 该函数检查所有构建目标的文件大小，特别是 global 格式的构建
  if (devOnly || (formats && !formats.includes('global'))) {
    return
  }
  console.log()
  for (const target of targets) {
    await checkSize(target)
  }
  console.log()
}

/**
 * Checks the size of a target.
 * 该函数检查目标包的 global 格式构建的文件大小，并打印出原始大小、gzip 压缩后的大小和 Brotli 压缩后的大小
 * @param {string} target - The target to check the size for.
 * @returns {Promise<void>}
 */
async function checkSize(target) {
  const pkgDir = path.resolve(`packages/${target}`)
  await checkFileSize(`${pkgDir}/dist/${target}.global.prod.js`)
  if (!formats || formats.includes('global-runtime')) {
    await checkFileSize(`${pkgDir}/dist/${target}.runtime.global.prod.js`)
  }
}

/**
 * Checks the file size.
 * 该函数用于计算并打印文件的大小，以及通过 Gzip 和 Brotli 压缩后的文件大小。如果启用了 size 参数，还会将这些数据保存为 JSON 文件。
 * @param {string} filePath - The path of the file to check the size for.
 * @returns {Promise<void>}
 */
async function checkFileSize(filePath) {
  if (!existsSync(filePath)) {
    return
  }
  const file = fs.readFileSync(filePath)
  const fileName = path.basename(filePath)

  const gzipped = gzipSync(file)
  const brotli = brotliCompressSync(file)

  console.log(
    `${pico.gray(pico.bold(fileName))} min:${prettyBytes(
      file.length,
    )} / gzip:${prettyBytes(gzipped.length)} / brotli:${prettyBytes(
      brotli.length,
    )}`,
  )

  if (writeSize)
    fs.writeFileSync(
      path.resolve(sizeDir, `${fileName}.json`),
      JSON.stringify({
        file: fileName,
        size: file.length,
        gzip: gzipped.length,
        brotli: brotli.length,
      }),
      'utf-8',
    )
}
