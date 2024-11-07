## 概述

`@vue/compat`（也叫“迁移构建”）是 Vue 3 的一个版本，提供了可配置的 Vue 2 兼容行为。

迁移构建默认以 Vue 2 模式运行——大部分公共 API 的行为与 Vue 2 完全一致，只有少数例外。使用 Vue 3 中已更改或已废弃的功能时，会发出运行时警告。功能的兼容性也可以在每个组件基础上启用或禁用。

### 预期用途

- 将 Vue 2 应用程序升级到 Vue 3（有[一些限制](#已知限制)）
- 将库迁移为支持 Vue 3
- 对于那些还没有尝试 Vue 3 的经验丰富的 Vue 2 开发者，可以使用迁移构建来代替 Vue 3，帮助学习两个版本之间的差异。

### 已知限制

尽管我们努力使迁移构建尽可能模仿 Vue 2 的行为，但仍有一些限制可能会导致您的应用程序无法升级：

- 依赖于 Vue 2 内部 API 或未文档化行为的依赖项。最常见的情况是使用 `VNodes` 上的私有属性。如果您的项目依赖于像 [Vuetify](https://vuetifyjs.com/en/)、[Quasar](https://quasar.dev/) 或 [ElementUI](https://element.eleme.io/#/en-US) 这样的组件库，最好等到它们发布 Vue 3 兼容版本。

- Internet Explorer 11 支持：[Vue 3 已正式放弃对 IE11 的支持计划](https://github.com/vuejs/rfcs/blob/master/active-rfcs/0038-vue3-ie11-support.md)。如果您仍然需要支持 IE11 或更低版本，则必须继续使用 Vue 2。

- 服务器端渲染（SSR）：迁移构建可以用于 SSR，但迁移自定义 SSR 设置要复杂得多。一般来说，您需要用 [`@vue/server-renderer`](https://github.com/vuejs/core/tree/main/packages/server-renderer) 替换 `vue-server-renderer`。Vue 3 不再提供捆绑渲染器，推荐使用 Vue 3 SSR 与 [Vite](https://vitejs.dev/guide/ssr.html)。如果您正在使用 [Nuxt.js](https://nuxtjs.org/)，最好等 Nuxt 3 发布。

### 预期

请注意，迁移构建的目标是仅覆盖 Vue 2 公共文档化的 API 和行为。如果您的应用程序由于依赖未文档化的行为而无法在迁移构建中运行，我们不太可能调整迁移构建以适应您的特定情况。考虑重构以移除对相关行为的依赖。

需要注意的是，如果您的应用程序很大且复杂，即使使用迁移构建，迁移过程也可能是一个挑战。如果您的应用程序不适合升级，请注意我们计划将 Composition API 和一些其他 Vue 3 功能回溯到 Vue 2.7 版本（预计在 2021 年第三季度末发布）。

如果您的应用程序能够在迁移构建上运行，您**可以**在迁移完成之前将其部署到生产环境。尽管有一定的性能/大小开销，但不会显著影响生产中的用户体验。如果您的应用程序依赖于 Vue 2 行为而无法升级或替换相关依赖，则可能需要这么做。

迁移构建将从 3.1 开始提供，并将与 3.2 发布线一起持续发布。我们计划最终在未来的次要版本中停止发布迁移构建（最早不早于 2021 年底），因此您仍然应该在那之前切换到标准构建。

## 升级工作流

以下工作流介绍了将一个实际的 Vue 2 应用（Vue HackerNews 2.0）迁移到 Vue 3 的步骤。完整的提交记录可以在 [这里](https://github.com/vuejs/vue-hackernews-2.0/compare/migration) 找到。请注意，实际所需的步骤可能因您的项目而异，这些步骤应作为一般指导，而非严格的指令。

### 准备工作

- 如果您仍在使用 [已废弃的命名/作用域插槽语法](https://vuejs.org/v2/guide/components-slots.html#Deprecated-Syntax)，请先将其更新为最新的语法（该语法已经在 2.6 版本中得到支持）。

### 安装

1. 如果适用，升级工具。

    - 如果使用自定义的 webpack 配置：升级 `vue-loader` 到 `^16.0.0`。
    - 如果使用 `vue-cli`：通过 `vue upgrade` 升级到最新的 `@vue/cli-service`。
    - （可选）迁移到 [Vite](https://vitejs.dev/) + [vite-plugin-vue2](https://github.com/underfin/vite-plugin-vue2)。[[示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/565b948919eb58f22a32afca7e321b490cb3b074)]

2. 在 `package.json` 中，将 `vue` 更新为 3.1 版本，安装与之对应的 `@vue/compat`，并替换 `vue-template-compiler`（如果存在）为 `@vue/compiler-sfc`：

   ```diff
   "dependencies": {
   -  "vue": "^2.6.12",
   +  "vue": "^3.1.0",
   +  "@vue/compat": "^3.1.0"
      ...
   },
   "devDependencies": {
   -  "vue-template-compiler": "^2.6.12"
   +  "@vue/compiler-sfc": "^3.1.0"
   }
   ```

   [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/14f6f1879b43f8610add60342661bf915f5c4b20)

3. 在构建设置中，将 `vue` 别名设置为 `@vue/compat`，并通过 Vue 编译器选项启用兼容模式。

   **示例配置**

   <details>
     <summary><b>vue-cli</b></summary>

   ```js
   // vue.config.js
   module.exports = {
     chainWebpack: config => {
       config.resolve.alias.set('vue', '@vue/compat')

       config.module
         .rule('vue')
         .use('vue-loader')
         .tap(options => {
           return {
             ...options,
             compilerOptions: {
               compatConfig: {
                 MODE: 2,
               },
             },
           }
         })
     },
   }
   ```

   </details>

   <details>
     <summary><b>纯 webpack</b></summary>

   ```js
   // webpack.config.js
   module.exports = {
     resolve: {
       alias: {
         vue: '@vue/compat',
       },
     },
     module: {
       rules: [
         {
           test: /\.vue$/,
           loader: 'vue-loader',
           options: {
             compilerOptions: {
               compatConfig: {
                 MODE: 2,
               },
             },
           },
         },
       ],
     },
   }
   ```

   </details>

   <details>
     <summary><b>Vite</b></summary>

   ```js
   // vite.config.js
   export default {
     resolve: {
       alias: {
         vue: '@vue/compat',
       },
     },
     plugins: [
       vue({
         template: {
           compilerOptions: {
             compatConfig: {
               MODE: 2,
             },
           },
         },
       }),
     ],
   }
   ```

   </details>

4. 此时，您的应用可能会遇到一些编译时错误/警告（例如使用了过滤器）。首先解决这些问题。如果所有编译器警告消失，您可以将编译器设置为 Vue 3 模式。

   [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/b05d9555f6e115dea7016d7e5a1a80e8f825be52)

5. 解决错误后，如果应用程序不受上述[已知限制](#已知限制)的影响，应该可以运行。

   您可能会看到来自命令行和浏览器控制台的许多警告。以下是一些通用的建议：

    - 您可以在浏览器控制台中过滤特定的警告。建议使用过滤器，专注于一次解决一个问题。您也可以使用否定过滤器，例如 `-GLOBAL_MOUNT`。

    - 您可以通过 [兼容配置](#compat-configuration) 来屏蔽特定的废弃警告。

    - 某些警告可能是由您使用的依赖项（例如 `vue-router`）引起的。您可以通过警告的组件跟踪或堆栈跟踪（点击展开）来检查这一点。首先解决您自己源代码中的警告。

    - 如果您正在使用 `vue-router`，请注意 `<transition>` 和 `<keep-alive>` 在升级到 `vue-router` v4 之前无法与 `<router-view>` 一起使用。

6. 更新 [`<transition>` 类名](https://v3-migration.vuejs.org/breaking-changes/transition.html)。这是唯一没有运行时警告的功能。您可以在整个项目中搜索 `.*-enter` 和 `.*-leave` CSS 类名。

   [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/d300103ba622ae26ac26a82cd688e0f70b6c1d8f)

7. 更新应用程序入口，使用 [新的全局挂载 API](https://v3-migration.vuejs.org/breaking-changes/global-api.html#a-new-global-api-createapp)。

   [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/a6e0c9ac7b1f4131908a4b1e43641f608593f714)

8. [升级 `vuex` 到 v4](https://next.vuex.vuejs.org/guide/migrating-to-4-0-from-3-x.html)。

   [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/5bfd4c61ee50f358cd5daebaa584f2c3f91e0205)

9. [升级 `vue-router` 到 v4](https://next.router.vuejs.org/guide/migration/index.html)。如果您还使用 `vuex-router-sync`，可以用一个 store getter 来替代它。

   升级后，要在 `<router-view>` 中使用 `<transition>` 和 `<keep-alive>`，需要使用新的 [基于作用域插槽的语法](https://next.router.vuejs.org/guide/migration/index.html#router-view-keep-alive-and-transition)。

   [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/758961e73ac4089890079d4ce14996741cf9344b)

10. 逐个解决警告。请注意，某些功能在 Vue 2 和 Vue 3 中的行为存在冲突——例如，渲染函数 API 或函数式组件与异步组件的变化。要迁移到 Vue 3 API 而不影响应用的其他部分，您可以通过 [`compatConfig` 选项](#per-component-config) 在每个组件基础上选择性地启用 Vue 3 行为。

    [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/d0c7d3ae789be71b8fd56ce79cb4cb1f921f893b)

11. 当所有警告解决后，您可以移除迁移构建并切换到正式的 Vue 3。请注意，如果您仍有依赖于 Vue 2 行为的依赖项，可能无法进行此操作。

    [示例提交](https://github.com/vuejs/vue-hackernews-2.0/commit/9beb45490bc5f938c9e87b4ac1357cfb799565bd)

## 兼容性配置

### 全局配置

可以单独禁用兼容性功能：

```js
import { configureCompat } from 'vue'

// 禁用某些功能的兼容性
configureCompat({
  FEATURE_ID_A: false,
  FEATURE_ID_B: false,
})
```

或者，整个应用程序可以默认采用 Vue 3 的行为，只有某些兼容性功能被启用：

```js
import { configureCompat } from 'vue'

// 默认所有功能使用 Vue 3 的行为，只有某些功能启用兼容性
configureCompat({
  MODE: 3,
  FEATURE_ID_A: true,
  FEATURE_ID_B: true,
})
```

### 按组件配置

一个组件可以使用 `compatConfig` 选项，该选项接受与全局 `configureCompat` 方法相同的选项：

```js
export default {
  compatConfig: {
    MODE: 3, // 仅对该组件启用 Vue 3 行为
    FEATURE_ID_A: true, // 功能也可以在组件级别切换
  },
  // ...
}
```

### 编译器特定配置

以 `COMPILER_` 开头的功能是编译器特定的：如果您使用的是完整构建（带有浏览器内编译器），这些功能可以在运行时配置。然而，如果使用构建设置，它们必须通过构建配置中的 `compilerOptions` 配置（请参阅上述示例配置）。


