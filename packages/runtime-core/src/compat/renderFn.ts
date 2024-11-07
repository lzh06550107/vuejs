import {
  ShapeFlags,
  extend,
  hyphenate,
  isArray,
  isObject,
  isString,
  makeMap,
  normalizeClass,
  normalizeStyle,
  toHandlerKey,
} from '@vue/shared'
import type {
  Component,
  ComponentInternalInstance,
  ComponentOptions,
  Data,
  InternalRenderFunction,
} from '../component'
import { currentRenderingInstance } from '../componentRenderContext'
import { type DirectiveArguments, withDirectives } from '../directives'
import {
  resolveDirective,
  resolveDynamicComponent,
} from '../helpers/resolveAssets'
import {
  Comment,
  type VNode,
  type VNodeArrayChildren,
  type VNodeProps,
  createVNode,
  isVNode,
  normalizeChildren,
} from '../vnode'
import {
  DeprecationTypes,
  checkCompatEnabled,
  isCompatEnabled,
} from './compatConfig'
import { compatModelEventPrefix } from './componentVModel'

/**
 * 主要目的是对 Vue 2.x 的渲染函数进行转换，使其与 Vue 3.x 兼容
 * @param instance
 */
export function convertLegacyRenderFn(
  instance: ComponentInternalInstance,
): void {
  const Component = instance.type as ComponentOptions
  const render = Component.render as InternalRenderFunction | undefined

  // v3 runtime compiled, or already checked / wrapped
  // 首先，函数检查组件实例 (instance) 中是否存在 render 函数，并且判断该函数是否已经被标记为处理过（通过 _rc、_compatChecked 和 _compatWrapped）。
  // 如果 render 函数已经被处理或没有定义，则直接返回，不做任何操作
  if (!render || render._rc || render._compatChecked || render._compatWrapped) {
    return
  }

  // 如果 render 函数的参数大于等于 2，表示它是一个 Vue 3.x 编译后的渲染函数，因为 Vue 2.x 的渲染函数通常只有一个或两个参数。
  // 此时，直接将 render._compatChecked 标记为 true，并返回
  if (render.length >= 2) {
    // v3 pre-compiled function, since v2 render functions never need more than
    // 2 arguments, and v2 functional render functions would have already been
    // normalized into v3 functional components
    render._compatChecked = true
    return
  }

  // 如果 render 函数的参数个数小于 2，说明它是一个 Vue 2.x 的渲染函数。此时，函数会检查是否启用了兼容模式（通过 checkCompatEnabled）。
  // 如果启用了兼容模式，函数会包裹原始的 render 函数，将其传递给 compatH，以便在 Vue 3.x 环境中正确处理
  // compatH 是 Vue 3.x 中的一个帮助函数，用于处理渲染函数的兼容性

  // v2 render function, try to provide compat
  // 如果是 Vue 2.x 渲染函数，使用一个新的 wrapped 函数包裹原始的 render 函数。然后标记 wrapped._compatWrapped = true，表示该渲染函数已经被包裹
  if (checkCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance)) {
    const wrapped = (Component.render = function compatRender() {
      // @ts-expect-error
      return render.call(this, compatH)
    })
    // @ts-expect-error
    wrapped._compatWrapped = true
  }
}

interface LegacyVNodeProps {
  key?: string | number
  ref?: string
  refInFor?: boolean

  staticClass?: string
  class?: unknown
  staticStyle?: Record<string, unknown>
  style?: Record<string, unknown>
  attrs?: Record<string, unknown>
  domProps?: Record<string, unknown>
  on?: Record<string, Function | Function[]>
  nativeOn?: Record<string, Function | Function[]>
  directives?: LegacyVNodeDirective[]

  // component only
  props?: Record<string, unknown>
  slot?: string
  scopedSlots?: Record<string, Function>
  model?: {
    value: any
    callback: (v: any) => void
    expression: string
  }
}

interface LegacyVNodeDirective {
  name: string
  value: unknown
  arg?: string
  modifiers?: Record<string, boolean>
}

type LegacyVNodeChildren =
  | string
  | number
  | boolean
  | VNode
  | VNodeArrayChildren

export function compatH(
  type: string | Component,
  children?: LegacyVNodeChildren,
): VNode
export function compatH(
  type: string | Component,
  props?: Data & LegacyVNodeProps,
  children?: LegacyVNodeChildren,
): VNode

/**
 * “对每个键进行不同的处理”是指根据属性的类型和键名的不同，采取不同的转换或合并策略
 * @param type
 * @param propsOrChildren
 * @param children
 */
export function compatH(
  type: any,
  propsOrChildren?: any,
  children?: any,
): VNode {
  if (!type) {
    type = Comment
  }

  // to support v2 string component name look!up
  if (typeof type === 'string') {
    const t = hyphenate(type)
    if (t === 'transition' || t === 'transition-group' || t === 'keep-alive') {
      // since transition and transition-group are runtime-dom-specific,
      // we cannot import them directly here. Instead they are registered using
      // special keys in @vue/compat entry.
      type = `__compat__${t}`
    }
    type = resolveDynamicComponent(type)
  }

  const l = arguments.length
  const is2ndArgArrayChildren = isArray(propsOrChildren)
  if (l === 2 || is2ndArgArrayChildren) {
    if (isObject(propsOrChildren) && !is2ndArgArrayChildren) {
      // single vnode without props
      if (isVNode(propsOrChildren)) {
        return convertLegacySlots(createVNode(type, null, [propsOrChildren]))
      }
      // props without children
      return convertLegacySlots(
        convertLegacyDirectives(
          createVNode(type, convertLegacyProps(propsOrChildren, type)),
          propsOrChildren,
        ),
      )
    } else {
      // omit props
      return convertLegacySlots(createVNode(type, null, propsOrChildren))
    }
  } else {
    if (isVNode(children)) {
      children = [children]
    }
    return convertLegacySlots(
      convertLegacyDirectives(
        createVNode(type, convertLegacyProps(propsOrChildren, type), children),
        propsOrChildren,
      ),
    )
  }
}

const skipLegacyRootLevelProps = /*@__PURE__*/ makeMap(
  'staticStyle,staticClass,directives,model,hook',
)

/**
 * 用于将 Vue 2.x 中的属性（legacyProps）转换为 Vue 3.x 兼容的属性格式。
 * 这是一个重要的迁移步骤，特别是在将 Vue 2.x 项目迁移到 Vue 3.x 时，确保旧的组件属性可以适应新的 Vue 3 API
 * @param legacyProps
 * @param type
 */
function convertLegacyProps(
  legacyProps: LegacyVNodeProps | undefined,
  type: any,
): (Data & VNodeProps) | null {
  // 如果没有 legacyProps，直接返回 null，表示没有需要转换的属性
  if (!legacyProps) {
    return null
  }

  // 创建一个空的 converted 对象，用于存储转换后的属性
  const converted: Data & VNodeProps = {}

  // 遍历 legacyProps 的所有键
  for (const key in legacyProps) {
    // 如果 legacyProps 中包含 attrs、domProps 或 props，则将它们的属性合并到 converted 对象中。使用 extend 函数将它们合并
    if (key === 'attrs' || key === 'domProps' || key === 'props') {
      extend(converted, legacyProps[key])
    } else if (key === 'on' || key === 'nativeOn') {
      // 如果属性键是 on 或 nativeOn，则说明它们包含事件监听器
      const listeners = legacyProps[key]
      // 遍历事件监听器，使用 convertLegacyEventKey 函数将事件名称转换为 Vue 3.x 的标准事件处理格式
      for (const event in listeners) {
        let handlerKey = convertLegacyEventKey(event)
        // 如果事件名是 nativeOn，则额外添加 Native 后缀
        if (key === 'nativeOn') handlerKey += `Native`
        const existing = converted[handlerKey]
        const incoming = listeners[event]
        if (existing !== incoming) {
          if (existing) {
            converted[handlerKey] = [].concat(existing as any, incoming as any)
          } else {
            // 如果有重复的事件处理器，将它们合并成一个数组
            converted[handlerKey] = incoming
          }
        }
      }
    } else if (!skipLegacyRootLevelProps(key)) {
      // 对于某些不需要转换的根级属性，使用 skipLegacyRootLevelProps 函数判断是否跳过
      converted[key] = legacyProps[key as keyof LegacyVNodeProps]
    }
  }

  // 如果 legacyProps 中包含 staticClass 和 staticStyle，则将它们与已经存在的类和样式进行合并，确保样式和类名的兼容
  if (legacyProps.staticClass) {
    converted.class = normalizeClass([legacyProps.staticClass, converted.class])
  }
  if (legacyProps.staticStyle) {
    converted.style = normalizeStyle([legacyProps.staticStyle, converted.style])
  }

  // 如果 legacyProps 中包含 model，并且 type 为对象类型，则进行 v-model 兼容处理
  if (legacyProps.model && isObject(type)) {
    // v2 compiled component v-model
    const { prop = 'value', event = 'input' } = (type as any).model || {}
    // 通过 type.model 获取 prop 和 event，将 model 的值和回调赋值到 converted 中
    converted[prop] = legacyProps.model.value
    // 这里处理的是 Vue 2.x 中的 v-model 绑定转换为 Vue 3.x 的形式
    converted[compatModelEventPrefix + event] = legacyProps.model.callback
  }

  return converted
}

/**
 * 用于将 Vue 2.x 风格的事件修饰符转换为 Vue 3.x 所需的事件名称，并处理事件前缀的兼容性
 * @param event
 */
function convertLegacyEventKey(event: string): string {
  // normalize v2 event prefixes
  if (event[0] === '&') {
    // 如果事件名称以 & 开头，表示这是一个被动事件处理器。在 Vue 3 中，& 前缀会被转换为 'Passive' 后缀
    event = event.slice(1) + 'Passive'
  }
  if (event[0] === '~') {
    // 如果事件名称以 ~ 开头，表示这是一个单次事件处理器。在 Vue 3 中，~ 前缀会被转换为 'Once' 后缀
    event = event.slice(1) + 'Once'
  }
  if (event[0] === '!') {
    // 如果事件名称以 ! 开头，表示这是一个捕获事件处理器。在 Vue 3 中，! 前缀会被转换为 'Capture' 后缀
    event = event.slice(1) + 'Capture'
  }
  // toHandlerKey 函数被调用将事件名转换为适用于事件处理的标准格式。这个函数通常将事件名称的第一个字母转为小写，确保符合 Vue 3 的事件处理规范
  return toHandlerKey(event)
}

/**
 * 用于将 Vue 2.x 风格的指令转换为 Vue 3.x 的指令机制。
 * Vue 2.x 和 Vue 3.x 中指令的处理方式有所不同，因此在 Vue 3 中需要将 Vue 2.x 中的指令进行转换，保证旧代码在 Vue 3 中能够正常运行
 * @param vnode
 * @param props
 */
function convertLegacyDirectives(
  vnode: VNode,
  props?: LegacyVNodeProps,
): VNode {
  // 函数首先检查 props 是否存在，并且是否包含 directives 属性。directives 是 Vue 2.x 中用来注册指令的对象数组
  // 如果 props.directives 存在，说明需要转换 Vue 2.x 风格的指令；如果没有指令，则返回原始的 vnode
  if (props && props.directives) {
    return withDirectives(
      vnode,
      // 对每个指令（props.directives 数组中的每一项），从中提取 name（指令名称）、value（指令的值）、arg（指令的参数）和 modifiers（指令的修饰符）
      props.directives.map(({ name, value, arg, modifiers }) => {
        return [
          resolveDirective(name)!, // 使用 resolveDirective 函数解析指令的名称，将其转换为 Vue 3 的指令函数
          value,
          arg,
          modifiers,
        ] as DirectiveArguments[number]
      }),
    )
  }
  return vnode
}

/**
 * 用于将 Vue 2.x 风格的插槽转换为 Vue 3.x 的插槽方式。这个函数处理了 VNode 中的插槽，确保它们在 Vue 3 中的行为符合 Vue 3 的插槽机制，尤其是支持兼容模式下的旧插槽
 * @param vnode
 */
function convertLegacySlots(vnode: VNode): VNode {
  const { props, children } = vnode

  let slots: Record<string, any> | undefined

  // 检查 vnode.shapeFlag 是否包含 ShapeFlags.COMPONENT，这表示该 VNode 是一个组件类型的 VNode
  // 如果 children 是一个数组，说明该组件有多个插槽内容
  if (vnode.shapeFlag & ShapeFlags.COMPONENT && isArray(children)) {
    slots = {}
    // check "slot" property on vnodes and turn them into v3 function slots
    // 遍历 children 数组，检查每个子节点的 slot 属性，slot 属性用于标识该子节点属于哪个插槽。如果没有 slot 属性，则默认为 'default' 插槽
    for (let i = 0; i < children.length; i++) {
      // 将每个子节点按照其插槽名称分组，生成一个新的 slots 对象
      const child = children[i]
      const slotName =
        (isVNode(child) && child.props && child.props.slot) || 'default'
      const slot = slots[slotName] || (slots[slotName] = [] as any[])
      if (isVNode(child) && child.type === 'template') {
        // 如果子节点是 template 类型，则将其 children 作为插槽的内容
        slot.push(child.children)
      } else {
        // 否则，将子节点直接作为插槽内容
        slot.push(child)
      }
    }
    // 将插槽转换为 Vue 3 的函数插槽
    if (slots) {
      // Vue 3 中，插槽是通过函数传递的，因此将 slots 对象中的每个插槽内容包装为一个函数，返回该插槽的子节点
      for (const key in slots) {
        const slotChildren = slots[key]
        slots[key] = () => slotChildren
        // 设置插槽的 _ns 属性为 true，表示这是一个非作用域插槽（non-scoped slot）
        slots[key]._ns = true /* non-scoped slot */
      }
    }
  }

  // 处理 scopedSlots 属性
  // 如果 props 中包含 scopedSlots，则将其合并到 slots 中
  // scopedSlots 是 Vue 2.x 风格的作用域插槽，需要在 Vue 3 中转化为普通的插槽
  const scopedSlots = props && props.scopedSlots
  if (scopedSlots) {
    delete props!.scopedSlots
    if (slots) {
      extend(slots, scopedSlots)
    } else {
      slots = scopedSlots
    }
  }

  if (slots) {
    // 如果存在 slots，调用 normalizeChildren 函数将插槽内容规范化，确保插槽内容符合 Vue 3 的要求
    normalizeChildren(vnode, slots)
  }

  return vnode
}

/**
 * 用于在 Vue 3 中为虚拟 DOM 节点（VNode）定义一些与 Vue 2.x 兼容的属性。
 * 这些属性是为了支持一些 Vue 2.x 的 API 或行为，尤其是当启用了兼容模式时（isCompatEnabled），它们允许旧代码在 Vue 3 中运行时的行为更加一致
 * @param vnode
 */
export function defineLegacyVNodeProperties(vnode: VNode): void {
  /* v8 ignore start */
  if (
    // 使用 isCompatEnabled 来检查是否启用了兼容模式
    isCompatEnabled(
      DeprecationTypes.RENDER_FUNCTION, // 检查是否启用与渲染函数相关的兼容模式
      currentRenderingInstance,
      true /* enable for built-ins */,
    ) &&
    isCompatEnabled(
      DeprecationTypes.PRIVATE_APIS, // 检查是否启用私有 API 的兼容模式
      currentRenderingInstance,
      true /* enable for built-ins */,
    )
  ) {
    const context = currentRenderingInstance
    const getInstance = () => vnode.component && vnode.component.proxy
    let componentOptions: any
    // 使用 Object.defineProperties 为 vnode 定义了多个属性。这些属性模拟了 Vue 2.x 中的一些行为，提供了对虚拟节点的访问，确保组件的行为在 Vue 3 中与 Vue 2 保持一致
    Object.defineProperties(vnode, {
      // 返回节点的类型（例如，div、span 等标签名或组件类型）
      tag: { get: () => vnode.type },
      // 返回或设置 vnode 的 props（即属性）。如果没有 props，返回空对象
      data: { get: () => vnode.props || {}, set: p => (vnode.props = p) },
      // 返回该 vnode 对应的实际 DOM 元素（即挂载后的元素）
      elm: { get: () => vnode.el },
      // 返回组件实例。如果 vnode 类型是组件类型，返回该组件的代理实例
      componentInstance: { get: getInstance },
      // 返回 componentInstance，即组件实例
      child: { get: getInstance },
      // 如果 vnode 的子节点是字符串，返回该字符串；否则返回 null
      text: { get: () => (isString(vnode.children) ? vnode.children : null) },
      // 返回渲染上下文（即组件的 proxy）
      context: { get: () => context && context.proxy },
      // 如果 vnode 是状态组件类型（ShapeFlags.STATEFUL_COMPONENT），则返回组件的构造函数、传递给组件的属性和子节点。这个属性帮助模拟 Vue 2.x 中组件的选项
      componentOptions: {
        get: () => {
          if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
            if (componentOptions) {
              return componentOptions
            }
            return (componentOptions = {
              Ctor: vnode.type,
              propsData: vnode.props,
              children: vnode.children,
            })
          }
        },
      },
    })
  }
  /* v8 ignore stop */
}
