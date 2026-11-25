import {printPhotoGroups} from './album-print-photo-plan';
import {photoRatio,PUBLICATION_COPY,PUBLICATION_VERSION} from './album-publication';
import { appLanguage, dateLabel, tr, feelingLabel } from '../i18n';
import {
  calendarPartsAt,
  parseMillis,
  type HistoryClock,
} from '../domain-adapters/calendar';
import { feelingAccentColor, isFeelingWord } from './feeling-accent';
import {
  ALBUM_IMAGE_MISSING,
  ALBUM_SOURCE_GONE,
  ALBUM_SOURCE_UNREADABLE,
  ALBUM_SOURCE_CHANGED,
  ALBUM_AUDIO_LABEL,
  ALBUM_AUDIO_MISSING,
  ALBUM_CLOSE_TEXT,
  ALBUM_CONTENT_HEIGHT_PT,
  ALBUM_CONTENT_WIDTH_PT,
  ALBUM_CONTINUED,
  ALBUM_FONTS,
  ALBUM_LAYOUT_VERSION,
  ALBUM_MARGIN_BOTTOM_PT,
  ALBUM_MARGIN_TOP_PT,
  ALBUM_MARGIN_X_PT,
  ALBUM_PAGE_HEIGHT_PT,
  ALBUM_PAGE_WIDTH_PT,
  ALBUM_RECORD_GAP_PT,
  ALBUM_SERIF_FONT,
  ALBUM_SERIF_LICENSE,
  ALBUM_TIME_UNKNOWN,
  ALBUM_UI_FONT,
  ALBUM_UI_LICENSE,
  type AlbumLayout,
  type AlbumPage,
  type AlbumPlacedBlock,
  type AlbumSourceFingerprint,
  type AlbumTextLine,
} from './album-layout';
import type { AlbumLayoutInput, AlbumLayoutRecordInput } from './album-layout-input';
import { albumBodyRole, albumCoverRole, albumDateRole, albumMetaRole, spaceForWrappedChunk, type AlbumTextMeasurer } from './album-text-measure';
import { albumSliceCodePoints } from './album-unicode';
import type { LifeAlbum } from './life-album';
import { diagnoseAlbumFonts } from '../../modules/lampy-album-layout';

function albumResolvedFontFaces(): Pick<AlbumLayout['fontFaces'], 'resolvedSerif' | 'resolvedUi'> {
  const diagnosis = diagnoseAlbumFonts(ALBUM_SERIF_FONT, ALBUM_UI_FONT);
  if (!diagnosis) return {};
  return {
    resolvedSerif: {
      requested: diagnosis.serif.requested,
      familyName: diagnosis.serif.familyName,
      fontName: diagnosis.serif.fontName,
      matchedRequestedFamily: diagnosis.serif.matchedRequestedFamily,
      usedSystemFallback: diagnosis.serif.usedSystemFallback,
    },
    resolvedUi: {
      requested: diagnosis.ui.requested,
      familyName: diagnosis.ui.familyName,
      fontName: diagnosis.ui.fontName,
      matchedRequestedFamily: diagnosis.ui.matchedRequestedFamily,
      usedSystemFallback: diagnosis.ui.usedSystemFallback,
    },
  };
}

const CONTENT_TOP = ALBUM_MARGIN_TOP_PT;
const CONTENT_LEFT = ALBUM_MARGIN_X_PT;
const CONTENT_BOTTOM = ALBUM_MARGIN_TOP_PT + ALBUM_CONTENT_HEIGHT_PT;

function durationLabel(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return '';
  const total = Math.round(durationMs / 1000);
  if (total < 60) return tr('{0}秒', [total]);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function dateKeyAndLabel(record: AlbumLayoutRecordInput, clock: HistoryClock) {
  const precision = record.occurredAtPrecision || 'unknown';
  if (precision === 'unknown' || !record.occurredAt) return { key: null as string | null, label: null as string | null };
  const millis = parseMillis(record.occurredAt);
  if (millis == null) return { key: null, label: null };
  const parts = calendarPartsAt(millis, clock);
  if (precision === 'year') return { key: `y:${parts.year}`, label: tr('{0}年', [parts.year]) };
  if (precision === 'month') return { key: `m:${parts.year}-${parts.month}`, label: dateLabel(parts.year, parts.month) };
  return {
    key: `d:${parts.year}-${parts.month}-${parts.day}`,
    label: dateLabel(parts.year, parts.month, parts.day),
  };
}

export function recordedLabel(record: AlbumLayoutRecordInput, clock: HistoryClock): string | null {
  const millis = parseMillis(record.recordedAt);
  if (millis == null) return null;
  const parts = calendarPartsAt(millis, clock);
  return tr('记录于 {0}', [dateLabel(parts.year, parts.month, parts.day)]);
}

function imageSize(ratio: number | null, maxHeightPt = ALBUM_CONTENT_HEIGHT_PT) {
  const safe = ratio && ratio > 0 ? ratio : 1;
  const maxHeight = Math.max(48, Math.min(maxHeightPt, ALBUM_CONTENT_HEIGHT_PT));
  let widthPt = ALBUM_CONTENT_WIDTH_PT;
  let heightPt = widthPt / safe;
  if (heightPt > maxHeight) {
    heightPt = maxHeight;
    widthPt = heightPt * safe;
  }
  return { widthPt, heightPt };
}

export function fingerprintFromInput(album: LifeAlbum, input: AlbumLayoutInput): AlbumSourceFingerprint {
  return {
    language: appLanguage,
    fontPolicy: `${ALBUM_SERIF_FONT}|${ALBUM_UI_FONT}|${ALBUM_LAYOUT_VERSION}`,
    name: album.name,
    opening: album.opening,
    cover: album.cover,
    entryOrder: input.entries.map((entry) => entry.momentId),
    moments: input.entries.map((entry) => ({
      momentId: entry.momentId,
      presence: entry.presence,
      revision: entry.revision,
      media: entry.media.map((item) => ({
        assetId: item.assetId,
        role: item.role,
        availability: item.availability,
      })),
    })),
  };
}

export async function paginateAlbumLayout(
  input: AlbumLayoutInput,
  measurer: AlbumTextMeasurer,
  options: { generatedAt: string; timezone: HistoryClock; publication?:boolean },
): Promise<AlbumLayout> {
  const pages: AlbumPage[] = [];
  let blocks: AlbumPlacedBlock[] = [];
  let y = CONTENT_TOP;
  let printedDateKey: string | null = null;
  let printedDateLabel: string | null = null;
  const album = input.album;

  function commitPage() {
    if (!blocks.length) return;
    pages.push({ index: pages.length, blocks });
    blocks = [];
    y = CONTENT_TOP;
  }

  function remaining() {
    return CONTENT_BOTTOM - y;
  }

  function startPageIfNeeded(needed: number) {
    if (blocks.length > 0 && remaining() < needed) commitPage();
  }

  function place(block: AlbumPlacedBlock, heightPt: number) {
    startPageIfNeeded(heightPt);
    const next = { ...block, box: { ...block.box, yPt: y } };
    blocks.push(next);
    y += heightPt;
  }

  async function placeWrapped(
    kind: 'cover-name' | 'opening' | 'note',
    text: string,
    extra: { albumId?: string; momentId?: string; revision?: number },
  ) {
    const role = kind === 'cover-name' ? albumCoverRole : albumBodyRole;
    const decorated=options.publication&&kind==='note'&&!blocks.some(b=>b.kind==='image'||b.kind==='audio');
    const measured = await measurer.measure(text, role, ALBUM_CONTENT_WIDTH_PT-(decorated?44:0));
    let cursor = 0;
    let firstChunk = true;
    while (cursor < measured.length) {
      const needsContinued = !options.publication && kind === 'note' && !firstChunk && !!extra.momentId && !!printedDateKey;
      const continuedHeight = needsContinued ? albumDateRole.lineHeightPt : 0;
      if (
        blocks.length > 0 &&
        spaceForWrappedChunk({
          remainingPt: remaining(),
          lineHeightPt: role.lineHeightPt,
          continuedHeightPt: blocks.some((block) => block.kind === 'day-rule') ? 0 : continuedHeight,
        }).commit
      ) {
        commitPage();
      }
      if (needsContinued && extra.momentId && printedDateKey && !blocks.some((block) => block.kind === 'day-rule')) {
        if (remaining() < albumDateRole.lineHeightPt + role.lineHeightPt) commitPage();
        blocks.push({
          kind: 'day-rule',
          momentId: extra.momentId,
          dateKey: printedDateKey,
          text: `${printedDateLabel ?? printedDateKey} · ${ALBUM_CONTINUED}`,
          continued: true,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumDateRole.lineHeightPt },
        });
        y += albumDateRole.lineHeightPt;
      }
      if (remaining() < role.lineHeightPt) {
        if (blocks.length > 0) commitPage();
      }
      const room = Math.floor((remaining()-(decorated?14:0)) / role.lineHeightPt);
      let take = Math.min(Math.max(room, 0), measured.length - cursor, options.publication&&kind==='note'?9:Infinity);
      if (kind !== 'cover-name' && measured.length - cursor > 1) {
        if (take < 2 && blocks.length > 0) { commitPage(); continue; }
        if (measured.length - cursor - take === 1 && take > 2) take -= 1;
      }
      if (take < 1) {
        if (blocks.length > 0) {
          commitPage();
          continue;
        }
        break;
      }
      const chunk = measured.slice(cursor, cursor + take);
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      const slice = albumSliceCodePoints(text, start, end);
      const lines: AlbumTextLine[] = chunk.map((line, index) => ({
        start: line.start - start,
        end: line.end - start,
        xPt: CONTENT_LEFT,
        yPt: y + index * role.lineHeightPt+(decorated?14:0),
        widthPt: line.widthPt,
        heightPt: line.heightPt,
        baselineYPt: y + index * role.lineHeightPt + line.ascentPt+(decorated?14:0),
      }));
      const height = take * role.lineHeightPt+(decorated?14:0);
      const box = { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: height };
      const range = { start, end, unit: 'unicode-scalar' as const };
      if (kind === 'note' && extra.momentId && extra.revision != null) {
        const glyph=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(slice)][0]?.segment:Array.from(slice)[0];
        const initial=decorated&&glyph&&!/^\s/.test(glyph)?glyph:null;
        const initialLines=initial?await measurer.measure(initial,{...role,sizePt:34,lineHeightPt:44},44):[];
        const printInitial=initial&&initialLines.length===1&&initialLines[0].widthPt<=44&&Array.from(initial).length<=lines[0].end?{scalars:Array.from(initial).length,widthPt:44,sizePt:34}:undefined;
        blocks.push({ kind, box, text: slice, textRange: range, lines, momentId: extra.momentId, revision: extra.revision,...(printInitial?{printInitial}:{}) });
      } else if (kind === 'opening' && extra.albumId) {
        blocks.push({ kind, box, text: slice, textRange: range, lines, albumId: extra.albumId });
      } else if (kind === 'cover-name' && extra.albumId) {
        blocks.push({ kind, box, text: slice, textRange: range, lines, albumId: extra.albumId });
      }
      y += height;
      cursor += take;
      firstChunk = false;
      if(decorated&&cursor<measured.length){commitPage();y=100;}
    }
  }

  const nameY = album.cover.kind === 'image' ? CONTENT_TOP + ALBUM_CONTENT_HEIGHT_PT * 0.55 + 16 : CONTENT_TOP + 72;
  if (album.cover.kind === 'image') {
    const cover = album.cover;
    const coverMedia = input.entries
      .find((entry) => entry.momentId === cover.momentId)
      ?.media.find((item) => item.assetId === cover.assetId);
    const size = imageSize(coverMedia?.intrinsicRatio ?? 1.4);
    const imageHeight = Math.min(size.heightPt, ALBUM_CONTENT_HEIGHT_PT * 0.55);
    const imageWidth = imageHeight * (size.widthPt / size.heightPt);
    blocks.push({
      kind: 'cover-image',
      albumId: album.id,
      momentId: cover.momentId,
      assetId: cover.assetId,
      status: coverMedia?.availability === 'available' ? 'available' : 'missing',
      intrinsicRatio: coverMedia?.intrinsicRatio ?? null,
      box: {
        xPt: CONTENT_LEFT + (ALBUM_CONTENT_WIDTH_PT - imageWidth) / 2,
        yPt: CONTENT_TOP,
        widthPt: imageWidth,
        heightPt: imageHeight,
      },
    });
  }
  y = nameY;
  await placeWrapped('cover-name', album.name, { albumId: album.id });
  commitPage();

  if (album.opening) {
    await placeWrapped('opening', album.opening, { albumId: album.id });
    commitPage();
  }

  let publicationChapter:string|null=null,publicationOrdinal=0;
  for (const record of input.entries) {
    if (record.presence === 'missing') {
      place(
        {
          kind: 'source-gone',
          momentId: record.momentId,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt + ALBUM_RECORD_GAP_PT,
      );
      continue;
    }
    if (record.presence === 'unreadable') {
      place(
        {
          kind: 'source-unreadable',
          momentId: record.momentId,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt + ALBUM_RECORD_GAP_PT,
      );
      continue;
    }

    if(options.publication)commitPage();
    const dated = dateKeyAndLabel(record, options.timezone);
    if(options.publication){
      const parts=/^[dmy]:(\d{4})(?:-(\d{1,2}))?/.exec(dated.key??'');
      const key=parts?parts.slice(1).filter(Boolean).join('-'):'unknown';
      if(key!==publicationChapter){
        commitPage();y=CONTENT_TOP;publicationChapter=key;printedDateKey=null;printedDateLabel=null;
        const title=parts?(parts[2]?dateLabel(Number(parts[1]),Number(parts[2])):tr('{0}年',[Number(parts[1])])):ALBUM_TIME_UNKNOWN;
        pages.push({index:pages.length,blocks:[],publication:{version:PUBLICATION_VERSION,kind:'chapter',title,eyebrow:PUBLICATION_COPY[appLanguage].chapter,line:'',ordinal:String(++publicationOrdinal).padStart(2,'0')}});
      }
    }
    if (!dated.key) { printedDateKey = null; printedDateLabel = null; }
    const showDate = !!dated.key && dated.key !== printedDateKey;
    if (showDate && remaining() < albumDateRole.lineHeightPt + albumBodyRole.lineHeightPt * 2) commitPage();
    if (showDate && dated.key && dated.label) {
      place(
        {
          kind: 'day-rule',
          momentId: record.momentId,
          dateKey: dated.key,
          text: dated.label,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumDateRole.lineHeightPt },
        },
        albumDateRole.lineHeightPt,
      );
      printedDateKey = dated.key;
      printedDateLabel = dated.label;
    }

    if(record.attribution) {
      const lines=await measurer.measure(record.attribution,albumMetaRole,ALBUM_CONTENT_WIDTH_PT);
      for(const line of lines)place({kind:'recorded-at',momentId:record.momentId,label:albumSliceCodePoints(record.attribution,line.start,line.end),
        box:{xPt:CONTENT_LEFT,yPt:y,widthPt:ALBUM_CONTENT_WIDTH_PT,heightPt:albumMetaRole.lineHeightPt}},albumMetaRole.lineHeightPt);
    }
    const images = record.media.filter((item) => item.role === 'image');
    const shortPrintNote=!!(options.publication&&record.note.trim()&&images.length&&record.media.every(m=>m.role==='image')&&(await measurer.measure(record.note,albumBodyRole,ALBUM_CONTENT_WIDTH_PT-44)).length<=2);
    if (record.note && !options.publication) {
      await placeWrapped('note', record.note, { momentId: record.momentId, revision: record.revision ?? 0 });
    }

    if(options.publication){
      const placePhotoGroup=(items:typeof images)=>{
        if(blocks.some(b=>b.kind==='image'||b.kind==='audio'))commitPage();
        const area={xPt:CONTENT_LEFT,yPt:Math.max(100,y+18),widthPt:ALBUM_CONTENT_WIDTH_PT,heightPt:CONTENT_BOTTOM-Math.max(100,y+18)-64-(shortPrintNote?98:0)};
        let offset=0;
        for(const group of printPhotoGroups(items,area)){
          if(offset)commitPage();
          group.forEach(box=>{const image=items[offset++];blocks.push({kind:'image',momentId:record.momentId,assetId:image.assetId,status:image.availability==='available'?'available':'missing',intrinsicRatio:photoRatio(image),box});});
          y=Math.max(...group.map(b=>b.yPt+b.heightPt))+20;
        }
      };
      for(let i=0;i<record.media.length;i++){
        const item=record.media[i];
        if(item.role==='image'){
          const run:typeof images=[];while(i<record.media.length&&record.media[i].role==='image'){run.push(record.media[i]);i++;}i--;
          for(let start=0;start<run.length;start+=4)placePhotoGroup(run.slice(start,start+4));
        }else if(item.role==='audio'){
          const time=durationLabel(item.durationMs);place({kind:'audio',momentId:record.momentId,assetId:item.assetId,status:item.availability,durationMs:item.durationMs,printHint:tr('PDF 仅保留声音信息'),text:`${ALBUM_AUDIO_LABEL}${time?` · ${time}`:''}`,box:{xPt:CONTENT_LEFT,yPt:y,widthPt:ALBUM_CONTENT_WIDTH_PT,heightPt:48}},48);
        }
      }
    }
    if(options.publication&&record.note){
      if(!shortPrintNote&&blocks.some(b=>b.kind==='image'||b.kind==='audio'))commitPage();
      y=Math.max(100,y+20);
      await placeWrapped('note',record.note,{momentId:record.momentId,revision:record.revision??0});
    }

    for (const image of options.publication?[]:images) {
      if (blocks.length > 0 && remaining() < 80 && blocks[blocks.length - 1]?.kind !== 'day-rule') {
        commitPage();
      }
      const size = imageSize(image.intrinsicRatio, remaining() - 8);
      blocks.push({
        kind: 'image',
        momentId: record.momentId,
        assetId: image.assetId,
        status: image.availability === 'available' ? 'available' : 'missing',
        intrinsicRatio: image.intrinsicRatio,
        box: { xPt: CONTENT_LEFT, yPt: y, widthPt: size.widthPt, heightPt: size.heightPt },
      });
      y += size.heightPt + 8;
    }

    for (const audio of options.publication?[]:record.media.filter((item) => item.role === 'audio')) {
      const time = durationLabel(audio.durationMs);
      const missing = audio.availability !== 'available';
      place(
        {
          kind: 'audio',
          momentId: record.momentId,
          assetId: audio.assetId,
          status: audio.availability,
          durationMs: audio.durationMs,
          printHint: tr('在电子册中听'),
          text: missing
            ? `${ALBUM_AUDIO_MISSING}${time ? ` · ${time}` : ''}`
            : `${ALBUM_AUDIO_LABEL}${time ? ` · ${time}` : ''}`,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: 48 },
        },
        48,
      );
    }

    for (const unknown of record.media.filter((item) => item.role === 'unknown')) {
      place(
        {
          kind: 'unknown-media',
          momentId: record.momentId,
          assetId: unknown.assetId,
          label: tr("还有一种现在打不开的媒介。"),
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }

    if (record.feeling.trim()&&!options.publication) {
      place(
        {
          kind: 'feeling',
          momentId: record.momentId,
          value: feelingLabel(record.feeling.trim()),
          accent: feelingAccentColor({ value: record.feeling.trim(), label: record.feeling.trim(), known: isFeelingWord(record.feeling.trim()) }),
          known: isFeelingWord(record.feeling.trim()),
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }

    if (!dated.key) {
      const recorded = recordedLabel(record, options.timezone);
      place(
        {
          kind: 'recorded-at',
          momentId: record.momentId,
          label: recorded ? `${ALBUM_TIME_UNKNOWN} · ${recorded}` : ALBUM_TIME_UNKNOWN,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }

    if (record.revision != null && record.revision !== record.sourceRevisionAtCollect) {
      place(
        {
          kind: 'source-changed',
          momentId: record.momentId,
          box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: albumMetaRole.lineHeightPt },
        },
        albumMetaRole.lineHeightPt,
      );
    }
    y += ALBUM_RECORD_GAP_PT;
  }

  commitPage();
  y = CONTENT_TOP + 80;
  place(
    {
      kind: 'close',
      text: ALBUM_CLOSE_TEXT,
      box: { xPt: CONTENT_LEFT, yPt: y, widthPt: ALBUM_CONTENT_WIDTH_PT, heightPt: ALBUM_FONTS.body.lineHeightPt },
    },
    ALBUM_FONTS.body.lineHeightPt,
  );
  commitPage();

  return {
    albumId: album.id,
    language: appLanguage,
    layoutVersion: ALBUM_LAYOUT_VERSION,
    pageSize: { widthPt: ALBUM_PAGE_WIDTH_PT, heightPt: ALBUM_PAGE_HEIGHT_PT },
    margins: {
      topPt: ALBUM_MARGIN_TOP_PT,
      rightPt: ALBUM_MARGIN_X_PT,
      bottomPt: ALBUM_MARGIN_BOTTOM_PT,
      leftPt: ALBUM_MARGIN_X_PT,
    },
    fonts: ALBUM_FONTS,
    fontFaces: {
      serif: ALBUM_SERIF_FONT,
      ui: ALBUM_UI_FONT,
      serifLicense: ALBUM_SERIF_LICENSE,
      uiLicense: ALBUM_UI_LICENSE,
      ...albumResolvedFontFaces(),
    },
    sourceFingerprint: fingerprintFromInput(album, input),
    albumUpdatedAt: album.updatedAt,
    generatedAt: options.generatedAt,
    unicodeUnit: 'unicode-scalar',
    pages: pages.map(page => ({ ...page, rendering: {
      serif: ALBUM_SERIF_FONT, ui: ALBUM_UI_FONT, pageCount: pages.length, pageNumbers: true,
      copy: { imageMissing: ALBUM_IMAGE_MISSING, sourceGone: ALBUM_SOURCE_GONE,
        sourceUnreadable: ALBUM_SOURCE_UNREADABLE, sourceChanged: ALBUM_SOURCE_CHANGED },
    } })),
  };
}
