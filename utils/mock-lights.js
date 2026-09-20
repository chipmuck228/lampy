/**
 * 仅用于本地空墙视觉种子，写入旧 light key 后再迁移。
 * 不是真实用户历史。
 */
const EMOTIONS = ['平静', '喜悦', '感动', '温暖', '惊喜', '释然']
const MOCK_TEXTS = [
  '下班路上看到晚霞',
  '朋友突然发来一句问候',
  '喝到一杯刚好的咖啡',
  '地铁上有人让座',
  '路过一棵开花的树',
  '收到一封手写信',
  '今天阳光很好',
  '猫在窗台睡着了',
  '听到了喜欢的歌',
  '睡前看了一页书',
  '陌生人的一个微笑',
  '雨后的空气很干净',
  '和家人通了一次电话',
  '工作上的一个小突破',
  '做了一顿好吃的饭',
]

const DAY = 24 * 60 * 60 * 1000

function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

function randomInRange(minDays, maxDays) {
  return minDays + Math.random() * (maxDays - minDays)
}

function generateMockLights() {
  const now = Date.now()
  const buckets = [
    { count: 15, min: 0, max: 7 },
    { count: 25, min: 7, max: 30 },
    { count: 25, min: 30, max: 90 },
    { count: 35, min: 90, max: 365 },
  ]
  const lights = []
  buckets.forEach((bucket, bucketIndex) => {
    for (let i = 0; i < bucket.count; i += 1) {
      const daysAgo = randomInRange(bucket.min, bucket.max)
      lights.push({
        id: `mock-${bucketIndex}-${i}`,
        text: pick(MOCK_TEXTS),
        emotion: pick(EMOTIONS),
        createdAt: Math.round(now - daysAgo * DAY),
        isPublic: false,
        isPassed: false,
        source: '',
      })
    }
  })
  return lights.sort((a, b) => b.createdAt - a.createdAt)
}

module.exports = {
  generateMockLights,
}
