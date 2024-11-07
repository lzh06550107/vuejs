// @ts-check
import fs from 'node:fs'

// 这段代码的主要功能是检查指定的包目录中是否存在编译输出文件。如果这些文件中有一个缺失，脚本将以非零状态退出（process.exit(1)），通常表示构建错误或未完成

// packagesToCheck 数组列出了需要检查的包名称，这些包应该位于项目的 packages 目录中
const packagesToCheck = [
  'compiler-sfc',
  'compiler-core',
  'compiler-dom',
  'compiler-ssr',
  'shared',
]

// allFilesPresent 用于跟踪所有包的文件是否都存在。如果有一个文件缺失，它将被设置为 false
let allFilesPresent = true

// 这个循环遍历每个包名，并构造出包的目标文件路径，如 ../packages/compiler-sfc/dist/compiler-sfc.cjs.js。它使用 fs.existsSync 检查该文件是否存在
for (const pkg of packagesToCheck) {
  if (
    !fs.existsSync(
      new URL(`../packages/${pkg}/dist/${pkg}.cjs.js`, import.meta.url),
    )
  ) {
    // 如果某个文件不存在，allFilesPresent 会被设置为 false，并且跳出循环
    allFilesPresent = false
    break
  }
}

// 如果 allFilesPresent 为 false，则调用 process.exit(1) 退出进程并返回 1，表示检查失败。这种状态码通常被用来表明构建未通过
// 如果所有文件都存在，脚本会继续运行，不会调用 process.exit(1)
if (!allFilesPresent) {
  process.exit(1)
}
