// 生成/迭代的共享业务逻辑：pi 工具与 API 路由共用。
// 职责：生成应用层 songId、落库歌曲行与任务行、解析迭代所需的 provider 原生音频 id。
import crypto from 'node:crypto';
import { desc, eq, like, or } from 'drizzle-orm';
import { getProvider } from '@/lib/providers';
import { db, schema } from '@/lib/db';
import { stripTranslationLines } from '@/lib/audio/lrc';
import { withLyricLanguageGuard } from '@/lib/audio/lyric-language';
import {
  transitionGenerationStatus,
  type GenerationJobStatus,
} from '@/lib/generation-state';
import { assertJapaneseTranslationComplete } from './generation-request';

export interface SubmitGenerationInput {
  title: string;
  lyrics: string;
  styleTags: string[];
  prompt?: string;
  instrumental?: boolean;
  referenceAudioUrl?: string;
  model?: string;
  duration?: number;
}

export async function submitGeneration(input: SubmitGenerationInput, chatId?: string) {
  // Shared pre-paid gate: every entry point must reject incomplete Japanese lyrics
  // before a provider or database operation can be attempted.
  assertJapaneseTranslationComplete(input.lyrics);

  const provider = getProvider();
  const songId = crypto.randomUUID();
  // 提交 Suno 前剥离翻译行（DB 保留完整歌词，翻译行用于 t.lrc 与 Folia 副字幕）
  const providerLyrics = stripTranslationLines(input.lyrics);
  // 语言守卫：日文歌词强制注入语言标签与演唱语言（sunoapi custom 模式 prompt 不生效，
  // 只能靠 styleTags；musicproxy 走 prompt，两边都注入）
  const { styleTags, prompt } = withLyricLanguageGuard(
    input.styleTags,
    input.prompt,
    providerLyrics,
  );
  const now = new Date();
  await db.insert(schema.songs).values({
    id: songId,
    chatId: chatId ?? null, // 会话归属：确认 gate 依赖此字段判断「本对话是否已有歌曲」
    title: input.title,
    lyrics: input.lyrics,
    styleTags: input.styleTags,
    prompt: input.prompt,
    instrumental: input.instrumental ?? false,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  });

  let jobId: string;
  try {
    ({ jobId } = await provider.generateMusic({
      title: input.title,
      lyrics: providerLyrics,
      styleTags,
      prompt,
      instrumental: input.instrumental ?? false,
      referenceAudioUrl: input.referenceAudioUrl,
      model: input.model,
      duration: input.duration,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(schema.songs)
      .set({
        status: transitionGenerationStatus('draft', 'failed'),
        progress: 100,
        stage: '提交失败',
        error: `生成提交失败：${message}`,
        updatedAt: new Date(),
      })
      .where(eq(schema.songs.id, songId));
    throw error;
  }

  const submitted = transitionGenerationStatus(
    'draft',
    'submitted',
  ) as GenerationJobStatus;
  const submittedAt = new Date();
  db.transaction((tx) => {
    tx.insert(schema.generationJobs)
      .values({
        id: jobId,
        songId,
        providerId: provider.id,
        status: submitted,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      })
      .run();
    tx.update(schema.songs)
      .set({ status: submitted, updatedAt: submittedAt })
      .where(eq(schema.songs.id, songId))
      .run();
  });

  return { jobId, songId };
}

/** 为迭代操作创建子歌曲行（版本树节点），挂在父歌下 */
export async function createIterationSong(
  parentSongId: string,
  patch: { title?: string; lyrics?: string; prompt?: string; styleTags?: string[] },
) {
  const parent = (
    await db.select().from(schema.songs).where(eq(schema.songs.id, parentSongId))
  )[0];
  if (!parent) throw new Error(`歌曲不存在: ${parentSongId}`);

  const songId = crypto.randomUUID();
  const now = new Date();
  await db.insert(schema.songs).values({
    id: songId,
    parentId: parentSongId,
    chatId: parent.chatId, // 继承会话归属
    title: patch.title ?? parent.title,
    lyrics: patch.lyrics ?? parent.lyrics,
    styleTags: patch.styleTags ?? parent.styleTags,
    prompt: patch.prompt ?? parent.prompt,
    instrumental: parent.instrumental,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  });
  return { songId, parent };
}

export async function recordJob(jobId: string, songId: string, providerId: string) {
  const now = new Date();
  await db.insert(schema.generationJobs).values({
    id: jobId,
    songId,
    providerId,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  });
}

/** 迭代提交 = 子歌曲行 + 任务行，事务保证不出现无任务可查的孤儿歌曲 */
export async function commitIteration(
  parentSongId: string,
  patch: { title?: string; lyrics?: string; prompt?: string; styleTags?: string[] },
  jobId: string,
  providerId: string,
) {
  const parent = (
    await db.select().from(schema.songs).where(eq(schema.songs.id, parentSongId))
  )[0];
  if (!parent) throw new Error(`歌曲不存在: ${parentSongId}`);

  const songId = crypto.randomUUID();
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(schema.songs)
      .values({
        id: songId,
        parentId: parentSongId,
        chatId: parent.chatId,
        title: patch.title ?? parent.title,
        lyrics: patch.lyrics ?? parent.lyrics,
        styleTags: patch.styleTags ?? parent.styleTags,
        prompt: patch.prompt ?? parent.prompt,
        instrumental: parent.instrumental,
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(schema.generationJobs)
      .values({
        id: jobId,
        songId,
        providerId,
        status: 'submitted',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  return { songId };
}

/** 迭代前置解析：歌曲行 + 首个变体（含 provider 原生 audioId）+ 原始任务 id */
export async function resolveSongForIteration(songId: string) {
  const song = (await db.select().from(schema.songs).where(eq(schema.songs.id, songId)))[0];
  if (!song) throw new Error(`歌曲不存在: ${songId}`);
  const variant = song.variants?.[0];
  if (!variant?.audioId) {
    throw new Error(`歌曲「${song.title}」还没有可迭代的音频（当前状态: ${song.status}）`);
  }
  const provider = getProvider();
  const job = (
    await db
      .select()
      .from(schema.generationJobs)
      .where(eq(schema.generationJobs.songId, songId))
      .orderBy(desc(schema.generationJobs.createdAt))
  )[0];
  return { song, variant, taskId: job?.id ?? null, providerId: job?.providerId ?? null, activeProviderId: provider.id };
}

/** Agent 视角的歌曲信息（inspect_song 工具用）：诊断失败、对比变体、决定下一步 */
export async function getSongForAgent(songId: string) {
  const song = (await db.select().from(schema.songs).where(eq(schema.songs.id, songId)))[0];
  if (!song) return null;
  // inspect 时同步任务状态：failed 任务的行可能还没被曲库页 sweep 同步（sweep 进程内只跑一次），
  // 会导致 Agent 看到 stale 的「processing」而无法启动自动修复（自动修复链路实测抓出）。
  if (song.status === 'submitted' || song.status === 'generating') {
    try {
      const job = (
        await db
          .select()
          .from(schema.generationJobs)
          .where(eq(schema.generationJobs.songId, song.id))
      )[0];
      if (job) {
        const memJob = await getProvider().getJob(job.id);
        if (memJob.status === 'failed') {
          const error = memJob.error ?? '生成失败';
          await db
            .update(schema.songs)
            .set({ status: 'failed', error, updatedAt: new Date() })
            .where(eq(schema.songs.id, song.id));
          song.status = 'failed';
          song.error = error;
        }
      }
    } catch {
      // 同步失败不影响 inspect 主流程
    }
  }
  return {
    id: song.id,
    title: song.title,
    status: song.status,
    error: song.error,
    lyrics: song.lyrics,
    styleTags: song.styleTags,
    variants: song.variants ?? [],
    parentId: song.parentId,
  };
}

/** 曲库搜索（search_my_songs 工具用）：按标题/风格描述模糊匹配 */
export async function searchSongs(query: string, limit = 10) {
  const pattern = `%${query.trim()}%`;
  return db
    .select({
      id: schema.songs.id,
      title: schema.songs.title,
      styleTags: schema.songs.styleTags,
      prompt: schema.songs.prompt,
      status: schema.songs.status,
    })
    .from(schema.songs)
    .where(or(like(schema.songs.title, pattern), like(schema.songs.prompt, pattern)))
    .orderBy(desc(schema.songs.createdAt))
    .limit(limit);
}
