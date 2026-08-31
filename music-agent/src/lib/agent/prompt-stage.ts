export type PromptStage = 'discovery' | 'lyric' | 'generation' | 'iteration';

const ITERATION_RE =
  /(加长|续写|再来一段|延长|翻唱|换(?:个)?风格|remix|替换|重写副歌|上次那首|那首歌|刚才那首|感觉不对|不好听|没戳中|失败了|进度|状态|变体|对比)/i;
const NEW_SONG_RE =
  /(新(?:写|建|来)(?:一)?首|再写一首|帮我写(?:一)?首歌|写(?:一)?首歌|换(?:个)?(?:主题|方向)|重新创作)/i;
const GENERATION_RE = /(生成吧|开始生成|确认生成|直接生成|制作吧|提交生成)/i;
const CONFIRM_RE =
  /(可以|确认|没问题|开始|就选|就它|就这个|都行|继续|来吧|走你|^好[了的]?$|^行$|^对$|^嗯+$|^ok!?$)/i;
const LYRIC_RE = /(先写词|只写词|写歌词|歌词怎么写|完整歌词|先别生成)/i;

function hasCompleteCreationSignal(text: string): boolean {
  const hasSubject = /(关于|写给|送给|主题是|讲|记录|纪念)/i.test(text);
  const hasDirection =
    /(民谣|流行|摇滚|说唱|古风|国风|爵士|电子|纯音乐|folk|pop|rock|rap|jazz|electronic|instrumental)/i.test(
      text,
    );
  return hasSubject && hasDirection;
}

export interface ResolvePromptStageInput {
  text: string;
  currentStage?: PromptStage | null;
  hasExistingSong?: boolean;
}

export function resolvePromptStage({
  text,
  currentStage = null,
  hasExistingSong = false,
}: ResolvePromptStageInput): PromptStage {
  const value = text.trim();
  if (!value) return currentStage ?? 'discovery';

  if (NEW_SONG_RE.test(value) && !ITERATION_RE.test(value)) {
    return hasCompleteCreationSignal(value) ? 'lyric' : 'discovery';
  }
  if (ITERATION_RE.test(value) && !NEW_SONG_RE.test(value)) return 'iteration';
  if (GENERATION_RE.test(value)) {
    if (currentStage === 'lyric' || currentStage === 'generation') return 'generation';
    if (hasCompleteCreationSignal(value)) return 'lyric';
    return hasExistingSong ? 'iteration' : currentStage ?? 'discovery';
  }
  if (LYRIC_RE.test(value) || hasCompleteCreationSignal(value)) return 'lyric';
  if (currentStage === 'iteration') return 'iteration';
  if (currentStage === 'generation' && hasExistingSong) return 'iteration';

  const isShortConfirm = value.length <= 30 && CONFIRM_RE.test(value);
  if (isShortConfirm && currentStage === 'lyric') return 'generation';
  if (isShortConfirm && currentStage === 'discovery') return 'lyric';

  if (currentStage) return currentStage;
  if (hasExistingSong && !NEW_SONG_RE.test(value)) return 'iteration';
  return 'discovery';
}
