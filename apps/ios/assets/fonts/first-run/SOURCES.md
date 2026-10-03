# 首次引导随包字体

只给首次三屏引导用。不在运行时下载，不替换 App 其余界面的字体。

从 Google Fonts 按本轮引导文案做了字符子集，再转成 TTF 打进包。许可都是 SIL Open Font License 1.1，全文见同目录 `OFL.txt`。

| 文件 | 家族 | 字重 | 用途 | 上游 |
| --- | --- | --- | --- | --- |
| `NotoSerifSC-Medium.ttf` | Noto Serif SC | 500 | 标题、照片短句 | [Google Fonts / Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC)，Copyright 2022 The Noto Project Authors |
| `NotoSansSC-Regular.ttf` | Noto Sans SC | 400 | 解释、操作 | [Google Fonts / Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC)，Copyright 2014-2021 The Noto Project Authors |
| `DMSans-SemiBold.ttf` | DM Sans | 600 | 顶栏 Lampy | [Google Fonts / DM Sans](https://fonts.google.com/specimen/DM+Sans)，Copyright 2014–2025 The DM Sans Project Authors |

子集只覆盖三屏已定稿汉字、标点和 `Lampy`。窄屏若自然换行，用到的仍是这些字。
