# 截图清单

设备：iPhone 16 Simulator（iOS 18.6）、iPad Pro 11-inch M4 Simulator（iOS 18.6）
构建：Expo development build `app.lampy.ios`，Metro `127.0.0.1:8081`
SHA：见本 PR head（提交本清单的那次 commit）
家庭入口按现有 URL 配置显示，未为截图改开关。

| 文件 | 设备 / 系统 | 页面状态 | 结果 |
| --- | --- | --- | --- |
| `app/recent-iphone-regular.png` | iPhone 16 / iOS 18.6 / 常规字号 | 最近：同日声音 + 文字 + 真实花田照片 | **PASS**（模拟器） |
| `app/recent-iphone-ax.png` | iPhone 16 / accessibility-extra-large | 最近：标题 / 家庭·回看 / 留下分列 | **PASS**（模拟器） |
| `app/leave-iphone-keyboard.png` | iPhone 16 / 软件键盘 | 留下：正在编「审阅句 1101」，拍摄/照片/留下在键盘上沿 | **PASS**（模拟器） |
| `app/recent-iphone-landscape.png` | iPhone 16 / 横屏 | 最近：短高度，无日期轨，内容可滚 | **PASS**（模拟器） |
| `app/recent-ipad.png` | iPad Pro 11 / iOS 18.6 | 最近：日期轨「9月27日」+ 正文「门口的风。」未挤窄 | **PASS**（模拟器） |
| `app/recent-ipad-empty.png` | iPad Pro 11 | 首次空白，正文未拉满 | **PASS**（模拟器） |
| `app/walk-recent.png` | iPhone 16 | 留下→输入→保存后的最近，见「审阅句 1101」 | **PASS**（模拟器） |
| `app/walk-detail.png` | iPhone 16 | 点开该条，详情即「审阅句 1101」，不是相邻记录 | **PASS**（模拟器） |
| 真机 Liuz17 同一路径 | iPhone | 未走完 | **NOT VERIFIED** |

上一轮对照图仍保留（`recent-empty.png` 等）。同一张拼图见 `../compare.html`，原始截图以本表为准。
模拟器结果不得写成真机 PASS。
