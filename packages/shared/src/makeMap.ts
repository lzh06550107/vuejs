/**
 * Make a map and return a function for checking if a key
 * is in that map.
 * IMPORTANT: all calls of this function must be prefixed with
 * \/\*#\_\_PURE\_\_\*\/
 * So that rollup can tree-shake them if necessary.
 */

/*! #__NO_SIDE_EFFECTS__ */
export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null) // 创建一个没有原型的空对象
  for (const key of str.split(',')) map[key] = 1 // 将逗号分隔的字符串转为键，并赋值为 1
  return val => val in map // 返回一个函数，判断给定的值是否在 map 中
}
