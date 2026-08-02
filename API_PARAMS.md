# API 参数修正说明

## 修正内容

### 单词搜索接口参数

**接口**: `/api/word/search`

**修正前**:
```javascript
GET /api/word/search?keyword=ありがとう
```

**修正后**:
```javascript
GET /api/word/search?key=ありがとう
```

## 代码修改

### utils/api.js
```javascript
const wordApi = {
  // 搜索单词
  search(keyword) {
    return get('/api/word/search', { key: keyword }) // 参数名改为 key
  }
}
```

### 调用方式（无需修改）
```javascript
// 前端调用方式保持不变
const res = await wordApi.search('ありがとう')

// 实际发送的请求
GET /api/word/search?key=ありがとう
Headers: {
  "Authorization": "Bearer xxx"
}
```

## 其他接口参数确认

### 词单相关
```javascript
// 获取可用词单
GET /api/wordlist/available

// 选择词单
POST /api/wordlist/select
Body: { userId, wordListId }

// 获取当前词单
GET /api/wordlist/current

// 获取词单详情
GET /api/wordlist/{wordListId}

// 获取词单单词列表
GET /api/wordlist/{wordListId}/words?page=1&size=30
```

### 复习相关
```javascript
// 获取下一个单词
GET /api/review/next-word

// 提交复习结果
POST /api/review/submit
Body: { wordId, score, responseTimeMs }

// 获取学习状态
GET /api/review/learning-status

// 获取待复习单词
GET /api/review/due?page=1&size=50

// 获取新词
GET /api/review/new?limit=20

// 选择新词
POST /api/review/select-new-words
Body: { wordIds: [] }
```

### 单词相关
```javascript
// 搜索单词 ✅ 已修正
GET /api/word/search?key=ありがとう

// 获取单词详情
GET /api/word/detail/{wordId}
```

### 音频相关
```javascript
// 获取音频 Base64
GET /api/audio/base64/{audioId}
```

### 认证相关
```javascript
// 微信登录
POST /api/auth/login/wechat
Body: { code }

// 获取当前用户
GET /api/auth/current-user

// 登出
POST /api/auth/logout
```

## 测试

### 搜索接口测试
```javascript
// 在小程序中调用
const res = await wordApi.search('ありがとう')

// 查看网络请求（微信开发者工具 Network 面板）
// 应该看到：
// GET /api/word/search?key=ありがとう
// Authorization: Bearer xxx
```

---

**更新时间**: 2026-08-02  
**版本**: v3.0.1  
**状态**: ✅ 参数已修正
