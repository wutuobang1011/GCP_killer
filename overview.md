# 交付总览 — PCA 刷题助手

## 做了什么

把 `Professional Cloud Architect_aizh.pdf`（550 页 / 18.8MB）解析成结构化题库，并构建了一个纯前端刷题 Web 应用。

- **题库数据**：359 道题，12 个 Topic，字段含「英文题干 / 英文选项 / 正确答案 / 中文 AI 解析 / 案例背景」
- **应用**：单页 Web 应用，无需后端，可直接双击打开或访问在线链接

## 关键实现

1. **PDF 解析**（Python + pypdf）
   - 按 `Topic X Question #N` 切块 → 识别选项区间（首个 `A.` 起始的连续 A–F 序列）→ 解析段落起始标记切分「题目+选项」与「解析」
   - 清理页脚水印、还原被换行拆断的句子（按中英文分别重排段落）
   - 案例题：把内嵌的超长案例正文从题干中剥离，按 `caseStudies` 共享存储
   - 剔除 1 道纯图片题（Topic 8 #1，选项为架构图），最终 359 题

2. **前端应用**（原生 JS，零依赖）
   - 随机模拟考（100/50/20/全部）、按 Topic 练习、错题本重练
   - 单选 / 多选（自动识别 Choose N）、提交判分、答错自动展开中文解析
   - 案例背景弹窗、可选「显示中文翻译」、进度计时
   - 每题「纠错」编辑（题干/选项/答案），改动存 localStorage
   - 统计与错题本持久化

## 验证结果（Chrome headless 端到端）

```
HOME  topics=12 total=359
PRACTICE 1 / 20
FEEDBACK 回答错误 ✗ 正确答案：C 你的选择：D | 解析 1170 字
RESULT visible=true pct=20%
CORRECT flow: feedbackHidden=true analysisBtnShown=true
MULTI question: 6 options  ✓
CASE modal: "Altostrat Media" 6167 chars  ✓
CN TOGGLE: question CnVisible=true ✓
NO ERRORS
```

覆盖：首页渲染、抽题、单选/多选判分、中文解析（对/错两种路径）、结果页与错题回顾、案例弹窗、中英切换、纠错编辑与恢复、统计持久化。无 JS 报错。

## 交付物

| 文件 | 说明 |
| --- | --- |
| `pca-quiz/index.html` | 应用入口 |
| `pca-quiz/styles.css` | 样式（响应式） |
| `pca-quiz/app.js` | 逻辑 |
| `pca-quiz/data/bank.js` | 题库数据（1.6MB） |
| `pca-quiz/README.md` | 使用说明 |

- 在线地址：https://7975754a86a24e0e819c59b44a0e9658.app.workbuddy.host

## 已知限制

- Topic 9/10（TerramEarth）、Topic 6（Mountkirk Games）等案例题仅提示案例名称，案例正文不在该 PDF 内
- 极少数题目官方答案存在争议，已保留社区投票与 AI 解析原文
- 数据存于 localStorage，换浏览器/清缓存会重置
