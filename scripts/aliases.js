// @ts-check
// these aliases are shared between vitest and rollup
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 解析包的入口文件
const resolveEntryForPkg = (/** @type {string} */ p) =>
  path.resolve(
    fileURLToPath(import.meta.url),
    `../../packages/${p}/src/index.ts`,
  )

// readdirSync 读取 packages 目录下的所有文件和子目录，new URL('../packages', import.meta.url)
// 将 packages 目录的相对路径转换为 URL 格式。最终 dirs 数组包含了所有包的目录名称。
const dirs = readdirSync(new URL('../packages', import.meta.url))

// entries 对象初步包含了四个 Vue 相关包的入口路径，这些包的入口文件路径通过调用 resolveEntryForPkg 函数来确定
/** @type {Record<string, string>} */
const entries = {
  vue: resolveEntryForPkg('vue'),
  'vue/compiler-sfc': resolveEntryForPkg('compiler-sfc'),
  'vue/server-renderer': resolveEntryForPkg('server-renderer'),
  '@vue/compat': resolveEntryForPkg('vue-compat'),
}

// 定义了一个排除列表 nonSrcPackages，其中包含一些不需要入口文件的包（如 sfc-playground, template-explorer, dts-test 等）。这些包不会被添加到 entries 中
const nonSrcPackages = ['sfc-playground', 'template-explorer', 'dts-test']

// 这个循环遍历了 dirs 中的每个目录（即包名）
for (const dir of dirs) {
  const key = `@vue/${dir}` // 构建出包的键名
  if (
    // 排除掉 vue 包、在 nonSrcPackages 列表中的包，并且只处理目录
    dir !== 'vue' &&
    !nonSrcPackages.includes(dir) &&
    !(key in entries) &&
    statSync(new URL(`../packages/${dir}`, import.meta.url)).isDirectory()
  ) {
    // 使用 statSync 检查该目录是否存在并且是一个文件夹，如果是文件夹，就调用 resolveEntryForPkg(dir) 函数，动态地将该包的入口路径添加到 entries 对象中
    entries[key] = resolveEntryForPkg(dir)
  }
}

export { entries }
