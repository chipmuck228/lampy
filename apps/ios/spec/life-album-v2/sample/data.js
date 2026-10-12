/* Synthetic bilingual review fixtures. Switching language selects a fixture, never translates user content. */
window.ALBUM_FIXTURE = {
  zh: {
    title:'窗边的一些日子', opening:'有几个下午，我想把它们放在一起。\n不是为了记住每一件事，只是想以后再读到这些声音、这些光。', close:'这些日子，先放到这里。',
    familyTitle:'我们在一起的日子',
    records:[
      {id:'v2_m01',date:'2026年9月3日 · 周四',key:'2026-09-03',text:'咖啡放凉了一点，下午还长。',images:[{id:'v2_a01',src:'../../../assets/first-run/coffee.jpg'}],feeling:'平静'},
      {id:'v2_m02',date:'2026年9月3日 · 周四',key:'2026-09-03',text:'洗好了杯子，留一盏灯。'},
      {id:'v2_m03',date:'2026年9月12日 · 周六',key:'2026-09-12',text:[
        '下午坐在桌边，把灯拧到刚够看清纸面。窗外没有特别的事，风偶尔把叶子翻过去。我想把这一段留下来，不是因为有什么要宣布，只是日子这样走过，不写就散了。杯子里的水已经凉了。隔壁有人下楼，脚步到拐角就听不清。',
        '早上买回来的花还放在旧玻璃瓶里，水面到瓶子的一半。我们说起上次去河边的事，谁也没记住是哪一天。记得风很大，记得回来以后鞋子上有泥。那时候没有拍照，现在也不想替那一天补一张。',
        '桌上有一本翻到中间的书，夹着一张小纸。字已经淡了，却还认得出来。我没有重新誊写，只把纸放回去。有些东西留下原来的样子，比整理得整整齐齐更好。午后的光慢慢走到杯子后面，桌子的一半亮着，另一半安静地暗下来。',
        '今天想做的事其实不多。给窗边的植物浇水，把一件衣服叠好，坐下来听一会儿。我们各自做自己的事，偶尔说一句话。没有急着给这个下午起一个名字，也没有什么非要完成的计划。',
        '后来又坐了一会儿，把灯再拧暗一点，听见自己翻纸的声音。窗边有一小片光没有马上消失。我把今天写到这里，留着以后慢慢看。'
      ].join('\n\n'),images:[{id:'v2_a03',src:'../../../assets/first-run/window.jpg'},{id:'v2_a04',src:'../../../assets/first-run/flowers.jpg'}],audio:{id:'v2_s03',src:'media/room-tone.wav',seconds:9},feeling:'说不清'},
      {id:'v2_m04',date:'2026年9月18日 · 周五',key:'2026-09-18',text:'花瓶没有换，花开得更松了。',images:[{id:'v2_a05',src:'../../../assets/first-run/flowers.jpg'}]},
      {id:'v2_m05',date:'2026年9月22日 · 周二',key:'2026-09-22',audio:{id:'v2_s05',src:'media/room-tone.wav',seconds:9}},
      {id:'v2_m06',date:'2026年10月2日 · 周五',key:'2026-10-02',text:'把三个画面放在一起。顺序就是当时留下的顺序。',images:[{id:'v2_a06',src:'../../../assets/first-run/coffee.jpg'},{id:'v2_a07',src:'../../../assets/first-run/window.jpg'},{id:'v2_a08',src:'../../../assets/first-run/flowers.jpg'}],feeling:'高兴'},
      {id:'v2_m07',date:'2026年10月2日 · 周五',key:'2026-10-02',text:'出门前，把窗关上了。'},
      {id:'v2_m08',date:'2026年9月 · 日子未确认',key:'month-2026-09',text:'记得那个月，窗边常有光。具体是哪一天，已经不确定了。'},
      {id:'v2_m09',date:'记录于2026年10月8日',key:'unknown-09',text:'那次把窗台上的土扫干净了。',recorded:true},
      {id:'v2_m10',date:'2026年10月14日 · 周三',key:'2026-10-14',text:'本想留下窗外的树。',missingImage:true,feeling:'疲惫'},
      {id:'v2_m11',date:'2026年10月18日 · 周日',key:'2026-10-18',text:'走过一条很长的小路。',images:[{id:'v2_a11',src:'media/tall-study.svg'}],unknown:true},
      {id:'v2_m12',date:'2026年10月20日 · 周二',key:'2026-10-20',text:'今天没有更多要写的。hello, window light. 😀',feeling:'平静'}
    ]
  },
  en:{
    title:'Days by the window',opening:'A few afternoons, gathered together.\nNot every detail. Just enough to hear and see these days again.',close:'These days can rest here for now.',familyTitle:'The days we shared',
    records:[
      {id:'v2_m01',date:'September 3, 2026 · Thursday',key:'2026-09-03',text:'The coffee cooled a little. There was still plenty of afternoon.',images:[{id:'v2_a01',src:'../../../assets/first-run/coffee.jpg'}],feeling:'Peaceful'},
      {id:'v2_m02',date:'September 3, 2026 · Thursday',key:'2026-09-03',text:'Washed the cups. Left one light on.'},
      {id:'v2_m03',date:'September 12, 2026 · Saturday',key:'2026-09-12',text:[
        'I sat at the table and turned the lamp down until there was just enough light to read. Nothing much was happening outside. Every so often the wind turned a leaf over. I wanted to leave a note of this afternoon, not because there was something to announce, but because a day can pass quietly and be gone. The water in the cup had cooled. Someone walked downstairs next door; their steps disappeared around the corner.',
        'The flowers we brought home that morning were still in the old glass bottle, with the water halfway up. We talked about the last time we went to the river. Neither of us remembered the date. We remembered the wind and the mud on our shoes afterwards. We had taken no photograph, and I did not want to invent one for that day now.',
        'There was a book open in the middle, with a little piece of paper tucked between its pages. The writing had faded, but I could still read it. I did not copy it onto a fresh sheet. I put it back. Some things are better left in the shape they arrived in. The afternoon light moved slowly behind the cup: half of the table stayed bright while the other half grew quietly dim.',
        'There were not many things I wanted to do today. Water the plant, fold a shirt, sit down and listen for a while. We did our own things and sometimes said a word or two. There was no need to name the afternoon, and no plan that had to be finished before it ended.',
        'Later I sat a little longer and turned the lamp down again. I could hear myself turning a page. A small patch of light lingered by the window. I stopped writing here, leaving these lines to come back to another day.'
      ].join('\n\n'),images:[{id:'v2_a03',src:'../../../assets/first-run/window.jpg'},{id:'v2_a04',src:'../../../assets/first-run/flowers.jpg'}],audio:{id:'v2_s03',src:'media/room-tone.wav',seconds:9},feeling:'Hard to say'},
      {id:'v2_m04',date:'September 18, 2026 · Friday',key:'2026-09-18',text:'The same vase. The flowers opened a little further.',images:[{id:'v2_a05',src:'../../../assets/first-run/flowers.jpg'}]},
      {id:'v2_m05',date:'September 22, 2026 · Tuesday',key:'2026-09-22',audio:{id:'v2_s05',src:'media/room-tone.wav',seconds:9}},
      {id:'v2_m06',date:'October 2, 2026 · Friday',key:'2026-10-02',text:'Three views, in the order I left them.',images:[{id:'v2_a06',src:'../../../assets/first-run/coffee.jpg'},{id:'v2_a07',src:'../../../assets/first-run/window.jpg'},{id:'v2_a08',src:'../../../assets/first-run/flowers.jpg'}],feeling:'Happy'},
      {id:'v2_m07',date:'October 2, 2026 · Friday',key:'2026-10-02',text:'Closed the window before going out.'},
      {id:'v2_m08',date:'September 2026 · Day not known',key:'month-2026-09',text:'I remember light by the window that month. I no longer remember which day.'},
      {id:'v2_m09',date:'Recorded October 8, 2026',key:'unknown-09',text:'That time I swept the soil from the windowsill.',recorded:true},
      {id:'v2_m10',date:'October 14, 2026 · Wednesday',key:'2026-10-14',text:'I meant to keep a view of the tree outside.',missingImage:true,feeling:'Tired'},
      {id:'v2_m11',date:'October 18, 2026 · Sunday',key:'2026-10-18',text:'Walked along a very long path.',images:[{id:'v2_a11',src:'media/tall-study.svg'}],unknown:true},
      {id:'v2_m12',date:'October 20, 2026 · Tuesday',key:'2026-10-20',text:'Nothing more to write today. 窗边有光。 😀',feeling:'Peaceful'}
    ]
  }
};
