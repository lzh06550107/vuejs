// This entry exports the runtime only, and is built as
// `dist/vue.esm-bundler.js` which is used by default for bundlers.
import { initDev } from './dev'
import { warn } from '@vue/runtime-dom'

if (__DEV__) {
  initDev()
}

// 这行代码重新导出了 @vue/runtime-dom 中的所有导出内容。
// @vue/runtime-dom 是 Vue 3 中用于处理渲染相关的核心模块，提供了如 h()（创建 VNode）、render()（渲染函数）等功能。
export * from '@vue/runtime-dom'

// 定义了一个名为 compile 的导出函数，并根据当前的构建模式输出不同的警告信息
// compile 函数的作用是如果尝试在不支持的环境中使用运行时编译功能时，输出明确的警告信息，并提供解决方案
// 这些警告的目的是帮助开发者根据自己的构建环境选择合适的 Vue 版本
export const compile = (): void => {
  if (__DEV__) {
    warn(
      `Runtime compilation is not supported in this build of Vue.` +
        (__ESM_BUNDLER__ // 这是适用于现代构建工具（如 Webpack、Vite 等）打包的版本，它包含了编译器，并支持通过构建工具将 Vue 编译成渲染函数。这个版本支持运行时模板编译
          ? ` Configure your bundler to alias "vue" to "vue/dist/vue.esm-bundler.js".`
          : __ESM_BROWSER__
            ? ` Use "vue.esm-browser.js" instead.`
            : __GLOBAL__
              ? ` Use "vue.global.js" instead.`
              : ``) /* should not happen */,
    )
  }
}
