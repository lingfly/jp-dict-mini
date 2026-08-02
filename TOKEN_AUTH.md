# Token 认证机制说明

## ✅ 已完成功能

### 1. 自动携带 Token

所有需要认证的接口请求都会自动在 HTTP Header 中添加 token：

```javascript
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2. Token 失效自动处理

当后端返回 401 状态码时：
1. 自动清除本地 token
2. 提示用户"登录已过期，正在重新登录"
3. 自动调用 `app.autoWechatLogin()` 重新登录
4. 登录成功后，**自动重试原请求**

### 3. 接口分类

#### 🔓 **不需要 token 的接口**（needAuth: false）
```javascript
authApi.loginByWechat()      // 微信登录
authApi.sendCode()            // 发送验证码
authApi.register()            // 注册
authApi.loginByPassword()     // 密码登录
authApi.loginByCode()         // 验证码登录
authApi.resetPassword()       // 重置密码
```

#### 🔒 **需要 token 的接口**（needAuth: true，默认）
```javascript
// 词单相关
wordlistApi.getAvailable()
wordlistApi.select()
wordlistApi.getCurrent()
wordlistApi.getDetail()
wordlistApi.getWords()

// 复习相关
reviewApi.getNextWord()
reviewApi.submitReview()
reviewApi.getLearningStatus()
reviewApi.getDueWords()
reviewApi.getNewWords()
reviewApi.selectNewWords()

// 单词相关
wordApi.search()
wordApi.getDetail()

// 音频相关
audioApi.getBase64()

// 用户相关
authApi.getCurrentUser()
authApi.logout()
userApi.getProfile()
userApi.updateProfile()
userApi.getLearningConfig()
userApi.updateLearningConfig()
```

## 🔄 Token 自动续期流程

```
用户调用接口
    ↓
检查 app.globalData.token
    ↓
有 token → 添加到 Header
    {
      "Authorization": "Bearer xxx"
    }
    ↓
发送请求到后端
    ↓
后端验证 token
    ↓
┌─────────────┬─────────────┐
│   token 有效   │   token 失效   │
│   (200)      │   (401)      │
└─────────────┴─────────────┘
      ↓                ↓
   返回数据      清除本地 token
                     ↓
                 自动重新登录
                     ↓
                 获取新 token
                     ↓
                 重试原请求
```

## 📝 使用示例

### 示例 1：查询词单列表
```javascript
// 前端调用（自动携带 token）
const res = await wordlistApi.getAvailable()

// 实际发送的请求
GET /api/wordlist/available
Headers: {
  "Authorization": "Bearer eyJhbGci...",
  "Content-Type": "application/json"
}
```

### 示例 2：提交复习结果
```javascript
// 前端调用（自动携带 token）
const res = await reviewApi.submitReview({
  wordId: "word-123",
  score: 2,
  responseTimeMs: 3000
})

// 实际发送的请求
POST /api/review/submit
Headers: {
  "Authorization": "Bearer eyJhbGci...",
  "Content-Type": "application/json"
}
Body: {
  "wordId": "word-123",
  "score": 2,
  "responseTimeMs": 3000
}
```

### 示例 3：Token 失效自动重试
```javascript
// 用户调用接口
const res = await wordApi.search("ありがとう")

// 流程：
// 1. 发送请求（带旧 token）
// 2. 后端返回 401
// 3. 前端自动重新登录
// 4. 获取新 token
// 5. 自动重试搜索请求
// 6. 返回搜索结果

// 用户无感知，就像正常请求一样
```

## 🔧 后端配置要求

### 1. 接收 Authorization Header

```java
@GetMapping("/api/wordlist/available")
public Result<List<WordList>> getAvailable(@RequestHeader("Authorization") String token) {
    // 解析 token
    String jwtToken = token.replace("Bearer ", "");
    
    // 验证 token
    Claims claims = jwtUtil.parseToken(jwtToken);
    String userId = claims.get("userId", String.class);
    
    // 查询数据
    // ...
}
```

### 2. 使用拦截器自动解析（推荐）

```java
@Component
public class JwtInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, 
                           HttpServletResponse response, 
                           Object handler) {
        String token = request.getHeader("Authorization");
        
        if (token != null && token.startsWith("Bearer ")) {
            String jwtToken = token.substring(7);
            
            try {
                Claims claims = jwtUtil.parseToken(jwtToken);
                String userId = claims.get("userId", String.class);
                
                // 将用户信息存入 ThreadLocal
                UserContext.set(userId);
                return true;
            } catch (Exception e) {
                response.setStatus(401);
                return false;
            }
        }
        
        response.setStatus(401);
        return false;
    }
}
```

### 3. 配置拦截器路径

```java
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {
    @Resource
    private JwtInterceptor jwtInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(jwtInterceptor)
            .addPathPatterns("/api/**")
            .excludePathPatterns(
                "/api/auth/login/**",      // 登录接口
                "/api/auth/register",      // 注册接口
                "/api/auth/send-code",     // 发送验证码
                "/api/auth/reset-password" // 重置密码
            );
    }
}
```

## 🔐 安全说明

### 1. Token 存储
- 存储位置：`wx.setStorageSync('token', token)`
- 类型：JWT token
- 过期时间：后端配置（建议 7 天）

### 2. Token 格式
```
Authorization: Bearer <token>
```

### 3. Token 内容（JWT）
```json
{
  "userId": "user-123",
  "email": "user@example.com",
  "username": "wechat_xxx",
  "iat": 1627891234,
  "exp": 1628496034
}
```

### 4. 安全建议
- ✅ 使用 HTTPS 传输
- ✅ Token 过期时间不要太长
- ✅ 敏感操作需要二次验证
- ✅ 退出登录时清除本地 token

## 📱 测试方法

### 1. 正常请求测试
```javascript
// 在任意页面调用
const res = await wordlistApi.getAvailable()
console.log('请求结果:', res)

// 查看控制台，应该看到：
// "请求携带 token: /api/wordlist/available"
// "请求成功: /api/wordlist/available 200"
```

### 2. Token 失效测试
```javascript
// 手动清除 token
app.globalData.token = 'invalid-token'

// 调用接口
const res = await wordlistApi.getAvailable()

// 应该看到：
// "token 已失效，重新登录"
// "重新登录成功，重试请求"
// 最终返回正常数据
```

### 3. 网络请求查看
在微信开发者工具中：
1. 打开"调试器"
2. 切换到"Network"标签
3. 调用任意接口
4. 查看请求头，应该包含：
   ```
   Authorization: Bearer eyJhbGci...
   ```

## 🎯 核心代码

### request.js 关键逻辑
```javascript
// 自动添加 token
if (needAuth && app.globalData.token) {
  header['Authorization'] = `Bearer ${app.globalData.token}`
}

// 401 自动重新登录并重试
if (res.statusCode === 401) {
  app.clearLoginInfo()
  app.autoWechatLogin().then(() => {
    request(url, method, data, needAuth).then(resolve).catch(reject)
  })
}
```

### api.js 接口配置
```javascript
// 需要 token 的接口（默认）
getAvailable() {
  return get('/api/wordlist/available') // needAuth 默认为 true
}

// 不需要 token 的接口
loginByWechat(data) {
  return post('/api/auth/login/wechat', data, false) // needAuth 设为 false
}
```

---

**更新时间**: 2026-08-02  
**版本**: v3.0.0  
**状态**: ✅ Token 认证已完成
