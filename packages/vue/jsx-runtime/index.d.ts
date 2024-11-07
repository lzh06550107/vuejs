/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
import type { NativeElements, ReservedProps, VNode } from '@vue/runtime-dom'

// 这段代码是一个为 TypeScript 配置 Vue JSX 环境的代码。它定义了一个 JSX 命名空间（JSX），并且适配了 Vue 的渲染函数 (h)、元素类型 (VNode)、以及原生元素和属性类型

/**
 * JSX namespace for usage with @jsxImportsSource directive
 * when ts compilerOptions.jsx is 'react-jsx' or 'react-jsxdev'
 * https://www.typescriptlang.org/tsconfig#jsxImportSource
 */
// h 是 Vue 3 的渲染函数（createElement），它用于创建虚拟节点。
// 这里使用了 @jsxImportSource 指令将 h 函数作为 JSX 的默认函数来生成元素，这样 TypeScript 会知道 JSX 代码如何被转化为 Vue 渲染函数调用。
// jsxDEV 是用于开发模式的 h 函数，启用了开发时的额外检查。
// Fragment 是 Vue 的 <Fragment> 元素，它允许返回多个子节点而不需要额外的包装元素。
export { h as jsx, h as jsxDEV, Fragment } from '@vue/runtime-dom'

// JSX 命名空间接口
export namespace JSX {
  // JSX.Element：这是一个 JSX 元素的类型，它扩展了 VNode，表示 Vue 渲染的虚拟节点
  export interface Element extends VNode {}
  // JSX.ElementClass：表示 JSX 中元素的类，$props 是它的属性
  export interface ElementClass {
    $props: {}
  }
  // JSX.ElementAttributesProperty：允许定义 Element 类型的 props 属性
  export interface ElementAttributesProperty {
    $props: {}
  }
  // JSX.IntrinsicElements：这是对原生 HTML 元素的类型扩展。它继承了 NativeElements，允许你使用所有原生 HTML 元素（例如 div, span, button 等）
  export interface IntrinsicElements extends NativeElements {
    // allow arbitrary elements
    // @ts-ignore suppress ts:2374 = Duplicate string index signature.
    [name: string]: any // 这允许你使用任何自定义标签，并且不会报错
  }
  // JSX.IntrinsicAttributes：定义了 Vue 中的保留属性类型，通常是一些 Vue 特有的属性，如 key, ref, v-bind, v-on 等
  export interface IntrinsicAttributes extends ReservedProps {}
}
