import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Splash from "./Splash";

const photos = {
  coffee: "https://images.unsplash.com/photo-1763037583719-1230a5033730?w=1000&q=85",
  light: "https://images.unsplash.com/photo-1772266387258-37950b4d727e?w=900&q=85",
  flowers: "https://images.unsplash.com/photo-1766939366664-d23a8989b5dc?w=900&q=85",
  window: "https://images.unsplash.com/photo-1759960034642-6fbdef7fb9e6?w=900&q=85",
  table: "https://images.unsplash.com/photo-1769689941789-f21b393d5d01?w=900&q=85",
};

type RecordItem = {
  id: string;
  time: string;
  text?: string;
  images?: { src: string; alt: string; shape: "portrait" | "landscape" }[];
  audio?: { id: string; duration: number; label: string };
  feeling?: string;
  occurred?: string;
};
type Day = { id: string; date: string; weekday: string; count: number; records: RecordItem[] };

const days: Day[] = [
  {
    id: "2025-06-18", date: "6月18日", weekday: "星期三", count: 3,
    records: [
      { id: "r1", time: "16:42", text: "午后下了一阵很短的雨。原本只是想出门买一杯咖啡，走到街角时云已经散了。窗边的光落在桌上，像是一天突然慢了下来。\n\n坐了一会儿，听见隔壁桌轻轻翻书的声音。回家的路上又绕远了一点，看到花店门前的几枝花还带着水珠。这样的日子没有什么特别要记住的事，但我想把它留下。", images: [{ src: photos.coffee, alt: "窗边木桌上的冰咖啡", shape: "landscape" }, { src: photos.flowers, alt: "街边盛开的浅色小花", shape: "portrait" }], audio: { id: "a1", duration: 42, label: "街角的声音" }, feeling: "平静" },
      { id: "r2", time: "11:08", text: "今天的风很轻。" },
      { id: "r3", time: "08:24", images: [{ src: photos.light, alt: "光从门边照进室内", shape: "portrait" }] },
    ],
  },
  {
    id: "2025-06-16", date: "6月16日", weekday: "星期一", count: 2,
    records: [
      { id: "r4", time: "19:32", text: "傍晚路过那扇熟悉的窗，灯刚好亮起来。", images: [{ src: photos.window, alt: "窗台上的植物和灯", shape: "portrait" }] },
      { id: "r5", time: "07:15", audio: { id: "a2", duration: 28, label: "早晨的声音" } },
    ],
  },
  {
    id: "2025-05-29", date: "5月29日", weekday: "星期四", count: 2,
    records: [{ id: "r8", time: "20:16", text: "整理照片时，才想起那天阳光落在桌上的样子。", occurred: "发生于 5月29日" }, { id: "r6", time: "15:10", text: "在桌边坐了很久。阳光移过杯沿，到了该回家的时候。", images: [{ src: photos.table, alt: "午后有阳光的桌面", shape: "portrait" }], feeling: "安心" }],
  },
  {
    id: "2024-11-03", date: "11月3日", weekday: "星期日", count: 1,
    records: [{ id: "r7", time: "14:06", text: "把去年秋天散步时拍下的照片找了出来。", images: [{ src: photos.flowers, alt: "路边的花", shape: "portrait" }] }],
  },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.65, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    back: <path d="m14.5 5-7 7 7 7" />,
    next: <path d="m9.5 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    up: <path d="m6 15 6-6 6 6" />,
    play: <path d="m9 6 9 6-9 6V6Z" fill="currentColor" stroke="none" />,
    pause: <><path d="M9 6v12M15 6v12" strokeWidth="2.5" /></>,
    book: <><path d="M12 5.5C9.5 4 6.5 4 3 4v15c3.5 0 6.5 0 9 1.5 2.5-1.5 5.5-1.5 9-1.5V4c-3.5 0-6.5 0-9 1.5Z" /><path d="M12 5.5v14" /></>,
    recent: <><path d="M4 7.5h16M4 12h16M4 16.5h11" /><circle cx="19" cy="16.5" r="1" fill="currentColor" stroke="none" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
    sound: <><path d="M4 10v4m4-7v10m4-13v16m4-12v8m4-6v4" /></>,
    check: <path d="m5 12 4.5 4.5L19 7" />,
    close: <path d="M5 5l14 14M19 5 5 19" />,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function AudioRow({ audio, active, progress, onToggle }: { audio: NonNullable<RecordItem["audio"]>; active: boolean; progress: number; onToggle: () => void }) {
  const current = Math.floor(progress);
  return <div className="audio-row">
    <button className="audio-play" onClick={onToggle} aria-label={`${active ? "暂停" : "播放"}${audio.label}`}><Icon name={active ? "pause" : "play"} size={18} /></button>
    <div className="audio-info"><span className="audio-title">{audio.label}</span><div className="audio-track"><span style={{ width: `${(progress / audio.duration) * 100}%` }} /></div></div>
    <span className="audio-time">{`${Math.floor(current / 60)}:${String(current % 60).padStart(2, "0")}`}&nbsp;/&nbsp;{`0:${String(audio.duration).padStart(2, "0")}`}</span>
  </div>;
}

function RecordPhoto({ src, alt, shape }: { src: string; alt: string; shape: "portrait" | "landscape" }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="missing-photo" role="img" aria-label={`${alt}，照片暂时无法显示`}>照片暂时无法显示</div>;
  return <img src={src} alt={alt} className={`photo-${shape}`} loading="lazy" onError={() => setFailed(true)} />;
}

function RecordBlock({ item, mode, expanded, onExpand, onOpen, audioState, onAudio }: {
  item: RecordItem; mode: "recent" | "lookback"; expanded: boolean; onExpand: () => void; onOpen: () => void;
  audioState: { activeId: string | null; progress: Record<string, number> }; onAudio: (id: string) => void;
}) {
  const long = (item.text?.length ?? 0) > 105;
  return <article className="record-block">
    <div className="record-meta"><span>{mode === "lookback" && item.id === "r8" ? `记录于 6月16日 · ${item.time}` : item.time}</span>{mode === "recent" && item.occurred && <span className="occurred">{item.occurred}</span>}</div>
    {item.text && <>
      <p className={`record-text ${long && !expanded ? "preview-text" : ""}`}>{item.text}</p>
      {long && !expanded && <button className="expand-button" onClick={onExpand}>展开正文 <Icon name="down" size={14} /></button>}
    </>}
    {item.images && <div className={`image-layout ${item.images.length > 1 ? "image-pair" : "single-image"}`}>
      {item.images.map((image, index) => <RecordPhoto key={index} {...image} />)}
    </div>}
    {item.audio && <AudioRow audio={item.audio} active={audioState.activeId === item.audio.id} progress={audioState.progress[item.audio.id] ?? 0} onToggle={() => onAudio(item.audio!.id)} />}
    <div className="record-foot">{item.feeling ? <span className="feeling"><i />{item.feeling}</span> : <span />}
      <button className="open-record" onClick={onOpen}>阅读完整记录 <Icon name="next" size={15} /></button>
    </div>
  </article>;
}

function BottomNav({ current, onNavigate }: { current: "recent" | "lookback"; onNavigate: (next: "recent" | "lookback") => void }) {
  return <nav className="bottom-nav" aria-label="主要导航">
    <button className={current === "recent" ? "selected" : ""} onClick={() => onNavigate("recent")}><Icon name="recent" size={21} /><span>最近</span></button>
    <button className={current === "lookback" ? "selected" : ""} onClick={() => onNavigate("lookback")}><Icon name="book" size={21} /><span>回看</span></button>
  </nav>;
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [mobilePage, setMobilePage] = useState<"recent" | "lookback">("recent");
  const [selectedDay, setSelectedDay] = useState(0);
  const [unknownScope, setUnknownScope] = useState<"all" | "year" | "month" | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [month, setMonth] = useState("2025-06");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [detail, setDetail] = useState<RecordItem | null>(null);
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<RecordItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const recentScroll = useRef<HTMLDivElement>(null);
  const lookbackScroll = useRef<HTMLDivElement>(null);
  const allRecords = days.flatMap(day => day.records);
  const audioMap: Record<string, number> = { ...Object.fromEntries(allRecords.filter(r => r.audio).map(r => [r.audio!.id, r.audio!.duration])), a3: 17 };

  useEffect(() => {
    if (!activeId) return;
    const timer = window.setInterval(() => setProgress(previous => {
      const next = Math.min((previous[activeId] ?? 0) + 1, audioMap[activeId] ?? 0);
      if (next >= audioMap[activeId]) window.setTimeout(() => setActiveId(current => current === activeId ? null : current), 0);
      return { ...previous, [activeId]: next };
    }), 1000);
    return () => window.clearInterval(timer);
  }, [activeId]);

  const toggleAudio = (id: string) => {
    setActiveId(current => current === id ? null : id);
    if ((progress[id] ?? 0) >= (audioMap[id] ?? 0)) setProgress(previous => ({ ...previous, [id]: 0 }));
  };
  const navigate = (next: "recent" | "lookback") => { setActiveId(null); setMobilePage(next); };
  const selectDay = (index: number) => { setSelectedDay(index); setUnknownScope(null); setDirectoryOpen(false); setActiveId(null); lookbackScroll.current?.scrollTo({ top: 0, behavior: "smooth" }); };
  const selectUnknown = (scope: "all" | "year" | "month") => { setUnknownScope(scope); setDirectoryOpen(false); setActiveId(null); lookbackScroll.current?.scrollTo({ top: 0, behavior: "smooth" }); };
  const toggleExpand = (id: string) => setExpanded(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
  const openDetail = (item: RecordItem) => { setActiveId(null); setDetail(item); };
  const saveDraft = () => {
    if (!draft.trim()) return;
    setSaved({ id: "new", time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }), text: draft.trim() });
    setDraft(""); setCompose(false); setMobilePage("recent");
    recentScroll.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const shared = { expanded, toggleExpand, openDetail, audioState: { activeId, progress }, toggleAudio };
  const renderRecord = (item: RecordItem, mode: "recent" | "lookback") => <RecordBlock key={item.id} item={item} mode={mode} expanded={expanded.includes(item.id)} onExpand={() => toggleExpand(item.id)} onOpen={() => openDetail(item)} audioState={shared.audioState} onAudio={toggleAudio} />;

  return <><div className="site" inert={showSplash}>
    <div className="site-header"><div className="site-brand"><span className="brand-sun" /> LAMPY <span className="brand-divider" /> <span className="brand-caption">自己的生活记录</span></div><span className="site-header-right">日常，有它自己的光。</span></div>
    <header className="intro"><span className="eyebrow">A QUIETER WAY TO REMEMBER</span><h1>把日子留下，<br /><em>再慢慢读一遍。</em></h1><p>最近，遇见刚刚发生的生活。<br />回看，回到一段值得停留的时间。</p></header>
    <main className="showcase">
      <section className={`device-column recent-column ${mobilePage !== "recent" ? "mobile-hidden" : ""}`} aria-label="最近页面">
        <div className="panel-label"><span>01 <i /> 最近</span><span>THE RECENT DAYS</span></div>
        <div className="device">
          <div className="device-status"><span>9:41</span><div className="status-icons"><span className="signal" /><span className="wifi" /><span className="battery" /></div></div>
          <div className="screen-top"><div><span className="screen-kicker">LAMPY · 生活记录</span><h2>最近</h2></div><button className="icon-action" aria-label="设置" onClick={() => setSettingsOpen(true)}><Icon name="settings" size={20} /></button></div>
          <div className="screen-scroll" ref={recentScroll}>
            <div className="scroll-content">
              <div className="section-heading"><div><span className="section-prefix">记录于</span><h3>6月18日 <small>星期三</small></h3></div><span className="section-year">2025</span></div>
              {saved && renderRecord(saved, "recent")}
              {days[0].records.map(item => renderRecord(item, "recent"))}
              <div className="section-heading next-section"><div><span className="section-prefix">记录于</span><h3>6月16日 <small>星期一</small></h3></div><span className="section-year">2025</span></div>
              {days[1].records.map(item => renderRecord(item, "recent"))}
              {renderRecord(days[2].records[0], "recent")}
              <div className="end-note">每一个平常的日子，都在这里。</div>
            </div>
          </div>
          <button className="create-button" onClick={() => setCompose(true)} aria-label="留下新记录"><Icon name="plus" size={22} /><span>留下</span></button>
          <BottomNav current="recent" onNavigate={navigate} />
        </div>
        <p className="panel-footnote">轻轻扫过，也能看见日子的样子。</p>
      </section>
      <section className={`device-column lookback-column ${mobilePage !== "lookback" ? "mobile-hidden" : ""}`} aria-label="回看页面">
        <div className="panel-label"><span>02 <i /> 回看</span><span>THE DAYS BEFORE</span></div>
        <div className="device">
          <div className="device-status"><span>9:41</span><div className="status-icons"><span className="signal" /><span className="wifi" /><span className="battery" /></div></div>
          <div className="screen-top lookback-top"><div><span className="screen-kicker">LAMPY · 时间里的记录</span><h2>回看</h2></div><span className="top-mark">慢慢读</span></div>
          <div className="screen-scroll" ref={lookbackScroll}>
            <div className="scroll-content">
              <div className="directory-wrapper">
                <span className="directory-caption">时间目录</span>
                <button className="directory-trigger" onClick={() => setDirectoryOpen(!directoryOpen)} aria-expanded={directoryOpen}><span>{unknownScope ? "时间未确认" : <>{days[selectedDay].id.slice(0, 4)}年 <b>·</b> {selectedDay < 2 ? "六月" : selectedDay === 2 ? "五月" : "十一月"}</>}</span><Icon name={directoryOpen ? "up" : "down"} size={18} /></button>
                {directoryOpen && <div className="directory-list">
                  <div className="directory-year">2025 <span>年</span></div>
                  {[{ key: "2025-06", label: "六月", dates: [0, 1] }, { key: "2025-05", label: "五月", dates: [2] }].map(group => <div key={group.key} className="month-group"><button className="month-button" onClick={() => setMonth(month === group.key ? "" : group.key)} aria-expanded={month === group.key}>{group.label}<Icon name={month === group.key ? "up" : "down"} size={15} /></button>{month === group.key && group.dates.map(index => <button key={index} className={`date-option ${selectedDay === index ? "date-selected" : ""}`} onClick={() => selectDay(index)} aria-label={`${days[index].id}，${days[index].weekday}，${days[index].count}条记录`}><span>{days[index].date.replace("月", " / ").replace("日", "")}</span><span>{days[index].weekday.replace("星期", "周")} · {days[index].count}条</span></button>)}</div>)}
                  <div className="directory-year second-year">2024 <span>年</span></div>
                  <div className="month-group"><button className="month-button" onClick={() => setMonth(month === "2024-11" ? "" : "2024-11")} aria-expanded={month === "2024-11"}>十一月<Icon name={month === "2024-11" ? "up" : "down"} size={15} /></button>{month === "2024-11" && <button className="date-option" onClick={() => selectDay(3)} aria-label="2024年11月3日，星期日，1条记录"><span>11 / 03</span><span>周日 · 1条</span></button>}</div>
                  <div className="unknown-directory">时间未确认 <span>按已知范围保留</span></div>
                  <button className="date-option" onClick={() => selectUnknown("month")}><span>2025年6月 · 日期未确认</span><span>1条</span></button>
                  <button className="date-option" onClick={() => selectUnknown("year")}><span>2025年 · 月份未确认</span><span>1条</span></button>
                  <button className="date-option" onClick={() => selectUnknown("all")}><span>时间未确认</span><span>1条</span></button>
                </div>}
              </div>
              {unknownScope ? <>
                <div className="day-heading"><span className="day-year">{unknownScope === "all" ? "日期未注明" : unknownScope === "year" ? "2025" : "2025 · 06"}</span><h3>{unknownScope === "all" ? "时间未确认" : unknownScope === "year" ? "月份未确认" : "日期未确认"}</h3><span className="day-weekday">{unknownScope === "all" ? "尚未注明发生时间" : unknownScope === "year" ? "只确定发生于2025年" : "只确定发生于2025年6月"} · 1 条记录</span></div>
                <div className="day-records">{renderRecord(unknownScope === "month" ? { id: "unknown-month", time: "记录时间未注明", text: "那天下午走过一条很安静的路。", images: [{ src: photos.window, alt: "窗边的绿植", shape: "portrait" }] } : unknownScope === "year" ? { id: "unknown-year", time: "记录时间未注明", text: "记得是那一年秋天，风吹过树梢的声音。" } : { id: "unknown-all", time: "记录时间未注明", audio: { id: "a3", duration: 17, label: "一段未注明日期的声音" } }, "lookback")}</div>
              </> : <>
                <div className="day-heading"><span className="day-year">{days[selectedDay].id.slice(0, 4)} · {days[selectedDay].id.slice(5, 7)}</span><h3>{days[selectedDay].date}</h3><span className="day-weekday">{days[selectedDay].weekday} <i /> {days[selectedDay].count} 条记录</span></div>
                <div className="day-records">{days[selectedDay].records.map(item => renderRecord(item, "lookback"))}</div>
                <div className="day-navigation">{selectedDay < days.length - 1 ? <button onClick={() => selectDay(selectedDay + 1)}><Icon name="back" size={16} /><span><small>前一个有记录日</small>{days[selectedDay + 1].id.slice(0, 4)}年{days[selectedDay + 1].date}</span></button> : <span />}{selectedDay > 0 ? <button onClick={() => selectDay(selectedDay - 1)}><span><small>后一个有记录日</small>{days[selectedDay - 1].id.slice(0, 4)}年{days[selectedDay - 1].date}</span><Icon name="next" size={16} /></button> : <span />}</div>
              </>}
              <div className="end-note">这一日，读到这里。</div>
            </div>
          </div>
          <BottomNav current="lookback" onNavigate={navigate} />
        </div>
        <p className="panel-footnote">不必翻找，从一个日子继续读起。</p>
      </section>
    </main>
    <footer className="site-footer"><span>LAMPY / 留下 · 最近 · 回看</span><span>为平常的生活，留一点位置。</span></footer>
    <nav className="mobile-switch" aria-label="切换页面"><button className={mobilePage === "recent" ? "active" : ""} onClick={() => navigate("recent")}>最近</button><button className={mobilePage === "lookback" ? "active" : ""} onClick={() => navigate("lookback")}>回看</button></nav>
    {detail && <div className="overlay" role="dialog" aria-modal="true" aria-label="完整记录"><div className="modal detail-modal"><div className="modal-bar"><button onClick={() => setDetail(null)}><Icon name="back" size={19} /> 返回</button><span>完整记录</span><span className="modal-spacer" /></div><div className="modal-scroll"><span className="section-prefix">{detail.id === "new" ? "记录于今天" : detail.id.startsWith("unknown") ? "发生时间未确认" : `${days.find(day => day.records.some(record => record.id === detail.id))?.id ?? "2025-06-18"} · ${detail.time}`}</span>{detail.occurred && <p className="detail-occurred">{detail.occurred}</p>}<div className="detail-content">{detail.text && <p>{detail.text}</p>}{detail.images?.map((image, i) => <RecordPhoto key={i} {...image} />)}{detail.audio && <AudioRow audio={detail.audio} active={activeId === detail.audio.id} progress={progress[detail.audio.id] ?? 0} onToggle={() => toggleAudio(detail.audio!.id)} />}{detail.feeling && <span className="feeling"><i />{detail.feeling}</span>}</div></div></div></div>}
    {compose && <div className="overlay" role="dialog" aria-modal="true" aria-label="留下新记录"><div className="modal compose-modal"><div className="modal-bar"><button onClick={() => setCompose(false)}>取消</button><span>留下</span><button className="save-button" onClick={saveDraft} disabled={!draft.trim()}>保存</button></div><div className="compose-body"><span className="section-prefix">记录于今天</span><textarea autoFocus placeholder="此刻，想留下什么？" value={draft} onChange={event => setDraft(event.target.value)} /><div className="compose-hint">写下一点生活，就足够了。</div></div></div></div>}
    {settingsOpen && <div className="overlay" role="dialog" aria-modal="true" aria-label="设置"><div className="modal settings-modal"><div className="modal-bar"><button onClick={() => setSettingsOpen(false)}><Icon name="back" size={19} /> 返回</button><span>设置</span><span className="modal-spacer" /></div><div className="settings-body"><span className="brand-sun" /><h3>Lampy</h3><p>把生活，留给自己。</p><div>这是一个界面设计原型。记录与播放为示意内容，不会保存到设备。</div></div></div></div>}
  </div>{showSplash && <Splash onEnter={() => setShowSplash(false)} />}</>;
}

export default App;
