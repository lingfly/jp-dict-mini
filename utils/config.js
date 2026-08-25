/**
 * 全局配置
 *
 * apiBaseUrl 取值规则：
 * - 开发版（开发者工具本地编译/预览，envVersion = develop）: 优先用 utils/config.local.js 里的 localhost
 * - 体验版（上传后，envVersion = trial）: 使用测试地址 https://jp-cika.cn/test-api
 * - 正式版（上传后，envVersion = release）: 使用生产地址 https://jp-cika.cn
 *
 * 这样本地调试走 localhost，体验版走测试环境，正式版走生产环境，无需手动改代码。
 */

const DEFAULT_API_BASE_URL = 'https://jp-cika.cn'
const TEST_API_BASE_URL = 'https://jp-cika.cn/test-api'

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

// 根据环境版本选择 API 地址
let apiBaseUrl
if (envVersion === 'develop' && localConfig && localConfig.apiBaseUrl) {
  // 开发版：使用 localhost
  apiBaseUrl = localConfig.apiBaseUrl
} else if (envVersion === 'trial') {
  // 体验版：使用测试地址
  apiBaseUrl = TEST_API_BASE_URL
} else {
  // 正式版：使用生产地址
  apiBaseUrl = DEFAULT_API_BASE_URL
}

module.exports = {
  envVersion,
  apiBaseUrl
}
