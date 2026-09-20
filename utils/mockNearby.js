/**
 * 附近微光：安静、随机、不可搜索的模拟微光池。
 */
const MOCK_TEXTS = [
  '下班路上看到晚霞，粉紫色的云',
  '楼下的桂花开了，很香',
  '地铁上有个小孩对我笑了一下',
  '今天的咖啡拉花是一只小熊',
  '路过一家书店，进去待了一小时',
  '邻居家的猫又趴在窗台上了',
  '收到朋友从很远的地方寄来的明信片',
  '今天的月亮特别圆',
  '公交车正好赶上，没有等',
  '外卖小哥说了一句“慢用”',
  '在公园看到一只松鼠',
  '淋了一场太阳雨',
  '翻到去年的旧照片，笑了',
  '同事分了我一块蛋糕',
  '今天的风很温柔',
  '书店里放了我喜欢的歌',
  '便利店阿姨记得我不要葱',
  '在路边捡到一片很好看的落叶',
  '朋友突然发消息说想我',
  '今天的云像棉花糖',
  '停车的时候刚好有一个位置',
  '手机电量刚好撑到家',
  '晚饭是自己做的最爱的那道菜',
  '读到一句很喜欢的诗',
  '雨后的空气特别干净',
]

const MOCK_EMOTIONS = ['平静', '喜悦', '感动', '温暖', '惊喜', '释然']

function generateMockNearby(count = 5) {
  const shuffled = MOCK_TEXTS.slice().sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map((text, index) => ({
    id: `nearby_${Date.now()}_${index}`,
    text,
    emotion: MOCK_EMOTIONS[Math.floor(Math.random() * MOCK_EMOTIONS.length)],
    createdAt: Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
  }))
}

module.exports = { generateMockNearby }
