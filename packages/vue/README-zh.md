# Vue

## 选择哪个 Vue 构建文件

### 直接从 CDN 或不使用 Bundler

1. **`vue(.runtime).global(.prod).js`**：

    - **用途**：通过 `<script src="...">` 在浏览器中直接使用 Vue。暴露 Vue 全局对象。
    - **构建类型**：这是 IIFE 格式构建，仅用于直接在浏览器中引用，**不是** UMD 构建。
    - **模板编译**：
        - `vue.global.js`：包含编译器和运行时的 “完整版”，支持在浏览器中即时编译模板。
        - `vue.runtime.global.js`：仅包含运行时，需要在构建步骤中预编译模板。
    - **特点**：包含所有 Vue 核心内部包的单一文件，无需依赖其他文件。必须从此文件中导入所有内容，以确保代码实例一致。
    - **生产环境**：`.prod.js` 文件已进行预压缩优化，适合在生产环境中使用。

2. **`vue(.runtime).esm-browser(.prod).js`**：

    - **用途**：使用原生 ES 模块导入（例如 `<script type="module">`）在浏览器中直接引入。
    - **特点**：与全局构建共享相同的运行时编译、依赖内联和硬编码的开发/生产模式切换。

### 使用 Bundler

3. **`vue(.runtime).esm-bundler.js`**：

    - **用途**：适用于使用 webpack、rollup、parcel 等打包工具的项目。
    - **特点**：
        - 保留了 `process.env.NODE_ENV` 的开发/生产模式切换分支（需由打包工具替换）。
        - 未进行压缩（将在打包后统一压缩）。
        - 导入依赖项（如 `@vue/runtime-core`、`@vue/compiler-core`），确保所有依赖版本一致。
    - **模板编译**：
        - 默认文件 `vue.runtime.esm-bundler.js` 仅包含运行时，要求预编译所有模板（如在 `.vue` 文件中）。
        - `vue.esm-bundler.js`：包含运行时编译器。如果需要在打包中进行运行时模板编译（如 DOM 内模板或内联 JS 字符串），可以使用此文件。需配置打包工具将 `vue` 别名指向该文件。
    - **功能标志**：
        - `__VUE_OPTIONS_API__`：控制是否支持 Options API（默认开启）。
        - `__VUE_PROD_DEVTOOLS__`：控制生产环境中是否启用 devtools 支持（默认关闭）。
        - `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__`：控制生产环境中是否启用详细的 hydration 不匹配警告（默认关闭）。
    - **优化建议**：建议配置这些标志，以便在最终打包中实现有效的 Tree Shaking。

### 服务端渲染 (SSR)

4. **`vue.cjs(.prod).js`**：

    - **用途**：用于 Node.js 的服务端渲染，通过 `require()` 导入。
    - **特点**：如果使用 webpack 打包并设置 `target: 'node'`，并正确地将 Vue 外部化，则会加载此构建文件。
    - **环境**：开发/生产文件已预构建，适当的文件将根据 `process.env.NODE_ENV` 自动加载。
