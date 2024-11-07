// 这行代码禁用了 ESLint 规则，允许使用 // @ts-ignore 而不引发警告
/* eslint-disable @typescript-eslint/prefer-ts-expect-error */
// global JSX namespace registration
// somehow we have to copy=pase the jsx-runtime types here to make TypeScript happy
// 这行代码从 Vue 运行时导入必要的类型。
//
// * NativeElements 代表 JSX 中可用的内置元素（如 div、span 等）。
// * ReservedProps 包含 Vue 保留的属性。
// * VNode 是表示虚拟 DOM 节点的类型。
import type { NativeElements, ReservedProps, VNode } from '@vue/runtime-dom'

// 这段代码对于在使用 JSX 语法时将 Vue 与 TypeScript 集成至关重要。
// 它帮助 TypeScript 理解如何对 JSX 元素进行类型检查，从而在使用 Vue 组件的过程中提供更好的工具支持、自动补全和错误检查。

// 全局声明，用于扩展现有的全局类型
declare global {
  namespace JSX {
    // 声明了一个新的命名空间 JSX，用于扩展全局 JSX 类型
    // 这里定义的 Element 接口扩展自 VNode，意味着任何 JSX 元素都将被视为 VNode
    export interface Element extends VNode {}
    // 元素类接口，定义了 JSX 元素的类类型，指示它具有 $props 属性
    export interface ElementClass {
      $props: {}
    }
    // 元素属性接口，用于访问 JSX 元素属性的属性，在此情况下为 $props
    export interface ElementAttributesProperty {
      $props: {}
    }
    // 内置元素接口，该接口扩展自 NativeElements，定义了 JSX 中的标准 HTML 元素
    export interface IntrinsicElements extends NativeElements {
      // allow arbitrary elements
      // @ts-ignore suppress ts:2374 = Duplicate string index signature.
      [name: string]: any
    }
    // 内置属性接口，该接口扩展自 ReservedProps，允许在 JSX 中使用任何保留属性作为内置属性
    export interface IntrinsicAttributes extends ReservedProps {}
  }
}
