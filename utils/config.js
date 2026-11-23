/**
 * 全局配置
 *
 * ⚠️ 关于「提交审核」（重要，踩过坑）：
 * 官方文档对 envVersion = develop 的说明是「开发版，提交代码审核时默认使用开发版进行审核」，
 * 也就是说**审核期间的 envVersion 仍是 develop**。因此不能只用 envVersion === 'develop'
 * 来判断"本地调试"，否则审核版会去读 utils/config.local.js 里的局域网地址
 * （如 http://192.168.2.6:8080），审核人员不在你内网，所有请求必然失败 → 登录失败、
 * 全站弹「网络错误」。
 *
 * 所以这里额外用 platform === 'devtools' 判断是否运行在开发者工具内：
 * - 只在开发者工具（develop + devtools）时才使用 config.local.js 的本地地址；
 * - 真机上的 develop（预览 / 真机调试 / **提交审核的审核版**）与体验版一样走线上测试地址；
 * - 正式版走线上生产地址。
 *
 * apiBaseUrl 取值规则：
 * - 开发者工具且存在 utils/config.local.js：使用其中的本地地址
 * - 真机 develop（预览/真机调试/审核版）、体验版（trial）：使用测试地址 https://jp-cika.cn/test-api
 * - 正式版（release）：使用生产地址 https://jp-cika.cn
 *
 * ⚠️ 不要把 utils/config.local.js 加进 project.config.json 的 packOptions.ignore：
 * 开发者工具在编译阶段就会剔除被 ignore 的文件，工具内 require 必然失败、又被下面的
 * loadLocalConfig 吞掉 → 本地地址「静默失效」，回落到测试地址且毫无提示。
 * 这个坑踩过两次：9ababec 把它删掉、befa90b 又加回来。
 * 防「审核版误连本地」靠的是下面的 platform === 'devtools' 判断，不靠 ignore。
 */

const DEFAULT_API_BASE_URL = 'https://jp-cika.cn'
const TEST_API_BASE_URL = 'https://jp-cika.cn/test-api'

// 获取小程序运行环境：develop（开发版，含提交审核期间）/ trial（体验版）/ release（正式版）
function getEnvVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || 'develop'
  } catch (e) {
    return 'develop'
  }
}

// 获取运行平台：devtools（开发者工具）/ ios / android / windows / mac ...
function getPlatform() {
  try {
    if (wx.getDeviceInfo) {
      return wx.getDeviceInfo().platform || ''
    }
    return wx.getSystemInfoSync().platform || ''
  } catch (e) {
    return ''
  }
}

// 是否运行在开发者工具内（只有工具内才允许连本地后端）
function isDevtoolsRuntime() {
  return getPlatform() === 'devtools'
}

// 加载本地配置（不存在时返回 null）
// 只在开发者工具内调用，所以失败时留一行日志：否则本地地址会静默失效、很难排查
function loadLocalConfig() {
  try {
    return require('./config.local.js')
  } catch (e) {
    console.warn('[config] config.local.js 未加载，回落到线上地址:', (e && e.message) || e)
    return null
  }
}

const envVersion = getEnvVersion()
const devtoolsRuntime = isDevtoolsRuntime()
// 仅开发者工具内才读取本地配置，避免真机（含审核版）误连局域网地址
const localConfig = devtoolsRuntime ? loadLocalConfig() : null

// 根据运行环境选择 API 地址
let apiBaseUrl
if (localConfig && localConfig.apiBaseUrl) {
  // 开发者工具：使用本地后端
  apiBaseUrl = localConfig.apiBaseUrl
} else if (envVersion === 'release') {
  // 正式版：使用生产地址
  apiBaseUrl = DEFAULT_API_BASE_URL
} else {
  // 真机开发版（预览/真机调试/审核版）、体验版：使用测试地址
  apiBaseUrl = TEST_API_BASE_URL
}

module.exports = {
  envVersion,
  devtoolsRuntime,
  apiBaseUrl
}
