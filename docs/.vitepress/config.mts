// docs/.vitepress/config.mts
import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'

// 获取 sidebar 配置
function getSidebarConfig() {
  const sidebarPath = path.resolve(__dirname, 'sidebar.gen.json')

  if (fs.existsSync(sidebarPath)) {
    try {
      return JSON.parse(fs.readFileSync(sidebarPath, 'utf-8'))
    } catch (err) {
      console.warn('解析 sidebar.gen.json 失败:', err)
    }
  } else {
    console.warn('找不到 sidebar.gen.json，使用默认配置')
  }
  return [{ link: '/', text: '返回 偶活舞台：闪耀手册主页' }]
}

export default defineConfig({
  title: '偶活舞台：闪耀手册',
  description: '用这本手册更好地进行偶像活动吧！',
  lang: 'zh-CN',
  lastUpdated: true,
  themeConfig: {
    docFooter: { prev: '上一页', next: '下一页' },
    outline: { label: '本页目录' },
    returnToTopLabel: '返回顶部',
    sidebar: getSidebarConfig(),
    sidebarMenuLabel: '目录',
    darkModeSwitchLabel: '切换明暗',
    lastUpdated: { text: '上次更新' },
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索全文', buttonAriaLabel: '搜索全文' },
          modal: {
            noResultsText: '没有结果',
            resetButtonTitle: '清空',
            footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' }
          }
        }
      }
    }
  }
})
