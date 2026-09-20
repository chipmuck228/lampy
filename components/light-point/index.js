/**
 * 单颗萤火光点：呼吸明暗，不缩放弹跳。
 */
Component({
  properties: {
    size: {
      type: Number,
      value: 28,
    },
    opacity: {
      type: Number,
      value: 0.7,
    },
    color: {
      type: String,
      value: '#FFD97D',
    },
    duration: {
      type: Number,
      value: 5000,
    },
    delay: {
      type: Number,
      value: 0,
    },
    seed: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    onTap() {
      this.triggerEvent('select')
    },
  },
})
