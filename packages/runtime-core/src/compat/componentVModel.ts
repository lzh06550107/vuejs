import { ShapeFlags, extend } from '@vue/shared'
import type { ComponentInternalInstance, ComponentOptions } from '../component'
import { ErrorCodes, callWithErrorHandling } from '../errorHandling'
import type { VNode } from '../vnode'
import { popWarningContext, pushWarningContext } from '../warning'
import {
  DeprecationTypes,
  isCompatEnabled,
  warnDeprecation,
} from './compatConfig'

export const compatModelEventPrefix = `onModelCompat:`

const warnedTypes = new WeakSet()

/**
 * 用于处理 Vue 3 中的 v-model 兼容性。它的主要目的是将 v-model 的行为从 Vue 2 中迁移到 Vue 3 的组件系统，尤其是在处理兼容性时。
 * 具体来说，它会在存在 modelValue 和 onUpdate:modelValue 的情况下，执行一些转换操作
 * @param vnode
 */
export function convertLegacyVModelProps(vnode: VNode): void {
  // 从 vnode 获取 type（即组件类型）、shapeFlag（VNode 的形状标志）、props（组件的 props）、dynamicProps（动态 props）
  const { type, shapeFlag, props, dynamicProps } = vnode
  // comp 是指当前的组件类型，强制转换为 ComponentOptions 类型
  const comp = type as ComponentOptions
  // 检查 vnode 是否是一个组件（通过 shapeFlag & ShapeFlags.COMPONENT），并且 props 中是否包含 modelValue
  if (shapeFlag & ShapeFlags.COMPONENT && props && 'modelValue' in props) {
    if (
      // 调用 isCompatEnabled 函数检查是否启用了组件 v-model 的兼容性配置。如果没有启用，则返回，不进行后续操作
      !isCompatEnabled(
        DeprecationTypes.COMPONENT_V_MODEL,
        // this is a special case where we want to use the vnode component's
        // compat config instead of the current rendering instance (which is the
        // parent of the component that exposes v-model)
        { type } as any,
      )
    ) {
      return
    }

    // 如果当前是开发环境 (__DEV__)，并且该组件还没有发出过警告（通过 warnedTypes 集合控制），
    // 则发出关于 v-model 兼容性变更的警告，并将该组件标记为已警告，避免重复警告
    if (__DEV__ && !warnedTypes.has(comp)) {
      pushWarningContext(vnode)
      warnDeprecation(DeprecationTypes.COMPONENT_V_MODEL, { type } as any, comp)
      popWarningContext()
      warnedTypes.add(comp)
    }

    // v3 compiled model code -> v2 compat props
    // modelValue -> value
    // onUpdate:modelValue -> onModelCompat:input
    // 获取组件的 model 配置，或者使用空对象作为默认值
    const model = comp.model || {}
    // 如果组件有 mixins，则通过 applyModelFromMixins 函数合并 model 配置
    applyModelFromMixins(model, comp.mixins)
    // 从 model 配置中获取 prop（默认值为 'value'）和 event（默认值为 'input'）
    const { prop = 'value', event = 'input' } = model
    if (prop !== 'modelValue') {
      props[prop] = props.modelValue
      delete props.modelValue
    }
    // important: update dynamic props
    // 如果 prop 不是 'modelValue'，则将 modelValue 的值赋给 prop，并删除 modelValue 属性。这是将 Vue 3 的 modelValue 转换为 Vue 2 风格的 value
    if (dynamicProps) {
      dynamicProps[dynamicProps.indexOf('modelValue')] = prop
    }
    // 如果存在动态属性 dynamicProps，则将 modelValue 的位置替换为新的 prop
    props[compatModelEventPrefix + event] = props['onUpdate:modelValue']
    delete props['onUpdate:modelValue']
  }
}

/**
 * 从组件的 mixins 中提取并合并 model 配置。Vue 中的 mixins 允许多个组件共享相同的逻辑和配置，model 配置也可以通过 mixins 进行继承。
 * 这个函数通过递归地遍历 mixins，将每个 mixin 的 model 配置合并到主 model 对象中
 * @param model 当前组件的 model 配置，mixins 中的 model 配置将被合并到它上面
 * @param mixins 一个可选的 ComponentOptions 数组，包含了多个 mixin 配置
 */
function applyModelFromMixins(model: any, mixins?: ComponentOptions[]) {
  // 如果 mixins 存在，遍历其中的每个 mixin（m）
  if (mixins) {
    mixins.forEach(m => {
      // 如果当前 mixin 有 model 配置，则将其合并到主 model 中（使用 extend 函数，通常是浅合并）
      if (m.model) extend(model, m.model)
      // 如果当前 mixin 还有 mixins 配置（即嵌套的 mixins），则递归调用 applyModelFromMixins，进一步处理嵌套的 mixins
      if (m.mixins) applyModelFromMixins(model, m.mixins)
    })
  }
}

/**
 * 用于在组件中发出兼容的 v-model 事件，它主要是处理 Vue 2.x 风格的 v-model 事件，在 Vue 3.x 中对 v-model 的支持发生了变化
 * @param instance 当前组件的实例对象，类型为 ComponentInternalInstance
 * @param event 发出的事件名称，通常是 input 或其他与 v-model 相关的事件
 * @param args 事件处理函数的参数，通常是 v-model 绑定的值
 */
export function compatModelEmit(
  instance: ComponentInternalInstance,
  event: string,
  args: any[],
): void {
  // 检查当前实例是否启用了 v-model 的兼容模式。该函数根据 Vue 配置来判断是否需要启用与 Vue 2.x 兼容的 v-model 处理。如果没有启用兼容模式，直接返回，不做任何处理
  if (!isCompatEnabled(DeprecationTypes.COMPONENT_V_MODEL, instance)) {
    return
  }
  // 从组件的 vnode.props 中获取属性
  const props = instance.vnode.props
  // 通过 compatModelEventPrefix + event 计算出事件处理函数的名称（例如，onModelCompat:input），并从 props 中查找对应的处理函数
  const modelHandler = props && props[compatModelEventPrefix + event]
  if (modelHandler) {
    // 如果找到了 modelHandler，使用 callWithErrorHandling 调用该函数，传入 args 作为事件的参数。
    // callWithErrorHandling 确保即使事件处理函数发生错误，也能进行适当的错误处理
    callWithErrorHandling(
      modelHandler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args,
    )
  }
}
