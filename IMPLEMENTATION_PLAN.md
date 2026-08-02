# 小程序完整实现计划

## 当前状态

### ✅ 已完成的页面
1. **home** - 查词页面（首页）
2. **wordlist** - 词单列表页
3. **learn** - 学习页

### 📝 需要创建的页面

#### 核心功能页面（优先级最高）
4. **wordlist-detail** - 词单详情页
5. **word-detail** - 单词详情页
6. **review-list** - 复习列表页
7. **review-learn** - 复习学习页
8. **new-learn** - 新词学习页

#### 辅助功能页面
9. **select-words** - 选择新词页
10. **profile** - 个人中心
11. **settings** - 设置页
12. **login** - 登录页
13. **reset-password** - 重置密码页

## Web 版与小程序版对应关系

| Web 版页面 | 小程序页面 | 路由 | 说明 |
|-----------|-----------|------|------|
| Home.vue (查词) | home | pages/home/home | 查词功能，首页 |
| WordListPage.vue | wordlist | pages/wordlist/wordlist | 词单列表 |
| WordListDetailPage.vue | wordlist-detail | pages/wordlist-detail/wordlist-detail | 词单详情 |
| WordDetailPage.vue | word-detail | pages/word-detail/word-detail | 单词详情 |
| ReviewListPage.vue | review-list | pages/review-list/review-list | 复习列表 |
| LearnPage.vue | learn | pages/learn/learn | 实时学习页 |
| ReviewLearnPage.vue | review-learn | pages/review-learn/review-learn | 复习学习 |
| NewLearnWordPage.vue | new-learn | pages/new-learn/new-learn | 新词学习 |
| NewLearnPage.vue | select-words | pages/select-words/select-words | 选择新词 |
| ProfilePage.vue | profile | pages/profile/profile | 个人中心 |
| SettingsPage.vue | settings | pages/settings/settings | 设置 |
| LoginPage.vue | login | pages/login/login | 登录/注册 |
| ResetPasswordPage.vue | reset-password | pages/reset-password/reset-password | 重置密码 |

## TabBar 配置

小程序使用底部 TabBar 导航：
- 查词 (home)
- 词单 (wordlist) 
- 复习 (review-list)
- 我的 (profile)

## API 对应关系

### 已实现的 API
- ✅ wordlistApi.getAvailable()
- ✅ wordlistApi.select()
- ✅ wordlistApi.getCurrent()
- ✅ reviewApi.getNextWord()
- ✅ reviewApi.submitReview()
- ✅ reviewApi.getLearningStatus()
- ✅ wordApi.getDetail()

### 需要补充的 API
- wordApi.search() - 搜索单词
- audioApi.getBase64() - 获取音频
- wordlistApi.getDetail() - 词单详情
- wordlistApi.getWords() - 词单单词列表
- reviewApi.getDueWords() - 待复习单词
- authApi - 登录认证相关

## 下一步实现顺序

1. **补充 API 接口** (utils/api.js)
2. **词单详情页** (wordlist-detail)
3. **单词详情页** (word-detail)
4. **复习列表页** (review-list)
5. **个人中心页** (profile)
6. **登录页** (login)
7. **其他辅助页面**

## 技术要点

### 小程序特殊处理
- 使用 `wx.navigateTo` 代替 Vue Router
- 使用 `wx.switchTab` 切换 TabBar 页面
- 使用小程序原生组件代替 Element Plus
- 音频播放使用 `wx.createInnerAudioContext`
- 无限滚动需要自行实现

### 样式适配
- 使用 rpx 单位进行响应式设计
- TabBar 高度需要考虑
- 安全区域适配（iPhone X 等）

### 状态管理
- 页面级数据使用 Page.data
- 全局数据存储在 app.js globalData
- 用户信息、token 使用 wx.setStorageSync

## 预计工作量

- **核心功能页面**: 4-6 小时
- **辅助功能页面**: 3-4 小时  
- **API 补充和联调**: 2-3 小时
- **样式优化和测试**: 2-3 小时

**总计**: 11-16 小时

## 当前进度

- [x] 项目结构搭建
- [x] TabBar 配置
- [x] 首页（查词功能）
- [x] 词单列表
- [x] 学习页
- [ ] 词单详情页（待实现）
- [ ] 单词详情页（待实现）
- [ ] 复习列表页（待实现）
- [ ] 个人中心（待实现）
- [ ] 登录页（待实现）
- [ ] 其他页面（待实现）
