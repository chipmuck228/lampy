import { useEffect, useState } from "react";

const chapters = [
  {
    number: "01",
    name: "留下",
    eyebrow: "为平常的生活，留一点位置",
    title: <>日子，不必<br />特别才值得<br /><em>留下。</em></>,
    description: "自己的生活记录，不必写成故事。\n只是把这一刻，轻轻留给自己。",
    image: "https://images.unsplash.com/photo-1763037583719-1230a5033730?w=1400&q=85",
    alt: "午后的阳光落在窗边的咖啡桌上",
    imageNote: "一杯咖啡，一段午后。",
  },
  {
    number: "02",
    name: "最近",
    eyebrow: "刚留下的生活，在这里相遇",
    title: <>轻轻扫过，<br />也能看见<br /><em>日子的样子。</em></>,
    description: "文字、照片和声音，照着它们原来的样子。\n想再读一遍的时候，随时停下来。",
    image: "https://images.unsplash.com/photo-1762960070624-92864239a639?w=1200&q=85",
    alt: "窗边晨光里的白色花朵",
    imageNote: "今天，也有想记住的光。",
  },
  {
    number: "03",
    name: "回看",
    eyebrow: "从一个日子，继续读起",
    title: <>不必翻找，<br />从一个日子<br /><em>继续读起。</em></>,
    description: "回到那一天，慢慢读完那一天。\n过往就在这里，允许停留。",
    image: "https://images.unsplash.com/photo-1759960034642-6fbdef7fb9e6?w=1200&q=85",
    alt: "窗台上的植物和一盏灯",
    imageNote: "有些日子，值得再坐一会儿。",
  },
];

export default function Splash({ onEnter }: { onEnter: () => void }) {
  const [page, setPage] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const chapter = chapters[page];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    chapters.slice(1).forEach(({ image }) => {
      const preload = new Image();
      preload.src = image;
    });
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(onEnter, reducedMotion ? 0 : 720);
    return () => window.clearTimeout(timer);
  }, [leaving, onEnter]);

  const advance = () => {
    if (leaving) return;
    if (page < chapters.length - 1) setPage(page + 1);
    else setLeaving(true);
  };

  return <div className={`splash ${leaving ? "splash-leaving" : ""}`} role="dialog" aria-modal="true" aria-label="Lampy 开场">
    <div className="splash-paper">
      <div className="splash-status" aria-hidden="true"><span>9:41</span><div className="splash-status-icons"><span className="signal" /><span className="wifi" /><span className="battery" /></div></div>
      <header className="splash-header">
        <div className="splash-logo"><span className="splash-sun" /> <span>Lampy</span></div>
        <span className="splash-header-note">{chapter.number} <span>/</span> 03</span>
      </header>

      <div className="splash-photo-wrap" key={`photo-${page}`}>
        <img src={chapter.image} alt={chapter.alt} className="splash-photo" />
        <div className="splash-photo-shade" />
        <span className="splash-photo-note">{chapter.imageNote}</span>
      </div>

      <main className="splash-content" key={`content-${page}`} aria-live="polite">
        <div className="splash-index"><span className="splash-index-line" /><span>{chapter.name}</span><span className="splash-index-subtitle">自己的生活记录</span></div>
        <div className="splash-copy">
          <p className="splash-eyebrow">{chapter.eyebrow}</p>
          <h1>{chapter.title}</h1>
          <p className="splash-description">{chapter.description}</p>
        </div>
        <div className="splash-actions">
          <div className="splash-action-top">
            <div className="splash-steps" aria-label={`第 ${page + 1} 屏，共 3 屏`}>
              {chapters.map((item, index) => <span key={item.number} className={index <= page ? "filled" : ""} />)}
            </div>
            {page > 0 && <button className="splash-back" onClick={() => setPage(page - 1)} aria-label="上一屏">上一屏</button>}
          </div>
          <button autoFocus className="splash-next" onClick={advance}>
            <span>{page === 2 ? "进入 Lampy" : "继续"}</span>
            <svg className="splash-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
          </button>
        </div>
      </main>
      <div className="splash-home-indicator" aria-hidden="true" />
    </div>
  </div>;
}
