/**
 * 全局配置
 *
 * apiBaseUrl 取值优先级：
 * 1. 本地调试配置 utils/config.local.js（已加入 .gitignore，不会提交到仓库）
 * 2. 默认生产地址
 *
 * 本地调试步骤：
 * 1. 复制 utils/config.local.example.js 并重命名为 config.local.js
 * 2. 将 apiBaseUrl 改成你本地的后端地址（默认 http://localhost:8080）
 * 3. 微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」
 */

const DEFAULT_API_BASE_URL = 'https://jp-cika.cn'

function loadLocalConfig() {
  try {
    return require('./config.local.js')
  } catch (e) {
    // 本地配置文件不存在时，使用默认生产地址
    return null
  }
}

const localConfig = loadLocalConfig()

module.exports = {
  apiBaseUrl: (localConfig && localConfig.apiBaseUrl) || DEFAULT_API_BASE_URL
}
