// This entry is the "full-build" that includes both the runtime
// and the compiler, and supports on-the-fly compilation of the template option.
import { initDev } from './dev'
// import type 是一种特定的导入语法，用于仅导入类型，而不导入相应的值
import {
  type CompilerError,
  type CompilerOptions,
  compile,
} from '@vue/compiler-dom'
import {
  type RenderFunction,
  registerRuntimeCompiler,
  warn,
} from '@vue/runtime-dom'
import * as runtimeDom from '@vue/runtime-dom'
import {
  NOOP,
  extend,
  genCacheKey,
  generateCodeFrame,
  isString,
} from '@vue/shared'
import type { InternalRenderFunction } from 'packages/runtime-core/src/component'

if (__DEV__) {
  // 开发模式
  initDev()
}

// Record 是 TypeScript 中的一个工具类型，它表示一个对象的键是 string 类型，值是指定类型（这里是 RenderFunction）
// Object.create(null): 这段代码创建了一个空对象，但与普通对象的不同之处在于这个对象没有继承任何属性或方法。这意味着它没有 Object.prototype 上的属性（如 toString 和 hasOwnProperty），因此在使用时可以避免一些潜在的命名冲突。
const compileCache: Record<string, RenderFunction> = Object.create(null)

/**
 * 定义了一个名为 compileToFunction 的函数，其主要作用是将 Vue 模板字符串（或 HTML 元素）编译为一个渲染函数
 *
 * compileToFunction 函数的主要目的是将 Vue 模板动态编译为渲染函数，并提供缓存机制来优化性能。
 * 它能够处理不同的输入类型，进行错误管理，并返回编译后的函数以供后续使用。通过使用 compileCache，它避免了重复编译相同模板的开销，从而提高了效率。
 * @param template 可以是一个字符串（表示模板）或一个 HTMLElement（如果传入的是元素，则取其内部 HTML）
 * @param options 可选的编译选项，类型为 CompilerOptions
 *
 * 返回值: 返回一个类型为 RenderFunction 的渲染函数
 */
function compileToFunction(
  template: string | HTMLElement,
  options?: CompilerOptions,
): RenderFunction {
  // 如果 template 不是字符串，检查它是否为 DOM 元素。如果是，则获取其内部 HTML。如果既不是字符串也不是有效的 DOM 元素，则发出警告并返回一个空操作函数 NOOP
  if (!isString(template)) {
    if (template.nodeType) {
      template = template.innerHTML
    } else {
      __DEV__ && warn(`invalid template option: `, template)
      return NOOP
    }
  }

  // 生成一个缓存键 key，用于在 compileCache 中查找已经编译过的模板。如果找到了缓存的渲染函数，直接返回
  const key = genCacheKey(template, options)
  const cached = compileCache[key]
  if (cached) {
    return cached
  }

  // 如果模板字符串以 # 开头，则视为选择器，通过 document.querySelector 查找对应的元素。如果找不到元素，则发出警告。获取该元素的 innerHTML 作为模板内容
  if (template[0] === '#') {
    const el = document.querySelector(template)
    if (__DEV__ && !el) {
      warn(`Template element not found or is empty: ${template}`)
    }
    // __UNSAFE__
    // Reason: potential execution of JS expressions in in-DOM template.
    // The user must make sure the in-DOM template is trusted. If it's rendered
    // by the server, the template should not contain any user data.
    template = el ? el.innerHTML : ``
  }

  // 创建一个选项对象 opts，并扩展传入的 options。其中包含了一些默认设置，比如启用静态提升和错误/警告处理函数
  const opts = extend(
    {
      hoistStatic: true,
      onError: __DEV__ ? onError : undefined,
      onWarn: __DEV__ ? e => onError(e, true) : NOOP,
    } as CompilerOptions,
    options,
  )

  // 如果没有自定义元素的选项，并且 customElements 可用，则定义 opts.isCustomElement 方法，判断是否为自定义元素
  if (!opts.isCustomElement && typeof customElements !== 'undefined') {
    opts.isCustomElement = tag => !!customElements.get(tag)
  }

  // 调用 compile 函数，将模板字符串和选项传递给它，得到编译后的代码 code
  const { code } = compile(template, opts)

  // 定义了一个错误处理函数 onError，用于格式化和记录编译错误。包括生成代码帧的功能，以帮助开发者定位问题
  function onError(err: CompilerError, asWarning = false) {
    const message = asWarning
      ? err.message
      : `Template compilation error: ${err.message}`
    const codeFrame =
      err.loc &&
      generateCodeFrame(
        template as string,
        err.loc.start.offset,
        err.loc.end.offset,
      )
    warn(codeFrame ? `${message}\n${codeFrame}` : message)
  }

  // The wildcard import results in a huge object with every export
  // with keys that cannot be mangled, and can be quite heavy size-wise.
  // In the global build we know `Vue` is available globally so we can avoid
  // the wildcard object.
  // 创建渲染函数
  // 使用 new Function 创建一个新的函数并执行编译后的代码。根据环境是否为全局构建，传入相应的参数
  const render = // 全局模式和模块化模式
    (
      __GLOBAL__ ? new Function(code)() : new Function('Vue', code)(runtimeDom)
    ) as RenderFunction // 传入 runtimeDom 作为 Vue 变量值

  // mark the function as runtime compiled 将渲染函数标记为“运行时编译的”函数，以便后续识别
  ;(render as InternalRenderFunction)._rc = true

  // 将编译后的渲染函数存入缓存，并返回该函数
  return (compileCache[key] = render)
}

// 将 compileToFunction 函数注册为 Vue 的运行时编译器，并导出与模板编译相关的内容
// 通过注册 compileToFunction，Vue 就可以在运行时调用这个函数来将模板编译成渲染函数
registerRuntimeCompiler(compileToFunction)

export { compileToFunction as compile }
// 将 @vue/runtime-dom 模块中的所有导出项重新导出。@vue/runtime-dom 是 Vue 3 的一个运行时 DOM 操作库，提供了如 h()、render() 等 Vue 渲染相关的 API
export * from '@vue/runtime-dom'
