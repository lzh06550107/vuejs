// 定义了一些全局常量、特性标志、以及模块声明

// Global compile-time constants 全局编译时常量
// 这些常量会在代码中通过 define 插件或其他类似机制在编译时注入，并在应用程序中可用。它们通常在构建时根据不同的构建环境进行设置，比如生产环境或开发环境
declare var __DEV__: boolean // 表示是否处于开发环境。如果是开发环境，它的值是 true，否则是 false
declare var __TEST__: boolean // 表示是否处于测试环境。通常用于测试相关的编译设置
declare var __BROWSER__: boolean // 表示当前构建是否是针对浏览器的
declare var __GLOBAL__: boolean // 表示是否为全局构建（如 IIFE 格式）
declare var __ESM_BUNDLER__: boolean // 表示是否是 ESM（模块）捆绑器构建
declare var __ESM_BROWSER__: boolean // 表示是否是浏览器 ESM 构建
declare var __CJS__: boolean // 表示是否是 CommonJS 构建
declare var __SSR__: boolean // 表示是否为 SSR（服务器端渲染）构建
declare var __VERSION__: string // 表示当前项目的版本号
// Vue 3 的 兼容版本（通常称为 Vue 3 Compat）是 Vue 3 的一个特殊构建版本，
// 它主要为 Vue 2.x 版本的用户提供过渡支持，使得从 Vue 2.x 升级到 Vue 3 变得更加平滑。
// 该版本的目标是帮助开发者在迁移到 Vue 3 时，能够继续使用 Vue 2.x 的一些 API 和特性，而不需要立即重写大量代码
declare var __COMPAT__: boolean // 表示是否为兼容版本构建（例如 Vue 3 的兼容版本）

// Feature flags 这些标志用于控制项目的特性功能开关，通常根据项目需求或配置来决定是否启用某些功能
declare var __FEATURE_OPTIONS_API__: boolean // 表示是否启用 Options API（Vue 中的一种组件定义方式）
declare var __FEATURE_PROD_DEVTOOLS__: boolean // 表示是否启用生产环境的开发者工具（如 Vue DevTools）
declare var __FEATURE_SUSPENSE__: boolean // 表示是否启用 Suspense（用于异步组件加载的特性）
declare var __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__: boolean // 表示是否启用生产环境中的水合不匹配详细信息（用于 SSR 时的客户端和服务器端渲染的差异）

// 告诉 TypeScript，当遇到 .vue 文件时，它应该被认为是一个模块（可以导入），并且后续代码可以通过正确的类型推断来处理这些文件
declare module '*.vue' {}

// 为 estree-walker 库定义了类型声明。该库用于遍历和操作 AST（抽象语法树）。
// walk 函数接受一个 AST 根节点和一些操作选项，如 enter 和 leave 回调，允许在树的遍历过程中执行自定义逻辑。
declare module 'estree-walker' {
  export function walk<T>(
    root: T,
    options: {
      enter?: (node: T, parent: T | null) => any
      leave?: (node: T, parent: T | null) => any
      exit?: (node: T) => any
    } & ThisType<{ skip: () => void }>,
  )
}

// 扩展了 String 类型，增加了一个过时的 substring 方法的声明。
// 提示用户应该使用 String.prototype.slice 方法，而不是 substring。substring 已被标记为过时，建议使用 slice 来替代
declare interface String {
  /**
   * @deprecated Please use String.prototype.slice instead of String.prototype.substring in the repository.
   */
  substring(start: number, end?: number): string
}
