/**
 * js-yaml 类型声明文件
 * 
 * 由于 @types/js-yaml 可能不存在，我们提供基本的类型声明
 */

declare module 'js-yaml' {
  /**
   * 加载YAML字符串为JavaScript对象
   * @param str YAML字符串
   * @param options 可选配置
   */
  export function load(str: string, options?: unknown): unknown;

  /**
   * 加载所有YAML文档
   * @param str YAML字符串
   * @param options 可选配置
   */
  export function loadAll(str: string, iterator?: unknown, options?: unknown): unknown[];

  /**
   * 安全加载YAML字符串
   * @param str YAML字符串
   * @param options 可选配置
   */
  export function safeLoad(str: string, options?: unknown): unknown;

  /**
   * 安全加载所有YAML文档
   * @param str YAML字符串
   * @param options 可选配置
   */
  export function safeLoadAll(str: string, iterator?: unknown, options?: unknown): unknown[];

  /**
   * 将JavaScript对象转储为YAML字符串
   * @param obj JavaScript对象
   * @param options 可选配置
   */
  export function dump(obj: unknown, options?: unknown): string;

  /**
   * 安全转储（默认）
   * @param obj JavaScript对象
   * @param options 可选配置
   */
  export function safeDump(obj: unknown, options?: unknown): string;

  /**
   * YAML异常类
   */
  export class YAMLException extends Error {
    constructor(reason: string, mark?: unknown);
    toString(): string;
  }

  /**
   * 默认导出
   */
  const yaml: {
    load: typeof load;
    loadAll: typeof loadAll;
    safeLoad: typeof safeLoad;
    safeLoadAll: typeof safeLoadAll;
    dump: typeof dump;
    safeDump: typeof safeDump;
    YAMLException: typeof YAMLException;
  };

  export default yaml;
}
