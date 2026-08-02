# 微信小程序静默登录实现

## 🎯 功能说明

用户打开小程序时**自动登录**，无需任何操作，无需填写任何信息。

## ✅ 实现方式

### 1. 小程序启动时自动登录

在 `app.js` 的 `onLaunch` 中：

```javascript
onLaunch() {
  // 1. 尝试从缓存恢复登录状态
  this.restoreLoginState()
  
  // 2. 如果没有登录，自动执行微信登录
  if (!this.isLoggedIn()) {
    this.autoWechatLogin()
  }
}
```

### 2. 静默登录流程

```javascript
async autoWechatLogin() {
  // 1. 获取微信登录 code
  const { code } = await wx.login()
  
  // 2. 调用后端接口（只需要 code）
  const res = await authApi.loginByWechat({ code })
  
  // 3. 保存 token 和用户信息
  this.saveLoginInfo(res.data.token, res.data.userInfo)
}
```

**关键点**：
- ❌ **不需要** `wx.getUserProfile()` 获取用户授权
- ❌ **不需要** 用户点击按钮
- ❌ **不需要** 传递 nickname 和 avatarUrl
- ✅ **只需要** 微信登录 code

### 3. 后端接口适配

后端 `/api/auth/login/wechat` 接口需要：

**请求（简化版）**：
```json
POST /api/auth/login/wechat
{
  "code": "071hLb1w3CwARp2C4N3w3DlQFC1hLb1s"
}
```

**后端处理逻辑**：
```java
@PostMapping("/login/wechat")
public Result<LoginResponse> loginByWechat(@RequestBody WechatLoginRequest request) {
    String code = request.getCode();
    
    // 1. 使用 code 从微信服务器获取 openid 和 session_key
    WechatUserInfo wechatInfo = wechatAuthService.getWechatUserInfo(code);
    
    // 2. 根据 openid 查找或创建用户
    User user = userService.findOrCreateByWechatOpenid(wechatInfo.getOpenid());
    
    // 3. 如果 request 中有 nickname 和 avatarUrl，则更新（兼容性）
    if (request.getNickname() != null) {
        user.setNickname(request.getNickname());
        user.setAvatarUrl(request.getAvatarUrl());
        userService.update(user);
    }
    
    // 4. 生成 token
    String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getUsername());
    
    // 5. 返回登录信息
    return Result.success(buildLoginResponse(token, user, isNewUser));
}
```

## 🔄 完整流程

```
用户打开小程序
    ↓
app.onLaunch() 执行
    ↓
检查本地是否有 token
    ↓
没有 token → 自动执行微信登录
    ↓
wx.login() 获取 code
    ↓
发送到后端 /api/auth/login/wechat
    {
      "code": "微信code"
    }
    ↓
后端用 code 换取 openid
    ↓
根据 openid 创建/查找用户
    ↓
返回 token 和用户信息
    ↓
保存到本地存储
    ↓
用户可以正常使用
```

## 📝 关键代码

### app.js
```javascript
App({
  globalData: {
    token: null,
    userInfo: null,
    apiBaseUrl: 'http://localhost:8080'
  },

  onLaunch() {
    this.restoreLoginState()
    if (!this.isLoggedIn()) {
      this.autoWechatLogin() // 自动登录
    }
  },

  async autoWechatLogin() {
    const { code } = await wx.login()
    const res = await authApi.loginByWechat({ code })
    if (res.code === 200) {
      this.saveLoginInfo(res.data.token, res.data.userInfo)
    }
  }
})
```

### API 接口
```javascript
const authApi = {
  loginByWechat(data) {
    return post('/api/auth/login/wechat', data, false)
  }
}
```

### 请求格式
```javascript
// 前端发送（只需要 code）
{
  "code": "071hLb1w3CwARp2C4N3w3DlQFC1hLb1s"
}

// 后端返回
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "jwt-token",
    "userInfo": {
      "id": "user-id",
      "username": "wechat_xxx",
      "nickname": "微信用户",
      "avatarUrl": null
    }
  }
}
```

## 🎨 用户体验

1. **首次打开小程序**
   - 自动登录（用户无感知）
   - 直接看到正常页面
   - 个人中心显示用户信息

2. **再次打开小程序**
   - 从缓存恢复登录状态
   - 立即可用，无需等待

3. **Token 过期**
   - 请求返回 401
   - 自动清除登录信息
   - 自动重新登录

4. **退出登录**
   - 点击"重新登录"
   - 清除本地数据
   - 自动执行新的登录

## 🔐 安全说明

1. **OpenID 绑定**
   - 每个微信用户有唯一的 openid
   - 后端用 openid 识别用户
   - 无需密码，安全可靠

2. **Session Key**
   - 后端获取的 session_key 可用于解密用户敏感数据
   - 如需获取手机号等信息，可在后续流程中添加

3. **Token 管理**
   - JWT token 存储在本地
   - 请求时自动携带
   - 过期自动刷新

## 📱 测试步骤

1. 删除小程序
2. 重新扫码进入
3. 无需任何操作，自动完成登录
4. 切换到"我的" Tab，查看用户信息
5. 关闭小程序，重新打开，登录状态保持

## 🆚 对比：静默登录 vs 授权登录

| 特性 | 静默登录 | 授权登录 |
|------|---------|---------|
| 用户操作 | 无需操作 | 需要点击按钮 |
| 获取昵称 | ❌ 不能 | ✅ 可以 |
| 获取头像 | ❌ 不能 | ✅ 可以 |
| 获取性别 | ❌ 不能 | ✅ 可以 |
| 用户体验 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 实现难度 | 简单 | 较复杂 |

## ⚠️ 注意事项

1. **昵称和头像**
   - 静默登录无法获取用户昵称和头像
   - 后端可设置默认值："微信用户"
   - 如需真实昵称/头像，可在设置页让用户手动填写

2. **微信限制**
   - `wx.getUserProfile()` 必须由用户主动触发
   - 静默登录不调用此接口，不受限制

3. **后端兼容**
   - nickname 和 avatarUrl 参数改为可选
   - 只有 code 是必需的

## 🎉 优势

1. ✅ **用户体验极佳** - 无需任何操作
2. ✅ **实现简单** - 代码量少
3. ✅ **无需授权** - 不弹出授权窗口
4. ✅ **自动重连** - Token 过期自动刷新

---

**更新时间**: 2026-08-02  
**版本**: v2.0.0  
**状态**: ✅ 静默登录已完成
