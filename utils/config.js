/**
 * 全局配置
 *
 * apiBaseUrl 取值规则：
 * - 开发版（开发者工具本地编译/预览，envVersion = develop）: 优先用 utils/config.local.js 里的 localhost
 * - 体验版 / 正式版（上传后，envVersion = trial / release）: 强制使用生产地址 https://jp-cika.cn
 *
 * 这样本地调试走 localhost，上传后自动切回生产地址，无需手动改代码。
 */

const DEFAULT_API_BASE_URL = 'https://jp-cika.cn'

// 获取小程序运行环境：develop（开发版）/ trial（体验版）/ release（正式版）
function getEnvVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion
  } catch (e) {
    return 'develop'
  }
}

// 加载本地配置（不存在时返回 null）
function loadLocalConfig() {
  try {
    return require('./config.local.js')
  } catch (e) {
    return null
  }
}

const envVersion = getEnvVersion()
const localConfig = loadLocalConfig()

// 只有开发版才使用 localhost；体验版/正式版即使误打包了 config.local.js 也会强制走生产地址
const apiBaseUrl =
  envVersion === 'develop' && localConfig && localConfig.apiBaseUrl
    ? localConfig.apiBaseUrl
    : DEFAULT_API_BASE_URL

module.exports = {
  envVersion,
  apiBaseUrl
}
