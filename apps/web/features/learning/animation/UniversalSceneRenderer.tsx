'use client';

import katex from 'katex';
import { Icon } from '@iconify/react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { RenderObject, SceneSnapshot } from './universalSceneInterpreter';
import { snapshotScene } from './universalSceneInterpreter';
import { sceneVisualProgress } from './scenePlayback';
import type { AspectRatio, VisualScene } from './types';

type UniversalSceneRendererProps = {
  progress: number;
  scene: VisualScene;
};

type SceneFrame = { width: number; height: number };

type SceneStageMetrics = {
  height: number;
  labelScale: number;
  pxPerUnit: number;
  width: number;
};

const defaultStageMetrics: SceneStageMetrics = {
  height: 0,
  labelScale: 1,
  pxPerUnit: 0,
  width: 0,
};

// Fixed design canvas for HTML scenes: ~1280px wide for 16:9 (160 units * 8),
// ~720x1280 for 9:16. The iframe always renders at this large, content-fits size
// and is transform-scaled down to smaller players so they mirror the big layout.
const HTML_DESIGN_PX_PER_UNIT = 8;

const referenceStageWidth: Record<AspectRatio, number> = {
  '16:9': 500,
  '9:16': 405,
};

const useSceneStageMetrics = (
  sceneWidth: number,
  sceneHeight: number,
  aspectRatio: AspectRatio
): [RefObject<HTMLDivElement | null>, SceneStageMetrics] => {
  const ref = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState(defaultStageMetrics);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    let animationFrame = 0;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const sceneAspect = sceneWidth / sceneHeight;
      const containerAspect = rect.width / rect.height;
      const width = containerAspect > sceneAspect ? rect.height * sceneAspect : rect.width;
      const height = width / sceneAspect;
      const pxPerUnit = width / sceneWidth;
      const referencePxPerUnit = referenceStageWidth[aspectRatio] / sceneWidth;
      const rawScale = pxPerUnit / referencePxPerUnit;
      const labelScale = clampNumber(Math.sqrt(rawScale), 0.76, 2.25);

      setMetrics((current) => {
        const changed =
          Math.abs(current.width - width) > 0.5 ||
          Math.abs(current.height - height) > 0.5 ||
          Math.abs(current.labelScale - labelScale) > 0.01;
        return changed ? { height, labelScale, pxPerUnit, width } : current;
      });
    };

    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(update);
    });
    observer.observe(element);
    update();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [aspectRatio, sceneHeight, sceneWidth]);

  return [ref, metrics];
};

export default function UniversalSceneRenderer({ progress, scene }: UniversalSceneRendererProps) {
  const aspectRatio = scene.aspect_ratio === '9:16' ? '9:16' : '16:9';
  const frame: SceneFrame = aspectRatio === '9:16'
    ? { width: 90, height: 160 }
    : { width: 160, height: 90 };
  const [sceneRef, stageMetrics] = useSceneStageMetrics(frame.width, frame.height, aspectRatio);
  const snapshot = useMemo(() => snapshotScene(scene, progress), [progress, scene]);
  const visualProgress = sceneVisualProgress(scene, progress);
  const cameraTransform = cameraSvgTransform(snapshot, frame);
  const stageStyle = stageMetrics.width > 0
    ? { height: `${stageMetrics.height}px`, width: `${stageMetrics.width}px` }
    : { height: '100%', width: '100%' };

  if (scene.animator_json_fallback) {
    return (
      <div ref={sceneRef} className="bestie-universal-scene">
        <div className="bestie-universal-stage relative overflow-hidden" style={{ ...stageStyle, background: 'var(--background)' }}>
          <div
            className="absolute left-1/2 top-[8%] z-10 -translate-x-1/2 rounded-full border border-red-400/45 bg-red-500/15 px-3 py-1 text-[11px] font-medium text-red-300"
            role="status"
          >
            Something went wrong
          </div>
          <StoryTextFallback story={scene.story} />
        </div>
      </div>
    );
  }

  return (
    <div ref={sceneRef} className="bestie-universal-scene">
      <div className="bestie-universal-stage" style={stageStyle}>
        <svg className="bestie-universal-svg" viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="bestie-scene-bg" cx="50%" cy="42%" r="78%">
              <stop offset="0%" stopColor="#111633" />
              <stop offset="48%" stopColor="#080B18" />
              <stop offset="100%" stopColor="#03050C" />
            </radialGradient>
            <filter id="bestie-soft-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feColorMatrix
                in="blur"
                result="glow"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.75 0"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="bestie-strong-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="2.1" result="blur" />
              <feColorMatrix
                in="blur"
                result="glow"
                type="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.9 0"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect x="0" y="0" width={frame.width} height={frame.height} fill="var(--background)" />
          <g transform={cameraTransform}>
            <rect className="bestie-scene-vignette" x="0" y="0" width={frame.width} height={frame.height} />
            {[...snapshot.objects]
              .filter((object) => !htmlLayerElements.has(object.element))
              .sort(depthSort)
              .map((object) => renderSvgObject(object, frame))}
          </g>
        </svg>
        <div className="bestie-universal-label-camera" style={cameraCssTransform(snapshot, frame)}>
          {[...snapshot.objects]
            .filter((object) => htmlLayerElements.has(object.element))
            .sort(depthSort)
            .map((object) => renderHtmlObject(object, stageMetrics, visualProgress, frame, scene.story))}
        </div>
      </div>
    </div>
  );
}

const renderSvgObject = (object: RenderObject, frame: SceneFrame) => {
  if (object.element === 'graph') {
    return <Graph key={object.id} object={object} frame={frame} />;
  }

  if (object.element === 'circle' || object.element === 'dot') {
    const radius = Math.max(0.5, Math.min(object.size[0], object.size[1]) / 2);
    const isDrawingCircle = object.element === 'circle' && object.creationProgress < 0.995;
    return (
      <circle
        key={object.id}
        cx={toSvgX(object.position[0], frame)}
        cy={toSvgY(object.position[1], frame)}
        r={radius}
        fill={object.style === 'filled' || object.element === 'dot' ? object.color : 'none'}
        stroke={object.color}
        strokeWidth={strokeWidth(object.thickness, 0.18)}
        opacity={object.opacity}
        pathLength={isDrawingCircle ? 1 : undefined}
        strokeDasharray={isDrawingCircle ? 1 : undefined}
        strokeDashoffset={isDrawingCircle ? 1 - object.creationProgress : undefined}
        transform={object.element === 'dot' ? `translate(${toSvgX(object.position[0], frame)} ${toSvgY(object.position[1], frame)}) scale(${0.45 + object.creationProgress * 0.55}) translate(${-toSvgX(object.position[0], frame)} ${-toSvgY(object.position[1], frame)})` : undefined}
        filter="url(#bestie-soft-glow)"
      />
    );
  }

  if (object.element === 'polygon') {
    const vertices = Array.isArray(object.value) ? object.value : [];
    const points = vertices
      .filter(isPoint)
      .map((point) => {
        const [x, y] = projectAbsolutePoint(point);
        return `${toSvgX(x, frame)},${toSvgY(y, frame)}`;
      })
      .join(' ');
    return (
      <polygon
        key={object.id}
        points={points}
        fill={(object.style === 'filled' || object.style === 'fill_surface') && object.creationProgress > 0.72 ? object.color : 'none'}
        fillOpacity={object.style === 'fill_surface' ? 0.16 : undefined}
        stroke={object.color}
        strokeWidth={strokeWidth(object.thickness, 0.18)}
        opacity={object.opacity}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - object.creationProgress}
        strokeLinejoin="round"
        filter="url(#bestie-soft-glow)"
      />
    );
  }

  if (object.element === 'line' || object.element === 'arrow') {
    const pointPath = pointsPath(object, frame);
    if (pointPath) {
      const markerId = `arrow-${object.id}`;
      return (
        <g key={object.id} opacity={object.opacity}>
          {object.element === 'arrow' && (
            <defs>
              <marker id={markerId} markerWidth="4.8" markerHeight="4.8" refX="4.2" refY="2.4" orient="auto">
                <path d="M 0 0 L 4.8 2.4 L 0 4.8 z" fill={object.color} />
              </marker>
            </defs>
          )}
          <path
            d={pointPath}
            fill="none"
            stroke={object.color}
            strokeWidth={strokeWidth(object.thickness, 0.2)}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={object.element === 'arrow' ? `url(#${markerId})` : undefined}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - object.creationProgress}
            filter="url(#bestie-strong-glow)"
          />
        </g>
      );
    }

    const x1 = toSvgX(object.position[0] - object.size[0] / 2, frame);
    const y1 = toSvgY(object.position[1] - object.size[1] / 2, frame);
    const x2 = toSvgX(object.position[0] + object.size[0] / 2, frame);
    const y2 = toSvgY(object.position[1] + object.size[1] / 2, frame);
    const markerId = `arrow-${object.id}`;
    return (
      <g key={object.id} opacity={object.opacity}>
        {object.element === 'arrow' && (
          <defs>
            <marker id={markerId} markerWidth="4.8" markerHeight="4.8" refX="4.2" refY="2.4" orient="auto">
              <path d="M 0 0 L 4.8 2.4 L 0 4.8 z" fill={object.color} />
            </marker>
          </defs>
        )}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={object.color}
          strokeWidth={strokeWidth(object.thickness, 0.2)}
          strokeLinecap="round"
          markerEnd={object.element === 'arrow' ? `url(#${markerId})` : undefined}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - object.creationProgress}
          filter="url(#bestie-strong-glow)"
        />
      </g>
    );
  }

  return null;
};

const htmlLayerElements = new Set(['text', 'equation', 'equation_part', 'html', 'icon', 'image']);

const renderHtmlObject = (object: RenderObject, metrics: SceneStageMetrics, progress: number, frame: SceneFrame, story?: string) => {
  if (object.element === 'html') {
    return <HtmlSceneObject key={object.id} metrics={metrics} object={object} progress={progress} frame={frame} story={story} />;
  }

  if (object.element === 'icon') {
    return renderIconObject(object, metrics, frame);
  }

  if (object.element === 'image') {
    return renderImageObject(object, metrics, frame);
  }
  const left = `${((object.position[0] + frame.width / 2) / frame.width) * 100}%`;
  const top = `${((frame.height / 2 - object.position[1]) / frame.height) * 100}%`;
  const text = object.element === 'text' ? String(object.value ?? '') : equationText(object);
  const shouldRenderMath = true;
  const latexText = object.element === 'text'
    ? `\\text{${escapeLatexTextMode(text)}}`
    : cleanLatexText(text);
  const maxWidth = labelMaxWidth(object, metrics);
  const fontSize = labelFontSize(object, metrics, text, shouldRenderMath, maxWidth);
  const boxStyle = labelBoxStyle(object, shouldRenderMath, maxWidth);
  const equationHtml =
    !shouldRenderMath
      ? null
      : katex.renderToString(latexText, {
          displayMode: false,
          throwOnError: false,
          trust: false,
        });

  return (
    <div
      key={object.id}
      className={cnLabel(object, shouldRenderMath)}
      style={{
        color: object.color,
        clipPath: `inset(0 ${Math.max(0, 100 - object.creationProgress * 100)}% 0 0)`,
        filter: `blur(${(1 - object.creationProgress) * 2.2}px)`,
        fontSize,
        left,
        opacity: object.opacity,
        top,
        zIndex: object.z_index,
        ...boxStyle,
      }}
      dangerouslySetInnerHTML={equationHtml ? { __html: equationHtml } : undefined}
    >
      {equationHtml ? null : text}
    </div>
  );
};

const HtmlSceneObject = ({
  metrics,
  object,
  progress,
  frame,
  story,
}: {
  metrics: SceneStageMetrics;
  object: RenderObject;
  progress: number;
  frame: SceneFrame;
  story?: string;
}) => {
  const style = htmlObjectStyle(object, metrics, 'bestie-universal-html-object', frame);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [failedHtml, setFailedHtml] = useState<string | null>(null);
  const html = useMemo(() => htmlDocument(String(object.value ?? '')), [object.value]);
  // Render the iframe at a constant LARGE design canvas (where the LLM's content
  // fits, i.e. the fullscreen look), then uniformly scale it to fill its actual
  // box -- so smaller players show a clean miniature instead of an overflow.
  const frameStyle: CSSProperties = { backgroundColor: 'transparent' };
  if (metrics.pxPerUnit > 0) {
    const scale = metrics.pxPerUnit / HTML_DESIGN_PX_PER_UNIT;
    frameStyle.width = `${Math.max(8, object.size[0] * HTML_DESIGN_PX_PER_UNIT)}px`;
    frameStyle.height = `${Math.max(8, object.size[1] * HTML_DESIGN_PX_PER_UNIT)}px`;
    frameStyle.transform = `scale(${scale})`;
    frameStyle.transformOrigin = 'top left';
  }
  const hasError = failedHtml === html;
  const safeProgress = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.type !== 'BESTIE_HTML_ERROR') {
        return;
      }
      setFailedHtml(html);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [html]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        progress: safeProgress,
        type: 'BESTIE_RENDER_FRAME',
      },
      '*'
    );
  }, [html, safeProgress]);

  return (
    <div key={object.id} className="bestie-universal-html-object" style={style}>
      {hasError ? (
        <StoryTextFallback story={story} />
      ) : (
        <iframe
          ref={iframeRef}
          className="bestie-universal-html-frame"
          sandbox="allow-scripts"
          style={frameStyle}
          srcDoc={html}
          title={`Bestie HTML scene ${object.id}`}
          onError={() => setFailedHtml(html)}
          onLoad={() => {
            iframeRef.current?.contentWindow?.postMessage(
              {
                progress: safeProgress,
                type: 'BESTIE_RENDER_FRAME',
              },
              '*'
            );
          }}
        />
      )}
    </div>
  );
};
const fallbackAccentColors = ['#1DE8B0', '#F4D35E', '#58C4DD', '#FF9E6B'];

const stableTextHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const StoryTextFallback = ({ story }: { story?: string }) => {
  const words = useMemo(() => {
    const text = story?.trim() || 'This part of the lesson continues in the narration.';
    return text.split(/\s+/).map((word, index) => {
      const hash = stableTextHash(`${word}:${index}`);
      return {
        word,
        // Roughly one word in five gets a stable accent color across renders.
        color: hash % 5 === 0 ? fallbackAccentColors[Math.floor(hash / 5) % fallbackAccentColors.length] : '#F5F4FE',
        delay: index * 0.09,
      };
    });
  }, [story]);

  return (
    <div
      className="bestie-universal-html-fallback"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8%',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          maxWidth: '85%',
          fontSize: '1.35em',
          lineHeight: 1.6,
          fontWeight: 500,
        }}
      >
        {words.map(({ word, color, delay }, index) => (
          <span
            key={index}
            className="bestie-fallback-word"
            style={{ color, animationDelay: `${delay}s` }}
          >
            {word}{' '}
          </span>
        ))}
      </p>
    </div>
  );
};

const renderImageObject = (object: RenderObject, metrics: SceneStageMetrics, frame: SceneFrame) => {
  const value = object.value as { url?: string; description?: string } | string | undefined;
  const url = typeof value === 'string' ? value : value?.url ?? '';
  if (!url) {
    return null;
  }
  const description = typeof value === 'object' ? value?.description ?? '' : '';
  const style = htmlObjectStyle(object, metrics, 'bestie-universal-image-object', frame);

  return (
    <div key={object.id} className="bestie-universal-image-object" style={style}>
      {/* Generated scene assets can be data URLs with dimensions controlled by the scene DSL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={description}
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
          // Generated assets come on a black square; screen blending makes the
          // black background disappear against the dark canvas.
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
};

const renderIconObject = (object: RenderObject, metrics: SceneStageMetrics, frame: SceneFrame) => {
  const icon = iconName(String(object.value ?? 'sparkles'));
  const size = Math.max(12, Math.min(180, Math.min(object.size[0], object.size[1]) * Math.max(metrics.pxPerUnit, 1)));
  const style = htmlObjectStyle(object, metrics, 'bestie-universal-icon-object', frame);

  return (
    <div key={object.id} className="bestie-universal-icon-object" style={style}>
      <Icon aria-hidden="true" icon={icon} width={size} height={size} />
    </div>
  );
};

const htmlDocument = (value: string) => {
  const trimmed = value.trim();
  const isFullDocument = /<!doctype\s+html|<html[\s>]/i.test(trimmed);
  if (isFullDocument) {
    return injectBestieProgressBridge(injectBestieBaseStyle(trimmed));
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${bestieHtmlBaseStyle}</style>
</head>
<body>
${value}
${bestieHtmlProgressBridge}
</body>
</html>`;
};

const bestieHtmlBaseStyle = `
    @import url('https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&display=swap');
    html, body {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      overflow: hidden !important;
      background: transparent !important;
      background-color: transparent !important;
      color: inherit;
    }
    html { color-scheme: dark; }
    *, *::before, *::after { box-sizing: border-box; }
    /* Default any LLM-generated HTML text to Newsreader; explicit per-element
       font-family in the generated markup still wins. */
    body { display: grid; place-items: center; font-family: 'Newsreader', Georgia, 'Times New Roman', serif; }
  `;

const injectBestieBaseStyle = (html: string) => {
  if (/BESTIE_HTML_BASE_STYLE/.test(html)) {
    return html;
  }
  const style = `<style data-bestie="BESTIE_HTML_BASE_STYLE">${bestieHtmlBaseStyle}</style>`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${style}`);
  }
  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${style}</head>`);
  }
  return `${style}${html}`;
};

const bestieHtmlProgressBridge = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>*,*::before,*::after{transition:none!important;animation:none!important}</style><script>
(() => {
  const reportError = (error) => {
    const message = error && error.message ? error.message : String(error || 'Unknown HTML scene error');
    window.parent.postMessage({ type: 'BESTIE_HTML_ERROR', message }, '*');
  };

  window.addEventListener('error', (event) => reportError(event.error || event.message));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'BESTIE_RENDER_FRAME') {
      return;
    }
    if (typeof window.renderBestieFrame !== 'function') {
      return;
    }

    try {
      const progress = Number.isFinite(Number(data.progress)) ? Number(data.progress) : 0;
      window.renderBestieFrame(Math.max(0, Math.min(1, progress)));
    } catch (error) {
      reportError(error);
    }
  });
})();
</script>`;

const injectBestieProgressBridge = (html: string) => {
  if (/BESTIE_RENDER_FRAME/.test(html)) {
    return html;
  }
  return bestieHtmlProgressBridge + html;
};
const htmlObjectStyle = (object: RenderObject, metrics: SceneStageMetrics, className: string, frame: SceneFrame): CSSProperties => {
  const left = `${((object.position[0] + frame.width / 2) / frame.width) * 100}%`;
  const top = `${((frame.height / 2 - object.position[1]) / frame.height) * 100}%`;
  const width = metrics.pxPerUnit ? object.size[0] * metrics.pxPerUnit : undefined;
  const height = metrics.pxPerUnit ? object.size[1] * metrics.pxPerUnit : undefined;
  const base: CSSProperties = {
    color: object.color,
    filter: `blur(${(1 - object.creationProgress) * 1.4}px)`,
    height: height ? `${Math.max(8, height)}px` : undefined,
    left,
    opacity: object.opacity,
    top,
    width: width ? `${Math.max(8, width)}px` : undefined,
    zIndex: object.z_index,
  };

  if (className === 'bestie-universal-icon-object') {
    base.height = height ? `${Math.max(16, height)}px` : undefined;
    base.width = width ? `${Math.max(16, width)}px` : undefined;
  }

  return base;
};

const iconAliases: Record<string, string> = {
  alert: 'fluent-emoji-flat:warning',
  bank: 'fluent-emoji-flat:bank',
  book: 'fluent-emoji-flat:books',
  brain: 'fluent-emoji-flat:brain',
  check: 'fluent-emoji-flat:check-mark-button',
  cloud: 'fluent-emoji-flat:cloud',
  danger: 'fluent-emoji-flat:warning',
  database: 'vscode-icons:file-type-sql',
  document: 'fluent-emoji-flat:page-facing-up',
  file: 'fluent-emoji-flat:page-facing-up',
  heart: 'fluent-emoji-flat:red-heart',
  idea: 'fluent-emoji-flat:light-bulb',
  image: 'fluent-emoji-flat:framed-picture',
  info: 'fluent-emoji-flat:information',
  input: 'solar:login-2-bold-duotone',
  lightbulb: 'fluent-emoji-flat:light-bulb',
  money: 'fluent-emoji-flat:money-bag',
  music: 'fluent-emoji-flat:musical-note',
  output: 'solar:logout-2-bold-duotone',
  pdf: 'vscode-icons:file-type-pdf2',
  play: 'fluent-emoji-flat:play-button',
  robot: 'fluent-emoji-flat:robot',
  server: 'vscode-icons:file-type-serverless',
  sparkles: 'fluent-emoji-flat:sparkles',
  star: 'fluent-emoji-flat:star',
  warning: 'fluent-emoji-flat:warning',
};

const iconName = (name: string) => {
  const trimmed = name.trim();
  if (/^[a-z0-9-]+:[a-z0-9-]+$/i.test(trimmed)) {
    return trimmed;
  }
  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return iconAliases[normalized] ?? `solar:${normalized || 'stars'}-bold-duotone`;
};
const Graph = ({ object, frame }: { object: RenderObject; frame: SceneFrame }) => {
  const [graphWidth, graphHeight] = object.size;
  const [xTicks, yTicks] = normalizeTicks(object.number_of_ticks);
  const xRange = graphRange(graphWidth, 10);
  const fallbackYRange = graphRange(graphHeight, 6);
  const left = object.position[0] - graphWidth / 2;
  const right = object.position[0] + graphWidth / 2;
  const bottom = object.position[1] - graphHeight / 2;
  const top = object.position[1] + graphHeight / 2;
  const lines = [];

  for (let index = 0; index <= xTicks; index += 1) {
    const x = left + (graphWidth * index) / xTicks;
    lines.push(<line key={`x-${index}`} x1={toSvgX(x, frame)} y1={toSvgY(bottom, frame)} x2={toSvgX(x, frame)} y2={toSvgY(top, frame)} />);
  }
  for (let index = 0; index <= yTicks; index += 1) {
    const y = bottom + (graphHeight * index) / yTicks;
    lines.push(<line key={`y-${index}`} x1={toSvgX(left, frame)} y1={toSvgY(y, frame)} x2={toSvgX(right, frame)} y2={toSvgY(y, frame)} />);
  }

  if (isSurfaceExpression(object.value)) {
    return <SurfaceGraph object={object} xRange={xRange} yRange={fallbackYRange} frame={frame} />;
  }

  const expression = graphExpression(object.value);
  const graphSamples = sampleGraphPoints(expression, xRange);
  const yRange = autoGraphYRange(graphSamples, fallbackYRange);
  const path = graphPathFromSamples(graphSamples, left, right, bottom, top, xRange, yRange, frame);
  const axisX = valueInRange(0, xRange) ? graphSceneX(0, left, right, xRange) : object.position[0];
  const axisY = valueInRange(0, yRange) ? graphSceneY(0, bottom, top, yRange) : null;
  const fillBaseline = clampNumber(graphSceneY(0, bottom, top, yRange), bottom, top);

  return (
    <g opacity={object.opacity}>
      {object.value === '' || object.value === undefined || object.value === null || object.coordinate !== false ? (
        <>
          <g stroke="#26375C" strokeWidth="0.08" opacity="0.36">
            {lines}
          </g>
          {axisY === null ? null : <line x1={toSvgX(left, frame)} y1={toSvgY(axisY, frame)} x2={toSvgX(right, frame)} y2={toSvgY(axisY, frame)} stroke="#A9B7D9" strokeWidth="0.22" opacity="0.42" />}
          <line x1={toSvgX(axisX, frame)} y1={toSvgY(bottom, frame)} x2={toSvgX(axisX, frame)} y2={toSvgY(top, frame)} stroke="#A9B7D9" strokeWidth="0.22" opacity="0.42" />
        </>
      ) : null}
      {object.style === 'fill_down' && path && <path d={`${path} L ${toSvgX(right, frame)} ${toSvgY(fillBaseline, frame)} L ${toSvgX(left, frame)} ${toSvgY(fillBaseline, frame)} Z`} fill={object.color || '#58C4DD'} opacity="0.14" />}
      {path && (
        <path
          d={path}
          fill="none"
          stroke={object.color || '#58C4DD'}
          strokeWidth={strokeWidth(object.thickness, 0.14)}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - object.creationProgress}
          filter="url(#bestie-strong-glow)"
        />
      )}
    </g>
  );
};

const SurfaceGraph = ({
  object,
  xRange,
  yRange,
  frame,
}: {
  object: RenderObject;
  xRange: [number, number];
  yRange: [number, number];
  frame: SceneFrame;
}) => {
  const expression = surfaceExpression(object.value);
  const [graphWidth, graphHeight] = object.size;
  const xSteps = Math.max(32, Math.min(56, Math.round((object.number_of_ticks?.[0] ?? 8) * 5.5)));
  const ySteps = Math.max(28, Math.min(48, Math.round((object.number_of_ticks?.[1] ?? 6) * 5.5)));
  const lineStrideX = Math.max(4, Math.round(xSteps / 10));
  const lineStrideY = Math.max(4, Math.round(ySteps / 9));
  const fillStride = 2;
  const zScale = Math.min(graphWidth, graphHeight) / 18;
  const rows: Array<Array<[number, number, number]>> = [];

  for (let yIndex = 0; yIndex <= ySteps; yIndex += 1) {
    const yValue = yRange[0] + ((yRange[1] - yRange[0]) * yIndex) / ySteps;
    const row: Array<[number, number, number]> = [];
    for (let xIndex = 0; xIndex <= xSteps; xIndex += 1) {
      const xValue = xRange[0] + ((xRange[1] - xRange[0]) * xIndex) / xSteps;
      const zValue = evaluateSurfaceExpression(expression, xValue, yValue);
      const safeZ = Number.isFinite(zValue) ? Math.max(-6, Math.min(6, zValue)) : 0;
      row.push([
        object.rawPosition[0] + (xValue / (xRange[1] - xRange[0])) * graphWidth,
        object.rawPosition[1] + (yValue / (yRange[1] - yRange[0])) * graphHeight,
        object.rawPosition[2] + safeZ * zScale,
      ]);
    }
    rows.push(row);
  }

  const rowPaths = rows
    .map((row, index) => ({
      depth: row.reduce((sum, point) => sum + point[2], 0) / row.length,
      key: `row-${index}`,
      path: smoothPath(row.map((point) => projectSurfacePoint(point, object, frame))),
      visible: index === 0 || index === ySteps || index % lineStrideY === 0,
    }))
    .filter((item) => item.visible);
  const columnPaths = Array.from({ length: xSteps + 1 }, (_, xIndex) => {
    const column = rows.map((row) => row[xIndex]);
    return {
      depth: column.reduce((sum, point) => sum + point[2], 0) / column.length,
      key: `column-${xIndex}`,
      path: smoothPath(column.map((point) => projectSurfacePoint(point, object, frame))),
      visible: xIndex === 0 || xIndex === xSteps || xIndex % lineStrideX === 0,
    };
  }).filter((item) => item.visible);
  const paths = [...rowPaths, ...columnPaths].sort((first, second) => first.depth - second.depth);

  return (
    <g opacity={object.opacity}>
      {rows.slice(0, -fillStride).map((row, yIndex) =>
        yIndex % fillStride === 0
          ? row.slice(0, -fillStride).map((point, xIndex) => {
              if (xIndex % fillStride !== 0) return null;
              const quad = [
                point,
                row[xIndex + fillStride],
                rows[yIndex + fillStride][xIndex + fillStride],
                rows[yIndex + fillStride][xIndex],
              ];
              return (
                <polygon
                  key={`surface-fill-${yIndex}-${xIndex}`}
                  points={quad.map((point) => projectSurfacePoint(point, object, frame)).map(([x, y]) => `${x},${y}`).join(' ')}
                  fill={object.color || '#58C4DD'}
                  opacity={0.24 * object.creationProgress}
                />
              );
            })
          : null
      )}
      {paths.map((item, index) => {
        const emphasis = index / Math.max(1, paths.length - 1);
        return (
          <path
            key={item.key}
            d={item.path}
            fill="none"
            stroke={object.color || '#58C4DD'}
            strokeWidth={surfaceStrokeWidth(object.thickness, 0.022 + emphasis * 0.012)}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.22 + emphasis * 0.32}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - object.creationProgress}
            filter="url(#bestie-soft-glow)"
          />
        );
      })}
      {object.style === 'fill_down' && rows.map((row, index) => {
        if (index % Math.max(4, lineStrideY) !== 0) return null;
        const down = row.map((point) => [point[0], point[1], object.rawPosition[2]] as [number, number, number]).reverse();
        return <polygon key={`down-${index}`} points={[...row, ...down].map((point) => projectSurfacePoint(point, object, frame)).map(([x, y]) => `${x},${y}`).join(' ')} fill={object.color || '#58C4DD'} opacity="0.08" />;
      })}
      {object.coordinate !== false && <SurfaceAxes object={object} xRange={xRange} yRange={yRange} zScale={zScale} frame={frame} />}
    </g>
  );
};

const SurfaceAxes = ({
  object,
  xRange,
  yRange,
  zScale,
  frame,
}: {
  object: RenderObject;
  xRange: [number, number];
  yRange: [number, number];
  zScale: number;
  frame: SceneFrame;
}) => {
  const [graphWidth, graphHeight] = object.size;
  const axes = [
    {
      key: 'x',
      color: '#A9B7D9',
      points: [
        [object.rawPosition[0] - graphWidth / 2, object.rawPosition[1], object.rawPosition[2]],
        [object.rawPosition[0] + graphWidth / 2, object.rawPosition[1], object.rawPosition[2]],
      ] as Array<[number, number, number]>,
    },
    {
      key: 'y',
      color: '#A9B7D9',
      points: [
        [object.rawPosition[0], object.rawPosition[1] - graphHeight / 2, object.rawPosition[2]],
        [object.rawPosition[0], object.rawPosition[1] + graphHeight / 2, object.rawPosition[2]],
      ] as Array<[number, number, number]>,
    },
    {
      key: 'z',
      color: '#F4D35E',
      points: [
        [object.rawPosition[0], object.rawPosition[1], object.rawPosition[2]],
        [object.rawPosition[0], object.rawPosition[1], object.rawPosition[2] + Math.min(xRange[1] - xRange[0], yRange[1] - yRange[0]) * zScale * 0.42],
      ] as Array<[number, number, number]>,
    },
  ];

  return (
    <g opacity="0.68">
      {axes.map((axis) => (
        <path
          key={axis.key}
          d={smoothPath(axis.points.map((point) => projectSurfacePoint(point, object, frame)))}
          fill="none"
          stroke={axis.color}
          strokeWidth="0.18"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - object.creationProgress}
        />
      ))}
    </g>
  );
};

const pointsPath = (object: RenderObject, frame: SceneFrame) => {
  if (!Array.isArray(object.value)) return '';
  const points = object.value.filter(isPoint);
  if (points.length < 2) return '';
  const svgPoints = points.map((point) => {
    const [x, y] = projectRelativePoint(object, point);
    return [toSvgX(x, frame), toSvgY(y, frame)] as const;
  });
  return smoothPath(svgPoints);
};

const normalizeTicks = (value: [number, number] | undefined): [number, number] => {
  if (!value) return [8, 6];
  return [Math.max(1, Math.round(value[0])), Math.max(1, Math.round(value[1]))];
};

type GraphSample = {
  xValue: number;
  yValue: number;
};

const graphExpression = (value: unknown) => String(value ?? '').replace(/^y\s*=\s*/i, '').trim();

const sampleGraphPoints = (expression: string, xRange: [number, number]): GraphSample[] => {
  if (!expression) return [];
  const points: GraphSample[] = [];
  const samples = 240;

  for (let index = 0; index <= samples; index += 1) {
    const xValue = xRange[0] + ((xRange[1] - xRange[0]) * index) / samples;
    const yValue = evaluateExpression(expression, xValue);
    if (Number.isFinite(yValue)) {
      points.push({ xValue, yValue });
    }
  }

  return points;
};

const graphPathFromSamples = (
  samples: GraphSample[],
  left: number,
  right: number,
  bottom: number,
  top: number,
  xRange: [number, number],
  yRange: [number, number],
  frame: SceneFrame
) => {
  if (samples.length < 2) return '';
  const points: string[] = [];
  const ySpan = Math.max(0.001, yRange[1] - yRange[0]);
  let previousY: number | null = null;

  for (const sample of samples) {
    if (!valueInRange(sample.yValue, yRange)) {
      previousY = null;
      continue;
    }

    const startsNewSegment = previousY === null || Math.abs(sample.yValue - previousY) > ySpan * 0.72;
    const x = graphSceneX(sample.xValue, left, right, xRange);
    const y = graphSceneY(sample.yValue, bottom, top, yRange);
    points.push(`${points.length === 0 || startsNewSegment ? 'M' : 'L'} ${toSvgX(x, frame)} ${toSvgY(y, frame)}`);
    previousY = sample.yValue;
  }
  return points.join(' ');
};

const autoGraphYRange = (samples: GraphSample[], fallbackRange: [number, number]): [number, number] => {
  const values = samples.map((sample) => sample.yValue).filter(Number.isFinite).sort((first, second) => first - second);
  if (values.length < 2) return fallbackRange;

  const lower = percentile(values, 0.02);
  const upper = percentile(values, 0.98);
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return fallbackRange;

  const span = upper - lower;
  if (span < 0.001) {
    const padding = Math.max(1, Math.abs(lower) * 0.15, (fallbackRange[1] - fallbackRange[0]) * 0.25);
    return [lower - padding, upper + padding];
  }

  const padding = Math.max(0.5, span * 0.12);
  return [lower - padding, upper + padding];
};

const percentile = (sortedValues: number[], ratio: number) => {
  if (sortedValues.length === 1) return sortedValues[0];
  const index = clampNumber(ratio, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const progress = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * progress;
};

const graphSceneX = (xValue: number, left: number, right: number, xRange: [number, number]) =>
  left + ((xValue - xRange[0]) / (xRange[1] - xRange[0])) * (right - left);

const graphSceneY = (yValue: number, bottom: number, top: number, yRange: [number, number]) =>
  bottom + ((yValue - yRange[0]) / (yRange[1] - yRange[0])) * (top - bottom);

const valueInRange = (value: number, range: [number, number]) =>
  value >= range[0] && value <= range[1];

const isSurfaceExpression = (value: unknown) => /^z\s*=/.test(String(value ?? '').trim().toLowerCase());
const surfaceExpression = (value: unknown) => String(value ?? '').replace(/^z\s*=\s*/i, '').trim();

const graphRange = (visualSize: number, baseRange: number): [number, number] => {
  const span = Math.max(2, Math.round((visualSize / 100) * baseRange));
  return [-span, span];
};

const strokeWidth = (thickness: number, multiplier: number) => Math.max(0.24, thickness * multiplier);
const surfaceStrokeWidth = (thickness: number, multiplier: number) => Math.max(0.06, Math.min(0.18, thickness * multiplier));

const evaluateExpression = (expression: string, x: number) => {
  const safe = expression
    .toLowerCase()
    .replace(/\^/g, '**')
    .replace(/\bexp\s*\(/g, 'Math.exp(')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\babs\b/g, 'Math.abs');
  if (!/^[0-9x+\-*/().\sMathPIEcosintaqrbe]+$/.test(safe)) return Number.NaN;
  try {
    return Function('x', `"use strict"; return (${safe});`)(x);
  } catch {
    return Number.NaN;
  }
};

const evaluateSurfaceExpression = (expression: string, x: number, y: number) => {
  const safe = expression
    .toLowerCase()
    .replace(/\^/g, '**')
    .replace(/\bexp\s*\(/g, 'Math.exp(')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\be\b/g, 'Math.E')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\babs\b/g, 'Math.abs');
  if (!/^[0-9xy+\-*/().\sMathPIEcosintaqrbe]+$/.test(safe)) return Number.NaN;
  try {
    return Function('x', 'y', `"use strict"; return (${safe});`)(x, y);
  } catch {
    return Number.NaN;
  }
};

const smoothPath = (points: readonly (readonly [number, number])[]) => {
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  }

  const commands = [`M ${points[0][0]} ${points[0][1]}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[Math.min(points.length - 1, index + 2)];
    const cp1 = [
      current[0] + (next[0] - previous[0]) / 6,
      current[1] + (next[1] - previous[1]) / 6,
    ];
    const cp2 = [
      next[0] - (afterNext[0] - current[0]) / 6,
      next[1] - (afterNext[1] - current[1]) / 6,
    ];
    commands.push(`C ${cp1[0]} ${cp1[1]} ${cp2[0]} ${cp2[1]} ${next[0]} ${next[1]}`);
  }
  return commands.join(' ');
};

const equationText = (object: RenderObject) => {
  if (typeof object.value === 'string') return object.value;
  if (object.value && typeof object.value === 'object' && 'text' in object.value) {
    return String(object.value.text);
  }
  return String(object.value ?? '');
};

const cnLabel = (object: RenderObject, shouldRenderMath: boolean) =>
  [
    'bestie-universal-label',
    object.element === 'text' && !shouldRenderMath ? 'bestie-universal-text-label' : '',
    shouldRenderMath ? 'bestie-universal-math-label' : '',
  ]
    .filter(Boolean)
    .join(' ');


const depthSort = (first: RenderObject, second: RenderObject) =>
  first.z_index - second.z_index || first.depth - second.depth;

const labelFontSize = (
  object: RenderObject,
  metrics: SceneStageMetrics,
  text: string,
  shouldRenderMath: boolean,
  maxWidth?: number
) => {
  const base = object.element === 'text' ? 2.85 : 3.0;
  const designedSize = clampNumber(object.size[1] * base, 15, 34);
  const minSize = 12;
  const maxSize = shouldRenderMath ? 76 : 82;
  let nextSize = clampNumber(designedSize * metrics.labelScale, minSize, maxSize);

  if (maxWidth) {
    const estimatedWidth = estimateLabelWidth(text, nextSize, shouldRenderMath);
    if (estimatedWidth > maxWidth) {
      nextSize = clampNumber(nextSize * (maxWidth / estimatedWidth), minSize, maxSize);
    }
  }

  return Math.round(nextSize * 100) / 100;
};

const labelMaxWidth = (object: RenderObject, metrics: SceneStageMetrics) => {
  if (!metrics.width || !metrics.pxPerUnit) return undefined;

  const stageLimit = metrics.width * 0.9;
  const desiredWidth = object.size[0] * metrics.pxPerUnit;
  const floorWidth = Math.min(stageLimit, 82 * metrics.labelScale);
  return Math.max(40, Math.min(stageLimit, Math.max(desiredWidth, floorWidth)));
};

const labelBoxStyle = (
  object: RenderObject,
  shouldRenderMath: boolean,
  maxWidth?: number
): CSSProperties => {
  const style: CSSProperties = {};

  if (maxWidth) {
    style.maxWidth = `${maxWidth}px`;
  }


  if (object.element === 'text' && !shouldRenderMath) {
    style.width = maxWidth ? `${maxWidth}px` : undefined;
    style.overflowWrap = 'break-word';
    style.whiteSpace = 'normal';
  }

  return style;
};

const estimateLabelWidth = (
  text: string,
  fontSize: number,
  shouldRenderMath: boolean
) => {

  if (shouldRenderMath) {
    const compactMath = text.replace(/\\[a-z]+/gi, 'x').replace(/[{}\s]/g, '');
    return Math.max(1, compactMath.length) * fontSize * 0.54;
  }

  const longestWord = text.split(/\s+/).reduce((longest, word) => Math.max(longest, word.length), 1);
  return longestWord * fontSize * 0.58;
};


const clampNumber = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const projectRelativePoint = (object: RenderObject, point: unknown): [number, number] => {
  if (!Array.isArray(point)) {
    return object.position;
  }
  const x = Number(point[0]) || 0;
  const y = Number(point[1]) || 0;
  const z = Number(point[2]) || 0;
  return [object.rawPosition[0] + x + (object.rawPosition[2] + z) * 0.18, object.rawPosition[1] + y + (object.rawPosition[2] + z) * 0.62];
};

const projectAbsolutePoint = (point: [number, number] | [number, number, number]): [number, number] => {
  const x = Number(point[0]) || 0;
  const y = Number(point[1]) || 0;
  const z = Number(point[2]) || 0;
  return [x + z * 0.18, y + z * 0.62];
};

const projectSurfacePoint = (point: [number, number, number], object: RenderObject, frame: SceneFrame) => {
  const depth = point[1] - object.rawPosition[1];
  const height = point[2] - object.rawPosition[2];
  const sceneX = point[0] + depth * 0.36;
  const sceneY = object.rawPosition[1] + height + depth * 0.18;
  return [toSvgX(sceneX, frame), toSvgY(sceneY, frame)] as const;
};

const isPoint = (point: unknown): point is [number, number] | [number, number, number] =>
  Array.isArray(point) && point.length >= 2;

const cameraSvgTransform = (snapshot: SceneSnapshot, frame: SceneFrame) => {
  const { position, zoom } = snapshot.camera;
  return `translate(${frame.width / 2} ${frame.height / 2}) scale(${zoom}) translate(${-frame.width / 2 - position[0]} ${-frame.height / 2 + position[1]})`;
};

const cameraCssTransform = (snapshot: SceneSnapshot, frame: SceneFrame) => {
  const { position, zoom } = snapshot.camera;
  return {
    transform: `translate(${(-position[0] / frame.width) * 100}%, ${(position[1] / frame.height) * 100}%) scale(${zoom})`,
  };
};

const cleanLatexText = (text: string) =>
  text
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\theta/g, '\\theta');

const escapeLatexTextMode = (text: string) =>
  text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[{}]/g, (match) => `\\${match}`)
    .replace(/[$&#_%]/g, (match) => `\\${match}`)
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');

const toSvgX = (x: number, frame: SceneFrame) => x + frame.width / 2;
const toSvgY = (y: number, frame: SceneFrame) => frame.height / 2 - y;
