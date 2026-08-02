# 日语词典小程序

完整实现 Web 版所有功能的微信小程序版本。

## 项目概述

基于微信小程序开发的日语词典应用，提供查词、词单管理、科学记忆复习等完整功能。

## 功能特性

### 核心功能
- 🔍 **查词功能** - 支持日语单词搜索，显示详细释义、例句、音频
- 📚 **词单管理** - 浏览词单、查看词单详情、选择学习词单
- 📖 **科学复习** - SM-2 算法，实时查询下一个单词
- ✨ **新词学习** - 从词单选择新词加入学习计划
- 📊 **学习统计** - 今日复习数、已掌握数、剩余数
- 👤 **个人中心** - 用户信息、学习统计、设置

### 学习功能
- 三级评分系统（忘记/模糊/认识）
- 短间隔复习支持
- 学习进度跟踪
- 单词类型标签

## 技术栈

- **平台**: 微信小程序
- **开发语言**: JavaScript
- **UI**: 原生小程序组件
- **状态管理**: 页面级 + 全局 globalData
- **网络请求**: wx.request 封装

## 项目结构

```
jp-dict-mini-test/
├── pages/                      # 页面目录
│   ├── home/                   # 查词首页
│   ├── wordlist/               # 词单列表
│   ├── wordlist-detail/        # 词单详情
│   ├── word-detail/            # 单词详情
│   ├── review-list/            # 复习列表
│   ├── learn/                  # 学习页（实时）
│   ├── review-learn/           # 复习学习页
│   ├── new-learn/              # 新词学习页
│   ├── select-words/           # 选择新词
│   ├── profile/                # 个人中心
│   ├── settings/               # 设置
│   ├── login/                  # 登录/注册
│   └── reset-password/         # 重置密码
├── utils/                      # 工具函数
│   ├── request.js              # 网络请求封装
│   └── api.js                  # API 接口定义
├── app.js                      # 小程序入口
├── app.json                    # 全局配置
├── app.wxss                    # 全局样式
├── project.config.json         # 项目配置
└── README.md                   # 项目说明
```

## 页面说明

### TabBar 页面

#### 1. 查词 (home)
- 搜索框输入日语单词
- 显示搜索结果列表
- 点击查看单词详情
- 支持音频播放
- 最近搜索记录

#### 2. 词单 (wordlist)
- 显示所有可用词单
- 词单详情（名称、描述、单词数）
- 选择/切换当前学习词单
- 高亮显示当前词单

#### 3. 复习 (review-list)
- 显示待复习单词列表
- 支持分页加载
- 点击单词查看详情
- 开始复习按钮

#### 4. 我的 (profile)
- 用户信息
- 学习统计数据
- 设置入口
- 登录/登出

### 功能页面

#### 5. 词单详情 (wordlist-detail)
- 词单基本信息
- 学习进度条
- 完整单词列表（无限滚动）
- 选择词单按钮
- 选词功能入口

#### 6. 单词详情 (word-detail)
- 单词信息（汉字、假名、音调）
- 词性、JLPT 等级标签
- 多个释义
- 例句展示
- 学习进度（如已学习）
- 音频播放
- 加入词单/复习

#### 7. 学习页 (learn)
- 实时获取下一个单词
- 显示学习进度
- 单词类型标签
- 显示/隐藏答案
- 三级评分按钮
- 完成提示

#### 8. 复习学习 (review-learn)
- 专门的复习学习流程
- 与 learn 页面类似
- 针对复习单词

#### 9. 新词学习 (new-learn)
- 新词学习流程
- 首次学习的单词

#### 10. 选择新词 (select-words)
- 从当前词单选择新词
- 批量选择
- 加入学习计划

#### 11. 设置 (settings)
- 每日新词数量
- 学习提醒
- 其他偏好设置

#### 12. 登录 (login)
- 密码登录
- 验证码登录
- 注册账号
- 切换登录/注册模式

#### 13. 重置密码 (reset-password)
- 邮箱验证
- 重置密码

## API 接口

### 词单相关
```javascript
wordlistApi.getAvailable(userId)      // 获取可用词单
wordlistApi.select(userId, wordListId) // 选择词单
wordlistApi.getCurrent(userId)        // 获取当前词单
wordlistApi.getDetail(wordListId)     // 词单详情
wordlistApi.getWords(wordListId, page, size) // 词单单词列表
```

### 复习相关
```javascript
reviewApi.getNextWord()               // 获取下一个单词（实时）
reviewApi.submitReview(data)          // 提交复习结果
reviewApi.getLearningStatus()         // 获取学习状态
reviewApi.getDueWords(page, size)     // 获取待复习单词
reviewApi.getNewWords(limit)          // 获取新词
reviewApi.selectNewWords(wordIds)     // 选择新词
```

### 单词相关
```javascript
wordApi.search(keyword)               // 搜索单词
wordApi.getDetail(wordId)             // 单词详情
```

### 音频相关
```javascript
audioApi.getBase64(audioId)           // 获取音频 Base64
```

### 认证相关
```javascript
authApi.sendCode(data)                // 发送验证码
authApi.register(data)                // 注册
authApi.loginByPassword(data)         // 密码登录
authApi.loginByCode(data)             // 验证码登录
authApi.resetPassword(data)           // 重置密码
authApi.logout()                      // 登出
```

### 用户相关
```javascript
userApi.getProfile()                  // 获取用户信息
userApi.updateProfile(data)           // 更新用户信息
userApi.getLearningConfig()           // 获取学习配置
userApi.updateLearningConfig(data)    // 更新学习配置
```

## 快速开始

### 1. 配置项目

修改 `project.config.json`:
```json
{
  "appid": "your-appid"
}
```

修改 `app.js`:
```javascript
App({
  globalData: {
    userId: 1,
    apiBaseUrl: 'http://your-api-domain' // 修改为你的后端地址
  }
})
```

### 2. 导入项目

1. 打开微信开发者工具
2. 选择"导入项目"
3. 选择项目根目录
4. 填写 AppID
5. 点击"导入"

### 3. 本地开发

1. 确保后端服务已启动
2. 在"详情" → "本地设置"中勾选"不校验合法域名"
3. 点击"编译"运行

### 4. 真机调试

1. 点击"预览"生成二维码
2. 使用微信扫描
3. 在手机上查看效果

## 与 Web 版对应关系

| Web 版 | 小程序版 | 功能 |
|--------|---------|------|
| Home.vue | home | 查词 |
| WordListPage.vue | wordlist | 词单列表 |
| WordListDetailPage.vue | wordlist-detail | 词单详情 |
| WordDetailPage.vue | word-detail | 单词详情 |
| ReviewListPage.vue | review-list | 复习列表 |
| LearnPage.vue | learn | 实时学习 |
| ReviewLearnPage.vue | review-learn | 复习学习 |
| NewLearnWordPage.vue | new-learn | 新词学习 |
| NewLearnPage.vue | select-words | 选择新词 |
| ProfilePage.vue | profile | 个人中心 |
| SettingsPage.vue | settings | 设置 |
| LoginPage.vue | login | 登录/注册 |
| ResetPasswordPage.vue | reset-password | 重置密码 |

## 开发状态

### ✅ 已完成
- [x] 项目架构搭建
- [x] TabBar 配置
- [x] API 接口封装
- [x] 查词页面（home）
- [x] 词单列表（wordlist）
- [x] 学习页（learn）

### 🚧 进行中
- [ ] 词单详情页
- [ ] 单词详情页
- [ ] 复习列表页
- [ ] 个人中心
- [ ] 登录页

### 📋 待开发
- [ ] 复习学习页
- [ ] 新词学习页
- [ ] 选择新词页
- [ ] 设置页
- [ ] 重置密码页

## 技术要点

### 小程序特性
- 使用 `wx.navigateTo` 进行页面跳转
- TabBar 页面使用 `wx.switchTab`
- 音频使用 `wx.createInnerAudioContext`
- 数据缓存使用 `wx.setStorageSync`

### 样式规范
- 主色调: #5B8C7D（绿色）
- 成功色: #2F5D50（深绿）
- 警告色: #E6A23C（黄色）
- 危险色: #F56C6C（红色）
- 卡片圆角: 8-12rpx
- 间距: 8, 12, 16, 24, 32rpx

### 性能优化
- 列表使用分页加载
- 图片懒加载
- 合理使用缓存
- 避免频繁 setData

## 开发团队

**开发时间**: 2026-08-02  
**版本**: v1.0.0  
**开发工具**: Kiro AI

## 许可证

本项目仅供学习交流使用。
