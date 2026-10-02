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
  audio?: { id: string; duration: number; label: string; url?: string };
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
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" /></>,
    camera: <><path d="M3 7h4l2-2h6l2 2h4v12H3V7Z" /><circle cx="12" cy="13" r="3" /></>,
    photo: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8" cy="9" r="1" /><path d="m4 18 5-5 3 3 3-4 5 6" /></>,
    face: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3" /><path d="M9 10h.01M15 10h.01M9 15c1.7 1.5 4.3 1.5 6 0" /></>,
    cloud: <path d="M7 19h11a4 4 0 0 0 .5-8 6.5 6.5 0 0 0-12.6-1.5A4.8 4.8 0 0 0 7 19Z" />,
    identity: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="11" r="2" /><path d="M5.5 16c.7-1.4 1.7-2 3-2s2.3.6 3 2M14 10h4m-4 3h4" /></>,
    wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 9h18M16 15h2" /></>,
    receipt: <><path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L9.5 21 7 19.5 5 21V3Z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function AudioRow({ audio, active, progress, onToggle }: { audio: NonNullable<RecordItem["audio"]>; active: boolean; progress: number; onToggle: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!audio.url || !audioRef.current) return;
    if (active) void audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [active, audio.url]);
  const current = Math.floor(progress);
  return <div className="audio-row">
    {audio.url && <audio ref={audioRef} src={audio.url} onEnded={onToggle} />}
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

const feelings = ["高兴", "平静", "感动", "疲惫", "难过", "烦乱", "说不清"];

function ComposePage({ onCancel, onSave }: { onCancel: () => void; onSave: (record: RecordItem) => void }) {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const [text, setText] = useState("");
  const [feeling, setFeeling] = useState<string | undefined>();
  const [feelingsOpen, setFeelingsOpen] = useState(true);
  const [date, setDate] = useState(today);
  const [dateOpen, setDateOpen] = useState(false);
  const [images, setImages] = useState<NonNullable<RecordItem["images"]>>([]);
  const [voice, setVoice] = useState<NonNullable<RecordItem["audio"]> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const secondsRef = useRef(0);
  const ownedUrls = useRef<string[]>([]);
  const savedRef = useRef(false);
  const disposedRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => { secondsRef.current += 1; setSeconds(secondsRef.current); }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => () => {
    disposedRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (!savedRef.current) ownedUrls.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).filter(file => file.type.startsWith("image/")).forEach(file => {
      const src = URL.createObjectURL(file);
      ownedUrls.current.push(src);
      const image = new Image();
      image.onload = () => setImages(previous => previous.map(item => item.src === src ? { ...item, shape: image.naturalWidth >= image.naturalHeight ? "landscape" : "portrait" } : item));
      image.src = src;
      setImages(previous => [...previous, { src, alt: file.name || "留下的照片", shape: "portrait" }]);
    });
  };

  const startRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(track => track.stop());
      setRecording(false);
      return;
    }
    try {
      setMicError("");
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (!chunks.length || disposedRef.current) return;
        if (voice) URL.revokeObjectURL(voice.url!);
        const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
        ownedUrls.current.push(url);
        setVoice({ id: `voice-${Date.now()}`, duration: Math.max(1, secondsRef.current), label: "留下的声音", url });
      };
      secondsRef.current = 0;
      setSeconds(0);
      recorder.start();
      setRecording(true);
    } catch {
      setMicError("无法使用麦克风，请检查浏览器权限。");
    }
  };

  const save = () => {
    if (!text.trim() && images.length === 0 && !voice) return;
    savedRef.current = true;
    const occurred = date !== today ? `发生于 ${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`))}` : undefined;
    onSave({ id: `saved-${Date.now()}`, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }), text: text.trim() || undefined, images: images.length ? images : undefined, audio: voice ?? undefined, feeling, occurred });
  };

  return <div className="overlay" role="dialog" aria-modal="true" aria-label="留下新记录">
    <div className="modal compose-modal">
      <header className="compose-header"><button onClick={onCancel}><Icon name="back" size={20} />最近</button></header>
      <div className="compose-scroll">
        <textarea className="compose-text" value={text} onChange={event => setText(event.target.value)} placeholder="写一句就可以，也可以只留下照片或声音。" aria-label="记录内容" />
        {images.length > 0 && <div className="compose-images" aria-label="已选照片">{images.map((image, index) => <div key={image.src} className="compose-image"><img src={image.src} alt={image.alt} /><button onClick={() => { URL.revokeObjectURL(image.src); setImages(previous => previous.filter(item => item.src !== image.src)); }} aria-label={`移除第${index + 1}张照片`}><Icon name="close" size={14} /></button></div>)}</div>}
        <div className="compose-voice"><button className={recording ? "is-recording" : ""} onClick={startRecording}><Icon name="mic" size={19} /><span>{recording ? `结束录音 · ${seconds}秒` : voice ? "重新录音" : "录音"}</span></button>{voice && !recording && <div className="compose-voice-preview"><audio src={voice.url} controls aria-label="试听录音" /><button onClick={() => { URL.revokeObjectURL(voice.url!); setVoice(null); }} aria-label="移除录音"><Icon name="close" size={16} /></button></div>}{micError && <p className="compose-error" role="alert">{micError}</p>}</div>
        <section className="compose-section"><button className="compose-section-toggle" onClick={() => setFeelingsOpen(!feelingsOpen)} aria-expanded={feelingsOpen}><span>当时的感受</span><Icon name={feelingsOpen ? "up" : "down"} size={18} /></button>{feelingsOpen && <div className="compose-feelings">{feelings.map(value => <button key={value} className={feeling === value ? "chosen" : ""} aria-pressed={feeling === value} onClick={() => setFeeling(feeling === value ? undefined : value)}>{value}</button>)}</div>}</section>
        <section className="compose-section compose-date-section"><button className="compose-section-toggle" onClick={() => setDateOpen(!dateOpen)} aria-expanded={dateOpen}><span>发生日期<strong>{date === today ? "今天" : date.replace(/-/g, ".")}</strong></span><Icon name={dateOpen ? "up" : "down"} size={18} /></button>{dateOpen && <div className="compose-date-picker"><label htmlFor="occurred-date">选择发生日期</label><input id="occurred-date" type="date" max={today} value={date} onChange={event => setDate(event.target.value)} /><button onClick={() => { setDate(today); setDateOpen(false); }}>今天</button></div>}</section>
      </div>
      <footer className="compose-toolbar"><div className="compose-media"><input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={event => { addPhotos(event.target.files); event.target.value = ""; }} aria-label="拍摄照片" /><input ref={photosRef} type="file" accept="image/*" multiple onChange={event => { addPhotos(event.target.files); event.target.value = ""; }} aria-label="选择照片" /><button onClick={() => cameraRef.current?.click()}><Icon name="camera" size={19} />拍摄</button><button onClick={() => photosRef.current?.click()}><Icon name="photo" size={19} />照片</button></div><button className="compose-save" onClick={save} disabled={recording || (!text.trim() && !images.length && !voice)}>留下</button></footer>
    </div>
  </div>;
}

function detailDateLabel(record: RecordItem) {
  if (record.id.startsWith("saved-")) return `记录于今天 · ${record.time}`;
  if (record.id.startsWith("unknown")) return "发生时间未确认";
  const day = days.find(item => item.records.some(entry => entry.id === record.id));
  return day ? `${day.id} · ${record.time}` : record.time;
}

type SettingsView = "main" | "cloud" | "identity" | "payment" | "history";

function SettingsPage({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<SettingsView>("main");
  const [faceIdPreference, setFaceIdPreference] = useState(() => {
    try { return window.localStorage.getItem("lampy-face-id-preference") === "true"; }
    catch { return false; }
  });
  const toggleFaceId = () => {
    const next = !faceIdPreference;
    setFaceIdPreference(next);
    try { window.localStorage.setItem("lampy-face-id-preference", String(next)); } catch { /* The preference still works for this session. */ }
  };
  const titles: Record<SettingsView, string> = { main: "设置", cloud: "数据云同步", identity: "认证信息", payment: "付费与权益", history: "付费记录" };
  const row = (icon: string, title: string, subtitle: string, target: SettingsView) => <button className="settings-row" onClick={() => setView(target)}>
    <span className="settings-row-icon"><Icon name={icon} size={19} /></span><span className="settings-row-text"><strong>{title}</strong><small>{subtitle}</small></span><Icon name="next" size={17} />
  </button>;

  return <div className="overlay" role="dialog" aria-modal="true" aria-label={titles[view]}>
    <div className="modal settings-modal">
      <header className="settings-header"><button onClick={() => view === "main" ? onClose() : setView("main")}><Icon name="back" size={19} />{view === "main" ? "最近" : "设置"}</button><span>{titles[view]}</span><span className="settings-header-spacer" /></header>
      <div className="settings-scroll">
        {view === "main" ? <>
          <div className="settings-intro"><span className="brand-sun" /><h2>Lampy</h2><p>把生活，留给自己。</p></div>
          <section className="settings-group"><h3>隐私与数据</h3>
            <div className="settings-row settings-switch-row"><span className="settings-row-icon"><Icon name="face" size={19} /></span><span className="settings-row-text"><strong>Face ID</strong><small>{faceIdPreference ? "偏好已开启 · 等待原生验证接入" : "原生验证待接入"}</small></span><button className="settings-switch" role="switch" aria-label="Face ID 偏好" aria-checked={faceIdPreference} onClick={toggleFaceId}><span /></button></div>
            {faceIdPreference && <p className="settings-inline-note">当前仅保存开关偏好；此网页预览不能启用系统 Face ID。</p>}
            {row("cloud", "数据云同步", "未连接", "cloud")}
          </section>
          <section className="settings-group"><h3>账户与权益</h3>
            {row("identity", "认证信息", "查看当前认证状态", "identity")}
            {row("wallet", "付费与权益", "查看可用服务", "payment")}
            {row("receipt", "付费记录", "查看购买历史", "history")}
          </section>
        </> : <div className="settings-detail">
          <div className="settings-detail-icon"><Icon name={view === "cloud" ? "cloud" : view === "identity" ? "identity" : view === "payment" ? "wallet" : "receipt"} size={25} /></div>
          <h2>{titles[view]}</h2>
          {view === "cloud" && <><p>让记录留在你选择的地方。</p><div className="settings-info-list"><div><span>同步状态</span><strong>未连接</strong></div><div><span>云服务</span><strong>尚未接入</strong></div></div><p className="settings-detail-note">当前预览尚未连接云服务，无法上传、下载或恢复记录。接入 iOS 云服务后才可开启同步。</p></>}
          {view === "identity" && <><p>了解当前的身份与保护状态。</p><div className="settings-info-list"><div><span>账户认证</span><strong>未登录</strong></div><div><span>Face ID 偏好</span><strong>{faceIdPreference ? "已选择开启" : "未开启"}</strong></div><div><span>设备验证</span><strong>尚未接入</strong></div></div><p className="settings-detail-note">这里不展示或保存密码、面容数据等敏感信息。</p></>}
          {view === "payment" && <><p>关于 Lampy 的付费与权益。</p><div className="settings-info-list"><div><span>当前权益</span><strong>未提供付费服务</strong></div><div><span>购买入口</span><strong>尚未开放</strong></div></div><p className="settings-detail-note">此预览不提供实际购买或扣款。上线前需接入并验证平台支付流程。</p><button className="settings-text-link" onClick={() => setView("history")}>查看付费记录 <Icon name="next" size={16} /></button></>}
          {view === "history" && <><p>每一笔付费，都应清楚可查。</p><div className="settings-empty"><Icon name="receipt" size={25} /><span>暂无付费记录</span><small>没有可展示的购买项目</small></div><p className="settings-detail-note">尚未连接支付服务，因此这里不会显示或伪造交易信息。</p></>}
        </div>}
      </div>
    </div>
  </div>;
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
  const [saved, setSaved] = useState<RecordItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const recentScroll = useRef<HTMLDivElement>(null);
  const lookbackScroll = useRef<HTMLDivElement>(null);
  const allRecords = [...days.flatMap(day => day.records), ...saved];
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
  const saveDraft = (record: RecordItem) => {
    setSaved(previous => [record, ...previous]);
    setCompose(false); setMobilePage("recent");
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
              {saved.length > 0 && <><div className="section-heading"><div><span className="section-prefix">记录于</span><h3>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date())} <small>{new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date())}</small></h3></div><span className="section-year">{new Date().getFullYear()}</span></div>{saved.map(item => renderRecord(item, "recent"))}</>}
              <div className="section-heading"><div><span className="section-prefix">记录于</span><h3>6月18日 <small>星期三</small></h3></div><span className="section-year">2025</span></div>
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
    {detail && <div className="overlay" role="dialog" aria-modal="true" aria-label="完整记录"><div className="modal detail-modal"><div className="modal-bar"><button onClick={() => setDetail(null)}><Icon name="back" size={19} /> 返回</button><span>完整记录</span><span className="modal-spacer" /></div><div className="modal-scroll"><span className="section-prefix">{detailDateLabel(detail)}</span>{detail.occurred && <p className="detail-occurred">{detail.occurred}</p>}<div className="detail-content">{detail.text && <p>{detail.text}</p>}{detail.images?.map((image, i) => <RecordPhoto key={i} {...image} />)}{detail.audio && <AudioRow audio={detail.audio} active={activeId === detail.audio.id} progress={progress[detail.audio.id] ?? 0} onToggle={() => toggleAudio(detail.audio!.id)} />}{detail.feeling && <span className="feeling"><i />{detail.feeling}</span>}</div></div></div></div>}
    {compose && <ComposePage onCancel={() => setCompose(false)} onSave={saveDraft} />}
    {settingsOpen && <SettingsPage onClose={() => setSettingsOpen(false)} />}
  </div>{showSplash && <Splash onEnter={() => setShowSplash(false)} />}</>;
}

export default App;
