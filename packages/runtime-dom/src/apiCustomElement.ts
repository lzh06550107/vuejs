import {
  type App,
  type Component,
  type ComponentCustomElementInterface,
  type ComponentInjectOptions,
  type ComponentInternalInstance,
  type ComponentObjectPropsOptions,
  type ComponentOptions,
  type ComponentOptionsBase,
  type ComponentOptionsMixin,
  type ComponentProvideOptions,
  type ComponentPublicInstance,
  type ComputedOptions,
  type ConcreteComponent,
  type CreateAppFunction,
  type CreateComponentPublicInstanceWithMixins,
  type DefineComponent,
  type Directive,
  type EmitsOptions,
  type EmitsToProps,
  type ExtractPropTypes,
  type MethodOptions,
  type RenderFunction,
  type SetupContext,
  type SlotsType,
  type VNode,
  type VNodeProps,
  createVNode,
  defineComponent,
  getCurrentInstance,
  nextTick,
  unref,
  warn,
} from '@vue/runtime-core'

import {
  camelize,
  extend,
  hasOwn,
  hyphenate,
  isArray,
  isPlainObject,
  toNumber,
} from '@vue/shared'

// 从当前目录导入的模块
// createApp：用于创建客户端应用实例的核心函数。
// createSSRApp：用于创建支持服务端渲染的应用实例，主要在 SSR 环境中使用。
// render：通常用于手动渲染或更新特定的 DOM 节点。在 Vue 3 中，这个函数可以配合 createApp 和 createSSRApp 使用，允许在不同的 DOM 上执行渲染操作
import { createApp, createSSRApp, render } from '.'

// marker for attr removal
// REMOVAL 常被用于标识或跟踪 DOM 属性，特别是在模板编译或运行时中，通过将其与需要删除的属性关联，指示该属性需要从 DOM 中移除
const REMOVAL = {}

// 泛型类型，定义了 Vue 自定义元素的构造函数类型
// 泛型参数 P：代表自定义元素的属性类型，默认是空对象 {}
export type VueElementConstructor<P = {}> = {
  // 构造函数签名，允许在创建时传入一个初始属性对象 initialProps
  // * initialProps 的类型是 Record<string, any>，即一个键值对的对象，每个键都是字符串，值可以是任意类型
  // 返回类型：VueElement & P，表示返回的实例同时具备 VueElement 和 P 的属性和方法。
  // * VueElement 是 Vue 中自定义元素的基础类型，可能包含生命周期方法和渲染逻辑。
  // * P 用于扩展自定义元素的属性类型，使之更具灵活性，适应不同的属性需求。
  new (initialProps?: Record<string, any>): VueElement & P
}

// 定义了用于配置 Vue 自定义元素的选项
export interface CustomElementOptions {
  styles?: string[] // 定义自定义元素的样式数组
  shadowRoot?: boolean // 是否使用 Shadow DOM
  nonce?: string // 安全属性，用于内联样式和脚本的 nonce 值
  configureApp?: (app: App) => void // 配置函数，用于自定义 app 的初始化逻辑
}

// defineCustomElement provides the same type inference as defineComponent
// so most of the following overloads should be kept in sync w/ defineComponent.
// defineCustomElement 函数用于定义一个 Vue 自定义元素（Custom Element），可以将 Vue 组件作为原生 HTML 元素使用，并提供与 defineComponent 相似的类型推导

// defineCustomElement 函数有两个重载（overload），主要区别在于 props 的定义方式。每个重载函数都接受一个 setup 函数和一个 options 对象。
// 不同的 props 定义方式适应了不同类型的属性需求，从而提升了灵活性
// overload 1: direct setup function
export function defineCustomElement<Props, RawBindings = object>(
  // setup 是组件的核心逻辑定义，接受两个参数：
  // * props：定义了传入自定义元素的属性。
  // * ctx：提供上下文对象，包含事件、插槽等信息。
  setup: (props: Props, ctx: SetupContext) => RawBindings | RenderFunction,
  // 组件配置对象
  // 其中包含以下几个属性：
  // * name：组件的名称。
  // * inheritAttrs：是否继承原生 HTML 属性。
  // * emits：定义自定义事件的列表。
  options?: Pick<ComponentOptions, 'name' | 'inheritAttrs' | 'emits'> &
    CustomElementOptions & {
      // props：这是一个可选项（? 表示可选），用于声明组件可以接收哪些属性。它以数组的形式定义属性名称列表
      // keyof Props：表示 Props 类型的所有键（即属性名称）。
      // 通过 keyof 操作符，可以获得 Props 类型的键构成的联合类型（例如，如果 Props 类型包含 title 和 subtitle，则 keyof Props 就是 'title' | 'subtitle'）
      // (keyof Props)[]：数组类型，包含 Props 类型的键的列表。这意味着 props 中列出的每个字符串必须是 Props 类型的一个键
      props?: (keyof Props)[]
    },
): VueElementConstructor<Props> // 用于实例化一个 Vue 自定义元素，带有类型 Props 的属性

export function defineCustomElement<Props, RawBindings = object>(
  setup: (props: Props, ctx: SetupContext) => RawBindings | RenderFunction,
  options?: Pick<ComponentOptions, 'name' | 'inheritAttrs' | 'emits'> &
    CustomElementOptions & {
      // 这是 Vue 中用于描述组件属性的类型，接受泛型 Props，其结构类似于一个对象，其中每个键都是组件的属性名，每个键的值是一个对象，用于定义该属性的类型、默认值、是否为必需等
      // 其结构类似于一个对象，其中每个键都是组件的属性名，每个键的值是一个对象，用于定义该属性的类型(type)、默认值(default)、是否为必需(required)等
      props?: ComponentObjectPropsOptions<Props>
    },
): VueElementConstructor<Props>

// overload 2: defineCustomElement with options object, infer props from options
// 这个 defineCustomElement 函数的重载版本允许开发者通过一个包含组件详细配置的 options 对象来定义自定义元素。
// 它提供了多种泛型参数，使开发者可以精确地控制组件的属性、事件、数据、计算属性、方法、插槽、指令等功能的类型推断。
// 这种配置方式对复杂组件尤其适用，能够实现更高的类型安全和灵活性。
export function defineCustomElement<
  // props 用于定义组件的 props 选项
  RuntimePropsOptions extends
    ComponentObjectPropsOptions = ComponentObjectPropsOptions,
  PropsKeys extends string = string,
  // emits
  RuntimeEmitsOptions extends EmitsOptions = {},
  EmitsKeys extends string = string,
  // other options
  Data = {},
  SetupBindings = {},
  Computed extends ComputedOptions = {},
  Methods extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  InjectOptions extends ComponentInjectOptions = {},
  InjectKeys extends string = string,
  Slots extends SlotsType = {},
  LocalComponents extends Record<string, Component> = {},
  Directives extends Record<string, Directive> = {},
  Exposed extends string = string,
  Provide extends ComponentProvideOptions = ComponentProvideOptions,
  // resolved types
  InferredProps = string extends PropsKeys
    ? ComponentObjectPropsOptions extends RuntimePropsOptions
      ? {}
      : ExtractPropTypes<RuntimePropsOptions>
    : { [key in PropsKeys]?: any },
  ResolvedProps = InferredProps & EmitsToProps<RuntimeEmitsOptions>,
>(
  options: CustomElementOptions & {
    props?: (RuntimePropsOptions & ThisType<void>) | PropsKeys[]
  } & ComponentOptionsBase<
      ResolvedProps,
      SetupBindings,
      Data,
      Computed,
      Methods,
      Mixin,
      Extends,
      RuntimeEmitsOptions,
      EmitsKeys,
      {}, // Defaults
      InjectOptions,
      InjectKeys,
      Slots,
      LocalComponents,
      Directives,
      Exposed,
      Provide
    > &
    ThisType<
      CreateComponentPublicInstanceWithMixins<
        Readonly<ResolvedProps>,
        SetupBindings,
        Data,
        Computed,
        Methods,
        Mixin,
        Extends,
        RuntimeEmitsOptions,
        EmitsKeys,
        {},
        false,
        InjectOptions,
        Slots,
        LocalComponents,
        Directives,
        Exposed
      >
    >,
  extraOptions?: CustomElementOptions,
): VueElementConstructor<ResolvedProps>

// overload 3: defining a custom element from the returned value of
// `defineComponent`
// 在这个重载版本中，defineCustomElement 函数允许从 defineComponent 函数的返回值创建自定义元素。
// 这种方法可以直接使用 defineComponent 定义的组件，将其转换为自定义元素。
export function defineCustomElement<
  // this should be `ComponentPublicInstanceConstructor` but that type is not exported
  T extends { new (...args: any[]): ComponentPublicInstance<any> },
>(
  options: T,
  extraOptions?: CustomElementOptions,
): VueElementConstructor<
  T extends DefineComponent<infer P, any, any, any> ? P : unknown
>

/*! #__NO_SIDE_EFFECTS__ */
// 用于将一个 Vue 组件定义为自定义元素。它将 Vue 组件封装成符合 Web Components 标准的自定义元素，允许开发者在非 Vue 应用环境中使用这个组件
// 将 Vue 组件定义（options 和 extraOptions）转换为一个自定义元素类 VueCustomElement，
// 使得这个组件可以注册为原生的 Web Components，自定义标签可以在任何支持 Web Components 的环境中直接使用
export function defineCustomElement(
  options: any,
  extraOptions?: ComponentOptions,
  /**
   * @internal
   */
  _createApp?: CreateAppFunction<Element>,
): VueElementConstructor {
  // 使用 defineComponent 方法将 options 和 extraOptions 转换成一个 Vue 组件定义对象 Comp
  const Comp = defineComponent(options, extraOptions) as any
  // 如果 Comp 是一个简单对象（未实例化为 Vue 组件类），则通过 extend 方法扩展 Comp，确保组件选项包含在内
  if (isPlainObject(Comp)) extend(Comp, extraOptions)
  // 定义一个类 VueCustomElement，继承自 VueElement，表示新的自定义元素。
  // VueCustomElement 类内部包含一个静态属性 def，指向 Comp（组件定义），用来标识组件。
  // 构造函数通过 super 调用 VueElement 的构造函数，将 Comp、initialProps 和 _createApp 传递给 VueElement。
  class VueCustomElement extends VueElement {
    static def = Comp
    constructor(initialProps?: Record<string, any>) {
      super(Comp, initialProps, _createApp)
    }
  }

  return VueCustomElement
}

/*! #__NO_SIDE_EFFECTS__ */
// 用来定义支持 SSR 的自定义元素
export const defineSSRCustomElement = ((
  options: any,
  extraOptions?: ComponentOptions,
) => {
  // @ts-expect-error
  // 该函数调用 defineCustomElement，但传入的第三个参数为 createSSRApp。这意味着生成的自定义元素使用 createSSRApp 创建的 Vue 实例，以便在 SSR 环境中渲染。
  return defineCustomElement(options, extraOptions, createSSRApp)
}) as typeof defineCustomElement

// 这段代码的关键在于兼容性：在不支持 HTMLElement 的环境（如某些服务器环境）中，它会定义一个空的基础类 class {}，避免运行时错误
const BaseClass = (
  typeof HTMLElement !== 'undefined' ? HTMLElement : class {}
) as typeof HTMLElement

type InnerComponentDef = ConcreteComponent & CustomElementOptions

// 这个类是用来创建 Vue 自定义元素（Vue Custom Elements）的。它支持 Vue 组件的生命周期、属性、插槽等功能，并可以与 Web Components API 配合使用
// VueElement 类为 Vue 组件提供了一个容器，使得它们能够作为自定义元素（Web Component）使用。
// 这个类处理了组件的生命周期、属性管理、插槽渲染、样式应用等功能，确保 Vue 组件能够在自定义元素的上下文中正确运行
export class VueElement
  extends BaseClass
  implements ComponentCustomElementInterface
{
  /**
   * 标记当前实例为 Vue 自定义元素
   */
  _isVueCE = true
  /**
   * @internal 保存 Vue 组件实例
   */
  _instance: ComponentInternalInstance | null = null
  /**
   * @internal Vue 应用实例，用来挂载 Vue 组件
   */
  _app: App | null = null
  /**
   * @internal 根元素（可能是 Shadow DOM 或普通 DOM）
   */
  _root: Element | ShadowRoot
  /**
   * @internal 用于样式的 nonce 值
   */
  _nonce: string | undefined = this._def.nonce

  /**
   * @internal 表示插槽传送目标
   */
  _teleportTarget?: HTMLElement

  // 这些是内部标志和状态，帮助管理组件的生命周期、属性等
  private _connected = false
  private _resolved = false
  private _numberProps: Record<string, true> | null = null
  private _styleChildren = new WeakSet()
  private _pendingResolve: Promise<void> | undefined
  private _parent: VueElement | undefined
  /**
   * dev only
   */
  private _styles?: HTMLStyleElement[]
  /**
   * dev only
   */
  private _childStyles?: Map<string, HTMLStyleElement[]>
  private _ob?: MutationObserver | null = null
  private _slots?: Record<string, Node[]>

  constructor(
    /**
     * Component def - note this may be an AsyncWrapper, and this._def will
     * be overwritten by the inner component when resolved.
     */
    private _def: InnerComponentDef,
    private _props: Record<string, any> = {},
    private _createApp: CreateAppFunction<Element> = createApp,
  ) {
    super()
    if (this.shadowRoot && _createApp !== createApp) {
      this._root = this.shadowRoot
    } else {
      if (__DEV__ && this.shadowRoot) {
        warn(
          `Custom element has pre-rendered declarative shadow root but is not ` +
            `defined as hydratable. Use \`defineSSRCustomElement\`.`,
        )
      }
      if (_def.shadowRoot !== false) {
        this.attachShadow({ mode: 'open' })
        this._root = this.shadowRoot!
      } else {
        this._root = this
      }
    }

    if (!(this._def as ComponentOptions).__asyncLoader) {
      // for sync component defs we can immediately resolve props
      this._resolveProps(this._def)
    }
  }

  // 当自定义元素被插入到 DOM 时调用。它会解析插槽、设置父元素等
  connectedCallback(): void {
    // avoid resolving component if it's not connected
    if (!this.isConnected) return

    if (!this.shadowRoot) {
      this._parseSlots()
    }
    this._connected = true

    // locate nearest Vue custom element parent for provide/inject
    let parent: Node | null = this
    while (
      (parent = parent && (parent.parentNode || (parent as ShadowRoot).host))
    ) {
      if (parent instanceof VueElement) {
        this._parent = parent
        break
      }
    }

    if (!this._instance) {
      if (this._resolved) {
        this._setParent()
        this._update()
      } else {
        if (parent && parent._pendingResolve) {
          this._pendingResolve = parent._pendingResolve.then(() => {
            this._pendingResolve = undefined
            this._resolveDef()
          })
        } else {
          this._resolveDef()
        }
      }
    }
  }

  private _setParent(parent = this._parent) {
    if (parent) {
      this._instance!.parent = parent._instance
      this._instance!.provides = parent._instance!.provides
    }
  }

  // 当自定义元素从 DOM 中移除时调用。它负责清理实例和应用
  disconnectedCallback(): void {
    this._connected = false
    nextTick(() => {
      if (!this._connected) {
        if (this._ob) {
          this._ob.disconnect()
          this._ob = null
        }
        // unmount
        this._app && this._app.unmount()
        if (this._instance) this._instance.ce = undefined
        this._app = this._instance = null
      }
    })
  }

  /**
   * resolve inner component definition (handle possible async component)
   * 解决组件的定义，支持异步组件加载
   */
  private _resolveDef() {
    if (this._pendingResolve) {
      return
    }

    // set initial attrs
    for (let i = 0; i < this.attributes.length; i++) {
      this._setAttr(this.attributes[i].name)
    }

    // watch future attr changes
    this._ob = new MutationObserver(mutations => {
      for (const m of mutations) {
        this._setAttr(m.attributeName!)
      }
    })

    this._ob.observe(this, { attributes: true })

    const resolve = (def: InnerComponentDef, isAsync = false) => {
      this._resolved = true
      this._pendingResolve = undefined

      const { props, styles } = def

      // cast Number-type props set before resolve
      let numberProps
      if (props && !isArray(props)) {
        for (const key in props) {
          const opt = props[key]
          if (opt === Number || (opt && opt.type === Number)) {
            if (key in this._props) {
              this._props[key] = toNumber(this._props[key])
            }
            ;(numberProps || (numberProps = Object.create(null)))[
              camelize(key)
            ] = true
          }
        }
      }
      this._numberProps = numberProps

      if (isAsync) {
        // defining getter/setters on prototype
        // for sync defs, this already happened in the constructor
        this._resolveProps(def)
      }

      // apply CSS
      if (this.shadowRoot) {
        this._applyStyles(styles)
      } else if (__DEV__ && styles) {
        warn(
          'Custom element style injection is not supported when using ' +
            'shadowRoot: false',
        )
      }

      // initial mount
      this._mount(def)
    }

    const asyncDef = (this._def as ComponentOptions).__asyncLoader
    if (asyncDef) {
      this._pendingResolve = asyncDef().then(def =>
        resolve((this._def = def), true),
      )
    } else {
      resolve(this._def)
    }
  }

  // 将 Vue 应用挂载到自定义元素的根节点
  private _mount(def: InnerComponentDef) {
    if ((__DEV__ || __FEATURE_PROD_DEVTOOLS__) && !def.name) {
      // @ts-expect-error
      def.name = 'VueElement'
    }
    this._app = this._createApp(def)
    if (def.configureApp) {
      def.configureApp(this._app)
    }
    this._app._ceVNode = this._createVNode()
    this._app.mount(this._root)

    // apply expose after mount
    const exposed = this._instance && this._instance.exposed
    if (!exposed) return
    for (const key in exposed) {
      if (!hasOwn(this, key)) {
        // exposed properties are readonly
        Object.defineProperty(this, key, {
          // unwrap ref to be consistent with public instance behavior
          get: () => unref(exposed[key]),
        })
      } else if (__DEV__) {
        warn(`Exposed property "${key}" already exists on custom element.`)
      }
    }
  }

  private _resolveProps(def: InnerComponentDef) {
    const { props } = def
    const declaredPropKeys = isArray(props) ? props : Object.keys(props || {})

    // check if there are props set pre-upgrade or connect
    for (const key of Object.keys(this)) {
      if (key[0] !== '_' && declaredPropKeys.includes(key)) {
        this._setProp(key, this[key as keyof this])
      }
    }

    // defining getter/setters on prototype
    for (const key of declaredPropKeys.map(camelize)) {
      Object.defineProperty(this, key, {
        get() {
          return this._getProp(key)
        },
        set(val) {
          this._setProp(key, val, true, true)
        },
      })
    }
  }

  protected _setAttr(key: string): void {
    if (key.startsWith('data-v-')) return
    const has = this.hasAttribute(key)
    let value = has ? this.getAttribute(key) : REMOVAL
    const camelKey = camelize(key)
    if (has && this._numberProps && this._numberProps[camelKey]) {
      value = toNumber(value)
    }
    this._setProp(camelKey, value, false, true)
  }

  /**
   * @internal
   */
  protected _getProp(key: string): any {
    return this._props[key]
  }

  /**
   * @internal
   */
  _setProp(
    key: string,
    val: any,
    shouldReflect = true,
    shouldUpdate = false,
  ): void {
    if (val !== this._props[key]) {
      if (val === REMOVAL) {
        delete this._props[key]
      } else {
        this._props[key] = val
        // support set key on ceVNode
        if (key === 'key' && this._app) {
          this._app._ceVNode!.key = val
        }
      }
      if (shouldUpdate && this._instance) {
        this._update()
      }
      // reflect
      if (shouldReflect) {
        if (val === true) {
          this.setAttribute(hyphenate(key), '')
        } else if (typeof val === 'string' || typeof val === 'number') {
          this.setAttribute(hyphenate(key), val + '')
        } else if (!val) {
          this.removeAttribute(hyphenate(key))
        }
      }
    }
  }

  private _update() {
    render(this._createVNode(), this._root)
  }

  private _createVNode(): VNode<any, any> {
    const baseProps: VNodeProps = {}
    if (!this.shadowRoot) {
      baseProps.onVnodeMounted = baseProps.onVnodeUpdated =
        this._renderSlots.bind(this)
    }
    const vnode = createVNode(this._def, extend(baseProps, this._props))
    if (!this._instance) {
      vnode.ce = instance => {
        this._instance = instance
        instance.ce = this
        instance.isCE = true // for vue-i18n backwards compat
        // HMR
        if (__DEV__) {
          instance.ceReload = newStyles => {
            // always reset styles
            if (this._styles) {
              this._styles.forEach(s => this._root.removeChild(s))
              this._styles.length = 0
            }
            this._applyStyles(newStyles)
            this._instance = null
            this._update()
          }
        }

        const dispatch = (event: string, args: any[]) => {
          this.dispatchEvent(
            new CustomEvent(
              event,
              isPlainObject(args[0])
                ? extend({ detail: args }, args[0])
                : { detail: args },
            ),
          )
        }

        // intercept emit
        instance.emit = (event: string, ...args: any[]) => {
          // dispatch both the raw and hyphenated versions of an event
          // to match Vue behavior
          dispatch(event, args)
          if (hyphenate(event) !== event) {
            dispatch(hyphenate(event), args)
          }
        }

        this._setParent()
      }
    }
    return vnode
  }

  private _applyStyles(
    styles: string[] | undefined,
    owner?: ConcreteComponent,
  ) {
    if (!styles) return
    if (owner) {
      if (owner === this._def || this._styleChildren.has(owner)) {
        return
      }
      this._styleChildren.add(owner)
    }
    const nonce = this._nonce
    for (let i = styles.length - 1; i >= 0; i--) {
      const s = document.createElement('style')
      if (nonce) s.setAttribute('nonce', nonce)
      s.textContent = styles[i]
      this.shadowRoot!.prepend(s)
      // record for HMR
      if (__DEV__) {
        if (owner) {
          if (owner.__hmrId) {
            if (!this._childStyles) this._childStyles = new Map()
            let entry = this._childStyles.get(owner.__hmrId)
            if (!entry) {
              this._childStyles.set(owner.__hmrId, (entry = []))
            }
            entry.push(s)
          }
        } else {
          ;(this._styles || (this._styles = [])).push(s)
        }
      }
    }
  }

  /**
   * Only called when shadowRoot is false
   */
  private _parseSlots() {
    const slots: VueElement['_slots'] = (this._slots = {})
    let n
    while ((n = this.firstChild)) {
      const slotName =
        (n.nodeType === 1 && (n as Element).getAttribute('slot')) || 'default'
      ;(slots[slotName] || (slots[slotName] = [])).push(n)
      this.removeChild(n)
    }
  }

  /**
   * Only called when shadowRoot is false
   */
  private _renderSlots() {
    const outlets = (this._teleportTarget || this).querySelectorAll('slot')
    const scopeId = this._instance!.type.__scopeId
    for (let i = 0; i < outlets.length; i++) {
      const o = outlets[i] as HTMLSlotElement
      const slotName = o.getAttribute('name') || 'default'
      const content = this._slots![slotName]
      const parent = o.parentNode!
      if (content) {
        for (const n of content) {
          // for :slotted css
          if (scopeId && n.nodeType === 1) {
            const id = scopeId + '-s'
            const walker = document.createTreeWalker(n, 1)
            ;(n as Element).setAttribute(id, '')
            let child
            while ((child = walker.nextNode())) {
              ;(child as Element).setAttribute(id, '')
            }
          }
          parent.insertBefore(n, o)
        }
      } else {
        while (o.firstChild) parent.insertBefore(o.firstChild, o)
      }
      parent.removeChild(o)
    }
  }

  /**
   * @internal
   */
  _injectChildStyle(comp: ConcreteComponent & CustomElementOptions): void {
    this._applyStyles(comp.styles, comp)
  }

  /**
   * @internal
   */
  _removeChildStyle(comp: ConcreteComponent): void {
    if (__DEV__) {
      this._styleChildren.delete(comp)
      if (this._childStyles && comp.__hmrId) {
        // clear old styles
        const oldStyles = this._childStyles.get(comp.__hmrId)
        if (oldStyles) {
          oldStyles.forEach(s => this._root.removeChild(s))
          oldStyles.length = 0
        }
      }
    }
  }
}

export function useHost(caller?: string): VueElement | null {
  const instance = getCurrentInstance()
  const el = instance && (instance.ce as VueElement)
  if (el) {
    return el
  } else if (__DEV__) {
    if (!instance) {
      warn(
        `${caller || 'useHost'} called without an active component instance.`,
      )
    } else {
      warn(
        `${caller || 'useHost'} can only be used in components defined via ` +
          `defineCustomElement.`,
      )
    }
  }
  return null
}

/**
 * Retrieve the shadowRoot of the current custom element. Only usable in setup()
 * of a `defineCustomElement` component.
 */
export function useShadowRoot(): ShadowRoot | null {
  const el = __DEV__ ? useHost('useShadowRoot') : useHost()
  return el && el.shadowRoot
}
