import {
  type Component,
  type ComponentInternalInstance,
  type ConcreteComponent,
  type Data,
  getComponentPublicInstance,
  validateComponentName,
} from './component'
import type {
  ComponentOptions,
  MergedComponentOptions,
  RuntimeCompilerOptions,
} from './componentOptions'
import type {
  ComponentCustomProperties,
  ComponentPublicInstance,
} from './componentPublicInstance'
import { type Directive, validateDirectiveName } from './directives'
import type { ElementNamespace, RootRenderFunction } from './renderer'
import type { InjectionKey } from './apiInject'
import { warn } from './warning'
import { type VNode, cloneVNode, createVNode } from './vnode'
import type { RootHydrateFunction } from './hydration'
import { devtoolsInitApp, devtoolsUnmountApp } from './devtools'
import { NO, extend, isFunction, isObject } from '@vue/shared'
import { version } from '.'
import { installAppCompatProperties } from './compat/global'
import type { NormalizedPropsOptions } from './componentProps'
import type { ObjectEmitsOptions } from './componentEmits'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import type { DefineComponent } from './apiDefineComponent'

// App 是 Vue 应用实例的核心接口，它包含了应用的配置、插件、组件、指令、生命周期钩子等各种方法。
// 这个接口在 Vue 3 中是用来管理整个应用的行为和状态的
export interface App<HostElement = any> {
  version: string // 应用的版本信息
  config: AppConfig // 应用的配置，包含一些全局配置

  // 用于安装插件。plugin 是插件，options 是插件的配置项。可以传递多个选项
  use<Options extends unknown[]>(
    plugin: Plugin<Options>,
    ...options: Options
  ): this
  use<Options>(plugin: Plugin<Options>, options: Options): this

  // 注册全局混入，用于全局地混合组件选项，一个全局的 mixin 会作用于应用中的每个组件实例。
  mixin(mixin: ComponentOptions): this
  // 获取已注册的组件
  component(name: string): Component | undefined
  // 注册全局组件
  component<T extends Component | DefineComponent>(
    name: string,
    component: T,
  ): this
  // 获取已注册的指令
  directive<
    HostElement = any,
    Value = any,
    Modifiers extends string = string,
    Arg extends string = string,
  >(
    name: string,
  ): Directive<HostElement, Value, Modifiers, Arg> | undefined
  // 注册全局指令
  directive<
    HostElement = any,
    Value = any,
    Modifiers extends string = string,
    Arg extends string = string,
  >(
    name: string,
    directive: Directive<HostElement, Value, Modifiers, Arg>,
  ): this
  // 挂载 Vue 应用到 DOM 元素
  mount(
    rootContainer: HostElement | string,
    /**
     * @internal
     */
    isHydrate?: boolean,
    /**
     * @internal
     */
    namespace?: boolean | ElementNamespace,
    /**
     * @internal
     */
    vnode?: VNode,
  ): ComponentPublicInstance
  // 卸载 Vue 应用
  unmount(): void
  // 注册一个卸载时的回调函数
  onUnmount(cb: () => void): void
  // 提供全局依赖注入
  provide<T, K = InjectionKey<T> | string | number>(
    key: K,
    value: K extends InjectionKey<infer V> ? V : T,
  ): this

  /**
   * Runs a function with the app as active instance. This allows using of `inject()` within the function to get access
   * to variables provided via `app.provide()`.
   * 在 Vue 应用的上下文中运行一个函数，允许在函数中使用 inject() 获取通过 provide() 提供的变量
   * @param fn - function to run with the app as active instance
   */
  runWithContext<T>(fn: () => T): T

  // internal, but we need to expose these for the server-renderer and devtools
  _uid: number // 应用实例的唯一标识符
  _component: ConcreteComponent // 应用的根组件
  _props: Data | null // 应用根组件的属性
  _container: HostElement | null // 应用挂载的 DOM 元素容器
  _context: AppContext // 应用的上下文对象，包含了与应用相关的各类信息
  _instance: ComponentInternalInstance | null // 应用的组件实例

  /**
   * @internal custom element vnode, 自定义元素的虚拟节点
   */
  _ceVNode?: VNode

  /**
   * v2 compat only，这是 Vue 2 兼容相关的方法，仅用于 Vue 2 和 Vue 3 之间的兼容
   */
  filter?(name: string): Function | undefined
  filter?(name: string, filter: Function): this

  /**
   * @internal v3 compat only，这是仅在 Vue 3 兼容模式下的内部方法
   */
  _createRoot?(options: ComponentOptions): ComponentPublicInstance
}

export type OptionMergeFunction = (to: unknown, from: unknown) => any

// AppConfig 用于配置 Vue 应用的各种全局选项
// 用于控制 Vue 应用的行为，处理错误和警告、提供全局属性、配置编译选项等。通过这些选项，开发者可以定制 Vue 应用的行为和体验
export interface AppConfig {
  // @private
  // 用于判断一个标签是否是原生标签（例如 div, span）。这是一个私有接口，通常不需要直接调用
  readonly isNativeTag: (tag: string) => boolean

  // 是否开启性能监控。开启时，Vue 会记录和报告一些性能指标，方便调试
  performance: boolean
  // 用于自定义组件选项合并策略的对象。它允许开发者定义如何合并组件选项，例如 data、methods 等
  optionMergeStrategies: Record<string, OptionMergeFunction>
  // 全局属性，可以在应用的任意地方访问，类似于 Vue.prototype，但是在 Vue 3 中被定义为 globalProperties
  globalProperties: ComponentCustomProperties & Record<string, any>
  // 全局错误处理函数。当发生运行时错误时，会调用此方法。err 是错误对象，instance 是当前组件实例，info 是错误的相关信息
  errorHandler?: (
    err: unknown,
    instance: ComponentPublicInstance | null,
    info: string,
  ) => void
  // 全局警告处理函数。与 errorHandler 类似，但是它是处理警告信息而非错误
  warnHandler?: (
    msg: string,
    instance: ComponentPublicInstance | null,
    trace: string,
  ) => void

  /**
   * Options to pass to `@vue/compiler-dom`.
   * Only supported in runtime compiler build.
   * 传递给 @vue/compiler-dom 编译器的选项，仅在运行时编译构建中有效。通过该选项可以配置模板编译的行为
   */
  compilerOptions: RuntimeCompilerOptions

  /**
   * @deprecated use config.compilerOptions.isCustomElement
   * 用于判断一个标签是否是自定义元素。此选项已被弃用，推荐使用 config.compilerOptions.isCustomElement 替代
   */
  isCustomElement?: (tag: string) => boolean

  /**
   * TODO document for 3.5
   * Enable warnings for computed getters that recursively trigger itself.
   * 启用对递归触发计算属性警告的设置。当一个计算属性递归地触发自身时，会发出警告
   */
  warnRecursiveComputed?: boolean

  /**
   * Whether to throw unhandled errors in production.
   * Default is `false` to avoid crashing on any error (and only logs it)
   * But in some cases, e.g. SSR, throwing might be more desirable.
   * 是否在生产环境中抛出未处理的错误。默认情况下，Vue 会在生产环境中捕获并记录错误，而不是抛出它们。
   * 如果开启此选项，在生产环境中未处理的错误会被抛出。对于 SSR（服务器端渲染）来说，这可能更适合
   */
  throwUnhandledErrorInProduction?: boolean

  /**
   * Prefix for all useId() calls within this app
   * 为应用中的 useId() 调用添加前缀。这个选项通常用于确保生成的 ID 是唯一的，并避免与其他库或应用中的 ID 冲突
   */
  idPrefix?: string
}

// 这是 Vue 3 中的 AppContext 接口定义，它包含了有关 Vue 应用的上下文信息。
// AppContext 主要用于在 Vue 内部存储和管理与应用实例相关的配置信息、组件、指令、混入等
export interface AppContext {
  app: App // for devtools 当前应用实例，用于开发工具（如 Vue DevTools）中获取应用的上下文信息
  config: AppConfig // 应用的配置对象，包含了应用的各种全局选项，如错误处理器、警告处理器、编译选项等
  mixins: ComponentOptions[] // 全局混入的组件选项数组。所有的全局混入（通过 app.mixin 设置的混入）都会存储在这里
  components: Record<string, Component> // 注册的全局组件，键为组件名称，值为组件本身。可以通过 app.component 注册全局组件
  directives: Record<string, Directive> // 注册的全局指令，键为指令名称，值为指令定义。可以通过 app.directive 注册全局指令
  provides: Record<string | symbol, any> // 全局提供的数据，通过 app.provide 提供给应用中的所有组件。这里存储了所有通过 provide 提供的值，允许组件访问

  /**
   * Cache for merged/normalized component options
   * Each app instance has its own cache because app-level global mixins and
   * optionMergeStrategies can affect merge behavior.
   * 缓存组件选项的合并结果。每个应用实例都有自己的缓存，因为应用级别的全局混入和选项合并策略可能会影响组件选项的合并行为
   * @internal
   */
  optionsCache: WeakMap<ComponentOptions, MergedComponentOptions>
  /**
   * Cache for normalized props options
   * 缓存规范化后的 props 选项。它存储了每个组件的 props 配置，规范化后的格式方便内部使用
   * @internal
   */
  propsCache: WeakMap<ConcreteComponent, NormalizedPropsOptions>
  /**
   * Cache for normalized emits options
   * 缓存规范化后的 emits 选项。存储了组件的 emits 配置，用于处理组件触发的事件
   * @internal
   */
  emitsCache: WeakMap<ConcreteComponent, ObjectEmitsOptions | null>
  /**
   * HMR only
   * 仅在热模块替换（HMR）中使用。此方法用于重新加载应用
   * @internal
   */
  reload?: () => void
  /**
   * v2 compat only
   * 这是 Vue 2.x 兼容的属性，允许在应用中注册全局过滤器。在 Vue 3 中，过滤器已被移除，因此这个属性仅在兼容模式下使用
   * @internal
   */
  filters?: Record<string, Function>
}

type PluginInstallFunction<Options = any[]> = Options extends unknown[]
  ? (app: App, ...options: Options) => any
  : (app: App, options: Options) => any

export type ObjectPlugin<Options = any[]> = {
  install: PluginInstallFunction<Options>
}
export type FunctionPlugin<Options = any[]> = PluginInstallFunction<Options> &
  Partial<ObjectPlugin<Options>>

export type Plugin<Options = any[]> =
  | FunctionPlugin<Options>
  | ObjectPlugin<Options>

// createAppContext 函数是 Vue 3 中用于创建 AppContext 实例的工厂函数。
// 它返回一个初始化后的 AppContext 对象，包含了各种与应用相关的上下文信息
export function createAppContext(): AppContext {
  return {
    app: null as any, // 初始为 null，稍后会指向实际的应用实例对象
    config: {
      isNativeTag: NO, // 判断标签是否为原生标签。NO 是一个常量，表示不对标签进行检查
      performance: false, // 默认不开启性能监控
      globalProperties: {}, // 用于存储全局属性对象（例如 $t、$route 等）
      optionMergeStrategies: {}, // 用于存储合并策略，可以自定义合并 Vue 配置时的行为
      errorHandler: undefined, // 错误处理器，默认未定义
      warnHandler: undefined, // 警告处理器，默认未定义
      compilerOptions: {}, // 编译器选项，默认为空对象
    },
    mixins: [], // 存储全局混入的组件选项
    components: {}, // 存储已注册的全局组件
    directives: {}, // 存储已注册的全局指令
    provides: Object.create(null), // 使用 Object.create(null) 来创建一个纯净对象用于依赖注入。这样可以避免污染原型链
    optionsCache: new WeakMap(), // 使用 WeakMap 缓存组件的合并选项，方便复用
    propsCache: new WeakMap(), // 使用 WeakMap 缓存组件的 props 配置，确保在后续渲染过程中不会重复计算
    emitsCache: new WeakMap(), // 使用 WeakMap 缓存组件的 emits 配置，用于优化事件的处理
  }
}

export type CreateAppFunction<HostElement> = (
  rootComponent: Component,
  rootProps?: Data | null,
) => App<HostElement>

let uid = 0 // 应用id

// createAppAPI 函数是 Vue 3 中创建和管理应用实例的关键部分。
// 它定义了许多方法和属性，用于配置和挂载应用，包括 use、mixin、component、directive、mount 和 unmount 等方法
export function createAppAPI<HostElement>(
  render: RootRenderFunction<HostElement>,
  hydrate?: RootHydrateFunction,
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent, rootProps = null) {
    // 检查 rootComponent 是否为有效的函数或对象
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent)
    }

    // 如果提供了 rootProps，则进行验证
    if (rootProps != null && !isObject(rootProps)) {
      __DEV__ && warn(`root props passed to app.mount() must be an object.`)
      rootProps = null
    }

    // 创建应用上下文
    const context = createAppContext()
    const installedPlugins = new WeakSet() // 跟踪已安装的插件
    const pluginCleanupFns: Array<() => any> = [] // 存储插件的清理函数

    let isMounted = false // 记录应用是否已挂载

    // 定义应用对象
    const app: App = (context.app = {
      _uid: uid++, // 每个应用实例的唯一 ID
      _component: rootComponent as ConcreteComponent, // 根组件
      _props: rootProps, // 传递给根组件的属性
      _container: null, // 应用挂载的容器
      _context: context, // 应用上下文
      _instance: null, // 应用实例，初始为 null

      version, // Vue 版本

      // 获取和设置应用的配置项
      get config() {
        return context.config
      },

      set config(v) {
        if (__DEV__) {
          warn(
            // `app.config` 不能被替换。请单独修改每个选项。
            `app.config cannot be replaced. Modify individual options instead.`,
          )
        }
      },

      // 使用插件，Vue 提供了一种标准化的方式来注册插件，使插件能够被应用到特定的 Vue 应用实例中
      use(plugin: Plugin, ...options: any[]) {
        // installedPlugins 是一个 WeakSet，用于记录已经注册的插件。use 方法首先检查插件是否已经添加过。
        // 如果已添加过，在开发环境下会给出一个警告，并且不会重复注册该插件
        if (installedPlugins.has(plugin)) {
          __DEV__ && warn(`Plugin has already been applied to target app.`)
        } else if (plugin && isFunction(plugin.install)) {
          // 如果插件对象存在 install 方法，Vue 会调用该方法并将 app 实例和额外的 options 参数传入。
          // install 方法通常是插件的核心初始化逻辑，它可以用来在 app 实例上注册全局组件、指令、挂载属性或提供方法等
          installedPlugins.add(plugin)
          plugin.install(app, ...options)
        } else if (isFunction(plugin)) {
          // 如果插件本身是一个函数（而不是对象），Vue 会直接调用该函数，并传入 app 实例和额外的 options 参数。
          // 这样的函数插件通常在插件体内部处理注册逻辑。
          installedPlugins.add(plugin)
          plugin(app, ...options)
        } else if (__DEV__) {
          // 如果插件既不是包含 install 方法的对象，也不是一个函数，Vue 会在开发环境下抛出警告，指出插件必须是一个函数或包含 install 方法的对象
          warn(
            `A plugin must either be a function or an object with an "install" ` +
              `function.`,
          )
        }
        return app
      },

      // 注册全局混入，作用是为 Vue 应用实例添加全局的 mixin 配置。
      // 通过 mixin，可以在应用的所有组件中共享一些公共的选项或逻辑。这个方法主要对支持 Options API 的 Vue 版本有效。
      mixin(mixin: ComponentOptions) {
        // __FEATURE_OPTIONS_API__ 是编译时的条件判断，用于确认当前的 Vue 构建是否支持 Options API。
        // 因为 mixin 属于 Options API 的一部分，所以在不支持的情况下跳过整个逻辑
        if (__FEATURE_OPTIONS_API__) {
          // context.mixins 是一个数组，用于存储已添加的 mixin。
          // 如果当前 mixin 不在 context.mixins 中，则将其添加进去。
          // 如果已经存在，并且处于开发环境中，则会触发一个警告，提示该 mixin 已经应用。
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin)
          } else if (__DEV__) {
            warn(
              'Mixin has already been applied to target app' +
                (mixin.name ? `: ${mixin.name}` : ''),
            )
          }
        } else if (__DEV__) {
          // 在不支持 Options API 的 Vue 构建中（比如仅使用 Composition API 的构建），在开发环境中会发出警告，说明 mixin 功能不可用。
          warn('Mixins are only available in builds supporting Options API')
        }
        return app
      },

      // 注册全局组件，使其在该应用的所有组件中都可以直接使用。该方法可以用于两种情况：注册组件和获取已注册的组件
      component(name: string, component?: Component): any {
        // 在开发环境中，调用 validateComponentName 检查组件的名称是否合法。Vue 通常会限制组件名称的命名规则，如不能使用 HTML 标签名等
        if (__DEV__) {
          validateComponentName(name, context.config)
        }
        if (!component) {
          // 如果 component 参数未传入，则表示是获取组件。此时直接返回
          return context.components[name]
        }
        if (__DEV__ && context.components[name]) {
          // 在开发模式下，如果该组件名称已存在于 context.components 中，则会发出警告，避免组件重复注册
          warn(`Component "${name}" has already been registered in target app.`)
        }
        // 将新组件 component 添加到 context.components 中，使用 name 作为组件的键
        context.components[name] = component
        return app
      },

      // 注册全局指令
      directive(name: string, directive?: Directive) {
        // 在开发环境中，通过 validateDirectiveName 校验指令名称是否合法。Vue 对指令的名称有特定规则，避免与已有指令冲突
        if (__DEV__) {
          validateDirectiveName(name)
        }

        // 当 directive 参数未传入时，表示当前是要获取指令
        if (!directive) {
          return context.directives[name] as any
        }
        // 在开发模式下，如果 context.directives 中已经存在相同名称的指令，会发出警告，防止重复注册
        if (__DEV__ && context.directives[name]) {
          warn(`Directive "${name}" has already been registered in target app.`)
        }
        // 将新的指令 directive 存入 context.directives
        context.directives[name] = directive
        return app
      },

      // 挂载应用，用于将 Vue 应用挂载到一个实际的 DOM 容器中，它的功能相当于将 Vue 应用的根组件渲染并插入到指定的 rootContainer 容器里
      mount(
        rootContainer: HostElement,
        isHydrate?: boolean,
        namespace?: boolean | ElementNamespace,
      ): any {
        // 通过 isMounted 标识，确保一个 Vue 应用只能挂载一次。如果已经挂载，Vue 将不会重复挂载应用
        if (!isMounted) {
          // #5571，检查是否已挂载应用
          if (__DEV__ && (rootContainer as any).__vue_app__) {
            warn(
              `There is already an app instance mounted on the host container.\n` +
                ` If you want to mount another app on the same host container,` +
                ` you need to unmount the previous app by calling \`app.unmount()\` first.`,
            )
          }
          // 创建根 VNode
          const vnode = app._ceVNode || createVNode(rootComponent, rootProps)
          // store app context on the root VNode.
          // this will be set on the root instance on initial mount.
          vnode.appContext = context // 将应用上下文关联到 VNode

          // 处理 SVG 命名空间
          if (namespace === true) {
            namespace = 'svg'
          } else if (namespace === false) {
            namespace = undefined
          }

          // HMR root reload 开发环境下处理 HMR（热模块替换）
          if (__DEV__) {
            context.reload = () => {
              // casting to ElementNamespace because TS doesn't guarantee type narrowing
              // over function boundaries
              render(
                cloneVNode(vnode),
                rootContainer,
                namespace as ElementNamespace,
              )
            }
          }

          // 如果需要，进行水合或渲染 VNode
          if (isHydrate && hydrate) {
            hydrate(vnode as VNode<Node, Element>, rootContainer as any)
          } else {
            render(vnode, rootContainer, namespace) // 渲染 VNode
          }

          // 标记应用已挂载
          isMounted = true
          app._container = rootContainer
          // for devtools and telemetry
          ;(rootContainer as any).__vue_app__ = app // 将应用与容器关联

          // 开发工具和遥测
          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            app._instance = vnode.component
            devtoolsInitApp(app, version)
          }

          return getComponentPublicInstance(vnode.component!)
        } else if (__DEV__) {
          warn(
            `App has already been mounted.\n` +
              `If you want to remount the same app, move your app creation logic ` +
              `into a factory function and create fresh app instances for each ` +
              `mount - e.g. \`const createMyApp = () => createApp(App)\``,
          )
        }
      },

      // 注册卸载时的清理函数，它允许用户注册卸载时需要执行的回调函数，以便在应用从 DOM 中移除时进行资源清理或收尾处理
      onUnmount(cleanupFn: () => void) {
        if (__DEV__ && typeof cleanupFn !== 'function') {
          warn(
            `Expected function as first argument to app.onUnmount(), ` +
              `but got ${typeof cleanupFn}`,
          )
        }
        // 如果传入的是一个函数，则将其添加到 pluginCleanupFns 数组中。这个数组会收集所有在应用卸载时需要执行的清理函数
        pluginCleanupFns.push(cleanupFn)
      },

      // 卸载应用
      unmount() {
        // 首先检查应用是否已经挂载。如果应用未挂载（isMounted 为 false），则直接跳到 else if 分支并在开发环境中发出警告
        if (isMounted) {
          // callWithAsyncErrorHandling 函数用于调用清理函数，同时处理可能的异步错误。
          // pluginCleanupFns 数组存储了所有通过 onUnmount 注册的清理函数，确保在应用卸载时这些函数被执行
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app._instance,
            ErrorCodes.APP_UNMOUNT_CLEANUP,
          )
          // render 函数会将传入的第一个参数（null）渲染到 app._container，这会清空该容器中的内容，实际效果就是将 Vue 应用从页面上移除
          render(null, app._container)
          // 在开发环境或支持生产环境调试工具的构建中，app._instance 被设为 null，并调用 devtoolsUnmountApp 来通知开发工具，应用已卸载。
          // 这有助于在 Vue DevTools 中正确地移除该实例，避免调试信息残留
          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            app._instance = null
            devtoolsUnmountApp(app)
          }
          // 从 DOM 容器中删除 __vue_app__ 属性。这一属性是在 mount 方法中设置的，表示该容器与某个 Vue 应用实例相关联。
          // 删除这个属性可以解耦容器与应用的关系，便于后续对容器的复用
          delete app._container.__vue_app__
        } else if (__DEV__) {
          warn(`Cannot unmount an app that is not mounted.`)
        }
      },

      // 提供全局值给应用上下文
      provide(key, value) {
        if (__DEV__ && (key as string | symbol) in context.provides) {
          warn(
            `App already provides property with key "${String(key)}". ` +
              `It will be overwritten with the new value.`,
          )
        }

        // 将 key 和 value 添加到 context.provides 中。
        // context.provides 是一个对象，专门用来存储所有的全局依赖项。这样，任何通过 inject 方法调用相同 key 的子组件都可以访问 value
        context.provides[key as string | symbol] = value

        return app
      },

      // 在应用上下文中运行函数
      runWithContext(fn) {
        const lastApp = currentApp
        currentApp = app
        try {
          return fn()
        } finally {
          currentApp = lastApp
        }
      },
    })

    // 安装兼容性属性（如果需要）
    if (__COMPAT__) {
      installAppCompatProperties(app, context, render)
    }

    return app
  }
}

/**
 * @internal Used to identify the current app when using `inject()` within
 * `app.runWithContext()`.
 * currentApp 在这里充当一个全局标记，它标识了当前操作的是哪个 Vue 应用实例
 */
export let currentApp: App<unknown> | null = null
