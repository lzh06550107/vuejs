import { initCustomFormatter } from '@vue/runtime-dom'

// 用于初始化开发环境中的一些设置，特别是用于在浏览器中运行 Vue 的情况
// 这个函数用于初始化开发模式的设置
export function initDev(): void {
  if (__BROWSER__) {
    // 在浏览器中
    if (!__ESM_BUNDLER__) {
      // 当前不是通过 ESM bundler（如 webpack、rollup 等）运行的
      console.info(
        `You are running a development build of Vue.\n` +
          `Make sure to use the production build (*.prod.js) when deploying for production.`,
      )
    }

    // 这个函数的作用是初始化自定义格式化器，通常用于在 Vue Devtools 工具中美化 Vue 组件的输出
    // 调用 initCustomFormatter 函数，初始化自定义的格式化器。
    // 这通常用于增强开发工具（如 Vue Devtools）的调试体验，使得 Vue 组件的状态和结构在 Vue Devtools 工具中更易于理解。
    initCustomFormatter()
  }
}
