import { warn } from '@vue/runtime-core'
import type { RendererOptions } from '@vue/runtime-core'
import type {
  TrustedHTML,
  TrustedTypePolicy,
  TrustedTypesWindow,
} from 'trusted-types/lib'

// Pick<TrustedTypePolicy, 'name' | 'createHTML'> 让 policy 只拥有 name 和 createHTML 属性
let policy: Pick<TrustedTypePolicy, 'name' | 'createHTML'> | undefined =
  undefined

// 这段代码的作用是检查浏览器环境中是否存在 window 对象，并且在存在 window 的情况下，尝试从 window 对象中获取 trustedTypes 属性
// trustedTypes 是一种 Web API，用于提供更安全的类型安全机制，特别是防止 XSS（跨站脚本攻击）。trustedTypes 通过强制执行信任的 HTML 或 JavaScript 代码来帮助保护应用程序免受恶意脚本的攻击。
// trustedTypes 允许通过特定的 API 来创建“受信任的”字符串或 DOM，避免直接将用户输入的内容作为 DOM 元素插入页面中，从而降低 XSS 攻击的风险。
const tt =
  typeof window !== 'undefined' &&
  (window as unknown as TrustedTypesWindow).trustedTypes

// 检查 trustedTypes 是否可用，如果可用，则使用 createPolicy 方法创建一个名为 vue 的受信任类型策略（Trusted Type Policy）。
// 如果创建过程中发生错误（例如策略名称重复），则捕获并处理错误。
if (tt) {
  try {
    // tt.createPolicy 是 trustedTypes 提供的 API，用于创建一个新的受信任类型策略。这里的 createPolicy 被调用时传入两个参数：
    // * 'vue'：这是创建的策略名称，在此代码中，策略名称为 'vue'。
    // * { createHTML: val => val }：这是一个配置对象，用来定义受信任类型的创建方式。在这里，createHTML 函数简单地返回传入的值，这意味着在这个策略中，传入的任何 HTML 都会被认为是受信任的，不做进一步处理。
    policy = /*@__PURE__*/ tt.createPolicy('vue', {
      createHTML: val => val,
    })
    // 这种方式有可能在生产环境中增加 XSS（跨站脚本攻击）的风险，因为它并没有进行任何过滤或转义处理，直接返回输入的 HTML 字符串
  } catch (e: unknown) {
    // `createPolicy` throws a TypeError if the name is a duplicate
    // and the CSP trusted-types directive is not using `allow-duplicates`.
    // So we have to catch that error.
    __DEV__ && warn(`Error creating trusted types policy: ${e}`)
  }
}

// __UNSAFE__
// Reason: potentially setting innerHTML.
// This function merely perform a type-level trusted type conversion
// for use in `innerHTML` assignment, etc.
// Be careful of whatever value passed to this function.
// __UNSAFE__ 标记表示这个函数的使用是“不安全的”。
// 因为它直接涉及到通过 innerHTML 设置内容，innerHTML 是一个潜在的 XSS（跨站脚本攻击）漏洞来源。
// 因此，在使用 unsafeToTrustedHTML 时必须小心，确保传入的值是安全的

// unsafeToTrustedHTML 是一个转换函数，它的目的是将 string 类型的值转换为 TrustedHTML 类型，以便在 innerHTML 等地方安全使用
// 警告：虽然这个函数本身执行的是类型转换，但实际操作中，它依然可能涉及到潜在的安全风险。调用者必须确保传入的 val 是经过信任和验证的 HTML 内容
export const unsafeToTrustedHTML: (value: string) => TrustedHTML | string =
  policy ? val => policy.createHTML(val) : val => val

// svgNS 和 mathmlNS 定义了 SVG 和 MathML 元素的命名空间 URI
export const svgNS = 'http://www.w3.org/2000/svg'
export const mathmlNS = 'http://www.w3.org/1998/Math/MathML'

// 这行代码检查当前环境是否为浏览器环境（通过 typeof document !== 'undefined'）。
// 如果是浏览器环境，则 doc 会被赋值为 document 对象。如果不是浏览器环境（例如在 Node.js 环境中），则 doc 为 null
const doc = (typeof document !== 'undefined' ? document : null) as Document

// 这是创建一个 HTML <template> 元素的标准方式，该元素可以用于存储 HTML 模板。模板本身不会被渲染，只能通过 JavaScript 提取并渲染其内容
const templateContainer = doc && /*@__PURE__*/ doc.createElement('template')

// 定义了一个名为 nodeOps 的对象，它实现了一些与 DOM 操作相关的方法，并且符合 RendererOptions<Node, Element> 类型，除了 patchProp 方法（通过 Omit 类型从中排除）。
// 这些方法提供了对 DOM 元素的操作，如插入、删除、创建元素、设置文本等
export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  // 这些方法构成了一个用于 DOM 操作的基本接口 nodeOps。它们为 Vue 的渲染器提供了 DOM 操作的封装，使得渲染器可以跨平台处理 DOM 元素。
  // 每个方法的实现都考虑了特定的 DOM 操作，如元素插入、删除、创建节点、设置文本等，此外，insertStaticContent 也特别考虑了 SVG 和 MathML 命名空间的处理

  // 该方法将 child 元素插入到 parent 元素的指定位置，anchor 是插入位置的参考节点。如果 anchor 为 null，则会将 child 插入到 parent 的最后
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },

  // 该方法从其父节点中移除 child 元素
  remove: child => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  // 该方法创建一个新的元素节点，根据 namespace 确定元素是 SVG、MathML 还是普通元素
  createElement: (tag, namespace, is, props): Element => {
    const el =
      namespace === 'svg'
        ? doc.createElementNS(svgNS, tag)
        : namespace === 'mathml'
          ? doc.createElementNS(mathmlNS, tag)
          : is
            ? doc.createElement(tag, { is })
            : doc.createElement(tag)

    // 如果 tag 是 select，且 props 对象中有 multiple 属性，它会将 multiple 设置为 true，使得 select 元素支持多选
    if (tag === 'select' && props && props.multiple != null) {
      ;(el as HTMLSelectElement).setAttribute('multiple', props.multiple)
    }

    return el
  },

  // 该方法创建一个文本节点，并返回
  createText: text => doc.createTextNode(text),

  // 该方法创建一个注释节点，并返回
  createComment: text => doc.createComment(text),

  // 该方法设置文本节点的值，nodeValue 是文本节点的属性
  setText: (node, text) => {
    node.nodeValue = text
  },

  // 该方法设置元素节点的文本内容，textContent 属性会替换元素内部的所有文本
  setElementText: (el, text) => {
    el.textContent = text
  },

  // 该方法返回指定节点的父节点
  parentNode: node => node.parentNode as Element | null,

  // 该方法返回指定节点的下一个兄弟节点
  nextSibling: node => node.nextSibling,

  // 该方法返回与给定选择器匹配的第一个元素
  querySelector: selector => doc.querySelector(selector),

  // 该方法为指定的元素设置 id 属性
  setScopeId(el, id) {
    el.setAttribute(id, '')
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  /**
   * 该方法插入静态内容（通常是 HTML 字符串）到指定的父节点和锚点之间
   * 它支持插入来自缓存的内容，或者插入新的内容，这些操作确保了插入的内容正确且安全地被渲染到 DOM 中
   * @param content
   * @param parent
   * @param anchor
   * @param namespace
   * @param start
   * @param end
   */
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    // <parent> before | first ... last | anchor </parent>
    // 这行代码确定了插入内容的前置节点。如果 anchor 存在，则 before 为 anchor 的前一个兄弟节点。如果 anchor 不存在，则 before 设为 parent 的最后一个子节点
    const before = anchor ? anchor.previousSibling : parent.lastChild
    // #5308 can only take cached path if: 缓存路径插入
    // - has a single root node
    // - nextSibling info is still available
    if (start && (start === end || start.nextSibling)) {
      // cached
      // 如果内容的起始和结束节点在缓存中，它将直接从缓存中插入
      while (true) {
        parent.insertBefore(start!.cloneNode(true), anchor)
        if (start === end || !(start = start!.nextSibling)) break
      }
    } else {
      // fresh insert
      // 如果是新的内容，它会首先通过 unsafeToTrustedHTML 转换成受信任的 HTML，然后插入到父节点中
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === 'svg'
          ? `<svg>${content}</svg>`
          : namespace === 'mathml'
            ? `<math>${content}</math>`
            : content,
      ) as string

      // 如果内容的命名空间是 svg 或 mathml，这部分代码将移除外层的 <svg> 或 <math> 包裹元素。
      // 因为这只是为了正确地插入静态内容，最终内容应该是位于该命名空间内部的元素，外层的包裹元素可以去除
      const template = templateContainer.content
      if (namespace === 'svg' || namespace === 'mathml') {
        // remove outer svg/math wrapper
        const wrapper = template.firstChild!
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild)
        }
        // 通过将包裹元素中的子节点（firstChild）移到模板的根节点中，最终删除包裹元素
        template.removeChild(wrapper)
      }
      // 将处理后的内容插入到 parent 中，位置为 anchor 之前
      parent.insertBefore(template, anchor)
    }
    // 该方法返回一个包含两个节点的数组：插入内容后的第一个节点和最后一个节点
    return [
      // first
      before ? before.nextSibling! : parent.firstChild!,
      // last
      anchor ? anchor.previousSibling! : parent.lastChild!,
    ]
  },
}
