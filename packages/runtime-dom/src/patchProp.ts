import { patchClass } from './modules/class'
import { patchStyle } from './modules/style'
import { patchAttr } from './modules/attrs'
import { patchDOMProp } from './modules/props'
import { patchEvent } from './modules/events'
import {
  camelize,
  isFunction,
  isModelListener,
  isOn,
  isString,
} from '@vue/shared'
import type { RendererOptions } from '@vue/runtime-core'
import type { VueElement } from './apiCustomElement'

/**
 * 这个函数用于检查给定的 key 是否是一个“原生的”事件（如 onClick，onMouseEnter 等）事件名
 * 这通常用于识别 DOM 事件
 * @param key
 */
const isNativeOn = (key: string) =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // lowercase letter
  // 确保第三个字符是一个小写字母（即字母范围 'a' 到 'z'，字符编码 97 到 122）
  key.charCodeAt(2) > 96 &&
  key.charCodeAt(2) < 123

// 定义类型别名
type DOMRendererOptions = RendererOptions<Node, Element>

/**
 * patchProp 函数的目的是在渲染过程中更新元素的属性值。在 Vue 的渲染机制中，DOM 属性的更新通常由 patchProp 来处理。
 * 这个函数会根据 prevValue 和 nextValue 的差异来决定如何高效地更新 DOM 元素的属性。
 * 它通常被用来处理 DOM 元素的属性更新，特别是在虚拟 DOM diff 算法中检测到属性变化时。
 *
 * 使用场景
 * 1. DOM 属性的更新：比如在 Vue 的渲染过程中，虚拟 DOM 与实际 DOM 对比时，如果某个 DOM 元素的属性发生了变化（如 style 或 class），就会调用 patchProp 来更新这个属性。
 * 2. 事件监听器的更新：如果 key 是一个事件名称（如 onClick），那么 patchProp 会负责更新这个事件的处理函数。如果事件函数发生变化，它会将新的事件处理器附加到元素上。
 * 3. 命名空间处理：对于某些具有命名空间的元素（如 SVG 或 MathML），patchProp 会处理属性更新时的命名空间问题。
 *
 * @param el 表示要更新属性的 DOM 元素（即要操作的目标节点）
 * @param key 数表示需要更新的属性名。通常是 HTML 元素的属性（如 id、class、href 等），或者自定义的事件监听器（如 onClick、onInput 等）
 * @param prevValue 表示当前属性的旧值，即更新前的属性值
 * @param nextValue 表示属性的新值，即更新后的属性值
 * @param namespace 该参数指定属性的命名空间（如果有的话），如 SVG 中的 xmlns 等。对于大多数常规 HTML 元素，通常这个值是 undefined
 * @param parentComponent 该参数表示当前 DOM 元素所属的父组件（如果存在的话）。它在更新某些属性时可能会用到，特别是涉及到组件状态或生命周期的情况下
 */
export const patchProp: DOMRendererOptions['patchProp'] = (
  el,
  key,
  prevValue,
  nextValue,
  namespace,
  parentComponent,
) => {
  // 检查元素是否为 SVG
  const isSVG = namespace === 'svg'
  if (key === 'class') {
    // 如果 key 是 "class"，则使用 patchClass 函数更新元素的 class
    patchClass(el, nextValue, isSVG)
  } else if (key === 'style') {
    // 如果 key 是 "style"，则使用 patchStyle 函数更新元素的内联样式
    patchStyle(el, prevValue, nextValue)
  } else if (isOn(key)) {
    // ignore v-model listeners
    if (!isModelListener(key)) {
      // 如果 key 是事件监听器（如 @click、@input 等），则调用 patchEvent 更新事件监听器。它会检查是否是 v-model 监听器，如果是，则跳过该监听器的更新
      patchEvent(el, key, prevValue, nextValue, parentComponent)
    }
  } else if (
    //处理 DOM 属性。 如果 key 以 . 或 ^ 开头，会根据自定义规则修改 key
    key[0] === '.'
      ? ((key = key.slice(1)), true)
      : key[0] === '^'
        ? ((key = key.slice(1)), false)
        : shouldSetAsProp(el, key, nextValue, isSVG)
  ) {
    patchDOMProp(el, key, nextValue, parentComponent)
    // #6007 also set form state as attributes so they work with
    // <input type="reset"> or libs / extensions that expect attributes
    // #11163 custom elements may use value as an prop and set it as object
    if (
      //处理表单状态。 如果 key 是与表单元素相关的属性（如 value、checked、selected），并且元素不是自定义元素（没有 -），则使用 patchAttr 更新属性
      !el.tagName.includes('-') &&
      (key === 'value' || key === 'checked' || key === 'selected')
    ) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== 'value')
    }
  } else if (
    // 处理异步自定义元素。对于自定义元素（Vue 组件），如果属性是驼峰命名的或者 nextValue 不是字符串，则使用 patchDOMProp 更新属性
    // #11081 force set props for possible async custom element
    (el as VueElement)._isVueCE &&
    (/[A-Z]/.test(key) || !isString(nextValue))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key)
  } else {
    // 处理特殊属性（true-value、false-value）。
    // special case for <input v-model type="checkbox"> with
    // :true-value & :false-value
    // store value as dom properties since non-string values will be
    // stringified.
    // 如果 key 是 "true-value" 或 "false-value"，则将这些值作为内部属性存储在元素上（例如，处理复选框的 v-model）
    if (key === 'true-value') {
      ;(el as any)._trueValue = nextValue
    } else if (key === 'false-value') {
      ;(el as any)._falseValue = nextValue
    }
    // 默认处理：处理其他属性
    patchAttr(el, key, nextValue, isSVG, parentComponent)
  }
}

/**
 * 函数的目的是通过这些规则来判断属性应该作为 DOM对象 属性(Property) 还是 HTML元素 属性(Attribute) 设置
 *
 * * SVG 元素：大多数属性应作为属性 (attribute) 设置，innerHTML 和 textContent 例外。
 * * 布尔属性：如 spellcheck、draggable 等应始终作为属性 (attribute) 设置，以避免值被强制转换。
 * * 特定属性：如 form、list、type、width 和 height 需要特殊处理，作为属性 (attribute) 设置。
 * * 事件处理器：如 onclick，如果是函数，则作为属性 (Property) 设置，如果是字符串，则作为属性 (attribute) 设置。
 *
 * @param el 目标元素，表示要设置属性的 DOM 元素
 * @param key 属性名称，表示要设置的属性名
 * @param value 属性值，表示要设置的属性的值
 * @param isSVG 一个布尔值，表示该元素是否是 SVG 元素
 */
function shouldSetAsProp(
  el: Element,
  key: string,
  value: unknown,
  isSVG: boolean,
) {
  if (isSVG) {
    // SVG 元素处理
    // most keys must be set as attribute on svg elements to work
    // ...except innerHTML & textContent
    if (key === 'innerHTML' || key === 'textContent') {
      return true // Property
    }
    // or native onclick with function values
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true // Property
    }
    return false // Attribute
  }

  // these are enumerated attrs, however their corresponding DOM properties
  // are actually booleans - this leads to setting it with a string "false"
  // value leading it to be coerced to `true`, so we need to always treat
  // them as attributes.
  // Note that `contentEditable` doesn't have this problem: its DOM
  // property is also enumerated string values.
  if (key === 'spellcheck' || key === 'draggable' || key === 'translate') {
    return false // Attribute
  }

  // #1787, #2840 form property on form elements is readonly and must be set as
  // attribute.
  if (key === 'form') {
    return false // Attribute
  }

  // #1526 <input list> must be set as attribute
  if (key === 'list' && el.tagName === 'INPUT') {
    return false // Attribute
  }

  // #2766 <textarea type> must be set as attribute
  if (key === 'type' && el.tagName === 'TEXTAREA') {
    return false // Attribute
  }

  // #8780 the width or height of embedded tags must be set as attribute
  if (key === 'width' || key === 'height') {
    const tag = el.tagName
    if (
      tag === 'IMG' ||
      tag === 'VIDEO' ||
      tag === 'CANVAS' ||
      tag === 'SOURCE'
    ) {
      return false // Attribute
    }
  }

  // native onclick with string value, must be set as attribute
  // 对于原生的事件处理器（例如 onclick），如果值是字符串而非函数，它必须作为 属性 (attribute) 设置
  if (isNativeOn(key) && isString(value)) {
    return false
  }

  // 对于其他所有未被特殊处理的情况，函数会检查 key 是否是该元素的有效属性，如果是，则返回 true，否则返回 false
  return key in el
}
