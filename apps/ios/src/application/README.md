UI 只调用这里的 Use Case。application 读仓库、调领域命令、复制媒体文件，再把已读取的数据交给 projection。最多三张图、最多一段音频在这一层强制。回看按发生时间范围计数或分页，不一次加载全部 Moment 和 Asset。
