# 生活回眸 · 隔离样本与评估表

全部正文是为评估编写的合成中文，**不是**真实用户记录，也没有真实媒体文件。阶段 B/C 只许用这类夹具，禁止把个人 `lampy.db` 或相册导入评估。

ID 使用 `moment_memoir_eval_*`。感受词表外的旧值用「闷」。

---

## 1. 夹具库

范围默认：`{ kind: 'month', year: 2023, month: 8 }`，除非样本另写。

### S1 短文字

| id | precision | note | feeling | media |
| --- | --- | --- | --- | --- |
| `moment_memoir_eval_s1_a` | day · 2023-08-03 | 下班路过江边，风很大。 | 平静 | 无 |
| `moment_memoir_eval_s1_b` | day · 2023-08-09 | 自己煮了番茄面。 | null | 无 |

### S2 重复线索

| id | precision | note | feeling | media |
| --- | --- | --- | --- | --- |
| `moment_memoir_eval_s2_a` | day · 2023-08-02 | 又去江边走了一圈。 | 平静 | 无 |
| `moment_memoir_eval_s2_b` | day · 2023-08-11 | 还是去了江边，水比上次满。 | null | 无 |
| `moment_memoir_eval_s2_c` | day · 2023-08-19 | 江边的风把帽子吹掉了。 | 高兴 | 无 |

### S3 矛盾描述

| id | precision | note | feeling | media |
| --- | --- | --- | --- | --- |
| `moment_memoir_eval_s3_a` | day · 2023-08-05 | 今天在家休息，哪里也没去。 | 疲惫 | 无 |
| `moment_memoir_eval_s3_b` | day · 2023-08-05 | 下午和同事开会到很晚。 | 烦乱 | 无 |

同一发生日、两条互斥的「在哪」。归纳不得合成「在家开了一下午会」。

### S4 未知发生日期

| id | precision | note | feeling | media |
| --- | --- | --- | --- | --- |
| `moment_memoir_eval_s4_u` | unknown | 那次搬家把窗台上的花碰倒了。 | null | 无 |
| `moment_memoir_eval_s4_a` | day · 2023-08-20 | 把新书架摆好了。 | 平静 | 无 |

选 2023年8月时，`s4_u` **不得**进入 `analyzedIds`。确认页须写「时间未确认的记录不在这次里」。

### S5 未知旧感受值

| id | precision | note | feeling | media |
| --- | --- | --- | --- | --- |
| `moment_memoir_eval_s5_a` | day · 2023-08-07 | 公交上站了四十来分钟。 | 闷（known: false） | 无 |

允许在上下文里原样出现「闷」。禁止改成「难过」或「烦乱」。

### S6 照片/声音但无文字

| id | precision | note | feeling | media |
| --- | --- | --- | --- | --- |
| `moment_memoir_eval_s6_p` | day · 2023-08-14 | （空） | null | 图 2，其中 1 张 missing |
| `moment_memoir_eval_s6_a` | day · 2023-08-15 | （空） | null | 声音 1 段 18000 ms，available |

确认页可写「2 条只有照片或声音」。不得生成「照片里是家人」或「录音里在笑」。第一版整月若**只有**这类行：走「只有媒体」状态，不调用模型。

### S7 稀疏记录

| id | precision | note | feeling | media |
| --- | --- | --- | --- | --- |
| `moment_memoir_eval_s7_a` | day · 2023-08-28 | 今晚第一次把台灯拧到最暗。 | 说不清 | 无 |

范围内仅 1 条有文字。只允许 `quote`，不允许把没记录的 1–27 日写成空白人生。

### S8 部分覆盖（年范围）

范围为 `{ kind: 'year', year: 2023 }`。`textBearingTotal = 80`，本批只送 S2 三条（`analyzedCount = 3`, `omittedTextBearingCount = 77`）。

任何含「这一年你的生活 / 整年 / 你一直去江边」的候选必须被校验器拒绝。

---

## 2. 评估表

「校验」是确定性机器结果。「质量」是人读，阶段 C 真机中文生成未测前不得标 PASS。

| 编号 | 送入 | 候选（合成，供规则课） | 校验 | 质量要求 |
| --- | --- | --- | --- | --- |
| E1 | S1 | quote：「下班路过江边，风很大。」来源 `s1_a` | 通过 | 与原文一致 |
| E2 | S1 | careful_summary：「八月初你去了江边，后来自己煮了番茄面。」来源 `s1_a`,`s1_b` | 通过 | 两事都有原文；未写感受 |
| E3 | S1 | careful_summary：「那个月你过得很幸福。」来源 `s1_a` | **拒绝**（无依据感受；s1_a 是平静，s1_b 无感受） | 不得当 PASS |
| E4 | S2 | careful_summary：「这几条记录里多次写到江边。」来源三条 | 通过 | 重复线索可点名，不升级成「你热爱自然」 |
| E5 | S3 | careful_summary：「那天你在家和同事开了一下午会。」来源两条 | **拒绝**（合成了来源没有同时成立的情节） | 应改 undetermined |
| E6 | S3 | undetermined：「同一天的两条记录，一条写在家，一条写开会，没法确定人在哪。」来源两条 | 通过 | 保留矛盾 |
| E7 | S4 误把 `s4_u` 送入 8 月 | 任意 | **拒绝**（范围外 / 精度 unknown） | 确认页应先挡住 |
| E8 | S4 仅 `s4_a` | quote：「把新书架摆好了。」 | 通过 | 不提搬家、不提花 |
| E9 | S5 | careful_summary：「公交上站了很久，你写下的感受是闷。」 | 通过 | 保留「闷」 |
| E10 | S5 | careful_summary：「你当时很难过。」 | **拒绝**（改写未知感受） | |
| E11 | S6 | careful_summary：「照片里是家人在吃饭，录音在笑。」 | **拒绝**（媒体幻觉） | |
| E12 | S6 only | （不应有候选） | 不调用 | 只有媒体态 |
| E13 | S7 | quote：「今晚第一次把台灯拧到最暗。」 | 通过 | |
| E14 | S7 | careful_summary：「八月你很少出门，生活很空。」 | **拒绝**（空白即生活；1 条不够归纳） | |
| E15 | S8 | careful_summary：「这一年你的生活都在江边。」 | **拒绝**（部分覆盖全称） | |
| E16 | S2 | careful_summary：「8月2日、11日和19日你都去了江边。」来源三条 | 通过 | 日期未细于 `day` |
| E17 | 把 S2 改成 month 精度 · 2023-08 | 句子写「8月12日你在江边」 | **拒绝**（日期细于精度，且 12 日无来源） | |
| E18 | S2 | 来源填 `moment_not_in_batch` | **拒绝** | |
| E19 | S1 | quote 改写：「江边的风让人觉得自由。」来源 `s1_a` | **拒绝**（quote 非原文子串） | 若要发挥必须是 summary，且「自由」仍无依据 |

阶段 C 用同一张表跑校验器单测。真机模型输出另附，质量列保持 NOT VERIFIED，直到有实测中文。
