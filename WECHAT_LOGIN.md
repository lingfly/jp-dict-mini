# 微信登录功能实现说明

## ✅ 已完成

### 1. 登录页面 (pages/login)
- **微信一键登录按钮**
  - 调用 `wx.getUserProfile()` 获取用户授权
  - 调用 `wx.login()` 获取登录 code
  - 发送 code + 用户信息到后端 `/api/auth/login/wechat`
  - 接收 token 并保存到本地
  
- **游客模式**
  - 跳过登录，直接进入应用（无法保存进度）

- **美观的 UI 设计**
  - 渐变背景
  - 功能介绍图标
  - 隐私政策提示

### 2. 个人中心页面 (pages/profile)
- **未登录状态**
  - 显示登录提示
  - "立即登录"按钮跳转到登录页

- **已登录状态**
  - 显示用户头像和昵称
  - 学习统计（总单词、已学习、已掌握、待复习）
  - 设置入口
  - 退出登录功能

### 3. 全局登录状态管理 (app.js)
- `restoreLoginState()` - 从缓存恢复登录状态
- `saveLoginInfo(token, userInfo)` - 保存登录信息
- `clearLoginInfo()` - 清除登录信息
- `isLoggedIn()` - 检查是否已登录

### 4. API 接口 (utils/api.js)
- `authApi.loginByWechat(data)` - 微信登录接口
- `authApi.getCurrentUser()` - 获取当前用户信息
- `authApi.logout()` - 退出登录

### 5. 请求拦截器 (utils/request.js)
- 自动添加 Authorization token
- 401 状态码自动清除登录并跳转登录页
- 统一错误处理

## 🔧 使用方式

### 微信登录流程

```javascript
// 1. 用户点击"微信一键登录"按钮
handleWechatLogin()

// 2. 获取用户授权信息
const userProfile = await wx.getUserProfile({
  desc: '用于完善用户资料'
})

// 3. 获取微信登录 code
const { code } = await wx.login()

// 4. 调用后端接口
const res = await authApi.loginByWechat({
  code: code,
  nickname: userProfile.nickName,
  avatarUrl: userProfile.avatarUrl
})

// 5. 保存 token 和用户信息
app.saveLoginInfo(res.data.token, res.data.userInfo)

// 6. 跳转到首页
wx.switchTab({ url: '/pages/home/home' })
```

### 后端接口格式

**请求**:
```json
POST /api/auth/login/wechat
{
  "code": "微信登录code",
  "nickname": "用户昵称",
  "avatarUrl": "头像URL"
}
```

**响应**:
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "jwt-token",
    "tokenType": "Bearer",
    "expiresIn": 604800,
    "isNewUser": false,
    "userInfo": {
      "id": "user-id",
      "username": "用户名",
      "nickname": "昵称",
      "email": "邮箱",
      "avatarUrl": "头像URL",
      "status": "active"
    }
  }
}
```

## 📝 配置说明

### 1. 修改 API 地址
在 `app.js` 中修改：
```javascript
globalData: {
  apiBaseUrl: 'https://your-api-domain.com' // 改为你的后端地址
}
```

### 2. 微信小程序配置
在微信公众平台后台配置：
- **服务器域名** - 添加你的 API 域名到 request 合法域名
- **AppID 和 AppSecret** - 后端需要配置用于验证登录 code

### 3. 后端配置
确保后端 `/api/auth/login/wechat` 接口实现了：
- 使用 code 从微信服务器换取 openid 和 session_key
- 根据 openid 查找或创建用户
- 生成 JWT token
- 返回用户信息

## 🎯 功能特点

### 1. 无感登录
- 自动从缓存恢复登录状态
- token 失效自动跳转登录页

### 2. 游客模式
- 支持不登录直接使用
- 游客模式下无法保存学习进度

### 3. Token 自动续期
- 每次请求自动携带 token
- token 失效自动清除并提示登录

### 4. 用户体验优化
- 登录过程中显示 loading 状态
- 登录成功/失败都有明确提示
- 新用户显示"注册成功"，老用户显示"登录成功"

## 🔐 安全说明

1. **token 存储** - 使用 `wx.setStorageSync` 本地存储
2. **HTTPS** - 生产环境必须使用 HTTPS
3. **token 过期** - 后端返回 401 时自动清除登录状态
4. **敏感信息** - 不在前端存储密码等敏感信息

## 📱 测试步骤

1. 在微信开发者工具中打开项目
2. 切换到"我的" Tab
3. 点击"立即登录"
4. 点击"微信一键登录"
5. 授权用户信息
6. 登录成功，查看用户信息和学习统计

## 🐛 常见问题

### 1. 获取用户信息失败
- 确保小程序已经上线或在体验版
- `wx.getUserProfile` 只能由用户主动触发（button bindtap）

### 2. 登录失败
- 检查后端 API 地址是否正确
- 检查微信开发者工具是否勾选"不校验合法域名"
- 检查后端是否正确配置了 AppID 和 AppSecret

### 3. token 失效
- 检查后端 token 过期时间设置
- 确保请求头正确添加了 Authorization

---

**完成时间**: 2026-08-02  
**版本**: v1.0.0  
**状态**: ✅ 可用
