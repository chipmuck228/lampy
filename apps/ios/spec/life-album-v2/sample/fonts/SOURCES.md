# 评审样本字体（不用于运行App）

上游notofonts/noto-cjk，SIL Open Font License1.1；完整文本见OFL-Serif.txt和OFL-Sans.txt。下载于2026-10-12，来源与本地派生SHA256见hashes.json。

- Serif: https://raw.githubusercontent.com/notofonts/noto-cjk/main/Serif/OTF/SimplifiedChinese/NotoSerifCJKsc-Regular.otf
- Sans: https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
- LICENSE: 对应Serif/LICENSE与Sans/LICENSE。

使用FontTools按repertoire.txt字符集subset，关闭时间戳重算，并将family/full/PostScript names改为Album Study Serif/Sans，保存OTF。repertoire包含本稿、样本正文／界面和ASCII；不是面向任意内容的生产字体包。许可继续适用，不出售字体本身。

首次引导原Noto SC子集仅含少量字，不能用来声称完整中文可排。本候选已覆盖当前合成文字；生产需批准真实字体／覆盖策略、许可、字体嵌入、包体积和emoji。
