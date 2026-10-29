export type UniversalAction =
  | { create: UniversalObject[] }
  | { transform: UniversalTransform[] }
  | { camera: UniversalCamera }
  | { vanish: { id: number | number[] | 'all' } };

export type ScenePoint = [number, number] | [number, number, number];

export type UniversalCamera = {
  position?: [number, number];
  zoom?: number;
};

export type UniversalObject = {
  id: number[];
  element: 'graph' | 'text' | 'equation' | 'html' | 'icon' | 'image' | 'polygon' | 'circle' | 'dot' | 'line' | 'arrow';
  value?: unknown;
  position?: ScenePoint;
  coordinate?: boolean;
  number?: number;
  alignment?: 'horizontal' | 'vertical' | 'diagonal_left_to_right' | 'diagonal_right_to_left' | 'cluttered';
  color?: string | string[];
  style?: 'filled' | 'hollow' | 'fill_surface' | 'fill_down';
  size?: [number, number] | [number, number, number];
  space_between_elements?: number;
  number_of_ticks?: [number, number] | number;
  z_index?: number;
  thickness?: number;
  opacity?: number;
};

export type UniversalTransform = Partial<Omit<UniversalObject, 'id'>> & {
  id: number | number[];
};


export type VisualScene = {
  scene_id: number;
  scene_title?: string;
  start_ms?: number;
  end_ms?: number;
  story: string;
  scene_description: string;
  status?: 'pending' | 'queued' | 'animating' | 'audio_generating' | 'ready' | 'failed' | string;
  mode?: LessonMode;
  aspect_ratio?: AspectRatio;
  camera?: UniversalCamera;
  animation: UniversalAction[];
  animator_json_fallback?: boolean;
  audio?: {
    audio_url?: string;
    storage_key?: string;
    mime_type?: string;
    provider?: string;
    voice?: string;
    duration_ms?: number;
  } | null;
};

export type LessonAudio = {
  audio_url?: string;
  storage_key: string;
  mime_type: 'audio/mp4' | string;
  codec: 'aac-lc' | string;
  bitrate_kbps: number;
  duration_ms: number;
  narration_duration_ms: number;
  outro_duration_ms: number;
};

export type LessonMode = 'learn' | 'visualize' | 'create_full_video';
export type AspectRatio = '16:9' | '9:16';

export type VisualLessonPayload = {
  schema_version: string;
  style: string;
  title?: string;
  mode?: LessonMode;
  aspect_ratio?: AspectRatio;
  visual_bible?: string;
  lesson_audio?: LessonAudio;
  scenes: VisualScene[];
};
