import {
  type App,
  type CreateAppFunction,
  type DefineComponent,
  DeprecationTypes,
  type Directive,
  type ElementNamespace,
  type HydrationRenderer,
  type Renderer,
  type RootHydrateFunction,
  type RootRenderFunction,
  compatUtils,
  createHydrationRenderer,
  createRenderer,
  isRuntimeOnly,
  warn,
} from '@vue/runtime-core'
import { nodeOps } from './nodeOps'
import { patchProp } from './patchProp'
// Importing from the compiler, will be tree-shaken in prod
import {
  NOOP,
  extend,
  isFunction,
  isHTMLTag,
  isMathMLTag,
  isSVGTag,
  isString,
} from '@vue/shared'
import type { TransitionProps } from './components/Transition'
import type { TransitionGroupProps } from './components/TransitionGroup'
import type { vShow } from './directives/vShow'
import type { VOnDirective } from './directives/vOn'
import type { VModelDirective } from './directives/vModel'

/**
 * This is a stub implementation to prevent the need to use dom types.
 *
 * To enable proper types, add `"dom"` to `"lib"` in your `tsconfig.json`.
 * 要启用正确的类型，请在 tsconfig.json 中的 "lib" 配置中添加 "dom"
 */
type DomStub = {} // DomStub 是一个空对象类型，表示一个占位符类型。它用于在环境不支持 window 对象的情况下作为默认类型

// globalThis 是一个全局对象，代表当前的全局上下文。在浏览器环境中，它对应的是 window 对象，而在 Node.js 环境中，它对应的是 global 对象

// typeof globalThis 是获取 globalThis 的类型。
// 在浏览器中，typeof globalThis 将会是 Window 类型，而在 Node.js 中，它会是 NodeJS.Global 类型，或者 undefined（如果在没有全局对象的上下文中）。

// 这是一个条件类型，它根据当前环境是否支持 window 对象来决定类型。
//
// typeof globalThis 获取当前全局对象的类型。在浏览器环境中，globalThis 通常是 window。
// extends { window: unknown } 用来检查 globalThis 是否具有 window 属性。简单来说，它判断当前环境是否是浏览器环境，因为浏览器环境下 globalThis 会有 window 对象。
// 如果 globalThis 有 window 属性（即环境是浏览器），那么 DomType<T> 就是 T 类型。
// 否则，DomType<T> 会是 DomStub，即一个空对象类型。
type DomType<T> = typeof globalThis extends { window: unknown } ? T : DomStub

// 这段代码扩展了 @vue/reactivity 模块，定义了 RefUnwrapBailTypes 接口的一个新的属性 runtimeDOMBailTypes，
// 该属性的类型为 DomType<Node | Window>，这是 Vue 相关的一个类型，通常用于描述 DOM 节点或窗口对象
declare module '@vue/reactivity' {
  export interface RefUnwrapBailTypes {
    runtimeDOMBailTypes: DomType<Node | Window>
  }
}

// 这段代码允许开发者在全局范围内使用这些组件和指令，同时也提供了类型推导，确保开发过程中对这些 Vue 组件和指令的使用符合类型规范
declare module '@vue/runtime-core' {
  interface GlobalComponents {
    Transition: DefineComponent<TransitionProps>
    TransitionGroup: DefineComponent<TransitionGroupProps>
  }

  interface GlobalDirectives {
    vShow: typeof vShow
    vOn: VOnDirective
    vBind: VModelDirective
    vIf: Directive<any, boolean>
    VOnce: Directive
    VSlot: Directive
  }
}

// 通过 extend({ patchProp }, nodeOps) 创建了一个渲染器的选项对象 rendererOptions，并根据这些选项来初始化 Vue 渲染器。渲染器用于处理虚拟 DOM 的更新
const rendererOptions = /*@__PURE__*/ extend({ patchProp }, nodeOps)

// lazy create the renderer - this makes core renderer logic tree-shakable
// in case the user only imports reactivity utilities from Vue.
// 延迟创建渲染器 - 这样可以使核心渲染器逻辑在用户仅导入 Vue 的响应式工具时进行树摇优化
// 如果你只使用 Vue 的响应式功能而不需要渲染功能，Vue 就不会创建或加载渲染器逻辑，这样可以使应用更加轻量。只有在需要渲染到 DOM 时，渲染器才会被延迟初始化
// 这样声明 renderer 变量，可以根据需要选择使用普通的渲染器或专门用于水合的渲染器，具体取决于应用是客户端渲染（CSR）还是服务器端渲染（SSR）
let renderer: Renderer<Element | ShadowRoot> | HydrationRenderer

let enabledHydration = false

// 渲染器在 ensureRenderer 和 ensureHydrationRenderer 函数中延迟初始化，
// 这样做是为了避免不必要的加载和增强树的可摇性（tree-shaking）。当需要渲染器或水合渲染器时，才会创建它们
// 为什么要使用 ensureRenderer 函数？
// * 延迟初始化：渲染器只有在真正需要的时候才会被创建。这种设计模式可以减少不必要的开销，特别是当应用仅使用响应式系统而不进行渲染时，渲染器不会被初始化。
// * 单例模式：确保在整个应用生命周期中只创建一个渲染器实例。即使 ensureRenderer 被多次调用，它始终返回同一个 renderer 实例，避免重复创建。
function ensureRenderer() {
  // 如果 renderer 不存在（即第一次调用 ensureRenderer 时），函数会调用 createRenderer 来创建一个新的渲染器实例，并将其赋值给 renderer
  return (
    renderer ||
    (renderer = createRenderer<Node, Element | ShadowRoot>(rendererOptions))
  )
}

// 水合渲染器主要用于将服务器端渲染（SSR）生成的静态 HTML 页面与客户端的 Vue 应用绑定，确保客户端的 Vue 应用与 SSR 页面能够正确协作。
// 为什么要使用 ensureHydrationRenderer 函数？
// * 延迟初始化：只有在需要水合渲染器时才会创建它，从而节省性能资源，尤其是在只需要普通渲染器的情况下（例如客户端渲染时）。
// * 单例模式：通过 enabledHydration 确保在应用生命周期内只创建一个水合渲染器实例。即使 ensureHydrationRenderer 被多次调用，它始终返回同一个水合渲染器实例，避免不必要的重复创建。
// * 适配 SSR：水合渲染器的作用是将服务器端渲染的 HTML 与客户端 Vue 实例连接起来，确保客户端应用能够接管服务器端渲染的页面，保持一致的 UI 和交互行为。
function ensureHydrationRenderer() {
  // 如果 enabledHydration 为 true，则意味着水合渲染器已经被初始化过了。此时，直接返回现有的 renderer
  // 如果 enabledHydration 为 false，表示水合渲染器尚未创建，则需要通过 createHydrationRenderer 创建一个新的水合渲染器
  renderer = enabledHydration
    ? renderer
    : createHydrationRenderer(rendererOptions)
  // 一旦水合渲染器被创建，它会将 enabledHydration 设置为 true，表示水合渲染器已经被启用，之后不会再重新创建
  enabledHydration = true
  return renderer as HydrationRenderer
}

// render 和 hydrate 是 Vue 渲染和水合（hydration）操作的入口。
// 它们通过调用 ensureRenderer().render 和 ensureHydrationRenderer().hydrate 来执行实际的渲染和水合
// use explicit type casts here to avoid import() calls in rolled-up d.ts
export const render = ((...args) => {
  ensureRenderer().render(...args)
}) as RootRenderFunction<Element | ShadowRoot>

export const hydrate = ((...args) => {
  ensureHydrationRenderer().hydrate(...args)
}) as RootHydrateFunction

// createApp 是创建 Vue 应用的入口函数。它包括了应用挂载、模板处理、开发环境下的检查等功能
export const createApp = ((...args) => {
  // ensureRenderer() 函数会确保渲染器被初始化并返回渲染器实例。createApp 是渲染器中的一个方法，用于创建一个 Vue 应用实例。
  // ...args 将传递给 createApp，这些参数通常包括组件、选项等
  const app = ensureRenderer().createApp(...args)

  // 如果是开发模式，调用 injectNativeTagCheck 和 injectCompilerOptionsCheck 两个函数，分别用于检查原生标签和编译选项。
  if (__DEV__) {
    injectNativeTagCheck(app)
    injectCompilerOptionsCheck(app)
  }

  const { mount } = app
  // 自定义 app.mount 方法
  app.mount = (containerOrSelector: Element | ShadowRoot | string): any => {
    // 将传入的挂载目标（可以是 Element、ShadowRoot 或字符串）规范化为 DOM 元素或 Shadow DOM
    const container = normalizeContainer(containerOrSelector)
    if (!container) return

    const component = app._component // 即用户传入 createApp 方法中对象
    // 如果组件没有 render 或 template，会将 container.innerHTML 赋值给组件的 template，这对于从 DOM 模板初始化 Vue 组件的场景很有用。
    // 这里也提醒开发者要小心，直接使用 innerHTML 可能会执行不安全的 JavaScript 表达式，特别是在 DOM 模板包含了用户输入的内容时。
    if (!isFunction(component) && !component.render && !component.template) {
      // __UNSAFE__
      // Reason: potential execution of JS expressions in in-DOM template.
      // The user must make sure the in-DOM template is trusted. If it's
      // rendered by the server, the template should not contain any user data.
      component.template = container.innerHTML
      // 2.x compat check
      if (__COMPAT__ && __DEV__ && container.nodeType === 1) {
        for (let i = 0; i < (container as Element).attributes.length; i++) {
          const attr = (container as Element).attributes[i]
          if (attr.name !== 'v-cloak' && /^(v-|:|@)/.test(attr.name)) {
            compatUtils.warnDeprecation(
              DeprecationTypes.GLOBAL_MOUNT_CONTAINER,
              null,
            )
            break
          }
        }
      }
    }

    // clear content before mounting
    // 如果容器是 DOM 元素，清空容器的文本内容：container.textContent = ''
    if (container.nodeType === 1) {
      container.textContent = ''
    }
    // 调用原始的 mount 方法，将 Vue 应用挂载到目标容器
    // resolveRootNamespace 是一个函数，用于根据容器的类型返回正确的命名空间，处理 SVG 或 MathML 标签时可能需要设置正确的命名空间
    const proxy = mount(container, false, resolveRootNamespace(container))
    // 如果挂载目标是 Element，移除 v-cloak 属性，并设置 data-v-app 属性
    if (container instanceof Element) {
      container.removeAttribute('v-cloak')
      container.setAttribute('data-v-app', '')
    }
    return proxy
  }

  return app
}) as CreateAppFunction<Element>

// createSSRApp 用于创建服务器端渲染（SSR）应用，提供与客户端渲染类似的功能，但在服务端渲染时会处理水合逻辑
// createSSRApp 是一个为服务端渲染（SSR）专门设计的函数。
// 它的作用是创建一个 Vue 应用实例，但与 createApp 不同的是，它针对 SSR 环境进行了适配，特别是在初始化和挂载过程中处理了 SSR 相关的逻辑
export const createSSRApp = ((...args) => {
  // 在 SSR 环境下，渲染器用于初始化应用并进行水合（hydration），即将预渲染的 HTML 内容与客户端 Vue 实例绑定起来
  const app = ensureHydrationRenderer().createApp(...args)

  // 开发模式下的额外检查，调用 injectNativeTagCheck 和 injectCompilerOptionsCheck 进行一些内部的标签和编译选项验证
  if (__DEV__) {
    injectNativeTagCheck(app)
    injectCompilerOptionsCheck(app)
  }

  const { mount } = app
  app.mount = (containerOrSelector: Element | ShadowRoot | string): any => {
    // 用于将传入的挂载目标（可以是 Element、ShadowRoot 或字符串）规范化为 DOM 元素或 Shadow DOM
    const container = normalizeContainer(containerOrSelector)
    if (container) {
      // reateSSRApp 的 mount 方法会传递一个 true 参数给原始的 mount，这标志着它正在进行 SSR 水合操作。
      // 这与普通客户端渲染的 createApp 的 mount 方法不同，后者可能会执行更多客户端初始化的逻辑
      return mount(container, true, resolveRootNamespace(container))
    }
  }

  return app
}) as CreateAppFunction<Element>

/**
 * 用于确定一个容器元素的命名空间（namespace）
 * @param container
 */
function resolveRootNamespace(
  container: Element | ShadowRoot,
): ElementNamespace {
  // 它会检测一个元素是否属于 SVG 或 MathML 命名空间，并返回相应的命名空间标识符（'svg' 或 'mathml'）
  if (container instanceof SVGElement) {
    return 'svg'
  }
  if (
    typeof MathMLElement === 'function' &&
    container instanceof MathMLElement
  ) {
    return 'mathml'
  }
}

/**
 * injectNativeTagCheck 用于在开发模式下为 isNativeTag 提供验证，确保组件的标签是合法的 HTML、SVG 或 MathML 标签
 * @param app
 */
function injectNativeTagCheck(app: App) {
  // Inject `isNativeTag`
  // this is used for component name validation (dev only)
  // 用于 Vue 应用的开发模式下的工具函数，它将 isNativeTag 属性注入到应用的配置(app.config)中，以便在开发过程中验证组件名称是否合法。
  // 它的作用是帮助 Vue 在组件名称验证时，判断一个标签是否是原生 HTML 标签、SVG 标签或 MathML 标签
  Object.defineProperty(app.config, 'isNativeTag', {
    value: (tag: string) => isHTMLTag(tag) || isSVGTag(tag) || isMathMLTag(tag),
    writable: false,
  })
}

// dev only
/**
 * injectCompilerOptionsCheck 用于检查是否使用了运行时编译器，并发出警告，告知用户如何正确配置编译选项
 * @param app
 */
function injectCompilerOptionsCheck(app: App) {
  // 它判断当前 Vue 应用是否在“仅运行时”模式下运行。在该模式下，Vue 编译器并未包含在构建中，这意味着 Vue 仅提供运行时功能（如虚拟 DOM 渲染等），不包括模板编译功能。
  if (isRuntimeOnly()) {
    // 在 runtime-only 模式下，Vue 通过 isCustomElement 配置来指定自定义元素（Custom Elements）。但是该配置已经被弃用，并将在未来版本中被移除
    const isCustomElement = app.config.isCustomElement
    // 使用 Object.defineProperty，Vue 会警告开发者，提示该配置已废弃，并建议开发者使用 compilerOptions.isCustomElement 替代它
    Object.defineProperty(app.config, 'isCustomElement', {
      get() {
        return isCustomElement
      },
      set() {
        warn(
          `The \`isCustomElement\` config option is deprecated. Use ` +
            `\`compilerOptions.isCustomElement\` instead.`,
        )
      },
    })

    // 如果开发者在 runtime-only 模式下使用了 compilerOptions 配置，Vue 会显示警告，告知 compilerOptions 选项仅在包含 Vue 编译器（即 "full build"）的情况下才会生效
    const compilerOptions = app.config.compilerOptions
    // 在 runtime-only 模式下，compilerOptions 必须通过构建工具（如 vue-loader、vue-cli 或 vite）传递给 @vue/compiler-dom
    const msg =
      `The \`compilerOptions\` config option is only respected when using ` +
      `a build of Vue.js that includes the runtime compiler (aka "full build"). ` +
      `Since you are using the runtime-only build, \`compilerOptions\` ` +
      `must be passed to \`@vue/compiler-dom\` in the build setup instead.\n` +
      `- For vue-loader: pass it via vue-loader's \`compilerOptions\` loader option.\n` +
      `- For vue-cli: see https://cli.vuejs.org/guide/webpack.html#modifying-options-of-a-loader\n` +
      `- For vite: pass it via @vitejs/plugin-vue options. See https://github.com/vitejs/vite-plugin-vue/tree/main/packages/plugin-vue#example-for-passing-options-to-vuecompiler-sfc`

    Object.defineProperty(app.config, 'compilerOptions', {
      get() {
        warn(msg)
        return compilerOptions
      },
      set() {
        warn(msg)
      },
    })
  }
}

/**
 * normalizeContainer 函数用于将挂载目标容器（可以是选择器、DOM 元素或 ShadowRoot）标准化为一个有效的容器，并进行一些开发时的警告
 * @param container
 */
function normalizeContainer(
  container: Element | ShadowRoot | string,
): Element | ShadowRoot | null {
  if (isString(container)) {
    const res = document.querySelector(container) // 获取模板 dom 元素
    if (__DEV__ && !res) {
      warn(
        `Failed to mount app: mount target selector "${container}" returned null.`,
      )
    }
    return res
  }
  if (
    __DEV__ &&
    window.ShadowRoot &&
    container instanceof window.ShadowRoot &&
    container.mode === 'closed'
  ) {
    warn(
      `mounting on a ShadowRoot with \`{mode: "closed"}\` may lead to unpredictable bugs`,
    )
  }
  return container as any
}

// Custom element support
// 代码还导出了 Vue 自定义元素的相关 API，如 defineCustomElement、useShadowRoot 等，用于在 Web Components 中使用 Vue
export {
  defineCustomElement,
  defineSSRCustomElement,
  useShadowRoot,
  useHost,
  VueElement,
  type VueElementConstructor,
  type CustomElementOptions,
} from './apiCustomElement'

// SFC CSS utilities
export { useCssModule } from './helpers/useCssModule'
export { useCssVars } from './helpers/useCssVars'

// DOM-only components 用于处理 Vue 组件的过渡效果
export { Transition, type TransitionProps } from './components/Transition'
export {
  TransitionGroup,
  type TransitionGroupProps,
} from './components/TransitionGroup'

// **Internal** DOM-only runtime directive helpers
export {
  vModelText,
  vModelCheckbox,
  vModelRadio,
  vModelSelect,
  vModelDynamic,
} from './directives/vModel'
export { withModifiers, withKeys } from './directives/vOn'
export { vShow } from './directives/vShow'

import { initVModelForSSR } from './directives/vModel'
import { initVShowForSSR } from './directives/vShow'

let ssrDirectiveInitialized = false

/**
 * @internal 初始化 SSR 指令，确保服务端渲染时的指令正确执行
 *
 * _SSR__ 是一个全局常量，用来判断当前是否处于服务端渲染（SSR）环境。
 * 如果是 SSR 环境，initDirectivesForSSR 会执行指令初始化；如果不是 SSR 环境，则会使用 NOOP（即“空操作”），这意味着不会执行任何操作
 */
export const initDirectivesForSSR: () => void = __SSR__
  ? () => {
      if (!ssrDirectiveInitialized) {
        // 确保指令只被初始化一次
        ssrDirectiveInitialized = true
        // initDirectivesForSSR 的主要作用是在 SSR 环境中确保特定的 Vue 指令（如 v-model 和 v-show）得到适当初始化。
        // 这些指令在 SSR 中可能涉及特殊的行为或处理，因此需要专门的初始化。
        initVModelForSSR()
        initVShowForSSR()
      }
    }
  : NOOP

// 导出 Vue 核心 API
// re-export everything from core
// h, Component, reactivity API, nextTick, flags & types
export * from '@vue/runtime-core'

export * from './jsx'
