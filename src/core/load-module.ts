/**
 * 用執行期字串載入模組。
 *
 * 刻意不用字面量 specifier：那會讓 TypeScript 去靜態解析 AWS SDK 這類選用套件，
 * 沒安裝就編譯失敗 —— 但這個模組的賣點就是「不裝 AWS SDK 也能跑」。
 * 走這條路，型別由呼叫端的結構型別介面保證，安不安裝都不影響其他功能。
 *
 * 注意：這是**伺服器端專用**。打包工具遇到動態 specifier 會警告，
 * 用到它的檔案本來就不該進前端 bundle。
 */
export async function loadModule(specifier: string): Promise<unknown> {
  return import(/* @vite-ignore */ /* webpackIgnore: true */ specifier);
}

/** 把選用套件缺失轉成看得懂的安裝指引，而不是原始的 MODULE_NOT_FOUND。 */
export async function loadOptional(
  specifier: string,
  usedBy: string,
): Promise<unknown> {
  try {
    return await loadModule(specifier);
  } catch {
    throw new Error(`${usedBy} 需要 ${specifier}，請先安裝：npm i ${specifier}`);
  }
}
